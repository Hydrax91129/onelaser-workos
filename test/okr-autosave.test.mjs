import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

/* OKR fields save on their own (pause or leaving the box), unsaved text survives a reload,
 * and removing an item is immediate with undo instead of a confirm dialog. Fictional data only. */
const fields = readFileSync(new URL('../dist/okr-fields.js', import.meta.url), 'utf8');
const board = readFileSync(new URL('../dist/okr-board.js', import.meta.url), 'utf8');
const users = [{ id:'e1', display_name:'Amy Chen', role:'employee', department_id:'d1', manager_id:'m1' }];
const seed = () => ({
  objectives:[{ id:'p1', title:'Grow dealers', level:'personal', owner_id:'e1', department_id:'d1', org_id:'o', version:1, parent_objective_id:null, planning:{ period:'2026-10', weight:40 } }],
  krs:[{ id:'k1', objective_id:'p1', title:'Sign 30 dealers', baseline:0, target:30, direction:'increase', unit:'dealers', version:1, meta_version:1, department_id:'d1', planning:{ weight:50, targetText:'30 dealers' } }],
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tick = () => sleep(0);
const STORE_KEY = 'workos-okr-unsaved:v1:e1:2026-10';
// linkedom has no FormData; enough of one for these forms.
class FormDataShim {
  constructor(form) { this.entries = [...form.querySelectorAll('[name]')].map(el => [el.getAttribute('name'), el.tagName === 'SELECT' ? (el.querySelector('option[selected]') || el.querySelector('option'))?.getAttribute('value') ?? '' : (el.value ?? el.getAttribute('value') ?? '')]); }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
}
const plain = v => JSON.parse(JSON.stringify(v)); // objects built inside the vm have another realm's prototypes
function memoryStorage() { const m = new Map(); return { m, getItem:k => m.has(k) ? m.get(k) : null, setItem:(k, v) => m.set(k, String(v)), removeItem:k => m.delete(k), key:i => [...m.keys()][i] ?? null, get length() { return m.size; } }; }

function load({ storage = memoryStorage(), data = seed(), caps = {} } = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="overlay-root"></div><div id="toast"></div></body></html>');
  const state = { actor:users[0], capabilities:{ okrCollaboration:true, simpleOkrScores:true, okrPublish:true, okrAiDraft:true, ...caps }, directory:users, objectives:data.objectives, krs:data.krs, appraisals:{}, page:'okr' };
  const calls = [], net = { down:false };
  const context = { window, document, requestAnimationFrame:fn => fn(), setTimeout, clearTimeout, Intl, Date, console, CSS:{ escape:s => s }, FormData:FormDataShim, localStorage:storage };
  vm.runInNewContext(fields, context); vm.runInNewContext(board, context);
  const offline = () => Object.assign(new Error('offline'), { status:0, code:'NETWORK_ERROR' });
  const api = {
    get:async p => { calls.push(['GET', p]); return { items:[] }; },
    post:async (p, b) => { if (net.down) throw offline(); calls.push(['POST', p, b]); return { id:'new-' + calls.length }; },
    request:async (p, o) => {
      if (net.down) throw offline();
      calls.push([o.method, p, o.body]);
      const b = o.body || {};
      if (b.expectedVersion) return { version:b.expectedVersion + 1, ...(b.title ? { title:b.title } : {}) };
      return { meta_version:(b.expectedMetaVersion || 1) + 1 };
    },
  };
  const paint = () => { document.getElementById('app').innerHTML = window.WorkOSOkrBoard.render(); };
  window.WorkOSOkrBoard.configure({ api, state:() => state, lang:() => 'zh', rerender:paint, refreshOkr:async () => {}, toast:() => {}, explainError:e => e.message, overlay:() => {}, closeOverlay:() => {}, modal:() => {}, openAppraisal:() => {}, measurement:() => {}, openObjectiveSource:() => {} });
  const B = window.WorkOSOkrBoard; B._ui.cycle = '2026-10'; B._ui.tab = 'mine';
  const $ = sel => document.querySelector(sel);
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles:true }));
  const click = sel => { const el = $(sel); assert.ok(el, `missing ${sel}`); fire(el, 'click'); };
  const type = (sel, value) => { const el = $(sel); assert.ok(el, `missing ${sel}`); el.value = value; fire(el, 'input'); return el; };
  const status = () => $('[data-okr-save]')?.textContent || '';
  const stored = () => JSON.parse(storage.getItem(STORE_KEY) || 'null');
  return { B, window, document, calls, net, state, storage, paint, $, fire, click, type, status, stored };
}

