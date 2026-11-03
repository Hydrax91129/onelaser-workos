/*
 * OneLaser dealer portal.
 *
 * Dealers sign up with email + password or Google, wait for OneLaser to approve them, then see
 * dealer prices, place orders and pay by bank (ACH, on Stripe's hosted page). After we ship, the
 * order shows the carrier and tracking number.
 *
 * Data comes from /api/dealer/* (server). The dealer session is an httpOnly cookie; writes send the
 * CSRF token from /dealer/me. Prices are shown for information only: the server prices every order.
 */
(() => {
  'use strict';
  const root = document.getElementById('dealer-app');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const params = new URLSearchParams(location.search);
  const state = {
    lang: params.get('lang') === 'zh' || (!params.get('lang') && store.get('dealer-lang') === 'zh') ? 'zh' : 'en',
    caps: null, me: null, products: null, orders: null, order: null, q: '', authTab: 'signin', banner: null, error: '', busy: false,
    cart: (() => { try { return new Map(JSON.parse(store.get('dealer-cart') || '[]')); } catch { return new Map(); } })(),
  };
  const tr = (en, zh) => state.lang === 'zh' ? zh : en;
  const usd = c => (Number(c) / 100).toLocaleString('en-US', { style:'currency', currency:'USD' });
  const when = iso => iso ? new Date(iso).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '';
  const saveCart = () => store.set('dealer-cart', JSON.stringify([...state.cart]));

  /* ---------- API ---------- */
  async function api(path, { method = 'GET', body } = {}) {
    const writing = method !== 'GET';
    const res = await fetch('/api/dealer' + path, {
      method, credentials:'same-origin', cache:'no-store',
      headers: { Accept:'application/json', 'Accept-Language':state.lang, ...(body === undefined ? {} : { 'Content-Type':'application/json' }), ...(writing && state.me ? { 'X-CSRF-Token':state.me.csrfToken } : {}) },
      ...(body === undefined ? {} : { body:JSON.stringify(body) }),
    });
    let value = null; try { value = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(value?.error?.message || tr('Something went wrong. Please try again.', '出错了，请重试。')); e.status = res.status; e.code = value?.error?.code; throw e; }
    return value;
  }
  async function loadMe() {
    try { state.me = await api('/me'); }
    catch (e) { if (e.status !== 401) state.error = e.message; state.me = null; }
  }

  /* ---------- labels ---------- */
  const STATUS = () => ({
    pending_payment: [tr('Awaiting payment', '待付款'), 'red', tr('Pay by bank transfer (ACH) to confirm this order.', '用银行转账（ACH）付款后订单才会确认。')],
    processing: [tr('Payment processing', '付款处理中'), 'warn', tr('Your ACH payment has started. Bank transfers usually take about 4 business days to clear.', 'ACH 付款已发起，银行转账通常约 4 个工作日到账。')],
    paid: [tr('Paid · preparing shipment', '已付款 · 备货中'), 'ok', tr('Payment received. We will ship soon and add the tracking number here.', '已收到付款，我们会尽快发货并在这里更新物流单号。')],
    payment_failed: [tr('Payment failed', '付款失败'), 'bad', tr('Your bank did not complete the payment. You can pay again.', '银行没有完成这笔付款，可以重新付款。')],
    shipped: [tr('Shipped', '已发货'), 'ok', ''],
    cancelled: [tr('Cancelled', '已取消'), '', ''],
    disputed: [tr('On hold', '暂停处理'), 'bad', tr('There is a problem with this payment. We will contact you.', '这笔付款出现问题，我们会联系你。')],
    refunded: [tr('Refunded', '已退款'), '', ''],
  });
  const statusBadge = s => `<span class="badge ${STATUS()[s]?.[1] || ''}">${esc(STATUS()[s]?.[0] || s)}</span>`;
  const AVAIL = () => ({ in_stock:[tr('In stock', '有货'), 'ok'], limited:[tr('Limited stock', '库存紧张'), 'warn'], backorder:[tr('Backorder', '需预订'), ''] });
  const EVENTS = () => ({ created:tr('Order placed', '下单'), checkout_started:tr('Payment page opened', '打开付款页'), processing:tr('ACH payment started', 'ACH 付款已发起'), paid:tr('Payment cleared', '款项到账'),
    payment_failed:tr('Payment failed', '付款失败'), shipped:tr('Shipped', '已发货'), cancelled:tr('Cancelled', '已取消'), disputed:tr('Payment on hold', '付款暂停'), refunded:tr('Refunded', '已退款') });
  const CARRIER = () => ({ ups:'UPS', fedex:'FedEx', usps:'USPS', dhl:'DHL', freight:tr('Freight', '货运'), other:tr('Carrier', '承运商') });
  const NOTICE = () => ({
    oauth_cancelled: ['info', tr('Google sign-in was cancelled.', 'Google 登录已取消。')],
    oauth_failed: ['bad', tr('Google sign-in did not work. Please try again or use email.', 'Google 登录失败，请重试或用邮箱登录。')],
    email_in_use: ['bad', tr('An account with this email already exists. Sign in with your email and password.', '这个邮箱已有账户，请用邮箱和密码登录。')],
  });

  /* ---------- views ---------- */
  function top() {
    const d = state.me?.dealer, approved = d?.status === 'approved', view = route().view, n = [...state.cart.values()].reduce((s, q) => s + q, 0);
    return `<header class="dp-top"><img src="../assets/onelaser-logo-black.svg" alt="OneLaser"><span class="dp-title">${tr('Dealer Portal', '经销商门户')}</span>
      ${approved ? `<nav aria-label="${tr('Portal', '门户')}"><a href="#catalog" class="${view === 'catalog' ? 'on' : ''}">${tr('Products', '产品')}</a><a href="#cart" class="${view === 'cart' ? 'on' : ''}">${tr('Cart', '购物车')}${n ? ` (${n})` : ''}</a><a href="#orders" class="${view === 'orders' || view === 'order' ? 'on' : ''}">${tr('Orders', '订单')}</a></nav>` : ''}
      <div class="dp-right"><button class="dp-lang" data-act="lang">${state.lang === 'zh' ? 'English' : '中文'}</button>${d ? `<span>${esc(d.company || d.email)}</span><button class="btn small" data-act="signout">${tr('Sign out', '退出')}</button>` : ''}</div></header>`;
  }
  const banner = () => [state.banner && `<div class="dp-alert ${state.banner[0]}">${esc(state.banner[1])}</div>`, state.error && `<div class="dp-alert">${esc(state.error)}</div>`].filter(Boolean).join('');
  const field = (name, label, { type = 'text', value = '', required = true, auto = '', full = false, hint = '' } = {}) =>
    `<label class="dp-field ${full ? 'full' : ''}">${esc(label)}${required ? '' : ` <span class="opt">${tr('(optional)', '（选填）')}</span>`}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${auto ? `autocomplete="${auto}"` : ''}>${hint ? `<span class="dp-muted">${esc(hint)}</span>` : ''}</label>`;
  const addressFields = (a = {}, prefix = '') => `
    ${field(prefix + 'line1', tr('Street address', '街道地址'), { value:a.line1, auto:'address-line1', full:true })}
    ${field(prefix + 'line2', tr('Suite / unit', '单元'), { value:a.line2, required:false, auto:'address-line2', full:true })}
    ${field(prefix + 'city', tr('City', '城市'), { value:a.city, auto:'address-level2' })}
    ${field(prefix + 'state', tr('State', '州'), { value:a.state, auto:'address-level1' })}
    ${field(prefix + 'postalCode', tr('ZIP code', '邮编'), { value:a.postalCode, auto:'postal-code' })}`;
  const companyFields = (d = {}) => `
    ${field('company', tr('Company name', '公司名称'), { value:d.company, auto:'organization', full:true })}
    ${field('contactName', tr('Contact name', '联系人'), { value:d.contactName, auto:'name' })}
    ${field('phone', tr('Phone', '电话'), { type:'tel', value:d.phone, auto:'tel' })}
    ${field('website', tr('Website', '网站'), { value:d.website, required:false, auto:'url' })}
    ${field('resaleCert', tr('Resale certificate #', '转售证书号'), { value:d.resaleCert, required:false, hint:tr('Needed for tax-exempt purchases', '免销售税采购需要') })}
    ${addressFields(d.address || {})}`;
  const readAddress = (f, prefix = '') => {
    const v = k => f.elements[prefix + k]?.value.trim() || undefined;
    return { line1:v('line1'), line2:v('line2'), city:v('city'), state:v('state'), postalCode:v('postalCode'), country:'US' };
  };
  const readProfile = f => ({ company:f.company.value.trim(), contactName:f.contactName.value.trim(), phone:f.phone.value.trim(), website:f.website.value.trim() || undefined, resaleCert:f.resaleCert.value.trim() || undefined, address:readAddress(f) });

  function signedOut() {
    const reg = state.authTab === 'register';
    return `<div class="dp-wrap narrow"><h1>${reg ? tr('Apply for a dealer account', '申请经销商账户') : tr('Dealer sign in', '经销商登录')}</h1>
      <p class="dp-sub">${reg ? tr('We review every application, usually within one business day. You can see dealer pricing once approved.', '每份申请都会人工审核，通常一个工作日内完成。审核通过后可以看到经销商价格。') : tr('Order OneLaser products at dealer pricing and pay by bank transfer.', '按经销商价格订购 OneLaser 产品，银行转账付款。')}</p>
      ${banner()}<div class="dp-card">
      ${state.caps?.providers?.google ? `<a class="btn dp-google" href="/api/dealer/auth/google/start?lang=${state.lang}">${tr('Continue with Google', '使用 Google 登录')}</a><div class="dp-or">${tr('or with email', '或使用邮箱')}</div>` : ''}
      ${reg ? `<form id="dp-register"><div class="dp-grid">
          ${field('email', tr('Work email', '邮箱'), { type:'email', auto:'email', full:true })}
          ${field('password', tr('Password (10+ characters)', '密码（至少 10 位）'), { type:'password', auto:'new-password', full:true })}
          ${companyFields()}</div><div class="dp-error"></div>
          <div class="dp-actions"><button class="btn primary" ${state.busy ? 'disabled' : ''}>${tr('Submit application', '提交申请')}</button><button type="button" class="btn link" data-act="auth" data-v="signin">${tr('I already have an account', '我已有账户')}</button></div></form>`
        : `<form id="dp-signin"><div class="dp-grid">${field('email', tr('Email', '邮箱'), { type:'email', auto:'email', full:true })}${field('password', tr('Password', '密码'), { type:'password', auto:'current-password', full:true })}</div><div class="dp-error"></div>
          <div class="dp-actions"><button class="btn primary" ${state.busy ? 'disabled' : ''}>${tr('Sign in', '登录')}</button><button type="button" class="btn link" data-act="auth" data-v="register">${tr('Apply for a dealer account', '申请经销商账户')}</button></div></form>`}
      </div></div>`;
  }

  function notApproved(d) {
    if (d.status === 'rejected') return `<div class="dp-wrap narrow"><h1>${tr('Application not approved', '申请未通过')}</h1>${banner()}<div class="dp-card"><p>${tr('We are not able to approve a dealer account at this time.', '我们暂时无法开通经销商账户。')}</p>${d.decisionNote ? `<p class="dp-muted">${esc(d.decisionNote)}</p>` : ''}<p>${tr('Questions? Email sales@onelaser.com.', '如有疑问请发邮件至 sales@onelaser.com。')}</p></div></div>`;
    if (d.status === 'suspended') return `<div class="dp-wrap narrow"><h1>${tr('Account on hold', '账户已暂停')}</h1><div class="dp-card"><p>${tr('Your dealer account is on hold. Please contact sales@onelaser.com.', '你的经销商账户已暂停，请联系 sales@onelaser.com。')}</p></div></div>`;
    if (!d.profileComplete) return `<div class="dp-wrap"><h1>${tr('Tell us about your business', '填写公司资料')}</h1><p class="dp-sub">${tr('We need your company details before we can review your application.', '我们需要你的公司资料才能开始审核。')}</p>${banner()}
      <form id="dp-profile" class="dp-card"><div class="dp-grid">${companyFields(d)}</div><div class="dp-error"></div><div class="dp-actions"><button class="btn primary">${tr('Submit for review', '提交审核')}</button></div></form></div>`;
    return `<div class="dp-wrap narrow"><h1>${tr('Application under review', '申请审核中')}</h1>${banner()}<div class="dp-card">
      <p>${tr('Thanks, ', '谢谢，')}${esc(d.contactName || d.company)}. ${tr('We are reviewing your dealer application and will email you at', '我们正在审核你的经销商申请，结果会发到')} <b>${esc(d.email)}</b>${tr(' once it is approved.', '。')}</p>
      <p class="dp-muted">${esc(d.company)} · ${esc([d.address?.city, d.address?.state].filter(Boolean).join(', '))}</p>
      <div class="dp-actions"><button class="btn" data-act="refresh">${tr('Check again', '刷新状态')}</button></div></div></div>`;
  }

  function catalog() {
    if (!state.products) { loadProducts(); return `<div class="dp-wrap"><p class="dp-loading">${tr('Loading products…', '正在读取产品…')}</p></div>`; }
    const q = state.q.trim().toLowerCase(), items = state.products.filter(p => !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    return `<div class="dp-wrap"><h1>${tr('Products', '产品')}</h1><p class="dp-sub">${tr('Dealer prices in USD, before freight. Freight is arranged separately.', '经销商价格（美元），不含运费，运费另行安排。')}</p>${banner()}
      <div class="dp-card"><div class="dp-toolbar"><input data-search placeholder="${tr('Search SKU or product', '搜索 SKU 或产品名')}" value="${esc(state.q)}"></div>
      ${items.length ? `<div class="dp-scroll"><table><thead><tr><th>${tr('Product', '产品')}</th><th class="num">MSRP</th><th class="num">${tr('Dealer price', '经销商价')}</th><th>${tr('Availability', '库存')}</th><th class="num">${tr('Qty', '数量')}</th><th></th></tr></thead><tbody>
        ${items.map(p => `<tr><td><div>${esc(p.name)}${p.clearance ? ` <span class="badge red">${tr('Clearance', '清仓')}</span>` : ''}</div><div class="sku">${esc(p.sku)}</div></td>
          <td class="num dp-muted">${p.msrpCents == null ? '—' : usd(p.msrpCents)}</td><td class="num"><b>${usd(p.priceCents)}</b></td>
          <td><span class="badge ${AVAIL()[p.availability][1]}">${AVAIL()[p.availability][0]}</span></td>
          <td class="num"><input class="qty" type="number" min="1" max="10000" value="${state.cart.get(p.sku) || 1}" data-qty="${esc(p.sku)}" aria-label="${tr('Quantity', '数量')} ${esc(p.sku)}"></td>
          <td><button class="btn small ${state.cart.has(p.sku) ? '' : 'primary'}" data-act="add" data-sku="${esc(p.sku)}">${state.cart.has(p.sku) ? tr('Update', '更新') : tr('Add', '加入')}</button></td></tr>`).join('')}
      </tbody></table></div>` : `<p class="dp-muted">${q ? tr('No products match.', '没有匹配的产品。') : tr('No products are available yet.', '暂时没有可订购的产品。')}</p>`}</div></div>`;
  }

  function cart() {
    if (!state.products) { loadProducts(); return `<div class="dp-wrap"><p class="dp-loading">${tr('Loading…', '正在读取…')}</p></div>`; }
    const lines = [...state.cart].map(([sku, qty]) => ({ p:state.products.find(x => x.sku === sku), sku, qty }));
    const gone = lines.filter(l => !l.p), ok = lines.filter(l => l.p), total = ok.reduce((s, l) => s + l.p.priceCents * l.qty, 0), a = state.me.dealer.address || {};
    return `<div class="dp-wrap"><h1>${tr('Cart', '购物车')}</h1>${banner()}
      ${gone.length ? `<div class="dp-alert info">${tr('Some items are no longer available and were left out:', '以下产品已不可订购，未计入订单：')} ${gone.map(l => esc(l.sku)).join(', ')}</div>` : ''}
      ${!ok.length ? `<div class="dp-card"><p>${tr('Your cart is empty.', '购物车是空的。')}</p><a class="btn" href="#catalog">${tr('Browse products', '浏览产品')}</a></div>` : `
      <form id="dp-order"><div class="dp-card"><div class="dp-scroll"><table><thead><tr><th>${tr('Product', '产品')}</th><th class="num">${tr('Price', '单价')}</th><th class="num">${tr('Qty', '数量')}</th><th class="num">${tr('Total', '小计')}</th><th></th></tr></thead><tbody>
        ${ok.map(l => `<tr><td>${esc(l.p.name)}<div class="sku">${esc(l.sku)}</div></td><td class="num">${usd(l.p.priceCents)}</td>
          <td class="num"><input class="qty" type="number" min="1" max="10000" value="${l.qty}" data-cartqty="${esc(l.sku)}"></td><td class="num">${usd(l.p.priceCents * l.qty)}</td>
          <td><button type="button" class="btn small" data-act="remove" data-sku="${esc(l.sku)}">${tr('Remove', '移除')}</button></td></tr>`).join('')}
      </tbody></table></div><div class="dp-total"><span>${tr('Subtotal', '合计')}</span><span>${usd(total)}</span></div><p class="dp-muted" style="text-align:right">${tr('Freight is not included.', '不含运费。')}</p></div>
      <div class="dp-card"><h2>${tr('Order details', '订单信息')}</h2><div class="dp-grid">
        ${field('poNumber', tr('Your PO number', '你的采购单号'), { required:false })}
        <label class="dp-field full">${tr('Note to OneLaser', '备注')} <span class="opt">${tr('(optional)', '（选填）')}</span><textarea name="note" rows="2" maxlength="1000"></textarea></label>
        <div class="full"><b>${tr('Ship to', '收货地址')}</b><p class="dp-muted" style="margin:4px 0 8px">${esc([state.me.dealer.company, a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</p>
          <label><input type="checkbox" name="otherAddress" data-act="other-address" style="width:auto"> ${tr('Ship to a different address', '寄到其他地址')}</label></div>
        <div class="full dp-grid" data-other hidden>${field('ship_name', tr('Recipient', '收货人'), { required:false, full:true })}${addressFields({}, 'ship_').replace(/ required/g, ' data-req')}</div>
      </div><div class="dp-error"></div><div class="dp-actions"><button class="btn primary" ${state.busy ? 'disabled' : ''}>${tr('Place order', '提交订单')} · ${usd(total)}</button><span class="dp-muted">${tr('You will pay by bank transfer (ACH) on the next step.', '下一步用银行转账（ACH）付款。')}</span></div></div></form>`}</div>`;
  }

  function orders() {
    if (!state.orders) { loadOrders(); return `<div class="dp-wrap"><p class="dp-loading">${tr('Loading orders…', '正在读取订单…')}</p></div>`; }
    return `<div class="dp-wrap"><h1>${tr('Orders', '订单')}</h1>${banner()}<div class="dp-card">
      ${state.orders.length ? `<div class="dp-scroll"><table><thead><tr><th>${tr('Order', '订单')}</th><th>${tr('Placed', '下单时间')}</th><th>PO</th><th>${tr('Status', '状态')}</th><th class="num">${tr('Total', '金额')}</th><th>${tr('Tracking', '物流')}</th></tr></thead><tbody>
        ${state.orders.map(o => `<tr><td><a href="#order/${esc(o.id)}"><b>${esc(o.number)}</b></a></td><td>${when(o.createdAt)}</td><td>${esc(o.poNumber || '—')}</td><td>${statusBadge(o.status)}</td><td class="num">${usd(o.totalCents)}</td>
          <td>${o.trackingNumber ? (o.trackingUrl ? `<a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener noreferrer">${esc(o.trackingNumber)}</a>` : esc(o.trackingNumber)) : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : `<p>${tr('No orders yet.', '还没有订单。')}</p><a class="btn" href="#catalog">${tr('Browse products', '浏览产品')}</a>`}</div></div>`;
  }

  function order(id) {
    if (state.order?.id !== id) { loadOrder(id); return `<div class="dp-wrap"><p class="dp-loading">${tr('Loading order…', '正在读取订单…')}</p></div>`; }
    const o = state.order, payable = ['pending_payment', 'payment_failed'].includes(o.status), a = o.shipTo || {};
    return `<div class="dp-wrap"><p><a href="#orders">← ${tr('All orders', '全部订单')}</a></p><h1>${tr('Order', '订单')} ${esc(o.number)} ${statusBadge(o.status)}</h1>
      <p class="dp-sub">${tr('Placed', '下单于')} ${when(o.createdAt)}${o.poNumber ? ` · PO ${esc(o.poNumber)}` : ''}</p>${banner()}
      ${STATUS()[o.status]?.[2] ? `<div class="dp-alert ${o.status === 'payment_failed' || o.status === 'disputed' ? '' : o.status === 'paid' ? 'ok' : 'info'}">${esc(STATUS()[o.status][2])}</div>` : ''}
      ${o.status === 'shipped' ? `<div class="dp-card"><h2>${tr('Shipment', '物流')}</h2><p class="dp-tracking">${esc(CARRIER()[o.carrier] || '')} ${o.trackingUrl ? `<a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener noreferrer">${esc(o.trackingNumber)}</a>` : esc(o.trackingNumber)}</p><p class="dp-muted">${tr('Shipped', '发货于')} ${when(o.shippedAt)}</p></div>` : ''}
      <div class="dp-two"><div class="dp-card"><div class="dp-scroll"><table><thead><tr><th>${tr('Product', '产品')}</th><th class="num">${tr('Price', '单价')}</th><th class="num">${tr('Qty', '数量')}</th><th class="num">${tr('Total', '小计')}</th></tr></thead><tbody>
        ${o.lines.map(l => `<tr><td>${esc(l.name)}<div class="sku">${esc(l.sku)}</div></td><td class="num">${usd(l.unitCents)}</td><td class="num">${l.qty}</td><td class="num">${usd(l.lineCents)}</td></tr>`).join('')}
        </tbody></table></div><div class="dp-total"><span>${tr('Total', '合计')}</span><span>${usd(o.totalCents)}</span></div>
        ${payable ? `<div class="dp-actions"><button class="btn primary" data-act="pay" ${state.busy || !state.me.payments ? 'disabled' : ''}>${o.status === 'payment_failed' ? tr('Pay again by bank (ACH)', '重新用银行账户付款（ACH）') : tr('Pay by bank (ACH)', '用银行账户付款（ACH）')}</button><button class="btn" data-act="cancel">${tr('Cancel order', '取消订单')}</button></div>
          ${state.me.payments ? `<p class="dp-muted">${tr('You will connect your business bank account securely through Stripe. ACH payments usually clear in about 4 business days; we ship once the payment clears.', '你将通过 Stripe 安全连接公司银行账户。ACH 付款通常约 4 个工作日到账，到账后我们发货。')}${state.me.paymentMode === 'test' ? ` <b>${tr('Test mode — no real money moves.', '测试模式，不会真实扣款。')}</b>` : ''}</p>` : `<p class="dp-muted">${tr('Online payment is not available yet. We will contact you about payment.', '在线付款暂未开放，我们会联系你付款事宜。')}</p>`}` : ''}
      </div><div><div class="dp-card"><h2>${tr('Ship to', '收货地址')}</h2><p style="margin:0">${esc(a.name || '')}${a.name ? '<br>' : ''}${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.postalCode)}</p></div>
        <div class="dp-card"><h2>${tr('History', '记录')}</h2><ul class="dp-timeline">${(o.events || []).map(e => `<li>${esc(EVENTS()[e.type] || e.type)}<time>${when(e.at)}</time></li>`).join('')}</ul></div></div></div></div>`;
  }

  /* ---------- routing and rendering ---------- */
  function route() { const [view, id] = (location.hash.replace(/^#/, '') || 'catalog').split('/'); return { view:['catalog', 'cart', 'orders', 'order'].includes(view) ? view : 'catalog', id }; }
  function render() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
    const d = state.me?.dealer;
    if (!d) { root.innerHTML = top() + signedOut(); return; }
    if (d.status !== 'approved') { root.innerHTML = top() + notApproved(d); return; }
    const r = route();
    root.innerHTML = top() + ({ catalog, cart, orders, order:() => order(r.id) }[r.view])();
  }
  const fail = (e, form) => { const box = form?.querySelector('.dp-error'); if (box) box.textContent = e.message; else { state.error = e.message; render(); } };
  async function loadProducts() { try { state.products = (await api('/products')).items; } catch (e) { state.products = []; state.error = e.message; } render(); }
  async function loadOrders() { try { state.orders = (await api('/orders')).items; } catch (e) { state.orders = []; state.error = e.message; } render(); }
  async function loadOrder(id) { try { state.order = await api('/orders/' + encodeURIComponent(id)); } catch (e) { state.order = { id, lines:[], events:[], status:'cancelled', number:'', totalCents:0 }; state.error = e.message; } render(); }
  async function refresh() { await loadMe(); state.products = state.orders = state.order = null; render(); }

  window.addEventListener('hashchange', () => { state.error = ''; state.banner = null; if (route().view === 'orders') state.orders = null; render(); window.scrollTo(0, 0); });
  root.addEventListener('input', e => {
    if (e.target.matches('[data-search]')) { state.q = e.target.value; const pos = e.target.selectionStart; render(); const s = root.querySelector('[data-search]'); s.focus(); s.setSelectionRange(pos, pos); }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.cartqty) { const n = Math.max(1, Math.min(10000, Math.floor(Number(t.value) || 1))); state.cart.set(t.dataset.cartqty, n); saveCart(); render(); }
    if (t.dataset.act === 'other-address') { const box = root.querySelector('[data-other]'); box.hidden = !t.checked; box.querySelectorAll('[data-req]').forEach(i => { i.required = t.checked; }); }
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
    const act = b.dataset.act;
    if (act === 'lang') { state.lang = state.lang === 'zh' ? 'en' : 'zh'; store.set('dealer-lang', state.lang); render(); return; }
    if (act === 'auth') { state.authTab = b.dataset.v; state.error = ''; state.banner = null; render(); return; }
    if (act === 'refresh') { await refresh(); return; }
    if (act === 'signout') { try { await api('/session', { method:'DELETE' }); } catch {} state.me = null; state.cart.clear(); saveCart(); location.hash = ''; render(); return; }
    if (act === 'add') { const q = root.querySelector(`[data-qty="${CSS.escape(b.dataset.sku)}"]`); state.cart.set(b.dataset.sku, Math.max(1, Math.min(10000, Math.floor(Number(q?.value) || 1)))); saveCart(); render(); return; }
    if (act === 'remove') { state.cart.delete(b.dataset.sku); saveCart(); render(); return; }
    if (act === 'pay') {
      state.busy = true; render();
      try { const r = await api(`/orders/${encodeURIComponent(state.order.id)}/checkout`, { method:'POST', body:{} }); location.assign(r.url); }
      catch (x) { state.busy = false; state.error = x.message; render(); }
      return;
    }
    if (act === 'cancel') {
      if (!confirm(tr('Cancel this order?', '确定取消这个订单？'))) return;
      try { await api(`/orders/${encodeURIComponent(state.order.id)}/cancel`, { method:'POST', body:{} }); state.order = null; state.banner = ['info', tr('The order was cancelled.', '订单已取消。')]; render(); }
      catch (x) { state.error = x.message; render(); }
    }
  });
  root.addEventListener('submit', async e => {
    const f = e.target; e.preventDefault();
    const err = f.querySelector('.dp-error'); if (err) err.textContent = '';
    try {
      if (f.id === 'dp-signin') {
        await api('/auth/login', { method:'POST', body:{ email:f.email.value.trim(), password:f.password.value } });
        await refresh(); return;
      }
      if (f.id === 'dp-register') {
        state.busy = true;
        await api('/auth/register', { method:'POST', body:{ email:f.email.value.trim(), password:f.password.value, ...readProfile(f) } });
        state.busy = false; await refresh(); return;
      }
      if (f.id === 'dp-profile') { await api('/profile', { method:'PATCH', body:readProfile(f) }); await refresh(); return; }
      if (f.id === 'dp-order') {
        const lines = [...state.cart].filter(([sku]) => state.products.some(p => p.sku === sku)).map(([sku, qty]) => ({ sku, qty }));
        const shipTo = f.otherAddress.checked ? { name:f.ship_name.value.trim() || undefined, ...readAddress(f, 'ship_') } : undefined;
        state.busy = true; render();
        // One key per attempt: a double click or a retried request creates the order only once.
        const key = store.get('dealer-order-key') || crypto.randomUUID(); store.set('dealer-order-key', key);
        const created = await api('/orders', { method:'POST', body:{ requestKey:key, lines, poNumber:f.poNumber.value.trim() || undefined, note:f.note.value.trim() || undefined, shipTo } });
        store.set('dealer-order-key', ''); state.cart.clear(); saveCart(); state.busy = false; state.orders = null;
        state.order = null; location.hash = 'order/' + created.id; return;
      }
    } catch (x) { state.busy = false; if (f.isConnected) { const box = f.querySelector('.dp-error'); if (box) { box.textContent = x.message; root.querySelectorAll('button.primary').forEach(btn => { btn.disabled = false; }); return; } } fail(x); }
  });

  (async () => {
    const notice = params.get('error'), checkout = params.get('checkout'), orderId = params.get('order');
    if (NOTICE()[notice]) state.banner = NOTICE()[notice];
    // replaceState, not location.hash: a hashchange would clear the notice set below.
    const hash = orderId && /^[0-9a-f-]{36}$/.test(orderId) ? '#order/' + orderId : location.hash;
    if (checkout === 'success') state.banner = ['ok', tr('Thank you — your bank payment has been submitted. We will email you when it clears.', '谢谢，银行付款已提交，到账后我们会发邮件通知你。')];
    if (checkout === 'cancelled') state.banner = ['info', tr('Payment was not completed. You can pay whenever you are ready.', '付款未完成，你可以随时回来付款。')];
    if (params.toString()) history.replaceState(null, '', location.pathname + hash);
    try { state.caps = await api('/capabilities'); } catch {}
    await loadMe();
    render();
  })();
})();
