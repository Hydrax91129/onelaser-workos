import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashOf, stamp } from '../tools/stamp-assets.mjs';

const html = readFileSync(resolve(import.meta.dirname, '..', 'dist', 'index.html'), 'utf8');

test('every versioned script and style carries the hash of its current content (run node tools/stamp-assets.mjs)', () => {
  const refs = [...html.matchAll(/(?:src|href)="\.\/([^"?]+\.(?:js|css))\?v=([^"]*)"/g)];
  assert.ok(refs.length > 20);
  for (const [, file, v] of refs) assert.equal(v, hashOf(file), `${file} changed without a new version`);
  assert.equal(stamp(html), html);
});

test('the dealer portal page versions its own script and style too', async () => {
  const { pages } = await import('../tools/stamp-assets.mjs');
  const dealer = readFileSync(pages[1], 'utf8'), dir = resolve(pages[1], '..');
  const refs = [...dealer.matchAll(/(?:src|href)="\.\/([^"?]+\.(?:js|css))\?v=([^"]*)"/g)];
  assert.deepEqual(refs.map(r => r[1]).sort(), ['dealer.css', 'dealer.js']);
  for (const [, file, v] of refs) assert.equal(v, hashOf(file, dir), `dealer/${file} changed without a new version`);
  assert.doesNotMatch(dealer, /live-app\.js|api-client\.js/, 'the dealer page loads no employee code');
});
