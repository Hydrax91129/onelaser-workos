import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
// Owner, 2026-11-28: “保存修改” is the prominent button on the right, delete on the left, and saving asks in both languages.
test('finance: save on the right after delete, primary, with a bilingual confirmation', () => {
  const src = read('finance.js');
  const row = /<div class="fin-actions fin-save-row">(.*?)<\/div>/.exec(src)[1];
  assert.ok(row.indexOf('data-fin="archive"') < row.indexOf('type="submit"'), 'delete first, save last (right)');
  assert.match(row, /btn primary fin-save/);
  assert.match(src, /少收、不收都是渎职。你确定你填入的信息是准确的吗？\\nAccounts receivable is serious company business/);
});

// Owner, 2026-11-28: HEIC photos are accepted everywhere (converted to JPG in the browser) and files go up to 10 MB.
test('uploads: HEIC hook is loaded, the decoder is bundled, limits are 10 MB', () => {
  const index = read('index.html');
  assert.ok(index.indexOf('heic.js') > -1 && index.indexOf('heic.js') < index.indexOf('upload-zone.js'));
  assert.match(read('heic-worker.js'), /importScripts\('vendor\/libheif\.js'\)/);
  readFileSync(new URL('../dist/vendor/libheif.wasm', import.meta.url));
  for (const f of ['rma.js', 'okr-board.js', 'task-board.js', 'live-app.js', 'feedback.js']) assert.doesNotMatch(read(f), /\b[358] ?\* ?1024 ?\* ?1024\b/, f);
});
