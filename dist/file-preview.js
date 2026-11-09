/*
 * File preview, for every attachment in WorkOS (window.WorkOSPreview).
 *
 * Clicking a file opens a window over the page instead of downloading it: PDFs and images show directly,
 * text files show their text, video and audio play; other files (Word, Excel, PowerPoint…) say so and offer
 * the download. Download and "open in new tab" are buttons in the window; a module can add its own
 * (for example Delete).
 *
 * Links to the file endpoints below open here by themselves, so a module only needs a plain <a href>.
 * Hold Ctrl / ⌘ / Shift, or add data-no-preview or download to the link, to keep the browser's behaviour.
 * The server lets only WorkOS itself frame these files (deploy/Caddyfile), and the files run no script.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const en = () => (document.documentElement.lang || '').startsWith('en');
  const tr = (zh, e) => en() ? e : zh;
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  // Paths that serve one stored file (after the API base, normally /api).
  const FILE_PATH = /\/(projects\/files\/[^/]+|tasks\/[^/]+\/attachments\/[^/]+|products\/library\/files\/[^/]+|rma\/[^/]+\/photos\/[^/]+|hr\/people\/[^/]+\/documents\/[^/]+|feedback\/[^/]+\/images\/[^/]+)$/;
  const EXT = { pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', txt:'text/plain', csv:'text/csv', md:'text/plain', json:'application/json', log:'text/plain',
    doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip:'application/zip',
    mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4' };
  const MAX_TEXT = 300 * 1024;
  let last = null;

  const mimeFromName = name => EXT[String(name || '').toLowerCase().split('.').pop()] || '';
  function kindOf(mime) {
    const m = String(mime || '').split(';')[0].trim().toLowerCase();
    if (m === 'application/pdf') return 'pdf';
    if (/^image\/(png|jpeg|webp|gif)$/.test(m)) return 'image';
    if (/^text\/(plain|csv)$/.test(m) || m === 'application/json') return 'text';
    if (/^video\/(mp4|webm|quicktime)$/.test(m)) return 'video';
    if (/^audio\//.test(m)) return 'audio';
    return '';
  }
  async function guessMime(url) {
    try { const r = await fetch(url, { method:'HEAD', credentials:'same-origin', cache:'no-store' }); return r.ok ? (r.headers.get('content-type') || '') : ''; } catch { return ''; }
  }

  function close() {
    const el = document.getElementById('wo-preview'); if (!el) return;
    el.remove(); document.removeEventListener('keydown', onKey, true);
    if (last && document.contains(last)) { try { last.focus(); } catch { /* ignore */ } }
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

  /**
   * open({ url, name, mime?, meta?, actions? })
   * actions: [{ label, icon, danger, onClick(close) }] shown before Download.
   */
  async function open(o) {
    if (!o?.url) return;
    close(); last = document.activeElement;
    const name = o.name || tr('文件', 'File');
    const box = document.createElement('div');
    box.id = 'wo-preview'; box.className = 'wo-preview'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', name);
    const extra = (o.actions || []).map((a, i) => `<button type="button" class="btn${a.danger ? ' danger' : ''}" data-wo-preview-act="${i}">${a.icon ? icon(a.icon) + ' ' : ''}${esc(a.label)}</button>`).join('');
    box.innerHTML = `<div class="wo-preview-card">
      <header><div><h2>${esc(name)}</h2>${o.meta ? `<p>${esc(o.meta)}</p>` : ''}</div><button type="button" class="icon-btn" data-wo-preview="close" aria-label="${tr('关闭', 'Close')}">${icon('x')}</button></header>
      <div class="wo-preview-body" data-wo-preview-body><p class="wo-preview-wait">${tr('正在打开…', 'Opening…')}</p></div>
      <footer>${extra}<button type="button" class="btn" data-wo-preview="tab">${icon('arrow-square-out')} ${tr('新窗口打开', 'Open in new tab')}</button>
        <a class="btn primary" href="${esc(o.url)}" download="${esc(name)}" data-no-preview>${icon('download-simple')} ${tr('下载', 'Download')}</a></footer>
    </div>`;
    document.body.appendChild(box);
    document.addEventListener('keydown', onKey, true);
    box.addEventListener('click', e => {
      if (e.target === box || e.target.closest('[data-wo-preview="close"]')) { close(); return; }
      if (e.target.closest('[data-wo-preview="tab"]')) { window.open(o.url, '_blank', 'noopener'); return; }
      const b = e.target.closest('[data-wo-preview-act]');
      if (b) { const a = o.actions[Number(b.dataset.woPreviewAct)]; if (a?.onClick) a.onClick(close); }
    });
    box.querySelector('[data-wo-preview="close"]')?.focus();

    const mime = o.mime || mimeFromName(name) || await guessMime(o.url), kind = kindOf(mime);
    const body = box.querySelector('[data-wo-preview-body]'); if (!body || !document.contains(box)) return;
    const src = esc(o.url);
    if (kind === 'pdf') body.innerHTML = `<iframe src="${src}" title="${esc(name)}"></iframe>`;
    else if (kind === 'image') body.innerHTML = `<img src="${src}" alt="${esc(name)}">`;
    else if (kind === 'video') body.innerHTML = `<video src="${src}" controls preload="metadata"></video>`;
    else if (kind === 'audio') body.innerHTML = `<audio src="${src}" controls preload="metadata"></audio>`;
    else if (kind === 'text') {
      try {
        const r = await fetch(o.url, { credentials:'same-origin', cache:'no-store' }); if (!r.ok) throw new Error();
        const t = await r.text();
        body.innerHTML = `<pre class="wo-preview-text"></pre>${t.length > MAX_TEXT ? `<p class="wo-preview-wait">${tr('文件较大，只显示前面一部分，完整内容请下载。', 'Large file: only the beginning is shown; download it for the rest.')}</p>` : ''}`;
        body.querySelector('pre').textContent = t.slice(0, MAX_TEXT);
      } catch { body.innerHTML = noPreview(tr('文件打不开，可以试试下载。', 'The file could not be opened; try downloading it.')); }
    } else body.innerHTML = noPreview(tr('这种文件（Word / Excel / PPT 等）不能在网页里直接预览，请下载后打开。', 'This kind of file (Word, Excel, PowerPoint…) cannot be shown here; download it to open.'));
  }
  const noPreview = text => `<div class="wo-preview-none">${icon('file')}<p>${esc(text)}</p></div>`;

  // Any link to a stored file opens the preview (unless the person holds a modifier key or the link opts out).
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]'); if (!a || a.hasAttribute('download') || a.hasAttribute('data-no-preview')) return;
    let u; try { u = new URL(a.getAttribute('href'), location.href); } catch { return; }
    if (u.origin !== location.origin || !FILE_PATH.test(u.pathname)) return;
    e.preventDefault();
    open({ url:u.pathname + u.search, name:a.dataset.previewName || a.textContent.trim(), mime:a.dataset.previewMime || '' });
  });

  window.WorkOSPreview = { open, close, kindOf, isFileUrl:path => FILE_PATH.test(String(path || '').split('?')[0]) };
})();
