import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

// Fictional products, settings and numbers only.
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const j = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(r => setTimeout(r, 0));
const fam = [['main', '主机'], ['acc', '配件/备件'], ['cons', '耗材'], ['soft', '软件/服务'], ['mat', '内部物料']].map(([key, zh]) => ({ key, zh, en:key }));
const F = (key, zh, group, code, vis, type, extra = {}) => ({ key, zh, en:key, ph:'', code, vis, type, group, unit:null, opts:null, writable:true, ...extra });
const FIELDS = [F('sku', 'SKU', '1', 'rrrrr', 'all', 'sku', { writable:false }), F('goodsType', '大货 / 退货', '1', 'rrrrr', 'all', 'enum', { opts:[{ key:'bulk', zh:'大货', en:'New' }, { key:'refb', zh:'退货', en:'Returned' }] }),
  F('family', '产品族', '1', 'rrrrr', 'all', 'enum', { opts:fam }), F('nameZh', '中文名', '1', 'rrrrr', 'all', 'text'), F('series', '产品线 / 系列', '1', 'rooon', 'all', 'list', { opts:[{ key:'XRF', zh:'XRF', en:'XRF' }] }),
  F('status', '状态', '2', 'rrrro', 'all', 'enum', { opts:[{ key:'dev', zh:'开发中', en:'dev' }, { key:'launch', zh:'上新中', en:'launch' }, { key:'clearance', zh:'清库存', en:'clearance' }] }),
  F('netWeight', '净重', '6', 'roono', 'all', 'number', { unit:'kg' }), F('msrp', '零售价 MSRP', '4', 'roooo', 'all', 'price'), F('map', '最低公开售价 MAP', '4', 'ooooo', 'all', 'price'), F('promoFloor', '官网促销底价', '4', 'ooooo', 'all', 'price'),
  F('whFreight', '批发运费承担方', '5', 'oooon', 'all', 'enum', { opts:[{ key:'dealer', zh:'经销商付运费', en:'d' }, { key:'us', zh:'我们付运费', en:'u' }] }), F('whOv0', '批发价手动调整 · 示例档', '5', 'oooon', 'all', 'price')];
