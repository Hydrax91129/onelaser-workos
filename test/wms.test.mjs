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

test('opening-stock import and template know the refurbished location', () => {
  const src = read('wms.js');
  assert.match(src, /refurb:\['美国仓·翻新品'/);
  assert.match(src, /在途,美国仓·翻新品\\nEXAMPLE-SKU-01,示例产品,整机,0,0,0,0,0/);
});
