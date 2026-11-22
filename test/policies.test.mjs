import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

// 公司制度 (2026-11-21): the list shows what applies to me, the reader shows the text, versions and the sign-off box.
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 0));
function load({ level = 'read', myAck = 'todo' } = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="overlay-root"></div></body></html>');
  window.innerWidth = 1280;
  vm.runInNewContext(read('policies.js'), { window, document, console, setTimeout, clearTimeout, URL, Blob:class {}, navigator:{}, confirm:() => true, prompt:() => 'x' });
  const doc = { id:'d1', category:'handbook', titleZh:'示例员工手册', titleEn:'Sample handbook', region:'cn', departmentIds:[], requiresAck:true, public:false, owner:'示例 HR', ownerId:'u2',
    reviewMonths:12, nextReview:'2027-11-01', reviewDue:false, status:'published', currentVersionId:'v2', ackVersionId:'v2', version:2, effectiveDate:'2026-11-01', myAck,
    draft:null, canPublish:level === 'admin', ackStats:level === 'read' ? null : { done:3, total:5 } };
  const detail = { ...doc, current:{ id:'v2', no:2, state:'published', officialLang:'zh', effectiveDate:'2026-11-01', changeNote:'上班时间调整', bodyZh:'## 考勤\n- 9 点上班\n\n## 休假\n| 假别 | 天数 |\n| --- | --- |\n| 年假 | 5 |\n\n## 离职\n提前 30 天', bodyEn:'## Hours\nStart at 9.' },
    draft:null, history:[{ id:'v2', no:2, state:'published', effectiveDate:'2026-11-01', changeNote:'上班时间调整', author:'示例 HR' }, { id:'v1', no:1, state:'superseded', effectiveDate:'2026-01-01', changeNote:'首次发布', author:'示例 HR' }],
    files:[], appliesToMe:true, myAckAt:myAck === 'done' ? '2026-11-02T10:00:00Z' : null, canEdit:level !== 'read', canPublish:level === 'admin', canArchive:level === 'admin' };
  const posts = [];
  const api = { get:async p => p.startsWith('/policies/d1') ? detail : { level, docs:[doc], departments:[], people:[], counts:{ todo:myAck === 'todo' ? 1 : 0, pending:0, reviewDue:0 } },
    post:async (p, b) => { posts.push([p, b]); return { ok:true }; } };
  window.WorkOSPolicies.configure({ api, lang:() => 'zh', actor:() => ({ id:'u1' }), rerender:() => {}, toast:() => {}, modal:() => {}, closeOverlay:() => {} });
  const render = cat => { document.getElementById('app').innerHTML = window.WorkOSPolicies.render(cat); return document.getElementById('app'); };
  return { window, document, render, posts };
}

test('a reader sees the handbook with contents, a table, the official language and the sign-off box', async () => {
  const w = load(); w.render('handbook'); await tick(); w.render('handbook'); await tick(); await tick();
  const app = w.render('handbook');
  assert.match(app.querySelector('.pol-todo').textContent, /1 份文件待签收/);
  assert.ok(app.querySelector('.pol-toc'), 'three headings give a contents list');
  assert.ok(app.querySelector('.pol-body table'));
  assert.match(app.querySelector('.pol-langbar').textContent, /以中文版为准/);
  assert.ok(!app.querySelector('[data-pol="edit"]'), 'readers cannot edit');
  const sign = app.querySelector('[data-pol="ack"]');
  assert.ok(sign.hasAttribute('disabled'), 'sign needs the “I have read” tick first');
  sign.removeAttribute('disabled'); sign.dispatchEvent(new w.window.Event('click', { bubbles:true })); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(w.posts[0])), ['/policies/d1/ack', { versionId:'v2' }]);
});

test('editors see edit, sign-off and progress; signed readers see when they signed', async () => {
  const e = load({ level:'manage', myAck:'done' }); e.render('handbook'); await tick(); e.render('handbook'); await tick(); await tick();
  const app = e.render('handbook');
  assert.ok(app.querySelector('[data-pol="edit"]')); assert.ok(app.querySelector('[data-pol="acks"]'));
  assert.match(app.querySelector('.pol-card').textContent, /3\/5/);
  assert.match(app.querySelector('.pol-sign.done').textContent, /你已于/);
  assert.ok(!app.querySelector('[data-pol="archive"]'), 'only main admins archive');
});

test('the Markdown renderer escapes HTML', () => {
  const w = load();
  assert.doesNotMatch(w.window.WorkOSPolicies.markdown('<script>alert(1)</script>\n**b**').html, /<script>/);
});

test('policies pages are wired into the app shell, inbox, file preview and help', () => {
  const live = read('live-app.js'), index = read('index.html');
  for (const id of ['pol-handbook', 'pol-policy', 'pol-sop', 'pol-culture']) { assert.match(live, new RegExp(`'${id}'`)); assert.match(read('help-tips.js'), new RegExp(`'${id}'`)); }
  assert.match(index, /policies\.js[^"]*" defer/); assert.match(index, /policies\.css/);
  assert.match(read('inbox.js'), /policy_ack/); assert.match(live, /policiesAccess === true/); assert.match(read('file-preview.js'), /policies/);
});
