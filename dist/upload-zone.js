/*
 * WorkOSUpload — one upload box for every module. A box takes files four ways at once:
 *   1. paste (Ctrl/⌘ + V) a file or a screenshot while the box, or the dialog/section it sits in, is in use
 *   2. drag files onto it
 *   3. click anywhere on it to choose files
 *   4. the "Upload" button inside it
 * It checks type and size, names pasted screenshots, and hands the accepted File objects to your callback.
 * It never stores or sends anything itself, so each module keeps its own API and permissions.
 *
 *   html:  WorkOSUpload.html({ id:'hr-doc', lang:'zh', accept:['application/pdf','image/png'], multiple:true, maxBytes:10*1024*1024, hint:'…' })
 *   wire:  WorkOSUpload.register('hr-doc', { accept, maxBytes, multiple, lang, onFiles: async files => { … } })
 *   state: WorkOSUpload.status('hr-doc', 'Uploading…') / WorkOSUpload.status('hr-doc', 'Too big', true)
 *
 * The box can be re-rendered freely (events are delegated on document). Wrap the area that should catch pastes in
 * an element with data-upload-scope="<id>"; when only one box is on screen, pastes anywhere outside a text field go to it.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const boxes = new Map();
  const T = {
    zh:{ drop:'把文件拖到这里、直接粘贴（Ctrl/⌘ + V），或点击选择', button:'上传', type:'不支持这种文件：', big:'超过大小上限：', one:'一次只能上传一个文件，已取第一个。', busy:'正在上传…', pasted:'截图' },
    en:{ drop:'Drag files here, paste (Ctrl/⌘ + V), or click to choose', button:'Upload', type:'File type not allowed: ', big:'Too large: ', one:'Only one file at a time; the first one was used.', busy:'Uploading…', pasted:'screenshot' },
  };
  const t = (lang, k) => (T[lang] || T.zh)[k];
  const mb = n => (n / 1048576).toFixed(n < 1048576 ? 1 : 0) + ' MB';

  function html({ id, lang = 'zh', accept = [], multiple = true, maxBytes = 0, hint = '', label = '' }) {
    const limits = [hint, maxBytes ? `≤ ${mb(maxBytes)}` : ''].filter(Boolean).join(' · ');
    return `<div class="up-zone" data-upload-zone="${esc(id)}" tabindex="0" role="button" aria-label="${esc(label || t(lang, 'drop'))}">
      <i class="ph ph-upload-simple" aria-hidden="true"></i>
      <span class="up-text"><b>${esc(label || t(lang, 'drop'))}</b>${limits ? `<small>${esc(limits)}</small>` : ''}</span>
      <button type="button" class="btn up-pick" data-upload-pick="${esc(id)}">${esc(t(lang, 'button'))}</button>
      <input type="file" hidden data-upload-input="${esc(id)}" ${multiple ? 'multiple' : ''} ${accept.length ? `accept="${esc(accept.join(','))}"` : ''}>
      <p class="up-msg" data-upload-msg="${esc(id)}" role="status" aria-live="polite"></p></div>`;
  }
  function register(id, opts) { boxes.set(id, { lang:'zh', accept:[], multiple:true, maxBytes:0, ...opts }); }
  function status(id, text, isError = false) {
    const el = document.querySelector(`[data-upload-msg="${id}"]`); if (!el) return;
    el.textContent = text || ''; el.classList.toggle('err', !!isError);
    el.closest('[data-upload-zone]')?.classList.toggle('busy', !!text && !isError && text === t(boxes.get(id)?.lang, 'busy'));
  }
  /** Pasted screenshots arrive as "image.png" (or without a name): give them a dated, readable name. */
  function named(file, lang) {
    if (file.name && file.name !== 'image.png') return file;
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg'), d = new Date(), p = n => String(n).padStart(2, '0');
    return new File([file], `${t(lang, 'pasted')}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`, { type:file.type });
  }
  async function take(id, list) {
    const box = boxes.get(id); if (!box || box.busy) return;
    let files = [...(list || [])].filter(Boolean).map(f => named(f, box.lang));
    if (!files.length) return;
    const problems = [];
    if (!box.multiple && files.length > 1) { problems.push(t(box.lang, 'one')); files = files.slice(0, 1); }
    files = files.filter(f => {
      if (box.accept.length && !box.accept.includes(f.type)) { problems.push(t(box.lang, 'type') + f.name); return false; }
      if (box.maxBytes && f.size > box.maxBytes) { problems.push(t(box.lang, 'big') + f.name); return false; }
      return true;
    });
    status(id, problems.join(' '), problems.length > 0);
    if (!files.length) return;
    box.busy = true; if (!problems.length) status(id, t(box.lang, 'busy'));
    try { const note = await box.onFiles(files); if (!problems.length) status(id, typeof note === 'string' ? note : ''); }
    catch (e) { status(id, e?.message || String(e), true); }
    finally { box.busy = false; document.querySelector(`[data-upload-zone="${id}"]`)?.classList.remove('busy'); const input = document.querySelector(`[data-upload-input="${id}"]`); if (input) input.value = ''; }
  }
  const pick = id => document.querySelector(`[data-upload-input="${id}"]`)?.click();
  const zoneOf = el => el?.closest?.('[data-upload-zone]');
  const typing = el => !!el?.closest?.('input:not([type=file]),textarea,select,[contenteditable="true"]');

  document.addEventListener('click', e => {
    const btn = e.target.closest?.('[data-upload-pick]');
    if (btn) { e.preventDefault(); pick(btn.dataset.uploadPick); return; }
    const z = zoneOf(e.target);
    if (z && !e.target.closest('input,button,a,select')) pick(z.dataset.uploadZone);
  });
  document.addEventListener('keydown', e => {
    const z = e.target?.matches?.('[data-upload-zone]') ? e.target : null;
    if (z && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(z.dataset.uploadZone); }
  });
  document.addEventListener('change', e => { const id = e.target?.dataset?.uploadInput; if (id) take(id, e.target.files); });
  ['dragenter', 'dragover'].forEach(type => document.addEventListener(type, e => {
    const z = zoneOf(e.target); if (!z || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; z.classList.add('over');
  }));
  document.addEventListener('dragleave', e => { const z = zoneOf(e.target); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  document.addEventListener('drop', e => {
    const z = zoneOf(e.target); if (!z) return;
    e.preventDefault(); z.classList.remove('over'); take(z.dataset.uploadZone, e.dataTransfer?.files);
  });
  document.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])]; if (!files.length) return;
    const target = e.target?.nodeType === 1 ? e.target : document.activeElement;
    let z = zoneOf(target);
    if (!z) { const scope = target?.closest?.('[data-upload-scope]'); if (scope) z = scope.querySelector(`[data-upload-zone="${scope.dataset.uploadScope}"]`) || scope.querySelector('[data-upload-zone]'); }
    if (!z && !typing(target)) { const all = [...document.querySelectorAll('[data-upload-zone]')]; if (all.length === 1) z = all[0]; }
    if (!z || !boxes.has(z.dataset.uploadZone)) return;
    e.preventDefault(); take(z.dataset.uploadZone, files);
  });

  window.WorkOSUpload = { html, register, status, take };
})();
