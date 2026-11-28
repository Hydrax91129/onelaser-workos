/* HEIC photos everywhere (owner, 2026-11-28). iPhones save photos as HEIC, which most browsers cannot show and the
 * modules do not accept. This hook sits in front of every upload on the page (file pickers, drag and drop, paste),
 * converts HEIC / HEIF files to JPEG in a background worker (heic-worker.js, on the user's own computer), and then lets
 * the original upload carry on with the JPEG, so every module keeps its own type, size and permission checks unchanged.
 * Pickers that take images also offer .heic files. */
(() => {
  'use strict';
  const lang = () => (window.WorkI18n && window.WorkI18n.lang === 'en') ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const isHeic = f => f && (/^image\/hei[cf](-sequence)?$/i.test(f.type || '') || /\.(heic|heif)$/i.test(f.name || ''));
  const ours = new WeakSet();
  let worker = null, seq = 0; const waiting = new Map();
  function work() {
    if (worker) return worker;
    worker = new Worker('heic-worker.js?v=1');
    worker.onmessage = e => { const p = waiting.get(e.data.id); if (!p) return; waiting.delete(e.data.id); e.data.error ? p.no(new Error(e.data.error)) : p.ok(e.data.buffer); };
    worker.onerror = () => { for (const p of waiting.values()) p.no(new Error('worker')); waiting.clear(); worker = null; };
    return worker;
  }
  async function toJpeg(file) {
    const buffer = await file.arrayBuffer(), id = ++seq;
    const jpg = await new Promise((ok, no) => { waiting.set(id, { ok, no }); work().postMessage({ id, buffer }, [buffer]); });
    return new File([jpg], String(file.name || 'photo').replace(/\.(heic|heif)$/i, '') + '.jpg', { type:'image/jpeg', lastModified:Date.now() });
  }
  /* A small notice at the bottom of the page while photos convert (modules show their own upload progress after). */
  function notice(text, bad) {
    let el = document.getElementById('heic-notice');
    if (!text) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'heic-notice'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;padding:10px 16px;border-radius:10px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.18);max-width:90vw';
      document.body.appendChild(el); }
    el.style.background = bad ? '#fdecea' : '#1f2433'; el.style.color = bad ? '#a8261c' : '#fff'; el.textContent = text;
    if (bad) setTimeout(() => el.remove(), 6000);
  }
  /** Converts the HEIC files in a list; others pass through unchanged. Failed photos are left out with a message. */
  async function fix(files) {
    const list = [...files], n = list.filter(isHeic).length;
    if (!n) return list;
    notice(tr(`正在转换 ${n} 张 HEIC 照片…`, `Converting ${n} HEIC photo${n > 1 ? 's' : ''}…`));
    const out = [], failed = [];
    for (const f of list) {
      if (!isHeic(f)) { out.push(f); continue; }
      try { out.push(await toJpeg(f)); } catch { failed.push(f.name); }
    }
    notice(failed.length ? tr(`无法转换：${failed.join('、')}。请在手机上导出为 JPG 后再上传。`, `Could not convert: ${failed.join(', ')}. Export it as JPG on the phone and try again.`) : '', !!failed.length);
    return out;
  }
  const transfer = files => { const dt = new DataTransfer(); for (const f of files) dt.items.add(f); return dt; };
  const hasHeic = list => !!list && [...list].some(isHeic);

  // File pickers: replace the chosen files and send the change event again.
  window.addEventListener('change', async e => {
    const input = e.target;
    if (ours.has(e) || !(input instanceof HTMLInputElement) || input.type !== 'file' || !hasHeic(input.files)) return;
    e.stopImmediatePropagation();
    const files = await fix(input.files);
    try { input.files = transfer(files).files; } catch { return; }
    if (!files.length) return;
    const again = new Event('change', { bubbles:true }); ours.add(again); input.dispatchEvent(again);
    const inp = new Event('input', { bubbles:true }); ours.add(inp); input.dispatchEvent(inp);
  }, true);
  window.addEventListener('input', e => { const t = e.target; if (!ours.has(e) && t instanceof HTMLInputElement && t.type === 'file' && hasHeic(t.files)) e.stopImmediatePropagation(); }, true);
  // Drag and drop, and paste: hold the event, convert, then deliver the same event with the JPEG files.
  window.addEventListener('drop', async e => {
    if (ours.has(e) || !hasHeic(e.dataTransfer?.files)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const target = e.target, init = { bubbles:true, cancelable:true, clientX:e.clientX, clientY:e.clientY };
    const files = await fix(e.dataTransfer.files); if (!files.length) return;
    const again = new DragEvent('drop', { ...init, dataTransfer:transfer(files) }); ours.add(again); target.dispatchEvent(again);
  }, true);
  window.addEventListener('paste', async e => {
    if (ours.has(e) || !hasHeic(e.clipboardData?.files)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const target = e.target, files = await fix(e.clipboardData.files); if (!files.length) return;
    const again = new ClipboardEvent('paste', { bubbles:true, cancelable:true, clipboardData:transfer(files) }); ours.add(again); target.dispatchEvent(again);
  }, true);
  // Pickers limited to images also list .heic files (on Windows and Android they would otherwise be hidden).
  window.addEventListener('click', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    const acc = input.getAttribute('accept') || '';
    if (/image\//i.test(acc) && !/heic/i.test(acc)) input.setAttribute('accept', acc + ',.heic,.heif,image/heic,image/heif');
  }, true);

  window.WorkOSHeic = { isHeic, toJpeg, fix };
})();