test('an inline edit saves itself about 800 ms after typing stops, with a status line and no Enter', async () => {
  const t = load(); t.paint();
  t.click('[data-okr="edit"][data-kind="o-title"][data-id="p1"]');
  t.type('[data-okr-field="o-title:p1"]', 'Grow dealers in the west');
  assert.equal(t.calls.filter(c => c[0] === 'PATCH').length, 0, 'nothing sent while typing');
  assert.match(t.status(), /保存中…/);
  assert.equal(t.stored().fields['o-title:p1'], 'Grow dealers in the west', 'mirrored before the server has it');
  await sleep(950);
  assert.deepEqual(plain(t.calls.find(c => c[0] === 'PATCH')), ['PATCH', '/objectives/p1', { expectedVersion:1, title:'Grow dealers in the west' }]);
  assert.match(t.status(), /已保存/);
  assert.equal(t.stored(), null, 'mirror cleared once the server confirmed');
  // The next save of the same objective sends the version the server returned.
  t.paint(); t.click('[data-okr="edit"][data-kind="o-weight"][data-id="p1"]');
  t.type('[data-okr-field="o-weight:p1"]', '100');
  t.fire(t.$('#okr-edit'), 'submit'); await tick(); await tick();
  assert.deepEqual(plain(t.calls.filter(c => c[0] === 'PATCH').at(-1)), ['PATCH', '/objectives/p1', { expectedVersion:2, weight:100 }]);
  assert.match(t.$('#app').textContent, /Grow dealers in the west/, 'the saved text is shown');
});

test('a KR weight saves when the box loses focus, without waiting', async () => {
  const t = load(); t.paint();
  const w = t.type('[data-okr-field="kr-weight:k1"]', '100');
  t.fire(w, 'change'); await tick(); await tick();
  assert.deepEqual(plain(t.calls.find(c => c[0] === 'PATCH')), ['PATCH', '/key-results/k1', { expectedMetaVersion:1, weight:100 }]);
  assert.equal(t.calls.some(c => c[0] === 'GET' && c[1] === '/objectives'), false);
});

test('a failed save says so, keeps the text and retries by itself when the network returns', async () => {
  const t = load(); t.paint();
  t.net.down = true;
  t.click('[data-okr="edit"][data-kind="kr-title"][data-id="k1"]');
  t.type('[data-okr-field="kr-title:k1"]', 'Sign 40 dealers');
  t.fire(t.$('#okr-edit'), 'submit'); await tick(); await tick();
  assert.match(t.status(), /保存失败（点击重试）/);
  assert.match(t.status(), /网络恢复后会自动重试/);
  assert.equal(t.stored().fields['kr-title:k1'], 'Sign 40 dealers');
  t.net.down = false;
  t.window.dispatchEvent(new t.window.Event('online')); await tick(); await tick();
  assert.deepEqual(plain(t.calls.find(c => c[0] === 'PATCH')), ['PATCH', '/key-results/k1', { expectedMetaVersion:1, title:'Sign 40 dealers' }]);
  assert.match(t.status(), /已保存/);
  assert.equal(t.stored(), null);
});

