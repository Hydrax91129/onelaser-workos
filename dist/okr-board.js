'use strict';
/* Feishu-style OKR workspace.
 *
 * Layout: cycle switcher + tabs (My OKRs / Team OKRs / Alignment), a people
 * list, objective cards with nested key results, inline creation and editing,
 * and a detail drawer with alignment and a progress-update timeline.
 *
 * Scoring is unchanged: KR self evaluation + manager confirmation (0-100),
 * opened through the existing live-app dialogs. Editing, archiving, alignment,
 * KR status and progress updates need the backend capability
 * `okrCollaboration`; without it those controls are hidden.
 */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  // User-written OKR text is shown in the interface language (see translate.js); the original stays one click away.
  const tx = v => window.WorkOSTranslate ? window.WorkOSTranslate.html(v) : esc(v), txt = v => window.WorkOSTranslate ? window.WorkOSTranslate.text(v) : String(v ?? '');
  const STATUS = [
    ['on_track', '正常', 'On track'],
    ['at_risk', '有风险', 'At risk'],
    ['off_track', '已延期', 'Off track'],
  ];
  let ctx = null;
  const ui = { tab:'mine', person:null, cycle:null, search:'', editing:null, adding:null, menu:null, confirm:null, drawer:null, updates:new Map(), busy:false, collapsed:new Set(), weighting:null, wDraft:{}, ai:{ text:'', busy:false, error:'', note:'' }, removing:new Map(), deferRender:false };

  const S = () => ctx.state();
  const lang = () => ctx.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const collab = () => S().capabilities?.okrCollaboration === true;
  const me = () => S().actor;
  const isManager = () => me()?.role === 'manager';
  const ownerName = id => { const o = S().objectives.find(x => x.owner_id === id && (x.owner_name_zh || x.owner_name_en || x.owner_name)); return o ? (lang() === 'en' ? o.owner_name_en || o.owner_name_zh || o.owner_name : o.owner_name_zh || o.owner_name_en || o.owner_name) : ''; };
  const nameOf = id => id ? (S().directory.find(u => u.id === id)?.display_name || (orgChart || []).find(u => u.id === id)?.display_name || (me()?.id === id ? me().display_name : '') || ownerName(id) || id) : tr('公司','Company');
  const initials = id => { const n = nameOf(id).trim(); return /^[\x00-\x7f]+$/.test(n) ? n.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() : n.slice(-2); };
  const hue = id => { let h = 0; for (const c of String(id || 'company')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const avatar = (id, size = 28) => `<span class="okb-avatar" style="--okb-h:${hue(id)};width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px" aria-hidden="true">${esc(initials(id))}</span>`;
  const icon = (name) => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
  /* Final publish: once an owner publishes a month's OKR, only their leader may change it. */
  const pubs = new Map();
  function publication(ownerId, period) {
    if (!period || !ownerId || S().capabilities?.okrPublish !== true) return null;
    if (!pubs.has(period)) { pubs.set(period, null); ctx.api.get('/okr/publications?period=' + period).then(r => { pubs.set(period, new Map((r.items || []).map(x => [x.ownerId, x]))); rerender(); }).catch(() => pubs.set(period, new Map())); }
    return pubs.get(period)?.get(ownerId) || null;
  }
  const leaderOf = ownerId => { if (!ownerId || ownerId === me()?.id) return false; const u = [...(orgChart || []), ...S().directory].find(x => x.id === ownerId); return me()?.isAdmin === true || u?.manager_id === me()?.id || (isManager() && (!u || u.department_id === me()?.department_id)); };
  const lockedFor = o => !!o && o.level !== 'company' && !!publication(o.owner_id, periodOf(o)) && !leaderOf(o.owner_id);
  const canEdit = o => !!o && !lockedFor(o) && (o.level === 'company' ? companyMine() : o.department_id === me()?.department_id && (isManager() || (o.level === 'personal' && o.owner_id === me()?.id)));
  const canPost = o => !!o && (o.level === 'company' ? isManager() : o.department_id === me()?.department_id && (isManager() || o.owner_id === me()?.id));
  const canCreateFor = ownerId => (isManager() || ownerId === me()?.id) && !(publication(ownerId, ui.cycle) && !leaderOf(ownerId));

  /* ---------- data helpers ---------- */
  const periodOf = o => (o.planning && /^\d{4}-\d{2}$/.test(o.planning.period || '')) ? o.planning.period : '';
  const simple = () => S().capabilities?.simpleOkrScores === true;
  const nowPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const periodLabel = p => { if (!p) return tr('未设周期', 'No cycle'); const [y, m] = p.split('-').map(Number); return lang() === 'en' ? new Date(y, m - 1, 1).toLocaleString('en-US', { month:'short', year:'numeric' }) : `${y}年${m}月`; };
  const shiftPeriod = (p, n) => { const [y, m] = (p || nowPeriod()).split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const dueDateFor = p => { const [y, m] = p.split('-').map(Number); const d = new Date(Date.UTC(y, m, 3)); return d.toISOString().slice(0, 10); };
  function cycles() {
    const set = new Set(S().objectives.map(periodOf));
    set.add(nowPeriod());
    return [...set].sort((a, b) => (b || '0').localeCompare(a || '0'));
  }
  function ensureCycle() {
    if (ui.cycle !== null && cycles().includes(ui.cycle)) return;
    const withData = S().objectives.map(periodOf);
    ui.cycle = withData.includes(nowPeriod()) ? nowPeriod() : (withData.filter(Boolean).sort().pop() ?? (withData.includes('') ? '' : nowPeriod()));
  }
  const inCycle = o => periodOf(o) === ui.cycle;
  const order = list => window.WorkOSOkr?.orderImported ? window.WorkOSOkr.orderImported(list) : list;
  // Items removed with ×: hidden right away, archived on the server only when the undo window ends.
  const krsOf = o => order(S().krs.filter(k => k.objective_id === o.id && !ui.removing.has(k.id)));
  const krPct = kr => window.WorkOSOkr?.metric ? window.WorkOSOkr.metric(kr).progress : null;
  const quantified = kr => window.WorkOSOkr?.metric ? window.WorkOSOkr.metric(kr).quantified : false;
  function objectivePct(o) {
    const items = krsOf(o).map(k => ({ p:krPct(k), w:k.planning?.weight })).filter(x => x.p !== null);
    if (!items.length) return null;
    const weighted = items.every(x => Number.isFinite(x.w) && x.w > 0);
    const total = weighted ? items.reduce((s, x) => s + x.w, 0) : items.length;
    return Math.round(items.reduce((s, x) => s + x.p * (weighted ? x.w : 1), 0) / total);
  }
  function averagePct(objs) {
    const items = objs.map(o => ({ p:objectivePct(o), w:o.planning?.weight })).filter(x => x.p !== null);
    if (!items.length) return null;
    const weighted = items.every(x => Number.isFinite(x.w) && x.w > 0);
    const total = weighted ? items.reduce((s, x) => s + x.w, 0) : items.length;
    return Math.round(items.reduce((s, x) => s + x.p * (weighted ? x.w : 1), 0) / total);
  }
  // The top leader (an administrator without a manager) owns the company OKR: it is their own OKR, not a separate list.
  const companyMine = () => !!me() && !me().manager_id && me().isAdmin === true;
  const objectivesOf = ownerId => order(S().objectives.filter(o => inCycle(o) && !ui.removing.has(o.id) && (ownerId === '__company' ? o.level === 'company' : (o.owner_id === ownerId && o.level !== 'company') || (ownerId === me()?.id && companyMine() && o.level === 'company'))));
  /* Team list sections: my direct and indirect reports, peers who share my manager, my managers, everyone else. */
  let orgChart = null, chartLoading = false;
  function chartPeople() {
    if (!orgChart && !chartLoading && ctx?.api) { chartLoading = true; ctx.api.get('/org/chart').then(r => { orgChart = r.items || []; window.WorkOSNames?.apply(orgChart); rerender(); }).catch(() => { orgChart = []; }).finally(() => { chartLoading = false; }); }
    return orgChart || [];
  }
  function relationOf(id) {
    if (id === '__company' || id === me()?.id) return 'top';
    const byId = new Map([...S().directory, ...chartPeople()].map(u => [u.id, u]));
    let cur = byId.get(id), guard = 0;
    // Direct reports have me as their manager; anyone further down my line is an indirect report.
    while (cur && cur.manager_id && guard++ < 20) { if (cur.manager_id === me()?.id) return guard === 1 ? 'direct' : 'indirect'; cur = byId.get(cur.manager_id); }
    const mine = byId.get(me()?.id)?.manager_id ?? me()?.manager_id, other = byId.get(id), myDept = me()?.department_id;
    // Without a manager line on the org chart, a department manager leads the department's members.
    if (other && !other.manager_id && isManager() && other.department_id === myDept && other.role !== 'manager') return 'direct';
    if (mine && other?.manager_id === mine) return 'peers';
    if (!mine && other && !other.manager_id && other.department_id === myDept && other.role === me()?.role) return 'peers';
    let up = mine, g2 = 0; while (up && g2++ < 20) { if (up === id) return 'managers'; up = byId.get(up)?.manager_id; }
    return 'others';
  }
  /* Three stages per person and month: OKR set up (published), self scores, leader scores. */
  function stages(id, objs) {
    const items = objs.flatMap(o => { const ks = krsOf(o); return ks.length ? ks : [o]; });
    const self = items.filter(x => x.scores?.self).length, lead = items.filter(x => x.scores?.manager).length, pub = publication(id, ui.cycle);
    return { items:items.length, self, lead, pub, setup:pub ? 'done' : objs.length ? 'part' : 'none' };
  }
  function stageLegend() {
    return `<div class="okb-stage-legend"><div class="okb-stage-legend-row"><b>${tr('每人三个状态', 'Three stages')}</b><button type="button" class="okb-stage-help-btn" data-okr="stage-help" aria-expanded="${!!ui.stageHelp}">${icon('question')} ${tr('说明', 'Help')}</button></div>
      <div class="okb-stage-legend-row"><i class="okb-stage done">${tr('建立', 'Set')}</i><i class="okb-stage done">${tr('自评', 'Self')}</i><i class="okb-stage done">${tr('领导', 'Leader')}</i><span>${tr('绿 = 完成 · 黄 = 进行中 · 灰 = 未开始', 'green done · amber in progress · grey not started')}</span></div>
      ${nudgeButton()}${ui.stageHelp ? `<dl class="okb-stage-help"><dt>${tr('① 建立', '① Set')}</dt><dd>${tr('本月 OKR 是否已“最终发布”。✓ = 已发布；“未发布” = 已填写但还没发布；— = 还没填写。设置期：上月 25 日至本月 5 日。', 'Whether this month’s OKR is published. ✓ published; “draft” filled in but not published; — not started. Window: 25th of last month to the 5th.')}</dd><dt>${tr('② 自评', '② Self')}</dt><dd>${tr('员工已自评的项数 / 需要评分的项数（每条 KR 算一项，没有 KR 的目标算一项）。自评期：本月 25 日至 30 日，逾期按 0 分。', 'Items the owner has self-scored / items to score (each KR, or an objective without KRs). Window: the 25th to the 30th; missing ones count as 0.')}</dd><dt>${tr('③ 领导', '③ Leader')}</dt><dd>${tr('领导已评分的项数 / 需要评分的项数。领导评分期：本月 30 日至下月 3 日。', 'Items the leader has scored / items to score. Window: the 30th to the 3rd of next month.')}</dd></dl>` : ''}</div>`;
  }
  /* 一键催办: leaders remind everyone in their team who is behind on this month's OKR (server decides who and when). */
  const leadsSomeone = () => people().some(id => ['direct', 'indirect'].includes(relationOf(id)));
  const nudgeButton = () => leadsSomeone() ? `<button type="button" class="btn okb-nudge-btn" data-okr="nudge-open">${icon('bell-ringing')} ${tr('一键催办', 'Nudge the team')}</button>` : '';
  const NUDGE_STAGE = { setup:['建立', 'Set up'], self:['自评', 'Self score'], lead:['领导评分', 'Leader score'] };
  async function openNudge() {
    const p = ui.cycle || nowPeriod();
    let r; try { r = await ctx.api.get('/okr/nudge?period=' + encodeURIComponent(p)); } catch (e) { ctx.toast(ctx.explainError ? ctx.explainError(e) : e.message); return; }
    const items = r.items || [];
    const rows = items.map(x => `<li><b>${esc(nameOf(x.userId) || x.name)}</b><span class="okb-nudge-stage">${esc(tr(...NUDGE_STAGE[x.stage]))}</span><span>${esc(x.stage === 'setup' ? tr('还没有发布 OKR', 'OKR not published') : x.stage === 'self' ? tr(`${x.count} 项未自评`, `${x.count} not self-scored`) : tr(`${x.count} 项待领导评分`, `${x.count} to score`))}</span><span class="${x.overdue ? 'okb-nudge-late' : ''}">${x.overdue ? tr('已逾期', 'overdue') + ' · ' : ''}${tr('截止', 'due')} ${esc(x.deadline)}</span></li>`).join('');
    ctx.modal(tr(`一键催办 · ${periodLabel(p)} OKR`, `Nudge the team · ${periodLabel(p)} OKR`), items.length
      ? `<p class="fine">${tr('下面这些同事当前阶段还没完成。发送后，每人会收到一条站内提醒和钉钉消息；同一个人同一阶段每天最多催一次。', 'These people have not finished the current stage. Each gets an in-app reminder and a DingTalk message; at most once per person and stage per day.')}</p><ul class="okb-nudge-list">${rows}</ul><div class="rma-actions"><button type="button" class="btn primary" data-okr="nudge-send" data-period="${esc(p)}">${icon('paper-plane-tilt')} ${tr(`发送催办（${items.length} 人）`, `Send ${items.length} reminder${items.length > 1 ? 's' : ''}`)}</button></div>`
      : `<p>${tr('团队里目前没有需要催办的人：这个阶段大家都已完成，或者还没到时间。', 'Nobody in your team needs a reminder right now: everyone is done with this stage, or it has not started yet.')}</p>`,
      `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`);
  }
  async function sendNudge(btn) {
    if (btn.disabled) return; btn.disabled = true;
    try {
      const r = await ctx.api.post('/okr/nudge', { period:btn.dataset.period });
      ctx.toast(r.sent ? tr(`已催办 ${r.sent} 人`, `Reminded ${r.sent}`) + (r.already ? tr(`；${r.already} 人今天已经催过`, `; ${r.already} already reminded today`) : '') : tr('今天已经都催过了，明天可以再催', 'Everyone was already reminded today; try again tomorrow'));
      document.querySelector('#overlay-root [data-live-action="close"]')?.click();
    } catch (e) { btn.disabled = false; ctx.toast(ctx.explainError ? ctx.explainError(e) : e.message); }
  }
  function stageChips(id, objs) {
    const st = stages(id, objs), cls = (n, t) => !t ? 'none' : n >= t ? 'done' : n ? 'part' : 'none';
    const chips = [[st.setup, tr('建立', 'Set'), st.pub ? '✓' : objs.length ? tr('未发布', 'draft') : '—', tr('本月 OKR 建立：', 'OKR set up: ') + (st.pub ? tr('已最终发布', 'published') : objs.length ? tr('已填写，未发布', 'drafted, not published') : tr('未填写', 'not started'))],
      [cls(st.self, st.items), tr('自评', 'Self'), st.items ? `${st.self}/${st.items}` : '—', tr(`本月 OKR 自评：${st.self}/${st.items} 项`, `Self scores: ${st.self}/${st.items}`)],
      [cls(st.lead, st.items), tr('领导', 'Leader'), st.items ? `${st.lead}/${st.items}` : '—', tr(`领导评分：${st.lead}/${st.items} 项`, `Leader scores: ${st.lead}/${st.items}`)]];
    return `<span class="okb-stages">${chips.map(([c, label, val, title]) => `<i class="okb-stage ${c}" title="${esc(title)}">${label} <b>${val}</b></i>`).join('')}</span>`;
  }
  let viaOf = () => '';
  function peopleSections() {
    const list = people(), groups = { top:[], direct:[], indirect:[], peers:[], managers:[], others:[] };
    list.forEach(id => groups[relationOf(id)].push(id));
    // Indirect reports are listed next to their own manager, who is shown under the name.
    const byId = new Map([...S().directory, ...chartPeople()].map(u => [u.id, u]));
    const boss = id => byId.get(id)?.manager_id || '';
    groups.indirect.sort((a, b) => nameOf(boss(a)).localeCompare(nameOf(boss(b))) || nameOf(a).localeCompare(nameOf(b)));
    viaOf = id => groups.indirect.includes(id) ? byId.get(id)?.manager_id || '' : '';
    return [['', groups.top], [tr('直属下属', 'Direct reports'), groups.direct], [tr('间接下属（下属的团队）', 'Indirect reports (their teams)'), groups.indirect], [tr('团队 OKR（平级同事）', 'Team OKRs (peers)'), groups.peers], [tr('我的上级', 'My managers'), groups.managers], [tr('其他同事', 'Others'), groups.others]].filter(([, ids]) => ids.length);
  }
  function people() {
    const ids = new Set([...S().directory, ...chartPeople()].map(u => u.id));
    S().objectives.filter(inCycle).forEach(o => { if (o.level !== 'company' && o.owner_id) ids.add(o.owner_id); });
    if (me()) ids.add(me().id);
    let list = [...ids].sort((a, b) => a === me()?.id ? -1 : b === me()?.id ? 1 : nameOf(a).localeCompare(nameOf(b)));
    if (!companyMine() && S().objectives.some(o => inCycle(o) && o.level === 'company')) list = ['__company', ...list];
    const q = ui.search.trim().toLowerCase();
    return q ? list.filter(id => (id === '__company' ? tr('公司目标', 'Company objectives') : nameOf(id)).toLowerCase().includes(q)) : list;
  }
  const scoreOf = kr => { const a = S().appraisals?.[kr.id]; if (!a || a.version !== kr.version) return { kind:'none' }; if (a.manager && a.manager.metric_version === kr.version) return { kind:'manager', score:a.manager.score }; if (a.self) return { kind:'self', score:a.self.score }; return { kind:'none' }; };
  const objectiveById = id => S().objectives.find(o => o.id === id);

  /* ---------- small render pieces ---------- */
  const bar = (pct, status) => `<div class="okb-bar ${status ? 'okb-' + status : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct ?? 0}"><span style="width:${pct ?? 0}%"></span></div>`;
  const ring = (pct, size = 44) => `<span class="okb-ring" style="--okb-p:${pct ?? 0};width:${size}px;height:${size}px"><span>${pct === null ? '—' : pct + '%'}</span></span>`;
  const statusLabel = id => { const s = STATUS.find(x => x[0] === id); return s ? tr(s[1], s[2]) : tr('未设置状态', 'No status'); };
  const statusChip = (kr, editable) => {
    const tag = editable ? 'button' : 'span';
    return `<${tag} class="okb-status ${kr.confidence ? 'okb-' + kr.confidence : 'okb-none'}" ${editable ? `type="button" data-okr="kr-status" data-id="${esc(kr.id)}"` : ''}><i></i>${esc(statusLabel(kr.confidence))}</${tag}>`;
  };
  const weightText = w => Number.isFinite(w) ? `${w}%` : '—';

  /* ---------- autosave ----------
   * Every OKR field saves on its own: SAVE_DELAY after the last keystroke and again when the box loses
   * focus. Publish stays the only confirmation. Anything typed but not yet confirmed by the server
   * (field edits, new objective/KR forms, the AI text box, an unfinished AI draft) is mirrored to
   * localStorage per user and cycle, restored after a reload or crash, and cleared once the server
   * confirms it. Failed saves retry when the network comes back. */
  const SAVE_DELAY = 800, UNDO_MS = 6000, STORE = 'workos-okr-unsaved:v1:';
  const later = (fn, ms) => setTimeout(fn, ms), cancel = t => clearTimeout(t);
  const saver = { drafts:new Map(), timers:new Map(), chains:new Map(), failed:new Map(), known:new Map(), forms:new Map(), ai:new Map(), loaded:new Set(), inflight:0, saved:false, restored:false, sync:false, retryTimer:null };
  const kindEnt = kind => kind.startsWith('kr') ? 'kr' : 'o';
  const itemOf = (kind, id) => kindEnt(kind) === 'o' ? objectiveById(id) : findKr(id);
  const numberIn = v => { const n = Number(v); return String(v).trim() !== '' && n > 0 && n <= 100 ? n : null; };
  const targetShown = k => k.planning?.targetText || (Number.isFinite(k.target) && k.unit !== '完成' ? `${k.target} ${k.unit || ''}`.trim() : tr('完成', 'Done'));
  const FIELD = {
    'o-title': { get:o => o.title, set:(o, v) => { o.title = v.trim(); }, body:(o, v) => { const t = v.trim(); return t && t.length <= 300 ? { title:t } : null; } },
    'o-weight': { get:o => o.planning?.weight, set:(o, v) => { o.planning = { ...(o.planning || {}), weight:Number(v) }; }, body:(o, v) => numberIn(v) === null ? null : { weight:numberIn(v) } },
    'o-desc': { get:o => o.planning?.description || '', set:(o, v) => { o.planning = { ...(o.planning || {}), description:v.trim() }; }, body:(o, v) => v.trim().length <= 4000 ? { description:v.trim() } : null },
    'kr-title': { get:k => k.title, set:(k, v) => { k.title = v.trim(); }, body:(k, v) => { const t = v.trim(); return t && t.length <= 300 ? { title:t } : null; } },
    'kr-weight': { get:k => k.planning?.weight, set:(k, v) => { k.planning = { ...(k.planning || {}), weight:Number(v) }; }, body:(k, v) => numberIn(v) === null ? null : { weight:numberIn(v) } },
    'kr-target': { get:targetShown, set:(k, v) => { k.planning = { ...(k.planning || {}), targetText:v.trim() }; }, body:(k, v) => {
      const raw = v.trim(); if (!raw || raw.length > 120) return null;
      const m = /^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/.exec(raw);
      return { targetText:raw, ...(m && Number(m[1]) > 0 && Number(m[1]) !== Number(k.target) ? { metric:{ expectedVersion:k.version, baseline:Number(k.baseline) || 0, target:Number(m[1]), direction:'increase', unit:(m[2] || '').trim().slice(0, 30) || k.unit || tr('项', 'units') } } : {}) };
    } },
  };
  /* localStorage: one entry per user and cycle. Every access is wrapped: private windows and full disks just lose the mirror. */
  const storeKey = period => STORE + (me()?.id || '') + ':' + (period || '');
  function readStore(period) { try { const v = JSON.parse(localStorage.getItem(storeKey(period)) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } }
  function writeStore(period) {
    const fields = {}, forms = {}, ai = saver.ai.get(period) || {};
    for (const [k, d] of saver.drafts) if (d.period === period) fields[k] = d.value;
    for (const f of saver.forms.values()) if (f.period === period) forms[f.key] = f.values;
    const data = { fields, forms, ...(ai.text ? { aiText:ai.text } : {}), ...(ai.queue?.length ? { aiQueue:ai.queue } : {}), at:Date.now() };
    const empty = !Object.keys(fields).length && !Object.keys(forms).length && !data.aiText && !data.aiQueue;
    try { if (empty) localStorage.removeItem(storeKey(period)); else localStorage.setItem(storeKey(period), JSON.stringify(data)); } catch {}
  }
  const aiPeriod = () => ui.cycle || nowPeriod();
  const aiState = period => { if (!saver.ai.has(period)) saver.ai.set(period, { text:'', queue:null, error:'', running:false }); return saver.ai.get(period); };
  function fieldPeriod(kind, id) { const it = itemOf(kind, id), o = it && (kindEnt(kind) === 'o' ? it : objectiveById(it.objective_id)); return o ? periodOf(o) : (ui.cycle ?? ''); }
  function dropDraft(key) { const d = saver.drafts.get(key); cancel(saver.timers.get(key)); saver.timers.delete(key); saver.drafts.delete(key); saver.failed.delete(key); if (d) writeStore(d.period); }
  /* Called on every keystroke of an autosaved field. */
  function typed(kind, id, value) {
    if (!FIELD[kind]) return;
    const key = kind + ':' + id; let d = saver.drafts.get(key);
    if (!d) { const it = itemOf(kind, id); d = { kind, id, base:it ? String(FIELD[kind].get(it) ?? '') : '', period:fieldPeriod(kind, id) }; saver.drafts.set(key, d); }
    d.value = String(value ?? ''); d.retried = false; saver.failed.delete(key);
    writeStore(d.period);
    cancel(saver.timers.get(key)); saver.timers.set(key, later(() => flush(key), SAVE_DELAY));
    paintStatus();
  }
  /* Saves of one objective or KR run one after another so each sends the version the previous one returned. */
  function chain(ent, job) {
    const run = (saver.chains.get(ent) || Promise.resolve()).then(job), tail = run.catch(() => {});
    saver.chains.set(ent, tail); tail.then(() => { if (saver.chains.get(ent) === tail) saver.chains.delete(ent); });
    return run;
  }
  function flush(key) {
    cancel(saver.timers.get(key)); saver.timers.delete(key);
    const d = saver.drafts.get(key); if (!d) return Promise.resolve();
    return chain(kindEnt(d.kind) + ':' + d.id, () => sendField(key)).catch(() => {});
  }
  async function sendField(key) {
    const d = saver.drafts.get(key); if (!d) return;
    const f = FIELD[d.kind], it = itemOf(d.kind, d.id);
    if (!it) return; // not loaded (or removed): keep the text until the item is back
    const value = d.value;
    if (value.trim() === String(d.base ?? '').trim()) { dropDraft(key); return paintStatus(); }
    const body = f.body(it, value);
    if (!body) return paintStatus(); // not valid yet (empty title, weight out of range): kept locally, nothing sent
    saver.inflight++; saver.failed.delete(key); paintStatus();
    let retry = false;
    try {
      const r = kindEnt(d.kind) === 'o' ? await patchO(it, body) : await patchKr(it, body);
      remember(kindEnt(d.kind), d.id, r);
      const cur = saver.drafts.get(key);
      if (cur && cur.value === value) dropDraft(key); else if (cur) { cur.base = value; cur.retried = false; }
      saver.saved = true;
      if (body.metric) saver.sync = true; // a new metric resets scores: reload them once everything settles
    } catch (e) {
      if (e?.status === 409 && !d.retried) { d.retried = true; retry = true; }
      else { saver.failed.set(key, { offline:!e?.status, message:ctx.explainError(e) }); if (!e?.status) retrySoon(); }
    } finally { saver.inflight--; }
    if (retry) { try { await ctx.refreshOkr(); } catch {} return sendField(key); } // someone else saved first: take their version, keep our text
    paintStatus(); settled();
  }
  /* What the server confirmed, so a refresh that raced the save cannot show the older text again. */
  function remember(ent, id, r) {
    if (!r || typeof r !== 'object') return;
    const keys = ent === 'o' ? ['version', 'title', 'planning'] : ['version', 'meta_version', 'title', 'planning', 'target', 'unit', 'baseline', 'direction', 'confidence'];
    const v = Object.fromEntries(keys.filter(k => r[k] !== undefined).map(k => [k, r[k]]));
    if (Object.keys(v).length) saver.known.set(ent + ':' + id, v);
    reconcile();
  }
  /* Before each render: apply confirmed saves the loaded data has not caught up with, then show unsaved text in place. */
  function reconcile() {
    for (const [k, v] of saver.known) {
      const ent = k.slice(0, k.indexOf(':')), id = k.slice(k.indexOf(':') + 1), it = ent === 'o' ? objectiveById(id) : findKr(id), ver = ent === 'o' ? 'version' : 'meta_version';
      if (!it) continue;
      if ((Number(it[ver]) || 0) < (Number(v[ver]) || 0)) Object.assign(it, v); else saver.known.delete(k);
    }
    for (const [key, d] of saver.drafts) {
      const it = itemOf(d.kind, d.id); if (!it) continue;
      // Restored before its objective/KR was loaded: compare with the loaded value now, then save.
      if (d.parked) { d.parked = false; d.base = String(FIELD[d.kind].get(it) ?? ''); later(() => flush(key), 0); }
      if (FIELD[d.kind].body(it, d.value)) FIELD[d.kind].set(it, d.value);
    }
  }
  async function flushAll() {
    for (let round = 0; round < 5; round++) {
      for (const key of [...saver.timers.keys()]) flush(key);
      const waiting = [...saver.chains.values()];
      if (!waiting.length) return;
      await Promise.all(waiting);
    }
  }
  function retryFailed() {
    cancel(saver.retryTimer); saver.retryTimer = null;
    for (const key of [...saver.failed.keys()]) { const d = saver.drafts.get(key); saver.failed.delete(key); if (d) { d.retried = false; flush(key); } }
    for (const [period, a] of saver.ai) if (a.queue?.length && a.error) { a.error = ''; runAiQueue(period); }
    paintStatus();
  }
  function retrySoon() { if (!saver.retryTimer) saver.retryTimer = later(() => { saver.retryTimer = null; retryFailed(); }, 15000); }
  try { window.addEventListener('online', () => retryFailed()); } catch {}
  function saveState() {
    if (saver.inflight || saver.timers.size || [...saver.ai.values()].some(a => a.running)) return 'saving';
    if (saver.failed.size || [...saver.ai.values()].some(a => a.error)) return 'error';
    if ([...saver.drafts.values()].some(d => itemOf(d.kind, d.id))) return 'unsaved';
    return saver.saved ? 'saved' : '';
  }
  function saveLine() {
    const s = saveState(), why = [...saver.failed.values(), ...[...saver.ai.values()].filter(a => a.error).map(a => ({ message:a.error }))].map(x => x.message).filter(Boolean);
    const offline = [...saver.failed.values()].some(x => x.offline);
    const main = s === 'saving' ? `<span class="okb-save saving">${icon('circle-notch')} ${tr('保存中…', 'Saving…')}</span>`
      : s === 'error' ? `<button type="button" class="okb-save error" data-okr="save-retry" title="${esc(why.join('；'))}">${icon('warning-circle')} ${tr('保存失败（点击重试）', 'Save failed (click to retry)')}</button><span class="okb-save-why">${esc(offline ? tr('网络恢复后会自动重试', 'Retries automatically when the network is back') : why[0] || '')}</span><button type="button" class="okb-link okb-save-discard" data-okr="save-discard">${tr('放弃这些修改', 'Discard these changes')}</button>`
      : s === 'unsaved' ? `<span class="okb-save unsaved">${icon('pencil-simple')} ${tr('有内容还没保存：请检查填写（标题不能为空，分值和权重在 0–100 之间）', 'Some changes are not saved yet: check the value (titles can’t be empty; points and weights are 0–100)')}</span>`
      : s === 'saved' ? `<span class="okb-save saved">${icon('check')} ${tr('已保存', 'Saved')}</span>` : '';
    const note = saver.restored ? `<span class="okb-save-restored">${icon('clock-counter-clockwise')} ${tr('已恢复未保存的内容', 'Restored your unsaved changes')}<button type="button" class="okb-link" data-okr="restored-ok" aria-label="${esc(tr('知道了', 'Dismiss'))}">${icon('x')}</button></span>` : '';
    return main + note;
  }
  function paintStatus() { try { document.querySelectorAll('[data-okr-save]').forEach(el => { el.innerHTML = saveLine(); }); } catch {} }
  /* After saves settle: one data refresh if a metric changed, then redraw totals unless someone is typing. */
  async function settled() {
    if (saver.inflight || saver.timers.size) return;
    if (saver.sync) { saver.sync = false; try { await ctx.refreshOkr(); } catch {} }
    softRerender();
  }
  const typing = () => { const a = document.activeElement; return !!(a && a.matches?.('input, textarea, select') && a.closest?.('.okb, #overlay-root')); };
  function softRerender() { if (!ctx || S().page !== 'okr') return; if (typing()) ui.deferRender = true; else rerender(); }
  /* New objective / KR forms keep their text in the mirror until the item is created. */
  const formKey = form => form.id === 'okr-new-o' ? 'new-o' : form.id === 'okr-new-kr' ? 'new-kr:' + form.dataset.objectiveId : '';
  const formPeriod = key => key === 'new-o' ? (ui.cycle ?? '') : fieldPeriod('o-title', key.slice(7));
  const formId = (period, key) => period + '|' + key; // a half-written objective belongs to the cycle it was started in
  function rememberForm(form) {
    const key = formKey(form); if (!key) return;
    const period = formPeriod(key);
    saver.forms.set(formId(period, key), { period, key, values:Object.fromEntries([...new FormData(form)].filter(([, v]) => typeof v === 'string')) }); writeStore(period);
  }
  function forgetForm(key) { const id = formId(formPeriod(key), key), f = saver.forms.get(id); if (!f) return; saver.forms.delete(id); writeStore(f.period); }
  const formVal = (key, name, fallback = '') => { const v = saver.forms.get(formId(formPeriod(key), key))?.values?.[name]; return v === undefined ? fallback : v; };
  /* On the first render for a user, bring back every cycle that has unsaved text, not only the one on screen. */
  function restoreAll() {
    const tag = 'all:' + (me()?.id || ''); if (saver.loaded.has(tag)) return; saver.loaded.add(tag);
    const prefix = STORE + (me()?.id || '') + ':', periods = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) periods.push(k.slice(prefix.length)); } } catch {}
    periods.forEach(restore);
  }
  /* Once per user and cycle: bring back whatever the last session typed but the server never confirmed. */
  function restore(period) {
    const tag = (me()?.id || '') + ':' + period; if (saver.loaded.has(tag)) return; saver.loaded.add(tag);
    const s = readStore(period); if (!s || !(Date.now() - Number(s.at || 0) < 30 * 864e5)) return; // older than 30 days: ignore
    let any = false; const resend = [];
    for (const [key, value] of Object.entries(s.fields || {})) {
      const i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1), it = FIELD[kind] && itemOf(kind, id);
      if (!FIELD[kind] || saver.drafts.has(key)) continue;
      if (!it) { saver.drafts.set(key, { kind, id, value:String(value), base:'', period, parked:true }); continue; } // kept until the item is loaded
      const base = String(FIELD[kind].get(it) ?? '');
      if (String(value).trim() === base.trim()) continue; // the save did reach the server
      saver.drafts.set(key, { kind, id, value:String(value), base, period }); resend.push(key); any = true;
    }
    for (const [key, values] of Object.entries(s.forms || {})) {
      if (!values || typeof values !== 'object' || saver.forms.has(formId(period, key))) continue;
      if (!Object.values(values).some(v => String(v).trim())) continue;
      saver.forms.set(formId(period, key), { period, key, values }); any = true;
      if (!ui.adding && period === (ui.cycle ?? '') && (key === 'new-o' || objectiveById(key.slice(7)))) ui.adding = key === 'new-o' ? { kind:'o' } : { kind:'kr', id:key.slice(7) };
    }
    const a = aiState(period);
    if (s.aiText && !a.text) { a.text = String(s.aiText); any = true; }
    if (Array.isArray(s.aiQueue) && s.aiQueue.length && !a.queue?.length) { a.queue = s.aiQueue.map(x => ({ ...x, resumed:true })); any = true; later(() => runAiQueue(period), 0); }
    if (any) saver.restored = true;
    if (resend.length) later(() => resend.forEach(flush), 0);
  }

  function editable(kind, id, value, display, type = 'text', cls = '') {
    if (ui.editing && ui.editing.kind === kind && ui.editing.id === id) {
      const d = saver.drafts.get(kind + ':' + id);
      return `<form class="okb-inline-edit ${cls}" id="okr-edit" data-kind="${kind}" data-id="${esc(id)}"><input name="value" type="${type}" ${type === 'number' ? 'min="0.01" max="100" step="0.01"' : `maxlength="${kind === 'kr-target' ? 120 : 300}" minlength="1"`} value="${esc(d ? d.value : value ?? '')}" data-okr-field="${kind}:${esc(id)}" data-okr-autofocus required title="${esc(tr('输入后自动保存；Esc 取消', 'Saves automatically as you type; Esc cancels'))}"></form>`;
    }
    return display;
  }
  const removeBtn = (kind, id) => `<button type="button" class="okb-icon-btn okb-remove" data-okr="remove-${kind}" data-id="${esc(id)}" aria-label="${esc(kind === 'o' ? tr('删除目标（可撤销）', 'Remove objective (undo available)') : tr('删除 KR（可撤销）', 'Remove KR (undo available)'))}" title="${esc(kind === 'o' ? tr('删除目标（可撤销）', 'Remove objective (undo available)') : tr('删除 KR（可撤销）', 'Remove KR (undo available)'))}">${icon('x')}</button>`;
  function popover(items) {
    return `<div class="okb-popover" role="menu">${items.filter(Boolean).map(([action, label, id, extra = '', danger = false]) => `<button type="button" role="menuitem" class="${danger ? 'okb-danger' : ''}" data-okr="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`).join('')}</div>`;
  }

  /* ---------- key result row ---------- */
  function krRow(o, kr, index) {
    const pct = krPct(kr), editableO = canEdit(o) && collab(), score = scoreOf(kr);
    const menuOpen = ui.menu && ui.menu.kind === 'kr' && ui.menu.id === kr.id;
    const statusOpen = ui.menu && ui.menu.kind === 'status' && ui.menu.id === kr.id;
    const canScore = o.department_id === me()?.department_id && (isManager() || o.owner_id === me()?.id);
    const canMeasure = quantified(kr) && isManager() && o.department_id === me()?.department_id;
    const title = editable('kr-title', kr.id, kr.title, editableO ? `<button type="button" class="okb-title-btn" data-okr="edit" data-kind="kr-title" data-id="${esc(kr.id)}">${tx(kr.title)}</button>` : `<span>${tx(kr.title)}</span>`);
    const weight = editable('kr-weight', kr.id, kr.planning?.weight, editableO ? `<button type="button" class="okb-chip" data-okr="edit" data-kind="kr-weight" data-id="${esc(kr.id)}">${tr('权重', 'Weight')} ${weightText(kr.planning?.weight)}</button>` : `<span class="okb-chip okb-static">${tr('权重', 'Weight')} ${weightText(kr.planning?.weight)}</span>`, 'number', 'okb-weight-edit');
    const metric = quantified(kr) ? `${kr.actual ?? '—'} / ${kr.target} ${esc(kr.unit || '')}` : tr('未设量化指标', 'No metric');
    const scoreHtml = score.kind === 'manager' ? `<span class="okb-score okb-score-final">${score.score}</span>` : score.kind === 'self' ? `<span class="okb-score okb-score-self">${tr('自评', 'Self')} ${score.score}</span>` : `<span class="okb-score okb-score-none">${tr('未评分', 'Not scored')}</span>`;
    return `<div class="okb-kr" data-kr="${esc(kr.id)}">
      <span class="okb-kr-tag">${esc(kr.importSource?.itemLabel || 'KR' + (index + 1))}</span>
      <div class="okb-kr-main"><div class="okb-kr-title">${title}</div>${kr.planning?.description && kr.planning.description.trim() !== kr.title.trim() ? `<div class="okb-kr-desc">${tx(kr.planning.description)}</div>` : ''}</div>
      <div class="okb-kr-progress">${canMeasure ? `<button type="button" class="okb-progress-btn" data-okr="measure" data-id="${esc(kr.id)}">` : '<div class="okb-progress-btn okb-static">'}${bar(pct, kr.confidence)}<span class="okb-pct">${pct === null ? '—' : pct + '%'}</span><span class="okb-metric">${metric}</span>${canMeasure ? '</button>' : '</div>'}</div>
      <div class="okb-kr-status">${statusChip(kr, editableO)}${statusOpen ? popover([...STATUS.map(([id, zh, en]) => ['set-status', `<i class="okb-dot okb-${id}"></i>${tr(zh, en)}`, kr.id, `data-value="${id}"`]), ['set-status', tr('清除状态', 'Clear status'), kr.id, 'data-value=""']]) : ''}</div>
      <div class="okb-kr-weight">${weight}</div>
      <div class="okb-kr-score">${canScore ? `<button type="button" class="okb-score-btn" data-okr="appraisal" data-id="${esc(kr.id)}">${scoreHtml}</button>` : scoreHtml}</div>
      <div class="okb-kr-more">${editableO ? removeBtn('kr', kr.id) : ''}${(editableO || canScore || canMeasure) ? `<button type="button" class="okb-icon-btn" data-okr="menu" data-kind="kr" data-id="${esc(kr.id)}" aria-label="${tr('更多操作', 'More actions')}">${icon('dots-three')}</button>` : ''}${menuOpen ? popover([
        canScore && ['appraisal', tr('成果与评分', 'Evidence & score'), kr.id],
        canMeasure && ['measure', tr('记录实际值', 'Record actual value'), kr.id],
        editableO && ['edit-metric', tr('编辑指标', 'Edit metric'), kr.id],
        editableO && ['remove-kr', tr('删除 KR', 'Delete KR'), kr.id, '', true],
      ]) : ''}</div>
    </div>`;
  }

  /* ---------- objective card ---------- */
  function objectiveCard(o, index) {
    const krs = krsOf(o), pct = objectivePct(o), edit = canEdit(o), editableO = edit && collab();
    const parent = o.parent_objective_id ? objectiveById(o.parent_objective_id) : null;
    const children = S().objectives.filter(x => x.parent_objective_id === o.id);
    const menuOpen = ui.menu && ui.menu.kind === 'o' && ui.menu.id === o.id;
    const collapsed = ui.collapsed.has(o.id);
    const label = o.importSource?.itemLabel || `O${index + 1}`;
    const title = editable('o-title', o.id, o.title, editableO ? `<button type="button" class="okb-title-btn okb-o-title" data-okr="edit" data-kind="o-title" data-id="${esc(o.id)}" title="${esc(tr('点击修改', 'Click to edit'))}">${tx(o.title)}</button>` : `<span class="okb-o-title">${tx(o.title)}</span>`);
    const weight = editable('o-weight', o.id, o.planning?.weight, editableO ? `<button type="button" class="okb-chip" data-okr="edit" data-kind="o-weight" data-id="${esc(o.id)}">${tr('权重', 'Weight')} ${weightText(o.planning?.weight)}</button>` : `<span class="okb-chip okb-static">${tr('权重', 'Weight')} ${weightText(o.planning?.weight)}</span>`, 'number', 'okb-weight-edit');
    const kinds = { company:tr('公司目标', 'Company'), department:tr('部门目标', 'Department'), personal:tr('个人目标', 'Personal') };
    const updates = ui.updates.get(o.id);
    const krWeights = krs.reduce((s, k) => s + (Number.isFinite(k.planning?.weight) ? k.planning.weight : 0), 0);
    const weightWarn = Number.isFinite(o.planning?.weight) && krs.length && Math.abs(krWeights - o.planning.weight) > 0.001;
    return `<article class="okb-objective" data-objective="${esc(o.id)}">
      <header class="okb-o-head">
        <button type="button" class="okb-collapse" data-okr="collapse" data-id="${esc(o.id)}" aria-expanded="${!collapsed}" aria-label="${collapsed ? tr('展开', 'Expand') : tr('收起', 'Collapse')}">${icon(collapsed ? 'caret-right' : 'caret-down')}</button>
        <span class="okb-o-tag">${esc(label)}</span>
        <div class="okb-o-main">
          <div class="okb-o-line">${title}</div>
          <div class="okb-o-meta"><span class="okb-kind okb-kind-${o.level}">${kinds[o.level] || ''}</span>${o.planning?.type === 'bonus' ? `<span class="okb-kind">${tr('奖励目标', 'Bonus')}</span>` : ''}${parent ? `<button type="button" class="okb-align-chip" data-okr="open-o" data-id="${esc(parent.id)}" title="${esc(txt(parent.title))}">${icon('arrow-bend-left-up')} ${tr('对齐：', 'Aligned to: ')}${tx(parent.title)}</button>` : ''}${children.length ? `<span class="okb-meta-text">${icon('tree-structure')} ${tr(children.length + ' 个目标对齐到此', children.length + ' aligned below')}</span>` : ''}</div>
        </div>
        <div class="okb-o-side">
          ${simple() ? `${pointsChip(o, editableO)}${krs.length ? earnedChip(o) : scoreBlock('o', o, o)}` : weight}
          ${simple() ? '' : `<div class="okb-o-progress">${bar(pct)}<span class="okb-pct">${pct === null ? '—' : pct + '%'}</span></div>`}
          <button type="button" class="okb-btn small" data-okr="open-o" data-id="${esc(o.id)}">${icon('chat-circle-text')} ${tr('进展', 'Updates')}${updates?.items?.length ? ` ${updates.items.length}` : ''}</button>
          <div class="okb-o-more"><button type="button" class="okb-icon-btn" data-okr="menu" data-kind="o" data-id="${esc(o.id)}" aria-label="${tr('更多操作', 'More actions')}">${icon('dots-three')}</button>${menuOpen ? popover([
            ['open-o', tr('查看详情与进展', 'Details & updates'), o.id],
            editableO && ['edit-align', tr('设置对齐', 'Set alignment'), o.id],
            editableO && ['edit-o-desc', tr('编辑描述', 'Edit description'), o.id],
            o.importSource && ['source', tr('历史原始记录', 'Historical source record'), o.id],
            editableO && ['remove-o', tr('删除目标', 'Delete objective'), o.id, '', true],
          ]) : ''}</div>${editableO ? removeBtn('o', o.id) : ''}
        </div>
      </header>
      ${ui.scoring && ui.scoring.kind === 'o' && ui.scoring.id === o.id ? scoreForm('o', o, o) : ''}
      ${simple() && o.planning?.description && !collapsed ? `<div class="okb-o-done">${icon('flag-checkered')} ${tx(o.planning.description)}</div>` : ''}
      ${simple() ? (collapsed ? '' : simpleKrs(o, krs, edit)) : `${collapsed ? '' : `<div class="okb-krs">${krs.map((k, i) => krRow(o, k, i)).join('') || `<div class="okb-empty-row">${tr('还没有关键结果。KR 应是可衡量的结果，例如“新增 30 家经销商”。', 'No key results yet. A KR is a measurable result, e.g. “Sign 30 new dealers”.')}</div>`}
        ${weightWarn && !simple() ? `<div class="okb-warn">${icon('warning')} ${tr(`KR 权重合计 ${krWeights}%，应等于目标权重 ${o.planning.weight}%`, `KR weights total ${krWeights}%; they should equal the objective weight ${o.planning.weight}%`)}</div>` : ''}
        ${edit ? (ui.adding && ui.adding.kind === 'kr' && ui.adding.id === o.id ? newKrForm(o) : `<button type="button" class="okb-add-row" data-okr="add-kr" data-id="${esc(o.id)}">${icon('plus')} ${tr('添加关键结果', 'Add key result')}</button>`) : ''}</div>`}`}
    </article>`;
  }
  function newKrForm(o) {
    if (simple()) {
      const ks = krsOf(o), used = krSum(o), left = Math.max(0, Math.round((100 - used) * 100) / 100), fk = 'new-kr:' + o.id, def = formVal(fk, 'weight', left > 0 ? left : Math.round(100 / (ks.length + 1)));
      return `<form class="okb-new-kr okb-new-kr-simple" id="okr-new-kr" data-objective-id="${esc(o.id)}">
        <span class="okb-kr-tag">KR${krsOf(o).length + 1}</span>
        <input name="title" value="${esc(formVal(fk, 'title'))}" placeholder="${tr('关键结果：怎样证明目标达成，例如：新增 30 家经销商', 'Key result, e.g. Sign 30 new dealers')}" required minlength="2" maxlength="300" data-okr-autofocus>
        <label class="okb-mini okb-target"><span>${tr('目标值', 'Target')}</span><input name="targetText" value="${esc(formVal(fk, 'targetText'))}" required maxlength="120" placeholder="${tr('填“完成”，或明确数字：30 家 / 3%', '“Done”, or a number: 30 dealers / 3%')}"></label>
        <label class="okb-mini"><span>${tr('权重 %（占本目标）', 'Weight % of objective')}</span><input name="weight" type="number" min="1" max="100" step="0.01" value="${esc(def)}" required data-okr-weight-preview="kr" data-objective="${esc(o.id)}"></label>
        <div class="okb-form-actions"><span class="okb-form-tip" data-okr-preview>${previewText('kr', o.id, def)}</span><button class="okb-btn primary small" type="submit">${tr('添加', 'Add')}</button><button class="okb-btn small" type="button" data-okr="cancel-add">${tr('取消', 'Cancel')}</button></div>
        <p class="okb-form-error" role="alert"></p>
      </form>`;
    }
    const remaining = Number.isFinite(o.planning?.weight) ? Math.max(0, Math.round((o.planning.weight - krsOf(o).reduce((s, k) => s + (k.planning?.weight || 0), 0)) * 100) / 100) : '', fk = 'new-kr:' + o.id, fv = name => esc(formVal(fk, name));
    return `<form class="okb-new-kr" id="okr-new-kr" data-objective-id="${esc(o.id)}">
      <span class="okb-kr-tag">KR${krsOf(o).length + 1}</span>
      <input name="title" value="${fv('title')}" placeholder="${tr('输入关键结果，例如：新增 30 家经销商', 'Key result, e.g. Sign 30 new dealers')}" required minlength="3" maxlength="300" data-okr-autofocus>
      <label class="okb-mini"><span>${tr('目标值', 'Target')}</span><input name="target" type="number" step="any" value="${fv('target')}" required></label>
      <label class="okb-mini"><span>${tr('单位', 'Unit')}</span><input name="unit" maxlength="30" value="${fv('unit')}" required placeholder="${tr('家 / % / 元', 'units')}"></label>
      <label class="okb-mini"><span>${tr('权重 %', 'Weight %')}</span><input name="weight" type="number" min="0.01" max="100" step="0.01" value="${esc(formVal(fk, 'weight', remaining || ''))}"></label>
      <details class="okb-more-fields"><summary>${tr('更多', 'More')}</summary>
        <label class="okb-mini"><span>${tr('基准值', 'Baseline')}</span><input name="baseline" type="number" step="any" value="${esc(formVal(fk, 'baseline', '0'))}" required></label>
        <label class="okb-mini"><span>${tr('方向', 'Direction')}</span><select name="direction"><option value="increase">${tr('越高越好', 'Higher is better')}</option><option value="decrease" ${formVal(fk, 'direction') === 'decrease' ? 'selected' : ''}>${tr('越低越好', 'Lower is better')}</option></select></label>
      </details>
      <div class="okb-form-actions"><button class="okb-btn primary small" type="submit">${tr('添加', 'Add')}</button><button class="okb-btn small" type="button" data-okr="cancel-add">${tr('取消', 'Cancel')}</button></div>
      <p class="okb-form-error" role="alert"></p>
    </form>`;
  }
  function newObjectiveForm(ownerId) {
    const owners = isManager() ? S().directory : [me()];
    const parents = S().objectives.filter(o => o.level !== 'personal' || o.owner_id !== ownerId), fv = (name, d = '') => formVal('new-o', name, d);
    return `<form class="okb-new-o" id="okr-new-o">
      <span class="okb-o-tag">O</span>
      <input name="title" value="${esc(fv('title'))}" placeholder="${tr('输入目标，例如：Q4 销售额增长 20%', 'Objective, e.g. Grow Q4 sales 20%')}" required minlength="3" maxlength="300" data-okr-autofocus>
      ${simple() ? `<input name="description" class="okb-o-desc-input" maxlength="4000" value="${esc(fv('description'))}" placeholder="${tr('怎样算完成？（可选）例如：转化率从 2% 提升到 3%', 'What does done look like? (optional)')}">` : ''}
      ${simple() ? (() => { const mine = objectivesOf(ownerId), used = mine.reduce((n, x) => n + (Number(x.planning?.weight) || 0), 0), left = Math.round((100 - used) * 100) / 100, def = left > 0 ? left : Math.round(100 / (mine.length + 1)); return `<label class="okb-mini"><span>${tr('分值（分）', 'Points')}</span><input name="weight" type="number" min="0.01" max="100" step="0.01" required value="${esc(fv('weight', def))}" title="${tr('所有目标合计 100 分；不是 100 时显示红色，不能最终发布', 'Objectives total 100; anything else shows red and blocks final publish')}"></label><span class="okb-form-tip" data-okr-preview>${mine.length && left <= 0 ? tr('现有目标已满 100 分，添加后合计会超出，再把红色的分值改回 100 即可', 'Existing objectives already total 100; after adding, fix the red total') : ''}</span>`; })() : ''}
      ${simple() ? `<details class="okb-more-fields"><summary>${tr('更多设置（可不填）', 'More settings (optional)')}</summary>` : ''}
      ${simple() ? '' : `<label class="okb-mini"><span>${tr('权重 %', 'Weight %')}</span><input name="weight" type="number" min="0.01" max="100" step="0.01" value="${esc(fv('weight'))}" required></label>`}
      ${isManager() ? `<label class="okb-mini"><span>${tr('负责人', 'Owner')}</span><select name="ownerId">${owners.map(u => `<option value="${esc(u.id)}" ${u.id === fv('ownerId', ownerId) ? 'selected' : ''}>${esc(u.display_name)}</option>`).join('')}</select></label>
      <label class="okb-mini"><span>${tr('层级', 'Level')}</span><select name="level"><option value="personal">${tr('个人目标', 'Personal')}</option><option value="department" ${fv('level') === 'department' ? 'selected' : ''}>${tr('部门目标', 'Department')}</option></select></label>` : `<input type="hidden" name="ownerId" value="${esc(me().id)}"><input type="hidden" name="level" value="personal">`}
      ${collab() && parents.length ? `<label class="okb-mini okb-wide"><span>${tr('对齐到', 'Align to')}</span><select name="parentObjectiveId"><option value="">${tr('不对齐', 'No alignment')}</option>${parents.map(p => `<option value="${esc(p.id)}" ${p.id === fv('parentObjectiveId') ? 'selected' : ''}>${esc(nameOf(p.level === 'company' ? null : p.owner_id))} · ${esc(txt(p.title))}</option>`).join('')}</select></label>` : ''}
      ${simple() ? '</details>' : ''}
      <div class="okb-form-actions"><span class="okb-hint">${tr('周期：', 'Cycle: ')}${esc(periodLabel(ui.cycle || nowPeriod()))}</span><button class="okb-btn primary small" type="submit">${tr('创建目标', 'Create objective')}</button><button class="okb-btn small" type="button" data-okr="cancel-add">${tr('取消', 'Cancel')}</button></div>
      <p class="okb-form-error" role="alert"></p>
    </form>`;
  }

  /* ---------- simple scoring ----------
   * Objective weight = points (e.g. O1 = 40). Key result weight = % of its objective.
   * Each KR (or an objective without KRs) is scored on six levels by the owner and the leader:
   * final = 50% self + 50% leader; a leader who finds the self score untrue can set it to 0.
   * KR points earned = objective points × KR % × final ÷ 100; scores above 100 add to the total. */
  const LEVELS = [[0, '未开展', 'Not started', 'l0'], [25, '严重滞后', 'Badly behind', 'l25'], [50, '部分完成', 'Partly done', 'l50'], [75, '接近完成', 'Nearly done', 'l75'], [100, '完成', 'Done', 'l100'], [125, '完成且卓越', 'Done & excellent', 'l125']];
  const level = v => LEVELS.find(l => l[0] === v) || LEVELS.reduce((a, b) => Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a);
  const num = v => Math.round(v * 10) / 10;
  const oPoints = o => Number(o.planning?.weight) || 0;
  const krSum = o => krsOf(o).reduce((n, x) => n + (Number(x.planning?.weight) > 0 ? Number(x.planning.weight) : 0), 0);
  // KR weights must add up to exactly 100% under each objective; a KR without a weight counts as 0 until it is set.
  const weightsOk = o => { const ks = krsOf(o); return !ks.length || (ks.every(x => Number(x.planning?.weight) > 0) && Math.abs(krSum(o) - 100) < 0.01); };
  const krShare = (o, k) => { return Number(k.planning?.weight) > 0 ? Number(k.planning.weight) : 0; };
  const krPoints = (o, k) => oPoints(o) * krShare(o, k) / 100;
  const finalOf = x => x?.scores?.final ?? null;
  const earnedOf = o => { const ks = krsOf(o); if (!ks.length) { const f = finalOf(o); return { earned:f === null ? null : oPoints(o) * f / 100, pending:f === null ? 1 : 0 }; } let e = 0, pending = 0; for (const k of ks) { const f = finalOf(k); if (f === null) pending++; else e += krPoints(o, k) * f / 100; } return { earned:pending === ks.length ? null : e, pending }; };
  const scoreChip = (sc, label) => { if (!sc) return `<span class="okb-lv lv-none"><em>${label}</em> —</span>`; const l = level(sc.score); return `<span class="okb-lv ${sc.veto ? 'lv-veto' : l[3]}" title="${esc(tr(l[1], l[2]))}${sc.comment ? ' · ' + esc(sc.comment) : ''}"><em>${label}</em> ${sc.veto ? tr('0 不实', '0 untrue') : sc.score}${sc.score === 125 && !sc.veto ? ` <i class="okb-star">${icon('crown-simple')}${tr('卓越', 'Excellent')}</i>` : ''}</span>`; };
  function scoreBlock(kind, item, o) {
    const ready = kind !== 'kr' || weightsOk(o), mine = o.owner_id === me()?.id && ready, lead = o.canLeadScore && ready, sc = item.scores || {};
    const btn = (k, label, can) => can ? `<button type="button" class="okb-sc-btn" data-okr="score" data-kind="${k}" data-target="${kind}" data-id="${esc(item.id)}">${scoreChip(sc[k === 'self' ? 'self' : 'manager'], label)}</button>` : scoreChip(sc[k === 'self' ? 'self' : 'manager'], label);
    const f = finalOf(item);
    return `<div class="okb-scores">${btn('self', tr('自评', 'Self'), mine)}${btn('manager', tr('领导评分', 'Leader'), lead)}<span class="okb-final ${f === null ? 'pending' : level(f)[3]}" title="${tr('最终评分 = 自评 50% + 领导评分 50%', 'Final = 50% self + 50% leader')}">${tr('最终', 'Final')} ${f === null ? tr('待评', 'pending') : num(f)}</span></div>`;
  }
  function pointsChip(o, editable) {
    const label = `${num(oPoints(o))} ${tr('分', 'pts')}`;
    return editable ? editableChip('o-weight', o, label) : `<span class="okb-pts">${label}</span>`;
  }
  function editableChip(kind, o, label) { return ui.editing && ui.editing.kind === kind && ui.editing.id === o.id ? editable(kind, o.id, o.planning?.weight, '', 'number') : `<button type="button" class="okb-pts" data-okr="edit" data-kind="${kind}" data-id="${esc(o.id)}" title="${tr('目标分值：所有目标合计 100 分', 'Objective points: all objectives add up to 100')}">${label}</button>`; }
  function earnedChip(o) { const e = earnedOf(o); return `<span class="okb-earned" title="${tr('= Σ（目标分值 × KR 权重 × KR 最终分）', '= Σ (points × KR % × KR final score)')}">${tr('得', 'Earned')} <b>${e.earned === null ? '—' : num(e.earned)}</b> / ${num(oPoints(o))}${e.pending ? `<i>${tr(`${e.pending} 条待评`, `${e.pending} pending`)}</i>` : ''}</span>`; }
  function simpleKrs(o, krs, edit) {
    const sumW = krs.reduce((n, k) => n + (Number.isFinite(k.planning?.weight) ? k.planning.weight : 0), 0), allSet = krs.length && krs.every(k => Number.isFinite(k.planning?.weight));
    const live = !!(edit && collab() && krs.length), wCls = krs.length ? (weightsOk(o) ? 'w-ok' : 'w-bad') : '';
    return `<div class="okb-krs okb-krs-simple">${krs.map((k, i) => { const share = krShare(o, k), pts = krPoints(o, k), f = finalOf(k); const target = k.planning?.targetText || (Number.isFinite(k.target) && k.unit !== '完成' ? `${k.target} ${k.unit || ''}` : tr('完成', 'Done'));
      return `<div class="okb-kr okb-kr-simple ${live ? 'okb-removable' : ''}" data-kr="${esc(k.id)}"><span class="okb-kr-tag">KR${i + 1}</span>
        <div class="okb-kr-main"><div class="okb-kr-title">${edit && collab() ? editable('kr-title', k.id, k.title, `<button type="button" class="okb-title-btn" data-okr="edit" data-kind="kr-title" data-id="${esc(k.id)}" title="${esc(tr('点击修改', 'Click to edit'))}">${tx(k.title)}</button>`) : `<span>${tx(k.title)}</span>`}</div><div class="okb-kr-target">${icon('flag')} ${tr('目标值', 'Target')}：${edit && collab() ? editable('kr-target', k.id, k.planning?.targetText || target, `<button type="button" class="okb-title-btn okb-target-btn" data-okr="edit" data-kind="kr-target" data-id="${esc(k.id)}" title="${esc(tr('点击修改目标值', 'Click to edit the target'))}">${tx(target)}</button>`) : tx(target)}</div></div>
        <div class="okb-kr-weight">${live ? `<label class="okb-w-edit ${wCls}"><input type="number" min="0" max="100" step="0.01" inputmode="decimal" data-okr-w="${esc(k.id)}" data-okr-field="kr-weight:${esc(k.id)}" data-objective="${esc(o.id)}" value="${esc(saver.drafts.get('kr-weight:' + k.id)?.value ?? (Number(k.planning?.weight) > 0 ? Number(k.planning.weight) : ''))}" aria-label="${esc(tr(`KR${i + 1} 权重 %`, `KR${i + 1} weight %`))}" title="${esc(tr('直接修改，自动保存', 'Edit; saves automatically'))}"><span>%</span><em data-okr-wpts="${esc(k.id)}">${num(pts)} ${tr('分', 'pts')}</em></label>` : `<span class="okb-w-static ${wCls}">${num(share)}% · ${num(pts)} ${tr('分', 'pts')}</span>`}</div>
        <div class="okb-kr-score">${scoreBlock('kr', k, o)}</div>
        <div class="okb-kr-got" title="${esc(tr(`${num(oPoints(o))} 分 × ${num(share)}% × ${f === null ? '待评' : num(f) + '%'}`, `${num(oPoints(o))} × ${num(share)}% × ${f === null ? 'pending' : num(f) + '%'}`))}">${f === null ? '—' : num(pts * f / 100)}</div>
        ${live ? removeBtn('kr', k.id) : ''}</div>${ui.scoring && ui.scoring.kind === 'kr' && ui.scoring.id === k.id ? scoreForm('kr', k, o) : ''}`; }).join('') || `<div class="okb-empty-row">${tr('还没有关键结果。没有 KR 时直接给整个目标打分；也可以添加 KR，按权重拆分分值。', 'No key results. Score the objective directly, or add KRs to split its points by weight.')}</div>`}
      ${krs.length ? `<div class="okb-w-line" data-okr-wline="${esc(o.id)}">${wLine(sumW, krs.filter(k => !(Number(k.planning?.weight) > 0)).length, live, o.id)}</div>` : ''}
      ${edit ? (ui.adding && ui.adding.kind === 'kr' && ui.adding.id === o.id ? newKrForm(o) : `<div class="okb-add-line"><button type="button" class="okb-add-row" data-okr="add-kr" data-id="${esc(o.id)}">${icon('plus')} ${tr('添加关键结果', 'Add key result')}</button></div>`) : ''}</div>`;
  }
  /* KR weights are typed in place and saved on their own (no confirm). Green when an objective's KRs total exactly 100%, red otherwise with how far off. */
  function wLine(sum, zero, live, oid) {
    const t = Math.round(sum * 100) / 100, d = Math.round((100 - t) * 100) / 100;
    if (Math.abs(d) < 0.01 && !zero) return `<span class="okb-w-ok">${icon('check-circle')} ${tr('KR 权重合计 100%', 'KR weights total 100%')}</span>`;
    return `<span class="okb-w-bad">${icon('warning')} ${tr(`KR 权重合计 ${num(t)}%，${d > 0 ? `离 100% 还差 ${num(d)}%` : `超出 100% ${num(-d)}%`}${zero ? `；有 ${zero} 条未填` : ''}`, `KR weights total ${num(t)}%: ${d > 0 ? `${num(d)}% short of 100%` : `${num(-d)}% over 100%`}${zero ? `; ${zero} empty` : ''}`)}</span>${live ? `<button type="button" class="okb-btn small" data-okr="weights-even-save" data-id="${esc(oid)}">${tr('平均分配', 'Split evenly')}</button>` : ''}<em class="okb-w-note">${tr('合计 100% 后才能评分和最终发布', 'Scoring and final publish need exactly 100%')}</em>`;
  }
  /* KR weight editor: people type each KR's % themselves; saving needs exactly 100% in total. */
  const wTotal = krs => Math.round(krs.reduce((n, k) => n + (Number(ui.wDraft[k.id]) || 0), 0) * 100) / 100;
  const wReady = krs => Math.abs(wTotal(krs) - 100) < 0.01 && krs.every(k => Number(ui.wDraft[k.id]) > 0);
  function wStatus(krs) { const t = wTotal(krs), d = Math.round((100 - t) * 100) / 100, zero = krs.filter(k => !(Number(ui.wDraft[k.id]) > 0)).length;
    return wReady(krs) ? `<span class="okb-w-ok">${icon('check-circle')} ${tr('合计 100%，可以保存', 'Total 100%; ready to save')}</span>` : `<span class="okb-w-bad">${icon('warning')} ${tr(`合计 ${num(t)}%，${d > 0 ? `还差 ${num(d)}%` : `超出 ${num(-d)}%`}${zero ? `；有 ${zero} 条是 0` : ''}`, `Total ${num(t)}%, ${d > 0 ? `${num(d)}% short` : `${num(-d)}% over`}${zero ? `; ${zero} at 0` : ''}`)}</span>`; }
  function weightBar(o, krs) {
    return `<div class="okb-w-bar" data-okr-wbar="${esc(o.id)}"><span class="okb-w-hint">${tr('自己填写每条 KR 的权重，同一个目标下合计 100% 即可。', 'Type each KR’s weight; they just need to total 100% under this objective.')}</span><span data-okr-wsum>${wStatus(krs)}</span>
      <button type="button" class="okb-btn small" data-okr="weights-even" data-id="${esc(o.id)}">${tr('平均分配', 'Split evenly')}</button><button type="button" class="okb-btn small" data-okr="weights-cancel">${tr('取消', 'Cancel')}</button><button type="button" class="okb-btn primary small" data-okr="weights-save" data-id="${esc(o.id)}" ${wReady(krs) ? '' : 'disabled'}>${tr('保存权重', 'Save weights')}</button></div>`;
  }
  function totalScore(objs) {
    if (!objs.length) return '';
    const pts = objs.reduce((n, o) => n + oPoints(o), 0), list = objs.map(earnedOf), got = list.reduce((n, e) => n + (e.earned || 0), 0), pending = list.reduce((n, e) => n + e.pending, 0), any = list.some(e => e.earned !== null);
    const cls = !any ? 'pending' : got >= 100 ? 'good' : got >= 75 ? 'ok' : got >= 50 ? 'mid' : 'low';
    return `<div class="okb-total ${cls}"><strong>${any ? num(got) : '—'}</strong><span>${tr('OKR 总分', 'OKR score')} / ${num(pts)}${pending ? ` · ${tr(`${pending} 项待评`, `${pending} pending`)}` : ''}</span><button type="button" class="okb-link okb-howto" data-okr="score-help">${icon('info')} ${tr('计算方式', 'How it’s calculated')}</button></div>`;
  }
  function scoreHelp(objs) {
    if (!ui.scoreHelp) return '';
    const pts = objs.reduce((n, o) => n + oPoints(o), 0);
    return `<div class="okb-howto-panel"><h4>${icon('calculator')} ${tr('OKR 分数怎么算', 'How OKR scores work')}</h4>
      <ol><li>${tr('<b>目标按分值算</b>：每个目标填一个分值，所有目标合计 100 分（例如 O1 = 40 分）。', '<b>Objectives carry points</b>: all objectives add up to 100 (e.g. O1 = 40).')}${Math.abs(pts - 100) > 0.01 ? ` <span class="okb-warn-inline">${tr(`当前合计 ${num(pts)} 分`, `currently ${num(pts)}`)}</span>` : ''}</li>
      <li>${tr('<b>KR 按百分比算</b>：KR 权重是占所属目标分值的百分比，同一目标下合计 100%（例如 KR 25% = 40 分 × 25% = 10 分）。', '<b>Key results are percentages</b> of their objective, adding up to 100% (KR 25% of 40 = 10 points).')}</li>
      <li>${tr('<b>六档评分</b>：0 未开展 · 25 严重滞后 · 50 部分完成 · 75 接近完成 · 100 完成 · 125 完成且卓越。', '<b>Six levels</b>: 0 not started · 25 badly behind · 50 partly · 75 nearly · 100 done · 125 done & excellent.')}</li>
      <li>${tr('<b>最终分 = 自评 50% + 领导评分 50%</b>；领导发现自评不实，可以直接把这条 KR 判为 0 分。', '<b>Final = 50% self + 50% leader</b>; a leader who finds a self score untrue can set that KR to 0.')}</li>
      <li>${tr('<b>得分</b> = 目标分值 × KR 权重 × 最终分；所有 KR 相加就是 OKR 总分。评到 125 的部分会让总分超过 100，这是允许的。', '<b>Points</b> = objective points × KR % × final score; the sum is the OKR score. 125-level scores can push the total above 100.')}</li></ol>
      <p class="okb-hint">${tr('例：O1 40 分，KR1 权重 25%，自评 100、领导 75 → 最终 87.5 → 得 40 × 25% × 87.5% = 8.75 分。', 'Example: O1 = 40, KR1 = 25%, self 100, leader 75 → final 87.5 → 40 × 25% × 87.5% = 8.75 points.')}</p></div>`;
  }
  const apiBase = () => (window.WORKOS_CONFIG && window.WORKOS_CONFIG.apiBase) || '/api';
  function evidenceList(sc) {
    const files = sc?.evidence || [];
    return files.length ? `<ul class="okb-evidence">${files.map(f => `<li><a href="${esc(apiBase() + '/tasks/' + encodeURIComponent(f.taskId) + '/attachments/' + encodeURIComponent(f.id))}" target="_blank" rel="noopener">${icon('paperclip')} ${esc(f.name)}</a></li>`).join('')}</ul>` : '';
  }
  async function uploadEvidence(taskId, file) {
    if (file.size > 8 * 1024 * 1024) throw new Error(tr(`${file.name} 超过 8 MB`, `${file.name} is larger than 8 MB`));
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error(tr('文件读取失败', 'Could not read the file'))); r.readAsDataURL(file); });
    return ctx.api.post('/tasks/' + encodeURIComponent(taskId) + '/attachments', { name:file.name, mime:file.type || 'application/octet-stream', dataBase64:b64 });
  }
  function scoreForm(target, item, o) {
    const kind = ui.scoring.who, cur = item.scores?.[kind], self = item.scores?.self;
    return `<form class="okb-score-form" id="okr-score" data-id="${esc(item.id)}" data-kind="${kind}" data-target="${target}">
      <h4>${kind === 'self' ? tr('自评', 'Self score') : tr('领导评分', 'Leader score')} · ${tx(item.title)}</h4>
      ${kind === 'manager' && self ? `<p class="okb-hint">${tr('员工自评', 'Self score')}：${scoreChip(self, '')}${self.comment ? ' ' + tx(self.comment) : ''}</p>${evidenceList(self)}` : ''}
      <div class="okb-levels">${LEVELS.map(([v, zh, en, cls]) => `<label class="okb-level ${cls}"><input type="radio" name="score" value="${v}" ${cur && !cur.veto && cur.score === v ? 'checked' : ''} required><b>${v}</b><span>${tr(zh, en)}</span>${v === 125 ? `<i class="okb-star">${icon('crown-simple')}</i>` : ''}</label>`).join('')}</div>
      ${kind === 'self' ? `<label class="okb-mini okb-wide"><span>${tr('完成情况说明', 'What you achieved')}</span><textarea name="comment" maxlength="2000" rows="3" placeholder="${tr('写清楚做了什么、结果数字是多少（至少 10 个字）', 'Describe what you did and the result, with numbers (at least 10 characters)')}">${esc(cur?.comment || '')}</textarea></label>
      ${target === 'kr' && item.task_id ? `<label class="okb-mini okb-wide okb-file"><span>${tr('上传证明文件（截图、报表、PDF 等）', 'Upload proof (screenshot, report, PDF…)')}</span><input type="file" name="files" multiple accept="image/*,application/pdf,.csv,.txt,.xlsx,.xls,.docx,.doc,.pptx"></label>` : ''}
      <p class="okb-hint okb-evidence-rule">${icon('info')} ${target === 'kr' && item.task_id ? tr('文字说明和证明文件至少提交一项，自评才算完成。', 'A self score counts only with a written explanation or an uploaded file.') : tr('需要写清楚完成情况，自评才算完成。', 'A self score counts only with a written explanation.')}</p>${evidenceList(cur)}` : `<label class="okb-mini okb-wide"><span>${tr('评语（可选）', 'Comment (optional)')}</span><input name="comment" maxlength="2000" value="${esc(cur?.comment || '')}"></label>`}
      ${kind === 'manager' ? `<label class="okb-veto"><input type="checkbox" name="veto" ${cur?.veto ? 'checked' : ''}> ${tr('自评不实：这条直接判 0 分', 'Self score is untrue: set this to 0')}</label>` : ''}
      <p class="okb-form-error" role="alert"></p>
      <div class="okb-form-actions"><button class="okb-btn primary small" type="submit">${kind === 'self' ? tr('提交自评', 'Submit self score') : tr('保存评分', 'Save score')}</button><button class="okb-btn small" type="button" data-okr="score-cancel">${tr('取消', 'Cancel')}</button></div>
    </form>`;
  }

  /* ---------- monthly rhythm banner ---------- */
  const okrCycles = new Map();
  function cycleBanner() {
    if (!S().capabilities?.okrCycle) return '';
    const p = ui.cycle || nowPeriod();
    if (!okrCycles.has(p)) { okrCycles.set(p, null); ctx.api.get('/okr/cycle?period=' + p).then(c => { okrCycles.set(p, c); rerender(); }).catch(() => {}); }
    const c = okrCycles.get(p); if (!c) return '';
    const md = d => { const [, m, dd] = d.split('-').map(Number); return lang() === 'en' ? `${m}/${dd}` : `${m}月${dd}日`; };
    const steps = [['setup', tr('设置 OKR', 'Set OKR'), `${md(c.setupFrom)} – ${md(c.setupUntil)}`, tr('每天提醒，直到目标合计 100 分', 'Daily reminders until objectives total 100')], ['self', tr('员工自评', 'Self score'), `${md(c.selfFrom)} – ${md(c.selfUntil)}`, tr('逾期未自评按 0 分', 'Missing self scores count as 0')], ['lead', tr('领导评分', 'Leader score'), `${md(c.leadFrom)} – ${md(c.leadUntil)}`, tr('每天催办', 'Daily reminders')]];
    return `<div class="okb-cycle">${icon('calendar-check')}<strong>${esc(periodLabel(p))} OKR</strong>${steps.map(([id, label, range, note]) => `<span class="okb-step ${c.phase === id ? 'now' : ''}" title="${esc(note)}"><b>${label}</b>${range}${c.phase === id ? `<em>${tr('进行中', 'Now')}</em>` : ''}</span>`).join(`<i class="okb-step-sep">${icon('caret-right')}</i>`)}</div>`;
  }

  /* ---------- person view ---------- */
  /* What the others become after this weight is set (same proportional rule as the server). */
  function previewText(kind, objectiveId, w) {
    const others = kind === 'kr' ? krsOf(objectiveById(objectiveId)).map((k, i) => ({ label:'KR' + (i + 1), w:Number(k.planning?.weight) || 0 })) : [];
    if (!others.length) return tr('同一目标下 KR 权重合计 100%', 'KR weights total 100%');
    const sum = others.reduce((a, b) => a + b.w, 0), target = Math.max(0, 100 - (Number(w) || 0));
    if (Math.abs(sum - target) < 0.01) return tr(`= ${num(oPoints(objectiveById(objectiveId)) * (Number(w) || 0) / 100)} 分；合计正好 100%`, `= ${num(oPoints(objectiveById(objectiveId)) * (Number(w) || 0) / 100)} pts; total exactly 100%`);
    const t = Math.round((sum + (Number(w) || 0)) * 100) / 100, d = Math.round((100 - t) * 100) / 100;
    return tr(`添加后合计 ${num(t)}%，${d > 0 ? `还差 ${num(d)}%` : `超出 ${num(-d)}%`}；其他 KR 不会自动改，添加后直接改红色的权重即可。`, `Total after adding: ${num(t)}% (${d > 0 ? `${num(d)}% short` : `${num(-d)}% over`}); other KRs stay as they are, edit the red weights after adding.`);
  }
  function readiness(objs) {
    const problems = [], total = objs.reduce((s, o) => s + (Number(o.planning?.weight) > 0 ? Number(o.planning.weight) : 0), 0);
    if (!objs.length) problems.push(tr('还没有目标', 'No objectives yet'));
    else if (Math.abs(total - 100) > 0.01) problems.push(tr(`目标分值合计 ${num(total)} 分，必须正好 100 分`, `objectives total ${num(total)} points; must be exactly 100`));
    objs.forEach((o, i) => { if (!weightsOk(o)) problems.push(tr(`O${i + 1} 的 KR 权重合计 ${num(krSum(o))}%，必须正好 100%`, `O${i + 1} KR weights total ${num(krSum(o))}%; must be exactly 100%`)); });
    return problems;
  }
  function publishBar(id, objs) {
    if (S().capabilities?.okrPublish !== true) return '';
    const pub = publication(id, ui.cycle), mine = id === me()?.id;
    if (pub) return `<div class="okb-pub done">${icon('lock-simple')}<b>${tr('已最终发布', 'Published')}</b><span>${new Date(pub.publishedAt).toLocaleDateString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'short', day:'numeric' })} · ${mine ? tr('内容已锁定；如需调整请联系你的领导。', 'Locked; ask your leader if it needs to change.') : leaderOf(id) ? tr('员工已锁定；你作为领导仍可以调整，员工会收到通知。', 'Locked for the owner; as their leader you can still adjust it, and they will be told.') : tr('内容已锁定。', 'Locked.')}</span></div>`;
    if (!mine) return `<div class="okb-pub pending">${icon('hourglass-medium')}<b>${tr('尚未发布', 'Not published')}</b><span>${tr('员工填写完成后会点击“最终发布”。', 'The owner publishes when finished.')}</span></div>`;
    const problems = readiness(objs);
    return `<div class="okb-pub ${problems.length ? 'pending' : 'ready'}">${icon(problems.length ? 'list-checks' : 'seal-check')}<b>${problems.length ? tr('还不能发布', 'Not ready to publish') : tr('可以最终发布', 'Ready to publish')}</b><span>${problems.length ? esc(problems.join('；')) : tr('发布后 OKR 将锁定，不能再修改，只有你的领导可以调整；每条 KR 会自动变成你的任务。', 'After publishing the OKR is locked; only your leader can change it. Each KR becomes a task for you.')}</span>${ui.confirm?.kind === 'publish' ? `<span class="okb-pub-confirm">${tr('确认发布？发布后不能撤回。', 'Publish now? This cannot be undone.')}<button type="button" class="okb-btn primary small" data-okr="publish-confirm">${tr('确认发布', 'Publish')}</button><button type="button" class="okb-btn small" data-okr="cancel-confirm">${tr('取消', 'Cancel')}</button></span>` : `<button type="button" class="okb-btn primary small" data-okr="publish" ${problems.length ? 'disabled' : ''}>${icon('paper-plane-tilt')} ${tr('最终发布', 'Publish')}</button>`}</div>`;
  }
  /* Objective points are typed freely like KR weights: green at exactly 100, red with how far off. */
  function pointsLine(objs) {
    const t = Math.round(objs.reduce((s, o) => s + (Number(o.planning?.weight) > 0 ? Number(o.planning.weight) : 0), 0) * 100) / 100, d = Math.round((100 - t) * 100) / 100;
    if (Math.abs(d) < 0.01) return `<span class="okb-w-ok">${icon('check-circle')} ${tr('目标分值合计 100 分', 'Objective points total 100')}</span>`;
    return `<span class="okb-w-bad">${icon('warning')} ${tr(`目标分值合计 ${num(t)} 分，${d > 0 ? `还差 ${num(d)} 分` : `超出 ${num(-d)} 分`}`, `Objective points total ${num(t)}: ${d > 0 ? `${num(d)} short of 100` : `${num(-d)} over 100`}`)}</span><em class="okb-w-note">${tr('合计 100 分后才能最终发布', 'Final publish needs exactly 100')}</em>`;
  }

  /* ---------- AI 帮我写 OKR ----------
   * The person describes the month in their own words; the server returns a draft, which is saved
   * straight away as ordinary unpublished objectives and KRs (no ticking, no separate add step).
   * They edit or remove (×, with undo) items in the normal list; Publish stays the only confirmation.
   * The creation steps are kept in the localStorage mirror until each one is confirmed, so a reload
   * in the middle resumes instead of losing the draft. */
  const aiCompany = id => id === me()?.id && companyMine();
  const aiAllowed = id => S().capabilities?.okrAiDraft === true && id === me()?.id && canCreateFor(id) && !publication(id, ui.cycle);
  function aiBox(id) {
    const a = ui.ai, q = aiState(aiPeriod()), working = a.busy || q.running;
    if (q.text !== a.text && !working) a.text = q.text;
    return `<div class="okb-ai">
      <div class="okb-ai-head">${icon('sparkle')}<b>${tr('AI 帮我写 OKR', 'Draft my OKR with AI')}</b><span>${tr(aiCompany(id) ? '写下这个月公司想做成什么，AI 会整理成目标和关键结果，并直接保存为草稿。' : '写下这个月你想做成什么，AI 会参考公司目标整理成你的 OKR，并直接保存为草稿。', aiCompany(id) ? 'Describe what the company should achieve this month; AI turns it into objectives and key results and saves them as a draft.' : 'Describe what you want to achieve this month; AI turns it into your OKR, aligned to company objectives, and saves it as a draft.')}</span></div>
      <textarea id="okr-ai-text" rows="3" maxlength="3000" placeholder="${esc(tr('例：11 月做到 40 万销售，其中广告 25 万（预算 2 万）、线下 15 万；12 月前把 XRF Gen2 和 Galvo Flex 的上市准备做完……', 'e.g. Reach $400k sales in November: $250k from ads (budget $20k) and $150k offline; get XRF Gen2 and Galvo Flex launch-ready before December…'))}">${esc(a.text)}</textarea>
      <div class="okb-form-actions"><button type="button" class="okb-btn primary small" data-okr="ai-generate" ${working ? 'disabled' : ''}>${icon('sparkle')} ${a.busy ? tr('正在生成…', 'Drafting…') : q.running ? tr('正在保存…', 'Saving…') : tr('生成并保存草稿', 'Draft and save')}</button>${a.error ? `<span class="okb-form-error" role="alert">${esc(a.error)}</span>` : ''}</div>
      <p class="okb-hint">${a.note ? esc(a.note) : tr('生成的目标和 KR 会直接出现在下面，照常修改即可，不需要的点 × 删除；合计不是 100 会标红。确认无误后点“最终发布”。', 'The objectives and KRs appear below, saved as a draft. Edit them as usual and remove what you don’t want with ×; totals other than 100 show red. Press Publish when it’s right.')}</p>
    </div>`;
  }
  /* One step list per AI draft: each objective with its KR request bodies, in order. */
  function aiQueue(objectives, period) {
    const asCompany = aiCompany(me()?.id);
    return objectives.filter(o => String(o.title || '').trim().length >= 3).map(o => ({
      id:null,
      body:{ title:String(o.title).trim().slice(0, 300), level:asCompany ? 'company' : 'personal', ...(asCompany ? {} : { ownerId:me().id }), planning:{ period, weight:Math.min(100, Math.max(0.01, Number(o.points) || 0.01)), location:'', description:String(o.description || '').trim().slice(0, 4000), type:'mandatory', bonusIncluded:false, scoringDueDate:dueDateFor(period) }, ...(collab() && !asCompany && o.alignTo ? { parentObjectiveId:o.alignTo } : {}) },
      krs:(o.keyResults || []).filter(k => String(k.title || '').trim().length >= 2).map(k => {
        const text = String(k.target || '').trim().slice(0, 120) || tr('完成', 'Done'), m = /^\$?([0-9][0-9,]*(?:\.[0-9]+)?)\s*(.*)$/.exec(text), n = m ? Number(m[1].replace(/,/g, '')) : 0;
        const planning = { weight:Math.min(100, Math.max(0.01, Number(k.weight) || 0.01)), description:'', targetText:text }, title = String(k.title).trim().slice(0, 300);
        return n > 0 ? { title, baseline:0, target:n, direction:'increase', unit:((text.startsWith('$') ? 'USD ' : '') + (m[2] || '')).trim().slice(0, 30) || tr('项', 'units'), planning } : { title, baseline:0, target:1, direction:'increase', unit:'完成', planning };
      }),
    }));
  }
  async function runAiQueue(period) {
    const a = aiState(period); if (!a.queue?.length || a.running) return 0;
    a.running = true; a.error = ''; paintStatus();
    let made = 0;
    try {
      if (a.queue.some(x => x.resumed)) await ctx.refreshOkr(); // see what the interrupted run already saved before continuing
      while (a.queue.length) {
        const step = a.queue[0];
        if (!step.id) {
          // After a reload, an objective whose response was lost may already exist: reuse it instead of a duplicate.
          const dup = step.resumed && S().objectives.find(o => o.title === step.body.title && periodOf(o) === period && (step.body.level === 'company' ? o.level === 'company' : o.owner_id === step.body.ownerId));
          step.id = dup ? dup.id : (await ctx.api.post('/objectives', step.body))?.id;
          if (!step.id) throw new Error(tr('目标没有保存成功', 'The objective was not saved'));
          writeStore(period);
        }
        while (step.krs.length) {
          const k = step.krs[0];
          if (!(step.resumed && S().krs.some(x => x.objective_id === step.id && x.title === k.title))) await ctx.api.post('/objectives/' + encodeURIComponent(step.id) + '/key-results', k);
          step.krs.shift(); writeStore(period);
        }
        a.queue.shift(); made++; writeStore(period);
      }
      a.queue = null; a.text = ''; writeStore(period);
      saver.saved = true;
    } catch (e) {
      a.error = (made ? tr(`已保存 ${made} 个目标，其余没有保存成功：`, `Saved ${made} objectives; the rest failed: `) : tr('AI 草稿没有保存成功：', 'The AI draft was not saved: ')) + ctx.explainError(e);
      if (!e?.status) retrySoon();
    } finally { a.running = false; }
    try { await ctx.refreshOkr(); } catch {}
    paintStatus(); softRerender();
    return made;
  }
  async function aiGenerate() {
    const text = (document.getElementById('okr-ai-text')?.value || ui.ai.text || '').trim(), period = aiPeriod();
    ui.ai.text = text; aiState(period).text = text; writeStore(period);
    if (text.length < 4) { ui.ai.error = tr('请先写几句这个月想做的事。', 'Write a few words about this month first.'); return rerender(); }
    ui.ai.busy = true; ui.ai.error = ''; ui.ai.note = ''; rerender();
    try {
      const r = await ctx.api.post('/okr/ai-draft', { text, period, lang:lang(), company:aiCompany(me()?.id) });
      const queue = aiQueue(r?.objectives || [], period);
      if (!queue.length) ui.ai.error = tr('AI 没有整理出目标，请多写几句具体想做成的事再试。', 'The AI found no objectives; describe what you want to achieve in more detail.');
      else {
        const a = aiState(period); a.queue = [...(a.queue || []), ...queue]; writeStore(period);
        ui.ai.busy = false;
        const made = await runAiQueue(period);
        if (made && !a.queue?.length) {
          ui.ai.text = ''; a.text = ''; ui.ai.note = tr(`已按 AI 草稿保存 ${made} 个目标（未发布）。直接在下面修改，不需要的点 × 删除；分值和权重合计 100 后即可最终发布。`, `Saved ${made} objectives from the AI draft (not published). Edit them below and remove what you don’t want with ×; publish once the totals are 100.`);
          ctx.toast(tr(`已保存 ${made} 个目标草稿`, `Saved ${made} draft objectives`));
        }
      }
    } catch (e) { ui.ai.error = ctx.explainError(e); }
    finally { ui.ai.busy = false; rerender(); }
  }
  document.addEventListener('input', e => {
    if (e.target.id !== 'okr-ai-text') return;
    const period = aiPeriod(), a = aiState(period);
    ui.ai.text = a.text = e.target.value; writeStore(period);
  });

  function personView(id) {
    const objs = objectivesOf(id), pct = averagePct(objs), company = id === '__company';
    const total = objs.reduce((s, o) => s + (Number.isFinite(o.planning?.weight) ? o.planning.weight : 0), 0);
    const addable = !company && canCreateFor(id);
    return `<section class="okb-person">
      <header class="okb-person-head">${company ? `<span class="okb-avatar okb-company">${icon('buildings')}</span>` : avatar(id, 44)}<div><h2>${esc(company ? tr('公司目标', 'Company objectives') : nameOf(id))}${id === me()?.id ? ` <span class="okb-me">${tr('我', 'Me')}</span>` : ''}</h2><p>${esc(periodLabel(ui.cycle))} · ${objs.length} ${tr('个目标', objs.length === 1 ? 'objective' : 'objectives')}${objs.length ? (simple() ? ` · ${tr('目标分值合计', 'Objective points')} ${total} ${tr('分', 'pts')}${Math.abs(total - 100) > 0.01 ? ` <span class="okb-warn-inline">${tr('应为 100 分', 'should be 100')}</span>` : ''}` : ` · ${tr('目标权重合计', 'Objective weights')} ${total}%`) : ''}</p></div>${simple() ? totalScore(objs) : ring(pct, 52)}</header>${collab() ? `<div class="okb-save-line" data-okr-save aria-live="polite">${saveLine()}</div>` : ''}${simple() && !company ? publishBar(id, objs) : ''}${simple() ? scoreHelp(objs) : ''}
      ${simple() && aiAllowed(id) ? aiBox(id) : ''}
      ${objs.map(objectiveCard).join('') || `<div class="okb-empty"><div class="okb-empty-icon">${icon('target')}</div><h3>${tr('这个周期还没有目标', 'No objectives in this cycle')}</h3><p>${addable ? tr('目标（O）写“想达成什么”，关键结果（KR）写“怎样算达成”。先创建一个目标吧。', 'An objective (O) says what you want to achieve; key results (KR) say how you’ll know. Start with one objective.') : tr('负责人还没有为这个周期设置目标。', 'No objectives have been set for this cycle yet.')}</p></div>`}
      ${simple() && objs.length ? `<div class="okb-w-line okb-o-total">${pointsLine(objs)}</div>` : ''}
      ${addable ? (ui.adding && ui.adding.kind === 'o' ? newObjectiveForm(id) : `<button type="button" class="okb-add-row okb-add-o" data-okr="add-o">${icon('plus')} ${tr('添加目标', 'Add objective')}</button>`) : ''}
    </section>`;
  }

  /* ---------- remove with undo ----------
   * × hides the item at once and shows an undo bar; the archive request is sent only when the undo
   * window ends (or before publishing). Closing the page inside the window keeps the item. */
  function undoBar() {
    if (!ui.removing.size) return '';
    return `<div class="okb-undo" role="status">${[...ui.removing].map(([id, r]) => `<div class="okb-undo-item">${icon('trash')}<span>${r.kind === 'o' ? tr('已删除目标：', 'Removed objective: ') : tr('已删除 KR：', 'Removed KR: ')}<b>${tx(r.title)}</b></span><button type="button" class="okb-btn small" data-okr="undo-remove" data-id="${esc(id)}">${icon('arrow-counter-clockwise')} ${tr('撤销', 'Undo')}</button></div>`).join('')}</div>`;
  }
  function askRemove(kind, id) {
    const it = kind === 'o' ? objectiveById(id) : findKr(id); if (!it || ui.removing.has(id)) return;
    ui.removing.set(id, { kind, title:it.title, timer:later(() => commitRemove(id), UNDO_MS) });
    if (ui.editing?.id === id) ui.editing = null;
    rerender();
  }
  function undoRemove(id) { const r = ui.removing.get(id); if (!r) return; cancel(r.timer); ui.removing.delete(id); rerender(); }
  async function commitRemove(id) {
    const r = ui.removing.get(id); if (!r || r.sending) return; cancel(r.timer); r.sending = true;
    // Unsaved edits of a removed item are dropped; the archive goes after any save already on its way.
    for (const [key, d] of [...saver.drafts]) if (d.id === id || (r.kind === 'o' && findKr(d.id)?.objective_id === id)) dropDraft(key);
    try {
      await chain(r.kind + ':' + id, () => { const it = r.kind === 'o' ? objectiveById(id) : findKr(id); if (!it) return null; return r.kind === 'o' ? ctx.api.post('/objectives/' + encodeURIComponent(id) + '/archive', { expectedVersion:it.version || 1 }) : ctx.api.post('/key-results/' + encodeURIComponent(id) + '/archive', { expectedMetaVersion:it.meta_version || 1 }); });
      try { await ctx.refreshOkr(); } catch {}
      ui.removing.delete(id);
    } catch (e) { ui.removing.delete(id); ctx.toast(tr('删除没有成功，已恢复：', 'Could not remove it, so it is back: ') + ctx.explainError(e)); }
    softRerender();
  }
  const commitRemovals = () => Promise.all([...ui.removing.keys()].map(commitRemove));

  /* ---------- alignment view ---------- */
  function alignView() {
    const all = S().objectives.filter(inCycle);
    const byParent = new Map();
    all.forEach(o => { const key = o.parent_objective_id && all.some(p => p.id === o.parent_objective_id) ? o.parent_objective_id : '__root'; if (!byParent.has(key)) byParent.set(key, []); byParent.get(key).push(o); });
    const rank = { company:0, department:1, personal:2 };
    const node = (o, depth) => {
      const kids = (byParent.get(o.id) || []).sort((a, b) => rank[a.level] - rank[b.level]);
      const pct = objectivePct(o);
      return `<li><button type="button" class="okb-tree-node okb-kind-${o.level}" data-okr="open-o" data-id="${esc(o.id)}">${o.level === 'company' ? `<span class="okb-avatar okb-company">${icon('buildings')}</span>` : avatar(o.owner_id, 24)}<span class="okb-tree-title">${tx(o.title)}</span><span class="okb-tree-owner">${esc(o.level === 'company' ? tr('公司', 'Company') : nameOf(o.owner_id))}</span><span class="okb-tree-pct">${pct === null ? '—' : pct + '%'}</span></button>${kids.length ? `<ul>${kids.map(k => node(k, depth + 1)).join('')}</ul>` : ''}</li>`;
    };
    const roots = (byParent.get('__root') || []).sort((a, b) => rank[a.level] - rank[b.level]);
    return `<section class="okb-align"><p class="okb-hint">${collab() ? tr('从上到下展示公司、部门和个人目标的对齐关系。点击任一目标查看详情；在目标的“⋯”菜单里设置对齐。', 'Company, department and personal objectives by alignment. Click any objective for details; set alignment from its ⋯ menu.') : tr('对齐关系需要后台升级后才能设置。', 'Alignment requires the backend upgrade.')}</p>${roots.length ? `<ul class="okb-tree">${roots.map(r => node(r, 0)).join('')}</ul>` : `<div class="okb-empty"><h3>${tr('这个周期还没有目标', 'No objectives in this cycle')}</h3></div>`}</section>`;
  }

  /* ---------- page ---------- */
  function render() {
    if (!ctx) return '';
    ensureCycle();
    restoreAll(); restore(ui.cycle ?? ''); if (!ui.cycle) restore(nowPeriod());
    reconcile();
    const list = cycles();
    if (ui.tab === 'mine') ui.person = me()?.id;
    else if (ui.tab === 'team' && (!ui.person || !people().includes(ui.person))) ui.person = people().find(id => id !== '__company' && objectivesOf(id).length) || people()[0] || me()?.id;
    const tabs = [['mine', tr('我的 OKR', 'My OKRs'), 'user'], ['team', tr('团队 OKR', 'Team OKRs'), 'users-three'], ['align', tr('对齐视图', 'Alignment'), 'tree-structure']];
    return `<div class="okb">
      <div class="page-heading okb-heading"><div><div class="eyebrow">WORK OS · OKR</div><h1>${tr('OKR 目标', 'OKRs')}</h1><p>${tr('目标（O）说明想达成什么，关键结果（KR）说明怎样算达成。评分沿用员工自评 + 主管确认。', 'Objectives say what to achieve; key results say how you’ll know. Scoring keeps self evaluation + manager confirmation.')}</p></div>
        <div class="okb-cycle" role="group" aria-label="${tr('周期', 'Cycle')}"><button type="button" class="okb-icon-btn" data-okr="cycle-prev" aria-label="${tr('上一个周期', 'Previous cycle')}">${icon('caret-left')}</button><select data-okr-cycle aria-label="${tr('选择周期', 'Choose cycle')}">${list.map(p => `<option value="${esc(p)}" ${p === ui.cycle ? 'selected' : ''}>${esc(periodLabel(p))}</option>`).join('')}</select><button type="button" class="okb-icon-btn" data-okr="cycle-next" aria-label="${tr('下一个周期', 'Next cycle')}">${icon('caret-right')}</button></div></div>
      ${cycleBanner()}
      <nav class="okb-tabs" role="tablist">${tabs.map(([id, label, ic]) => `<button type="button" role="tab" aria-selected="${ui.tab === id}" class="${ui.tab === id ? 'active' : ''}" data-okr="tab" data-value="${id}">${icon(ic)} ${label}</button>`).join('')}<span class="okb-tabs-spacer"></span><button type="button" class="okb-btn small" data-okr="rubric">${icon('info')} ${tr('评分标准', 'Scoring guide')}</button></nav>
      ${ui.tab === 'align' ? alignView() : `<div class="okb-layout ${ui.tab === 'mine' ? 'okb-solo' : ''}">
        ${ui.tab === 'team' ? `<aside class="okb-people"><label class="okb-search">${icon('magnifying-glass')}<input data-okr-search placeholder="${tr('搜索成员', 'Search people')}" value="${esc(ui.search)}"></label>${simple() ? stageLegend() : ''}<ul>${peopleSections().map(([label, ids]) => (label ? `<li class="okb-people-group"><span>${label}</span><b>${ids.length}</b></li>` : '') + ids.map(id => { const objs = objectivesOf(id), pct = averagePct(objs); return `<li><button type="button" class="${ui.person === id ? 'active' : ''}" data-okr="person" data-id="${esc(id)}">${id === '__company' ? `<span class="okb-avatar okb-company">${icon('buildings')}</span>` : avatar(id)}<span class="okb-people-name">${esc(id === '__company' ? tr('公司目标', 'Company objectives') : nameOf(id))}${id === me()?.id ? ` <em>${tr('我', 'Me')}</em>` : ''}${viaOf(id) ? `<small class="okb-via">${icon('arrow-elbow-down-right')} ${tr('汇报给', 'reports to')} ${esc(nameOf(viaOf(id)))}</small>` : ''}</span>${simple() && id !== '__company' ? stageChips(id, objs) : `<span class="okb-people-pct">${objs.length ? (pct === null ? objs.length + tr(' 个', '') : pct + '%') : '—'}</span>`}</button></li>`; }).join('')).join('') || `<li class="okb-hint">${tr('没有匹配的成员', 'No matching people')}</li>`}</ul></aside>` : ''}
        <div class="okb-main">${ui.person ? personView(ui.person) : ''}</div>
      </div>`}
      ${undoBar()}
    </div>`;
  }

  /* ---------- drawer ---------- */
  function drawerHtml(o) {
    const krs = krsOf(o), pct = objectivePct(o), parent = o.parent_objective_id ? objectiveById(o.parent_objective_id) : null;
    const children = S().objectives.filter(x => x.parent_objective_id === o.id);
    const data = ui.updates.get(o.id) || { loading:true, items:[] };
    const editableO = canEdit(o) && collab();
    const aligning = ui.editing && ui.editing.kind === 'align' && ui.editing.id === o.id;
    const describing = ui.editing && ui.editing.kind === 'o-desc' && ui.editing.id === o.id;
    const candidates = S().objectives.filter(p => p.id !== o.id && !isDescendant(p.id, o.id));
    const fmt = v => { try { return new Intl.DateTimeFormat(lang() === 'en' ? 'en-US' : 'zh-CN', { dateStyle:'medium', timeStyle:'short' }).format(new Date(v)); } catch { return v; } };
    return `<div class="drawer-top okb-drawer-top"><span>${esc(periodLabel(periodOf(o)))} · ${esc(o.level === 'company' ? tr('公司目标', 'Company objective') : nameOf(o.owner_id))}</span><button class="icon-btn" data-live-action="close" aria-label="${tr('关闭', 'Close')}">${icon('x')}</button></div>
      <div class="drawer-body okb-drawer-body">
        <div class="okb-d-title"><h2 id="live-dialog-title">${tx(o.title)}</h2>${ring(pct, 56)}</div>
        <section class="okb-d-section"><h3>${tr('描述', 'Description')}${editableO && !describing ? ` <button type="button" class="okb-link" data-okr="edit-o-desc" data-id="${esc(o.id)}">${tr('编辑', 'Edit')}</button>` : ''}</h3>${describing ? `<form id="okr-desc" data-id="${esc(o.id)}"><textarea name="description" maxlength="4000" data-okr-field="o-desc:${esc(o.id)}" data-okr-autofocus>${esc(saver.drafts.get('o-desc:' + o.id)?.value ?? (o.planning?.description || ''))}</textarea><div class="okb-form-actions"><span class="okb-hint">${tr('输入后自动保存', 'Saves automatically')}</span><button class="okb-btn small" type="submit">${tr('完成', 'Done')}</button></div></form>` : `<p class="okb-d-text">${o.planning?.description ? tx(o.planning.description) : esc(tr('暂无描述', 'No description'))}</p>`}</section>
        <section class="okb-d-section"><h3>${tr('对齐', 'Alignment')}${editableO && !aligning ? ` <button type="button" class="okb-link" data-okr="edit-align" data-id="${esc(o.id)}">${parent ? tr('修改', 'Change') : tr('设置', 'Set')}</button>` : ''}</h3>
          ${aligning ? `<form id="okr-align" data-id="${esc(o.id)}"><select name="parentObjectiveId" data-okr-autofocus><option value="">${tr('不对齐', 'No alignment')}</option>${candidates.map(p => `<option value="${esc(p.id)}" ${p.id === o.parent_objective_id ? 'selected' : ''}>${esc(p.level === 'company' ? tr('公司', 'Company') : nameOf(p.owner_id))} · ${esc(txt(p.title))}</option>`).join('')}</select><div class="okb-form-actions"><button class="okb-btn primary small" type="submit">${tr('保存', 'Save')}</button><button class="okb-btn small" type="button" data-okr="cancel-edit">${tr('取消', 'Cancel')}</button></div></form>`
            : `<p class="okb-d-text">${parent ? `${icon('arrow-bend-left-up')} ${tr('向上对齐：', 'Aligned up to: ')}<button type="button" class="okb-link" data-okr="open-o" data-id="${esc(parent.id)}">${tx(parent.title)}</button>` : tr('未对齐上级目标', 'Not aligned to a parent objective')}</p>`}
          ${children.length ? `<ul class="okb-d-children">${children.map(c => `<li>${avatar(c.owner_id, 20)}<button type="button" class="okb-link" data-okr="open-o" data-id="${esc(c.id)}">${tx(c.title)}</button></li>`).join('')}</ul>` : ''}</section>
        <section class="okb-d-section"><h3>${tr('关键结果', 'Key results')}</h3><ul class="okb-d-krs">${krs.map((k, i) => `<li><span class="okb-kr-tag">KR${i + 1}</span><span class="okb-d-kr-title">${tx(k.title)}</span>${statusChip(k, false)}<span class="okb-pct">${krPct(k) === null ? '—' : krPct(k) + '%'}</span></li>`).join('') || `<li class="okb-hint">${tr('还没有关键结果', 'No key results yet')}</li>`}</ul></section>
        <section class="okb-d-section"><h3>${tr('进展记录', 'Progress updates')}</h3>
          ${collab() && canPost(o) ? `<form id="okr-update" class="okb-composer" data-id="${esc(o.id)}"><textarea name="body" required minlength="2" maxlength="4000" placeholder="${tr('这周做了什么？有什么风险或需要谁协助？', 'What moved this week? Any risks or help needed?')}"></textarea><div class="okb-composer-row">${krs.length ? `<select name="krId" aria-label="${tr('关联 KR', 'Related KR')}"><option value="">${tr('关于整个目标', 'Whole objective')}</option>${krs.map((k, i) => `<option value="${esc(k.id)}">KR${i + 1} · ${esc(txt(k.title))}</option>`).join('')}</select><select name="confidence" aria-label="${tr('KR 状态', 'KR status')}"><option value="">${tr('状态不变', 'Keep status')}</option>${STATUS.map(([id, zh, en]) => `<option value="${id}">${tr(zh, en)}</option>`).join('')}</select>` : ''}<button class="okb-btn primary small" type="submit">${tr('发布进展', 'Post update')}</button></div><p class="okb-form-error" role="alert"></p></form>` : collab() ? '' : `<p class="okb-hint">${tr('进展记录需要后台升级后才能使用。', 'Progress updates require the backend upgrade.')}</p>`}
          ${collab() ? (data.loading ? `<p class="okb-hint">${tr('正在读取…', 'Loading…')}</p>` : data.error ? `<p class="okb-hint">${esc(data.error)}</p>` : `<ol class="okb-timeline">${data.items.map(u => { const kr = krs.find(k => k.id === u.kr_id); return `<li>${avatar(u.author_id, 26)}<div><div class="okb-tl-head"><strong>${esc(u.author_name || nameOf(u.author_id))}</strong><span>${esc(fmt(u.created_at))}</span></div>${kr ? `<div class="okb-tl-kr">${tx(kr.title)}${u.confidence ? ` · <span class="okb-status okb-${u.confidence}"><i></i>${esc(statusLabel(u.confidence))}</span>` : ''}${Number.isFinite(u.progress) ? ` · ${Math.round(u.progress * 100)}%` : ''}</div>` : ''}<p>${tx(u.body)}</p></div></li>`; }).join('') || `<li class="okb-hint okb-tl-empty">${tr('还没有进展记录。定期更新能让团队知道目标进行得怎样。', 'No updates yet. Regular updates keep the team informed.')}</li>`}</ol>`) : ''}
        </section>
      </div>`;
  }
  function isDescendant(candidateId, ancestorId) {
    let cur = objectiveById(candidateId);
    for (let i = 0; cur && i < 50; i++) { if (cur.parent_objective_id === ancestorId) return true; cur = objectiveById(cur.parent_objective_id); }
    return false;
  }
  function paintDrawer() {
    const o = ui.drawer && objectiveById(ui.drawer);
    const section = document.querySelector('#overlay-root .okb-drawer');
    if (!o) { if (section) ctx.closeOverlay(); return; }
    if (section) section.innerHTML = drawerHtml(o);
    focusAuto();
  }
  async function openDrawer(id) {
    const o = objectiveById(id); if (!o) return;
    ui.drawer = id; ui.menu = null; ui.confirm = null;
    if (ui.editing && !['align', 'o-desc'].includes(ui.editing.kind)) ui.editing = null;
    ctx.overlay(drawerHtml(o), true);
    document.querySelector('#overlay-root .drawer')?.classList.add('okb-drawer');
    if (collab()) await loadUpdates(id);
  }
  async function loadUpdates(id) {
    ui.updates.set(id, { loading:true, items:ui.updates.get(id)?.items || [] }); paintDrawer();
    try { const r = await ctx.api.get('/objectives/' + encodeURIComponent(id) + '/updates'); ui.updates.set(id, { loading:false, items:r.items || [] }); }
    catch (e) { ui.updates.set(id, { loading:false, items:[], error:e.message || tr('进展记录读取失败', 'Could not load updates') }); }
    if (ui.drawer === id) paintDrawer();
  }

  /* ---------- actions ---------- */
  /* A redraw keeps the cursor where it was, so typing is never interrupted by a save finishing. */
  const quote = v => String(v).replace(/["\\]/g, '\\$&');
  function focusSel(a) {
    if (!a || !a.closest?.('.okb') || !a.matches?.('input, textarea, select')) return '';
    if (a.dataset?.okrField) return `[data-okr-field="${quote(a.dataset.okrField)}"]`;
    if (a.id) return `[id="${quote(a.id)}"]`;
    const f = a.closest('form'); return f?.id && a.name ? `[id="${quote(f.id)}"] [name="${quote(a.name)}"]` : '';
  }
  const rerender = () => {
    ui.deferRender = false;
    const a = document.activeElement, sel = focusSel(a); let pos = null; try { pos = sel && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch {}
    ctx.rerender();
    const el = sel && document.querySelector(sel);
    if (el) { if (document.activeElement !== el) el.focus(); try { if (pos) el.setSelectionRange(pos[0], pos[1]); } catch {} }
    else focusAuto();
  };
  function focusAuto() { requestAnimationFrame(() => { const el = document.querySelector('[data-okr-autofocus]'); if (el && document.activeElement !== el && !typing()) { el.focus(); try { if (el.type === 'text' && el.value) { const n = el.value.length; el.setSelectionRange(n, n); } } catch {} } }); }
  async function mutate(fn, okText) {
    if (ui.busy) return false; ui.busy = true;
    try { await flushAll(); await fn(); await ctx.refreshOkr(); if (okText) ctx.toast(okText); return true; }
    catch (e) { const el = document.querySelector('.okb-form-error'); const msg = ctx.explainError(e); if (el) el.textContent = msg; ctx.toast(msg); return false; }
    finally { ui.busy = false; }
  }
  const patchO = (o, body) => ctx.api.request('/objectives/' + encodeURIComponent(o.id), { method:'PATCH', body:{ expectedVersion:o.version || 1, ...body } });
  const patchKr = (k, body) => ctx.api.request('/key-results/' + encodeURIComponent(k.id), { method:'PATCH', body:{ expectedMetaVersion:k.meta_version || 1, ...body } });
  const findKr = id => S().krs.find(k => k.id === id);

  document.addEventListener('input', e => {
    const w = e.target; if (!w.matches?.('[data-okr-w]')) return;
    const o = objectiveById(w.dataset.objective); if (!o) return;
    const pts = document.querySelector(`[data-okr-wpts="${CSS.escape(w.dataset.okrW)}"]`); if (pts) pts.textContent = `${num(oPoints(o) * (Number(w.value) || 0) / 100)} ${tr('分', 'pts')}`;
    const inputs = [...document.querySelectorAll(`[data-okr-w][data-objective="${CSS.escape(o.id)}"]`)], sum = inputs.reduce((n, x) => n + (Number(x.value) || 0), 0), zero = inputs.filter(x => !(Number(x.value) > 0)).length;
    const ok = Math.abs(sum - 100) < 0.01 && !zero;
    inputs.forEach(x => { const l = x.closest('.okb-w-edit'); if (l) { l.classList.toggle('w-ok', ok); l.classList.toggle('w-bad', !ok); } });
    const line = document.querySelector(`[data-okr-wline="${CSS.escape(o.id)}"]`); if (line) line.innerHTML = wLine(sum, zero, true, o.id);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-okr-w]')) { e.preventDefault(); e.target.blur(); } });
  document.addEventListener('change', e => {
    const w = e.target; if (!w.matches?.('[data-okr-w]')) return;
    if (w.value !== '' && !numberIn(w.value)) ctx.toast?.(tr('权重要在 0–100% 之间', 'Weight must be 0–100%'));
    flush('kr-weight:' + w.dataset.okrW);
  });
  /* Every autosaved field: typing schedules a save; leaving the box sends it now. */
  document.addEventListener('input', e => {
    const f = e.target.dataset?.okrField; if (!ctx || !f) return;
    const i = f.indexOf(':'); typed(f.slice(0, i), f.slice(i + 1), e.target.value);
  });
  document.addEventListener('input', e => { const form = e.target.closest?.('#okr-new-o, #okr-new-kr'); if (ctx && form) rememberForm(form); });
  document.addEventListener('change', e => { const form = e.target.closest?.('#okr-new-o, #okr-new-kr'); if (ctx && form) rememberForm(form); });
  document.addEventListener('focusout', e => {
    const f = e.target.dataset?.okrField; if (ctx && f && !e.target.closest('#okr-edit')) flush(f);
    // A redraw held back while someone typed happens once the cursor has left the box. Inline editors and
    // new-item forms redraw themselves when they close, so they are left alone here.
    if (e.target.closest?.('#okr-edit, #okr-new-o, #okr-new-kr')) return;
    later(() => { if (ui.deferRender && ctx && !typing()) softRerender(); }, 0);
  });
  /* A new objective or KR is created when the cursor leaves its form with the required fields filled in;
   * until then its text lives in the mirror. */
  document.addEventListener('focusout', e => {
    const form = e.target.closest?.('#okr-new-o, #okr-new-kr'); if (!ctx || !form || form.contains(e.relatedTarget)) return;
    later(() => {
      if (!form.isConnected || form.contains(document.activeElement) || form.dataset.sent) return;
      if (form.querySelector('[name="title"]')?.value.trim() && form.checkValidity?.()) form.requestSubmit?.();
      else if (ui.deferRender && !typing()) softRerender();
    }, 0);
  });
  try { window.addEventListener('pagehide', () => { flushAll(); commitRemovals(); }); } catch {}
  document.addEventListener('input', e => {
    const el = e.target; if (!el.matches?.('[data-okr-weight-preview]')) return;
    const tip = el.closest('form')?.querySelector('[data-okr-preview]'); if (!tip) return;
    if (el.dataset.okrWeightPreview === 'kr') tip.textContent = previewText('kr', el.dataset.objective, el.value);
  });
  document.addEventListener('click', async event => {
    if (!ctx || !S().actor) return;
    const t = event.target.closest('[data-okr]');
    if (!t) { if ((ui.menu || ui.confirm) && !event.target.closest('.okb-popover')) { ui.menu = null; ui.confirm = null; if (S().page === 'okr') rerender(); } return; }
    event.preventDefault();
    const a = t.dataset.okr, id = t.dataset.id;
    if (a === 'nudge-open') { openNudge(); return; }
    if (a === 'nudge-send') { sendNudge(t); return; }
    const inDrawer = !!t.closest('#overlay-root');
    const keepMenu = ['menu', 'kr-status', 'set-status', 'cancel-confirm', 'publish', 'save-retry', 'save-discard', 'restored-ok'].includes(a);
    if (!keepMenu) { ui.menu = null; ui.confirm = null; }
    switch (a) {
      case 'tab': ui.tab = t.dataset.value; ui.adding = null; ui.editing = null; return rerender();
      case 'person': ui.person = id; ui.adding = null; ui.editing = null; return rerender();
      case 'cycle-prev': case 'cycle-next': { ui.cycle = shiftPeriod(ui.cycle || nowPeriod(), a === 'cycle-next' ? 1 : -1); ui.adding = null; return rerender(); }
      case 'collapse': ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id); return rerender();
      case 'menu': { const kind = t.dataset.kind; ui.confirm = null; ui.menu = ui.menu && ui.menu.kind === kind && ui.menu.id === id ? null : { kind, id }; return rerender(); }
      case 'kr-status': ui.confirm = null; ui.menu = ui.menu && ui.menu.kind === 'status' && ui.menu.id === id ? null : { kind:'status', id }; return rerender();
      case 'set-status': { const k = findKr(id); ui.menu = null; if (!k) return; await mutate(() => patchKr(k, { confidence:t.dataset.value || null }), tr('状态已更新', 'Status updated')); return rerender(); }
      case 'edit': ui.editing = { kind:t.dataset.kind, id }; return rerender();
      case 'cancel-edit': ui.editing = null; return inDrawer ? paintDrawer() : rerender();
      case 'add-kr': ui.adding = { kind:'kr', id }; ui.editing = null; ui.weighting = null; return rerender();
      case 'weights': { const o = objectiveById(id); if (!o) return; ui.weighting = id; ui.adding = null; ui.editing = null; ui.wDraft = Object.fromEntries(krsOf(o).map(k => [k.id, Number(k.planning?.weight) > 0 ? Number(k.planning.weight) : ''])); rerender(); requestAnimationFrame(() => document.querySelector(`[data-okr-w][data-objective="${CSS.escape(id)}"]`)?.focus()); return; }
      case 'weights-cancel': ui.weighting = null; ui.wDraft = {}; return rerender();
      case 'weights-even-save': { const o = objectiveById(id), ks = krsOf(o); if (!ks.length) return; const base = Math.floor(10000 / ks.length) / 100; await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(o.id) + '/kr-weights', { weights:ks.map((k, i) => ({ id:k.id, weight:i === 0 ? Math.round((100 - base * (ks.length - 1)) * 100) / 100 : base })) }), tr('已平均分配，合计 100%', 'Split evenly; total 100%')); return rerender(); }
      case 'weights-even': { const ks = krsOf(objectiveById(id)), base = Math.floor(10000 / ks.length) / 100; ks.forEach((k, i) => { ui.wDraft[k.id] = i === 0 ? Math.round((100 - base * (ks.length - 1)) * 100) / 100 : base; }); return rerender(); }
      case 'weights-save': { const o = objectiveById(id), ks = krsOf(o); if (!wReady(ks)) return; const ok = await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(o.id) + '/kr-weights', { weights:ks.map(k => ({ id:k.id, weight:Number(ui.wDraft[k.id]) })) }), tr('KR 权重已保存', 'KR weights saved')); if (ok) { ui.weighting = null; ui.wDraft = {}; } return rerender(); }
      case 'add-o': ui.adding = { kind:'o' }; ui.editing = null; return rerender();
      case 'ai-generate': return aiGenerate();
      case 'cancel-add': { const f = t.closest('form'); if (f) { f.dataset.sent = '1'; forgetForm(formKey(f)); } ui.adding = null; return rerender(); }
      case 'save-retry': return retryFailed();
      case 'save-discard': { for (const key of [...saver.failed.keys()]) dropDraft(key); saver.failed.clear(); for (const [p, q] of saver.ai) if (q.error) { q.error = ''; q.queue = null; writeStore(p); } try { await ctx.refreshOkr(); } catch {} return rerender(); }
      case 'restored-ok': saver.restored = false; return paintStatus();
      case 'remove-o': return askRemove('o', id);
      case 'remove-kr': return askRemove('kr', id);
      case 'undo-remove': return undoRemove(id);
      case 'score': ui.scoring = { id, kind:t.dataset.target || 'o', who:t.dataset.kind }; return rerender();
      case 'score-help': ui.scoreHelp = !ui.scoreHelp; return rerender();
      case 'score-cancel': ui.scoring = null; return rerender();
      case 'score-preset': { const f = t.closest('form'); const inp = f?.querySelector('[name="score"]'); if (inp) inp.value = t.dataset.value; f?.querySelectorAll('.okb-preset').forEach(b => b.classList.toggle('on', b === t)); return; }
      case 'cancel-confirm': ui.confirm = null; return rerender();
      case 'open-o': return openDrawer(id);
      case 'edit-align': ui.editing = { kind:'align', id }; return openDrawer(id);
      case 'edit-o-desc': ui.editing = { kind:'o-desc', id }; return inDrawer ? paintDrawer() : openDrawer(id);
      case 'appraisal': return ctx.openAppraisal(id);
      case 'measure': return ctx.measurement(id);
      case 'edit-metric': return metricDialog(id);
      case 'source': return ctx.openObjectiveSource(id);
      case 'rubric': return rubricDialog();
      case 'publish': ui.confirm = { kind:'publish' }; return rerender();
      case 'stage-help': ui.stageHelp = !ui.stageHelp; return rerender();
      case 'publish-confirm': {
        const period = ui.cycle; ui.confirm = null;
        // Publish is the one confirmation: everything typed so far must be on the server first.
        await commitRemovals(); await flushAll();
        if (saveState() !== 'saved' && saveState() !== '') { ctx.toast(tr('还有修改没有保存成功，请先点“保存失败（点击重试）”或检查标红的内容，再最终发布。', 'Some changes are not saved yet. Retry the save or fix the highlighted values, then publish.')); return rerender(); }
        const ok = await mutate(() => ctx.api.post('/okr/publish', { period }), tr('OKR 已最终发布，KR 已变成你的任务', 'OKR published; your KRs are now tasks'));
        if (ok) pubs.delete(period);
        return rerender();
      }
    }
  });
  document.addEventListener('change', event => {
    if (!ctx) return;
    if (event.target.matches('[data-okr-cycle]')) { ui.cycle = event.target.value; ui.adding = null; rerender(); }
  });
  document.addEventListener('input', event => {
    if (!ctx || !event.target.matches('[data-okr-search]')) return;
    ui.search = event.target.value;
    const pos = event.target.selectionStart; rerender();
    requestAnimationFrame(() => { const el = document.querySelector('[data-okr-search]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
  });
  document.addEventListener('keydown', event => {
    if (!ctx) return;
    if (event.key === 'Escape') { const f = document.getElementById('okr-edit'); if (f) { f.setAttribute('data-cancel', '1'); dropDraft(f.dataset.kind + ':' + f.dataset.id); } }
    if (event.key === 'Escape' && (ui.editing || ui.adding || ui.menu || ui.confirm) && !document.querySelector('#overlay-root [role="dialog"]')) { ui.editing = null; ui.adding = null; ui.menu = null; ui.confirm = null; rerender(); }
  });
  /* Inline edits have no Save button: typing saves after a pause, leaving the box saves now (Esc cancels). */
  document.addEventListener('focusout', e => {
    const form = e.target.closest?.('#okr-edit'); if (!form || form.contains(e.relatedTarget)) return;
    later(() => { if (form.isConnected && !form.dataset.sent && !form.dataset.cancel) { const i = form.querySelector('input'); if (i && i.value.trim() && i.checkValidity()) form.requestSubmit(); else if (i && !i.value.trim()) { dropDraft(form.dataset.kind + ':' + form.dataset.id); ui.editing = null; rerender(); } else if (ui.deferRender && !typing()) softRerender(); } }, 0);
  });
  document.addEventListener('submit', async event => {
    const form = event.target; if (!ctx || !form.id?.startsWith('okr-')) return;
    event.preventDefault();
    const v = Object.fromEntries(new FormData(form)), err = form.querySelector('.okb-form-error');
    if (err) err.textContent = '';
    if (form.id === 'okr-edit') {
      if (form.dataset.sent) return;
      const kind = form.dataset.kind, id = form.dataset.id, key = kind + ':' + id, it = itemOf(kind, id), input = form.querySelector('input');
      if (!FIELD[kind] || !it) { ui.editing = null; return rerender(); }
      if (input && input.value !== saver.drafts.get(key)?.value) typed(kind, id, input.value);
      const d = saver.drafts.get(key);
      if (d && !FIELD[kind].body(it, d.value)) {
        if (!d.value.trim()) dropDraft(key); // an empty box keeps the old text
        else { const msg = kind.endsWith('weight') ? tr('分值和权重要在 0–100 之间', 'Points and weights must be between 0 and 100') : tr('内容太长了', 'That is too long'); ctx.toast(msg); return; }
      }
      form.dataset.sent = '1'; ui.editing = null; flush(key);
      return rerender();
    }
    if ((form.id === 'okr-new-kr' || form.id === 'okr-new-o') && form.dataset.sent) return;
    if (form.id === 'okr-new-kr' || form.id === 'okr-new-o') { form.dataset.sent = '1'; later(() => { if (form.isConnected) delete form.dataset.sent; }, 0); }
    if (form.id === 'okr-new-kr' && simple()) {
      const o = objectiveById(form.dataset.objectiveId), text = String(v.targetText || '').trim(), m = /^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/.exec(text);
      const left = Math.round((100 - krSum(o)) * 100) / 100, w = Number(v.weight);
      if (!(w > 0)) { if (err) err.textContent = tr('请填写这条 KR 的权重。', 'Enter this KR’s weight.'); return; }
      const planning = { weight:w, description:'', targetText:text };
      const body = m && Number(m[1]) > 0 ? { title:v.title.trim(), baseline:0, target:Number(m[1]), direction:'increase', unit:(m[2] || '').trim().slice(0, 30) || tr('项', 'units'), planning } : { title:v.title.trim(), baseline:0, target:1, direction:'increase', unit:'完成', planning };
      const ok = await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(o.id) + '/key-results', body), Math.abs(krSum(o) + w - 100) < 0.01 ? tr('关键结果已添加，KR 权重合计 100%', 'Key result added; weights total 100%') : tr('关键结果已添加；KR 权重合计还不是 100%，直接改红色的权重即可', 'Key result added; weights don’t total 100% yet, edit the red ones'));
      if (ok) { forgetForm('new-kr:' + o.id); ui.adding = null; }
      rerender(); return;
    }
    if (form.id === 'okr-new-kr') {
      const o = objectiveById(form.dataset.objectiveId), weight = Number(v.weight);
      const body = { title:v.title.trim(), baseline:Number(v.baseline ?? 0), target:Number(v.target), direction:v.direction || 'increase', unit:v.unit.trim(), ...(v.weight ? { planning:{ weight, description:'' } } : {}) };
      if (body.direction === 'increase' ? body.target <= body.baseline : body.target >= body.baseline) { if (err) err.textContent = tr('目标值要和基准值不同，并符合“越高 / 越低越好”的方向。', 'The target must differ from the baseline in the chosen direction.'); return; }
      const ok = await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(o.id) + '/key-results', body), tr('关键结果已添加', 'Key result added'));
      if (ok) { forgetForm('new-kr:' + o.id); ui.adding = { kind:'kr', id:o.id }; } // keep the row open to add the next KR quickly
      rerender(); return;
    }
    if (form.id === 'okr-score') {
      const body = { kind:form.dataset.kind, score:Number(v.score), ...(String(v.comment || '').trim() ? { comment:String(v.comment).trim() } : {}), ...(v.veto ? { veto:true } : {}) };
      const errEl = form.querySelector('.okb-form-error'), files = [...(form.querySelector('input[type=file]')?.files || [])];
      if (body.kind === 'self') {
        const prior = (form.dataset.target === 'kr' ? findKr(form.dataset.id) : null)?.scores?.self?.evidence || [];
        if ((body.comment || '').length < 10 && !files.length && !prior.length) { if (errEl) errEl.textContent = tr('请写清楚完成情况（至少 10 个字），或上传证明文件。', 'Write at least 10 characters about what you achieved, or upload a proof file.'); return; }
        if (files.length) {
          const k = findKr(form.dataset.id);
          try { ui.busy = true; const ids = []; for (const f of files) ids.push((await uploadEvidence(k.task_id, f)).id); body.attachmentIds = ids; }
          catch (e) { ui.busy = false; if (errEl) errEl.textContent = e.message || tr('文件上传失败', 'Upload failed'); return; }
          ui.busy = false;
        } else if (prior.length && (body.comment || '').length < 10) body.attachmentIds = prior.map(f => f.id);
      }
      const path = (form.dataset.target === 'kr' ? '/key-results/' : '/objectives/') + encodeURIComponent(form.dataset.id) + '/scores';
      if (await mutate(() => ctx.api.post(path, body), body.veto ? tr('已判定自评不实，该项记 0 分', 'Marked untrue; scored 0') : body.kind === 'self' ? tr('自评已保存，等待领导评分', 'Self score saved; waiting for your leader') : tr('领导评分已保存', 'Leader score saved'))) ui.scoring = null;
      rerender(); return;
    }
    if (form.id === 'okr-new-o') {
      const period = ui.cycle || nowPeriod();
      const owner = v.ownerId || me().id, used = S().objectives.filter(x => x.owner_id === owner && x.planning?.period === period && x.level !== 'company').reduce((n, x) => n + (Number(x.planning?.weight) || 0), 0), autoWeight = Math.round((100 - used) * 100) / 100;
      const asCompany = simple() && companyMine() && owner === me().id;
      const body = { title:v.title.trim(), level:asCompany ? 'company' : (v.level || 'personal'), ...(asCompany ? {} : { ownerId:owner }), planning:{ period, weight:v.weight ? Number(v.weight) : Math.min(100, autoWeight), location:'', description:String(v.description || '').trim(), type:'mandatory', bonusIncluded:false, scoringDueDate:dueDateFor(period) }, ...(collab() && v.parentObjectiveId ? { parentObjectiveId:v.parentObjectiveId } : {}) };
      let createdId = null;
      const ok = await mutate(async () => { const r = await ctx.api.post('/objectives', body); createdId = r?.id; }, simple() ? tr('目标已创建，接着添加关键结果（目标值可以写“完成”或明确数字）', 'Objective created — add key results (target: “done” or a number)') : tr('目标已创建，接着添加关键结果吧', 'Objective created — now add its key results'));
      if (ok) { forgetForm('new-o'); ui.adding = createdId ? { kind:'kr', id:createdId } : null; if (ui.tab === 'team') ui.person = body.ownerId; ui.cycle = period; }
      rerender(); return;
    }
    if (form.id === 'okr-align') {
      const o = objectiveById(form.dataset.id), parent = v.parentObjectiveId || null;
      if (await mutate(() => patchO(o, { parentObjectiveId:parent }), tr('对齐已更新', 'Alignment updated'))) ui.editing = null;
      rerender(); paintDrawer(); return;
    }
    if (form.id === 'okr-desc') {
      const key = 'o-desc:' + form.dataset.id, ta = form.querySelector('textarea');
      if (ta && ta.value !== saver.drafts.get(key)?.value) typed('o-desc', form.dataset.id, ta.value);
      ui.editing = null; await flush(key);
      rerender(); paintDrawer(); return;
    }
    if (form.id === 'okr-update') {
      const id = form.dataset.id, body = { body:String(v.body || '').trim(), ...(v.krId ? { krId:v.krId } : {}), ...(v.krId && v.confidence ? { confidence:v.confidence } : {}) };
      if (v.confidence && !v.krId) { if (err) err.textContent = tr('设置状态前，请先选择对应的 KR。', 'Choose a KR before setting its status.'); return; }
      const ok = await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(id) + '/updates', body), tr('进展已发布', 'Update posted'));
      if (ok) { rerender(); await loadUpdates(id); }
      return;
    }
    if (form.id === 'okr-metric') {
      const k = findKr(form.dataset.id), metric = { expectedVersion:k.version, baseline:Number(v.baseline), target:Number(v.target), direction:v.direction, unit:String(v.unit || '').trim() };
      if (await mutate(() => patchKr(k, { metric }), tr('指标已更新，需要重新提交自评与主管确认', 'Metric updated; self evaluation and manager confirmation need to be resubmitted'))) ctx.closeOverlay();
      rerender(); return;
    }
  });

  function metricDialog(id) {
    const k = findKr(id); if (!k) return;
    ctx.modal(tr('编辑指标', 'Edit metric'), `<form id="okr-metric" data-id="${esc(id)}"><p class="fine">${tx(k.title)}</p><div class="form-grid">
      <label class="field"><span>${tr('基准值', 'Baseline')}</span><input name="baseline" type="number" step="any" value="${esc(k.baseline ?? 0)}" required></label>
      <label class="field"><span>${tr('目标值', 'Target')}</span><input name="target" type="number" step="any" value="${esc(k.target ?? '')}" required></label>
      <label class="field"><span>${tr('方向', 'Direction')}</span><select name="direction"><option value="increase" ${k.direction !== 'decrease' ? 'selected' : ''}>${tr('越高越好', 'Higher is better')}</option><option value="decrease" ${k.direction === 'decrease' ? 'selected' : ''}>${tr('越低越好', 'Lower is better')}</option></select></label>
      <label class="field"><span>${tr('单位', 'Unit')}</span><input name="unit" maxlength="30" value="${esc(k.unit || '')}" required></label></div>
      <p class="notice">${tr('修改指标会让当前的主管确认失效，需要员工重新提交自评。', 'Changing the metric invalidates the current manager confirmation; the owner must resubmit a self evaluation.')}</p><p class="okb-form-error" role="alert"></p></form>`,
      `<button class="btn primary" type="submit" form="okr-metric">${tr('保存指标', 'Save metric')}</button>`);
  }
  function rubricDialog() {
    const O = window.WorkOSOkr;
    if (simple()) {
      ctx.modal(tr('评分标准', 'Scoring guide'), `<div class="okb-levels okb-levels-static">${LEVELS.map(([v, zh, en, cls]) => `<span class="okb-level ${cls}"><b>${v}</b><span>${tr(zh, en)}</span>${v === 125 ? `<i class="okb-star">${icon('crown-simple')}</i>` : ''}</span>`).join('')}</div>
        <p>${tr('评分分六档：0 未开展、25 严重滞后、50 部分完成、75 接近完成、100 完成、125 完成且卓越。评 125 分可以让 OKR 总分超过 100 分。', 'Six levels: 0 not started, 25 far behind, 50 partly done, 75 nearly done, 100 done, 125 done and exceptional. A 125 can lift the OKR total above 100.')}</p>
        <p>${tr('每条 KR 的最终评分 = 员工自评 50% + 领导评分 50%。自评必须写清楚完成情况（至少 10 个字）或上传证明文件；自评不实时，领导可以直接把这条 KR 判为 0 分。', 'Each KR’s final score = 50% self score + 50% leader score. A self score needs a written explanation (at least 10 characters) or a proof file; if it is untrue, the leader can set that KR to 0.')}</p>
        <p>${tr('分值与权重：每人每月所有目标合计正好 100 分；同一目标下所有 KR 的权重合计正好 100%。KR 得分 = 目标分值 × KR 权重 × 最终评分 ÷ 100。例如 O1 = 40 分、KR1 权重 25%，KR1 满分 10 分；最终评分 100 时得 10 分。', 'Points and weights: each person’s objectives total exactly 100 points per month; the KRs under one objective total exactly 100%. KR points = objective points × KR weight × final score ÷ 100. Example: O1 = 40 points and KR1 weighs 25%, so KR1 is worth 10; a final score of 100 earns 10.')}</p>
        <p>${tr('节奏：上月 25 日起设置 OKR；本月 25 日至 30 日自评，逾期未自评按 0 分；30 日至下月 3 日领导评分。', 'Rhythm: set the OKR from the 25th of the previous month; self scores from the 25th to the 30th (missing ones count as 0); leader scores from the 30th to the 3rd of the next month.')}</p>`,
        `<button class="btn" data-live-action="close">${tr('知道了', 'Got it')}</button>`);
      return;
    }
    ctx.modal(tr('评分标准', 'Scoring guide'), `${O?.rubric ? O.rubric(lang()) : ''}<p>${tr('每个 KR 由员工提交成果和自评，再由主管核对后确认评分。完成为 80 分，卓越完成为 100 分。', 'For each KR the owner submits evidence and a self evaluation, then a manager verifies and confirms the score. Complete is 80; exceptional is 100.')}</p><p>${tr('权重按周期占比填写：例如目标权重 50%，其下 KR 可以是 30% 和 20%，KR 权重合计应等于目标权重。', 'Weights are period shares: a 50% objective may have KRs of 30% and 20%; KR weights should add up to the objective weight.')}</p><p>${tr('进度来自 KR 的实际值（由主管记录核验），状态（正常 / 有风险 / 已延期）由负责人判断。进度和状态都不会自动改变评分。', 'Progress comes from KR actual values recorded by a manager; status (on track / at risk / off track) is the owner’s judgement. Neither changes the score automatically.')}</p>`,
      `<button class="btn" data-live-action="close">${tr('知道了', 'Got it')}</button>`);
  }

  function reset() {
    for (const t of saver.timers.values()) cancel(t); for (const r of ui.removing.values()) cancel(r.timer); cancel(saver.retryTimer);
    for (const k of ['drafts', 'timers', 'chains', 'failed', 'known', 'forms', 'ai', 'loaded']) saver[k].clear();
    Object.assign(saver, { inflight:0, saved:false, restored:false, sync:false, retryTimer:null }); ui.removing.clear(); ui.ai = { text:'', busy:false, error:'', note:'' };
    orgChart = null; ui.tab = 'mine'; ui.person = null; ui.cycle = null; ui.search = ''; ui.editing = null; ui.adding = null; ui.menu = null; ui.confirm = null; ui.drawer = null; ui.updates.clear(); ui.collapsed.clear(); }
  /* Called by live-app after data refresh so an open drawer reflects new data. */
  function refreshed() { if (ui.drawer && document.querySelector('#overlay-root .okb-drawer')) paintDrawer(); }

  window.WorkOSOkrBoard = { configure(next) { ctx = next; }, render, reset, refreshed, _ui:ui, _helpers:{ objectivePct, averagePct, cycles, periodLabel, dueDateFor, canEdit }, _saver:{ flushAll, commitRemovals, state:saveState, saver } };
})();
