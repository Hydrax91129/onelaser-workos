'use strict';
/* Two buttons in the top bar:
 *   eye  — 需要你处理: things only I can move forward (a result to review, a new task to pick up, rework, reminders).
 *          An item stays here until it is handled, not just read.
 *   bell — 动态: updates for information only (progress, accepted, completed, scores).
 * Clicking an item marks it read and opens the task it is about.
 * Polls /inbox every minute while the page is visible; opening a task clears its items. */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  // Task titles and messages people wrote are shown in the interface language (translate.js).
  const tx = v => window.WorkOSTranslate ? window.WorkOSTranslate.html(v) : esc(v);
  /* Supply-chain notices are written in Chinese by the server (scm.ts); English readers get the same facts in English. */
  const SYS = [
    [/^采购单草稿：(.*)$/, m => `Draft purchase order: ${m[1]}`], [/^采购单已下达生产：(.*)$/, m => `Purchase order in production: ${m[1]}`], [/^到港入仓：(.*)$/, m => `Arrival to receive: ${m[1]}`],
    [/^(.*) · (\d+) 个 SKU、(\d+) 件 · 预计交期 (\S+?)。/, m => `${m[1]} · ${m[2]} SKUs, ${m[3]} units · expected ${m[4]}. Review it in Supply chain → Purchase orders and click “Issue” once the factory confirms.`],
    [/^(.*) · 预计交期 (\S+?)。$/, m => `${m[1]} · expected ${m[2]}.`],
    [/^(\d+) 个 SKU、(\d+) 件已到港/, m => `${m[1]} SKUs, ${m[2]} units at port. Confirm the quantity and bin of each line in Inventory → Arrivals.`],
  ];
  const sysText = (i, v) => { if (lang() !== 'en' || !['scm_order', 'wms_arrival'].includes(i.kind)) return null; for (const [re, f] of SYS) { const m = re.exec(String(v || '')); if (m) return esc(f(m)); } return null; };
  let ctx = null, data = { items:[], unread:0 }, open = null, loading = false, timer = null; // open: null | 'action' | 'update'
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const KIND = {
    task_new:['clipboard-text', '新任务', 'New task', '#579bfc'], assigned:['clipboard-text', '新任务', 'New task', '#579bfc'],
    task_update:['chat-circle-text', '新进展', 'New update', '#00a86b'], submission:['upload-simple', '成果待验收', 'Awaiting review', '#a25ddc'],
    review_accept:['seal-check', '已验收', 'Accepted', '#00a86b'], review_revise:['arrow-u-up-left', '需要修改', 'Needs changes', '#e2445c'], auto_accept:['clock-countdown', '3 天未验收，已自动通过', 'Auto-accepted after 3 days', '#00a86b'],
    completion:['flag-checkered', '任务已完成', 'Task completed', '#00a86b'], completion_scored:['star', '成果已评分', 'Result scored', '#fdab3d'], nudge:['bell-ringing', '提醒', 'Reminder', '#fdab3d'], okr:['target', 'OKR 提醒', 'OKR reminder', '#fdab3d'],
    hr_reminder:['identification-card', '人事提醒', 'HR reminder', '#fdab3d'],
    it_reminder:['key', 'IT 提醒', 'IT reminder', '#579bfc'],
    quality:['shield-warning', '品质问题', 'Quality issue', '#e2445c'],
    scm_order:['clipboard-text', '采购单', 'Purchase order', '#579bfc'], wms_arrival:['boat', '到港入仓', 'Arrival', '#00a86b'],
  };
  const ago = iso => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 1) return tr('刚刚', 'just now'); if (m < 60) return tr(`${m} 分钟前`, `${m} min ago`); const h = Math.round(m / 60); if (h < 24) return tr(`${h} 小时前`, `${h} h ago`); return tr(`${Math.round(h / 24)} 天前`, `${Math.round(h / 24)} d ago`); };
  const who = i => i.actorNames?.[lang()] || i.actorNames?.zh || i.actorName || '';

  function load() {
    if (!ctx?.api || loading || !ctx.state().actor) return;
    loading = true;
    ctx.api.get('/inbox').then(r => { data = { items:r.items || [], unread:r.unread || 0 }; }).catch(() => {}).finally(() => { loading = false; paint(); });
  }
  const CTA = { submission:['去验收', 'Review'], completion:['去验收', 'Review'], task_new:['去领取', 'Pick up'], assigned:['去领取', 'Pick up'], review_revise:['去修改', 'Rework'] };
  const isAction = i => i.action === true || (i.action === undefined && ['submission', 'nudge', 'okr', 'hr_reminder', 'it_reminder', 'quality', 'task_new', 'assigned', 'review_revise'].includes(i.kind));
  const REMINDER = ['nudge', 'okr', 'hr_reminder', 'it_reminder', 'quality'];
  const isDone = i => i.done !== undefined ? i.done : REMINDER.includes(i.kind) ? i.read : false;
  const actions = () => data.items.filter(i => isAction(i) && !isDone(i));
  const updates = () => data.items.filter(i => !isAction(i));
  const updatesUnread = () => updates().filter(i => !i.read).length;
  function item(i) {
    const k = KIND[i.kind] || KIND.nudge, name = who(i), cta = isAction(i) ? (CTA[i.kind] || ['去处理', 'Open']) : null;
    return `<button class="inbox-item ${i.read ? '' : 'unread'} ${cta ? 'act' : ''}" data-inbox-open="${esc(i.id)}"><span class="inbox-ico" style="--c:${k[3]}"><i class="ph ph-${k[0]}" aria-hidden="true"></i></span><span class="inbox-text"><span class="inbox-line"><b>${tr(k[1], k[2])}</b>${name ? ` · ${esc(name)}` : ''}<em>${ago(i.createdAt)}</em></span>${i.title ? `<strong>${sysText(i, i.title) || tx(i.title)}</strong>` : ''}${i.body ? `<span class="inbox-body">${sysText(i, i.body) || tx(String(i.body).slice(0, 140))}</span>` : ''}${cta ? `<span class="inbox-cta">${tr(cta[0], cta[1])} →</span>` : ''}</span>${i.read ? '' : '<span class="inbox-unread-dot" aria-hidden="true"></span>'}</button>`;
  }
  function html() {
    if (!ctx?.state().actor) return '';
    const a = actions().length, u = updatesUnread();
    const btn = (mode, icon, n, zh, en, cls) => { const label = n ? tr(`${zh} ${n}`, `${en} ${n}`) : tr(zh, en);
      return `<button class="icon-btn inbox-btn ${cls} ${open === mode ? 'on' : ''}" data-inbox-toggle="${mode}" aria-haspopup="true" aria-expanded="${open === mode}" aria-label="${esc(label)}" title="${esc(label)}"><i class="ph ph-${icon}" aria-hidden="true"></i>${n ? `<span class="inbox-dot">${n > 99 ? '99+' : n}</span>` : ''}</button>`; };
    const list = open === 'action' ? actions() : updates();
    const panel = !open ? '' : `<div class="inbox-panel ${open}" role="dialog" aria-label="${open === 'action' ? tr('需要你处理', 'Needs you') : tr('动态', 'Updates')}">
      <div class="inbox-head"><strong>${open === 'action' ? `<i class="ph ph-eye" aria-hidden="true"></i> ${tr('需要你处理', 'Needs you')}` : `<i class="ph ph-bell" aria-hidden="true"></i> ${tr('动态', 'Updates')}`}</strong>${open === 'update' && u ? `<button class="inbox-link" data-inbox-readall>${tr('全部标为已读', 'Mark all read')}</button>` : ''}</div>
      ${open === 'action' ? `<p class="inbox-sub">${tr('验收成果、领取新任务、按意见修改、催办和提醒。处理完会自动消失。', 'Results to review, new tasks to pick up, rework, reminders. Each one disappears once handled.')}</p>` : `<p class="inbox-sub">${tr('进展、验收结果、完成和评分，只需知道，不用回复。', 'Progress, review results, completions and scores. For information only.')}</p>`}
      <div class="inbox-list">${list.length ? list.map(item).join('') : `<p class="inbox-empty">${open === 'action' ? tr('没有需要你处理的事。', 'Nothing needs you right now.') : tr('最近 30 天没有新动态。', 'No updates in the last 30 days.')}</p>`}</div></div>`;
    return `<div class="inbox-wrap">${btn('action', 'eye', a, '需要你处理', 'Needs you', 'act')}${btn('update', 'bell', u, '动态', 'Updates', '')}${panel}</div>`;
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
    if (!t) { if (open && !e.target.closest?.('.inbox-panel')) { open = null; paint(); } return; }
    e.preventDefault();
    if (t.matches('[data-inbox-toggle]')) { const m = t.dataset.inboxToggle || 'update'; open = open === m ? null : m; paint(); if (open) load(); return; }
    if (t.matches('[data-inbox-readall]')) { const ids = updates().filter(i => !i.read).map(i => i.id); ids.length && markRead(ids); return; }
    const it = data.items.find(i => i.id === t.dataset.inboxOpen); if (!it) return;
    open = null;
    markRead(data.items.filter(i => i.id === it.id || (it.taskId && i.taskId === it.taskId)).map(i => i.id));
    if (it.taskId) ctx.openTask?.(it.taskId);
    else if (it.kind === 'okr') { window.location.hash = '#okr'; }
    else if (it.kind === 'hr_reminder') { window.location.hash = '#hr'; }
    else if (it.kind === 'it_reminder') { window.location.hash = '#it'; }
    else if (it.kind === 'quality') { window.location.hash = '#quality'; if (it.issueId) window.WorkOSQuality?.open(it.issueId); }
    else paint();
  });
  document.addEventListener('keydown', e => { if (open && e.key === 'Escape') { open = null; paint(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });

  window.WorkOSInbox = {
    configure(next) { const first = !ctx; ctx = next; if (first) { load(); timer = setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, 60000); } },
    button: html,
    /** Opening a task from anywhere clears that task's unread items. */
    taskOpened(id) { if (!ctx || !id) return; const ids = data.items.filter(i => i.taskId === id && !i.read).map(i => i.id); if (ids.length) { data.items.forEach(i => { if (ids.includes(i.id)) i.read = true; }); data.unread = data.items.filter(i => !i.read).length; paint(); } ctx.api.post('/inbox/read-task/' + encodeURIComponent(id), {}).catch(() => {}); },
    reset() { data = { items:[], unread:0 }; open = null; if (timer) clearInterval(timer); timer = null; ctx = null; },
    _state: () => ({ data, open }),
  };
})();