test('after a reload, unsaved edits, a half-written objective and the AI text come back and are saved', async () => {
  const storage = memoryStorage();
  const a = load({ storage }); a.paint();
  a.click('[data-okr="edit"][data-kind="o-title"][data-id="p1"]');
  a.type('[data-okr-field="o-title:p1"]', 'Grow dealers in Texas');
  a.type('#okr-ai-text', 'Open ten dealer accounts this month');
  a.click('[data-okr="add-o"]');
  a.type('#okr-new-o [name="title"]', 'Train the new dealers');
  const before = a.stored();
  assert.equal(before.fields['o-title:p1'], 'Grow dealers in Texas');
  assert.equal(before.forms['new-o'].title, 'Train the new dealers');
  assert.equal(before.aiText, 'Open ten dealer accounts this month');
  a.B.reset(); // the tab crashes before anything reached the server

  const b = load({ storage }); b.paint();
  assert.match(b.status(), /已恢复未保存的内容/);
  assert.equal(b.$('#okr-ai-text').value, 'Open ten dealer accounts this month');
  assert.equal(b.$('#okr-new-o [name="title"]').value, 'Train the new dealers', 'the new objective form reopens with its text');
  assert.match(b.$('#app').textContent, /Grow dealers in Texas/, 'the restored title is shown');
  await tick(); await tick();
  assert.deepEqual(plain(b.calls.find(c => c[0] === 'PATCH')), ['PATCH', '/objectives/p1', { expectedVersion:1, title:'Grow dealers in Texas' }]);
  assert.equal(b.stored().fields['o-title:p1'], undefined, 'confirmed field leaves the mirror');
  assert.equal(b.stored().forms['new-o'].title, 'Train the new dealers', 'unsaved form stays until created');
  b.fire(b.$('#okr-new-o'), 'submit'); await tick(); await tick(); await tick();
  assert.equal(b.calls.find(c => c[0] === 'POST' && c[1] === '/objectives')[2].title, 'Train the new dealers');
  assert.equal(b.stored().forms['new-o'], undefined);
  b.click('[data-okr="restored-ok"]');
  assert.doesNotMatch(b.status(), /已恢复/);
});

test('broken browser storage never breaks the page', async () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); } };
  const t = load({ storage:bad }); t.paint();
  t.click('[data-okr="edit"][data-kind="o-title"][data-id="p1"]');
  t.type('[data-okr-field="o-title:p1"]', 'Grow dealers again');
  t.fire(t.$('#okr-edit'), 'submit'); await tick(); await tick();
  assert.ok(t.calls.some(c => c[0] === 'PATCH'), 'still saved to the server');
});

test('× removes at once with undo; the archive is sent only when the undo window ends', async () => {
  const t = load(); t.paint();
  t.click('[data-okr="remove-kr"][data-id="k1"]');
  assert.equal(t.$('[data-kr="k1"]'), null, 'hidden right away');
  assert.match(t.$('.okb-undo').textContent, /已删除 KR：.*Sign 30 dealers/);
  assert.equal(t.$('.okb-confirm'), null, 'no confirm dialog');
  t.click('[data-okr="undo-remove"][data-id="k1"]');
  assert.ok(t.$('[data-kr="k1"]'), 'undo brings it back');
  assert.equal(t.calls.some(c => /archive/.test(c[1])), false);
  t.click('[data-okr="remove-o"][data-id="p1"]');
  assert.equal(t.$('[data-objective="p1"]'), null);
  await t.B._saver.commitRemovals();
  assert.deepEqual(plain(t.calls.find(c => /archive/.test(c[1]))), ['POST', '/objectives/p1/archive', { expectedVersion:1 }]);
});

test('publishing first sends everything still waiting to be saved', async () => {
  const data = seed(); data.objectives[0].planning.weight = 100; data.krs[0].planning.weight = 100;
  const t = load({ data }); t.paint();
  t.click('[data-okr="edit"][data-kind="kr-title"][data-id="k1"]');
  t.type('[data-okr-field="kr-title:k1"]', 'Sign 35 dealers');
  t.click('[data-okr="publish"]');
  t.click('[data-okr="publish-confirm"]'); await sleep(20);
  const i = t.calls.findIndex(c => c[0] === 'PATCH'), j = t.calls.findIndex(c => c[1] === '/okr/publish');
  assert.ok(i >= 0 && j > i, 'save goes before publish');
});

test('restored text for an item that has not loaded yet is kept, then saved once the item appears', async () => {
  const storage = memoryStorage();
  storage.setItem(STORE_KEY, JSON.stringify({ fields:{ 'o-title:p1':'Grow dealers in Ohio' }, forms:{}, at:Date.now() }));
  const data = { objectives:[], krs:[] }, t = load({ storage, data }); t.paint(); await tick();
  assert.equal(t.calls.some(c => c[0] === 'PATCH'), false, 'nothing to save against yet');
  assert.equal(t.stored().fields['o-title:p1'], 'Grow dealers in Ohio', 'not thrown away');
  data.objectives.push(seed().objectives[0]); t.paint(); await tick(); await tick();
  assert.deepEqual(plain(t.calls.find(c => c[0] === 'PATCH')), ['PATCH', '/objectives/p1', { expectedVersion:1, title:'Grow dealers in Ohio' }]);
  assert.equal(t.stored(), null);
});
