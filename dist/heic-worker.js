/* HEIC / HEIF → JPEG in a background worker (owner, 2026-11-28: every upload accepts iPhone photos).
 * Decodes with libheif (vendor/libheif.js + vendor/libheif.wasm, LGPL-3.0, see vendor/LICENSE-libheif.txt) and encodes
 * with the browser's own JPEG encoder (OffscreenCanvas). Runs on the user's computer: nothing is sent anywhere.
 * Message in: { id, buffer }  →  out: { id, buffer (JPEG) } or { id, error }. Photos are scaled to a 4032 px long edge. */
'use strict';
importScripts('vendor/libheif.js');
const MAX_EDGE = 4032, QUALITY = 0.88;
let ready = null;
function lib() {
  if (!ready) ready = fetch('vendor/libheif.wasm').then(r => { if (!r.ok) throw new Error('decoder ' + r.status); return r.arrayBuffer(); })
    .then(wasmBinary => { const m = self.libheif({ wasmBinary }); return m.ready ? m.ready.then(() => m) : m; });
  return ready;
}
async function convert(buffer) {
  const h = await lib(), decoder = new h.HeifDecoder(), images = decoder.decode(new Uint8Array(buffer));
  try {
    if (!images.length) throw new Error('no image');
    const img = images[0], w = img.get_width(), ht = img.get_height();
    const pixels = await new Promise((ok, no) => img.display({ data:new Uint8ClampedArray(w * ht * 4), width:w, height:ht }, d => d ? ok(d) : no(new Error('decode'))));
    const full = new OffscreenCanvas(w, ht); full.getContext('2d').putImageData(new ImageData(pixels.data, w, ht), 0, 0);
    const k = Math.max(w, ht) / MAX_EDGE, out = k > 1 ? new OffscreenCanvas(Math.round(w / k), Math.round(ht / k)) : full;
    if (out !== full) { const c = out.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(full, 0, 0, out.width, out.height); }
    return await (await out.convertToBlob({ type:'image/jpeg', quality:QUALITY })).arrayBuffer();
  } finally { for (const i of images) i.free?.(); decoder.decoder?.delete?.(); }
}
self.onmessage = async e => {
  const { id, buffer } = e.data || {};
  try { const jpg = await convert(buffer); self.postMessage({ id, buffer:jpg }, [jpg]); }
  catch (err) { self.postMessage({ id, error:String(err && err.message || err) }); }
};
