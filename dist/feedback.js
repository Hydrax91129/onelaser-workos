/*
 * "Bug 与建议" — a prominent button in the top bar opens a small form: type a few words and
 * paste, drag in or pick screenshots. Notes are stored (admins read them on the Feedback page)
 * and emailed to the feedback inbox when email is configured on the server.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  const MAX_IMAGES = 6, MAX_BYTES = 3 * 1024 * 1024, TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  let ctx = null, images = [], sending = false, lastFocus = null, list = null, listLoading = false, listError = '';
  const tr = (zh, en) => (ctx?.lang?.() === 'en' ? en : zh);

  /* Version badge: the full release list lives in changelog.js (WorkOSChangelog.RELEASES); every release is kept. */
  function versionChip() {
    const list = window.WorkOSChangelog?.RELEASES || [];
    if (!list.length) return '';
    const txt = v => window.WorkOSChangelog.text(v), when = iso => window.WorkOSChangelog.when?.(iso) || '';
    const v = list[0].version; // this build's own version: the newest entry ships with it
    // The detailed release page is for the company owner only; everyone else gets the short list here.
    const owner = ctx?.state?.()?.actor?.executiveAccess === true;
    return `<button type="button" class="fb-ver" ${owner ? 'data-live-page="changelog"' : ''} aria-label="${tr(`当前版本 v${v}`, `Version v${v}`)}">v${esc(v)}<span class="fb-ver-pop" role="tooltip"><b>${tr('更新说明', 'Release notes')}</b>${list.map(r => `<span class="fb-ver-row"><em>v${esc(r.version)}</em><span>${esc(txt(r.title || r.short))}<i>${esc(when(r.date))}</i></span></span>`).join('')}${owner ? `<small>${tr('点击版本号查看详细说明', 'Click the version for full notes')}</small>` : ''}</span></button>`;
  }
  function configure(next) { ctx = next; }
  function button() { return `<button class="fb-btn" data-feedback-open title="${tr('报告问题或提建议，直接发给管理员', 'Report a bug or suggest an improvement')}">${icon('bug')}<span>${tr('Bug 与建议', 'Bug & ideas')}</span></button>${versionChip()}`; }
  function root() { let el = document.getElementById('feedback-root'); if (!el) { el = document.createElement('div'); el.id = 'feedback-root'; document.body.appendChild(el); } return el; }
  function thumbs() {
    return images.map((im, i) => `<figure class="fb-thumb"><img src="${im.url}" alt="${esc(im.name)}"><button type="button" data-feedback-remove="${i}" aria-label="${tr('移除这张图', 'Remove this image')}">${icon('x')}</button></figure>`).join('');
  }
  function paint(error = '') {
    root().innerHTML = `<div class="fb-backdrop" data-feedback-close></div><section class="fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-title">
      <header><h2 id="fb-title">${icon('bug')} ${tr('Bug 与建议', 'Bug & ideas')}</h2><button class="fb-x" data-feedback-close aria-label="${tr('关闭', 'Close')}">${icon('x')}</button></header>
      <form id="fb-form">
        <label class="fb-label" for="fb-text">${tr('遇到什么问题，或者有什么建议？', 'What went wrong, or what would you improve?')}</label>
        <textarea id="fb-text" name="body" maxlength="5000" rows="5" placeholder="${tr('例如：在“库存管理”点“导入期初库存”后没反应。可以直接 Ctrl/⌘ + V 粘贴截图。', 'e.g. “Import opening stock” does nothing on the Inventory page. You can paste screenshots with Ctrl/⌘ + V.')}">${esc(document.getElementById('fb-text')?.value || '')}</textarea>
        <div class="fb-drop" data-feedback-drop tabindex="0" role="button" aria-label="${tr('添加截图', 'Add screenshots')}">${icon('image')}<span>${tr('把截图拖到这里、直接粘贴，或', 'Drag screenshots here, paste them, or')} <b>${tr('点击选择图片', 'click to choose')}</b></span><small>${tr(`最多 ${MAX_IMAGES} 张，每张不超过 3MB`, `Up to ${MAX_IMAGES} images, 3 MB each`)}</small><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden data-feedback-file></div>
        ${images.length ? `<div class="fb-thumbs">${thumbs()}</div>` : ''}
        <p class="fb-meta">${icon('info')} ${tr('会一起附上你的名字和当前页面，方便我们定位问题。', 'Your name and the current page are attached so we can find the problem.')}</p>
        <p class="fb-error" role="alert">${esc(error)}</p>
      </form>
      <footer><button class="btn" data-feedback-close>${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="fb-form" ${sending ? 'disabled' : ''}>${icon('paper-plane-tilt')} ${sending ? tr('发送中…', 'Sending…') : tr('提交', 'Send')}</button></footer>
    </section>`;
  }
  function open() { lastFocus = document.activeElement; images = []; root().innerHTML = ''; paint(); document.getElementById('fb-text')?.focus(); }
  function close() { images = []; root().innerHTML = ''; lastFocus?.focus?.(); }
  const isOpen = () => !!document.querySelector('#feedback-root .fb-dialog');
  function readFile(file) {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
  }
  async function add(files) {
    const keep = document.getElementById('fb-text')?.value || '';
    let error = '';
    for (const f of files) {
      if (!TYPES.includes(f.type)) { error = tr('只支持 PNG、JPG、GIF、WebP 图片。', 'Only PNG, JPG, GIF and WebP images.'); continue; }
      if (f.size > MAX_BYTES) { error = tr(`“${f.name || '图片'}”超过 3MB。`, `“${f.name || 'image'}” is over 3 MB.`); continue; }
      if (images.length >= MAX_IMAGES) { error = tr(`最多 ${MAX_IMAGES} 张图片。`, `Up to ${MAX_IMAGES} images.`); break; }
      try { images.push({ name:f.name || `screenshot-${images.length + 1}.png`, type:f.type, data:await readFile(f), url:'' }); images[images.length - 1].url = `data:${f.type};base64,${images[images.length - 1].data}`; }
      catch { error = tr('图片读取失败，请再试一次。', 'Could not read the image; try again.'); }
    }
    paint(error); const t = document.getElementById('fb-text'); if (t) { t.value = keep; }
  }

  document.addEventListener('click', e => {
    if (e.target.closest?.('[data-feedback-open]')) { e.preventDefault(); return open(); }
    if (!isOpen()) return;
    if (e.target.closest?.('[data-feedback-close]')) { e.preventDefault(); return close(); }
    const rm = e.target.closest?.('[data-feedback-remove]');
    if (rm) { e.preventDefault(); const keep = document.getElementById('fb-text')?.value || ''; images.splice(Number(rm.dataset.feedbackRemove), 1); paint(); document.getElementById('fb-text').value = keep; return; }
    if (e.target.closest?.('[data-feedback-drop]') && !e.target.matches('input')) document.querySelector('[data-feedback-file]')?.click();
  });
  document.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') close();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-feedback-drop]')) { e.preventDefault(); document.querySelector('[data-feedback-file]')?.click(); }
  });
  document.addEventListener('change', e => { if (e.target.matches?.('[data-feedback-file]')) { add([...e.target.files]); e.target.value = ''; } });
  document.addEventListener('paste', e => {
    if (!isOpen()) return;
    const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); add(files); }
  });
  ['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { const d = e.target.closest?.('[data-feedback-drop]'); if (d) { e.preventDefault(); d.classList.add('on'); } }));
  document.addEventListener('dragleave', e => { e.target.closest?.('[data-feedback-drop]')?.classList.remove('on'); });
  document.addEventListener('drop', e => { const d = e.target.closest?.('[data-feedback-drop]'); if (!d) return; e.preventDefault(); d.classList.remove('on'); add([...(e.dataTransfer?.files || [])]); });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'fb-form') return; e.preventDefault();
    const body = e.target.body.value.trim();
    if (!body && !images.length) { paint(tr('请写几句说明，或者加一张截图。', 'Write a few words or add a screenshot.')); return; }
    sending = true; paint(); document.getElementById('fb-text').value = body;
    try {
      const r = await ctx.api.post('/feedback', { body, page:ctx.state?.().page || location.hash.slice(1), images:images.map(({ name, type, data }) => ({ name, type, data })) });
      sending = false; close();
      ctx.toast?.(r.emailed ? tr('已提交，已发到管理员邮箱。谢谢！', 'Sent to the admin inbox. Thank you!') : tr('已提交，管理员会在“Bug 与建议”里看到。谢谢！', 'Submitted; admins will see it under Bug & ideas. Thank you!'));
      list = null;
    } catch (x) { sending = false; paint(x.message || tr('提交失败，请稍后再试。', 'Could not send; try again later.')); document.getElementById('fb-text').value = body; }
  });

  /* Admin page: every note, newest first, with its screenshots. */
  async function loadList() {
    if (listLoading) return; listLoading = true;
    try { list = await ctx.api.get('/feedback'); listError = ''; } catch (x) { listError = x.message || tr('读取失败', 'Could not load'); }
    finally { listLoading = false; ctx.rerender(); }
  }
  function page() {
    if (!list && !listError) { loadList(); return `<div class="fb-page"><p class="fb-meta">${tr('正在读取…', 'Loading…')}</p></div>`; }
    if (listError && !list) return `<div class="fb-page"><div class="fb-error">${esc(listError)}</div></div>`;
    const open_ = list.items.filter(x => x.status !== 'done').length;
    return `<div class="fb-page"><div class="page-heading"><div><div class="eyebrow">WORK OS · FEEDBACK</div><h1>${tr('Bug 与建议', 'Bug & ideas')}</h1><p>${tr(`员工通过右上角“Bug 与建议”提交的内容。未处理 ${open_} 条。`, `Notes sent with the “Bug & ideas” button. ${open_} open.`)}</p></div></div>
      ${list.emailConfigured ? `<div class="fb-note ok">${icon('envelope-simple')} ${tr(`每条提交也会发到 ${esc(list.to)}。`, `Every note is also emailed to ${esc(list.to)}.`)}</div>` : `<div class="fb-note">${icon('warning')} ${tr(`邮件发送还没开通，所以目前只保存在这里。开通方法：在 Render 的环境变量里填 RESEND_API_KEY 和 EMAIL_FROM，之后每条提交会自动发到 ${esc(list.to)}。`, `Email is not configured yet, so notes are kept here only. Set RESEND_API_KEY and EMAIL_FROM on Render to email them to ${esc(list.to)}.`)}</div>`}
      <div class="fb-list">${list.items.map(x => `<article class="fb-item ${x.status === 'done' ? 'done' : ''}"><header><strong>${esc(x.display_name || x.user_id)}</strong><span>${esc(new Date(x.created_at).toLocaleString(ctx.lang() === 'en' ? 'en-US' : 'zh-CN'))}${x.page ? ` · ${esc(x.page)}` : ''}${x.emailed ? ` · ${tr('已发邮件', 'emailed')}` : ''}</span><button class="btn small" data-feedback-status="${esc(x.id)}" data-v="${x.status === 'done' ? 'new' : 'done'}">${x.status === 'done' ? tr('标为未处理', 'Reopen') : tr('标为已处理', 'Mark done')}</button></header>
        ${x.body ? `<p>${esc(x.body)}</p>` : ''}${x.image_count ? `<div class="fb-thumbs">${Array.from({ length:x.image_count }, (_, i) => `<a class="fb-thumb" href="/api/feedback/${encodeURIComponent(x.id)}/images/${i}" target="_blank" rel="noopener"><img src="/api/feedback/${encodeURIComponent(x.id)}/images/${i}" alt="${tr('截图', 'Screenshot')} ${i + 1}" loading="lazy"></a>`).join('')}</div>` : ''}</article>`).join('') || `<p class="fb-meta">${tr('还没有人提交。', 'Nothing yet.')}</p>`}</div></div>`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-feedback-status]'); if (!b || !ctx) return; e.preventDefault();
    try { await ctx.api.post('/feedback/' + encodeURIComponent(b.dataset.feedbackStatus) + '/status', { status:b.dataset.v }); list = null; loadList(); } catch (x) { ctx.toast?.(x.message); }
  });

  window.WorkOSFeedback = { configure, button, page, reset() { list = null; listError = ''; } };
})();
