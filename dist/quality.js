'use strict';
/* Product quality issues → factory corrective action (GET/POST /quality…).
 * One issue per product defect, classified with a strict two-level code (category → defect). A quality lead
 * sends it to the responsible factory; factory staff (colleagues in the factory's DingTalk department) write
 * the root cause, corrective/preventive action and an implementation date; we approve or send it back, the
 * factory reports the batch from which the fix is in place, and we verify before closing. Each step's date is
 * recorded so we can see how long the factory took to reply and to implement. Factory staff only see issues
 * sent to their own factory.
 */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let ctx = null, data = null, detail = null, loading = false, error = '', busy = false;
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const fmt = s => { if (!s) return '—'; const [, m, d] = s.split('-').map(Number); return lang() === 'en' ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' }) : `${m}月${d}日`; };
  const today = () => data?.today || new Date().toISOString().slice(0, 10);

  const COLORS = { OPT:'#e2445c', ELE:'#fdab3d', MEC:'#579bfc', SFW:'#a25ddc', STR:'#00a9a5', PKG:'#9d50dd', DOC:'#9699a6' };
  const SEV = { S1:['S1 安全 / 停机', 'S1 Safety / down', '#e2445c'], S2:['S2 功能受影响', 'S2 Function impaired', '#fdab3d'], S3:['S3 轻微', 'S3 Minor', '#579bfc'] };
  const FLOW = { new:['未提交工厂', 'Not sent yet', '#c4c4c4'], sent:['待工厂方案', 'Awaiting factory plan', '#fdab3d'], plan_review:['方案待批准', 'Plan awaiting approval', '#a25ddc'], doing:['执行中', 'In execution', '#579bfc'], verify:['待验证', 'Awaiting verification', '#00a9a5'], closed:['已关闭', 'Closed', '#00c875'] };
  const LINK = { ticket:['客服工单', 'Support ticket', 'headset'], rma:['退货维修', 'Return / repair', 'arrow-u-up-left'], review:['评价', 'Review', 'star'], forum:['用户论坛', 'User forum', 'chats-circle'], reddit:['Reddit', 'Reddit', 'reddit-logo'], amazon:['Amazon 评论', 'Amazon review', 'amazon-logo'], other:['其他', 'Other', 'link'] };
  const EVENT = { created:['建立问题', 'Issue created'], updated:['修改信息', 'Details edited'], sent:['提交给工厂', 'Sent to factory'], plan:['工厂提交方案', 'Factory submitted plan'], plan_approve:['方案已批准', 'Plan approved'], plan_return:['方案被退回', 'Plan sent back'], implemented:['工厂已落实', 'Factory implemented'], verify_pass:['验证有效，已关闭', 'Verified and closed'], verify_fail:['验证未通过，退回执行', 'Verification failed'], cancelled:['不整改关闭', 'Closed without fix'] };

  const ui = { filter:'open', cat:'', model:'', sev:'', q:'' };
  const pill = (map, k) => map[k] ? `<span class="qa-pill" style="--c:${map[k][2]}">${esc(tr(map[k][0], map[k][1]))}</span>` : '';
  const cat = i => data.categories[i.category];
  const codeLabel = i => { const d = cat(i)?.defects[i.defect]; return `${i.code} · ${d ? tr(d[0], d[1]) : ''}`; };
  const factoryName = id => { const f = data?.factories.find(x => x.id === id); return f ? tr(f.zh, f.en) : id; };
  const isLead = () => data?.role === 'lead';

  function configure(next) { ctx = next; }
  function reset() { data = null; detail = null; loading = false; error = ''; Object.assign(ui, { filter:'open', cat:'', model:'', sev:'', q:'' }); }
  async function load() {
    if (loading || !ctx?.api) return; loading = true;
    try { data = await ctx.api.get('/quality'); error = ''; }
    catch (e) { error = e.message || tr('品质问题读取失败', 'Could not load quality issues'); }
    finally { loading = false; ctx.rerender(); }
  }

  /* ---------- page ---------- */
  function render() {
    if (!ctx) return '';
    if (!data && !error) { load(); return `<div class="qa"><p class="qa-hint">${tr('正在读取品质问题…', 'Loading quality issues…')}</p></div>`; }
    if (error && !data) return `<div class="qa"><div class="wms-alert">${esc(error)}</div></div>`;
    const issues = data.items, open = issues.filter(i => i.status !== 'closed'), fixed = issues.filter(i => i.resolution === 'fixed');
    const mttr = fixed.length ? Math.round(fixed.reduce((n, i) => n + (i.durations.total || 0), 0) / fixed.length) : null;
    const overdue = issues.filter(i => i.overdue);
    const kpi = (label, v, note, tone = '') => `<div class="qa-kpi ${tone}"><span>${label}</span><strong>${v}</strong><em>${note}</em></div>`;
    const factory = data.role === 'factory';
    const list = issues.filter(i => (ui.filter === 'all' || (ui.filter === 'open' ? i.status !== 'closed' : ui.filter === 'overdue' ? !!i.overdue : i.status === ui.filter)) && (!ui.cat || i.category === ui.cat) && (!ui.model || i.model === ui.model) && (!ui.sev || i.severity === ui.sev)
      && (!ui.q || `${i.number} ${i.title} ${i.code} ${i.model} ${i.batch}`.toLowerCase().includes(ui.q.toLowerCase())))
      .sort((a, b) => (!!b.overdue - !!a.overdue) || a.severity.localeCompare(b.severity) || b.affected - a.affected);
    const tabs = [['open', tr('未关闭', 'Open')], ...(factory ? [] : [['new', tr('未提交工厂', 'Not sent')]]), ['sent', tr('待工厂方案', 'Awaiting plan')], ['plan_review', tr('待批准', 'Awaiting approval')], ['doing', tr('执行中', 'In execution')], ['verify', tr('待验证', 'To verify')], ['overdue', tr('已逾期', 'Overdue')], ['closed', tr('已关闭', 'Closed')], ['all', tr('全部', 'All')]];
    const count = k => k === 'open' ? open.length : k === 'all' ? issues.length : k === 'overdue' ? overdue.length : issues.filter(i => i.status === k).length;
    return `<div class="qa">
      <div class="page-heading"><div><div class="eyebrow">QUALITY</div><h1>${tr('产品质量追踪', 'Product quality tracking')}</h1><p>${factory
        ? tr(`${factoryName(data.factory)}：这里是 OneLaser 提交给你们的产品问题。请填写根本原因、纠正和预防措施及落实日期，落实后填写从哪个批次起生效。`, `${factoryName(data.factory)}: product issues OneLaser sent to you. Write the root cause, corrective and preventive action and an implementation date; once in place, report the batch it applies from.`)
        : tr('同一个缺陷合并成一个问题，严格分类后提交给责任工厂；工厂出方案，我们批准，工厂落实，我们验证后关闭。每一步的日期都有记录。', 'Each defect is one issue with a strict code, sent to the responsible factory; the factory plans, we approve, the factory implements and we verify before closing. Every step is dated.')}</p></div>
        <div class="heading-actions">${data.canCreate ? `<button class="btn primary" data-qa="new">${icon('plus')} ${tr('新建问题', 'New issue')}</button>` : ''}</div></div>
      <div class="qa-kpis">
        ${kpi(tr('未关闭问题', 'Open issues'), open.length, `${open.filter(i => i.severity === 'S1').length} ${tr('个 S1 严重', 'S1 critical')}`, open.some(i => i.severity === 'S1') ? 'bad' : '')}
        ${kpi(tr('影响数量', 'Affected'), open.reduce((n, i) => n + i.affected, 0), tr('未关闭问题的反馈 / 台数', 'Reports / units, open issues'))}
        ${kpi(tr('待工厂方案', 'Awaiting factory plan'), count('sent'), tr('需要工厂回复', 'Factory to respond'), 'warn')}
        ${kpi(tr('方案待批准', 'Awaiting approval'), count('plan_review'), factory ? tr('等 OneLaser 审批', 'OneLaser to decide') : tr('等你审批', 'Needs your decision'), count('plan_review') ? 'violet' : '')}
        ${kpi(tr('已逾期', 'Overdue'), overdue.length, tr('超过方案或落实期限', 'Past plan or implementation date'), overdue.length ? 'bad' : '')}
        ${kpi(tr('平均关闭天数', 'Avg days to close'), mttr ?? '—', tr('从发现到验证关闭', 'Found → verified'))}
      </div>
      ${window.WorkOSInsights?.slot('quality') || ''}
      ${issues.length ? `<div class="qa-charts">
        <section class="qa-card"><h3>${icon('chart-bar-horizontal')} ${tr('按问题分类（影响数量）', 'By category (affected)')}</h3>${hbars(Object.keys(data.categories).map(k => [tr(data.categories[k].zh, data.categories[k].en), issues.filter(i => i.category === k).reduce((n, i) => n + i.affected, 0), COLORS[k] || '#579bfc', k]).filter(r => r[1]), 'cat')}</section>
        <section class="qa-card"><h3>${icon('cube')} ${tr('按型号（未关闭）', 'By model (open)')}</h3>${hbars([...new Set(open.map(i => i.model))].map(m => [m, open.filter(i => i.model === m).reduce((n, i) => n + i.affected, 0), '#579bfc', m]), 'model')}</section>
        <section class="qa-card"><h3>${icon('trend-up')} ${tr('近 6 周新增 vs 关闭', 'New vs closed, last 6 weeks')}</h3>${trend(issues)}</section>
        <section class="qa-card"><h3>${icon('list-numbers')} ${tr('缺陷排行（帕累托）', 'Top defects (Pareto)')}</h3>${pareto(issues)}</section>
      </div>
      <div class="qa-two">
        <section class="qa-card"><h3>${icon('tree-structure')} ${tr('问题分类树（一级分类 → 二级缺陷）', 'Issue tree (category → defect)')}</h3>${tree(issues)}</section>
        <section class="qa-card"><h3>${icon('flow-arrow')} ${tr('解决进度与工厂时效', 'Progress and factory turnaround')}</h3>${progress(issues)}</section>
      </div>` : ''}
      <section class="qa-card">
        <div class="qa-toolbar"><div class="qa-seg">${tabs.map(([k, l]) => `<button class="${ui.filter === k ? 'active' : ''}" data-qa="filter" data-v="${k}">${l} <b>${count(k)}</b></button>`).join('')}</div>
          <label class="qa-search">${icon('magnifying-glass')}<input data-qa-q placeholder="${tr('搜索编号、问题、型号或批次', 'Search ID, issue, model or batch')}" value="${esc(ui.q)}"></label>
          <select data-qa-sel="sev"><option value="">${tr('全部严重度', 'All severities')}</option>${Object.keys(SEV).map(k => `<option value="${k}" ${ui.sev === k ? 'selected' : ''}>${esc(tr(SEV[k][0], SEV[k][1]))}</option>`).join('')}</select>
          ${ui.cat || ui.model ? `<button class="qa-link" data-qa="clear">${icon('x')} ${tr('清除图表筛选', 'Clear chart filter')}: ${esc(ui.cat ? tr(data.categories[ui.cat].zh, data.categories[ui.cat].en) : ui.model)}</button>` : ''}</div>
        <table class="qa-table" data-help-table="qa-issues"><thead><tr><th>${tr('编号', 'ID')}</th><th>${tr('问题', 'Issue')}</th><th>${tr('分类码', 'Code')}</th><th>${tr('严重度', 'Severity')}</th><th class="num">${tr('影响', 'Affected')}</th><th>${tr('责任工厂', 'Factory')}</th><th>${tr('状态', 'Status')}</th><th>${tr('当前期限', 'Due')}</th><th class="num">${tr('已持续', 'Age')}</th></tr></thead><tbody>
        ${list.map(i => { const due = i.status === 'sent' ? i.dates.planDue : i.status === 'doing' ? i.dates.implDue : null;
          return `<tr data-qa="open" data-id="${esc(i.id)}" tabindex="0" class="${i.severity === 'S1' && i.status !== 'closed' ? 'qa-s1' : ''}"><td class="qa-id">${esc(i.number)}</td><td><strong>${esc(i.title)}</strong><span>${esc(i.model)}${i.batch ? ' · ' + esc(i.batch) : ''}</span></td><td><span class="qa-code" style="--c:${COLORS[i.category] || '#579bfc'}">${esc(codeLabel(i))}</span></td><td>${pill(SEV, i.severity)}</td><td class="num"><b>${i.affected}</b></td><td>${esc(factoryName(i.factory))}</td><td>${pill(FLOW, i.status)}${i.resolution === 'cancelled' ? `<small class="qa-new">${tr('不整改', 'No fix')}</small>` : ''}</td><td class="${i.overdue ? 'qa-bad' : ''}">${due ? fmt(due) + (i.overdue ? ` · ${tr('逾期', 'overdue')} ${days(due, today())}${tr('天', 'd')}` : '') : '—'}</td><td class="num">${i.durations.total ?? '—'}${tr('天', 'd')}</td></tr>`; }).join('') || `<tr><td colspan="9" class="qa-empty">${issues.length ? tr('没有符合条件的问题', 'No matching issues') : factory ? tr('暂时没有提交给你们工厂的问题', 'No issues have been sent to your factory') : tr('还没有品质问题。点击右上角“新建问题”登记第一个。', 'No quality issues yet. Use “New issue” to register the first one.')}</td></tr>`}
        </tbody></table></section>
    </div>`;
  }
  function hbars(rows, kind) {
    if (!rows.length) return `<p class="qa-hint">${tr('暂无数据', 'No data')}</p>`;
    const max = Math.max(1, ...rows.map(r => r[1]));
    return `<div class="qa-hbars">${rows.sort((a, b) => b[1] - a[1]).map(([label, n, color, key]) => `<button class="qa-hbar ${(kind === 'cat' ? ui.cat : ui.model) === key ? 'on' : ''}" data-qa="chart-${kind}" data-v="${esc(key)}"><span>${esc(label)}</span><i style="width:${n / max * 100}%;background:${color}"></i><b>${n}</b></button>`).join('')}</div>`;
  }
  /* New vs closed per week, from the issues' found and closed dates. */
  function trend(issues) {
    const end = new Date(today() + 'T00:00:00'), weekStart = n => { const d = new Date(end); d.setDate(d.getDate() - 7 * (6 - n) + 1); return d.toISOString().slice(0, 10); };
    const weeks = [0, 1, 2, 3, 4, 5].map(n => { const a = weekStart(n), b = n === 5 ? '9999' : weekStart(n + 1); return [issues.filter(i => i.foundAt >= a && i.foundAt < b).length, issues.filter(i => i.dates.closedAt && i.dates.closedAt >= a && i.dates.closedAt < b).length]; });
    const w = 360, h = 150, base = 124, max = Math.max(1, ...weeks.flat()), bw = 18;
    return `<svg class="qa-svg" viewBox="0 0 ${w} ${h}" role="img"><line x1="10" x2="${w}" y1="${base}" y2="${base}" class="qa-axis"/>${weeks.map(([n, c], i) => { const x = 22 + i * 56; const hn = n / max * 100, hc = c / max * 100; return `<rect x="${x}" y="${base - hn}" width="${bw}" height="${hn}" rx="2" fill="#e2445c"><title>${tr('新增', 'New')} ${n}</title></rect><rect x="${x + bw + 3}" y="${base - hc}" width="${bw}" height="${hc}" rx="2" fill="#00c875"><title>${tr('关闭', 'Closed')} ${c}</title></rect><text x="${x + bw}" y="${base + 16}" text-anchor="middle" class="qa-ax">${i === 5 ? tr('本周', 'This wk') : tr(`${5 - i}周前`, `${5 - i}w ago`)}</text>`; }).join('')}</svg><ul class="qa-legend"><li><i style="background:#e2445c"></i>${tr('新增问题', 'New issues')}</li><li><i style="background:#00c875"></i>${tr('关闭问题', 'Closed issues')}</li></ul>`;
  }
  function tree(issues) {
    const total = issues.reduce((n, i) => n + i.affected, 0) || 1;
    return `<div class="qa-tree">${Object.entries(data.categories).map(([k, c]) => { const xs = issues.filter(i => i.category === k); if (!xs.length) return ''; const reps = xs.reduce((n, i) => n + i.affected, 0), open = xs.filter(i => i.status !== 'closed').length, color = COLORS[k] || '#579bfc';
      return `<details ${ui.cat === k || reps / total > .15 ? 'open' : ''}><summary style="--c:${color}"><b class="qa-code" style="--c:${color}">${k}</b><span>${esc(tr(c.zh, c.en))}</span><i style="width:${reps / total * 100}%;background:${color}"></i><em>${reps} · ${open} ${tr('未关闭', 'open')}</em></summary>
        <ul>${Object.entries(c.defects).map(([n, d]) => { const ys = xs.filter(i => i.defect === n); if (!ys.length) return ''; const r2 = ys.reduce((m, i) => m + i.affected, 0);
          return `<li><span class="qa-code light" style="--c:${color}">${k}-${n}</span><span class="qa-tn">${esc(tr(d[0], d[1]))}</span><span class="qa-tbar"><i style="width:${r2 / reps * 100}%;background:${color}"></i></span><b>${r2}</b>${ys.map(i => `<button class="qa-mini" data-qa="open" data-id="${esc(i.id)}" style="--c:${FLOW[i.status][2]}" title="${esc(i.title)}">${esc(i.number)}</button>`).join('')}</li>`; }).join('')}</ul></details>`; }).join('')}</div>`;
  }
  function progress(issues) {
    const stages = ['new', 'sent', 'plan_review', 'doing', 'verify', 'closed'], count = k => issues.filter(i => i.status === k).length, max = Math.max(1, ...stages.map(count));
    const avg = xs => xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null;
    const replied = issues.filter(i => i.dates.planAt), implemented = issues.filter(i => i.dates.implementedAt);
    const onTime = implemented.filter(i => i.dates.implDue && i.dates.implementedAt <= i.dates.implDue);
    const byFactory = data.factories.map(f => { const xs = issues.filter(i => i.factory === f.id); return [tr(f.zh, f.en), xs.filter(i => i.status !== 'closed').length, xs.filter(i => i.overdue).length,
      avg(xs.filter(i => i.dates.planAt).map(i => i.durations.factoryReply)), avg(xs.filter(i => i.dates.implementedAt).map(i => i.durations.implementation))]; });
    return `<div class="qa-funnel">${stages.map(k => `<div><span>${esc(tr(FLOW[k][0], FLOW[k][1]))}</span><i style="width:${count(k) / max * 100}%;background:${FLOW[k][2]}"></i><b>${count(k)}</b></div>`).join('')}</div>
      <div class="qa-times"><div><strong>${avg(replied.map(i => i.durations.factoryReply)) ?? '—'}</strong><span>${tr('天：提交工厂 → 工厂出方案', 'days: sent → factory plan')}</span></div><div><strong>${avg(implemented.map(i => i.durations.implementation)) ?? '—'}</strong><span>${tr('天：批准 → 工厂落实', 'days: approval → implemented')}</span></div><div><strong>${avg(issues.filter(i => i.dates.verifiedAt).map(i => i.durations.verification)) ?? '—'}</strong><span>${tr('天：落实 → 验证关闭', 'days: implemented → verified')}</span></div><div><strong>${implemented.length ? Math.round(onTime.length / implemented.length * 100) + '%' : '—'}</strong><span>${tr('按承诺日期落实的比例', 'implemented by committed date')}</span></div></div>
      <table class="qa-table small" data-help-table="qa-factory"><thead><tr><th>${tr('工厂', 'Factory')}</th><th class="num">${tr('未关闭', 'Open')}</th><th class="num">${tr('逾期', 'Overdue')}</th><th class="num">${tr('平均出方案天数', 'Avg days to plan')}</th><th class="num">${tr('平均落实天数', 'Avg days to implement')}</th></tr></thead><tbody>${byFactory.map(r => `<tr><td>${esc(r[0])}</td><td class="num">${r[1]}</td><td class="num ${r[2] ? 'qa-bad' : ''}">${r[2]}</td><td class="num">${r[3] ?? '—'}</td><td class="num">${r[4] ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  }
  function pareto(issues) {
    const rows = [...issues].sort((a, b) => b.affected - a.affected).slice(0, 6), total = issues.reduce((n, i) => n + i.affected, 0) || 1;
    let cum = 0;
    return `<ol class="qa-pareto">${rows.map(i => { cum += i.affected; return `<li data-qa="open" data-id="${esc(i.id)}"><span class="qa-code" style="--c:${COLORS[i.category] || '#579bfc'}">${esc(i.code)}</span><span class="qa-pt">${esc(i.title)}</span><b>${i.affected}</b><em>${Math.round(cum / total * 100)}%</em></li>`; }).join('')}</ol><p class="qa-hint">${tr('右侧百分比是累计占比：前几个问题通常占了大部分影响，优先解决它们。', 'The right column is cumulative share: the top few issues usually account for most of the impact.')}</p>`;
  }

  /* ---------- new issue ---------- */
  const codeOptions = (sel = '') => Object.entries(data.categories).flatMap(([k, c]) => Object.entries(c.defects).map(([n, d]) => `<option value="${k}-${n}" ${sel === `${k}-${n}` ? 'selected' : ''}>${k}-${n} · ${esc(tr(c.zh, c.en))} / ${esc(tr(d[0], d[1]))}</option>`)).join('');
  function newDialog() {
    ctx.modal(tr('新建品质问题', 'New quality issue'), `<form id="qa-new" class="qa-form">
      <label class="qa-field"><span>${tr('问题标题', 'Title')}</span><input name="title" required minlength="4" maxlength="300" placeholder="${tr('例如：Hydra 13 Pro 开机 20 分钟后电源板过热断电', 'e.g. Hydra 13 Pro power board over-heats after 20 min')}"></label>
      <label class="qa-field"><span>${tr('缺陷分类', 'Defect code')}</span><select name="code" required>${codeOptions()}</select></label>
      <div class="qa-row"><label class="qa-field"><span>${tr('型号', 'Model')}</span><input name="model" required maxlength="120"></label><label class="qa-field"><span>SKU</span><input name="sku" maxlength="80"></label></div>
      <div class="qa-row"><label class="qa-field"><span>${tr('批次 / 序列号范围', 'Batch / serial range')}</span><input name="batch" maxlength="200"></label><label class="qa-field"><span>${tr('影响数量', 'Affected')}</span><input name="affected" type="number" min="1" value="1" required></label></div>
      <div class="qa-row"><label class="qa-field"><span>${tr('严重度', 'Severity')}</span><select name="severity">${Object.keys(SEV).map(k => `<option value="${k}" ${k === 'S2' ? 'selected' : ''}>${esc(tr(SEV[k][0], SEV[k][1]))}</option>`).join('')}</select></label><label class="qa-field"><span>${tr('责任工厂', 'Factory')}</span><select name="factory">${data.factories.map(f => `<option value="${f.id}">${esc(tr(f.zh, f.en))}</option>`).join('')}</select></label><label class="qa-field"><span>${tr('发现日期', 'Found on')}</span><input name="foundAt" type="date" required max="${today()}" value="${today()}"></label></div>
      <label class="qa-field"><span>${tr('问题描述（现象、复现条件、已做的排查）', 'Description (symptom, conditions, checks done)')}</span><textarea name="description" rows="4" maxlength="5000"></textarea></label>
      <p class="wms-error" role="alert"></p>
      <button class="btn primary">${icon('check')} ${tr('建立问题', 'Create issue')}</button></form>`);
  }

  /* ---------- issue detail ---------- */
  async function openIssue(id) {
    try { detail = await ctx.api.get('/quality/' + encodeURIComponent(id)); }
    catch (e) { ctx.toast?.(e.message || tr('读取失败', 'Could not load')); return; }
    drawDetail();
  }
  async function refresh() { if (detail) { detail = await ctx.api.get('/quality/' + encodeURIComponent(detail.id)); drawDetail(); } data = null; load(); }
  function drawDetail() { ctx.closeOverlay?.(); ctx.overlay(detailHtml(detail), true); }
  function detailHtml(i) {
    const c = i.can, d = i.dates, order = ['new', 'sent', 'plan_review', 'doing', 'verify', 'closed'], step = order.indexOf(i.status);
    const dateOf = { new:i.foundAt, sent:d.sentAt, plan_review:d.planAt, doing:d.approvedAt, verify:d.implementedAt, closed:d.closedAt };
    const latest = i.plans[0], err = '<p class="wms-error" role="alert"></p>';
    const dur = (n, label) => `<div><strong>${n ?? '—'}</strong><span>${label}</span></div>`;
    return `<div class="qa-detail">
      <div class="qa-d-head"><span class="qa-id">${esc(i.number)}</span>${pill(SEV, i.severity)}<span class="qa-code" style="--c:${COLORS[i.category] || '#579bfc'}">${esc(codeLabel(i))}</span><button class="qa-x" data-live-action="close" aria-label="${tr('关闭', 'Close')}">${icon('x')}</button></div>
      <h2>${esc(i.title)}</h2>
      <p class="qa-sub">${esc(i.model)}${i.sku ? ' · ' + esc(i.sku) : ''}${i.batch ? ' · ' + esc(i.batch) : ''} · ${esc(factoryName(i.factory))} · ${tr(`影响 ${i.affected}`, `${i.affected} affected`)}${i.ownerName ? ` · ${tr('负责人', 'Owner')} ${esc(i.ownerName)}` : ''}</p>
      <ol class="qa-steps">${order.map((k, n) => `<li class="${n < step || i.status === 'closed' ? 'done' : n === step ? 'on' : ''}"><i></i>${esc(tr(FLOW[k][0], FLOW[k][1]))}<small>${fmt(dateOf[k])}</small></li>`).join('')}</ol>
      ${i.resolution === 'cancelled' ? `<p class="qa-hint">${tr('此问题已不整改关闭，原因见处理记录。', 'Closed without a fix; see the history for the reason.')}</p>` : ''}
      <section><h3>${icon('calendar-check')} ${tr('关键日期与耗时', 'Key dates and time taken')}</h3>
        <dl class="qa-plan"><dt>${tr('发现', 'Found')}</dt><dd>${fmt(i.foundAt)}</dd><dt>${tr('提交工厂', 'Sent to factory')}</dt><dd>${fmt(d.sentAt)}</dd><dt>${tr('方案期限', 'Plan due')}</dt><dd class="${i.overdue === 'plan' ? 'qa-bad' : ''}">${fmt(d.planDue)}${i.overdue === 'plan' ? ` · ${tr('已逾期', 'overdue')} ${days(d.planDue, today())}${tr('天', 'd')}` : ''}</dd><dt>${tr('工厂回复方案', 'Factory plan')}</dt><dd>${fmt(d.planAt)}</dd><dt>${tr('批准方案', 'Plan approved')}</dt><dd>${fmt(d.approvedAt)}</dd><dt>${tr('承诺落实', 'Committed implementation')}</dt><dd class="${i.overdue === 'implementation' ? 'qa-bad' : ''}">${fmt(d.implDue)}${i.overdue === 'implementation' ? ` · ${tr('已逾期', 'overdue')} ${days(d.implDue, today())}${tr('天', 'd')}` : ''}</dd><dt>${tr('实际落实', 'Implemented')}</dt><dd>${fmt(d.implementedAt)}${i.effectiveBatch ? ` · ${tr('生效批次', 'from')} ${esc(i.effectiveBatch)}` : ''}</dd><dt>${tr('验证关闭', 'Verified')}</dt><dd>${fmt(d.verifiedAt)}</dd></dl>
        <div class="qa-times">${dur(i.durations.factoryReply, tr('天：工厂出方案', 'days: factory reply'))}${dur(i.durations.implementation, tr('天：工厂落实', 'days: implementation'))}${dur(i.durations.verification, tr('天：验证', 'days: verification'))}${dur(i.durations.total, tr('天：总计', 'days: total'))}</div></section>
      ${i.description ? `<section><h3>${icon('note')} ${tr('问题描述', 'Description')}</h3><p class="qa-pre">${esc(i.description)}</p></section>` : ''}
      ${c.send ? `<section><h3>${icon('paper-plane-tilt')} ${tr('提交给工厂', 'Send to factory')}</h3><form class="qa-form" id="qa-send"><div class="qa-row"><label class="qa-field"><span>${tr('提交日期', 'Sent on')}</span><input type="date" name="sentAt" required max="${today()}" value="${today()}"></label><label class="qa-field"><span>${tr('工厂回复方案期限', 'Factory plan due')}</span><input type="date" name="planDue"></label></div><label class="qa-field"><span>${tr('给工厂的说明（可选）', 'Note to the factory (optional)')}</span><textarea name="note" rows="2"></textarea></label>${err}<button class="btn primary">${icon('paper-plane-tilt')} ${tr('提交给', 'Send to')} ${esc(factoryName(i.factory))}</button><p class="qa-hint">${tr('期限不填默认 7 天。提交后工厂人员就能看到这个问题。', 'Leave the due date empty for 7 days. The factory sees the issue once it is sent.')}</p></form></section>` : ''}
      <section><h3>${icon('factory')} ${tr('工厂方案', 'Factory plan')}</h3>
        ${i.plans.map(p => `<dl class="qa-plan ${p === latest ? '' : 'qa-old'}"><dt>${tr('版本', 'Version')}</dt><dd>v${p.version} · ${esc(p.authorName)} · ${fmt(String(p.createdAt).slice(0, 10))}</dd><dt>${tr('根本原因', 'Root cause')}</dt><dd>${esc(p.rootCause)}</dd><dt>${tr('纠正措施', 'Corrective action')}</dt><dd>${esc(p.corrective)}</dd><dt>${tr('预防措施', 'Preventive action')}</dt><dd>${esc(p.preventive)}</dd><dt>${tr('承诺落实', 'Committed date')}</dt><dd>${fmt(p.implDue)}</dd>${p.decision ? `<dt>${p.decision === 'approve' ? tr('批准', 'Approved') : tr('退回意见', 'Sent back')}</dt><dd class="${p.decision === 'return' ? 'qa-bad' : ''}">${esc(p.decidedByName)} · ${fmt(String(p.decidedAt).slice(0, 10))}${p.decisionNote ? ' · ' + esc(p.decisionNote) : ''}</dd>` : ''}</dl>`).join('') || `<p class="qa-hint">${i.status === 'new' ? tr('还没有提交给工厂。', 'Not sent to the factory yet.') : tr('等待工厂填写方案。', 'Waiting for the factory plan.')}</p>`}
        ${c.plan ? `<form class="qa-form" id="qa-plan">${[['rootCause', tr('根本原因', 'Root cause')], ['corrective', tr('纠正措施（已出货的怎么处理）', 'Corrective action (units already shipped)')], ['preventive', tr('预防措施（以后怎么避免）', 'Preventive action (stop it recurring)')]].map(([k, l]) => `<label class="qa-field"><span>${l}</span><textarea name="${k}" rows="2" required minlength="5">${latest ? esc(latest[k]) : ''}</textarea></label>`).join('')}<label class="qa-field"><span>${tr('承诺落实日期', 'Committed implementation date')}</span><input type="date" name="implDue" required min="${today()}" value="${latest?.implDue || ''}"></label>${err}<button class="btn primary">${icon('paper-plane-tilt')} ${tr('提交方案等待批准', 'Submit plan for approval')}</button></form>` : ''}
        ${c.decide ? `<form class="qa-form" id="qa-decide"><label class="qa-field"><span>${tr('审批意见（退回时必填）', 'Comment (required to send back)')}</span><textarea name="note" rows="2"></textarea></label>${err}<div class="qa-actions"><button class="btn primary" name="decision" value="approve">${icon('check')} ${tr('批准方案', 'Approve plan')}</button><button class="btn" name="decision" value="return">${icon('arrow-u-up-left')} ${tr('退回修改', 'Send back')}</button></div></form>` : ''}
        ${c.implement ? `<form class="qa-form" id="qa-implemented"><div class="qa-row"><label class="qa-field"><span>${tr('实际落实日期', 'Implemented on')}</span><input type="date" name="implementedAt" required max="${today()}" value="${today()}"></label><label class="qa-field"><span>${tr('从哪个批次 / 序列号起生效', 'Effective from batch / serial')}</span><input name="effectiveBatch" required maxlength="200"></label></div><label class="qa-field"><span>${tr('说明（可选）', 'Note (optional)')}</span><textarea name="note" rows="2"></textarea></label>${err}<button class="btn primary">${icon('flag-checkered')} ${tr('已落实，申请验证', 'Implemented — request verification')}</button></form>` : ''}
        ${c.verify ? `<form class="qa-form" id="qa-verify"><label class="qa-field"><span>${tr('验证日期', 'Verified on')}</span><input type="date" name="verifiedAt" required max="${today()}" value="${today()}"></label><label class="qa-field"><span>${tr('验证结果说明（必填）', 'Verification evidence (required)')}</span><textarea name="note" rows="2" required minlength="5" placeholder="${tr('例如：新批次 30 台出货 2 周无同类反馈', 'e.g. 30 units from the new batch, no reports for 2 weeks')}"></textarea></label>${err}<div class="qa-actions"><button class="btn primary" name="result" value="pass">${icon('seal-check')} ${tr('验证有效，关闭问题', 'Verified — close issue')}</button><button class="btn" name="result" value="fail">${icon('arrow-counter-clockwise')} ${tr('仍有问题，退回执行', 'Still failing — back to factory')}</button></div><p class="qa-hint">${tr('建议落实后观察 2 周，确认新批次没有同类反馈再关闭。', 'Watch the new batch for about 2 weeks before closing.')}</p></form>` : ''}</section>
      <section><h3>${icon('link')} ${tr('关联证据', 'Evidence')} (${i.links.length})</h3>
        <ul class="qa-quotes">${i.links.map(l => `<li>${icon(LINK[l.kind]?.[2] || 'link')}<span><b>${esc(tr(...(LINK[l.kind] || LINK.other).slice(0, 2)))} ${/^https?:\/\//i.test(l.url || '') ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.ref)}</a>` : esc(l.ref)}</b>${esc(l.note)}</span></li>`).join('') || `<li><span class="qa-hint">${tr('还没有关联工单、退货或评价。', 'No tickets, returns or reviews linked yet.')}</span></li>`}</ul>
        ${c.link ? `<form class="qa-form qa-inline" id="qa-link"><select name="kind">${Object.entries(LINK).map(([k, v]) => `<option value="${k}">${esc(tr(v[0], v[1]))}</option>`).join('')}</select><input name="ref" required maxlength="200" placeholder="${tr('工单号 / RMA 号 / 帖子标题', 'Ticket / RMA no. / post title')}"><input name="url" type="url" maxlength="2000" placeholder="https://…"><input name="note" maxlength="2000" placeholder="${tr('摘要（可选）', 'Summary (optional)')}"><button class="btn">${icon('plus')} ${tr('添加', 'Add')}</button>${err}</form>` : ''}</section>
      ${c.edit ? `<section><h3>${icon('pencil-simple')} ${tr('修改信息', 'Edit details')}</h3><form class="qa-form" id="qa-edit">
        <label class="qa-field"><span>${tr('问题标题', 'Title')}</span><input name="title" required minlength="4" maxlength="300" value="${esc(i.title)}"></label>
        <label class="qa-field"><span>${tr('缺陷分类', 'Defect code')}</span><select name="code">${codeOptions(i.code)}</select></label>
        <div class="qa-row"><label class="qa-field"><span>${tr('型号', 'Model')}</span><input name="model" required value="${esc(i.model)}"></label><label class="qa-field"><span>${tr('批次 / 序列号范围', 'Batch / serial range')}</span><input name="batch" value="${esc(i.batch)}"></label><label class="qa-field"><span>${tr('影响数量', 'Affected')}</span><input name="affected" type="number" min="1" value="${i.affected}"></label></div>
        <div class="qa-row"><label class="qa-field"><span>${tr('严重度', 'Severity')}</span><select name="severity">${Object.keys(SEV).map(k => `<option value="${k}" ${i.severity === k ? 'selected' : ''}>${esc(tr(SEV[k][0], SEV[k][1]))}</option>`).join('')}</select></label>${i.status === 'new' ? `<label class="qa-field"><span>${tr('责任工厂', 'Factory')}</span><select name="factory">${data.factories.map(f => `<option value="${f.id}" ${i.factory === f.id ? 'selected' : ''}>${esc(tr(f.zh, f.en))}</option>`).join('')}</select></label>` : ''}${i.status === 'sent' ? `<label class="qa-field"><span>${tr('方案期限', 'Plan due')}</span><input type="date" name="planDue" value="${d.planDue || ''}"></label>` : ''}${i.status === 'doing' ? `<label class="qa-field"><span>${tr('承诺落实', 'Committed implementation')}</span><input type="date" name="implDue" value="${d.implDue || ''}"></label>` : ''}${data.leads.length ? `<label class="qa-field"><span>${tr('负责人', 'Owner')}</span><select name="ownerId">${data.leads.map(p => `<option value="${esc(p.id)}" ${i.ownerId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}</div>
        <label class="qa-field"><span>${tr('问题描述', 'Description')}</span><textarea name="description" rows="3">${esc(i.description)}</textarea></label>${err}
        <div class="qa-actions"><button class="btn">${icon('floppy-disk')} ${tr('保存修改', 'Save changes')}</button></div></form>
        <form class="qa-form qa-inline" id="qa-cancel"><input name="reason" required minlength="5" maxlength="2000" placeholder="${tr('不整改关闭的原因（重复、非缺陷、转 FAQ…）', 'Reason to close without a fix (duplicate, not a defect, FAQ…)')}"><button class="btn">${icon('prohibit')} ${tr('不整改关闭', 'Close without fix')}</button>${err}</form></section>` : ''}
      <section><h3>${icon('clock-counter-clockwise')} ${tr('处理记录', 'History')}</h3><ul class="qa-hist">${i.events.map(e => `<li><b>${fmt(String(e.at).slice(0, 10))}</b>${esc(tr(...(EVENT[e.action] || (e.action.startsWith('link:') ? ['添加证据', 'Evidence added'] : [e.action, e.action]))))} · ${esc(e.byName)}${e.note ? ` — ${esc(e.note)}` : ''}</li>`).join('')}</ul></section>
    </div>`;
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    if (!ctx || !data) return;
    const t = e.target.closest('[data-qa]'); if (!t) return;
    const a = t.dataset.qa;
    if (a === 'filter') { ui.filter = t.dataset.v; return ctx.rerender(); }
    if (a === 'chart-cat') { ui.cat = ui.cat === t.dataset.v ? '' : t.dataset.v; ui.model = ''; ui.filter = 'all'; return ctx.rerender(); }
    if (a === 'chart-model') { ui.model = ui.model === t.dataset.v ? '' : t.dataset.v; ui.cat = ''; ui.filter = 'open'; return ctx.rerender(); }
    if (a === 'clear') { ui.cat = ''; ui.model = ''; return ctx.rerender(); }
    if (a === 'new') return newDialog();
    if (a === 'open' && t.dataset.id) return openIssue(t.dataset.id);
  });
  document.addEventListener('keydown', e => { if (ctx && e.key === 'Enter' && e.target.matches?.('tr[data-qa="open"]')) openIssue(e.target.dataset.id); });
  const FORMS = ['qa-new', 'qa-send', 'qa-plan', 'qa-decide', 'qa-implemented', 'qa-verify', 'qa-link', 'qa-edit', 'qa-cancel'];
  const opt = v => String(v ?? '').trim() || undefined;
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || !FORMS.includes(f.id)) return;
    e.preventDefault(); if (busy) return; busy = true;
    const err = f.querySelector('.wms-error'); if (err) err.textContent = '';
    const v = Object.fromEntries(new FormData(f)), path = s => `/quality/${encodeURIComponent(detail?.id)}/${s}`, choice = e.submitter?.value;
    try {
      if (f.id === 'qa-new') {
        const [category, defect] = String(v.code).split('-');
        const r = await ctx.api.post('/quality', { title:String(v.title).trim(), category, defect, model:String(v.model).trim(), sku:opt(v.sku), batch:opt(v.batch), affected:Number(v.affected) || 1, severity:v.severity, factory:v.factory, foundAt:v.foundAt, description:opt(v.description) });
        ctx.toast?.(tr(`已建立 ${r.number}`, `Created ${r.number}`)); busy = false; data = null; load(); return openIssue(r.id);
      }
      if (f.id === 'qa-send') { await ctx.api.post(path('send'), { sentAt:v.sentAt, planDue:opt(v.planDue), note:opt(v.note) }); ctx.toast?.(tr('已提交给工厂', 'Sent to the factory')); }
      if (f.id === 'qa-plan') { await ctx.api.post(path('plan'), { rootCause:String(v.rootCause).trim(), corrective:String(v.corrective).trim(), preventive:String(v.preventive).trim(), implDue:v.implDue }); ctx.toast?.(tr('方案已提交，等待 OneLaser 批准', 'Plan submitted for approval')); }
      if (f.id === 'qa-decide') { const decision = choice === 'return' ? 'return' : 'approve'; await ctx.api.post(path('decision'), { decision, note:String(v.note || '').trim() }); ctx.toast?.(decision === 'approve' ? tr('已批准，工厂开始落实', 'Approved — factory implements') : tr('已退回工厂', 'Sent back to the factory')); }
      if (f.id === 'qa-implemented') { await ctx.api.post(path('implemented'), { implementedAt:v.implementedAt, effectiveBatch:String(v.effectiveBatch).trim(), note:opt(v.note) }); ctx.toast?.(tr('已提交验证', 'Verification requested')); }
      if (f.id === 'qa-verify') { const result = choice === 'fail' ? 'fail' : 'pass'; await ctx.api.post(path('verify'), { result, verifiedAt:v.verifiedAt, note:String(v.note).trim() }); ctx.toast?.(result === 'pass' ? tr('问题已关闭', 'Issue closed') : tr('已退回工厂继续落实', 'Back to the factory')); }
      if (f.id === 'qa-link') { await ctx.api.post(path('links'), { kind:v.kind, ref:String(v.ref).trim(), url:opt(v.url), note:opt(v.note) }); ctx.toast?.(tr('已添加证据', 'Evidence added')); }
      if (f.id === 'qa-cancel') { await ctx.api.post(path('cancel'), { reason:String(v.reason).trim() }); ctx.toast?.(tr('已关闭', 'Closed')); }
      if (f.id === 'qa-edit') {
        const [category, defect] = String(v.code).split('-'), i = detail, body = {};
        const put = (k, val, cur) => { if (val !== undefined && val !== '' && String(val) !== String(cur ?? '')) body[k] = val; };
        put('title', String(v.title).trim(), i.title); put('category', category, i.category); put('defect', defect, i.defect); put('model', String(v.model).trim(), i.model);
        if (String(v.batch ?? '').trim() !== i.batch) body.batch = String(v.batch ?? '').trim();
        if (String(v.description ?? '').trim() !== i.description) body.description = String(v.description ?? '').trim();
        put('affected', Number(v.affected), i.affected); put('severity', v.severity, i.severity); put('factory', v.factory, i.factory); put('ownerId', v.ownerId, i.ownerId);
        put('planDue', v.planDue, i.dates.planDue); put('implDue', v.implDue, i.dates.implDue);
        if (!Object.keys(body).length) { ctx.toast?.(tr('没有修改', 'No changes')); return; }
        await ctx.api.post(path('update'), body); ctx.toast?.(tr('已保存', 'Saved'));
      }
      busy = false; await refresh();
    } catch (x) { const box = document.getElementById(f.id)?.querySelector('.wms-error'); if (box) box.textContent = x.message || tr('操作失败', 'Failed'); else ctx.toast?.(x.message || tr('操作失败', 'Failed')); }
    finally { busy = false; }
  });
  document.addEventListener('change', e => {
    if (!ctx || !e.target.matches('[data-qa-sel]')) return;
    ui[e.target.dataset.qaSel] = e.target.value; ctx.rerender();
  });
  document.addEventListener('input', e => {
    if (!ctx || !e.target.matches('[data-qa-q]')) return;
    ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender();
    requestAnimationFrame(() => { const n = document.querySelector('[data-qa-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
  });

  /* ---------- AI insight facts (from real issues) ---------- */
  function facts() {
    const issues = data?.items || [], open = issues.filter(i => i.status !== 'closed');
    const byCat = Object.keys(data?.categories || {}).map(k => [tr(data.categories[k].zh, data.categories[k].en), open.filter(i => i.category === k).reduce((n, i) => n + i.affected, 0)]).sort((a, b) => b[1] - a[1]);
    return { open:open.length, s1:open.filter(i => i.severity === 'S1').map(i => i.title), topCategory:byCat[0] || null, topIssues:[...open].sort((a, b) => b.affected - a.affected).slice(0, 2).map(i => `${i.title} (${i.affected})`),
      awaitingPlan:issues.filter(i => i.status === 'sent').length, awaitingApproval:issues.filter(i => i.status === 'plan_review').map(i => i.number), overdue:issues.filter(i => i.overdue).map(i => `${i.number} ${i.title}`) };
  }
  function rules(f) {
    const out = [];
    if (!f.open) return [tr('目前没有未关闭的品质问题。', 'No open quality issues right now.')];
    if (f.s1.length) out.push(tr(`有 ${f.s1.length} 个 S1 严重问题未关闭（${f.s1.join('；')}），涉及安全或停机，应优先处理并主动联系受影响客户。`, `${f.s1.length} S1 issue(s) open (${f.s1.join('; ')}) — safety or downtime; prioritize and contact affected customers.`));
    if (f.topCategory?.[1]) out.push(tr(`影响最大的分类是“${f.topCategory[0]}”（${f.topCategory[1]}），最集中的问题：${f.topIssues.join('；')}。`, `Biggest impact is in “${f.topCategory[0]}” (${f.topCategory[1]}); top issues: ${f.topIssues.join('; ')}.`));
    if (f.awaitingApproval.length || f.overdue.length) out.push(tr(`${f.awaitingApproval.length ? `${f.awaitingApproval.length} 个方案等待批准` : ''}${f.awaitingApproval.length && f.overdue.length ? '，' : ''}${f.overdue.length ? `${f.overdue.length} 个已逾期（${f.overdue.join('；')}）` : ''}。`, `${f.awaitingApproval.length ? `${f.awaitingApproval.length} plan(s) await approval` : ''}${f.awaitingApproval.length && f.overdue.length ? '; ' : ''}${f.overdue.length ? `${f.overdue.length} overdue (${f.overdue.join('; ')})` : ''}.`));
    if (f.awaitingPlan) out.push(tr(`${f.awaitingPlan} 个问题在等工厂出方案。`, `${f.awaitingPlan} issue(s) are waiting for a factory plan.`));
    return out.slice(0, 4);
  }
  const reg = () => window.WorkOSInsights?.register?.('quality', facts, rules);
  if (window.WorkOSInsights) reg(); else window.addEventListener('DOMContentLoaded', reg);

  window.WorkOSQuality = { configure, reset, render, _ui:ui, _detailHtml:i => detailHtml(i) };
})();
