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
