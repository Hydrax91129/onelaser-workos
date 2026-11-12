import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const LOCATIONS = [{ id:'us', zh:'美国仓', en:'US warehouse' }, { id:'dg', zh:'东莞工厂仓', en:'Dongguan factory' }, { id:'jn', zh:'济南工厂仓', en:'Jinan factory' }, { id:'transit', zh:'在途', en:'In transit' }, { id:'refurb', zh:'美国仓·翻新品', en:'US refurbished' }];

function load(summary, history = []) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  vm.runInNewContext(read('wms.js'), { window, document, Intl, Date, console, URL, setTimeout, clearTimeout, Event:window.Event });
  const calls = [];
  const api = { get:async p => { calls.push(p); return p.startsWith('/wms/summary') ? summary : { movements:history }; }, post:async () => ({}) };
  window.WorkOSWms.configure({ api, lang:() => 'zh', rerender:() => {}, toast:() => {}, closeOverlay:() => {}, modal:() => {} });
  const render = () => { document.getElementById('app').innerHTML = window.WorkOSWms.render(); return document.getElementById('app'); };
  const click = sel => document.querySelector(sel).dispatchEvent(new window.Event('click', { bubbles:true }));
  return { window, document, calls, render, click };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const move = (id, sku, type, extra = {}) => ({ id, sku, type, location:'us', qty:1, reason:'r', reference:'', status:'done', createdAt:'2026-11-01T00:00:00Z', byName:'A', ...extra });

test('stock table draws at most 300 rows until asked for more', async () => {
  const items = Array.from({ length:650 }, (_, i) => ({ sku:'S-' + String(i).padStart(4, '0'), name:'n', type:'', qty:{ us:1 } }));
  const w = load({ locations:LOCATIONS, items, movements:[], canOperate:false });
  w.render(); await tick();
  assert.equal(w.render().querySelectorAll('.wms-table tbody tr').length, 300);
  w.click('[data-wms="more"]');
  assert.equal(w.render().querySelectorAll('.wms-table tbody tr').length, 600);
  w.click('[data-wms="all"]');
  assert.equal(w.render().querySelectorAll('.wms-table tbody tr').length, 650);
  assert.ok(!w.render().querySelector('[data-wms="more"]'));
});

test('movement log filters by type and search; one SKU loads its full history from the server', async () => {
  const movements = [move('1', 'A-1', 'in', { reason:'采购到货' }), move('2', 'A-1', 'out', { reference:'SO-77' }), move('3', 'B-2', 'transfer', { toLocation:'transit' })];
  const w = load({ locations:LOCATIONS, items:[{ sku:'A-1', name:'a', type:'', qty:{ us:3 } }], movements, canOperate:true }, [move('1', 'A-1', 'in'), move('2', 'A-1', 'out'), move('0', 'A-1', 'in')]);
  w.render(); await tick(); w.render();
  w.click('[data-wms="tab"][data-v="log"]');
  assert.equal(w.render().querySelectorAll('.wms-table tbody tr').length, 3);
  w.click('[data-wms="type"][data-v="out"]');
  const rows = w.render().querySelectorAll('.wms-table tbody tr');
  assert.equal(rows.length, 1); assert.match(rows[0].textContent, /SO-77/);
  w.click('[data-wms="type"][data-v=""]');
  w.click('[data-wms="tab"][data-v="stock"]');
  w.render();
  w.click('[data-wms="history"][data-sku="A-1"]');
  w.render(); await tick();
  assert.ok(w.calls.includes('/wms/movements?sku=A-1'), 'full history requested');
  assert.equal(w.render().querySelectorAll('.wms-table tbody tr').length, 3, 'shows the server history, including the older movement');
});

