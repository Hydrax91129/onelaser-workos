import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const j = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(r => setTimeout(r, 0));

const ITEM = { sku:'OCL-A', name:{ zh:'示例机', en:'Demo' }, nameZh:'示例机', nameEn:'Demo', type:'整机', status:'live', gross:50, dims:[90, 60, 40], lead:'30天', moq:null, msrp:5999, shipFee:399, best:'DDP', note:'',
  landedUsd:2800, lastMileUsd:399, actualPrice:4999, priceClass:'standard', channels:{ amazon:{ price:4999, listed:true } }, pendingPrices:[{ id:'pc1', target:'msrp', price:3999 }] };
function load(actor, extra = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const context = { window, document, requestAnimationFrame:fn => fn(), Intl, Date, console, URL, Image:class {}, setTimeout };
  vm.runInNewContext(read('products.js'), context);
  const calls = [], toasts = [];
  const products = { items:[ITEM], canEditCatalog:true, canEditMsrp:true, canSeePricing:true, canSeeChannels:true, canEditChannels:true, canApprovePrices:actor.isAdmin === true, canEditRules:actor.isAdmin === true,
    statusNext:{ '':['dev'], dev:['launch', 'eol'], launch:['live', 'dev', 'eol'], live:['clearance', 'eolPlanned'], clearance:['live', 'eolPlanned', 'eol'], eolPlanned:['live', 'clearance', 'eol'], eol:[] }, ...extra };
  const history = { sku:'OCL-A', changes:[{ id:'c1', field:'status', from:'launch', to:'live', note:'', source:'status', actor:{ id:'u1', name:'KC' }, at:'2026-11-01T10:00:00Z' }],
    prices:[{ id:'p1', target:'msrp', from:5799, to:5999, status:'applied', reason:'', requestedBy:{ id:'u1', name:'KC' }, at:'2026-11-01T09:00:00Z' }, { id:'p2', target:'dealer', from:null, to:4199, status:'applied', reason:'', requestedBy:{ id:'u1', name:'KC' }, at:'2026-11-01T08:00:00Z' }] };
  const api = {
    get:async p => { calls.push(['GET', p]); return p === '/products' ? products : p.endsWith('/history') ? history : p === '/products/price-changes' ? { canDecide:actor.isAdmin === true, items:[{ id:'pc1', sku:'OCL-A', name:{ zh:'示例机' }, target:'msrp', from:5999, to:3999, cmPct:13, needs:'floor', status:'pending', reason:'黑五', requestedBy:{ id:'u3', name:'Amy' }, at:'2026-11-01T11:00:00Z' }] } : { items:[] }; },
    post:async (p, b) => { calls.push(['POST', p, b]); if (p === '/products') { products.items = [...products.items, { ...b, name:{ zh:b.nameZh }, status:'dev' }]; return { sku:b.sku, status:'dev' }; } return {}; },
    request:async (p, o) => { calls.push([o.method, p, o.body]); return p.endsWith('/pricing-plan') ? { priceClass:'standard', actualPrice:4999 } : {}; },
  };
  const state = { actor, capabilities:{ productsData:true, pricingRules:true }, directory:[actor] };
  const ctx = { api, state:() => state, lang:() => 'zh', rerender:() => {}, toast:m => toasts.push(m), closeOverlay:() => {}, modal:() => {} };
  window.WorkOSProducts.configure(ctx);
  const W = window.WorkOSProducts;
  const show = async tab => { for (let n = 0; n < 3; n++) { W.render(tab); for (let i = 0; i < 6; i++) await tick(); } const html = W.render(tab); document.getElementById('app').innerHTML = html; document.querySelectorAll('input[checked]').forEach(x => { x.checked = true; }); return html; };
  const click = el => el.dispatchEvent(new window.Event('click', { bubbles:true, cancelable:true }));
  return { W, document, calls, toasts, show, click };
}

