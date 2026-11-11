import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../dist/rma.js', import.meta.url), 'utf8');

test('returns: managers can correct the received date in the case detail; dates before 2000 are not offered', () => {
  assert.match(src, /open && c\.canOperate \? `<input type="date" data-rma-received value="\$\{esc\(c\.receivedAt\)\}" min="2000-01-01"/, 'editable for warehouse managers on open cases');
  assert.match(src, /\/update`, \{ receivedAt:el\.value \}/, 'saved through the case update endpoint');
  assert.match(src, /name="receivedAt" type="date" required value="\$\{today\(\)\}" min="2000-01-01"/, 'the register form starts at 2000');
});
