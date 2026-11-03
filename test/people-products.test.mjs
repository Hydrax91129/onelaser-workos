import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const live = read('live-app.js');

function load(files, state) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="overlay-root"></div></body></html>');
  const context = { window, document, requestAnimationFrame:fn => fn(), Intl, Date, console, URL, Image:class {} };
  for (const f of files) vm.runInNewContext(read(f), context);
  const calls = [];
  const api = { get:async p => { calls.push(['GET', p]); return { items:[] }; }, post:async (p, b) => { calls.push(['POST', p, b]); return {}; }, delete:async p => { calls.push(['DELETE', p]); return {}; }, request:async (p, o) => { calls.push([o.method, p, o.body]); return {}; } };
  const ctx = { api, state:() => state, lang:() => 'zh', rerender:() => {}, toast:() => {}, explainError:e => e.message, openTask:() => {}, newTask:() => {}, refreshMe:async () => {}, apiBase:'/api', overlay:() => {}, closeOverlay:() => {}, modal:() => {} };
  window.WorkOSPeople?.configure(ctx); window.WorkOSProducts?.configure(ctx);
  return { window, document, calls };
}
const baseState = (actor, extra = {}) => ({ actor, capabilities:{ orgProfiles:true }, directory:[actor], tasks:[], objectives:[], krs:[], page:'overview', ...extra });