test('product editor saves only the changed fields; lifecycle and MSRP-only history', async () => {
  const { W, document, calls, toasts, show, click } = load({ id:'u1', display_name:'KC', grants:['products', 'products_manage', 'product_cost_detail'] });
  await show('catalog');
  W._ui.product = 'OCL-A';
  const html = await show('catalog');
  assert.match(html, /MSRP 调整为 \$3,999\.00 的申请正在等待管理员审批/);
  assert.match(html, /变更记录[\s\S]*在售/); assert.match(html, /\$5,799\.00 → \$5,999\.00/);
  assert.doesNotMatch(html, /\$4,199|经销|最低售价|工厂价|结账运费|最终成本|DDP 单价|美国尾程/, 'the catalog editor shows MSRP only, even with cost access');
  assert.deepEqual(j([...document.querySelectorAll('[data-pd-status] option')].map(o => o.getAttribute('value'))), ['clearance', 'eolPlanned'], 'only allowed next statuses');
  document.querySelector('[data-pd-f="lead"]').value = '45天';
  document.querySelector('[data-pd-f="moq"]').value = '5';
  document.querySelector('[data-pd-f="msrp"]').value = '6199';
  document.querySelector('[data-pd-f="reason"]').value = '涨价';
  click(document.querySelector('[data-pd="save-product"]')); await tick();
  const patch = calls.find(c => c[0] === 'PATCH');
  assert.deepEqual(j(patch), ['PATCH', '/products/OCL-A', { lead:'45天', moq:5, msrp:6199, reason:'涨价' }]);
  assert.equal(toasts.at(-1), '已保存');

  await show('catalog'); W._ui.product = 'OCL-A'; await show('catalog');
  document.querySelector('[data-pd-status] option[value="clearance"]').setAttribute('selected', '');
  document.querySelector('[data-pd-status-note]').value = '新款上市';
  click(document.querySelector('[data-pd="status-save"]')); await tick();
  assert.deepEqual(j(calls.find(c => c[1] === '/products/OCL-A/status')), ['POST', '/products/OCL-A/status', { status:'clearance', note:'新款上市' }]);
});

test('adding a product posts the form and opens it', async () => {
  const { W, document, calls, show, click } = load({ id:'u1', display_name:'KC', grants:['products', 'products_manage'] }, { canSeePricing:false, canSeeChannels:false, canEditChannels:false });
  await show('catalog');
  click(document.querySelector('[data-pd="new-product"]'));
  const html = await show('catalog');
  assert.match(html, /添加产品[\s\S]*新产品从“开发中”开始/);
  document.querySelector('[data-pd-f="sku"]').value = 'OCL-NEW-1';
  document.querySelector('[data-pd-f="nameZh"]').value = '新机';
  document.querySelector('[data-pd-f="dims0"]').value = '90';
  click(document.querySelector('[data-pd="save-product"]')); await tick();
  assert.equal(calls.some(c => c[1] === '/products' && c[0] === 'POST'), false, 'half-filled package size is refused');
  ['dims1', 'dims2'].forEach(k => { document.querySelector(`[data-pd-f="${k}"]`).value = '60'; });
  click(document.querySelector('[data-pd="save-product"]')); await tick();
  assert.deepEqual(j(calls.find(c => c[1] === '/products' && c[0] === 'POST')), ['POST', '/products', { sku:'OCL-NEW-1', nameZh:'新机', dims:[90, 60, 60] }]);
  assert.equal(W._ui.product, 'OCL-NEW-1');
});

test('cost page: channel prices, price history and the approval queue for admins', async () => {
  const { W, document, calls, show, click } = load({ id:'u1', display_name:'KC', isAdmin:true, grants:['products', 'product_cost_detail'] });
  W._ui.costSku = 'OCL-A';
  const html = await show('cost');
  assert.match(html, /待审批调价（1）[\s\S]*黑五[\s\S]*Amy/);
  assert.match(html, /渠道价格[\s\S]*Amazon[\s\S]*建议价/);
  assert.match(html, /\$4,199\.00/, 'cost page history includes channel prices');
  document.querySelector('[data-pd-ch-price="dealer"]').value = '4199';
  document.querySelector('[data-pd-ch-reason]').value = '经销商新价';
  click(document.querySelector('[data-pd="channel-save"][data-ch="dealer"]')); await tick();
  assert.deepEqual(j(calls.find(c => c[0] === 'PUT')), ['PUT', '/products/OCL-A/channel-prices/dealer', { price:4199, listed:true, reason:'经销商新价' }]);
  await show('cost');
  click(document.querySelector('[data-pd="pc-approve"]')); await tick();
  assert.deepEqual(j(calls.find(c => c[1].endsWith('/decide'))), ['POST', '/products/price-changes/pc1/decide', { approve:true }]);
});
