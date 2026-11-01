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
  const ui = { tab:'mine', person:null, cycle:null, search:'', editing:null, adding:null, menu:null, confirm:null, drawer:null, updates:new Map(), busy:false, collapsed:new Set() };

  const S = () => ctx.state();
  const lang = () => ctx.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const collab = () => S().capabilities?.okrCollaboration === true;
  const me = () => S().actor;
  const isManager = () => me()?.role === 'manager';
  const nameOf = id => id ? (S().directory.find(u => u.id === id)?.display_name || (orgChart || []).find(u => u.id === id)?.display_name || (me()?.id === id ? me().display_name : id)) : tr('公司','Company');
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
  const canEdit = o => !!o && !lockedFor(o) && o.level !== 'company' && o.department_id === me()?.department_id && (isManager() || (o.level === 'personal' && o.owner_id === me()?.id));
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
  const krsOf = o => order(S().krs.filter(k => k.objective_id === o.id));
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
  const objectivesOf = ownerId => order(S().objectives.filter(o => inCycle(o) && (ownerId === '__company' ? o.level === 'company' : o.owner_id === ownerId && o.level !== 'company')));
  /* Team list sections: my direct and indirect reports, peers who share my manager, my managers, everyone else. */
  let orgChart = null, chartLoading = false;
  function chartPeople() {
    if (!orgChart && !chartLoading && ctx?.api) { chartLoading = true; ctx.api.get('/org/chart').then(r => { orgChart = r.items || []; window.WorkOSNames?.apply(orgChart); rerender(); }).catch(() => { orgChart = []; }).finally(() => { chartLoading = false; }); }
    return orgChart || [];
  }
  function relationOf(id) {
    if (id === '__company' || id === me()?.id) return 'top';
    const byId = new Map([...chartPeople(), ...S().directory].map(u => [u.id, u]));
    let cur = byId.get(id), guard = 0;
    while (cur && cur.manager_id && guard++ < 20) { if (cur.manager_id === me()?.id) return 'reports'; cur = byId.get(cur.manager_id); }
    const mine = byId.get(me()?.id)?.manager_id ?? me()?.manager_id, other = byId.get(id), myDept = me()?.department_id;
    // Without a manager line on the org chart, a department manager leads the department's members.
    if (other && !other.manager_id && isManager() && other.department_id === myDept && other.role !== 'manager') return 'reports';
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
  function stageChips(id, objs) {
    const st = stages(id, objs), cls = (n, t) => !t ? 'none' : n >= t ? 'done' : n ? 'part' : 'none';
    const chips = [[st.setup, tr('建立', 'Set'), st.pub ? '✓' : objs.length ? tr('未发布', 'draft') : '—', tr('本月 OKR 建立：', 'OKR set up: ') + (st.pub ? tr('已最终发布', 'published') : objs.length ? tr('已填写，未发布', 'drafted, not published') : tr('未填写', 'not started'))],
      [cls(st.self, st.items), tr('自评', 'Self'), st.items ? `${st.self}/${st.items}` : '—', tr(`本月 OKR 自评：${st.self}/${st.items} 项`, `Self scores: ${st.self}/${st.items}`)],
      [cls(st.lead, st.items), tr('领导', 'Leader'), st.items ? `${st.lead}/${st.items}` : '—', tr(`领导评分：${st.lead}/${st.items} 项`, `Leader scores: ${st.lead}/${st.items}`)]];
    return `<span class="okb-stages">${chips.map(([c, label, val, title]) => `<i class="okb-stage ${c}" title="${esc(title)}">${label} <b>${val}</b></i>`).join('')}</span>`;
  }
  function peopleSections() {
    const list = people(), groups = { top:[], reports:[], peers:[], managers:[], others:[] };
    list.forEach(id => groups[relationOf(id)].push(id));
    return [['', groups.top], [tr('我的汇报线', 'My reporting line'), groups.reports], [tr('团队 OKR（平级同事）', 'Team OKRs (peers)'), groups.peers], [tr('我的上级', 'My managers'), groups.managers], [tr('其他同事', 'Others'), groups.others]].filter(([, ids]) => ids.length);
  }
  function people() {
    const ids = new Set([...S().directory, ...chartPeople()].map(u => u.id));
    S().objectives.filter(inCycle).forEach(o => { if (o.level !== 'company' && o.owner_id) ids.add(o.owner_id); });
    if (me()) ids.add(me().id);
    let list = [...ids].sort((a, b) => a === me()?.id ? -1 : b === me()?.id ? 1 : nameOf(a).localeCompare(nameOf(b)));
    if (S().objectives.some(o => inCycle(o) && o.level === 'company')) list = ['__company', ...list];
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
  function editable(kind, id, value, display, type = 'text', cls = '') {
    if (ui.editing && ui.editing.kind === kind && ui.editing.id === id) {
      return `<form class="okb-inline-edit ${cls}" id="okr-edit" data-kind="${kind}" data-id="${esc(id)}"><input name="value" type="${type}" ${type === 'number' ? 'min="0.01" max="100" step="0.01"' : 'maxlength="300" minlength="1"'} value="${esc(value ?? '')}" data-okr-autofocus required><button class="okb-btn primary small" type="submit">${tr('保存', 'Save')}</button><button class="okb-btn small" type="button" data-okr="cancel-edit">${tr('取消', 'Cancel')}</button></form>`;
    }
    return display;
  }
  function popover(items) {
    return `<div class="okb-popover" role="menu">${items.filter(Boolean).map(([action, label, id, extra = '', danger = false]) => `<button type="button" role="menuitem" class="${danger ? 'okb-danger' : ''}" data-okr="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`).join('')}</div>`;
  }

  /* ---------- key result row ---------- */
  function krRow(o, kr, index) {
    const pct = krPct(kr), editableO = canEdit(o) && collab(), score = scoreOf(kr);
    const menuOpen = ui.menu && ui.menu.kind === 'kr' && ui.menu.id === kr.id;
    const statusOpen = ui.menu && ui.menu.kind === 'status' && ui.menu.id === kr.id;
    const confirm = ui.confirm && ui.confirm.kind === 'kr' && ui.confirm.id === kr.id;
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
      <div class="okb-kr-more">${(editableO || canScore || canMeasure) ? `<button type="button" class="okb-icon-btn" data-okr="menu" data-kind="kr" data-id="${esc(kr.id)}" aria-label="${tr('更多操作', 'More actions')}">${icon('dots-three')}</button>` : ''}${menuOpen ? popover([
        canScore && ['appraisal', tr('成果与评分', 'Evidence & score'), kr.id],
        canMeasure && ['measure', tr('记录实际值', 'Record actual value'), kr.id],
        editableO && ['edit-metric', tr('编辑指标', 'Edit metric'), kr.id],
        editableO && ['ask-archive-kr', tr('删除 KR', 'Delete KR'), kr.id, '', true],
      ]) : ''}${confirm ? `<div class="okb-popover okb-confirm"><p>${tr('删除后此 KR 不再显示，历史评分与记录保留。确定删除？', 'The KR will be hidden; its history and scores are kept. Delete it?')}</p><div><button type="button" class="okb-btn small" data-okr="cancel-confirm">${tr('取消', 'Cancel')}</button><button type="button" class="okb-btn danger small" data-okr="archive-kr" data-id="${esc(kr.id)}">${tr('删除', 'Delete')}</button></div></div>` : ''}</div>
    </div>`;
  }

  /* ---------- objective card ---------- */
  function objectiveCard(o, index) {
    const krs = krsOf(o), pct = objectivePct(o), edit = canEdit(o), editableO = edit && collab();
    const parent = o.parent_objective_id ? objectiveById(o.parent_objective_id) : null;
    const children = S().objectives.filter(x => x.parent_objective_id === o.id);
    const menuOpen = ui.menu && ui.menu.kind === 'o' && ui.menu.id === o.id;
    const confirm = ui.confirm && ui.confirm.kind === 'o' && ui.confirm.id === o.id;
    const collapsed = ui.collapsed.has(o.id);
    const label = o.importSource?.itemLabel || `O${index + 1}`;
    const title = editable('o-title', o.id, o.title, editableO ? `<button type="button" class="okb-title-btn okb-o-title" data-okr="edit" data-kind="o-title" data-id="${esc(o.id)}">${tx(o.title)}</button>` : `<span class="okb-o-title">${tx(o.title)}</span>`);
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
            editableO && ['ask-archive-o', tr('删除目标', 'Delete objective'), o.id, '', true],
          ]) : ''}${confirm ? `<div class="okb-popover okb-confirm"><p>${tr('删除后目标及其 KR 不再显示，历史记录保留；对齐到它的目标会解除对齐。确定删除？', 'The objective and its KRs will be hidden; history is kept and aligned objectives are detached. Delete it?')}</p><div><button type="button" class="okb-btn small" data-okr="cancel-confirm">${tr('取消', 'Cancel')}</button><button type="button" class="okb-btn danger small" data-okr="archive-o" data-id="${esc(o.id)}">${tr('删除', 'Delete')}</button></div></div>` : ''}</div>
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
      const used = krsOf(o).reduce((n, k) => n + (Number.isFinite(k.planning?.weight) ? k.planning.weight : 0), 0), left = Math.max(0, Math.round((100 - used) * 100) / 100);
      return `<form class="okb-new-kr okb-new-kr-simple" id="okr-new-kr" data-objective-id="${esc(o.id)}">
        <span class="okb-kr-tag">KR${krsOf(o).length + 1}</span>
        <input name="title" placeholder="${tr('关键结果：怎样证明目标达成，例如：新增 30 家经销商', 'Key result, e.g. Sign 30 new dealers')}" required minlength="2" maxlength="300" data-okr-autofocus>
        <label class="okb-mini okb-target"><span>${tr('目标值', 'Target')}</span><input name="targetText" required maxlength="120" placeholder="${tr('填“完成”，或明确数字：30 家 / 3%', '“Done”, or a number: 30 dealers / 3%')}"></label>
        <label class="okb-mini"><span>${tr('权重 %（占本目标）', 'Weight % of objective')}</span><input name="weight" type="number" min="0.01" max="${left || 0.01}" step="0.01" value="${left || ''}" required ${left > 0 ? '' : 'disabled'}></label>
        <div class="okb-form-actions"><span class="okb-form-tip ${left > 0 ? '' : 'bad'}">${left > 0 ? tr(`= ${num(oPoints(o))} 分 × 权重；同一目标下 KR 合计必须正好 100%，还剩 ${num(left)}%`, `= ${num(oPoints(o))} pts × weight · KRs must total exactly 100% · ${num(left)}% left`) : tr('本目标的 KR 权重已满 100%，请先调低其他 KR 的权重，再添加新 KR。', 'KR weights already total 100%; lower another KR before adding one.')}</span><button class="okb-btn primary small" type="submit" ${left > 0 ? '' : 'disabled'}>${tr('添加', 'Add')}</button><button class="okb-btn small" type="button" data-okr="cancel-add">${tr('取消', 'Cancel')}</button></div>
        <p class="okb-form-error" role="alert"></p>
      </form>`;
    }
    const remaining = Number.isFinite(o.planning?.weight) ? Math.max(0, Math.round((o.planning.weight - krsOf(o).reduce((s, k) => s + (k.planning?.weight || 0), 0)) * 100) / 100) : '';
    return `<form class="okb-new-kr" id="okr-new-kr" data-objective-id="${esc(o.id)}">
      <span class="okb-kr-tag">KR${krsOf(o).length + 1}</span>
      <input name="title" placeholder="${tr('输入关键结果，例如：新增 30 家经销商', 'Key result, e.g. Sign 30 new dealers')}" required minlength="3" maxlength="300" data-okr-autofocus>
      <label class="okb-mini"><span>${tr('目标值', 'Target')}</span><input name="target" type="number" step="any" required></label>
      <label class="okb-mini"><span>${tr('单位', 'Unit')}</span><input name="unit" maxlength="30" required placeholder="${tr('家 / % / 元', 'units')}"></label>
      <label class="okb-mini"><span>${tr('权重 %', 'Weight %')}</span><input name="weight" type="number" min="0.01" max="100" step="0.01" value="${remaining || ''}"></label>
      <details class="okb-more-fields"><summary>${tr('更多', 'More')}</summary>
        <label class="okb-mini"><span>${tr('基准值', 'Baseline')}</span><input name="baseline" type="number" step="any" value="0" required></label>
        <label class="okb-mini"><span>${tr('方向', 'Direction')}</span><select name="direction"><option value="increase">${tr('越高越好', 'Higher is better')}</option><option value="decrease">${tr('越低越好', 'Lower is better')}</option></select></label>
      </details>
      <div class="okb-form-actions"><button class="okb-btn primary small" type="submit">${tr('添加', 'Add')}</button><button class="okb-btn small" type="button" data-okr="cancel-add">${tr('取消', 'Cancel')}</button></div>
      <p class="okb-form-error" role="alert"></p>
    </form>`;
  }
  function newObjectiveForm(ownerId) {
    const owners = isManager() ? S().directory : [me()];
    const parents = S().objectives.filter(o => o.level !== 'personal' || o.owner_id !== ownerId);
    return `<form class="okb-new-o" id="okr-new-o">
      <span class="okb-o-tag">O</span>
      <input name="title" placeholder="${tr('输入目标，例如：Q4 销售额增长 20%', 'Objective, e.g. Grow Q4 sales 20%')}" required minlength="3" maxlength="300" data-okr-autofocus>
      ${simple() ? `<input name="description" class="okb-o-desc-input" maxlength="4000" placeholder="${tr('怎样算完成？（可选）例如：转化率从 2% 提升到 3%', 'What does done look like? (optional)')}">` : ''}
      ${simple() ? (() => { const used = S().objectives.filter(x => x.owner_id === ownerId && x.planning?.period === (ui.cycle || nowPeriod()) && x.level !== 'company').reduce((n, x) => n + (Number(x.planning?.weight) || 0), 0), left = Math.max(0, Math.round((100 - used) * 100) / 100); return `<label class="okb-mini"><span>${tr('分值（分）', 'Points')}</span><input name="weight" type="number" min="0.01" max="100" step="0.01" required value="${left || ''}" title="${tr(`所有目标合计 100 分，还剩 ${left} 分`, `All objectives add up to 100; ${left} left`)}"></label><span class="okb-form-tip">${tr(`所有目标合计 100 分，还剩 ${left} 分`, `All objectives add up to 100 · ${left} left`)}</span>`; })() : ''}
      ${simple() ? `<details class="okb-more-fields"><summary>${tr('更多设置（可不填）', 'More settings (optional)')}</summary>` : ''}
      ${simple() ? '' : `<label class="okb-mini"><span>${tr('权重 %', 'Weight %')}</span><input name="weight" type="number" min="0.01" max="100" step="0.01" required></label>`}
      ${isManager() ? `<label class="okb-mini"><span>${tr('负责人', 'Owner')}</span><select name="ownerId">${owners.map(u => `<option value="${esc(u.id)}" ${u.id === ownerId ? 'selected' : ''}>${esc(u.display_name)}</option>`).join('')}</select></label>
      <label class="okb-mini"><span>${tr('层级', 'Level')}</span><select name="level"><option value="personal">${tr('个人目标', 'Personal')}</option><option value="department">${tr('部门目标', 'Department')}</option></select></label>` : `<input type="hidden" name="ownerId" value="${esc(me().id)}"><input type="hidden" name="level" value="personal">`}
      ${collab() && parents.length ? `<label class="okb-mini okb-wide"><span>${tr('对齐到', 'Align to')}</span><select name="parentObjectiveId"><option value="">${tr('不对齐', 'No alignment')}</option>${parents.map(p => `<option value="${esc(p.id)}">${esc(nameOf(p.level === 'company' ? null : p.owner_id))} · ${esc(txt(p.title))}</option>`).join('')}</select></label>` : ''}
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
    return `<div class="okb-krs okb-krs-simple">${krs.map((k, i) => { const share = krShare(o, k), pts = krPoints(o, k), f = finalOf(k); const target = k.planning?.targetText || (Number.isFinite(k.target) && k.unit !== '完成' ? `${k.target} ${k.unit || ''}` : tr('完成', 'Done'));
      return `<div class="okb-kr okb-kr-simple" data-kr="${esc(k.id)}"><span class="okb-kr-tag">KR${i + 1}</span>
        <div class="okb-kr-main"><div class="okb-kr-title">${edit && collab() ? `<button type="button" class="okb-title-btn" data-okr="edit" data-kind="kr-title" data-id="${esc(k.id)}">${tx(k.title)}</button>` : `<span>${tx(k.title)}</span>`}</div><div class="okb-kr-target">${icon('flag')} ${tr('目标值', 'Target')}：${tx(target)}</div></div>
        <div class="okb-kr-weight">${edit && collab() ? (ui.editing && ui.editing.kind === 'kr-weight' && ui.editing.id === k.id ? editable('kr-weight', k.id, k.planning?.weight, '', 'number') : `<button type="button" class="okb-chip" data-okr="edit" data-kind="kr-weight" data-id="${esc(k.id)}" title="${tr('KR 权重 = 占所属目标分值的百分比', 'KR weight = share of the objective’s points')}">${share ? `${num(share)}% · ${num(pts)} ${tr('分', 'pts')}` : tr('未填权重', 'No weight')}</button>`) : `<span class="okb-chip">${share ? `${num(share)}% · ${num(pts)} ${tr('分', 'pts')}` : tr('未填权重', 'No weight')}</span>`}</div>
        <div class="okb-kr-score">${scoreBlock('kr', k, o)}</div>
        <div class="okb-kr-got" title="${esc(tr(`${num(oPoints(o))} 分 × ${num(share)}% × ${f === null ? '待评' : num(f) + '%'}`, `${num(oPoints(o))} × ${num(share)}% × ${f === null ? 'pending' : num(f) + '%'}`))}">${f === null ? '—' : num(pts * f / 100)}</div>
      </div>${ui.scoring && ui.scoring.kind === 'kr' && ui.scoring.id === k.id ? scoreForm('kr', k, o) : ''}`; }).join('') || `<div class="okb-empty-row">${tr('还没有关键结果。没有 KR 时直接给整个目标打分；也可以添加 KR，按权重拆分分值。', 'No key results. Score the objective directly, or add KRs to split its points by weight.')}</div>`}
      ${krs.length && !weightsOk(o) ? (() => { const unset = krs.filter(k => !(Number(k.planning?.weight) > 0)).length, over = sumW - 100; return over > 0.01 ? `<div class="okb-warn okb-warn-bad">${icon('warning-octagon')} ${tr(`KR 权重合计 ${num(sumW)}%，超出 ${num(over)}%。同一目标下所有 KR 的权重合计必须正好 100%，请调低某条 KR 的权重。`, `KR weights total ${num(sumW)}%, ${num(over)}% too much. KR weights under one objective must add up to exactly 100%; lower one of them.`)}</div>` : `<div class="okb-warn">${icon('warning')} ${tr(`KR 权重合计 ${num(sumW)}%，还差 ${num(100 - sumW)}%${unset ? `，有 ${unset} 条未填权重` : ''}。补齐到正好 100% 后才能评分。`, `KR weights total ${num(sumW)}%, ${num(100 - sumW)}% missing${unset ? `; ${unset} without a weight` : ''}. Scoring opens once they add up to exactly 100%.`)}</div>`; })() : ''}
      ${edit ? (ui.adding && ui.adding.kind === 'kr' && ui.adding.id === o.id ? newKrForm(o) : `<button type="button" class="okb-add-row" data-okr="add-kr" data-id="${esc(o.id)}">${icon('plus')} ${tr('添加关键结果', 'Add key result')}</button>`) : ''}</div>`;
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
  function personView(id) {
    const objs = objectivesOf(id), pct = averagePct(objs), company = id === '__company';
    const total = objs.reduce((s, o) => s + (Number.isFinite(o.planning?.weight) ? o.planning.weight : 0), 0);
    const addable = !company && canCreateFor(id);
    return `<section class="okb-person">
      <header class="okb-person-head">${company ? `<span class="okb-avatar okb-company">${icon('buildings')}</span>` : avatar(id, 44)}<div><h2>${esc(company ? tr('公司目标', 'Company objectives') : nameOf(id))}${id === me()?.id ? ` <span class="okb-me">${tr('我', 'Me')}</span>` : ''}</h2><p>${esc(periodLabel(ui.cycle))} · ${objs.length} ${tr('个目标', objs.length === 1 ? 'objective' : 'objectives')}${objs.length ? (simple() ? ` · ${tr('目标分值合计', 'Objective points')} ${total} ${tr('分', 'pts')}${Math.abs(total - 100) > 0.01 ? ` <span class="okb-warn-inline">${tr('应为 100 分', 'should be 100')}</span>` : ''}` : ` · ${tr('目标权重合计', 'Objective weights')} ${total}%`) : ''}</p></div>${simple() ? totalScore(objs) : ring(pct, 52)}</header>${simple() && !company ? publishBar(id, objs) : ''}${simple() ? scoreHelp(objs) : ''}
      ${objs.map(objectiveCard).join('') || `<div class="okb-empty"><div class="okb-empty-icon">${icon('target')}</div><h3>${tr('这个周期还没有目标', 'No objectives in this cycle')}</h3><p>${addable ? tr('目标（O）写“想达成什么”，关键结果（KR）写“怎样算达成”。先创建一个目标吧。', 'An objective (O) says what you want to achieve; key results (KR) say how you’ll know. Start with one objective.') : tr('负责人还没有为这个周期设置目标。', 'No objectives have been set for this cycle yet.')}</p></div>`}
      ${addable ? (ui.adding && ui.adding.kind === 'o' ? newObjectiveForm(id) : `<button type="button" class="okb-add-row okb-add-o" data-okr="add-o">${icon('plus')} ${tr('添加目标', 'Add objective')}</button>`) : ''}
    </section>`;
  }

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
        ${ui.tab === 'team' ? `<aside class="okb-people"><label class="okb-search">${icon('magnifying-glass')}<input data-okr-search placeholder="${tr('搜索成员', 'Search people')}" value="${esc(ui.search)}"></label><ul>${peopleSections().map(([label, ids]) => (label ? `<li class="okb-people-group"><span>${label}</span><b>${ids.length}</b></li>` : '') + ids.map(id => { const objs = objectivesOf(id), pct = averagePct(objs); return `<li><button type="button" class="${ui.person === id ? 'active' : ''}" data-okr="person" data-id="${esc(id)}">${id === '__company' ? `<span class="okb-avatar okb-company">${icon('buildings')}</span>` : avatar(id)}<span class="okb-people-name">${esc(id === '__company' ? tr('公司目标', 'Company objectives') : nameOf(id))}${id === me()?.id ? ` <em>${tr('我', 'Me')}</em>` : ''}</span>${simple() && id !== '__company' ? stageChips(id, objs) : `<span class="okb-people-pct">${objs.length ? (pct === null ? objs.length + tr(' 个', '') : pct + '%') : '—'}</span>`}</button></li>`; }).join('')).join('') || `<li class="okb-hint">${tr('没有匹配的成员', 'No matching people')}</li>`}</ul></aside>` : ''}
        <div class="okb-main">${ui.person ? personView(ui.person) : ''}</div>
      </div>`}
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
        <section class="okb-d-section"><h3>${tr('描述', 'Description')}${editableO && !describing ? ` <button type="button" class="okb-link" data-okr="edit-o-desc" data-id="${esc(o.id)}">${tr('编辑', 'Edit')}</button>` : ''}</h3>${describing ? `<form id="okr-desc" data-id="${esc(o.id)}"><textarea name="description" maxlength="4000" data-okr-autofocus>${esc(o.planning?.description || '')}</textarea><div class="okb-form-actions"><button class="okb-btn primary small" type="submit">${tr('保存', 'Save')}</button><button class="okb-btn small" type="button" data-okr="cancel-edit">${tr('取消', 'Cancel')}</button></div></form>` : `<p class="okb-d-text">${o.planning?.description ? tx(o.planning.description) : esc(tr('暂无描述', 'No description'))}</p>`}</section>
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
  const rerender = () => { ctx.rerender(); focusAuto(); };
  function focusAuto() { requestAnimationFrame(() => { const el = document.querySelector('[data-okr-autofocus]'); if (el && document.activeElement !== el) { el.focus(); if (el.type === 'text' && el.value) { const n = el.value.length; el.setSelectionRange(n, n); } } }); }
  async function mutate(fn, okText) {
    if (ui.busy) return false; ui.busy = true;
    try { await fn(); await ctx.refreshOkr(); if (okText) ctx.toast(okText); return true; }
    catch (e) { const el = document.querySelector('.okb-form-error'); const msg = ctx.explainError(e); if (el) el.textContent = msg; ctx.toast(msg); return false; }
    finally { ui.busy = false; }
  }
  const patchO = (o, body) => ctx.api.request('/objectives/' + encodeURIComponent(o.id), { method:'PATCH', body:{ expectedVersion:o.version || 1, ...body } });
  const patchKr = (k, body) => ctx.api.request('/key-results/' + encodeURIComponent(k.id), { method:'PATCH', body:{ expectedMetaVersion:k.meta_version || 1, ...body } });
  const findKr = id => S().krs.find(k => k.id === id);

  document.addEventListener('click', async event => {
    if (!ctx || !S().actor) return;
    const t = event.target.closest('[data-okr]');
    if (!t) { if ((ui.menu || ui.confirm) && !event.target.closest('.okb-popover')) { ui.menu = null; ui.confirm = null; if (S().page === 'okr') rerender(); } return; }
    event.preventDefault();
    const a = t.dataset.okr, id = t.dataset.id;
    const inDrawer = !!t.closest('#overlay-root');
    const keepMenu = ['menu', 'kr-status', 'set-status', 'ask-archive-kr', 'ask-archive-o', 'archive-kr', 'archive-o', 'cancel-confirm', 'publish'].includes(a);
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
      case 'add-kr': ui.adding = { kind:'kr', id }; ui.editing = null; return rerender();
      case 'add-o': ui.adding = { kind:'o' }; ui.editing = null; return rerender();
      case 'cancel-add': ui.adding = null; return rerender();
      case 'score': ui.scoring = { id, kind:t.dataset.target || 'o', who:t.dataset.kind }; return rerender();
      case 'score-help': ui.scoreHelp = !ui.scoreHelp; return rerender();
      case 'score-cancel': ui.scoring = null; return rerender();
      case 'score-preset': { const f = t.closest('form'); const inp = f?.querySelector('[name="score"]'); if (inp) inp.value = t.dataset.value; f?.querySelectorAll('.okb-preset').forEach(b => b.classList.toggle('on', b === t)); return; }
      case 'ask-archive-kr': ui.menu = null; ui.confirm = { kind:'kr', id }; return rerender();
      case 'ask-archive-o': ui.menu = null; ui.confirm = { kind:'o', id }; return rerender();
      case 'cancel-confirm': ui.confirm = null; return rerender();
      case 'archive-kr': { const k = findKr(id); ui.confirm = null; if (k) await mutate(() => ctx.api.post('/key-results/' + encodeURIComponent(k.id) + '/archive', { expectedMetaVersion:k.meta_version || 1 }), tr('KR 已删除', 'KR deleted')); return rerender(); }
      case 'archive-o': { const o = objectiveById(id); ui.confirm = null; if (o) await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(o.id) + '/archive', { expectedVersion:o.version || 1 }), tr('目标已删除', 'Objective deleted')); return rerender(); }
      case 'open-o': return openDrawer(id);
      case 'edit-align': ui.editing = { kind:'align', id }; return openDrawer(id);
      case 'edit-o-desc': ui.editing = { kind:'o-desc', id }; return inDrawer ? paintDrawer() : openDrawer(id);
      case 'appraisal': return ctx.openAppraisal(id);
      case 'measure': return ctx.measurement(id);
      case 'edit-metric': return metricDialog(id);
      case 'source': return ctx.openObjectiveSource(id);
      case 'rubric': return rubricDialog();
      case 'publish': ui.confirm = { kind:'publish' }; return rerender();
      case 'publish-confirm': {
        const period = ui.cycle; ui.confirm = null;
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
    if (event.key === 'Escape' && (ui.editing || ui.adding || ui.menu || ui.confirm) && !document.querySelector('#overlay-root [role="dialog"]')) { ui.editing = null; ui.adding = null; ui.menu = null; ui.confirm = null; rerender(); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target; if (!ctx || !form.id?.startsWith('okr-')) return;
    event.preventDefault();
    const v = Object.fromEntries(new FormData(form)), err = form.querySelector('.okb-form-error');
    if (err) err.textContent = '';
    if (form.id === 'okr-edit') {
      const kind = form.dataset.kind, id = form.dataset.id, raw = String(v.value || '').trim();
      if (!raw) return;
      let ok = false;
      if (kind === 'o-title') { const o = objectiveById(id); if (raw === o.title) ok = true; else ok = await mutate(() => patchO(o, { title:raw }), tr('已保存', 'Saved')); }
      if (kind === 'o-weight') ok = await mutate(() => patchO(objectiveById(id), { weight:Number(raw) }), tr('已保存', 'Saved'));
      if (kind === 'kr-title') { const k = findKr(id); if (raw === k.title) ok = true; else ok = await mutate(() => patchKr(k, { title:raw }), tr('已保存', 'Saved')); }
      if (kind === 'kr-weight') { const k = findKr(id), o = objectiveById(k.objective_id), w = Number(raw), others = krSum(o) - (Number(k.planning?.weight) > 0 ? Number(k.planning.weight) : 0), max = Math.round((100 - others) * 100) / 100;
        if (w > max + 0.001 && w > (Number(k.planning?.weight) || 0)) { ctx.toast?.(tr(`同一目标下 KR 权重合计必须正好 100%，这条最多只能填 ${num(Math.max(0, max))}%。`, `KR weights must total exactly 100%; this one can be at most ${num(Math.max(0, max))}%.`)); return; }
        ok = await mutate(() => patchKr(k, { weight:w }), tr('已保存', 'Saved')); }
      if (ok) ui.editing = null;
      return rerender();
    }
    if (form.id === 'okr-new-kr' && simple()) {
      const o = objectiveById(form.dataset.objectiveId), text = String(v.targetText || '').trim(), m = /^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/.exec(text);
      const left = Math.round((100 - krSum(o)) * 100) / 100, w = Number(v.weight);
      if (!(w > 0)) { if (err) err.textContent = tr('请填写这条 KR 的权重。', 'Enter this KR’s weight.'); return; }
      if (w > left + 0.001) { if (err) err.textContent = tr(`同一目标下 KR 权重合计必须正好 100%，这条最多只能填 ${num(Math.max(0, left))}%。`, `KR weights must total exactly 100%; this one can be at most ${num(Math.max(0, left))}%.`); return; }
      const planning = { weight:w, description:'', targetText:text };
      const body = m && Number(m[1]) > 0 ? { title:v.title.trim(), baseline:0, target:Number(m[1]), direction:'increase', unit:(m[2] || '').trim().slice(0, 30) || tr('项', 'units'), planning } : { title:v.title.trim(), baseline:0, target:1, direction:'increase', unit:'完成', planning };
      const ok = await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(o.id) + '/key-results', body), tr('关键结果已添加', 'Key result added'));
      if (ok) ui.adding = { kind:'kr', id:o.id };
      rerender(); return;
    }
    if (form.id === 'okr-new-kr') {
      const o = objectiveById(form.dataset.objectiveId), weight = Number(v.weight);
      const body = { title:v.title.trim(), baseline:Number(v.baseline ?? 0), target:Number(v.target), direction:v.direction || 'increase', unit:v.unit.trim(), ...(v.weight ? { planning:{ weight, description:'' } } : {}) };
      if (body.direction === 'increase' ? body.target <= body.baseline : body.target >= body.baseline) { if (err) err.textContent = tr('目标值要和基准值不同，并符合“越高 / 越低越好”的方向。', 'The target must differ from the baseline in the chosen direction.'); return; }
      const ok = await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(o.id) + '/key-results', body), tr('关键结果已添加', 'Key result added'));
      if (ok) ui.adding = { kind:'kr', id:o.id }; // keep the row open to add the next KR quickly
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
      if (simple() && (v.weight ? Number(v.weight) > autoWeight + 0.001 : autoWeight <= 0)) { if (err) err.textContent = autoWeight > 0 ? tr(`本周期所有目标合计必须正好 100 分，这个目标最多只能填 ${num(autoWeight)} 分。`, `Objectives must total exactly 100 points; this one can be at most ${num(autoWeight)}.`) : tr('本周期目标分值已满 100 分，请先调低其他目标的分值。', 'Objectives already total 100 points; lower another one first.'); return; }
      const body = { title:v.title.trim(), level:v.level || 'personal', ownerId:owner, planning:{ period, weight:v.weight ? Number(v.weight) : Math.min(100, autoWeight), location:'', description:String(v.description || '').trim(), type:'mandatory', bonusIncluded:false, scoringDueDate:dueDateFor(period) }, ...(collab() && v.parentObjectiveId ? { parentObjectiveId:v.parentObjectiveId } : {}) };
      let createdId = null;
      const ok = await mutate(async () => { const r = await ctx.api.post('/objectives', body); createdId = r?.id; }, simple() ? tr('目标已创建，接着添加关键结果（目标值可以写“完成”或明确数字）', 'Objective created — add key results (target: “done” or a number)') : tr('目标已创建，接着添加关键结果吧', 'Objective created — now add its key results'));
      if (ok) { ui.adding = createdId ? { kind:'kr', id:createdId } : null; if (ui.tab === 'team') ui.person = body.ownerId; ui.cycle = period; }
      rerender(); return;
    }
    if (form.id === 'okr-align') {
      const o = objectiveById(form.dataset.id), parent = v.parentObjectiveId || null;
      if (await mutate(() => patchO(o, { parentObjectiveId:parent }), tr('对齐已更新', 'Alignment updated'))) ui.editing = null;
      rerender(); paintDrawer(); return;
    }
    if (form.id === 'okr-desc') {
      const o = objectiveById(form.dataset.id);
      if (await mutate(() => patchO(o, { description:String(v.description || '').trim() }), tr('已保存', 'Saved'))) ui.editing = null;
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

  function reset() { orgChart = null; ui.tab = 'mine'; ui.person = null; ui.cycle = null; ui.search = ''; ui.editing = null; ui.adding = null; ui.menu = null; ui.confirm = null; ui.drawer = null; ui.updates.clear(); ui.collapsed.clear(); }
  /* Called by live-app after data refresh so an open drawer reflects new data. */
  function refreshed() { if (ui.drawer && document.querySelector('#overlay-root .okb-drawer')) paintDrawer(); }

  window.WorkOSOkrBoard = { configure(next) { ctx = next; }, render, reset, refreshed, _ui:ui, _helpers:{ objectivePct, averagePct, cycles, periodLabel, dueDateFor, canEdit } };
})();
