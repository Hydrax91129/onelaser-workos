import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const fields = readFileSync(new URL('../dist/okr-fields.js', import.meta.url), 'utf8');
const board = readFileSync(new URL('../dist/okr-board.js', import.meta.url), 'utf8');
const users = [{ id:'e1', display_name:'Amy Chen', role:'employee', department_id:'d1', manager_id:'m1' }];
const objectives = [
  { id:'c1', title:'Company revenue', level:'company', owner_id:null, department_id:null, org_id:'o', version:1, parent_objective_id:null, planning:{ period:'2026-10', weight:100 } },
  { id:'p1', title:'Grow dealers', level:'personal', owner_id:'e1', department_id:'d1', org_id:'o', version:1, parent_objective_id:null, planning:{ period:'2026-10', weight:40 } },
];
const draft = { pointsBudget:60, objectives:[{ title:'Launch the onboarding course', description:'', points:60, alignTo:'c1', keyResults:[{ title:'Lessons recorded', target:'5 lessons', weight:70 }, { title:'Course page live', target:'完成', weight:30 }] }] };

function load(caps = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="overlay-root"></div></body></html>');
  const state = { actor:users[0], capabilities:{ okrCollaboration:true, simpleOkrScores:true, okrPublish:true, okrAiDraft:true, ...caps }, directory:users, objectives, krs:[], appraisals:{}, page:'okr' };
  const calls = [];
  const context = { window, document, requestAnimationFrame:fn => fn(), Intl, Date, console, CSS:{ escape:s => s } };
  vm.runInNewContext(fields, context); vm.runInNewContext(board, context);
  const api = { get:async p => { calls.push(['GET', p]); return { items:[] }; }, post:async (p, b) => { calls.push(['POST', p, b]); return p === '/okr/ai-draft' ? draft : { id:'new-' + calls.length }; }, request:async (p, o) => { calls.push([o.method, p, o.body]); return {}; } };
  const paint = () => { document.getElementById('app').innerHTML = window.WorkOSOkrBoard.render(); };
  window.WorkOSOkrBoard.configure({ api, state:() => state, lang:() => 'zh', rerender:paint, refreshOkr:async () => {}, toast:() => {}, explainError:e => e.message, overlay:() => {}, closeOverlay:() => {}, modal:() => {}, openAppraisal:() => {}, measurement:() => {}, openObjectiveSource:() => {} });
  const B = window.WorkOSOkrBoard; B._ui.cycle = '2026-10'; B._ui.tab = 'mine';
  const click = sel => { const el = document.querySelector(sel); assert.ok(el, `missing ${sel}`); el.dispatchEvent(new window.Event('click', { bubbles:true })); };
  return { B, document, calls, paint, click };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('objective points are free: a red total line until they add up to 100, and no rescaling', async () => {
  const { paint, document } = load();
  paint();
  const line = document.querySelector('.okb-o-total');
  assert.ok(line, 'total line shown');
  assert.match(line.textContent, /目标分值合计 40 分，还差 60 分/);
  assert.match(line.textContent, /合计 100 分后才能最终发布/);
  assert.doesNotMatch(board, /rebalance:true/);
});

test('AI box drafts an OKR, nothing is saved until "add", then objectives and KRs are created as edited', async () => {
  const { paint, document, calls, click } = load();
  paint();
  assert.ok(document.querySelector('.okb-ai'), 'AI box shown on my unpublished OKR');
  document.getElementById('okr-ai-text').value = 'Record five onboarding lessons and publish the course page';
  click('[data-okr="ai-generate"]'); await tick(); await tick();
  const gen = calls.find(c => c[1] === '/okr/ai-draft');
  assert.equal(gen[2].period, '2026-10'); assert.equal(gen[2].company, false);
  assert.equal(calls.filter(c => c[1] === '/objectives').length, 0, 'nothing written yet');
  assert.match(document.querySelector('.okb-ai-draft').textContent, /对齐公司 O1/);
  // untick the second KR, then add
  const pick = document.querySelector('[data-okr-ai-pick="k:0:1"]'); pick.checked = false; pick.dispatchEvent(new (pick.ownerDocument.defaultView.Event)('change', { bubbles:true }));
  click('[data-okr="ai-add"]'); await tick(); await tick(); await tick();
  const o = calls.find(c => c[1] === '/objectives');
  assert.equal(o[2].title, 'Launch the onboarding course'); assert.equal(o[2].planning.weight, 60); assert.equal(o[2].parentObjectiveId, 'c1'); assert.equal(o[2].rebalance, undefined);
  const k = calls.filter(c => /\/key-results$/.test(c[1]));
  assert.equal(k.length, 1, 'unticked KR skipped');
  assert.equal(k[0][2].target, 5); assert.equal(k[0][2].planning.weight, 70); assert.equal(k[0][2].planning.targetText, '5 lessons');
});

test('the AI box is hidden when the backend has no model or the OKR is not mine', () => {
  const a = load({ okrAiDraft:false }); a.paint(); assert.equal(a.document.querySelector('.okb-ai'), null);
});
