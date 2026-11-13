import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

// Multi-select filter dropdown used by PIM / WMS / SCM (owner, 2026-11-14): a click on a name picks only it,
// the boxes pick several and keep the list open, "All" clears. Fictional values only.
function load() {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><p id="out">outside</p></body></html>');
  vm.runInNewContext(readFileSync(new URL('../dist/multi-select.js', import.meta.url), 'utf8'), { window, document, console });
  const M = window.WorkOSMulti, state = { sel:[] }, changes = [];
  const opts = [['dev', '开发中'], ['live', '在售'], ['eol', '下架封存']];
  const paint = () => { document.getElementById('app').innerHTML = M.html({ scope:'t', key:'status', all:'全部状态', opts, sel:state.sel, lang:'zh' }); };
  M.on('t', (k, v) => { v = JSON.parse(JSON.stringify(v)); changes.push([k, v]); state.sel = v; paint(); });
  paint();
  const click = sel => document.querySelector(sel).dispatchEvent(new window.Event('click', { bubbles:true }));
  const pop = () => document.querySelector('.mf-pop');
  return { M, document, state, changes, click, pop, window };
}

test('one click on a name picks only that value and closes the list', () => {
  const t = load();
  assert.equal(t.document.querySelector('.mf-btn').textContent.trim().startsWith('全部状态'), true);
  t.click('[data-mf-btn]'); assert.equal(t.pop().hasAttribute('hidden'), false, 'opens');
  t.click('[data-mf-one="live"]');
  assert.deepEqual(t.state.sel, ['live']); assert.equal(t.pop().hasAttribute('hidden'), true, 'closes after a single pick');
  assert.match(t.document.querySelector('.mf-btn').textContent, /在售/);
  t.click('[data-mf-btn]'); t.click('[data-mf-one="eol"]');
  assert.deepEqual(t.state.sel, ['eol'], 'a name replaces the selection');
});

test('ticking boxes adds and removes values and keeps the list open; All clears', () => {
  const t = load();
  t.click('[data-mf-btn]'); t.click('[data-mf-tog="dev"]'); t.click('[data-mf-tog="eol"]');
  assert.deepEqual(t.state.sel, ['dev', 'eol']);
  assert.equal(t.pop().hasAttribute('hidden'), false, 'still open for more ticks');
  assert.match(t.document.querySelector('.mf-btn').textContent, /开发中 \+1/); assert.equal(t.document.querySelector('.mf-n').textContent, '2');
  t.click('[data-mf-tog="dev"]'); assert.deepEqual(t.state.sel, ['eol'], 'unticking removes it');
  t.click('[data-mf-all]'); assert.deepEqual(t.state.sel, []); assert.equal(t.pop().hasAttribute('hidden'), true);
  assert.equal(t.M.pass([], 'x'), true); assert.equal(t.M.pass(['a'], 'x'), false); assert.equal(t.M.pass(['a', 'x'], 'x'), true);
});

test('a click outside or Escape closes the list without changing the selection', () => {
  const t = load();
  t.click('[data-mf-btn]'); t.click('#out');
  assert.equal(t.pop().hasAttribute('hidden'), true); assert.equal(t.changes.length, 0);
  t.click('[data-mf-btn]');
  t.document.dispatchEvent(Object.assign(new t.window.Event('keydown', { bubbles:true }), { key:'Escape' }));
  assert.equal(t.pop().hasAttribute('hidden'), true);
});
