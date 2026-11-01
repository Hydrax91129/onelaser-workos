// Sets every ./file?v=… reference in dist/index.html to a hash of the file's content.
// The server caches versioned scripts and styles for a year, so the version must change
// whenever the file changes. Run: node tools/stamp-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const dist = resolve(import.meta.dirname, '..', 'dist'), indexPath = resolve(dist, 'index.html');
export const hashOf = file => createHash('sha256').update(readFileSync(resolve(dist, file))).digest('hex').slice(0, 10);
export function stamp(html) { return html.replace(/((?:src|href)="\.\/)([^"?]+\.(?:js|css))\?v=[^"]*"/g, (_, pre, file) => `${pre}${file}?v=${hashOf(file)}"`); }
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const before = readFileSync(indexPath, 'utf8'), after = stamp(before);
  writeFileSync(indexPath, after);
  console.log(before === after ? 'index.html already up to date' : 'index.html asset versions updated');
}
