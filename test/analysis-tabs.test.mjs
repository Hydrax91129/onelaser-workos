// The analysis pages are tabs of their parent pages: OKR 分析 after 对齐视图, 项目分析 after 我的任务, 任务分析 after 汇总.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const live = read('live-app.js');

test('the sidebar highlights the parent page while an analysis tab is open', () => {
  assert.match(live, /const analysisParent = \{ 'okr-analysis':'okr', 'project-analysis':'projects', team:'tasks' \}/);
  assert.match(live, /class="nav-item \$\{navActive\(id\) \? 'active' : ''\}"/);
  assert.match(live, /'okr-analysis': \(\) => window\.WorkOSOkrBoard \|\| !window\.WorkOSReports \? okrPage\(\)/);
  assert.match(live, /team: \(\) => window\.WorkOSTaskBoard && window\.WorkOSPeople \? taskPage\(\)/);
  assert.match(live, /window\.WorkOSProjects\?\.analysisTab \? window\.WorkOSProjects\.analysisTab\(\)/);
});

function okrBoard(page, analysis) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const state = { actor:{ id:'m1', display_name:'Manager', role:'manager' }, capabilities:{}, directory:[{ id:'m1', display_name:'Manager', role:'manager' }], objectives:[], krs:[], appraisals:{}, page };
  const location = { hash:'#' + page };
  const context = { window, document, location, requestAnimationFrame:fn => fn(), Intl, Date, console };
  context.globalThis = context;
  vm.runInNewContext(read('okr-fields.js'), context);
  vm.runInNewContext(read('okr-board.js'), context);
  const B = window.WorkOSOkrBoard;
  B.configure({ api:{ get:async () => ({ items:[] }) }, state:() => state, lang:() => 'zh', rerender:() => {}, refreshOkr:async () => {}, toast:() => {}, explainError:e => e.message, overlay:() => {}, closeOverlay:() => {}, modal:() => {}, hasAnalysis:() => true, analysis:() => page === 'okr-analysis' ? '<p id="okr-an">OKR analysis body</p>' : null });
  document.getElementById('app').innerHTML = B.render();
  return { window, document, location };
}

test('OKR page: OKR 分析 is the last tab and opens its own route', () => {
  const { document } = okrBoard('okr');
  const tabs = [...document.querySelectorAll('.okb-tabs [role=tab]')].map(b => b.textContent.trim());
  assert.deepEqual(tabs, ['我的 OKR', '团队 OKR', '对齐视图', 'OKR 分析']);
  assert.equal(document.querySelector('.okb-tabs [data-live-page="okr-analysis"]').classList.contains('active'), false);
  assert.equal(document.getElementById('okr-an'), null);
});

test('OKR analysis route: the analysis tab is active, shows the analysis, and the other tabs go back to #okr', async () => {
  const { window, document, location } = okrBoard('okr-analysis');
  assert.ok(document.querySelector('.okb-tabs [data-live-page="okr-analysis"]').classList.contains('active'));
  assert.ok(document.getElementById('okr-an'));
  assert.equal(document.querySelector('[data-okr-cycle]'), null, 'the cycle picker does not apply to the analysis');
  document.querySelector('[data-okr="tab"][data-value="team"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  await new Promise(r => setImmediate(r));
  assert.equal(location.hash, 'okr');
});

test('Projects: 项目分析 follows 我的任务 and renders under the same heading', () => {
  const { window, document } = parseHTML('<html><body></body></html>');
  const context = { window, document, requestAnimationFrame:f => f(), Intl, Date, console, URL };
  vm.runInNewContext(read('projects.js'), context);
  const state = { actor:{ id:'u1', display_name:'Synthetic' }, capabilities:{}, directory:[], tasks:[], objectives:[], krs:[], page:'project-analysis' };
  window.WorkOSProjects.configure({ api:{ get:async () => ({ items:[] }) }, state:() => state, lang:() => 'zh', rerender:() => {} });
  const { document:doc } = parseHTML(`<html><body>${window.WorkOSProjects.analysisTab()}</body></html>`);
  const tabs = [...doc.querySelectorAll('.pj-home-tabs button')];
  assert.deepEqual(tabs.map(b => b.textContent.replace(/\d+/g, '').trim()), ['全部项目', '我的任务', '项目分析']);
  assert.ok(tabs[2].classList.contains('active') && tabs[2].getAttribute('data-live-page') === 'project-analysis');
  assert.equal(doc.querySelectorAll('h1').length, 1, 'one page title: 项目管理');
  assert.match(doc.querySelector('h1').textContent, /项目管理/);
  assert.ok(doc.querySelector('.pj-an-embedded .pj-an-table'));
  // The normal projects page shows the same three tabs with 全部项目 active.
  state.page = 'projects';
  const { document:home } = parseHTML(`<html><body>${window.WorkOSProjects.render()}</body></html>`);
  assert.ok(home.querySelector('.pj-home-tabs [data-pj="go-home"]').classList.contains('active'));
  assert.ok(home.querySelector('.pj-home-tabs [data-live-page="project-analysis"]'));
});

function taskBoard(analysis) {
  const { document } = parseHTML('<html><body><main></main></body></html>');
  const window = {};
  vm.runInNewContext(read('task-board.js'), { window, document, URL, Date, Intl, structuredClone, setInterval:() => 0, setTimeout:() => 0 });
  const ui = window.WorkOSTaskBoard;
  ui.configure({ api:{ get:async () => ({ items:[] }) }, actor:{ id:'u1', role:'employee', display_name:'Synthetic' }, directory:[], language:'zh', toast:() => {}, hasAnalysis:() => true, analysis:() => analysis });
  return parseHTML(`<html><body>${ui.render()}</body></html>`).document;
}

test('My tasks: 任务分析 sits right after 汇总', () => {
  const doc = taskBoard(null);
  const tabs = [...doc.querySelectorAll('.mb-tabs [role=tab]')].map(b => b.textContent.trim());
  assert.deepEqual(tabs, ['主表格', '看板', '日历', '汇总', '任务分析']);
  assert.equal(doc.querySelector('.mb-tabs [data-live-page="team"]').classList.contains('active'), false);
});

test('Task analysis route: the tab is active, shows the analysis instead of the board', () => {
  const doc = taskBoard('<div id="team-an">Team analysis body</div>');
  assert.ok(doc.querySelector('.mb-tabs [data-live-page="team"]').classList.contains('active'));
  assert.equal(doc.querySelectorAll('.mb-tabs .mb-tab.active').length, 1);
  assert.ok(doc.querySelector('.mb-analysis #team-an'));
  assert.equal(doc.querySelector('.mb-scope-switch'), null);
  assert.equal(doc.querySelector('.mb-loading'), null);
});