test('opening-stock import and template use the four regular locations; returns are not regular stock', () => {
  const src = read('wms.js');
  assert.doesNotMatch(src, /refurb|翻新品/, 'no returns warehouse in regular stock');
  assert.match(src, /SKU,产品名称,类型,美国LA仓,东莞工厂仓,济南工厂仓,在途运输中\\nEXAMPLE-SKU-01,示例产品,整机,0,0,0,0\\n/);
  assert.match(src, /us:\['美国LA仓', '美国仓'/, 'old 美国仓 headers still import');
  assert.match(src, /'美国LA仓缺货'/);
});

test('stock: PIM facts and image, family / series / MSRP filters, one warehouse shows its bins (editable for operators)', async () => {
  const families = [{ key:'main', zh:'主机', en:'Machine' }, { key:'acc', zh:'配件/备件', en:'Accessory' }];
  const items = [
    { sku:'M-1', name:'m', nameZh:'示例主机', nameEn:'Demo machine', family:'main', series:'XRF', msrp:1999, imageId:'img1', type:'', qty:{ us:3 }, bins:{ us:['A-01', 'A-02', ''] } },
    { sku:'P-1', name:'p', nameZh:'示例配件', nameEn:'Demo part', family:'acc', series:'Hydra', msrp:49, imageId:null, type:'', qty:{ us:9, dg:2 }, bins:{} },
    { sku:'P-2', name:'p2', nameZh:'没有价格的配件', nameEn:'', family:'', series:'', msrp:null, type:'', qty:{}, bins:{} }];
  const w = load({ locations:LOCATIONS, families, items, movements:[], canOperate:true });
  w.render(); await tick(); let app = w.render();
  assert.match(app.innerHTML, /示例主机/); assert.match(app.innerHTML, /Demo machine/); assert.match(app.innerHTML, /主机/); assert.match(app.innerHTML, /\$1,999/);
  assert.equal(app.querySelector('img.wms-thumb').getAttribute('src'), '/api/products/library/files/img1', 'small product image next to the SKU');
  const change = (sel, v) => { const el = w.document.querySelector(sel);
    if (el.tagName === 'SELECT') el.querySelectorAll('option').forEach(o => { if (o.getAttribute('value') === v) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); else el.value = v;
    el.dispatchEvent(new w.window.Event('change', { bubbles:true })); };
  change('[data-wms-fam]', 'acc'); app = w.render(); assert.deepEqual([...app.querySelectorAll('.wms-table tbody .mono')].map(x => x.textContent), ['P-1']);
  change('[data-wms-fam]', ''); change('[data-wms-pmin]', '100'); app = w.render(); assert.deepEqual([...app.querySelectorAll('.wms-table tbody .mono')].map(x => x.textContent), ['M-1'], 'MSRP from $100');
  change('[data-wms-pmin]', ''); change('[data-wms-loc]', 'us'); app = w.render();
  assert.match(app.querySelector('thead').textContent, /首选库位/); assert.equal(app.querySelector('[data-wms-bin="M-1"][data-i="0"]').getAttribute('value'), 'A-01');
  assert.equal(app.querySelectorAll('.wms-table tbody tr').length, 3, 'a warehouse shows every SKU, with its quantity there');
});

test('goods out: one order with several SKUs from the finder, each with its own quantity, dated (today by default, editable)', async () => {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="overlay-root"></div></body></html>');
  vm.runInNewContext(read('wms.js'), { window, document, Intl, Date, console, URL, setTimeout, clearTimeout, Event:window.Event });
  const posts = [];
  const items = [{ sku:'M-1', nameZh:'示例主机', family:'main', qty:{ us:3 }, bins:{ us:['A-01'] } }, { sku:'P-1', nameZh:'示例配件', family:'acc', qty:{ us:9 } }, { sku:'Z-0', nameZh:'没货', family:'acc', qty:{} }];
  const api = { get:async () => ({ locations:LOCATIONS, families:[{ key:'main', zh:'主机', en:'M' }, { key:'acc', zh:'配件', en:'A' }], items, movements:[], canOperate:true }), post:async (p, b) => { posts.push([p, b]); return { lines:b.lines.length, units:5 }; } };
  window.WorkOSWms.configure({ api, lang:() => 'zh', rerender:() => {}, toast:() => {}, closeOverlay:() => {}, modal:(t, body) => { document.getElementById('overlay-root').innerHTML = `<div class="modal"><form-host>${body}</form-host></div>`; } });
  const ev = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles:true }));
  document.getElementById('app').innerHTML = window.WorkOSWms.render(); await tick(); await tick(); document.getElementById('app').innerHTML = window.WorkOSWms.render();
  ev(document.querySelector('[data-wms="op"][data-type="out"]:not([data-sku])'), 'click');
  const f = document.getElementById('wms-op');
  assert.match(f.querySelector('[name="opDate"]').getAttribute('value'), /^\d{4}-\d{2}-\d{2}$/, 'the date is filled with today');
  assert.equal(document.querySelectorAll('[data-wms-add]').length, 2, 'in-stock only by default for goods out');
  ev(document.querySelector('[data-wms-add="M-1"]'), 'click'); ev(document.querySelector('[data-wms-add="P-1"]'), 'click');
  const qty = (i, v) => { const el = document.querySelector(`[data-wms-line="${i}"]`); el.value = v; ev(el, 'input'); };
  qty(0, '2'); qty(1, '3');
  f.querySelector('[name="opDate"]').value = '2026-11-03'; f.querySelector('[name="reference"]').value = 'SO-1001';
  ev(f, 'submit'); await tick();
  assert.equal(posts.length, 1);
  const [path, body] = posts[0];
  assert.equal(path, '/wms/movements/batch');
  assert.deepEqual(JSON.parse(JSON.stringify(body)), { type:'out', location:'us', opDate:'2026-11-03', reason:'销售发货', reference:'SO-1001', lines:[{ sku:'M-1', qty:2 }, { sku:'P-1', qty:3 }] });
});

test('movement log: operation date, how it was made, and the batch size', async () => {
  const movements = [move('1', 'A-1', 'in', { opDate:'2026-11-02', method:'batch', batchSkus:12, batchUnits:340 }), move('2', 'A-1', 'out', { opDate:'2026-11-03', method:'manual', batchSkus:1, batchUnits:1 }), move('3', 'B-2', 'adjust', { opDate:'2026-10-31', method:'import', batchSkus:200, batchUnits:5000, reference:'IMPORT' })];
  const w = load({ locations:LOCATIONS, items:[], movements, canOperate:true });
  w.render(); await tick(); w.render(); w.click('[data-wms="tab"][data-v="log"]');
  const t = w.render().querySelector('.wms-table').textContent;
  for (const x of ['操作日期', '操作方式', '批量入库', '本批 12 个 SKU · 共 340 件', '手动出库', '期初导入', '2026-11-02']) assert.ok(t.includes(x), x);
});