const SENS = [F('landed', '到岸价', '4', 'roooo', 'sens', 'price'), F('lastMile', '尾程运费 / 台', '4', 'roooo', 'sens', 'price'), F('dtcRate', '零售销售费率', '4', 'ooooo', 'sens', 'number', { unit:'%' }), F('whRate', '批发销售费率', '5', 'ooooo', 'sens', 'number', { unit:'%' }), F('supplier', '主供应商', '7', 'roooo', 'sens', 'text')];
const groups = [['1', '产品基本参数', '1'], ['2', '生命周期', '2'], ['3', '产品详情', '6'], ['4', '定价', '3'], ['5', '定价（批发）', '3'], ['6', '包装与物流', '4'], ['7', '采购与供应商', '5'], ['8', '售后与库存控制', '7']].map(([no, zh, disp]) => ({ no, zh, en:zh, disp }));
const visNames = { all:['全员', 'Everyone'], ops:['产品与供应链', 'Ops'], cost:['仅成本权限', 'Cost'], admin:['仅管理员', 'Admin'], sens:['敏感 · 仅编辑者', 'Sensitive'] };
function library(sens, admin = false) {
  const fields = sens ? [...FIELDS, ...SENS] : FIELDS;
  const pricing = sens ? { landed:1000, delivered:1100, dtcRate:0.15, whRate:0.05, freight:'dealer', retail:[{ name:'示例标价', cmTarget:20, use:'', theory:1692.3, list:1699, offMsrp:0.15, cm:344.15, cmPct:0.2026 }],
    fixed:[{ key:'msrp', price:2000, cm:600, cmPct:0.3, belowFloor:false }, { key:'map', price:2000, cm:600, cmPct:0.3, belowFloor:false }, { key:'promoFloor', price:1200, cm:-80, cmPct:-0.067, belowFloor:true }],
    npcr:[{ cm:20, theory:1692.3, list:1699, sellingCost:254.85, gross:599, contribution:344.15, whDealerFreight:1333.3, whOurFreight:1466.7, marketplace:2000 }],
    wholesale:[{ name:'示例档', discount:20, floor:false, override:false, price:1600, dealerMargin:400, dealerMarginPct:0.2, cmDealerFreight:520, cmDealerFreightPct:0.325, cmOurFreight:420, cmOurFreightPct:0.2625, cm:520, cmPct:0.325 }] }
    : { msrp:2000, map:2000, promoFloor:1200, freight:'dealer', wholesale:[{ name:'示例档', discount:20, price:1600, override:false }] };
  return { spec:{ families:fam, statuses:[], groups, visNames, clearMarker:'[清空]', fields, slots:sens ? [{ key:'manual', zh:'说明书', en:'Manual', code:'roooo', hint:'PDF', mode:'any', vis:'sens', writable:true }, { key:'spareParts', zh:'常用备件清单', en:'Spare parts', code:'roooo', hint:'仅 PDF', mode:'pdf', vis:'sens', writable:true }] : [] },
    viewer:{ levels:sens ? ['all', 'ops', 'cost', 'sens', ...(admin ? ['admin'] : [])] : ['all'], editCatalog:sens, editCost:sens, editPrices:sens, admin, canImport:admin, canEditSettings:admin },
    settings:sens ? { dtcItems:[], whItems:[], mktExtra:null, retailTiers:[], whTiers:[], npcr:[], dtcTarget:'', dtcFloor:10, whTarget:'', whFloor:10, dtcRateOverride:13, whRateOverride:null, configured:false } : { whTiers:[{ name:'示例档', discount:20 }], configured:true },
    items:[{ sku:'ODL-DEMO-1', values:{ sku:'ODL-DEMO-1', goodsType:'bulk', family:'main', nameZh:'示例主机', series:null, status:'dev', netWeight:null, msrp:2000, map:null, promoFloor:1200, whFreight:null, whOv0:null, ...(sens ? { landed:1000, lastMile:100, supplier:'示例工厂' } : {}) },
      completeness:{ need:5, got:3, missing:['series', 'netWeight'], done:false }, pricing, mainImage:null, ...(sens ? { files:{ manual:[{ id:'f1', name:'manual.pdf', size:2048, at:'2026-11-04' }] } } : {}) },
      { sku:'ODL-DEMO-2', values:{ sku:'ODL-DEMO-2', family:'acc', nameZh:'示例配件', status:'dev', msrp:99 }, completeness:{ need:3, got:3, missing:[], done:true }, pricing:sens ? { ...pricing, fixed:[{ key:'msrp', price:99, cm:10, cmPct:0.1 }, { key:'map', price:99 }, { key:'promoFloor', price:null }] } : { msrp:99, wholesale:[] } }] };
}
const PREVIEW = { id:'pv1', fileName:'update.xlsx', ignoredColumns:['备注栏'], columns:[],
  results:[{ row:3, sku:'ODL-DEMO-1', status:'update', changes:[{ key:'msrp', from:2000, to:2200 }, { key:'status', from:'dev', to:'launch' }], errors:[], warnings:[{ key:'series', zh:'产品线 / 系列：必填未完成', en:'series' }] },
    { row:4, sku:'ODL-NEW-1', status:'new', changes:[{ key:'nameZh', from:null, to:'新耗材' }], errors:[], warnings:[] },
    { row:5, sku:'ODL-BAD', status:'error', changes:[], errors:[{ col:'D', header:'产品族', key:'family', zh:'只能填：主机 / 配件/备件', en:'bad' }], warnings:[] }],
  analysis:{ totals:{ rows:3, new:1, update:1, same:0, error:1, fieldChanges:3, warnings:1 }, completeness:{ before:{ need:10, got:6, pct:60, complete:1, products:2 }, after:{ need:12, got:8, pct:66.7, complete:1, products:3 } },
    statusChanges:{ 'dev→launch':1 }, prices:{ msrp:{ changed:1, avgPct:10, max:{ sku:'ODL-DEMO-1', pct:10 } }, map:{ changed:0, avgPct:null, max:null }, wholesale:[{ name:'示例档', changed:1, avgPct:10, max:{ sku:'ODL-DEMO-1', pct:10 } }] },
    margins:{ msrpCmPct:{ before:30, after:36.4 }, belowFloor:{ before:{ dtc:1, wholesale:0 }, after:{ dtc:0, wholesale:0 } }, floors:{ dtc:10, wholesale:10 } }, newByFamily:{ cons:1 } } };

