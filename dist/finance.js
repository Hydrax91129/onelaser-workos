/*
 * Finance (财务) — accounts receivable (应收账款). Server: onelaser-workos-api src/finance.ts.
 *
 * One row per invoice: responsible person, invoice date, term and due date, customer and contact, type, our order
 * number, total, dispatched or not, payment method, status, received, outstanding and paid %. The page leads with
 * what needs chasing: outstanding, overdue, shipped but unpaid, and aging. A row opens the invoice: details (editable
 * by finance managers), payments (the responsible person records them too), invoice files (paste, drag or choose),
 * and the follow-up log. Main admins set who may view or manage finance in the 权限 tab.
 * Accounts payable (应付账款) comes later.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '', detail = null, access = null, busy = false;
  const ui = { view:'ar', q:'', status:'', owner:'' };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const usd = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const today = () => new Date().toISOString().slice(0, 10);
  const STATUS = { unpaid:['未收款', 'Not paid', 'red'], partial:['部分收款', 'Partly paid', 'amber'], deposit:['支票已存待到账', 'Check deposited', 'blue'], paid:['已收清', 'Paid', 'green'] };
  const TERM = { due_on_receipt:['收到即付', 'Due on receipt'], net15:['Net 15', 'Net 15'], net30:['Net 30', 'Net 30'], net45:['Net 45', 'Net 45'], net60:['Net 60', 'Net 60'], net90:['Net 90', 'Net 90'], prepaid:['预付款', 'Prepaid'], custom:['自定义天数', 'Custom days'] };
  const METHOD = { check:['支票 Check', 'Check'], ach:['ACH', 'ACH'], wire:['电汇 Wire', 'Wire'], quickbooks:['QuickBooks', 'QuickBooks'], card:['信用卡', 'Card'], paypal:['PayPal', 'PayPal'], cash:['现金', 'Cash'], other:['其他', 'Other'] };
  const KINDS = ['PO', 'KOL', '经销商 Dealer', '官网 Website', 'Amazon', 'Lens', '其他 Other'];
  const FILE_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
  const w = pair => pair ? tr(pair[0], pair[1]) : '';
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  const badge = i => `<span class="fin-badge ${STATUS[i.status]?.[2] || ''}">${esc(w(STATUS[i.status]))}</span>${i.overdue ? `<span class="fin-badge red soft">${tr(`逾期 ${i.daysOverdue} 天`, `${i.daysOverdue}d overdue`)}</span>` : ''}`;
  const bar = pct => `<span class="fin-bar" title="${pct}%"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span class="fin-pct">${Math.round(pct)}%</span>`;

  function configure(next) { ctx = next; }
  function reset() { data = null; loading = false; error = ''; detail = null; access = null; ui.view = 'ar'; ui.q = ''; ui.status = ''; ui.owner = ''; }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/finance/receivables'); error = ''; }
    catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }
  async function loadAccess() {
    try { access = await ctx.api.get('/finance/access'); } catch (e) { access = { error:e.message }; }
    ctx.rerender();
  }
  const isAdmin = () => ctx?.actor?.()?.executiveAccess === true;

  function list() {
    const q = ui.q.trim().toLowerCase();
    return data.items.filter(i => (!q || [i.number, i.customer, i.contact, i.orderRef, i.responsibleName, i.kind].some(x => String(x || '').toLowerCase().includes(q)))
      && (!ui.owner || i.responsibleId === ui.owner)
      && (!ui.status || (ui.status === 'open' ? i.status !== 'paid' : ui.status === 'overdue' ? i.overdue : ui.status === 'shipped' ? i.dispatched && i.status !== 'paid' : i.status === ui.status)));
  }

  function render() {
    if (!data && !error) { load(); return `<div class="fin"><p class="fin-hint">${tr('正在读取…', 'Loading…')}</p></div>`; }
    if (error && !data) return `<div class="fin"><div class="fin-alert">${esc(error)}</div></div>`;
    const tabs = [['ar', tr('应收账款', 'Receivables')], ['ap', tr('应付账款（即将推出）', 'Payables (coming)')], isAdmin() && ['access', tr('权限', 'Access')]].filter(Boolean);
    const head = `<div class="page-heading"><div><div class="eyebrow">WORK OS · FINANCE</div><h1>${tr('财务', 'Finance')}</h1>
      <p>${tr('记录每张发票的发货、账期和收款，盯住已发货未收款和逾期的单子。', 'Track every invoice: dispatch, terms and payments. Keep an eye on shipped-but-unpaid and overdue invoices.')}</p></div>
      <div class="heading-actions">${data.level === 'manage' && ui.view === 'ar' ? `<button class="btn primary" data-fin="new">${icon('plus')} ${tr('新建应收', 'New invoice')}</button>` : ''}</div></div>
      <div class="fin-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${ui.view === k}" class="${ui.view === k ? 'on' : ''}" data-fin="tab" data-v="${k}" ${k === 'ap' ? 'disabled' : ''}>${esc(l)}</button>`).join('')}</div>`;
    if (ui.view === 'access') return `<div class="fin">${head}${accessView()}</div>`;
    const s = data.summary, items = list();
    const count = k => data.items.filter(i => k === 'open' ? i.status !== 'paid' : k === 'overdue' ? i.overdue : k === 'shipped' ? i.dispatched && i.status !== 'paid' : i.status === k).length;
    const chips = [['', tr('全部', 'All'), data.items.length], ['open', tr('未收清', 'Open'), count('open')], ['shipped', tr('已发货未收清', 'Shipped, not paid'), count('shipped')], ['overdue', tr('逾期', 'Overdue'), count('overdue')],
      ['unpaid', w(STATUS.unpaid), count('unpaid')], ['partial', w(STATUS.partial), count('partial')], ['deposit', w(STATUS.deposit), count('deposit')], ['paid', w(STATUS.paid), count('paid')]];
    const aging = [['current', tr('未到期', 'Not due')], ['d1_30', tr('逾期 1–30 天', '1–30 days')], ['d31_60', tr('31–60 天', '31–60')], ['d61_90', tr('61–90 天', '61–90')], ['d90', tr('90 天以上', '90+')]];
    const agingMax = Math.max(1, ...aging.map(([k]) => s.aging[k] || 0));
    return `<div class="fin">${head}
      ${data.level === 'own' ? `<div class="fin-note">${icon('info')} ${tr('这里只显示你负责的单子。你可以记录收款、上传发票和写跟进；新建和修改发票由财务负责。', 'Only invoices you are responsible for. You can record payments, add files and follow-ups; finance creates and edits invoices.')}</div>` : ''}
      <div class="fin-kpis">
        <div class="fin-kpi"><span>${tr('应收总额', 'Invoiced')}</span><b>${usd(s.total)}</b><em>${tr(`${s.count} 张发票`, `${s.count} invoices`)}</em></div>
        <div class="fin-kpi"><span>${tr('已收', 'Received')}</span><b>${usd(s.received)}</b><em>${bar(s.paidPct)}</em></div>
        <div class="fin-kpi hot"><span>${tr('待收', 'Outstanding')}</span><b>${usd(s.outstanding)}</b><em>${tr(`占 ${Math.round(100 - s.paidPct)}%`, `${Math.round(100 - s.paidPct)}% of total`)}</em></div>
        <div class="fin-kpi red"><span>${tr('逾期未收', 'Overdue')}</span><b>${usd(s.overdue)}</b><em>${tr(`${s.overdueCount} 单`, `${s.overdueCount} invoices`)}</em></div>
        <div class="fin-kpi amber"><span>${tr('已发货未收款', 'Shipped, not paid')}</span><b>${usd(s.shippedUnpaid)}</b><em>${tr(`${s.shippedUnpaidCount} 单`, `${s.shippedUnpaidCount} invoices`)}</em></div>
        <div class="fin-kpi"><span>${tr('支票待到账', 'Checks to clear')}</span><b>${usd(s.deposited)}</b><em>${tr('已存入，未到账', 'Deposited, not cleared')}</em></div>
      </div>
      <section class="fin-aging"><h3>${icon('hourglass-medium')} ${tr('待收账龄', 'Outstanding by age')}</h3>
        <div class="fin-aging-bars">${aging.map(([k, l]) => `<div><span>${esc(l)}</span><span class="fin-agebar ${k}"><i style="width:${(s.aging[k] || 0) / agingMax * 100}%"></i></span><b>${usd(s.aging[k])}</b></div>`).join('')}</div></section>
      <div class="fin-toolbar">
        <label class="fin-search">${icon('magnifying-glass')}<input data-fin-q value="${esc(ui.q)}" placeholder="${tr('搜索客户、联系人、订单号、单号', 'Search customer, contact, order #, invoice #')}"></label>
        ${data.level !== 'own' ? `<select data-fin-owner aria-label="${tr('负责人', 'Responsible')}"><option value="">${tr('全部负责人', 'Everyone')}</option>${data.responsible.map(p => opt(p.id, p.name, ui.owner)).join('')}</select>` : ''}
      </div>
      <div class="fin-chips">${chips.map(([k, l, n]) => `<button class="${ui.status === k ? 'on' : ''}" data-fin="status" data-v="${k}">${esc(l)} <b>${n}</b></button>`).join('')}</div>
      <div class="fin-table-wrap"><table class="fin-table"><thead><tr>
        <th>${tr('单号', 'Invoice')}</th><th>${tr('负责人', 'Responsible')}</th><th>${tr('开票日期', 'Invoice date')}</th><th>${tr('到期日', 'Due')}</th><th>${tr('客户 / 联系人', 'Customer / contact')}</th>
        <th>${tr('类型', 'Type')}</th><th>${tr('订单号', 'Order #')}</th><th class="num">${tr('金额', 'Total')}</th><th>${tr('发货', 'Dispatch')}</th><th>${tr('付款方式', 'Method')}</th>
        <th>${tr('状态', 'Status')}</th><th class="num">${tr('已收', 'Received')}</th><th class="num">${tr('待收', 'Outstanding')}</th><th>${tr('收款占比', 'Paid')}</th></tr></thead><tbody>
        ${items.length ? items.map(i => `<tr class="fin-row ${i.overdue ? 'late' : ''}" data-fin="open" data-id="${esc(i.id)}" tabindex="0">
          <td class="mono">${esc(i.number)}${i.fileCount ? ` <span class="fin-clip" title="${tr('附件', 'Files')}">${icon('paperclip')}${i.fileCount}</span>` : ''}</td><td>${esc(i.responsibleName || '—')}</td>
          <td class="date">${esc(i.invoiceDate)}</td><td class="date">${esc(i.dueDate || '—')}<small>${esc(i.paymentTerm ? w(TERM[i.paymentTerm]) || i.paymentTerm : '')}</small></td>
          <td><b>${esc(i.customer)}</b><small>${esc(i.contact)}</small></td><td>${esc(i.kind || '—')}</td><td class="mono">${esc(i.orderRef || '—')}</td><td class="num">${usd(i.amount)}</td>
          <td>${i.dispatched ? `<span class="fin-badge green soft">${tr('已发货', 'Dispatched')}</span>` : `<span class="fin-badge soft">${tr('未发货', 'Not yet')}</span>`}</td><td>${esc(w(METHOD[i.payMethod]) || i.payMethod || '—')}</td>
          <td>${badge(i)}</td><td class="num">${usd(i.received)}</td><td class="num ${i.outstanding > 0 ? 'owe' : ''}">${usd(i.outstanding)}</td><td>${bar(i.paidPct)}</td></tr>`).join('')
        : `<tr><td colspan="14" class="fin-empty">${data.items.length ? tr('没有符合条件的单子。', 'Nothing matches.') : tr('还没有应收记录。点右上角“新建应收”开始记录。', 'No invoices yet. Use “New invoice” to start.')}</td></tr>`}
      </tbody></table></div>
    </div>`;
  }

  function accessView() {
    if (!access) { loadAccess(); return `<p class="fin-hint">${tr('正在读取…', 'Loading…')}</p>`; }
    if (access.error) return `<div class="fin-alert">${esc(access.error)}</div>`;
    const levels = [['none', tr('无', 'None')], ['view', tr('查看', 'View')], ['manage', tr('管理', 'Manage')]];
    return `<div class="fin-note">${icon('shield-check')} ${tr('只有主管理员能设置。查看 = 看所有应收和附件；管理 = 还能新建、修改、记收款、删除。没有权限的人只看到自己负责的单子（记收款、传发票、写跟进）。', 'Main admins only. View = all receivables and files; Manage = also create, edit, record payments, delete. Others only see invoices they are responsible for.')}</div>
      <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>${tr('员工', 'Employee')}</th><th>${tr('财务权限', 'Finance access')}</th></tr></thead><tbody>
      ${access.people.map(p => `<tr><td><b>${esc(p.name)}</b><small>${esc(p.title)}</small></td><td>${p.admin ? `<span class="fin-badge blue soft">${tr('主管理员（全部权限）', 'Main admin (full)')}</span>` :
        `<span class="fin-seg">${levels.map(([k, l]) => `<button class="${p.level === k ? 'on lv-' + k : ''}" data-fin="access" data-user="${esc(p.id)}" data-v="${k}">${esc(l)}</button>`).join('')}</span>`}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ---------- the invoice window ---------- */
  function formFields(r, people) {
    const v = r || { invoiceDate:today(), paymentTerm:'net30', termDays:30, dispatched:false, payMethod:'check' };
    return `<div class="form-grid">
      <label class="field"><span>${tr('负责人（销售 / 账户经理）', 'Responsible (sales / account manager)')}</span><select name="responsibleId"><option value="">${tr('未指定', 'Not set')}</option>${people.map(p => opt(p.id, p.name, v.responsibleId)).join('')}</select></label>
      <label class="field"><span>${tr('类型', 'Type')}</span><input name="kind" maxlength="60" list="fin-kinds" value="${esc(v.kind || '')}" placeholder="PO / KOL / …"><datalist id="fin-kinds">${KINDS.map(k => `<option value="${esc(k)}">`).join('')}</datalist></label>
      <label class="field"><span>${tr('客户公司', 'Customer company')}</span><input name="customer" required maxlength="200" value="${esc(v.customer || '')}"></label>
      <label class="field"><span>${tr('联系人', 'Contact')}</span><input name="contact" maxlength="120" value="${esc(v.contact || '')}"></label>
      <label class="field"><span>${tr('联系人邮箱', 'Contact email')}</span><input name="contactEmail" type="email" maxlength="200" value="${esc(v.contactEmail || '')}"></label>
      <label class="field"><span>${tr('我们的订单号', 'Our order #')}</span><input name="orderRef" maxlength="80" value="${esc(v.orderRef || '')}"></label>
      <label class="field"><span>${tr('开票日期', 'Invoice date')}</span><input name="invoiceDate" type="date" required min="2000-01-01" value="${esc(v.invoiceDate || '')}" data-fin-due-src></label>
      <label class="field"><span>${tr('账期', 'Payment term')}</span><select name="paymentTerm" data-fin-term data-fin-due-src>${Object.entries(TERM).map(([k, p]) => opt(k, w(p), v.paymentTerm)).join('')}</select></label>
      <label class="field" data-fin-days ${v.paymentTerm === 'custom' ? '' : 'hidden'}><span>${tr('账期天数', 'Days')}</span><input name="termDays" type="number" min="0" max="365" value="${esc(v.termDays ?? '')}" data-fin-due-src></label>
      <label class="field"><span>${tr('到期日（按账期自动算，可改）', 'Due date (from the term; you can change it)')}</span><input name="dueDate" type="date" min="2000-01-01" value="${esc(v.dueDate || '')}" data-fin-due></label>
      <label class="field"><span>${tr('金额（USD）', 'Total (USD)')}</span><input name="amount" type="number" step="0.01" min="0" required value="${esc(v.amount ?? '')}"></label>
      <label class="field"><span>${tr('付款方式', 'Payment method')}</span><select name="payMethod">${Object.entries(METHOD).map(([k, p]) => opt(k, w(p), v.payMethod)).join('')}</select></label>
      <label class="field"><span>${tr('是否已发货', 'Dispatched?')}</span><select name="dispatched" data-fin-shipped>${opt('no', tr('未发货', 'Not yet'), v.dispatched ? 'yes' : 'no')}${opt('yes', tr('已发货', 'Dispatched'), v.dispatched ? 'yes' : 'no')}</select></label>
      <label class="field" data-fin-shipdate ${v.dispatched ? '' : 'hidden'}><span>${tr('发货日期', 'Dispatched on')}</span><input name="dispatchedOn" type="date" min="2000-01-01" value="${esc(v.dispatchedOn || '')}"></label>
      <label class="field full"><span>${tr('备注', 'Notes')}</span><textarea name="note" rows="2" maxlength="4000">${esc(v.note || '')}</textarea></label>
    </div>`;
  }
  const TERM_DAYS = { due_on_receipt:0, net15:15, net30:30, net45:45, net60:60, net90:90, prepaid:0 };
  function readForm(f) {
    const v = Object.fromEntries(new FormData(f).entries());
    const term = v.paymentTerm, days = term === 'custom' ? (v.termDays === '' ? null : Number(v.termDays)) : TERM_DAYS[term] ?? null;
    return { responsibleId:v.responsibleId || null, kind:v.kind.trim(), customer:v.customer.trim(), contact:v.contact.trim(), contactEmail:v.contactEmail.trim(), orderRef:v.orderRef.trim(),
      invoiceDate:v.invoiceDate, paymentTerm:term, termDays:days, dueDate:v.dueDate || null, amount:Number(v.amount), payMethod:v.payMethod,
      dispatched:v.dispatched === 'yes', dispatchedOn:v.dispatched === 'yes' ? (v.dispatchedOn || null) : null, note:v.note.trim() };
  }

  function newInvoice() {
    ctx.modal(tr('新建应收', 'New invoice'), `<form id="fin-new" data-upload-scope="fin-new-files">${formFields(null, data.people)}
      <div class="fin-sec"><h3>${icon('file-text')} ${tr('发票附件（可粘贴、拖拽或点击选择）', 'Invoice files (paste, drag or choose)')}</h3>
      ${window.WorkOSUpload ? window.WorkOSUpload.html({ id:'fin-new-files', lang:lang(), accept:FILE_MIME, multiple:true, maxBytes:10 * 1024 * 1024, hint:tr('PDF、图片、Excel、Word', 'PDF, images, Excel, Word') }) : ''}<ul class="fin-pending" data-fin-pending></ul></div>
      <div class="fin-actions"><button class="btn primary" type="submit">${tr('保存', 'Save')}</button></div><p class="wms-error" role="alert"></p></form>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
    pending = [];
    window.WorkOSUpload?.register('fin-new-files', { lang:lang(), accept:FILE_MIME, multiple:true, maxBytes:10 * 1024 * 1024, onFiles:files => { pending.push(...files); paintPending(); } });
  }
  let pending = [];
  function paintPending() { const ul = document.querySelector('[data-fin-pending]'); if (ul) ul.innerHTML = pending.map((f, i) => `<li>${icon('file')} ${esc(f.name)} <button type="button" class="fin-link" data-fin="unpend" data-i="${i}">${tr('移除', 'Remove')}</button></li>`).join(''); }
  const fileB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(f); });
  async function uploadFiles(rid, files) {
    for (const f of files) await ctx.api.post(`/finance/receivables/${encodeURIComponent(rid)}/files`, { name:f.name || 'invoice', mime:f.type || 'application/octet-stream', dataBase64:await fileB64(f) });
  }

  async function openInvoice(rid) {
    try { detail = await ctx.api.get('/finance/receivables/' + encodeURIComponent(rid)); drawDetail(true); }
    catch (e) { ctx.toast?.(e.message || tr('读取失败', 'Could not load')); }
  }
  async function refreshDetail() { if (!detail) return; detail = await ctx.api.get('/finance/receivables/' + encodeURIComponent(detail.id)); drawDetail(false); data = null; load(); }
  function drawDetail(first) {
    const c = detail, fileUrl = f => `/api/finance/receivables/${encodeURIComponent(c.id)}/files/${encodeURIComponent(f.id)}`;
    const body = `<div class="fin-detail" data-fin-case="${esc(c.id)}">
      <div class="fin-head">${badge(c)}<span class="mono">${esc(c.number)}</span><b>${esc(c.customer)}</b><span>${usd(c.amount)}</span></div>
      <div class="fin-kpis small"><div class="fin-kpi"><span>${tr('已收', 'Received')}</span><b>${usd(c.received)}</b></div><div class="fin-kpi hot"><span>${tr('待收', 'Outstanding')}</span><b>${usd(c.outstanding)}</b></div>
        <div class="fin-kpi"><span>${tr('收款占比', 'Paid')}</span><b>${Math.round(c.paidPct)}%</b><em>${bar(c.paidPct)}</em></div>${c.deposited ? `<div class="fin-kpi"><span>${tr('支票待到账', 'Check to clear')}</span><b>${usd(c.deposited)}</b></div>` : ''}
        <div class="fin-kpi ${c.overdue ? 'red' : ''}"><span>${tr('到期日', 'Due')}</span><b>${esc(c.dueDate || '—')}</b><em>${c.overdue ? tr(`已逾期 ${c.daysOverdue} 天`, `${c.daysOverdue} days overdue`) : ''}</em></div></div>
      ${c.canEdit ? `<section class="fin-sec"><h3>${icon('pencil-simple')} ${tr('发票信息', 'Invoice details')}</h3><form id="fin-edit">${formFields(c, data?.people || [])}
        <div class="fin-actions"><button class="btn" type="submit">${tr('保存修改', 'Save changes')}</button><button class="fin-link danger" type="button" data-fin="archive">${tr('删除这条应收', 'Delete this invoice')}</button></div><p class="wms-error" role="alert"></p></form></section>`
        : `<dl class="fin-facts"><div><dt>${tr('负责人', 'Responsible')}</dt><dd>${esc(c.responsibleName || '—')}</dd></div><div><dt>${tr('联系人', 'Contact')}</dt><dd>${esc(c.contact || '—')} ${esc(c.contactEmail || '')}</dd></div>
          <div><dt>${tr('开票日期', 'Invoice date')}</dt><dd>${esc(c.invoiceDate)}</dd></div><div><dt>${tr('账期', 'Term')}</dt><dd>${esc(w(TERM[c.paymentTerm]) || c.paymentTerm || '—')}</dd></div>
          <div><dt>${tr('订单号', 'Order #')}</dt><dd>${esc(c.orderRef || '—')}</dd></div><div><dt>${tr('类型', 'Type')}</dt><dd>${esc(c.kind || '—')}</dd></div>
          <div><dt>${tr('发货', 'Dispatch')}</dt><dd>${c.dispatched ? tr(`已发货 ${c.dispatchedOn || ''}`, `Dispatched ${c.dispatchedOn || ''}`) : tr('未发货', 'Not yet')}</dd></div><div><dt>${tr('付款方式', 'Method')}</dt><dd>${esc(w(METHOD[c.payMethod]) || c.payMethod || '—')}</dd></div>
          ${c.note ? `<div class="full"><dt>${tr('备注', 'Notes')}</dt><dd>${esc(c.note)}</dd></div>` : ''}</dl>`}
      <section class="fin-sec"><h3>${icon('money')} ${tr('收款记录', 'Payments')}</h3>
        ${c.payments.length ? `<table class="fin-table small"><thead><tr><th>${tr('日期', 'Date')}</th><th class="num">${tr('金额', 'Amount')}</th><th>${tr('方式', 'Method')}</th><th>${tr('状态', 'State')}</th><th>${tr('参考号', 'Reference')}</th><th>${tr('记录人', 'By')}</th><th></th></tr></thead><tbody>
          ${c.payments.map(p => `<tr><td>${esc(p.receivedOn)}</td><td class="num">${usd(p.amount)}</td><td>${esc(w(METHOD[p.method]) || p.method || '—')}</td>
            <td>${p.state === 'deposited' ? `<span class="fin-badge blue soft">${tr('已存入待到账', 'Deposited')}</span>${c.canWork ? ` <button class="fin-link" data-fin="clear" data-pay="${esc(p.id)}">${tr('标记已到账', 'Mark cleared')}</button>` : ''}` : `<span class="fin-badge green soft">${tr('已到账', 'Cleared')}</span>`}</td>
            <td>${esc(p.reference || '')}</td><td>${esc(p.by)}</td><td>${c.canEdit ? `<button class="fin-link danger" data-fin="unpay" data-pay="${esc(p.id)}">${tr('删除', 'Delete')}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<p class="fin-hint">${tr('还没有收款。', 'No payments yet.')}</p>`}
        ${c.canWork && c.status !== 'paid' ? `<form id="fin-pay" class="fin-inline">
          <label class="field"><span>${tr('收款日期', 'Date')}</span><input name="receivedOn" type="date" required max="${today()}" value="${today()}"></label>
          <label class="field"><span>${tr('金额', 'Amount')}</span><input name="amount" type="number" step="0.01" min="0.01" required value="${c.outstanding || ''}"></label>
          <label class="field"><span>${tr('方式', 'Method')}</span><select name="method">${Object.entries(METHOD).map(([k, p]) => opt(k, w(p), c.payMethod)).join('')}</select></label>
          <label class="field"><span>${tr('状态', 'State')}</span><select name="state">${opt('cleared', tr('已到账', 'Cleared'), 'cleared')}${opt('deposited', tr('支票已存入，待到账', 'Check deposited, not cleared'), '')}</select></label>
          <label class="field"><span>${tr('参考号（支票号等）', 'Reference (check # …)')}</span><input name="reference" maxlength="120"></label>
          <button class="btn primary" type="submit">${icon('plus')} ${tr('记录收款', 'Record payment')}</button><p class="wms-error" role="alert"></p></form>` : ''}</section>
      <section class="fin-sec" data-upload-scope="fin-files"><h3>${icon('paperclip')} ${tr('发票附件', 'Invoice files')}</h3>
        ${c.files.length ? `<ul class="fin-files">${c.files.map(f => `<li><a href="${fileUrl(f)}" data-preview-name="${esc(f.name)}" data-preview-mime="${esc(f.mime)}">${icon('file')} ${esc(f.name)}</a> <small>${Math.max(1, Math.round(f.size / 1024))} KB · ${esc(f.by)}</small>${c.canEdit ? ` <button class="fin-link danger" data-fin="unfile" data-file="${esc(f.id)}">${tr('删除', 'Delete')}</button>` : ''}</li>`).join('')}</ul>` : `<p class="fin-hint">${tr('还没有附件。', 'No files yet.')}</p>`}
        ${c.canWork && window.WorkOSUpload ? window.WorkOSUpload.html({ id:'fin-files', lang:lang(), accept:FILE_MIME, multiple:true, maxBytes:10 * 1024 * 1024, hint:tr('PDF、图片、Excel、Word', 'PDF, images, Excel, Word') }) : ''}</section>
      <section class="fin-sec"><h3>${icon('chat-circle-text')} ${tr('跟进记录', 'Follow-ups')}</h3>
        ${c.canWork ? `<form id="fin-note" class="fin-inline"><label class="field grow"><span>${tr('跟进 / 催收计划', 'Follow-up / collection plan')}</span><input name="body" maxlength="2000" required placeholder="${tr('例如：已电话联系，客户承诺周五付款', 'e.g. Called; customer promised to pay Friday')}"></label><button class="btn" type="submit">${tr('添加', 'Add')}</button></form>` : ''}
        <ul class="fin-timeline">${c.notes.map(n => `<li><b>${esc(n.by)}</b> ${esc(n.body)} <time>${esc(new Date(n.at).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN'))}</time></li>`).join('')}</ul></section>
    </div>`;
    if (first || !document.querySelector('[data-fin-case]')) { ctx.modal(`${esc(c.number)} · ${esc(c.customer)}`, body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`); document.querySelector('#overlay-root .modal')?.classList.add('modal-wide'); }
    else document.querySelector('[data-fin-case]').outerHTML = body;
    if (c.canWork) window.WorkOSUpload?.register('fin-files', { lang:lang(), accept:FILE_MIME, multiple:true, maxBytes:10 * 1024 * 1024, onFiles:async files => {
      window.WorkOSUpload.status('fin-files', tr('上传中…', 'Uploading…'));
      try { await uploadFiles(c.id, files); ctx.toast?.(tr('已上传', 'Uploaded')); await refreshDetail(); } catch (e) { window.WorkOSUpload.status('fin-files', e.message || tr('上传失败', 'Upload failed'), true); }
    } });
  }

  const formError = (f, msg) => { const p = f.querySelector('.wms-error'); if (p) p.textContent = msg || ''; };
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-fin]'); if (!b || !ctx) return;
    const act = b.dataset.fin;
    if (act === 'open') { e.preventDefault(); return openInvoice(b.dataset.id); }
    if (act === 'tab') { ui.view = b.dataset.v; return ctx.rerender(); }
    if (act === 'status') { ui.status = b.dataset.v; return ctx.rerender(); }
    if (act === 'new') { return newInvoice(); }
    if (act === 'unpend') { pending.splice(Number(b.dataset.i), 1); return paintPending(); }
    if (act === 'access') {
      const p = access.people.find(x => x.id === b.dataset.user), before = p.level; if (before === b.dataset.v) return;
      p.level = b.dataset.v; ctx.rerender();
      try { await ctx.api.post('/finance/access', { userId:p.id, level:b.dataset.v }); ctx.toast?.(tr('已保存', 'Saved')); } catch (x) { p.level = before; ctx.toast?.(x.message); ctx.rerender(); }
      return;
    }
    if (!detail || busy) return;
    const base = `/finance/receivables/${encodeURIComponent(detail.id)}`;
    busy = true;
    try {
      if (act === 'clear') await ctx.api.post(`${base}/payments/${encodeURIComponent(b.dataset.pay)}`, { state:'cleared' });
      else if (act === 'unpay') { if (!window.confirm(tr('删除这笔收款记录？', 'Delete this payment?'))) return; await ctx.api.post(`${base}/payments/${encodeURIComponent(b.dataset.pay)}/delete`, {}); }
      else if (act === 'unfile') { if (!window.confirm(tr('删除这个附件？', 'Delete this file?'))) return; await ctx.api.post(`${base}/files/${encodeURIComponent(b.dataset.file)}/delete`, {}); }
      else if (act === 'archive') {
        if (!window.confirm(tr(`删除 ${detail.number}？删除后不再出现在列表和统计里。`, `Delete ${detail.number}? It leaves the list and the totals.`))) return;
        await ctx.api.post(`${base}/archive`, {}); detail = null; ctx.closeOverlay?.(); data = null; load(); ctx.toast?.(tr('已删除', 'Deleted')); return;
      } else return;
      await refreshDetail();
    } catch (x) { ctx.toast?.(x.message || tr('操作失败', 'Something went wrong')); }
    finally { busy = false; }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || !['fin-new', 'fin-edit', 'fin-pay', 'fin-note'].includes(f.id)) return;
    e.preventDefault(); if (busy) return; busy = true; formError(f, '');
    const btn = f.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
    try {
      if (f.id === 'fin-new') {
        const r = await ctx.api.post('/finance/receivables', readForm(f));
        if (pending.length) await uploadFiles(r.id, pending); pending = [];
        ctx.toast?.(tr(`已建 ${r.number}`, `${r.number} created`)); data = null; load(); await openInvoice(r.id);
      } else if (f.id === 'fin-edit') { await ctx.api.patch(`/finance/receivables/${encodeURIComponent(detail.id)}`, readForm(f)); ctx.toast?.(tr('已保存', 'Saved')); await refreshDetail(); }
      else if (f.id === 'fin-pay') { const v = Object.fromEntries(new FormData(f).entries()); await ctx.api.post(`/finance/receivables/${encodeURIComponent(detail.id)}/payments`, { receivedOn:v.receivedOn, amount:Number(v.amount), method:v.method, state:v.state, reference:v.reference.trim() || undefined }); ctx.toast?.(tr('已记录收款', 'Payment recorded')); await refreshDetail(); }
      else if (f.id === 'fin-note') { await ctx.api.post(`/finance/receivables/${encodeURIComponent(detail.id)}/notes`, { body:f.querySelector('[name="body"]').value.trim() }); await refreshDetail(); }
    } catch (x) { formError(f, x.message || tr('保存失败', 'Could not save')); if (btn) btn.disabled = false; }
    finally { busy = false; }
  });
  document.addEventListener('input', e => {
    if (!e.target.matches?.('[data-fin-q]')) return;
    ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender(); const n = document.querySelector('[data-fin-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.matches?.('[data-fin-owner]')) { ui.owner = el.value; return ctx.rerender(); }
    const form = el.form; if (!form || !['fin-new', 'fin-edit'].includes(form.id)) return;
    if (el.matches('[data-fin-shipped]')) form.querySelector('[data-fin-shipdate]').hidden = el.value !== 'yes';
    if (el.matches('[data-fin-term]')) form.querySelector('[data-fin-days]').hidden = el.value !== 'custom';
    if (el.matches('[data-fin-due-src]')) {
      // Due date = invoice date + term days, filled in for you (still editable).
      const inv = form.querySelector('[name="invoiceDate"]').value, term = form.querySelector('[name="paymentTerm"]').value;
      const days = term === 'custom' ? Number(form.querySelector('[name="termDays"]').value) : TERM_DAYS[term];
      if (inv && Number.isFinite(days)) { const d = new Date(inv + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); form.querySelector('[data-fin-due]').value = d.toISOString().slice(0, 10); }
    }
  });

  window.WorkOSFinance = { configure, render, reset };
})();
