/*
 * 公司制度 (Policies) — employee handbook, company policies (service and internal), SOPs and company culture.
 * Server: onelaser-workos-api src/policies.ts.
 *
 * One page per category (left nav “公司制度”). The list shows what applies to me; a document opens in the reader on the
 * right: version, effective date, who it applies to, which language is official, contents, attachments, version history
 * and the sign-off box (“I have read and agree”). Anything I still have to sign is listed at the top of every page.
 * Editors (policies_manage) write drafts and send them for approval; main admins publish, send back, archive and choose
 * the editors (权限). Editors see who signed and remind the rest.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '', detail = null, detailLoading = '', acks = null, access = null, history = null;
  const ui = { cat:'handbook', q:'', sel:null, docLang:null, mine:false };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const CATS = { handbook:['员工手册', 'Employee handbook', 'book-open-text'], policy:['公司政策', 'Company policies', 'scales'], sop:['SOP', 'SOPs', 'list-checks'], culture:['企业文化', 'Company culture', 'heart'] };
  const CAT_HINT = {
    handbook:['考勤、休假、行为准则、离职。中国、美国分开，需要签收。', 'Hours, leave, conduct and leaving. Separate China and US versions; everyone signs.'],
    policy:['服务政策（退货、保修、运费）和内部政策（报销、信息安全）。', 'Service policies (returns, warranty, shipping) and internal policies (expenses, security).'],
    sop:['仓库、发货、维修、客服的标准作业流程。按部门适用。', 'Standard operating procedures for warehouse, shipping, repair and support, by department.'],
    culture:['使命、愿景、价值观和行为准则。', 'Mission, vision, values and code of conduct.'],
  };
  const REGION = { '':['全公司', 'Whole company'], us:['美国', 'US'], cn:['中国', 'China'], intl:['海外其他', 'Other countries'] };
  const STATE = { draft:['草稿', 'Draft', 'gray'], pending:['待发布', 'Waiting to publish', 'amber'], rejected:['被退回', 'Sent back', 'red'], published:['已发布', 'Published', 'green'], superseded:['旧版本', 'Earlier version', 'gray'] };
  const FILE_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv', 'video/mp4', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'];
  const w = pair => pair ? tr(pair[0], pair[1]) : '';
  const titleOf = d => (lang() === 'en' ? d.titleEn || d.titleZh : d.titleZh || d.titleEn) || tr('（未命名）', '(untitled)');
  const fmtDate = iso => iso ? String(iso).slice(0, 10) : '';
  const fmtTime = iso => iso ? new Date(iso).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  const badge = (text, tone) => `<span class="pol-badge ${tone || ''}">${esc(text)}</span>`;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  const editor = () => data && data.level !== 'read';
  const isAdmin = () => data?.level === 'admin';
  const scopeText = d => { const deps = (d.departmentIds || []).map(id => data?.departments.find(x => x.id === id)?.name || id); return [w(REGION[d.region || '']), deps.length ? deps.join('、') : ''].filter(Boolean).join(' · '); };

  /* ---------- Markdown (headings, lists, tables, quotes, bold, code) ---------- */
  const slug = (t, i) => 'pol-h-' + i;
  function inline(t) { return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>'); }
  function table(lines) {
    const rows = lines.filter(l => !/^\s*\|?\s*:?-{2,}/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    const [head, ...body] = rows;
    return `<div class="pol-table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function markdown(text) {
    const out = [], toc = [], lines = String(text || '').split('\n'); let h = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]; let m;
      if (!l.trim()) continue;
      if (/^```/.test(l)) { const code = []; i++; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { const lvl = Math.min(6, m[1].length + 1), id = slug(m[2], h++); if (m[1].length <= 2) toc.push([id, m[2], m[1].length]); out.push(`<h${lvl} id="${id}">${inline(m[2])}</h${lvl}>`); continue; }
      if (/^\s*\|.*\|\s*$/.test(l)) { const t = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) t.push(lines[i++]); i--; out.push(table(t)); continue; }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '')); i--;
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(x => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
      }
      if (/^\s*>/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^\s*>\s?/, ''))}</blockquote>`); continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); continue; }
      out.push(`<p>${inline(l)}</p>`);
    }
    return { html:out.join(''), toc };
  }

  /* ---------- data ---------- */
  function configure(next) { ctx = next; }
  function reset() { data = null; loading = false; error = ''; detail = null; acks = null; access = null; history = null; ui.sel = null; ui.q = ''; ui.mine = false; }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/policies' + (ui.q.trim() ? '?q=' + encodeURIComponent(ui.q.trim()) : '')); error = ''; }
    catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }
  async function openDoc(id) {
    ui.sel = id; history = null; detailLoading = id; ctx.rerender();
    try { detail = await ctx.api.get(`/policies/${id}`); ui.docLang = null; } catch (e) { detail = { error:e.message }; }
    finally { detailLoading = ''; ctx.rerender(); document.querySelector('.pol-reader')?.scrollTo?.(0, 0); }
  }
  const refresh = async () => { data = null; await load(); if (ui.sel) await openDoc(ui.sel); };

  /* ---------- page ---------- */
  function render(cat) {
    if (cat && CATS[cat] && cat !== ui.cat) { ui.cat = cat; ui.sel = null; detail = null; }
    if (!data && !error) { load(); return `<div class="pol"><p class="pol-hint">${tr('正在读取…', 'Loading…')}</p></div>`; }
    if (error && !data) return `<div class="pol"><div class="pol-alert">${esc(error)}</div></div>`;
    const docs = data.docs.filter(d => d.category === ui.cat && (!ui.mine || d.myAck === 'todo') && (editor() ? true : d.status === 'published'));
    if (!ui.sel && docs.length && window.innerWidth > 900) { const first = docs.find(d => d.myAck === 'todo') || docs[0]; setTimeout(() => openDoc(first.id)); ui.sel = first.id; }
    const head = `<div class="page-heading"><div><div class="eyebrow">WORK OS · ${tr('公司制度', 'POLICIES')}</div><h1>${esc(w(CATS[ui.cat]))}</h1><p>${esc(w(CAT_HINT[ui.cat]))}</p></div>
      <div class="heading-actions">${isAdmin() ? `<button class="btn" data-pol="access">${icon('shield')} ${tr('权限', 'Access')}</button>` : ''}${editor() ? `<button class="btn primary" data-pol="new">${icon('plus')} ${tr('新建', 'New')}</button>` : ''}</div></div>`;
    setTimeout(afterPaint);
    const closed = data.open === false ? `<div class="pol-todo-row muted">${icon('lock-simple')}<b>${tr('目前只有你和编辑人能看到“公司制度”，员工看不到。', 'Only you and the editors can see Policies for now; employees cannot.')}</b>${isAdmin() ? `<button class="pol-chip" data-pol="access">${tr('去开放给全员', 'Open to everyone')}</button>` : ''}</div>` : '';
    return `<div class="pol">${head}${closed}${todoBar()}
      <div class="pol-split ${ui.sel ? 'has-sel' : ''}">
        <aside class="pol-list">
          <div class="pol-tools"><label class="pol-search">${icon('magnifying-glass')}<input type="search" data-pol-q value="${esc(ui.q)}" placeholder="${tr('搜索标题和正文', 'Search titles and text')}"></label>
            <label class="pol-check"><input type="checkbox" data-pol-mine ${ui.mine ? 'checked' : ''}> ${tr('只看待签收', 'To sign only')}</label></div>
          ${docs.length ? docs.map(card).join('') : `<div class="pol-empty">${icon(CATS[ui.cat][2])}<p>${ui.q ? tr('没有找到相关内容。', 'Nothing matches.') : editor() ? tr('还没有文件，点右上角“新建”。', 'No documents yet. Click “New”.') : tr('暂时没有适用于你的文件。', 'Nothing here applies to you yet.')}</p></div>`}
        </aside>
        <section class="pol-reader">${reader()}</section>
      </div></div>`;
  }
  function todoBar() {
    const todo = data.docs.filter(d => d.myAck === 'todo'), pending = data.docs.filter(d => d.draft?.state === 'pending' && d.canPublish), due = editor() ? data.docs.filter(d => d.reviewDue) : [];
    if (!todo.length && !pending.length && !due.length) return '';
    const link = d => `<button class="pol-chip" data-pol="go" data-id="${esc(d.id)}" data-cat="${esc(d.category)}">${esc(titleOf(d))}</button>`;
    return `<div class="pol-todo">
      ${todo.length ? `<div class="pol-todo-row warn">${icon('signature')}<b>${tr(`你有 ${todo.length} 份文件待签收`, `${todo.length} to read and sign`)}</b>${todo.map(link).join('')}</div>` : ''}
      ${pending.length ? `<div class="pol-todo-row">${icon('hourglass-medium')}<b>${tr(`${pending.length} 份待你发布`, `${pending.length} waiting for you to publish`)}</b>${pending.map(link).join('')}</div>` : ''}
      ${due.length ? `<div class="pol-todo-row muted">${icon('calendar-check')}<b>${tr(`${due.length} 份到了复核日期`, `${due.length} due for review`)}</b>${due.map(link).join('')}</div>` : ''}</div>`;
  }
  function card(d) {
    const tags = [];
    if (d.myAck === 'todo') tags.push(badge(tr('待签收', 'To sign'), 'red'));
    if (d.myAck === 'done') tags.push(badge(tr('已签收', 'Signed'), 'green'));
    if (d.status === 'draft') tags.push(badge(tr('未发布', 'Not published'), 'gray'));
    if (d.status === 'archived') tags.push(badge(tr('已停用', 'Archived'), 'gray'));
    if (d.draft && editor()) tags.push(badge(d.draft.state === 'pending' ? tr('有新版待发布', 'New version waiting') : d.draft.state === 'rejected' ? tr('新版被退回', 'New version sent back') : tr('有草稿', 'Draft in progress'), STATE[d.draft.state]?.[2]));
    if (d.public) tags.push(badge(tr('对外公开', 'Public'), 'blue'));
    if (d.reviewDue && editor()) tags.push(badge(tr('该复核了', 'Review due'), 'amber'));
    const sign = editor() && d.ackStats ? `<span class="pol-meter" title="${tr('签收进度', 'Signed')}"><i style="width:${d.ackStats.total ? Math.round(d.ackStats.done / d.ackStats.total * 100) : 0}%"></i></span><small>${d.ackStats.done}/${d.ackStats.total}</small>` : '';
    return `<button class="pol-card ${ui.sel === d.id ? 'on' : ''}" data-pol="open" data-id="${esc(d.id)}">
      <span class="pol-card-title">${esc(titleOf(d))}</span>
      <span class="pol-card-meta">${d.version ? `v${d.version} · ${tr('生效', 'Effective')} ${esc(fmtDate(d.effectiveDate))}` : tr('尚未发布', 'Not published yet')} · ${esc(scopeText(d))}</span>
      <span class="pol-card-tags">${tags.join('')}${sign}</span></button>`;
  }

  function reader() {
    if (!ui.sel) return `<div class="pol-empty">${icon('book-open')}<p>${tr('从左边选择一份文件。', 'Pick a document on the left.')}</p></div>`;
    if (detailLoading && (!detail || detail.id !== ui.sel)) return `<p class="pol-hint">${tr('正在打开…', 'Opening…')}</p>`;
    if (!detail) return '';
    if (detail.error) return `<div class="pol-alert">${esc(detail.error)}</div>`;
    const d = detail, v = history || d.current || d.draft;
    if (!v) return '';
    const showLang = ui.docLang || (lang() === 'en' ? (v.bodyEn ? 'en' : 'zh') : (v.bodyZh ? 'zh' : 'en'));
    const body = showLang === 'en' ? v.bodyEn : v.bodyZh, md = markdown(body || '');
    const official = v.officialLang === 'en' ? tr('以英文版为准', 'English is the official version') : tr('以中文版为准', 'Chinese is the official version');
    const viewingOld = history && history.id !== d.currentVersionId;
    const viewingDraft = !d.current && d.draft && !history;
    const actions = [];
    if (d.canEdit && d.status !== 'archived') actions.push(`<button class="btn" data-pol="edit">${icon('pencil-simple')} ${d.draft ? tr('继续编辑草稿', 'Edit draft') : tr('修改（新版本）', 'Edit (new version)')}</button>`);
    if (d.canEdit) actions.push(`<button class="btn" data-pol="settings">${icon('sliders-horizontal')} ${tr('设置', 'Settings')}</button>`);
    if (d.canEdit && d.requiresAck && d.current) actions.push(`<button class="btn" data-pol="acks">${icon('users-three')} ${tr('签收情况', 'Sign-off')}</button>`);
    if (d.canArchive) actions.push(`<button class="btn ghost" data-pol="archive">${d.status === 'archived' ? tr('恢复', 'Restore') : tr('停用', 'Archive')}</button>`);
    const draftBox = d.draft && d.canEdit ? `<div class="pol-draftbox ${STATE[d.draft.state]?.[2] || ''}">
        <div>${badge(w(STATE[d.draft.state]), STATE[d.draft.state]?.[2])} <b>${tr(`第 ${d.draft.no} 版`, `Version ${d.draft.no}`)}</b> · ${esc(d.draft.author)} · ${esc(fmtTime(d.draft.updatedAt))}
          ${d.draft.changeNote ? `<div class="pol-small">${tr('改了什么：', 'What changed: ')}${esc(d.draft.changeNote)}</div>` : ''}
          ${d.draft.state === 'rejected' && d.draft.rejectReason ? `<div class="pol-small red">${tr('退回原因：', 'Sent back: ')}${esc(d.draft.rejectReason)}</div>` : ''}</div>
        <div class="pol-draft-actions">
          ${!history || history.id !== d.draft.id ? `<button class="btn small" data-pol="view-version" data-v="${esc(d.draft.id)}">${tr('看草稿', 'View draft')}</button>` : ''}
          ${d.canPublish ? `<button class="btn small primary" data-pol="publish">${icon('paper-plane-tilt')} ${tr('发布', 'Publish')}</button>` : d.draft.state !== 'pending' ? `<button class="btn small primary" data-pol="submit">${tr('提交审批', 'Send for approval')}</button>` : `<span class="pol-small">${tr('等待主管理员发布', 'Waiting for a main admin to publish')}</span>`}
          ${d.canPublish && d.draft.state === 'pending' ? `<button class="btn small" data-pol="reject">${tr('退回', 'Send back')}</button>` : ''}</div></div>` : '';
    const signBox = !d.myAck || viewingOld || viewingDraft ? '' : d.myAck === 'done'
      ? `<div class="pol-sign done">${icon('seal-check')} ${tr(`你已于 ${fmtTime(d.myAckAt)} 签收本文件。`, `You signed this on ${fmtTime(d.myAckAt)}.`)}</div>`
      : `<div class="pol-sign" id="pol-sign"><h3>${icon('signature')} ${tr('阅读确认', 'Acknowledgement')}</h3>
          <label class="pol-check"><input type="checkbox" data-pol-agree> ${tr('我已阅读并理解本文件的全部内容，同意遵守。', 'I have read and understood this document and agree to follow it.')}</label>
          <button class="btn primary" data-pol="ack" disabled>${tr('签收', 'Sign')}</button>
          <p class="pol-small">${tr('签收记录会保存：你的姓名、版本和时间。', 'We keep a record of your name, the version and the time.')}</p></div>`;
    const files = d.files.length || d.canEdit ? `<section class="pol-files"><h3>${icon('paperclip')} ${tr('附件', 'Attachments')}</h3>
        ${d.files.length ? `<ul>${d.files.map(f => `<li><a href="/api/policies/${esc(d.id)}/files/${esc(f.id)}" target="_blank" rel="noopener">${icon('file')} ${esc(f.name)}</a><small>${Math.max(1, Math.round(f.size / 1024))} KB</small>${d.canEdit ? `<button class="pol-x" data-pol="file-del" data-f="${esc(f.id)}" title="${tr('删除', 'Delete')}">${icon('x')}</button>` : ''}</li>`).join('')}</ul>` : ''}
        ${d.canEdit && window.WorkOSUpload ? window.WorkOSUpload.html({ id:'pol-files', lang:lang(), accept:FILE_MIME, multiple:true, maxBytes:20 * 1024 * 1024, hint:tr('原始 PDF / Word、表格、培训视频', 'Original PDF / Word, forms, training videos') }) : ''}</section>` : '';
    const hist = d.history.length > 1 || (d.history.length && d.canEdit) ? `<details class="pol-history"><summary>${icon('clock-counter-clockwise')} ${tr(`版本记录（${d.history.length}）`, `Versions (${d.history.length})`)}</summary>
        <ol>${d.history.map(h => `<li class="${(history ? history.id : (d.current || d.draft)?.id) === h.id ? 'on' : ''}"><button class="pol-link" data-pol="view-version" data-v="${esc(h.id)}">v${h.no}</button>
          ${badge(w(STATE[h.state]), STATE[h.state]?.[2])} ${h.effectiveDate ? `${tr('生效', 'Effective')} ${esc(h.effectiveDate)}` : ''} · ${esc(h.changeNote || '—')}
          <small>${esc(h.author)}${h.decidedBy && h.state !== 'rejected' ? ` → ${tr('发布', 'published by')} ${esc(h.decidedBy)}` : ''}${h.reack && ['published', 'superseded'].includes(h.state) ? ` · ${tr('要求重新签收', 'asked to sign again')}` : ''}</small></li>`).join('')}</ol></details>` : '';
    return `<article class="pol-doc">
      <div class="pol-doc-head"><button class="btn ghost small pol-back" data-pol="back">${icon('arrow-left')} ${tr('返回列表', 'Back')}</button>
        <h2>${esc(titleOf(d))}</h2>
        <div class="pol-doc-meta">${badge(`v${v.no}`, '')} ${v.effectiveDate ? `<span>${tr('生效日期', 'Effective')} ${esc(v.effectiveDate)}</span>` : ''}<span>${tr('适用：', 'Applies to: ')}${esc(scopeText(d))}</span>
          ${d.owner ? `<span>${tr('负责人：', 'Owner: ')}${esc(d.owner)}</span>` : ''}${d.requiresAck ? badge(tr('需要签收', 'Sign-off required'), 'amber') : ''}${d.public ? badge(tr('对外公开', 'Public'), 'blue') : ''}
          ${d.nextReview && d.canEdit ? `<span class="${d.reviewDue ? 'red' : ''}">${tr('下次复核', 'Next review')} ${esc(d.nextReview)}</span>` : ''}</div>
        ${actions.length ? `<div class="pol-doc-actions">${actions.join('')}</div>` : ''}</div>
      ${draftBox}
      ${viewingOld ? `<div class="pol-note">${icon('info')} ${history.state === 'superseded' ? tr(`你在看旧版本 v${history.no}，已被新版本替代。`, `You are looking at version ${history.no}, which was replaced.`) : tr(`你在看第 ${history.no} 版（${w(STATE[history.state])}）。`, `You are looking at version ${history.no} (${w(STATE[history.state])}).`)} <button class="pol-link" data-pol="view-current">${tr('回到当前版本', 'Back to the current version')}</button></div>` : ''}
      ${viewingDraft ? `<div class="pol-note">${icon('info')} ${tr('这份文件还没有发布，员工看不到。', 'Not published yet; employees cannot see it.')}</div>` : ''}
      <div class="pol-langbar"><div class="pol-seg">${['zh', 'en'].map(l => `<button class="${showLang === l ? 'on' : ''}" data-pol="doc-lang" data-l="${l}" ${!(l === 'en' ? v.bodyEn : v.bodyZh) ? 'disabled' : ''}>${l === 'zh' ? '中文' : 'English'}</button>`).join('')}</div><small>${esc(official)}${showLang !== v.officialLang ? ` · ${tr('当前是参考译文', 'this is a reference translation')}` : ''}</small></div>
      <div class="pol-body-wrap">${md.toc.length > 2 ? `<nav class="pol-toc"><b>${tr('目录', 'Contents')}</b>${md.toc.map(([id, t, l]) => `<a href="#${id}" data-pol-toc="${id}" class="l${l}">${esc(t)}</a>`).join('')}</nav>` : ''}
        <div class="pol-body">${md.html || `<p class="pol-hint">${tr('（正文为空）', '(No text)')}</p>`}</div></div>
      ${files}${signBox}${hist}</article>`;
  }

  /* ---------- editor ---------- */
  function editorForm(d, draft) {
    const meta = d || { category:ui.cat, titleZh:'', titleEn:'', region:'', departmentIds:[], requiresAck:ui.cat === 'handbook', public:false, ownerId:ctx.actor?.()?.id, reviewMonths:12 };
    const v = draft || d?.current || { bodyZh:'', bodyEn:'', officialLang:'zh', changeNote:'', effectiveDate:null, reack:true };
    const isNew = !d, republish = !!d?.current;
    const depts = data.departments.map(x => `<label class="pol-check"><input type="checkbox" name="dept" value="${esc(x.id)}" ${meta.departmentIds.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('');
    return `<form id="pol-edit" class="pol-form">
      ${isNew ? `<div class="pol-grid">
        <label>${tr('分类', 'Category')}<select name="category">${Object.entries(CATS).map(([k, c]) => opt(k, w(c), meta.category)).join('')}</select></label>
        <label>${tr('适用地区', 'Region')}<select name="region">${Object.entries(REGION).map(([k, r]) => opt(k, w(r), meta.region)).join('')}</select></label>
        <label>${tr('中文标题', 'Chinese title')}<input name="titleZh" value="${esc(meta.titleZh)}" maxlength="200"></label>
        <label>${tr('英文标题', 'English title')}<input name="titleEn" value="${esc(meta.titleEn)}" maxlength="200"></label>
        <label>${tr('负责人', 'Owner')}<select name="ownerId">${data.people.map(p => opt(p.id, p.name, meta.ownerId)).join('')}</select></label>
        <label>${tr('复核周期', 'Review every')}<select name="reviewMonths">${[[0, tr('不复核', 'No review')], [3, tr('3 个月', '3 months')], [6, tr('6 个月', '6 months')], [12, tr('12 个月', '12 months')], [24, tr('24 个月', '24 months')]].map(([k, l]) => opt(k, l, meta.reviewMonths)).join('')}</select></label>
        <div class="pol-wide"><span class="pol-label">${tr('适用部门（不选 = 所有部门）', 'Departments (none = all)')}</span><div class="pol-depts">${depts}</div></div>
        <label class="pol-check"><input type="checkbox" name="requiresAck" ${meta.requiresAck ? 'checked' : ''}> ${tr('需要员工签收', 'Employees must sign')}</label>
        <label class="pol-check"><input type="checkbox" name="public" ${meta.public ? 'checked' : ''}> ${tr('对外公开（客户也能看）', 'Public (customers may see it)')}</label></div>` : ''}
      <div class="pol-editor">
        <div class="pol-editor-bar"><div class="pol-seg">${['zh', 'en'].map((l, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-pol="ed-tab" data-l="${l}">${l === 'zh' ? '中文正文' : 'English text'}</button>`).join('')}
          <button type="button" data-pol="ed-tab" data-l="preview">${tr('预览', 'Preview')}</button></div>
          <button type="button" class="btn small" data-pol="translate">${icon('translate')} ${tr('AI 翻译到另一种语言', 'AI translate to the other language')}</button></div>
        <textarea name="bodyZh" data-ed="zh" rows="18" placeholder="${tr('支持 Markdown：## 标题、- 列表、1. 编号、| 表格 |、**加粗**', 'Markdown: ## heading, - list, 1. steps, | table |, **bold**')}">${esc(v.bodyZh)}</textarea>
        <textarea name="bodyEn" data-ed="en" rows="18" hidden placeholder="Markdown">${esc(v.bodyEn)}</textarea>
        <div class="pol-body pol-preview" data-ed="preview" hidden></div></div>
      <div class="pol-grid">
        <label>${tr('正式版本语言', 'Official language')}<select name="officialLang">${opt('zh', '中文', v.officialLang)}${opt('en', 'English', v.officialLang)}</select></label>
        <label>${tr('生效日期', 'Effective date')}<input type="date" name="effectiveDate" value="${esc(v.effectiveDate || '')}"></label>
        <label class="pol-wide">${tr('改了什么（版本说明）', 'What changed (version note)')}<input name="changeNote" value="${esc(v.changeNote || '')}" maxlength="2000" placeholder="${isNew ? tr('首次发布', 'First version') : tr('例如：年假天数调整', 'e.g. annual leave days changed')}"></label>
        ${republish && (meta.requiresAck) ? `<label class="pol-check pol-wide"><input type="checkbox" name="reack" ${v.reack ? 'checked' : ''}> ${tr('发布后要求所有人重新签收（改错字可以不勾）', 'Ask everyone to sign again after publishing (not needed for typo fixes)')}</label>` : ''}</div>
    </form>`;
  }
  function openEditor() {
    const d = detail && ui.sel && detail.id === ui.sel ? detail : null, isNew = !d || ui.creating;
    const canPub = d ? d.canPublish : isAdmin();
    ctx.modal(isNew ? tr(`新建 · ${w(CATS[ui.cat])}`, `New · ${w(CATS[ui.cat])}`) : `${esc(titleOf(d))} · ${d.draft ? tr(`草稿 v${d.draft.no}`, `Draft v${d.draft.no}`) : tr('新版本', 'New version')}`,
      editorForm(isNew ? null : d, isNew ? null : d.draft),
      `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn" data-pol="save" data-then="">${tr('保存草稿', 'Save draft')}</button>
       <button class="btn primary" data-pol="save" data-then="${canPub ? 'publish' : 'submit'}">${canPub ? tr('保存并发布', 'Save and publish') : tr('保存并提交审批', 'Save and send for approval')}</button>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
    ui.editing = isNew ? null : d.id;
    const off = (isNew ? null : (d.draft || d.current))?.officialLang; if (off === 'en') tab('en');
  }
  function formValues() {
    const f = document.getElementById('pol-edit'); if (!f) return null;
    const g = n => f.elements[n]; const val = n => g(n) ? (g(n).type === 'checkbox' ? g(n).checked : g(n).value) : undefined;
    return { f, meta:g('category') ? { category:val('category'), region:val('region'), titleZh:val('titleZh').trim(), titleEn:val('titleEn').trim(), ownerId:val('ownerId') || null,
      reviewMonths:Number(val('reviewMonths')), departmentIds:[...f.querySelectorAll('input[name=dept]:checked')].map(x => x.value), requiresAck:val('requiresAck'), public:val('public') } : null,
      body:{ bodyZh:val('bodyZh'), bodyEn:val('bodyEn'), officialLang:val('officialLang'), changeNote:val('changeNote').trim(), effectiveDate:val('effectiveDate') || null, ...(g('reack') ? { reack:val('reack') } : {}) } };
  }
  async function save(then) {
    const v = formValues(); if (!v) return;
    let docId = ui.editing;
    if (!docId) {
      if (!v.meta.titleZh && !v.meta.titleEn) { ctx.toast?.(tr('请填写标题。', 'Enter a title.')); return; }
      const r = await ctx.api.post('/policies', { ...v.meta, ...v.body, reack: undefined });
      docId = r.id;
    } else await ctx.api.post(`/policies/${docId}/draft`, v.body);
    if (then === 'publish') { const r = await ctx.api.post(`/policies/${docId}/draft/publish`, {}); ctx.toast?.(r.signAgain ? tr(`已发布，已通知 ${r.asked} 人签收`, `Published; ${r.asked} people asked to sign`) : tr('已发布', 'Published')); }
    else if (then === 'submit') { await ctx.api.post(`/policies/${docId}/draft/submit`, {}); ctx.toast?.(tr('已提交，等待主管理员发布', 'Sent for approval')); }
    else ctx.toast?.(tr('草稿已保存', 'Draft saved'));
    ctx.closeOverlay?.(); ui.sel = docId; ui.creating = false;
    const cat = v.meta?.category; if (cat && cat !== ui.cat) window.location.hash = '#pol-' + cat;
    await refresh();
  }
  /* AI translation: paragraphs go through the shared /translate endpoint (cached), the other text box is filled in. */
  async function translate() {
    const v = formValues(); if (!v) return;
    const active = document.querySelector('[data-pol="ed-tab"].on')?.dataset.l === 'en' ? 'en' : 'zh', from = active, to = from === 'zh' ? 'en' : 'zh';
    const src = from === 'zh' ? v.body.bodyZh : v.body.bodyEn;
    if (!src.trim()) { ctx.toast?.(tr('先写好这一栏的正文。', 'Write this side first.')); return; }
    const blocks = src.split(/\n{2,}/), chunks = [];
    for (const b of blocks) { if (b.length <= 3800) chunks.push(b); else for (let i = 0; i < b.length; i += 3800) chunks.push(b.slice(i, i + 3800)); }
    const btn = document.querySelector('[data-pol="translate"]'); if (btn) { btn.disabled = true; btn.textContent = tr('翻译中…', 'Translating…'); }
    try {
      const out = [];
      for (let i = 0; i < chunks.length; i += 50) {
        const r = await ctx.api.post('/translate', { target:to, texts:chunks.slice(i, i + 50) });
        if (!r.available && r.items.some(x => x.text && !x.translated && x.sourceLang && x.sourceLang !== to)) throw new Error(tr('翻译服务暂未开通。', 'Translation is not available.'));
        out.push(...r.items.map(x => x.translated || x.text));
      }
      const ta = v.f.elements[to === 'zh' ? 'bodyZh' : 'bodyEn'];
      if (ta.value.trim() && !confirm(tr('另一栏已有内容，要用译文替换吗？', 'Replace the text already in the other box?'))) return;
      ta.value = out.join('\n\n'); tab(to); ctx.toast?.(tr('已翻译，请核对后保存。', 'Translated. Check it before saving.'));
    } catch (e) { ctx.toast?.(e.message || tr('翻译失败', 'Translation failed')); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = `${icon('translate')} ${tr('AI 翻译到另一种语言', 'AI translate to the other language')}`; } }
  }
  function tab(l) {
    document.querySelectorAll('[data-pol="ed-tab"]').forEach(b => b.classList.toggle('on', b.dataset.l === l));
    document.querySelectorAll('#pol-edit [data-ed]').forEach(el => { el.hidden = el.dataset.ed !== l; });
    if (l === 'preview') { const v = formValues(); const p = document.querySelector('#pol-edit [data-ed=preview]'); const zhOn = lang() !== 'en'; p.innerHTML = markdown((zhOn ? v.body.bodyZh || v.body.bodyEn : v.body.bodyEn || v.body.bodyZh) || '').html || `<p class="pol-hint">${tr('（空）', '(empty)')}</p>`; }
  }

  function openSettings() {
    const d = detail;
    const depts = data.departments.map(x => `<label class="pol-check"><input type="checkbox" name="dept" value="${esc(x.id)}" ${d.departmentIds.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('');
    ctx.modal(tr('文件设置', 'Document settings'), `<form id="pol-settings" class="pol-form"><div class="pol-grid">
      <label>${tr('中文标题', 'Chinese title')}<input name="titleZh" value="${esc(d.titleZh)}" maxlength="200"></label>
      <label>${tr('英文标题', 'English title')}<input name="titleEn" value="${esc(d.titleEn)}" maxlength="200"></label>
      <label>${tr('分类', 'Category')}<select name="category">${Object.entries(CATS).map(([k, c]) => opt(k, w(c), d.category)).join('')}</select></label>
      <label>${tr('适用地区', 'Region')}<select name="region">${Object.entries(REGION).map(([k, r]) => opt(k, w(r), d.region)).join('')}</select></label>
      <label>${tr('负责人', 'Owner')}<select name="ownerId">${data.people.map(p => opt(p.id, p.name, d.ownerId)).join('')}</select></label>
      <label>${tr('复核周期', 'Review every')}<select name="reviewMonths">${[[0, tr('不复核', 'No review')], [3, tr('3 个月', '3 months')], [6, tr('6 个月', '6 months')], [12, tr('12 个月', '12 months')], [24, tr('24 个月', '24 months')]].map(([k, l]) => opt(k, l, d.reviewMonths)).join('')}</select></label>
      <div class="pol-wide"><span class="pol-label">${tr('适用部门（不选 = 所有部门）', 'Departments (none = all)')}</span><div class="pol-depts">${depts}</div></div>
      <label class="pol-check"><input type="checkbox" name="requiresAck" ${d.requiresAck ? 'checked' : ''}> ${tr('需要员工签收', 'Employees must sign')}</label>
      <label class="pol-check"><input type="checkbox" name="public" ${d.public ? 'checked' : ''}> ${tr('对外公开（客户也能看）', 'Public (customers may see it)')}</label></div>
      <p class="pol-small">${tr('已发布的文件改适用范围、分类或签收要求，需要能发布这份文件的人操作。', 'Changing who a published document applies to, its category or sign-off needs someone who can publish it.')}</p></form>`,
      `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" data-pol="save-settings">${tr('保存', 'Save')}</button>`);
  }
  async function saveSettings() {
    const f = document.getElementById('pol-settings'); if (!f) return;
    const e = f.elements;
    await ctx.api.patch(`/policies/${detail.id}`, { titleZh:e.titleZh.value.trim(), titleEn:e.titleEn.value.trim(), category:e.category.value, region:e.region.value, ownerId:e.ownerId.value || null,
      reviewMonths:Number(e.reviewMonths.value), departmentIds:[...f.querySelectorAll('input[name=dept]:checked')].map(x => x.value), requiresAck:e.requiresAck.checked, public:e.public.checked });
    ctx.closeOverlay?.(); ctx.toast?.(tr('已保存', 'Saved'));
    if (e.category.value !== ui.cat) window.location.hash = '#pol-' + e.category.value;
    await refresh();
  }

  async function openAcks() {
    acks = null; paintAcks(true);
    try { acks = await ctx.api.get(`/policies/${detail.id}/acks`); } catch (e) { acks = { error:e.message }; }
    paintAcks(false);
  }
  function paintAcks(first) {
    const body = !acks ? `<p class="pol-hint">${tr('正在读取…', 'Loading…')}</p>` : acks.error ? `<div class="pol-alert">${esc(acks.error)}</div>` : `
      <div class="pol-ack-sum"><b>${acks.done} / ${acks.total}</b> ${tr(`人已签收第 ${acks.versionNo} 版`, `signed version ${acks.versionNo}`)}<span class="pol-meter big"><i style="width:${acks.total ? Math.round(acks.done / acks.total * 100) : 0}%"></i></span></div>
      <div class="pol-table"><table><thead><tr><th>${tr('姓名', 'Name')}</th><th>${tr('部门', 'Department')}</th><th>${tr('地区', 'Region')}</th><th>${tr('签收时间', 'Signed')}</th></tr></thead>
        <tbody>${acks.people.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.department)}</td><td>${esc(w(REGION[p.region || '']))}</td><td>${p.ackedAt ? esc(fmtTime(p.ackedAt)) : badge(tr('未签收', 'Not signed'), 'red')}</td></tr>`).join('')}</tbody></table></div>`;
    const foot = `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>${acks && !acks.error ? `<button class="btn" data-pol="acks-csv">${icon('download-simple')} ${tr('导出', 'Export')}</button>${acks.done < acks.total ? `<button class="btn primary" data-pol="remind">${icon('bell-ringing')} ${tr(`提醒未签收的 ${acks.total - acks.done} 人`, `Remind ${acks.total - acks.done} people`)}</button>` : ''}` : ''}`;
    if (first || !document.getElementById('pol-acks')) { ctx.modal(`${esc(titleOf(detail))} · ${tr('签收情况', 'Sign-off')}`, `<div id="pol-acks">${body}</div>`, foot); }
    else { document.getElementById('pol-acks').innerHTML = body; const f = document.querySelector('#overlay-root .modal-footer'); if (f) f.innerHTML = foot; }
  }
  function acksCsv() {
    const rows = [[tr('姓名', 'Name'), tr('部门', 'Department'), tr('地区', 'Region'), tr('签收时间', 'Signed at')], ...acks.people.map(p => [p.name, p.department, w(REGION[p.region || '']), p.ackedAt ? new Date(p.ackedAt).toISOString() : ''])];
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' })); a.download = `${titleOf(detail)}-v${acks.versionNo}-sign-off.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function openAccess() {
    access = null; paintAccess(true);
    try { access = await ctx.api.get('/policies-access'); } catch (e) { access = { error:e.message }; }
    paintAccess(false);
  }
  function paintAccess(first) {
    const body = !access ? `<p class="pol-hint">${tr('正在读取…', 'Loading…')}</p>` : access.error ? `<div class="pol-alert">${esc(access.error)}</div>` : `
      <div class="pol-open"><label class="pol-check"><input type="checkbox" data-pol-open ${data?.open ? 'checked' : ''}> <b>${tr('对全员开放', 'Open to everyone')}</b></label>
        <p class="pol-small">${tr('关闭时只有主管理员和下面“可管理”的人能看到这个区域，员工看不到、也不会收到签收提醒。打开后员工就能看到适用于自己的文件，需要签收的会收到提醒。', 'While closed, only main admins and the editors below see this area; employees neither see it nor get sign-off requests. Once open, employees see the documents that apply to them and are asked to sign where needed.')}</p></div>
      <p class="pol-small">${tr('“可管理”的人可以新建和修改制度、提交审批、看签收情况。员工手册和公司政策只有主管理员能发布；某个部门的 SOP 也可以由这个部门的主管（同时可管理）发布。所有员工都能看到适用于自己的已发布文件。', 'Editors write documents, send them for approval and see sign-off. Only main admins publish the handbook and company policies; a one-department SOP may also be published by that department’s manager if they are an editor. Everyone reads the published documents that apply to them.')}</p>
      <div class="pol-table"><table><thead><tr><th>${tr('成员', 'Member')}</th><th>${tr('权限', 'Access')}</th></tr></thead><tbody>${access.people.map(p => `<tr><td>${esc(p.name)}${p.title ? ` <small>${esc(p.title)}</small>` : ''}${p.manager ? ` ${badge(tr('主管', 'Manager'), 'gray')}` : ''}</td>
        <td>${p.admin ? badge(tr('主管理员', 'Main admin'), 'blue') : `<select data-pol-access="${esc(p.id)}" ${p.id === ctx.actor?.()?.id ? 'disabled' : ''}>${opt('none', tr('只读（看适用的文件）', 'Read only'), p.level)}${opt('manage', tr('可管理', 'Editor'), p.level)}</select>`}</td></tr>`).join('')}</tbody></table></div>`;
    if (first || !document.getElementById('pol-access')) ctx.modal(tr('公司制度 · 权限', 'Policies · Access'), `<div id="pol-access">${body}</div>`, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`);
    else document.getElementById('pol-access').innerHTML = body;
  }

  async function uploadFiles(files) {
    for (const f of files) {
      const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error(tr('文件读取失败', 'Could not read the file'))); r.readAsDataURL(f); });
      await ctx.api.post(`/policies/${detail.id}/files`, { name:f.name, mime:f.type || 'application/octet-stream', dataBase64:b64 });
    }
  }
  // The upload box lives in the reader, which is redrawn often: register after each paint.
  function afterPaint() {
    if (!detail?.canEdit || !document.querySelector('[data-upload-zone="pol-files"]')) return;
    window.WorkOSUpload?.register('pol-files', { lang:lang(), accept:FILE_MIME, multiple:true, maxBytes:20 * 1024 * 1024, onFiles:async files => {
      window.WorkOSUpload.status('pol-files', tr('上传中…', 'Uploading…'));
      try { await uploadFiles(files); ctx.toast?.(tr('已上传', 'Uploaded')); await openDoc(detail.id); } catch (e) { window.WorkOSUpload.status('pol-files', e.message || tr('上传失败', 'Upload failed'), true); }
    } });
  }

  /* ---------- events ---------- */
  const busyRun = async (el, fn) => { if (el) el.disabled = true; try { await fn(); } catch (e) { ctx.toast?.(e.message || tr('操作失败', 'Something went wrong')); } finally { if (el && document.contains(el)) el.disabled = false; } };
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-pol]'); if (!t || !ctx) return;
    const a = t.dataset.pol;
    if (a === 'open') { e.preventDefault(); openDoc(t.dataset.id); return; }
    if (a === 'go') { if (t.dataset.cat !== ui.cat) { ui.cat = t.dataset.cat; window.location.hash = '#pol-' + t.dataset.cat; } openDoc(t.dataset.id); return; }
    if (a === 'back') { ui.sel = null; detail = null; ctx.rerender(); return; }
    if (a === 'doc-lang') { ui.docLang = t.dataset.l; ctx.rerender(); return; }
    if (a === 'view-version') { await busyRun(t, async () => { history = await ctx.api.get(`/policies/${detail.id}/versions/${t.dataset.v}`); ctx.rerender(); }); return; }
    if (a === 'view-current') { history = null; ctx.rerender(); return; }
    if (a === 'new') { ui.creating = true; openEditor(); return; }
    if (a === 'edit') { ui.creating = false; openEditor(); return; }
    if (a === 'ed-tab') { tab(t.dataset.l); return; }
    if (a === 'translate') { translate(); return; }
    if (a === 'save') { await busyRun(t, () => save(t.dataset.then)); return; }
    if (a === 'settings') { openSettings(); return; }
    if (a === 'save-settings') { await busyRun(t, saveSettings); return; }
    if (a === 'submit') { await busyRun(t, async () => { await ctx.api.post(`/policies/${detail.id}/draft/submit`, {}); ctx.toast?.(tr('已提交，等待主管理员发布', 'Sent for approval')); await refresh(); }); return; }
    if (a === 'publish') { if (!confirm(tr('确认发布？发布后员工马上能看到。', 'Publish now? Employees will see it right away.'))) return;
      await busyRun(t, async () => { const r = await ctx.api.post(`/policies/${detail.id}/draft/publish`, {}); history = null; ctx.toast?.(r.signAgain ? tr(`已发布，已通知 ${r.asked} 人签收`, `Published; ${r.asked} people asked to sign`) : tr('已发布', 'Published')); await refresh(); }); return; }
    if (a === 'reject') { const reason = prompt(tr('退回原因（会通知起草人）', 'Why send it back? (the writer is told)')); if (!reason?.trim()) return;
      await busyRun(t, async () => { await ctx.api.post(`/policies/${detail.id}/draft/reject`, { reason:reason.trim() }); ctx.toast?.(tr('已退回', 'Sent back')); await refresh(); }); return; }
    if (a === 'archive') { const on = detail.status !== 'archived'; if (on && !confirm(tr('停用后员工就看不到这份文件了，确认？', 'Archive it? Employees will no longer see it.'))) return;
      await busyRun(t, async () => { await ctx.api.post(`/policies/${detail.id}/archive`, { archived:on }); await refresh(); }); return; }
    if (a === 'ack') { await busyRun(t, async () => { await ctx.api.post(`/policies/${detail.id}/ack`, { versionId:detail.ackVersionId }); ctx.toast?.(tr('已签收，谢谢！', 'Signed. Thank you!')); await refresh(); window.WorkOSInbox?.refresh?.(); }); return; }
    if (a === 'acks') { openAcks(); return; }
    if (a === 'acks-csv') { acksCsv(); return; }
    if (a === 'remind') { await busyRun(t, async () => { const r = await ctx.api.post(`/policies/${detail.id}/remind`, {}); ctx.toast?.(tr(`已提醒 ${r.sent} 人`, `Reminded ${r.sent} people`)); }); return; }
    if (a === 'access') { openAccess(); return; }
    if (a === 'file-del') { e.preventDefault(); if (!confirm(tr('删除这个附件？', 'Delete this attachment?'))) return;
      await busyRun(t, async () => { await ctx.api.post(`/policies/${detail.id}/files/${t.dataset.f}/delete`, {}); await openDoc(detail.id); }); return; }
  });
  document.addEventListener('click', e => { const a = e.target.closest('[data-pol-toc]'); if (!a) return; e.preventDefault(); document.getElementById(a.dataset.polToc)?.scrollIntoView({ behavior:'smooth', block:'start' }); });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.matches('[data-pol-agree]')) { const b = document.querySelector('[data-pol="ack"]'); if (b) b.disabled = !t.checked; return; }
    if (t.matches('[data-pol-mine]')) { ui.mine = t.checked; ui.sel = null; ctx.rerender(); return; }
    if (t.matches('[data-pol-open]')) {
      const on = t.checked;
      if (on && !confirm(tr('确认开放给全员？需要签收的文件会通知适用的员工。', 'Open to everyone? People will be asked to sign the documents that need it.'))) { t.checked = false; return; }
      try { const r = await ctx.api.post('/policies-settings', { open:on }); ctx.toast?.(on ? tr(`已开放给全员${r.asked ? `，已通知 ${r.asked} 条签收` : ''}`, `Open to everyone${r.asked ? `; ${r.asked} sign-off requests sent` : ''}`) : tr('已关闭，只有你和编辑人能看到', 'Closed: only you and the editors can see it')); data = null; await load(); }
      catch (err) { t.checked = !on; ctx.toast?.(err.message); }
      return;
    }
    if (t.matches('[data-pol-access]')) { try { await ctx.api.post('/policies-access', { userId:t.dataset.polAccess, level:t.value }); ctx.toast?.(tr('已保存', 'Saved')); } catch (err) { ctx.toast?.(err.message); await openAccess(); } }
  });
  let qTimer = null;
  document.addEventListener('input', e => {
    if (!e.target.matches('[data-pol-q]')) return;
    ui.q = e.target.value; clearTimeout(qTimer);
    qTimer = setTimeout(async () => { const pos = e.target.selectionStart; ui.sel = null; detail = null; data = null; await load(); const el = document.querySelector('[data-pol-q]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* ignore */ } } }, 300);
  });

  window.WorkOSPolicies = { configure, render, reset, afterPaint, markdown, CATS };
})();