function load(data, { confirm = true, prompt = '' } = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const calls = [], toasts = [], fetches = [];
  class FileReader { readAsDataURL(f) { this.result = 'data:x;base64,' + Buffer.from(f.text || '').toString('base64'); setTimeout(() => this.onload(), 0); } }
  window.confirm = () => confirm; window.prompt = () => prompt;
  window.fetch = async url => { fetches.push(url); return { ok:true, headers:{ get:() => "attachment; filename*=UTF-8''x.xlsx" }, blob:async () => ({}) }; };
  const context = { window, document, requestAnimationFrame:fn => fn(), Intl, Date, console, URL:{ createObjectURL:() => 'blob:x', revokeObjectURL() {} }, setTimeout, FileReader, fetch:window.fetch };
  vm.runInNewContext(read('product-library.js'), context);
  // The permissions button comes from erp-access.js; this stub shows it as the main admin would see it.
  window.WorkOSErpAccess = { button:(area, cls) => `<a class="${cls}" href="#erp-access/${area}">${area === 'pricing' ? '价格权限' : '产品资料权限'}</a>` };
  const api = {
    get:async p => { calls.push(['GET', p]); return p === '/products/library' ? data : p.endsWith('/history') ? { items:[{ id:'h1', field:'status', from:'dev', to:'launch', source:'edit', actor:'KC', at:'2026-11-04T10:00:00Z' }] } : p === '/products/library/imports' ? { items:[{ id:'imp1', fileName:'update.xlsx', summary:{ new:1, update:1, skipped:1 }, by:'KC', at:'2026-11-04T10:00:00Z' }] } : {}; },
    post:async (p, b) => { calls.push(['POST', p, b]); return p.endsWith('/preview') ? j(PREVIEW) : p.endsWith('/confirm') ? { new:1, update:1 } : p.endsWith('/undo') ? { restored:2, removed:1, kept:[] } : p === '/products/library' ? { sku:b.sku } : {}; },
    request:async (p, o) => { calls.push([o.method, p, o.body]); return o.method === 'PATCH' ? { item:{ ...data.items[0], values:{ ...data.items[0].values, ...o.body.values } }, prices:{} } : {}; },
  };
  const ctx = { api, state:() => ({ capabilities:{ productLibrary:true } }), lang:() => 'zh', rerender:() => { document.getElementById('app').innerHTML = window.WorkOSProductLibrary.render(); }, toast:m => toasts.push(m) };
  window.WorkOSProductLibrary.configure(ctx);
  const W = window.WorkOSProductLibrary;
  const show = async () => { W.render(); for (let i = 0; i < 6; i++) await tick(); ctx.rerender(); return document.getElementById('app').innerHTML; };
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles:true, cancelable:true }));
  return { W, window, document, calls, toasts, fetches, show, fire };
}

