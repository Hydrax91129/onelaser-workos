import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

// Fictional people only.
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
function loadPeople(state, responses = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const frames = [];
  const context = { window, document, requestAnimationFrame:fn => frames.push(fn), Intl, Date, console, URL, Image:class {} };
  vm.runInNewContext(read('people.js'), context);
  const calls = [];
  const answer = (m, p, b) => { calls.push([m, p, b]); const r = responses[m + ' ' + p]; return typeof r === 'function' ? r(b) : r ?? { items:[] }; };
  const api = { get:async p => answer('GET', p), delete:async p => answer('DELETE', p), request:async (p, o) => answer(o.method, p, o.body) };
  window.WorkOSPeople.configure({ api, state:() => state, lang:() => 'zh', rerender:() => {}, toast:() => {}, explainError:e => e.message, refreshMe:async () => {}, reloadDirectory:async () => {}, apiBase:'/api' });
  return { window, document, calls, frames };
}
const admin = { id:'kc', display_name:'KC', isAdmin:true, department_id:'d1' };
const state = (extra = {}) => ({ actor:admin, capabilities:{ orgProfiles:true, memberInvites:true, memberDisable:true }, directory:[admin], page:'org', ...extra });
const people = [
  { id:'kc', display_name:'KC', role:'manager', active:true, executive:true, admin:true, adminSource:'deployment', grants:[], location:'Irvine, CA' },
  { id:'us', display_name:'Sam', role:'manager', active:true, manager_id:'kc', grants:[], location:'Irvine, CA' },
  { id:'cn', display_name:'Wei', role:'manager', active:true, manager_id:'kc', grants:[], location:'武汉' },
  { id:'e1', display_name:'Lin', role:'employee', active:true, manager_id:'us', second_manager_id:'cn', grants:[], location:'武汉' },
];

test('member list: second leader column with the hint, excluding the person and their first leader; a change saves secondManagerId', async () => {
  const { window, document, calls } = loadPeople(state(), { 'PATCH /org/members/e1':{ id:'e1', manager_id:'us', second_manager_id:null } });
  window.WorkOSPeople._ui.org = { items:people };
  const html = window.WorkOSPeople.org();
  assert.match(html, /第二领导（虚线汇报）/);
  assert.match(html, /第一领导不方便时，由第二领导日常查看和指导；审批和评分仍由第一领导负责/);
  document.body.innerHTML = html;
  const sel = document.querySelector('[data-pp-field="secondManagerId"][data-id="e1"]');
  assert.ok(sel, 'the select exists');
  const values = [...sel.querySelectorAll('option')].map(o => o.getAttribute('value'));
  assert.ok(values.includes('') && values.includes('cn') && values.includes('kc'));
  assert.ok(!values.includes('e1'), 'not the person');
  assert.ok(!values.includes('us'), 'not the first leader');
  assert.equal(sel.querySelector('option[selected]').getAttribute('value'), 'cn');
  Object.defineProperty(sel, 'value', { value:'' }); sel.dispatchEvent(new window.Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(c => c[0] === 'PATCH'))), ['PATCH', '/org/members/e1', { secondManagerId:null }]);
});

test('org chart: legend, second-leader note on the card, and a dashed SVG curve between the two cards', () => {
  const st = state({ page:'orgchart' });
  const { window, document, frames } = loadPeople(st);
  window.WorkOSPeople._ui.chart = { items:people };
  const html = window.WorkOSPeople.chart();
  assert.match(html, /实线 = 第一领导/); assert.match(html, /虚线 = 第二领导/);
  assert.match(html, /<svg class="pp-oc-dotted"/);
  assert.match(html, /第二领导：Wei/, 'the employee card names the second leader');
  assert.match(html, /title="第一领导：Sam；第二领导：Wei"/, 'hover shows both leaders');
  document.body.innerHTML = html;
  // Lay the cards out: Wei top-right, Lin bottom-left.
  const box = document.querySelector('.pp-orgchart');
  const pos = { kc:[300, 0], us:[100, 120], cn:[500, 120], e1:[100, 240] };
  box.getBoundingClientRect = () => ({ left:0, top:0, width:800, height:400 });
  Object.assign(box, { scrollLeft:0, scrollTop:0, scrollWidth:800, scrollHeight:400 });
  for (const el of document.querySelectorAll('[data-oc-id]')) { const [x, y] = pos[el.getAttribute('data-oc-id')]; el.getBoundingClientRect = () => ({ left:x, top:y, width:180, height:80 }); }
  assert.ok(frames.length, 'drawing is scheduled after render');
  frames.forEach(f => f());
  const paths = document.querySelectorAll('svg.pp-oc-dotted path');
  assert.equal(paths.length, 1);
  const d = paths[0].getAttribute('d');
  assert.match(d, /^M500,160 C/, 'starts at the left edge of the second leader card (the employee is to the left)');
  assert.match(d, / 280,280$/, 'ends at the right edge of the employee card (it is to the left)');
  assert.match(read('people.css'), /svg\.pp-oc-dotted path\{[^}]*stroke-dasharray/, 'the curve is dashed');
});

test('org chart: when the employee is collapsed there is no curve, and the second leader card lists the hidden dotted-line report', () => {
  const { window, document, frames } = loadPeople(state({ page:'orgchart' }));
  window.WorkOSPeople._ui.chart = { items:people };
  window.WorkOSPeople._ui.chartCollapsed.add('us');
  const html = window.WorkOSPeople.chart();
  assert.match(html, /虚线下属（已收起）：Lin/);
  document.body.innerHTML = html;
  frames.forEach(f => f());
  assert.equal(document.querySelectorAll('svg.pp-oc-dotted path').length, 0);
});

test('dotted path helper joins facing edges, and bulges to the side when the cards are stacked', () => {
  const { window } = loadPeople(state());
  const { path, links } = window.WorkOSPeople._dotted;
  assert.deepEqual(JSON.parse(JSON.stringify(links(people))), [['cn', 'e1']]);
  assert.deepEqual(JSON.parse(JSON.stringify(links([{ id:'a', second_manager_id:'gone' }]))), [], 'ignores leaders not on the chart');
  assert.equal(path({ x:0, y:300, w:100, h:50 }, { x:400, y:0, w:100, h:50 }), 'M100,325 C220,325 280,25 400,25');
  assert.equal(path({ x:0, y:0, w:100, h:50 }, { x:10, y:200, w:100, h:50 }), 'M80,50 C80,137.5 170,225 110,225');
});

test('task analysis lists dotted-line reports in their own section', () => {
  const st = state({ page:'team' });
  const { window } = loadPeople(st);
  const stats = { total:2, open:1, accepted:1, waiting:0, revision:0, overdue:0, dueSoon:0, completionRate:50, onTimeRate:null, onTimeKnown:0, onTimeUnknown:1, avgQuality:null };
  window.WorkOSPeople._ui.team = { scope:'reports', canViewAll:false, members:[], dottedMembers:[{ id:'e1', display_name:'Lin', manager_id:'us', line:'second', depth:1, stats, attention:[] }], totals:null };
  const html = window.WorkOSPeople.team();
  assert.match(html, /虚线汇报给我（第二领导，只读）/);
  assert.match(html, /data-pp="view-tasks" data-id="e1"/);
  assert.doesNotMatch(html, /还没有人向你汇报/);
});