test('sidebar sections follow the requested order, and restricted pages are gated', () => {
  const block = live.match(/const navs = \[([\s\S]*?)\];/)[1];
  const order = [...block.matchAll(/\['([a-z-]+)','[a-z]+','([^']+)','[^']+','([a-z]+)'\]/g)].map(m => [m[1], m[2], m[3]]);
  const ids = s => order.filter(o => o[2] === s).map(o => o[0]);
  assert.deepEqual(ids('work'), ['overview', 'okr', 'projects', 'tasks'], 'workbench is the first page of the Workspace');
  assert.deepEqual(ids('reports'), ['okr-analysis', 'project-analysis', 'team']);
  assert.deepEqual(ids('product'), ['products', 'product-cost', 'supply-chain', 'erp-access'], 'product hub is its own section with its modules');
  assert.deepEqual(ids('labs'), ['support', 'knowledge', 'quality']);
  assert.deepEqual(ids('other'), ['settings', 'orgchart', 'hr', 'org', 'feedback', 'changelog']);
  assert.match(live, /hr:!!window\.WorkOSHr && state\.capabilities\?\.hr===true/, 'HR records appear only when the server offers them');
  assert.ok(ids('hidden').includes('executive') && ids('hidden').includes('integrations'), 'executive board removed; integrations moved into settings');
  assert.match(live, /const productAccess = \(\) => !!window\.WorkOSProducts && \(\(state\.actor\?\.grants\|\|\[\]\)\.includes\('products'\) \|\| state\.actor\?\.isAdmin === true\)/);
  assert.match(live, /products:productAccess\(\)\|\|wmsAccess\(\), 'product-cost':productAccess\(\), 'supply-chain':productAccess\(\)/);
  assert.match(live, /org:!!window\.WorkOSPeople && state\.actor\?\.isAdmin===true/);
  for (const id of ['product-cost', 'supply-chain']) assert.match(live, new RegExp(`'?${id}'?: \\(\\) => productAccess\\(\\) \\?`), `direct URL for ${id} is gated too`);
  assert.match(live, /productAccess\(\) && \['catalog'[\s\S]*wmsAccess\(\) && \['stock'[\s\S]*if \(!tabs\.length\) return noAccess/, 'merged products & stock page shows only the tabs the person may see');
  assert.match(live, /function integrationPage\(\) \{ return state\.actor\?\.isAdmin===true/, 'integrations page is admin-only');
});

test('without cost access only SKU and retail price are shown; with it the price system (tiers, wholesale, rules)', () => {
  const basic = load(['products.js'], baseState({ id:'u2', display_name:'Yong', grants:['products'] }));
  const html = basic.window.WorkOSProducts.render('cost');
  assert.match(html, /DEMO-HYD-60/); assert.match(html, /零售价[\s\S]*\$4,999\.00/);
  assert.doesNotMatch(html, /最低成本|分销价 |经销商售价|成本构成|工厂价|净利润|利润率|送达成本|批发|定价规则/);
  assert.doesNotMatch(basic.window.WorkOSProducts.render('catalog'), /工厂价 ¥/, 'catalog hides factory price without cost access');
  const full = load(['products.js'], baseState({ id:'u1', display_name:'KC', grants:['products', 'product_cost_detail'] }));
  const fhtml = full.window.WorkOSProducts.render('cost');
  const cat = full.window.WorkOSProducts.render('catalog');
  assert.match(cat, /零售价 MSRP/); assert.doesNotMatch(cat, /最低价|工厂价|经销|折扣|结账运费|DDP 单价|成本/, 'catalog shows no price other than MSRP, even for people with cost access');
  full.window.WorkOSProducts._ui.product = 'DEMO-HYD-60';
  assert.doesNotMatch(full.window.WorkOSProducts.render('catalog'), /最低售价|工厂价|结账运费|最终成本|DDP 单价|美国尾程/, 'product editor shows MSRP only');
  full.window.WorkOSProducts._ui.product = null;
  for (const t of ['送达成本', '真实售价', '零售价格档位', '日常调整', '小促', '大促', '清货', '批发价', '贡献利润', '公司定价规则', '到岸价估算']) assert.match(fhtml, new RegExp(t), t);
  full.window.WorkOSProducts._ui.costView = 'rules';
  const rules = full.window.WorkOSProducts.render('cost');
  for (const t of ['销售费率', '零售合计', '17%', '批发计价规则', '不可替代配件']) assert.match(rules, new RegExp(t), t);
});

test('price system applies the company pricing rules to one SKU', () => {
  const { window } = load(['products.js'], baseState({ id:'u1', display_name:'KC', grants:['products', 'product_cost_detail'] }));
  const D = window.WorkOSProducts._data, p = D.products.find(x => x.sku === 'DEMO-HYD-60');
  Object.assign(p, { landedUsd:2800, lastMileUsd:399, msrp:5999, actualPrice:4999, shipFee:0, priceClass:'standard' });
  const P = D.plan(p);
  assert.equal(P.delivered, 3199);
  assert.ok(Math.abs(P.suggested - 3199 / 0.53) < 1e-6, 'MSRP target = delivered ÷ (1 − 17% − 30%)');
  assert.ok(Math.abs(P.actualCm.usd - (4999 * 0.83 - 3199)) < 1e-6 && P.actualTier === 'major', '$4,999 is 19% CM, the major-promotion tier');
  const w = P.ws[0]; assert.equal(w.d, 25); assert.ok(Math.abs(w.price - 5999 * 0.75) < 1e-6);
  assert.ok(Math.abs(w.our - (5999 * 0.75 * 0.93 - 2800)) < 1e-6, 'wholesale CM = price × 93% − landed (dealer pays freight)');
  assert.equal(JSON.stringify(P.ws.map(x => x.d)), '[25,27,30,32,35]');
  // Shipping the customer pays separately offsets the last mile.
  p.shipFee = 399; assert.ok(Math.abs(D.plan(p).suggested - 2800 / 0.53) < 1e-6);
});

test('cost model follows the SKU sheet and the price ladder is consistent', () => {
  const { window } = load(['products.js'], baseState({ id:'u1', display_name:'KC', grants:['products', 'product_cost_detail'] }));
  const D = window.WorkOSProducts._data, p = D.products.find(x => x.sku === 'DEMO-COB-40'), c = D.cost(p, 'msrp');
  assert.equal(c.vol, 95 * 65 * 40 / 6000);
  assert.ok(Math.abs(c.productUsd - 7200 * 1.03 / 7) < 1e-9, 'factory RMB × export markup ÷ FX');
  assert.ok(Math.abs(c.total - (c.hard + c.opexTotal)) < 1e-9);
  assert.ok(Math.abs(c.profit - (p.msrp + p.shipFee - c.total)) < 1e-9);
  assert.ok(Math.abs(c.minCost - (c.productUsd + Math.min(c.ddp, c.hybrid))) < 1e-9, 'lowest cost uses the cheaper freight');
  assert.ok(Math.abs(c.opex.reduce((n, x) => n + x[2], 0) - c.opexTotal) < 1e-6 && Math.abs(c.opexTotal - p.msrp * 0.17) < 1e-6, 'operating cost follows the 17% retail selling rate');
});

test('team analysis empty state explains reporting lines; workbench lists items needing attention', () => {
  const actor = { id:'u1', display_name:'KC', isAdmin:true };
  const { window } = load(['people.js'], baseState(actor, { tasks:[
    { id:'a', title:'Overdue thing', owner_id:'u1', reviewer_id:'u2', status:'planned', due_at:'2020-01-01T00:00:00Z' },
    { id:'b', title:'Review me', owner_id:'u2', reviewer_id:'u1', status:'submitted', due_at:'2099-01-01T00:00:00Z' },
  ] }));
  window.WorkOSPeople._ui.team = { members:[], canViewAll:true, scope:'reports' };
  assert.match(window.WorkOSPeople.team(), /还没有人向你汇报/);
  const wb = window.WorkOSPeople.workbench();
  assert.match(wb, /待我验收[\s\S]*Review me/);
  assert.match(wb, /已逾期[\s\S]*Overdue thing/);
});

test('settings show contact fields; org page escapes names and offers grant toggles', () => {
  const actor = { id:'u1', display_name:'KC', title:'President', phone:'+1', isAdmin:true, grants:['products'] };
  const { window } = load(['people.js'], baseState(actor));
  const st = window.WorkOSPeople.settings();
  for (const n of ['title', 'phone', 'email', 'wechat', 'timezone']) assert.match(st, new RegExp(`name="${n}"`));
  assert.doesNotMatch(st, /name="location"/, 'work location is not self-editable'); assert.match(st, /由管理员设置/);
  window.WorkOSPeople._ui.org = { items:[{ id:'x', display_name:'<b>evil</b>', role:'employee', grants:[], active:true }, { ...actor, role:'manager', active:true, admin:true, adminSource:'deployment' }] };
  const org = window.WorkOSPeople.org();
  assert.doesNotMatch(org, /<b>evil<\/b>/);
  assert.match(org, /data-pp-grant="products"/);
  assert.match(org, /data-pp-grant="product_cost_detail" data-id="x"[^>]*disabled/, 'cost detail requires product access first');
});
