import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 撤销 (owner, 2026-11-28): the movement log shows an Undo button when the server allows it and marks undone entries.
test('WMS log: undo button follows canUndo, undone entries are marked, undo reasons translate', () => {
  const src = readFileSync(new URL('../dist/wms.js', import.meta.url), 'utf8');
  assert.match(src, /m\.canUndo \? `<button class="wms-link wms-undo" data-wms="undo"/);
  assert.match(src, /\/wms\/movements\/\$\{encodeURIComponent\(id\)\}\/undo/);
  assert.match(src, /已撤销/);
  assert.match(src, /\(\?:撤销：\|Undo: \)/);
});

// 库存货值 (owner, 2026-11-28): MSRP or landed-cost value bar, only when the server sends values (approvers, main admins).
test('WMS value bar: only with values from the server, switch between MSRP and landed cost', () => {
  const src = readFileSync(new URL('../dist/wms.js', import.meta.url), 'utf8');
  assert.match(src, /const V = data\.values; if \(!V\) return '';/);
  assert.match(src, /data-wms="value-by" data-v="\$\{k\}"/);
  assert.match(src, /\['msrp', tr\('按 MSRP', 'By MSRP'\)\], \['landed', tr\('按到岸价', 'By landed cost'\)\]/);
});
