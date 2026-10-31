import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
function load(files, state, pre = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  Object.assign(window, pre);
  const context = { window, document, requestAnimationFrame:fn => fn(), Intl, Date, console, URL };
  for (const f of files) vm.runInNewContext(read(f), context);
  const calls = [];
  const api = { get:async p => { calls.push(['GET', p]); return { items:[] }; }, request:async (p, o) => { calls.push([o.method, p, o.body]); return { sentences:['AI one.', 'AI two.', 'AI three.'], generatedAt:'2026-10-31T10:00:00Z' }; } };
  const ctx = { api, state:() => state, lang:() => 'zh', rerender:() => {}, toast:() => {}, explainError:e => e.message, overlay:() => {}, closeOverlay:() => {}, modal:() => {}, refreshMe:async () => {} };
  for (const k of ['WorkOSInsights', 'WorkOSReports', 'WorkOSPeople', 'WorkOSProducts', 'WorkOSQuality', 'WorkOSProjects']) window[k]?.configure(ctx);
  return { window, calls };
}
const actor = { id:'u1', display_name:'KC', isAdmin:true, grants:['products', 'product_cost_detail'] };
const base = (extra = {}) => ({ actor, capabilities:{ orgProfiles:true }, directory:[actor, { id:'u2', display_name:'Amy', manager_id:'u1', title:'Sales', location:'Irvine' }], tasks:[], objectives:[], krs:[], page:'overview', ...extra });

test('workbench home greets, shows what is undone and a 3–4 sentence analysis', () => {
  const { window } = load(['reports.js'], base({ tasks:[
    { id:'a', title:'Late report', owner_id:'u1', reviewer_id:'u2', status:'planned', due_at:'2020-01-01T00:00:00Z' },
    { id:'b', title:'Check this', owner_id:'u2', reviewer_id:'u1', status:'submitted', due_at:'2099-01-01T00:00:00Z' },
  ] }));
  const html = window.WorkOSReports.home();
  assert.match(html, /KC/); assert.match(html, /还没做完的事/); assert.match(html, /Late report/); assert.match(html, /Check this/);
  const items = html.match(/<ol class="ri-list">([\s\S]*?)<\/ol>/)[1].match(/<li>/g);
  assert.ok(items.length >= 3 && items.length <= 4, 'analysis has 3–4 sentences');
  assert.match(html, /自动分析/, 'labeled rule-based when AI is not configured');
});

test('AI insights use aggregated facts only and replace the rule-based text when available', async () => {
  const st = base({ capabilities:{ orgProfiles:true, aiInsights:true } });
  const { window, calls } = load(['reports.js'], st);
  window.WorkOSReports.home();
  const call = calls.find(c => c[1] === '/insights');
  assert.ok(call, 'POST /insights is called');
  assert.equal(call[2].board, 'home');
  assert.ok(Object.values(call[2].facts).every(v => v === null || ['number', 'string'].includes(typeof v) || Array.isArray(v)), 'facts are plain aggregates');
  await new Promise(r => setTimeout(r, 0));
  assert.match(window.WorkOSReports.home(), /AI 分析[\s\S]*AI one\./);
});

test('OKR analysis compares my and team completion with time elapsed', () => {
  const { window } = load(['reports.js'], base({ objectives:[{ id:'o1', title:'Grow sales', owner_id:'u2', level:'personal' }, { id:'o2', title:'Mine', owner_id:'u1', level:'personal' }] }));
  const html = window.WorkOSReports.okr();
  assert.match(html, /我的 OKR 完成度/); assert.match(html, /团队 OKR 完成度/); assert.match(html, /目标周期进度/); assert.match(html, /Amy/);
});

test('supply chain uses injected inventory: aged stock is purple, factory stock is transferred before a new PO', () => {
  const INV = { source:'test', items:[
    { sku:'A', name:'Slow machine', type:'Hydra 整机', factory:'东莞工厂', unitUsd:5000, wh:10, dg:0, jn:0, transit:0, transitEta:[], velocity:0.01, out90:1, oldestAge:300, avgAge:250, aged90:10, repair:0 },
    { sku:'B', name:'Fast machine', type:'X 整机', factory:'东莞工厂', unitUsd:2000, wh:3, dg:30, jn:0, transit:0, transitEta:[], velocity:1, out90:90, oldestAge:20, avgAge:10, aged90:0, repair:0 },
  ], monthly:{ '2026-09':{ 'X 整机':30 } } };
  const { window } = load(['reports.js', 'products.js'], base(), { WORKOS_INVENTORY_DATA:INV });
  const html = window.WorkOSProducts.render('supply');
  assert.match(html, /库存超期/); assert.match(html, /清库存策略[\s\S]*Slow machine/);
  assert.match(html, /补货策略[\s\S]*Fast machine[\s\S]*先从工厂仓调/);
  assert.match(html, /超 90 天库存占比/);
  assert.match(html, /ri-list/, 'AI/auto analysis card on the supply board');
});

test('quality tracking: factory submits a plan, we approve, then verify and close', () => {
  const { window } = load(['reports.js', 'quality.js'], base());
  const Q = window.WorkOSQuality, html = Q.render();
  assert.match(html, /产品质量追踪/); assert.match(html, /按问题分类/); assert.match(html, /ri-list/);
  const i = Q._data.issues.find(x => x.status === 'review');
  assert.ok(i.plan.due && i.plan.root);
  for (const code of Q._data.issues.map(x => x.code)) { const [c, n] = code.split('-'); assert.ok(Q._data.CATS[c][3][n], `code ${code} is in the taxonomy`); }
});

test('org chart shows name, title and location for everyone', () => {
  const { window } = load(['people.js'], base());
  window.WorkOSPeople._ui.chart = { items:[{ id:'u1', display_name:'KC', title:'President', location:'Irvine, CA' }, { id:'u2', display_name:'Amy', title:'Sales', location:'Irvine, CA', manager_id:'u1' }, { id:'u3', display_name:'<i>x</i>', title:'QA', location:'东莞', manager_id:'u1' }] };
  const html = window.WorkOSPeople.chart();
  assert.match(html, /President[\s\S]*Irvine, CA/); assert.match(html, /东莞/); assert.doesNotMatch(html, /<i>x<\/i>/);
});
