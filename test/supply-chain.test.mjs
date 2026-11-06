import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const settings = { shipDays:40, safetyDays:30, agedDays:60, overstockDays:120, prodDaysMachine:25, prodDaysOther:12, orderCoverDays:60 };
const item = (sku, extra = {}) => ({ sku, name:sku, nameEn:sku, type:'配件', status:'', qty:{ us:10, dg:0, jn:0, transit:0, refurb:0 }, onOrder:0, ds7:1, ds30:1, ds90:1, sold90:90,
  avgAge:10, oldestAge:20, ageKnown:true, agedUnits:0, inbound:[], nextEta:null, state:'ok', flags:[], cover:10, lead:52, reorderQty:0, transferQty:0, trend:0, ...extra });
const ship = (id, status, extra = {}) => ({ id, vessel:'DEMO OCEAN', voyage:'052E', blNo:'BL1', containers:'DMOU1', forwarder:'', originPort:'Yantian', destPort:'Long Beach', etd:'2026-10-10', eta:'2026-11-18',
  status, note:'', lines:[{ lineNo:1, sku:'DEMO-A', name:'Demo A', qty:20, cartons:20, from:'dg', received:null }, { lineNo:2, sku:'DEMO-B', name:'Demo B', qty:5, cartons:null, from:'new', received:null }],
  units:25, daysToEta:12, late:false, createdByName:'A', receivedAt:null, receivedByName:'', ...extra });

function load(overview) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="overlay"></div></body></html>');
  vm.runInNewContext(read('supply-chain.js'), { window, document, Intl, Date, console, URL, Blob:class {}, setTimeout, clearTimeout, Event:window.Event, FormData:window.FormData });
  const calls = [];
  const api = { get:async p => { calls.push(['GET', p]); return overview; }, post:async (p, b) => { calls.push(['POST', p, b]); return { units:25, differences:0 }; }, request:async (p, o) => { calls.push([o.method, p, o.body]); return {}; } };
  const modal = (title, content, footer) => { document.getElementById('overlay').innerHTML = `<h2>${title}</h2>${content}${footer}`; };
  window.WorkOSSupply.configure({ api, lang:() => 'zh', rerender:() => {}, toast:() => {}, closeOverlay:() => { document.getElementById('overlay').innerHTML = ''; }, modal });
  const render = () => { document.getElementById('app').innerHTML = window.WorkOSSupply.render(); return document.getElementById('app'); };
  const click = sel => document.querySelector(sel).dispatchEvent(new window.Event('click', { bubbles:true }));
  const submit = sel => document.querySelector(sel).dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true }));
  return { window, document, calls, render, click, submit };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('supply page shows live WMS figures, state tiles and shipments, with no sample data', async () => {
  const w = load({ asOf:'2026-11-06T09:00:00Z', settings, canManage:true, canReceive:true, canImportLots:false, canSeeValue:false, lastLotImport:null,
    items:[item('DEMO-A', { state:'stockout', flags:['stockout', 'reorder'], cover:4, reorderQty:80, transferQty:20 }), item('DEMO-B', { state:'aged', flags:['aged'], oldestAge:75, qty:{ us:300, dg:0, jn:0, transit:0, refurb:0 }, cover:300 })],
    shipments:[ship('s1', 'at_sea'), ship('s2', 'booked', { vessel:'DEMO BAY' })] });
  w.render(); await tick();
  const page = w.render();
  assert.match(page.textContent, /WMS 出入库流水/);
  assert.doesNotMatch(page.textContent, /示例库存/);
  assert.equal(page.querySelectorAll('.sc-table tbody tr').length, 2);
  assert.match(page.querySelector('.sc-table tbody tr').textContent, /即将断货/, 'stock-out risk first');
  assert.ok(page.querySelector('[data-sc="receive"][data-id="s1"]'), 'a ship at sea can be received');
  assert.ok(page.querySelector('[data-sc="depart"][data-id="s2"]'), 'a booked ship can be marked as sailed');
  assert.equal(page.querySelector('[data-sc="lots"]'), null, 'only owners import stock age');
  assert.match(page.textContent, /海运 40 天/);
});

test('receiving requires a counted quantity on every line before anything is sent', async () => {
  const w = load({ asOf:'2026-11-06T09:00:00Z', settings, canManage:false, canReceive:true, canImportLots:false, canSeeValue:false, lastLotImport:null, items:[], shipments:[ship('s1', 'customs')] });
  w.render(); await tick(); w.render();
  w.click('[data-sc="receive"]');
  const inputs = w.document.querySelectorAll('.sc-count');
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].value, '', 'not prefilled with the packed quantity');
  inputs[0].value = '20';
  w.submit('#sc-receive'); await tick();
  assert.match(w.document.querySelector('#sc-receive .sc-error').textContent, /还有 1 行没填/);
  assert.equal(w.calls.filter(c => c[0] === 'POST').length, 0);
  w.document.querySelectorAll('.sc-count')[1].value = '4';
  w.submit('#sc-receive'); await tick();
  const post = w.calls.find(c => c[0] === 'POST');
  assert.equal(post[1], '/supply/shipments/s1/receive');
  assert.deepEqual(JSON.parse(JSON.stringify(post[2].lines)), [{ lineNo:1, received:20 }, { lineNo:2, received:4 }]);
});

test('cargo lines are read from “SKU, qty, cartons, origin” text', () => {
  const w = load({});
  const r = w.window.WorkOSSupply._parseLines('DEMO-A, 20, 20\nDEMO-B, 500, 10, 新生产\nDEMO-C 7 济南\n\nBAD, x', 'dg');
  assert.deepEqual(JSON.parse(JSON.stringify(r.lines)), [{ sku:'DEMO-A', qty:20, cartons:20, from:'dg' }, { sku:'DEMO-B', qty:500, cartons:10, from:'new' }, { sku:'DEMO-C', qty:7, cartons:null, from:'jn' }]);
  assert.equal(r.problems.length, 1);
});

test('products.js hands the supply tab to supply-chain.js when the server offers it', () => {
  const src = read('products.js');
  assert.match(src, /supplyOn\(\)\) return window\.WorkOSSupply\.render\(\)/);
  assert.match(src, /capabilities\?\.supplyChain === true/);
  assert.match(read('index.html'), /supply-chain\.js\?v=/);
});
