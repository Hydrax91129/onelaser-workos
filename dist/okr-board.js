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
  const nameOf = id => id ? (S().directory.find(u => u.id === id)?.display_name || (me()?.id === id ? me().display_name : id)) : tr('公司','Company');
  const initials = id => { const n = nameOf(id).trim(); return /^[\x00-\x7f]+$/.test(n) ? n.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() : n.slice(-2); };
  const hue = id => { let h = 0; for (const c of String(id || 'company')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const avatar = (id, size = 28) => `<span class="okb-avatar" style="--okb-h:${hue(id)};width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px" aria-hidden="true">${esc(initials(id))}</span>`;
  const icon = (name) => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
  const canEdit = o => !!o && o.level !== 'company' && o.department_id === me()?.department_id && (isManager() || (o.level === 'personal' && o.owner_id === me()?.id));
  const canPost = o => !!o && (o.level === 'company' ? isManager() : o.department_id === me()?.department_id && (isManager() || o.owner_id === me()?.id));
  const canCreateFor = ownerId => isManager() || ownerId === me()?.id;

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
  function people() {
    const ids = new Set(S().directory.map(u => u.id));
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
          ${simple() ? scoreBlock(o) : weight}
          ${simple() && !krs.length ? '' : `<div class="okb-o-progress">${bar(pct)}<span class="okb-pct">${pct === null ? '—' : pct + '%'}</span></div>`}
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
      ${ui.scoring && ui.scoring.id === o.id ? scoreForm(o) : ''}
      ${simple() && o.planning?.description && !collapsed ? `<div class="okb-o-done">${icon('flag-checkered')} ${tx(o.planning.description)}</div>` : ''}
      ${collapsed || (simple() && !krs.length) ? (simple() && !krs.length && edit && !collapsed ? (ui.adding && ui.adding.kind === 'kr' && ui.adding.id === o.id ? `<div class="okb-krs">${newKrForm(o)}</div>` : `<button type="button" class="okb-add-row okb-add-kr-optional" data-okr="add-kr" data-id="${esc(o.id)}">${icon('plus')} ${tr('添加关键结果（可选，用数字衡量进度）', 'Add a key result (optional, track progress with a number)')}</button>`) : '') : `<div class="okb-krs">${krs.map((k, i) => krRow(o, k, i)).join('') || `<div class="okb-empty-row">${tr('还没有关键结果。KR 应是可衡量的结果，例如“新增 30 家经销商”。', 'No key results yet. A KR is a measurable result, e.g. “Sign 30 new dealers”.')}</div>`}
        ${weightWarn && !simple() ? `<div class="okb-warn">${icon('warning')} ${tr(`KR 权重合计 ${krWeights}%，应等于目标权重 ${o.planning.weight}%`, `KR weights total ${krWeights}%; they should equal the objective weight ${o.planning.weight}%`)}</div>` : ''}
        ${edit ? (ui.adding && ui.adding.kind === 'kr' && ui.adding.id === o.id ? newKrForm(o) : `<button type="button" class="okb-add-row" data-okr="add-kr" data-id="${esc(o.id)}">${icon('plus')} ${tr('添加关键结果', 'Add key result')}</button>`) : ''}</div>`}
    </article>`;
  }
  function newKrForm(o) {
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
      ${simple() ? `<details class="okb-more-fields"><summary>${tr('更多设置（可不填）', 'More settings (optional)')}</summary>` : ''}
      <label class="okb-mini"><span>${tr('权重 %', 'Weight %')}</span><input name="weight" type="number" min="0.01" max="100" step="0.01" ${simple() ? `placeholder="${tr('自动', 'Auto')}"` : 'required'}></label>
      ${isManager() ? `<label class="okb-mini"><span>${tr('负责人', 'Owner')}</span><select name="ownerId">${owners.map(u => `<option value="${esc(u.id)}" ${u.id === ownerId ? 'selected' : ''}>${esc(u.display_name)}</option>`).join('')}</select></label>
      <label class="okb-mini"><span>${tr('层级', 'Level')}</span><select name="level"><option value="personal">${tr('个人目标', 'Personal')}</option><option value="department">${tr('部门目标', 'Department')}</option></select></label>` : `<input type="hidden" name="ownerId" value="${esc(me().id)}"><input type="hidden" name="level" value="personal">`}
      ${collab() && parents.length ? `<label class="okb-mini okb-wide"><span>${tr('对齐到', 'Align to')}</span><select name="parentObjectiveId"><option value="">${tr('不对齐', 'No alignment')}</option>${parents.map(p => `<option value="${esc(p.id)}">${esc(nameOf(p.level === 'company' ? null : p.owner_id))} · ${esc(txt(p.title))}</option>`).join('')}</select></label>` : ''}
      ${simple() ? '</details>' : ''}
      <div class="okb-form-actions"><span class="okb-hint">${tr('周期：', 'Cycle: ')}${esc(periodLabel(ui.cycle || nowPeriod()))}</span><button class="okb-btn primary small" type="submit">${tr('创建目标', 'Create objective')}</button><button class="okb-btn small" type="button" data-okr="cancel-add">${tr('取消', 'Cancel')}</button></div>
      <p class="okb-form-error" role="alert"></p>
    </form>`;
  }

  /* ---------- simple scoring: self score + leader score = final ---------- */
  const finalOf = o => o.scores?.manager?.score ?? null;
  function totalScore(objs) {
    const scored = objs.filter(o => finalOf(o) !== null), w = o => Number(o.planning?.weight) || 1;
    if (!objs.length) return '';
    if (!scored.length) return `<div class="okb-total pending"><strong>—</strong><span>${tr('待评分', 'Not scored')}</span></div>`;
    const sum = scored.reduce((n, o) => n + w(o), 0), val = Math.round(scored.reduce((n, o) => n + finalOf(o) * w(o), 0) / sum);
    return `<div class="okb-total ${val >= 80 ? 'good' : val >= 60 ? 'mid' : 'low'}" title="${tr('按目标权重加权的领导评分', 'Leader scores weighted by objective weight')}"><strong>${val}</strong><span>${tr('OKR 得分', 'OKR score')}${scored.length < objs.length ? ` · ${scored.length}/${objs.length}` : ''}</span></div>`;
  }
  function scoreBlock(o) {
    const self = o.scores?.self, lead = o.scores?.manager, mine = o.owner_id === me()?.id;
    const selfBtn = mine ? `<button type="button" class="okb-sc ${self ? 'done' : 'todo'}" data-okr="score" data-kind="self" data-id="${esc(o.id)}">${tr('自评', 'Self')} <b>${self ? self.score : '—'}</b></button>` : `<span class="okb-sc ${self ? 'done' : ''}">${tr('自评', 'Self')} <b>${self ? self.score : '—'}</b></span>`;
    const leadBtn = o.canLeadScore ? `<button type="button" class="okb-sc final ${lead ? 'done' : 'todo'}" data-okr="score" data-kind="manager" data-id="${esc(o.id)}">${tr('领导', 'Leader')} <b>${lead ? lead.score : '—'}</b></button>` : `<span class="okb-sc final ${lead ? 'done' : ''}">${tr('领导', 'Leader')} <b>${lead ? lead.score : '—'}</b></span>`;
    return `<div class="okb-scores">${selfBtn}${leadBtn}</div>`;
  }
  function scoreForm(o) {
    const kind = ui.scoring.kind, cur = o.scores?.[kind], self = o.scores?.self;
    const presets = [[100, tr('超出预期', 'Exceeded')], [80, tr('完成', 'Achieved')], [60, tr('部分完成', 'Partly')], [30, tr('未完成', 'Missed')]];
    return `<form class="okb-score-form" id="okr-score" data-id="${esc(o.id)}" data-kind="${kind}">
      <h4>${kind === 'self' ? tr('给这个目标自评', 'Self-score this objective') : tr('领导评分（最终分）', 'Leader score (final)')}</h4>
      ${kind === 'manager' && self ? `<p class="okb-hint">${tr('员工自评', 'Self score')}：<b>${self.score}</b>${self.comment ? ' · ' + tx(self.comment) : ''}</p>` : ''}
      <div class="okb-presets">${presets.map(([v, l]) => `<button type="button" class="okb-preset" data-okr="score-preset" data-value="${v}"><b>${v}</b><span>${l}</span></button>`).join('')}</div>
      <label class="okb-mini"><span>${tr('分数 0–100', 'Score 0–100')}</span><input name="score" type="number" min="0" max="100" step="1" required value="${cur ? cur.score : ''}"></label>
      <label class="okb-mini okb-wide"><span>${kind === 'self' ? tr('一句话说明（可选）', 'One-line note (optional)') : tr('评语（可选）', 'Comment (optional)')}</span><input name="comment" maxlength="2000" value="${esc(cur?.comment || '')}" placeholder="${kind === 'self' ? tr('例如：转化率做到 3.2%', 'e.g. reached 3.2%') : tr('例如：达成，移动端还要优化', 'e.g. achieved; mobile needs work')}"></label>
      <div class="okb-form-actions"><button class="okb-btn primary small" type="submit">${tr('保存分数', 'Save score')}</button><button class="okb-btn small" type="button" data-okr="score-cancel">${tr('取消', 'Cancel')}</button></div>
    </form>`;
  }

  /* ---------- person view ---------- */
  function personView(id) {
    const objs = objectivesOf(id), pct = averagePct(objs), company = id === '__company';
    const total = objs.reduce((s, o) => s + (Number.isFinite(o.planning?.weight) ? o.planning.weight : 0), 0);
    const addable = !company && canCreateFor(id);
    return `<section class="okb-person">
      <header class="okb-person-head">${company ? `<span class="okb-avatar okb-company">${icon('buildings')}</span>` : avatar(id, 44)}<div><h2>${esc(company ? tr('公司目标', 'Company objectives') : nameOf(id))}${id === me()?.id ? ` <span class="okb-me">${tr('我', 'Me')}</span>` : ''}</h2><p>${esc(periodLabel(ui.cycle))} · ${objs.length} ${tr('个目标', objs.length === 1 ? 'objective' : 'objectives')}${objs.length && !simple() ? ` · ${tr('目标权重合计', 'Objective weights')} ${total}%` : ''}</p></div>${simple() ? totalScore(objs) : ring(pct, 52)}</header>
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
      <nav class="okb-tabs" role="tablist">${tabs.map(([id, label, ic]) => `<button type="button" role="tab" aria-selected="${ui.tab === id}" class="${ui.tab === id ? 'active' : ''}" data-okr="tab" data-value="${id}">${icon(ic)} ${label}</button>`).join('')}<span class="okb-tabs-spacer"></span><button type="button" class="okb-btn small" data-okr="rubric">${icon('info')} ${tr('评分标准', 'Scoring guide')}</button></nav>
      ${ui.tab === 'align' ? alignView() : `<div class="okb-layout ${ui.tab === 'mine' ? 'okb-solo' : ''}">
        ${ui.tab === 'team' ? `<aside class="okb-people"><label class="okb-search">${icon('magnifying-glass')}<input data-okr-search placeholder="${tr('搜索成员', 'Search people')}" value="${esc(ui.search)}"></label><ul>${people().map(id => { const objs = objectivesOf(id), pct = averagePct(objs); return `<li><button type="button" class="${ui.person === id ? 'active' : ''}" data-okr="person" data-id="${esc(id)}">${id === '__company' ? `<span class="okb-avatar okb-company">${icon('buildings')}</span>` : avatar(id)}<span class="okb-people-name">${esc(id === '__company' ? tr('公司目标', 'Company objectives') : nameOf(id))}${id === me()?.id ? ` <em>${tr('我', 'Me')}</em>` : ''}</span><span class="okb-people-pct">${objs.length ? (pct === null ? objs.length + tr(' 个', '') : pct + '%') : '—'}</span></button></li>`; }).join('') || `<li class="okb-hint">${tr('没有匹配的成员', 'No matching people')}</li>`}</ul></aside>` : ''}
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
    const keepMenu = ['menu', 'kr-status', 'set-status', 'ask-archive-kr', 'ask-archive-o', 'archive-kr', 'archive-o', 'cancel-confirm'].includes(a);
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
      case 'score': ui.scoring = { id, kind:t.dataset.kind }; return rerender();
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
      if (kind === 'kr-weight') ok = await mutate(() => patchKr(findKr(id), { weight:Number(raw) }), tr('已保存', 'Saved'));
      if (ok) ui.editing = null;
      return rerender();
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
      const body = { kind:form.dataset.kind, score:Math.max(0, Math.min(100, Math.round(Number(v.score)))), ...(String(v.comment || '').trim() ? { comment:String(v.comment).trim() } : {}) };
      if (await mutate(() => ctx.api.post('/objectives/' + encodeURIComponent(form.dataset.id) + '/scores', body), body.kind === 'self' ? tr('自评已保存，等待领导评分', 'Self score saved; waiting for your leader') : tr('最终分已保存', 'Final score saved'))) ui.scoring = null;
      rerender(); return;
    }
    if (form.id === 'okr-new-o') {
      const period = ui.cycle || nowPeriod();
      const owner = v.ownerId || me().id, used = S().objectives.filter(x => x.owner_id === owner && x.planning?.period === period && x.level !== 'company').reduce((n, x) => n + (Number(x.planning?.weight) || 0), 0), autoWeight = Math.max(1, Math.round((100 - used) * 100) / 100 || 1);
      const body = { title:v.title.trim(), level:v.level || 'personal', ownerId:owner, planning:{ period, weight:v.weight ? Number(v.weight) : Math.min(100, autoWeight), location:'', description:String(v.description || '').trim(), type:'mandatory', bonusIncluded:false, scoringDueDate:dueDateFor(period) }, ...(collab() && v.parentObjectiveId ? { parentObjectiveId:v.parentObjectiveId } : {}) };
      let createdId = null;
      const ok = await mutate(async () => { const r = await ctx.api.post('/objectives', body); createdId = r?.id; }, simple() ? tr('目标已创建。周期结束时点“自评”打分，领导评分后就出最终分。', 'Objective created. Self-score it at the end of the cycle; your leader’s score is final.') : tr('目标已创建，接着添加关键结果吧', 'Objective created — now add its key results'));
      if (ok) { ui.adding = createdId && !simple() ? { kind:'kr', id:createdId } : null; if (ui.tab === 'team') ui.person = body.ownerId; ui.cycle = period; }
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
    ctx.modal(tr('评分标准', 'Scoring guide'), `${O?.rubric ? O.rubric(lang()) : ''}<p>${tr('每个 KR 由员工提交成果和自评，再由主管核对后确认评分。完成为 80 分，卓越完成为 100 分。', 'For each KR the owner submits evidence and a self evaluation, then a manager verifies and confirms the score. Complete is 80; exceptional is 100.')}</p><p>${tr('权重按周期占比填写：例如目标权重 50%，其下 KR 可以是 30% 和 20%，KR 权重合计应等于目标权重。', 'Weights are period shares: a 50% objective may have KRs of 30% and 20%; KR weights should add up to the objective weight.')}</p><p>${tr('进度来自 KR 的实际值（由主管记录核验），状态（正常 / 有风险 / 已延期）由负责人判断。进度和状态都不会自动改变评分。', 'Progress comes from KR actual values recorded by a manager; status (on track / at risk / off track) is the owner’s judgement. Neither changes the score automatically.')}</p>`,
      `<button class="btn" data-live-action="close">${tr('知道了', 'Got it')}</button>`);
  }

  function reset() { ui.tab = 'mine'; ui.person = null; ui.cycle = null; ui.search = ''; ui.editing = null; ui.adding = null; ui.menu = null; ui.confirm = null; ui.drawer = null; ui.updates.clear(); ui.collapsed.clear(); }
  /* Called by live-app after data refresh so an open drawer reflects new data. */
  function refreshed() { if (ui.drawer && document.querySelector('#overlay-root .okb-drawer')) paintDrawer(); }

  window.WorkOSOkrBoard = { configure(next) { ctx = next; }, render, reset, refreshed, _ui:ui, _helpers:{ objectivePct, averagePct, cycles, periodLabel, dueDateFor, canEdit } };
})();
