import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const apiSource = await readFile(new URL('../dist/api-client.js', import.meta.url), 'utf8');
const liveSource = await readFile(new URL('../dist/live-app.js', import.meta.url), 'utf8');
const response = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(setImmediate); };

async function drawerFor(task, language = 'zh') {
  const listeners = new Map();
  const elements = new Map(['app', 'overlay-root', 'toast', 'live-ai-region'].map(id => [id, { innerHTML: '', textContent: '', classList: { add() {}, remove() {} } }]));
  const document = { documentElement: { dataset: { theme: 'light' } }, body: { style: {} }, title: '', activeElement: null, contains: () => false, querySelector: () => null, getElementById: id => elements.get(id), addEventListener: (type, handler) => listeners.set(type, handler) };
  const window = { WORKOS_CONFIG: { mode: 'live', apiBase: '/api' }, WorkI18n: { lang: language, set(v) { this.lang = v; } }, location: { origin: 'https://work.example' } };
  window.fetch = async url => {
    const path = new URL(url).pathname;
    if (path === '/api/capabilities') return response(200, { aiReviewMode: 'api', aiReview: 'configured', auth: { loginEnabled: true } });
    if (path === '/api/me') return response(200, { id: 'manager-1', display_name: 'KC', role: 'manager', department_id: 'company' });
    if (path === '/api/tasks') return response(200, { items: [task] });
    if (path === '/api/directory') return response(200, { items: [{ id: 'manager-1', display_name: 'KC', role: 'manager' }, { id: 'employee-1', display_name: 'Ethen Li', role: 'employee' }] });
    if (path === '/api/tasks/task-1') return response(200, { ...task });
    return response(200, { items: [] });
  };
  const context = { window, document, URL, AbortController, Date, Intl, Map, Set, console, requestAnimationFrame: fn => fn(), setTimeout: () => 0, clearTimeout: () => {} };
  vm.runInNewContext(apiSource, context); vm.runInNewContext(liveSource, context); await flush();
  listeners.get('click')({ target: { closest: () => ({ dataset: { liveTask: 'task-1' } }), matches: () => false } }); await flush();
  return elements.get('overlay-root').innerHTML;
}
const base = { id: 'task-1', title: 'XRF Gen2 下单', description: '100台', criteria: ['工厂确认'], owner_id: 'employee-1', reviewer_id: 'manager-1', status: 'submitted', version: 4, submission_version: 1, reviews: [] };
const shot = { id: 'att-1', name: '截图-20261103-171311.png', mime: 'image/png', size: 61000 };
const pdf = { id: 'att-2', name: 'PO.pdf', mime: 'application/pdf', size: 120000 };
const submission = (attachments, description = '已完成下单给PMC。\n\n附件：截图-20261103-171311.png') => [{ id: 'sub-1', version: 1, title: '已完成下单给PMC。', description, created_at: '2026-11-03T09:13:00Z', attachments }];

test('a deliverable shows its screenshot inline, opening full size, and other files as links', async () => {
  const html = await drawerFor({ ...base, submissions: submission([shot, pdf]) });
  assert.match(html, /class="artifact-thumb" data-live-action="att-view" data-src="\/api\/tasks\/task-1\/attachments\/att-1"/);
  assert.match(html, /<img src="\/api\/tasks\/task-1\/attachments\/att-1" alt="截图-20261103-171311.png"/);
  assert.match(html, /class="artifact-file" href="\/api\/tasks\/task-1\/attachments\/att-2"/);
  assert.doesNotMatch(html, /附件：截图/, 'the file-name line is replaced by the files themselves');
  assert.match(html, /已完成下单给PMC。/);
});

test('without matched files the text is left as written', async () => {
  const html = await drawerFor({ ...base, submissions: submission([]) });
  assert.match(html, /附件：截图-20261103-171311.png/);
  assert.doesNotMatch(html, /artifact-thumb/);
});

test('the reviewer picks a 0-10 score from a list instead of typing', async () => {
  const html = await drawerFor({ ...base, submissions: submission([shot]) });
  assert.match(html, /人工质量评分（0–10）/);
  const select = html.match(/<select name="quality">(.*?)<\/select>/)?.[1];
  assert.ok(select, 'score is a select');
  assert.deepEqual([...select.matchAll(/value="(\d*)"/g)].map(m => m[1]), ['', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0']);
  assert.doesNotMatch(html, /type="number" min="0" max="100"/);
});

test('an accepted review shows its score out of 10', async () => {
  const review = { id: 'r1', submission_version: 1, decision: 'accept', quality: 9, note: 'nice, thanks for follow up', reviewer_id: 'manager-1', created_at: '2026-11-03T10:52:00Z' };
  const html = await drawerFor({ ...base, status: 'accepted', submissions: submission([shot]), reviews: [review], currentReview: review });
  assert.match(html, /9\/10/); assert.doesNotMatch(html, /\/100/);
});

test('409 errors explain the actual reason instead of always saying the record changed', () => {
  const fn = liveSource.match(/function explainError\(error\) \{.*?\n/)[0];
  assert.match(fn, /error\?\.code === 'VERSION_CONFLICT'/);
  assert.match(fn, /error\?\.code === 'AI_ASSESSMENT_REQUIRED'.*Bot 还没有完成/);
  assert.match(fn, /error\?\.code === 'AI_EVIDENCE_INSUFFICIENT'/);
  assert.match(fn, /error\?\.status === 409\) return error\?\.message/);
});

test('a submission sends attachment ids rather than writing file names into the text', () => {
  assert.match(liveSource, /description:values\.description\.trim\(\),\.\.\.\(attachmentIds\.length \? \{attachmentIds\} : \{\}\)/);
  assert.doesNotMatch(liveSource, /tr\('附件：','Attachments: '\)\+names/);
});

test('saving a review shows a busy label and then a thank-you confirmation', () => {
  assert.match(liveSource, /event\.submitter\.textContent = tr\('提交中…','Saving…'\)/);
  assert.match(liveSource, /tr\('谢谢评分！已验收通过','Thanks for scoring! Accepted'\)/);
  assert.match(liveSource, /if \(reviewDone\) celebrate\(\.\.\.reviewDone\)/);
});
