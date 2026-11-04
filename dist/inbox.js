'use strict';
/* Inbox bell: a red dot with the number of new items (new tasks, progress updates, submissions,
 * reviews, completions, reminders). Clicking an item marks it read and opens the task it is about.
 * Polls /inbox every minute while the page is visible; opening a task clears its items. */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  // Task titles and messages people wrote are shown in the interface language (translate.js).
  const tx = v => window.WorkOSTranslate ? window.WorkOSTranslate.html(v) : esc(v);
  let ctx = null, data = { items:[], unread:0 }, open = false, loading = false, timer = null;
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const KIND = {
    task_new:['clipboard-text', '新任务', 'New task', '#579bfc'], assigned:['clipboard-text', '新任务', 'New task', '#579bfc'],
    task_update:['chat-circle-text', '新进展', 'New update', '#00a86b'], submission:['upload-simple', '成果待验收', 'Awaiting review', '#a25ddc'],
    review_accept:['seal-check', '已验收', 'Accepted', '#00a86b'], review_revise:['arrow-u-up-left', '需要修改', 'Needs changes', '#e2445c'],
    completion:['flag-checkered', '任务已完成', 'Task completed', '#00a86b'], completion_scored:['star', '成果已评分', 'Result scored', '#fdab3d'], nudge:['bell-ringing', '提醒', 'Reminder', '#fdab3d'], okr:['target', 'OKR 提醒', 'OKR reminder', '#fdab3d'],
    hr_reminder:['identification-card', '人事提醒', 'HR reminder', '#fdab3d'],
    it_reminder:['key', 'IT 提醒', 'IT reminder', '#579bfc'],
    quality:['shield-warning', '品质问题', 'Quality issue', '#e2445c'],
  };
  const ago = iso => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 1) return tr('刚刚', 'just now'); if (m < 60) return tr(`${m} 分钟前`, `${m} min ago`); const h = Math.round(m / 60); if (h < 24) return tr(`${h} 小时前`, `${h} h ago`); return tr(`${Math.round(h / 24)} 天前`, `${Math.round(h / 24)} d ago`); };
  const who = i => i.actorNames?.[lang()] || i.actorNames?.zh || i.actorName || '';

  function load() {
    if (!ctx?.api || loading || !ctx.state().actor) return;
    loading = true;
    ctx.api.get('/inbox').then(r => { data = { items:r.items || [], unread:r.unread || 0 }; }).catch(() => {}).finally(() => { loading = false; paint(); });
  }
  function item(i) {
    const k = KIND[i.kind] || KIND.nudge, name = who(i);
    return `<button class="inbox-item ${i.read ? '' : 'unread'}" data-inbox-open="${esc(i.id)}"><span class="inbox-ico" style="--c:${k[3]}"><i class="ph ph-${k[0]}" aria-hidden="true"></i></span><span class="inbox-text"><span class="inbox-line"><b>${tr(k[1], k[2])}</b>${name ? ` · ${esc(name)}` : ''}<em>${ago(i.createdAt)}</em></span>${i.title ? `<strong>${tx(i.title)}</strong>` : ''}${i.body ? `<span class="inbox-body">${tx(String(i.body).slice(0, 140))}</span>` : ''}</span>${i.read ? '' : '<span class="inbox-unread-dot" aria-hidden="true"></span>'}</button>`;
  }
  function html() {
    if (!ctx?.state().actor) return '';
    const n = data.unread, label = n ? tr(`${n} 条新消息`, `${n} new`) : tr('消息', 'Inbox');
    return `<div class="inbox-wrap"><button class="icon-btn inbox-btn ${open ? 'on' : ''}" data-inbox-toggle aria-haspopup="true" aria-expanded="${open}" aria-label="${esc(label)}" title="${esc(label)}"><i class="ph ph-bell" aria-hidden="true"></i>${n ? `<span class="inbox-dot">${n > 99 ? '99+' : n}</span>` : ''}</button>
      ${open ? `<div class="inbox-panel" role="dialog" aria-label="${tr('消息', 'Inbox')}"><div class="inbox-head"><strong>${tr('消息', 'Inbox')}</strong>${n ? `<button class="inbox-link" data-inbox-readall>${tr('全部标为已读', 'Mark all read')}</button>` : ''}</div>
        <div class="inbox-list">${data.items.length ? data.items.map(item).join('') : `<p class="inbox-empty">${tr('最近 30 天没有新消息。', 'Nothing new in the last 30 days.')}</p>`}</div></div>` : ''}</div>`;
  }
  function paint() {
    document.querySelectorAll('.inbox-wrap').forEach(el => { el.outerHTML = html(); });
  }
  async function markRead(ids) {
    const fresh = ids.filter(id => data.items.some(i => i.id === id && !i.read));
    if (!fresh.length) return;
    data.items.forEach(i => { if (fresh.includes(i.id)) i.read = true; });
    data.unread = data.items.filter(i => !i.read).length; paint();
    try { await ctx.api.post('/inbox/read', { ids:fresh }); } catch {}
  }

  document.addEventListener('click', e => {
    if (!ctx) return;
    const t = e.target.closest?.('[data-inbox-toggle],[data-inbox-open],[data-inbox-readall]');
    if (!t) { if (open && !e.target.closest?.('.inbox-panel')) { open = false; paint(); } return; }
    e.preventDefault();
    if (t.matches('[data-inbox-toggle]')) { open = !open; paint(); if (open) load(); return; }
    if (t.matches('[data-inbox-readall]')) { data.items.forEach(i => { i.read = true; }); data.unread = 0; paint(); ctx.api.post('/inbox/read', { all:true }).catch(() => {}); return; }
    const it = data.items.find(i => i.id === t.dataset.inboxOpen); if (!it) return;
    open = false;
    markRead(data.items.filter(i => i.id === it.id || (it.taskId && i.taskId === it.taskId)).map(i => i.id));
    if (it.taskId) ctx.openTask?.(it.taskId);
    else if (it.kind === 'okr') { window.location.hash = '#okr'; }
    else if (it.kind === 'hr_reminder') { window.location.hash = '#hr'; }
    else if (it.kind === 'it_reminder') { window.location.hash = '#it'; }
    else if (it.kind === 'quality') { window.location.hash = '#quality'; if (it.issueId) window.WorkOSQuality?.open(it.issueId); }
    else paint();
  });
  document.addEventListener('keydown', e => { if (open && e.key === 'Escape') { open = false; paint(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });

  window.WorkOSInbox = {
    configure(next) { const first = !ctx; ctx = next; if (first) { load(); timer = setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, 60000); } },
    button: html,
    /** Opening a task from anywhere clears that task's unread items. */
    taskOpened(id) { if (!ctx || !id) return; const ids = data.items.filter(i => i.taskId === id && !i.read).map(i => i.id); if (ids.length) { data.items.forEach(i => { if (ids.includes(i.id)) i.read = true; }); data.unread = data.items.filter(i => !i.read).length; paint(); } ctx.api.post('/inbox/read-task/' + encodeURIComponent(id), {}).catch(() => {}); },
    reset() { data = { items:[], unread:0 }; open = false; if (timer) clearInterval(timer); timer = null; ctx = null; },
    _state: () => ({ data, open }),
  };
})();
