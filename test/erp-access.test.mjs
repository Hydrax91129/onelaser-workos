import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

test('ERP permissions show a module row only when the server offers that module', async () => {
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  vm.runInNewContext(readFileSync(new URL('../dist/erp-access.js', import.meta.url), 'utf8'), { window, document, console });
  const data = { canAdmin:true, people:[{ id:'u1', name:'Ann', access:{ kol:'view' } }] };
  const offered = new Set(['kol']);
  let rerendered = 0;
  window.WorkOSErpAccess.configure({ api:{ get:async () => data }, lang:() => 'en', rerender:() => rerendered++, supports:id => id === 'kol' ? offered.has('kol') : id === 'dealers' ? offered.has('dealers') : true });
  window.WorkOSErpAccess.render();
  await new Promise(r => setTimeout(r, 0));
  const areas = () => { document.body.innerHTML = window.WorkOSErpAccess.render(); return [...document.querySelectorAll('[data-erpa="area"][data-v]')].map(b => b.dataset.v).filter(Boolean); };
  assert.deepEqual(areas(), ['products', 'pricing', 'supply', 'warehouse', 'returns', 'kol'], 'no Dealers row before the dealer API is live; 批量更新 sits next to 产品');
  offered.add('dealers'); assert.ok(areas().includes('dealers'), 'Dealers row appears once the server offers it');
  offered.delete('kol'); assert.ok(!areas().includes('kol'), 'KOL row hidden when the server has no KOL module');
});