test('editor: groups, 必填 badges where required (no 选填 noise), visibility chips; everyone sees public prices only', async () => {
  const { document, show } = load(library(false));
  const html = await show();
  for (const g of ['产品基本参数', '生命周期', '产品详情', '定价', '包装与物流']) assert.match(html, new RegExp(g));
  // Owner's order (2026-11-12): 1 基本参数, 2 生命周期, 3 定价, 4 包装物流, 5 供应商, 6 产品详情
  const heads = [...document.querySelectorAll('.pl-grp > summary')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
  assert.match(heads.join(' | '), /^1\s*产品基本参数.*\|\s*2\s*生命周期.*\|\s*3\s*定价.*\|\s*4\s*包装与物流.*\|\s*6\s*产品详情/);
  assert.doesNotMatch(html, /受限区域|测试原型|DEMO-HYD|示例 · 60W/, 'no demo banner or sample rows');
  assert.match(html, /全员/); assert.match(html, /必填/); assert.doesNotMatch(html, /选填/, 'only required fields carry a badge');
  assert.match(html, /文件是敏感信息/); assert.doesNotMatch(html, /到岸价|送达成本|贡献利润|NPCR|示例工厂/);
  assert.doesNotMatch(html, /定价（批发）|批发档位|零售档位/, '产品资料 shows the three prices only');
  assert.equal(document.querySelector('[data-pl-f="series"]').closest('.pl-fld').classList.contains('miss'), true, 'missing required field is highlighted');
  assert.match(html, /仅看必填未完成[\s\S]*1 个待补/);
  assert.equal(document.querySelector('[data-pl="new"]'), null, 'view-only people cannot add products');
});

test('cost access: worksheet, CM warnings, wholesale tiers with override and freight, file slots; autosave per field', async () => {
  const { W, document, calls, show, fire, toasts } = load(library(true), { prompt:'新款上市' });
  let html = await show();
  // 产品资料: three prices only (landed, last mile, MSRP); the worksheet lives on the 定价 page
  for (const t of ['到岸价', '尾程运费', '零售价 MSRP', '说明书', 'manual.pdf', '常用备件清单']) assert.match(html, new RegExp(t), t);
  assert.doesNotMatch(html, /零售档位|NPCR 价格阶梯|经销商每台利润/);
  document.getElementById('app').innerHTML = W.render('pricing'); html = document.getElementById('app').innerHTML;
  for (const t of ['送达成本', '\\$1,100', '零售档位', '\\$1,699', 'NPCR 价格阶梯', 'Amazon / eBay', '低于官网底线 10%', '经销商每台利润', '我们付运费']) assert.match(html, new RegExp(t), t);
  assert.equal(document.querySelector('[data-pl="view"][data-v="settings"]'), null, 'no price-parameter button without admin');
  assert.match(html, /零售销售费率[\s\S]*默认 13%（价格参数）/, 'a SKU’s own retail rate, the company rate as placeholder');
  const ov = document.querySelector('[data-pl-f="whOv0"]'); ov.value = '1500'; fire(ov, 'change'); await tick(); await tick();
  assert.deepEqual(j(calls.filter(c => c[0] === 'PATCH').at(-1)[2]), { values:{ whOv0:'1500' } });
  document.getElementById('app').innerHTML = W.render('pricing');
  fire(document.querySelector('[data-pl-freight="us"]'), 'click'); await tick(); await tick();
  assert.deepEqual(j(calls.filter(c => c[0] === 'PATCH').at(-1)[2]), { values:{ whFreight:'us' } });
  document.getElementById('app').innerHTML = W.render();
  assert.equal(document.querySelector('[data-pl-upload="spareParts"]').getAttribute('accept'), '.pdf', 'PDF-only slot');
  const w = document.querySelector('[data-pl-f="netWeight"]'); w.value = '38'; fire(w, 'change'); await tick(); await tick();
  assert.deepEqual(j(calls.filter(c => c[0] === 'PATCH').at(-1)), ['PATCH', '/products/library/ODL-DEMO-1', { values:{ netWeight:'38' } }]);
  const st = document.querySelector('[data-pl-f="status"]'); st.querySelectorAll('option').forEach(o => o.removeAttribute('selected')); st.querySelector('option[value="clearance"]').setAttribute('selected', ''); fire(st, 'change'); await tick(); await tick();
  assert.deepEqual(j(calls.filter(c => c[0] === 'PATCH').at(-1)[2]), { values:{ status:'clearance' }, note:'新款上市' }, 'clearance asks for a reason');
  const s = document.querySelector('[data-pl-f="series"]'); s.value = ''; fire(s, 'change'); await tick();
  assert.equal(calls.filter(c => c[0] === 'PATCH' && 'series' in c[2].values).length, 0, 'an unchanged empty field is not saved');
  assert.match(document.getElementById('app').innerHTML, /已自动保存/); assert.equal(toasts.length, 0);
});

test('template download, upload preview with before/after and analysis, skip-errors confirm, history and undo (main admin)', async () => {
  const { W, document, calls, fetches, show, fire } = load(library(true, true));
  await show();
  fire(document.querySelector('[data-pl="template"]'), 'click'); await tick();
  assert.equal(fetches.at(-1), '/api/products/library/template?format=xlsx');
  // One page: no sub-tabs; the toolbar has 新建产品 · 批量更新 · 下载标准模板 · 导入记录 · 产品资料权限, in that order
  assert.equal(document.querySelector('.pl-tabs'), null, 'no 产品资料 / 批量更新 sub-tabs');
  const labels = [...document.querySelectorAll('.pl-bar .pl-btn')].map(b => b.textContent.replace(/[＋\s]/g, ''));
  assert.deepEqual(labels, ['新建产品', '批量更新', '下载标准模板', '导入记录', '产品资料权限']);
  assert.equal(document.querySelector('.pl-bar a.pl-btn').getAttribute('href'), '#erp-access/products', '产品资料权限 opens the product permissions');
  assert.ok(document.querySelector('.pl-layout'), 'the product list stays on the page');
  const inp = document.querySelector('[data-pl-import]'); assert.equal(inp.getAttribute('accept'), '.xlsx,.csv');
  Object.defineProperty(inp, 'files', { value:[{ name:'update.xlsx', size:10, text:'x' }] }); fire(inp, 'change');
  for (let i = 0; i < 6; i++) await tick();
  const post = calls.find(c => c[1] === '/products/library/import/preview'); assert.equal(post[2].fileName, 'update.xlsx'); assert.ok(post[2].dataBase64);
  W._state.pvFilter = 'all'; const html = await show();
  for (const t of ['更新前后对比与分析', '系统还没有写入任何数据', '备注栏', '60.0%', '66.7%', '开发中|dev', '\\+10.0%', '36.4%', '第 5 行 · D 列「产品族」', '\\$2,000', '\\$2,200', '新增', '有错误', '耗材']) assert.match(html, new RegExp(t), t);
  const btn = () => document.querySelector('[data-pl="confirm"]');
  assert.equal(btn().hasAttribute('disabled'), true, 'errors block confirm');
  const skip = document.querySelector('[data-pl-skip]'); skip.checked = true; fire(skip, 'change');
  assert.equal(btn().hasAttribute('disabled'), false);
  fire(document.querySelector('[data-pl="report"]'), 'click'); await tick(); assert.equal(fetches.at(-1), '/api/products/library/import/pv1/report');
  fire(btn(), 'click'); for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(j(calls.find(c => c[1] === '/products/library/import/pv1/confirm')), ['POST', '/products/library/import/pv1/confirm', { skipErrors:true }]);
  const hist = await show(); assert.match(hist, /导入记录[\s\S]*update\.xlsx/); assert.match(hist, /返回产品资料/);
  fire(document.querySelector('[data-pl-undo="imp1"]'), 'click'); for (let i = 0; i < 4; i++) await tick();
  assert.ok(calls.some(c => c[1] === '/products/library/imports/imp1/undo'));
});

test('nothing is written when the admin cancels the confirm dialog; cancelling the preview goes back to the product list', async () => {
  const { W, document, calls, show, fire } = load(library(true, true), { confirm:false });
  await show();
  W._state.view = 'import'; W._state.preview = j(PREVIEW); W._state.skipErrors = true; await show();
  fire(document.querySelector('[data-pl="confirm"]'), 'click'); await tick();
  assert.equal(calls.some(c => c[1].endsWith('/confirm')), false);
  const html = await show();
  assert.match(html, /返回产品资料/); assert.match(html, /批量更新/); assert.doesNotMatch(html, /data-v="settings"|价格参数/, 'no pricing settings sub-page');
  fire(document.querySelector('[data-pl="preview-cancel"]'), 'click'); const back = await show();
  assert.match(back, /pl-layout/); assert.doesNotMatch(back, /更新前后对比与分析/);
});

test('定价 is the same library in pricing mode: editable basic details, cost and NPCR; MSRP saves to the product; admins get 价格参数', async () => {
  const { W, document, calls, fire, show } = load(library(true, true));
  await show(); W.render('pricing'); for (let i = 0; i < 6; i++) await tick();
  document.getElementById('app').innerHTML = W.render('pricing'); const html = document.getElementById('app').innerHTML;
  assert.ok(document.querySelector('.pl-basic [data-pl-f="nameZh"]:not([disabled])'), 'basic details are editable on the pricing page');
  assert.match(html, /NPCR 价格阶梯/); assert.match(html, /到岸价/); assert.match(html, /定价（零售）/); assert.match(html, /定价（批发）/);
  assert.doesNotMatch(html, /包装与物流/, 'only basic details and pricing on the pricing page');
  const labels = [...document.querySelectorAll('.pl-bar .pl-btn')].map(b => b.textContent.replace(/[＋\s]/g, ''));
  assert.deepEqual(labels, ['新建产品', '批量更新', '下载标准模板', '导入记录', '价格参数（NPCR）', '价格权限'], 'the pricing page has its own 价格权限');
  const m = document.querySelector('[data-pl-f="msrp"]'); m.value = '2199'; fire(m, 'change'); for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter(c => c[0] === 'PATCH').at(-1))).slice(2), [{ values:{ msrp:'2199' } }], 'MSRP is saved on the product record');
  // 产品资料 shows the three prices only
  document.getElementById('app').innerHTML = W.render(); const cat = document.getElementById('app').innerHTML;
  assert.doesNotMatch(cat, /NPCR 价格阶梯|零售销售费率/); assert.match(cat, /零售价 MSRP/);
});
