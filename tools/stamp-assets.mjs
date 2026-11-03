// Sets every ./file?v=… reference in dist/index.html (and the dealer portal's dist/dealer/index.html)
// to a hash of the file's content. The server caches versioned scripts and styles for a year, so the
// version must change whenever the file changes. Run: node tools/stamp-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const dist = resolve(import.meta.dirname, '..', 'dist');
export const pages = [resolve(dist, 'index.html'), resolve(dist, 'dealer', 'index.html')];
export const hashOf = (file, dir = dist) => createHash('sha256').update(readFileSync(resolve(dir, file))).digest('hex').slice(0, 10);
export function stamp(html, dir = dist) { return html.replace(/((?:src|href)="\.\/)([^"?]+\.(?:js|css))\?v=[^"]*"/g, (_, pre, file) => `${pre}${file}?v=${hashOf(file, dir)}"`); }
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  for (const page of pages) {
    const dir = resolve(page, '..'), before = readFileSync(page, 'utf8'), after = stamp(before, dir);
    writeFileSync(page, after);
    console.log(before === after ? `${page}: already up to date` : `${page}: asset versions updated`);
  }
}
