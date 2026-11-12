/*
 * Dealer orders (经销商订单), staff side of the dealer portal.
 *
 * Dealers apply on /dealer/, a colleague approves them here, they order at dealer prices and pay by
 * ACH through Stripe. Orders ship once the ACH payment has cleared (or, for a dealer an administrator
 * has marked as trusted, while it is still clearing). Shipping records the carrier and tracking
 * number, emails the dealer and takes the goods out of WMS stock with the order number as reference.
 *
 * Data comes from /dealer-admin/* (server). Access: ERP permissions → 经销商 (view / manage).
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '';
  const ui = { tab:'orders', status:'to_ship', q:'', accountStatus:'' };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const usd = c => (Number(c) / 100).toLocaleString('en-US', { style:'currency', currency:'USD' });
  const when = iso => iso ? new Date(iso).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  const STATUS = () => ({
    pending_payment:[tr('待付款', 'Awaiting payment'), ''], processing:[tr('ACH 处理中', 'ACH clearing'), 'pending'], paid:[tr('已付款·待发货', 'Paid · to ship'), 'in'],
    payment_failed:[tr('付款失败', 'Payment failed'), 'rejected'], shipped:[tr('已发货', 'Shipped'), 'done'], cancelled:[tr('已取消', 'Cancelled'), ''],
    disputed:[tr('争议/退回', 'Disputed'), 'rejected'], refunded:[tr('已退款', 'Refunded'), ''],
  });
  const ACCOUNT = () => ({ pending:[tr('待审核', 'Pending'), 'pending'], approved:[tr('已开通', 'Approved'), 'done'], rejected:[tr('已驳回', 'Rejected'), 'rejected'], suspended:[tr('已停用', 'Suspended'), 'rejected'] });
  const EVENTS = () => ({ created:tr('经销商下单', 'Order placed'), checkout_started:tr('打开付款页', 'Payment page opened'), processing:tr('ACH 已发起', 'ACH started'), paid:tr('款项到账', 'Payment cleared'),
    payment_failed:tr('付款失败', 'Payment failed'), payment_rejected:tr('付款事件金额不符，已拦截', 'Payment event rejected (amount mismatch)'), shipped:tr('已发货', 'Shipped'), cancelled:tr('已取消', 'Cancelled'),
    disputed:tr('付款争议/退回', 'Payment disputed'), refunded:tr('已退款', 'Refunded'), partial_refund:tr('部分退款', 'Partial refund') });
  const CARRIERS = () => ({ ups:'UPS', fedex:'FedEx', usps:'USPS', dhl:'DHL', freight:tr('货运 (LTL)', 'Freight (LTL)'), other:tr('其他', 'Other') });
  const badge = ([label, cls]) => `<span class="wms-state ${cls}">${esc(label)}</span>`;
  const addr = a => a ? [a.name, a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>') : '';

  function configure(next) { ctx = next; }
  function reset() { data = null; loading = false; error = ''; Object.assign(ui, { tab:'orders', status:'to_ship', q:'', accountStatus:'' }); }
  async function load() {
    if (loading) return; loading = true;
    try {
      const qs = new URLSearchParams({ ...(ui.status ? { status:ui.status } : {}), ...(ui.q.trim() ? { q:ui.q.trim() } : {}) }).toString();
      const [summary, orders, accounts] = await Promise.all([ctx.api.get('/dealer-admin/summary'), ctx.api.get('/dealer-admin/orders' + (qs ? '?' + qs : '')), ctx.api.get('/dealer-admin/accounts' + (ui.accountStatus ? '?status=' + ui.accountStatus : ''))]);
      data = { summary, orders:orders.items, accounts:accounts.items }; error = '';
    } catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }
  const reload = () => { data = data && { ...data, stale:true }; load(); };

  function render() {
    if (!data && !error) { load(); return `<div class="wms"><p class="wms-hint">${tr('正在读取经销商订单…', 'Loading dealer orders…')}</p></div>`; }
    if (error && !data) return `<div class="wms"><div class="wms-alert">${esc(error)}</div></div>`;
    const s = data.summary;
    return `<div class="wms dealers">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · DEALERS</div><h1>${tr('经销商订单', 'Dealer orders')}</h1><p>${tr('经销商在 /dealer/ 申请账户、按经销商价下单并用 ACH 付款。在这里审核经销商、确认到账后发货并填写物流单号，经销商会收到邮件并在门户里看到物流。', 'Dealers apply on /dealer/, order at dealer prices and pay by ACH. Review dealers here, ship once payment clears and record tracking; the dealer is emailed and sees it in the portal.')}</p></div>
        <div class="heading-actions">${window.WorkOSErpAccess?.button?.('dealers') || ''}<a class="btn" href="/dealer/" target="_blank" rel="noopener">${icon('arrow-square-out')} ${tr('打开经销商门户', 'Open dealer portal')}</a></div></div>
      ${!s.payments ? `<div class="wms-note">${icon('info')} ${tr('还没有配置 Stripe，经销商暂时不能在线付款。', 'Stripe is not configured; dealers cannot pay online yet.')}</div>` : s.paymentMode === 'test' ? `<div class="wms-note">${icon('flask')} ${tr('Stripe 测试模式：付款不会真实扣款。', 'Stripe test mode: no real money moves.')}</div>` : ''}
      ${s.canManage ? '' : `<div class="wms-note">${icon('eye')} ${tr('你的经销商权限是“查看”：可以看订单和经销商，不能审核或发货。', 'You have view access: you can see orders and dealers but not approve or ship.')}</div>`}
      <div class="wms-kpis">
        <button class="wms-kpi ${s.pendingAccounts ? 'warn' : ''}" data-dl="goto" data-tab="accounts" data-v="pending"><span>${tr('待审核经销商', 'Dealers to review')}</span><b>${s.pendingAccounts}</b><em>${tr('个申请', 'applications')}</em></button>
        <button class="wms-kpi ${s.toShip ? 'warn' : ''}" data-dl="goto" data-tab="orders" data-v="to_ship"><span>${tr('待发货', 'To ship')}</span><b>${s.toShip}</b><em>${tr('单', 'orders')}</em></button>
        <button class="wms-kpi" data-dl="goto" data-tab="orders" data-v="processing"><span>${tr('ACH 到账中', 'ACH clearing')}</span><b>${s.processing}</b><em>${tr('约 4 个工作日', '≈ 4 business days')}</em></button>
        <button class="wms-kpi ${s.disputed ? 'warn' : ''}" data-dl="goto" data-tab="orders" data-v="disputed"><span>${tr('争议/退回', 'Disputed')}</span><b>${s.disputed}</b><em>${tr('需人工处理', 'need a person')}</em></button></div>
      <div class="wms-tabs"><button class="${ui.tab === 'orders' ? 'on' : ''}" data-dl="tab" data-v="orders">${icon('receipt')} ${tr('订单', 'Orders')}</button><button class="${ui.tab === 'accounts' ? 'on' : ''}" data-dl="tab" data-v="accounts">${icon('storefront')} ${tr('经销商', 'Dealers')}</button></div>
      ${error ? `<div class="wms-alert">${esc(error)}</div>` : ''}
      ${ui.tab === 'orders' ? ordersTable() : accountsTable()}</div>`;
  }
  function ordersTable() {
    const opts = [['to_ship', tr('待发货', 'To ship')], ['', tr('全部', 'All')], ...Object.entries(STATUS()).map(([k, [l]]) => [k, l])];
    return `<div class="wms-toolbar"><label class="wms-search">${icon('magnifying-glass')}<input data-dl-search value="${esc(ui.q)}" placeholder="${tr('订单号、经销商、PO、物流单号', 'Order, dealer, PO, tracking')}"></label>
        <select data-dl-status aria-label="${tr('状态', 'Status')}">${opts.map(([v, l]) => `<option value="${v}" ${ui.status === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>${tr('订单', 'Order')}</th><th>${tr('经销商', 'Dealer')}</th><th>${tr('下单时间', 'Placed')}</th><th class="num">${tr('金额', 'Total')}</th><th>${tr('状态', 'Status')}</th><th>${tr('物流', 'Tracking')}</th></tr></thead><tbody>
      ${data.orders.length ? data.orders.map(o => `<tr class="dl-row" data-dl="order" data-id="${esc(o.id)}" tabindex="0"><td><b>${esc(o.number)}</b>${o.poNumber ? `<div class="wms-sub">PO ${esc(o.poNumber)}</div>` : ''}</td><td>${esc(o.dealer.company || o.dealer.email)}</td><td>${when(o.createdAt)}</td><td class="num">${usd(o.totalCents)}</td>
        <td>${badge(STATUS()[o.status] || [o.status, ''])}${o.canShip && o.status === 'processing' ? ` <span class="wms-sub">${tr('可先发货', 'trusted')}</span>` : ''}</td><td>${o.trackingNumber ? `${esc(CARRIERS()[o.carrier] || '')} ${esc(o.trackingNumber)}` : '—'}</td></tr>`).join('')
        : `<tr><td colspan="6" class="wms-hint">${tr('没有符合条件的订单。', 'No orders match.')}</td></tr>`}</tbody></table></div>`;
  }
  function accountsTable() {
    const opts = [['', tr('全部', 'All')], ...Object.entries(ACCOUNT()).map(([k, [l]]) => [k, l])];
    return `<div class="wms-toolbar"><select data-dl-account-status aria-label="${tr('状态', 'Status')}">${opts.map(([v, l]) => `<option value="${v}" ${ui.accountStatus === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>${tr('公司', 'Company')}</th><th>${tr('联系人', 'Contact')}</th><th>${tr('地区', 'Location')}</th><th>${tr('状态', 'Status')}</th><th class="num">${tr('订单', 'Orders')}</th><th class="num">${tr('已付金额', 'Paid')}</th><th>${tr('申请时间', 'Applied')}</th></tr></thead><tbody>
      ${data.accounts.length ? data.accounts.map(a => `<tr class="dl-row" data-dl="account" data-id="${esc(a.id)}" tabindex="0"><td><b>${esc(a.company || tr('（未填公司资料）', '(no company details yet)'))}</b>${a.shipBeforeClear ? ` <span class="wms-sub">${tr('信任·可先发货', 'trusted')}</span>` : ''}</td>
        <td>${esc(a.contactName)}<div class="wms-sub">${esc(a.email)} · ${a.signIn === 'google' ? 'Google' : tr('邮箱密码', 'Password')}</div></td><td>${esc([a.address?.city, a.address?.state].filter(Boolean).join(', '))}</td>
        <td>${badge(ACCOUNT()[a.status])}</td><td class="num">${a.orders}</td><td class="num">${usd(a.paidCents)}</td><td>${when(a.createdAt)}</td></tr>`).join('')
        : `<tr><td colspan="7" class="wms-hint">${tr('还没有经销商。', 'No dealers yet.')}</td></tr>`}</tbody></table></div>`;
  }

  async function openOrder(id) {
    let o; try { o = await ctx.api.get('/dealer-admin/orders/' + encodeURIComponent(id)); } catch (e) { ctx.toast?.(e.message); return; }
    const s = data.summary, manage = s.canManage, unpaid = ['pending_payment', 'payment_failed'].includes(o.status);
    const shipForm = manage && o.canShip ? `<form id="dl-ship" class="wms-form" data-id="${esc(o.id)}" data-version="${o.version}"><h3>${icon('truck')} ${tr('发货', 'Ship')}</h3>
      ${o.status === 'processing' ? `<div class="wms-note">${icon('warning')} ${tr('ACH 款项还在到账中，这个经销商被管理员设为“可先发货”。款项仍可能被退回。', 'ACH is still clearing; an administrator lets this dealer ship early. The payment can still be returned.')}</div>` : ''}
      <div class="dl-grid"><label>${tr('承运商', 'Carrier')}<select name="carrier">${Object.entries(CARRIERS()).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      <label>${tr('物流单号', 'Tracking number')}<input name="trackingNumber" required minlength="3" maxlength="100"></label>
      <label class="full">${tr('物流查询链接（选填，UPS/FedEx/USPS/DHL 自动生成）', 'Tracking link (optional; built automatically for UPS/FedEx/USPS/DHL)')}<input name="trackingUrl" type="url" placeholder="https://"></label>
      <label class="dl-check"><input type="checkbox" name="deductStock" checked> ${tr('从库存扣减', 'Take out of stock')}</label>
      <label>${tr('出库库位', 'From location')}<select name="location">${s.locations.map(l => `<option value="${esc(l.id)}">${esc(lang() === 'en' ? l.en : l.zh)}</option>`).join('')}</select></label></div>
      <div class="wms-error"></div></form>` : '';
    const body = `<div class="dealers-detail">
      <div class="dl-head">${badge(STATUS()[o.status] || [o.status, ''])} <b>${usd(o.totalCents)}</b> · ${when(o.createdAt)}${o.poNumber ? ` · PO ${esc(o.poNumber)}` : ''}${o.paymentMode === 'test' ? ` · <span class="wms-sub">Stripe test</span>` : ''}</div>
      ${o.status === 'processing' && !o.canShip ? `<div class="wms-note">${icon('hourglass')} ${tr('ACH 款项还在到账中（约 4 个工作日），到账后这里会出现发货表单。', 'The ACH payment is still clearing (about 4 business days); the shipping form appears once it clears.')}</div>` : ''}
      ${o.status === 'disputed' ? `<div class="wms-alert">${tr('这笔 ACH 付款被争议或退回，请在 Stripe 后台处理，必要时联系经销商。', 'This ACH payment was disputed or returned. Handle it in Stripe and contact the dealer if needed.')}</div>` : ''}
      <div class="dl-grid"><div><h3>${tr('经销商', 'Dealer')}</h3><p>${esc(o.dealer.company)}<br>${esc(o.dealer.contactName)} · ${esc(o.dealer.phone)}<br>${esc(o.dealer.email)}${o.dealer.resaleCert ? `<br>${tr('转售证书', 'Resale cert')} ${esc(o.dealer.resaleCert)}` : ''}</p></div>
        <div><h3>${tr('收货地址', 'Ship to')}</h3><p>${addr(o.shipTo)}</p></div></div>
      ${o.note ? `<h3>${tr('经销商备注', 'Dealer note')}</h3><p>${esc(o.note)}</p>` : ''}
      <table class="wms-table"><thead><tr><th>SKU</th><th>${tr('产品', 'Product')}</th><th class="num">${tr('单价', 'Price')}</th><th class="num">${tr('数量', 'Qty')}</th><th class="num">${tr('小计', 'Total')}</th></tr></thead><tbody>
        ${o.lines.map(l => `<tr><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td class="num">${usd(l.unitCents)}</td><td class="num">${l.qty}</td><td class="num">${usd(l.lineCents)}</td></tr>`).join('')}</tbody></table>
      ${o.trackingNumber ? `<p><b>${tr('物流', 'Tracking')}:</b> ${esc(CARRIERS()[o.carrier] || '')} ${o.trackingUrl ? `<a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener noreferrer">${esc(o.trackingNumber)}</a>` : esc(o.trackingNumber)} · ${when(o.shippedAt)}${o.stockLocation ? ` · ${tr('已从库存扣减', 'stock deducted')} (${esc(o.stockLocation)})` : ''}</p>` : ''}
      ${shipForm}
      ${manage && unpaid ? `<form id="dl-cancel" class="wms-form" data-id="${esc(o.id)}" data-version="${o.version}"><h3>${tr('取消订单', 'Cancel order')}</h3><label>${tr('原因', 'Reason')}<input name="reason" required maxlength="1000"></label><div class="wms-error"></div><button class="btn">${tr('取消这个未付款订单', 'Cancel this unpaid order')}</button></form>` : ''}
      <h3>${tr('记录', 'History')}</h3><ul class="dl-events">${o.events.map(e => `<li><b>${esc(EVENTS()[e.type] || e.type)}</b> · ${esc(e.byName)} <span class="wms-sub">${when(e.at)}</span>${e.details?.reason ? ` — ${esc(e.details.reason)}` : ''}</li>`).join('')}</ul></div>`;
    ctx.modal(`${esc(o.number)} · ${esc(o.dealer.company)}`, body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>${shipForm ? `<button class="btn primary" form="dl-ship">${tr('确认发货并通知经销商', 'Ship and notify dealer')}</button>` : ''}`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
  }
  function openAccount(id) {
    const a = data.accounts.find(x => x.id === id); if (!a) return;
    const s = data.summary, act = (v, label, cls = '') => `<button class="btn ${cls}" data-dl="decide" data-v="${v}" data-id="${esc(a.id)}">${label}</button>`;
    const actions = !s.canManage ? '' : a.status === 'pending' ? act('approve', tr('批准', 'Approve'), 'primary') + act('reject', tr('驳回', 'Reject')) : a.status === 'approved' ? act('suspend', tr('停用', 'Suspend')) : act('reactivate', tr('恢复开通', 'Reactivate'), 'primary');
    const body = `<div class="dealers-detail"><div class="dl-head">${badge(ACCOUNT()[a.status])} ${a.signIn === 'google' ? 'Google' : tr('邮箱密码注册', 'Password sign-up')} · ${tr('申请于', 'applied')} ${when(a.createdAt)}</div>
      ${a.profileComplete ? '' : `<div class="wms-note">${icon('info')} ${tr('经销商还没有填完公司资料，填完后才能批准。', 'The dealer has not completed their company details; they can be approved once complete.')}</div>`}
      <div class="dl-grid"><div><h3>${tr('公司', 'Company')}</h3><p>${esc(a.company)}<br>${a.website ? esc(a.website) + '<br>' : ''}${tr('转售证书', 'Resale cert')}: ${esc(a.resaleCert || '—')}</p></div>
        <div><h3>${tr('联系人', 'Contact')}</h3><p>${esc(a.contactName)}<br>${esc(a.phone)}<br>${esc(a.email)}</p></div>
        <div><h3>${tr('地址', 'Address')}</h3><p>${addr(a.address)}</p></div>
        <div><h3>${tr('往来', 'History')}</h3><p>${a.orders} ${tr('单', 'orders')} · ${tr('已付', 'paid')} ${usd(a.paidCents)}</p>${a.decisionNote ? `<p class="wms-sub">${tr('审核说明', 'Decision note')}: ${esc(a.decisionNote)}</p>` : ''}</div></div>
      ${s.canManage ? `<label class="dl-full">${tr('审核说明（驳回或停用时必填，驳回时会发给经销商）', 'Decision note (required to reject or suspend; sent to the dealer on rejection)')}<input id="dl-note" maxlength="1000"></label>` : ''}
      ${s.canTrust && a.status === 'approved' ? `<label class="dl-check"><input type="checkbox" data-dl="trust" data-id="${esc(a.id)}" ${a.shipBeforeClear ? 'checked' : ''}> ${tr('信任：ACH 到账前就可以发货（款项仍可能被退回，只对长期合作的经销商开启）', 'Trusted: may ship before ACH clears (the payment can still be returned; long-standing dealers only)')}</label>` : a.shipBeforeClear ? `<p>${tr('已设为信任，可先发货', 'Trusted: ships before ACH clears')}</p>` : ''}
      ${s.canManage ? `<label class="dl-full">${tr('内部备注（经销商看不到）', 'Internal note (not shown to the dealer)')}<textarea id="dl-staff-note" rows="2" maxlength="2000">${esc(a.staffNote)}</textarea></label><button class="btn small" data-dl="save-note" data-id="${esc(a.id)}">${tr('保存备注', 'Save note')}</button>` : a.staffNote ? `<p>${esc(a.staffNote)}</p>` : ''}
      <div class="wms-error" id="dl-account-error"></div></div>`;
    ctx.modal(esc(a.company || a.email), body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>${actions}`);
  }
  const accountError = msg => { const el = document.getElementById('dl-account-error'); if (el) el.textContent = msg; else ctx.toast?.(msg); };
  async function patchAccount(id, body) { return ctx.api.request('/dealer-admin/accounts/' + encodeURIComponent(id), { method:'PATCH', body }); }

  document.addEventListener('click', async e => {
    const el = e.target.closest?.('[data-dl]'); if (!el || !ctx || el.tagName === 'INPUT') return;
    const a = el.dataset.dl;
    if (a === 'tab') { ui.tab = el.dataset.v; ctx.rerender(); return; }
    if (a === 'goto') { ui.tab = el.dataset.tab; if (ui.tab === 'orders') ui.status = el.dataset.v; else ui.accountStatus = el.dataset.v; reload(); return; }
    if (a === 'order') { openOrder(el.dataset.id); return; }
    if (a === 'account') { openAccount(el.dataset.id); return; }
    if (a === 'decide') {
      const acc = data.accounts.find(x => x.id === el.dataset.id), note = document.getElementById('dl-note')?.value.trim() || '';
      if ((el.dataset.v === 'reject' || el.dataset.v === 'suspend') && !note) { accountError(tr('驳回或停用请填写原因。', 'Give a reason to reject or suspend.')); return; }
      try { await ctx.api.post(`/dealer-admin/accounts/${encodeURIComponent(acc.id)}/decision`, { action:el.dataset.v, note, expectedVersion:acc.version }); ctx.closeOverlay(); ctx.toast?.(tr('已保存', 'Saved')); reload(); }
      catch (x) { accountError(x.message); }
      return;
    }
    if (a === 'save-note') {
      const acc = data.accounts.find(x => x.id === el.dataset.id);
      try { await patchAccount(acc.id, { staffNote:document.getElementById('dl-staff-note').value, expectedVersion:acc.version }); ctx.closeOverlay(); ctx.toast?.(tr('备注已保存', 'Note saved')); reload(); }
      catch (x) { accountError(x.message); }
    }
  });
  document.addEventListener('change', async e => {
    const t = e.target; if (!ctx) return;
    if (t.matches?.('[data-dl-status]')) { ui.status = t.value; reload(); return; }
    if (t.matches?.('[data-dl-account-status]')) { ui.accountStatus = t.value; reload(); return; }
    if (t.matches?.('[data-dl="trust"]')) {
      const acc = data.accounts.find(x => x.id === t.dataset.id);
      if (t.checked && !confirm(tr('确定允许这个经销商在 ACH 到账前发货？ACH 到账后 60 天内仍可能被退回。', 'Let this dealer ship before ACH clears? ACH payments can be returned for up to 60 days.'))) { t.checked = false; return; }
      try { await patchAccount(acc.id, { shipBeforeClear:t.checked, expectedVersion:acc.version }); ctx.closeOverlay(); ctx.toast?.(tr('已保存', 'Saved')); reload(); }
      catch (x) { t.checked = !t.checked; accountError(x.message); }
    }
  });
  let searchTimer = null;
  document.addEventListener('input', e => {
    if (!ctx || !e.target.matches?.('[data-dl-search]')) return;
    ui.q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(reload, 300);
  });
  document.addEventListener('keydown', e => { if (ctx && e.key === 'Enter' && e.target.matches?.('tr.dl-row')) e.target.click(); });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || (f.id !== 'dl-ship' && f.id !== 'dl-cancel')) return;
    e.preventDefault(); const err = f.querySelector('.wms-error'); err.textContent = '';
    const btn = document.querySelector(`button[form="${f.id}"]`) || f.querySelector('button'); if (btn) btn.disabled = true;
    try {
      if (f.id === 'dl-ship') {
        await ctx.api.post(`/dealer-admin/orders/${encodeURIComponent(f.dataset.id)}/ship`, { carrier:f.carrier.value, trackingNumber:f.trackingNumber.value.trim(), trackingUrl:f.trackingUrl.value.trim() || undefined,
          deductStock:f.deductStock.checked, location:f.location.value, expectedVersion:Number(f.dataset.version) });
        ctx.toast?.(tr('已发货，已通知经销商', 'Shipped; the dealer has been notified'));
      } else {
        await ctx.api.post(`/dealer-admin/orders/${encodeURIComponent(f.dataset.id)}/cancel`, { reason:f.reason.value.trim(), expectedVersion:Number(f.dataset.version) });
        ctx.toast?.(tr('订单已取消', 'Order cancelled'));
      }
      ctx.closeOverlay(); reload();
    } catch (x) { err.textContent = x.message || tr('保存失败', 'Could not save'); if (btn) btn.disabled = false; }
  });

  window.WorkOSDealers = { configure, render, reset };
})();
