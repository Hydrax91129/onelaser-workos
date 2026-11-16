import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

// 订单履约 page (owner, 2026-11-16). Fictional orders and customers only.
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const H = 3600_000;
const order = (o) => ({ source:'shopify', kind:'retail', kindNote:'', channel:'online', placedAt:new Date(Date.now() - 50 * H).toISOString(), customer:{ name:'Sample Buyer', email:'b@example.test', city:'Austin', state:'TX' },
  totalCents:599900, paidCents:599900, owedCents:0, lines:[{ sku:'DEMO-H9', name:'Demo Hydra 9', qty:1 }], tags:[], shipment:'ltl', liftgate:true, residential:false,
  release:null, carrier:'', tracking:'', damage:'', reviewPlatform:'', contentUrl:'', late:false, due:null, owner:null, ownerName:'', ...o });
const DATA = {
  items:[
    order({ id:'a', number:'#1', stage:'ship', late:true, due:new Date(Date.now() - 5 * H).toISOString(), owner:'m6', ownerName:'Gu An', paidAt:new Date(Date.now() - 53 * H).toISOString() }),
    order({ id:'b', number:'#2', stage:'pay', paidCents:100000, owedCents:499900, due:new Date(Date.now() + 20 * H).toISOString(), owner:'m4', ownerName:'Zhou Ming' }),
    order({ id:'c', number:'#K-1', kind:'kol', kindNote:'zero_untagged', totalCents:0, paidCents:0, stage:'approve' }),
    order({ id:'d', number:'#D-1', kind:'dealer', stage:'done', shippedAt:'2026-11-01T00:00:00Z', deliveredAt:'2026-11-05T00:00:00Z', carrier:'Demo Freight', tracking:'PRO-1' }),
  ],
  summary:{ lateShip:1, owedCents:499900, owedOrders:1, terminalNoAppt:0, damaged:0, noFirstPiece:0, lateTotal:1, zeroUntagged:1, payToShipHours:30, shipToDeliverDays:8, deliverToFirstDays:4, reviewRate:40, avgRating:4.8 },
  settings:{ shipHoursLtl:48, shipHoursParcel:24, trainDays:5, reviewPlatforms:['trustpilot', 'bbb', 'google', 'facebook'] }, canManage:true, canRelease:false, shopify:false };

function load(detail) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="overlay-root"></div></body></html>');
  const c = { window, document, console, Date, setTimeout, FormData:class { constructor(f) { this.v = [...f.querySelectorAll('[name]')].map(n => [n.getAttribute('name'), n.tagName === 'SELECT' ? (n.querySelector('option[selected]') || n.querySelector('option'))?.getAttribute('value') : n.value ?? n.getAttribute('value') ?? '']); } [Symbol.iterator]() { return this.v[Symbol.iterator](); } } };
  vm.runInNewContext(read('multi-select.js'), c); vm.runInNewContext(read('orders.js'), c);
  const posts = [];
  const api = { get:async p => p === '/orders' ? DATA : detail, post:async (p, b) => { posts.push([p, b]); return { ok:true }; } };
  window.WorkOSOrders.configure({ api, state:() => ({ actor:{ id:'m6' } }), lang:() => 'zh', rerender:() => {}, toast:() => {}, closeOverlay:() => {},
    modal:(t, body) => { document.getElementById('overlay-root').innerHTML = `<div class="modal">${body}</div>`; } });
  const render = () => { document.getElementById('app').innerHTML = window.WorkOSOrders.render(); return document.getElementById('app'); };
  const click = el => el.dispatchEvent(new window.Event('click', { bubbles:true }));
  return { window, document, render, click, posts };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const rows = app => [...app.querySelectorAll('.ord-table tbody tr[data-ord-open]')].map(r => r.querySelector('.mono').firstChild.textContent);

test('board: five numbers, late orders first, filters by number, type and "mine"; done orders sit in their own tab', async () => {
  const w = load(); w.render(); await tick(); let app = w.render();
  assert.match(app.innerHTML, /超时未出货/); assert.match(app.innerHTML, /\$4,999/); assert.match(app.innerHTML, /0 元订单在 Shopify 里没有 kol 标签/);
  assert.deepEqual(rows(app), ['#1', '#2', '#K-1'], 'open orders, the late one first; the finished dealer order is not here');
  assert.match(app.querySelector('tr[data-ord-open="a"]').innerHTML, /超时 5 小时/);
  w.click(app.querySelector('[data-ord="kpi"][data-v="owed"]')); app = w.render(); assert.deepEqual(rows(app), ['#2'], 'the unpaid number filters to unpaid orders');
  w.click(app.querySelector('[data-ord="clear"]')); app = w.render();
  w.click(app.querySelector('.mf[data-mf-key="kind"] [data-mf-one="kol"]')); app = w.render(); assert.deepEqual(rows(app), ['#K-1']);
  w.click(app.querySelector('.mf[data-mf-key="kind"] [data-mf-all]')); app = w.render();
  const mine = app.querySelector('[data-ord-flag="mine"]'); mine.checked = true; mine.dispatchEvent(new w.window.Event('change', { bubbles:true }));
  app = w.render(); assert.deepEqual(rows(app), ['#1'], 'mine = the stage owner is me');
  w.click(app.querySelector('[data-ord="tab"][data-v="closed"]')); mine.checked = false; app = w.render();
  const m2 = app.querySelector('[data-ord-flag="mine"]'); m2.checked = false; m2.dispatchEvent(new w.window.Event('change', { bubbles:true })); app = w.render();
  assert.deepEqual(rows(app), ['#D-1']);
});

test('order dialog: the timeline, the next step for this stage, and shipping posts carrier and tracking', async () => {
  const detail = { ...DATA.items[0], events:[{ id:'e1', kind:'imported', details:{}, at:'2026-11-14T00:00:00Z', by:'Shopify' }] };
  const w = load(detail); w.render(); await tick(); const app = w.render();
  w.click(app.querySelector('tr[data-ord-open="a"]')); await tick();
  const m = w.document.getElementById('overlay-root');
  assert.deepEqual([...m.querySelectorAll('.ord-line li b')].map(b => b.textContent), ['收款', '出货', '在途', '签收', '会用', '评价']);
  assert.equal(m.querySelector('.ord-line li.late b').textContent, '出货', 'the late step is red');
  assert.ok(m.querySelector('[data-ord-step="ship"]'), 'next step: ship'); assert.ok(!m.querySelector('[data-ord-step="release"]'), 'only main admins see the release form');
  const f = m.querySelector('[data-ord-step="ship"]');
  f.querySelector('[name="carrier"]').value = 'Demo Freight'; f.querySelector('[name="tracking"]').value = 'PRO-77';
  f.dispatchEvent(new w.window.Event('submit', { bubbles:true, cancelable:true })); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(w.posts[0])), ['/orders/a/step', { step:'ship', carrier:'Demo Freight', tracking:'PRO-77' }]);
});
