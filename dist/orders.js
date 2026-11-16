/*
 * 订单履约 Order-to-Success (owner, 2026-11-16): one timeline per order, from paid in full to a customer who can use the
 * machine and leaves a review. Stages: 收款 → 出货 (48 h LTL / 24 h parcel) → 在途 → 到站约送货 → 签收 → 上手（第一件作品）→ 评价.
 * Dealer orders end at delivery; KOL orders are approved instead of paid and end with their content link.
 * Nothing ships before full payment unless a main admin releases the order. Data comes from /orders* (server).
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '', detail = null, settingsData = null;
  const ui = { tab:'open', q:'', kind:[], stage:[], mine:false, late:false, kpi:'' };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const usd = c => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const day = v => v ? new Date(v).toLocaleDateString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'2-digit', day:'2-digit' }) : '';
  const when = v => v ? new Date(v).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const KIND = { retail:['零售', 'Retail', 'blue'], dealer:['经销商', 'Dealer', 'violet'], kol:['KOL', 'KOL', 'amber'] };
  const STAGE = { pay:['待收全款', 'Awaiting full payment'], approve:['待批准发货', 'Awaiting approval'], ship:['待出货', 'To ship'], transit:['运输中', 'In transit'],
    delivery:['到站待约送货', 'At terminal, book delivery'], running:['待上手', 'Getting started'], review:['待邀请评价', 'Invite a review'], content:['待 KOL 内容', 'Awaiting KOL content'],
    done:['已完成', 'Done'], cancelled:['已取消', 'Cancelled'] };
  const PLATFORM = { trustpilot:'Trustpilot', bbb:'BBB', google:'Google', facebook:'Facebook' };
  const w = p => p ? tr(p[0], p[1]) : '';
  // The six nodes of an order, by kind (dealers stop at delivery; KOL orders are approved and end with content).
  const NODES = k => k === 'dealer' ? ['pay', 'ship', 'transit', 'delivered'] : k === 'kol' ? ['approve', 'ship', 'transit', 'delivered', 'running', 'content'] : ['pay', 'ship', 'transit', 'delivered', 'running', 'review'];
  const NODE_LABEL = { pay:['收款', 'Paid'], approve:['批准', 'Approved'], ship:['出货', 'Shipped'], transit:['在途', 'In transit'], delivered:['签收', 'Delivered'], running:['会用', 'Up and running'], review:['评价', 'Review'], content:['内容', 'Content'] };
  const nodeDone = (o, n) => n === 'pay' ? o.owedCents === 0 && o.totalCents > 0 || !!o.release : n === 'approve' ? !!o.release || o.owedCents === 0 && o.totalCents > 0 : n === 'ship' ? !!o.shippedAt
    : n === 'transit' ? !!o.terminalAt || !!o.deliveredAt : n === 'delivered' ? !!o.deliveredAt : n === 'running' ? !!o.firstPieceAt : n === 'review' ? !!o.reviewInvitedAt : n === 'content' ? !!o.contentUrl : false;
  const nodeAt = (o, n) => ({ pay:o.paidAt || o.release?.at, approve:o.release?.at, ship:o.shippedAt, transit:o.terminalAt, delivered:o.deliveredAt, running:o.firstPieceAt, review:o.reviewInvitedAt, content:null })[n];
  const stageNode = o => ({ pay:'pay', approve:'approve', ship:'ship', transit:'transit', delivery:'transit', running:'running', review:'review', content:'content' })[o.stage];
  function dueText(o) {
    if (!o.due) return '';
    const h = Math.round((Date.parse(o.due) - Date.now()) / 3600000), abs = Math.abs(h), t = abs >= 48 ? tr(`${Math.round(abs / 24)} 天`, `${Math.round(abs / 24)} d`) : tr(`${abs} 小时`, `${abs} h`);
    return h < 0 ? tr(`超时 ${t}`, `${t} late`) : tr(`剩 ${t}`, `${t} left`);
  }
  const chip = (txt, cls = '') => `<span class="ord-chip ${cls}">${esc(txt)}</span>`;
  const kindChip = o => chip(w(KIND[o.kind]), KIND[o.kind]?.[2]) + (o.channel === 'offline' ? ' ' + chip(tr('线下', 'Offline'), 'grey') : '') + (o.kindNote === 'zero_untagged' ? ' ' + `<span class="ord-chip warn" title="${tr('0 元订单，Shopify 里没有 kol 标签：请确认类型', '$0 order without a kol tag in Shopify: check the type')}">${tr('待确认', 'Check')}</span>` : '');
  const stageChip = o => `<span class="ord-stage ${o.late ? 'late' : o.stage === 'done' ? 'done' : ''}">${esc(w(STAGE[o.stage]))}</span>${o.due && !['done', 'cancelled'].includes(o.stage) ? `<small class="${o.late ? 'late' : ''}">${esc(dueText(o))}</small>` : ''}`;
  const dots = o => `<span class="ord-dots" aria-hidden="true">${NODES(o.kind).map(n => `<i class="${nodeDone(o, n) ? 'on' : stageNode(o) === n ? (o.late ? 'late' : 'now') : ''}"></i>`).join('')}</span>`;
  const me = () => ctx?.state?.()?.actor?.id;

  function configure(next) { ctx = next; window.WorkOSMulti?.on('ord', (k, vals) => { ui[k] = vals; ctx.rerender(); }); }
  function reset() { data = null; error = ''; detail = null; settingsData = null; Object.assign(ui, { tab:'open', q:'', kind:[], stage:[], mine:false, late:false, kpi:'' }); }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/orders'); error = ''; } catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }
  const KPI_FILTER = { lateShip:o => o.stage === 'ship' && o.late, owed:o => o.stage === 'pay', terminal:o => o.stage === 'delivery', damaged:o => o.damage === 'damaged', firstPiece:o => o.stage === 'running' && o.late };
  function filtered() {
    const q = ui.q.trim().toLowerCase(), pass = (sel, v) => !sel.length || sel.includes(v);
    return data.items.filter(o => (ui.tab === 'all' || (ui.tab === 'open' ? !['done', 'cancelled'].includes(o.stage) : ['done', 'cancelled'].includes(o.stage)))
      && pass(ui.kind, o.kind) && pass(ui.stage, o.stage) && (!ui.mine || o.owner === me()) && (!ui.late || o.late) && (!ui.kpi || KPI_FILTER[ui.kpi](o))
      && (!q || [o.number, o.customer.name, o.customer.email, o.customer.city, o.tracking, ...o.lines.map(l => l.sku + ' ' + l.name)].some(x => String(x || '').toLowerCase().includes(q))))
      .sort((a, b) => (b.late - a.late) || (a.due && b.due ? Date.parse(a.due) - Date.parse(b.due) : 0) || String(b.placedAt).localeCompare(String(a.placedAt)));
  }

  function render() {
    if (!data && !error) { load(); return `<div class="ord"><p class="ord-hint">${tr('正在读取订单…', 'Loading orders…')}</p></div>`; }
    if (error && !data) return `<div class="ord"><div class="ord-alert">${esc(error)}</div></div>`;
    const s = data.summary, list = filtered(), open = data.items.filter(o => !['done', 'cancelled'].includes(o.stage));
    const kpi = (k, label, value, note, bad) => `<button type="button" class="scm-kpi ord-kpi ${bad ? 'red' : ''} ${ui.kpi === k ? 'on' : ''}" data-ord="kpi" data-v="${k}" title="${tr('点一下只看这些订单', 'Show only these orders')}"><span>${label}</span><b>${value}</b><em>${note}</em></button>`;
    const avg = (v, unit) => v == null ? '—' : v + unit;
    const count = k => open.filter(o => o.kind === k).length;
    return `<div class="ord">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · ORDER TO SUCCESS</div><h1>${tr('订单履约', 'Order fulfillment')}</h1>
        <p>${tr(`从收全款到客户会用、留下好评。机器收全款后 ${data.settings.shipHoursLtl} 小时内出货，快递件 ${data.settings.shipHoursParcel} 小时；签收 ${data.settings.trainDays} 天还没做出第一件作品就主动联系。`,
          `From full payment to a customer who can use the machine and leaves a review. Machines ship within ${data.settings.shipHoursLtl} h of full payment, parcels within ${data.settings.shipHoursParcel} h; no first piece ${data.settings.trainDays} days after delivery means we reach out.`)}</p></div>
        <div class="ord-actions">
          ${data.canManage ? `<button class="btn primary" data-ord="new">${icon('plus')} ${tr('新建订单', 'New order')}</button>` : ''}
          ${data.canManage && data.shopify ? `<button class="btn" data-ord="sync">${icon('arrows-clockwise')} ${tr('同步 Shopify 订单', 'Sync Shopify orders')}</button>` : ''}
          ${data.canRelease ? `<button class="btn" data-ord="settings">${icon('gear')} ${tr('负责人与时限', 'Owners & deadlines')}</button>` : ''}
          ${data.canRelease && data.shopify ? `<button class="btn" data-ord="check">${icon('plugs-connected')} ${tr('Shopify 连接检查', 'Shopify check')}</button>` : ''}
          ${window.WorkOSErpAccess?.button?.('orders') || ''}
        </div></div>
      ${!data.shopify ? `<div class="ord-note">${icon('storefront')} ${tr('这里还没连接 Shopify：订单可以手工新建；连接后点“同步 Shopify 订单”拉最近 60 天的订单。', 'Shopify is not connected here: add orders by hand; once connected, Sync Shopify orders pulls the last 60 days.')}</div>` : ''}
      ${s.zeroUntagged ? `<div class="ord-note warn">${icon('warning')} ${tr(`${s.zeroUntagged} 张 0 元订单在 Shopify 里没有 kol 标签，已先当成 KOL：请打开确认类型。`, `${s.zeroUntagged} $0 orders have no kol tag in Shopify and are treated as KOL for now: open them to confirm.`)}</div>` : ''}
      <div class="scm-kpis ord-kpis">
        ${kpi('lateShip', tr('超时未出货', 'Late to ship'), s.lateShip, tr('超过 48 / 24 小时', 'past 48 / 24 h'), s.lateShip)}
        ${kpi('owed', tr('未收全款', 'Not paid in full'), usd(s.owedCents), tr(`${s.owedOrders} 单 · 不能出货`, `${s.owedOrders} orders · cannot ship`), false)}
        ${kpi('terminal', tr('到站未约送货', 'At terminal, no appointment'), s.terminalNoAppt, tr('请在美国白天打电话', 'call in US hours'), s.terminalNoAppt)}
        ${kpi('damaged', tr('签收有破损', 'Delivered damaged'), s.damaged, tr('近 30 天 · 转退货维修', 'last 30 days · to returns'), s.damaged)}
        ${kpi('firstPiece', tr(`签收 ${data.settings.trainDays} 天未做出第一件`, `No first piece after ${data.settings.trainDays} d`), s.noFirstPiece, tr('工程师主动联系', 'engineer reaches out'), s.noFirstPiece)}
      </div>
      <div class="ord-review"><span>${tr('近 90 天', 'Last 90 days')}</span>
        <b>${avg(s.payToShipHours, tr(' 小时', ' h'))}</b><em>${tr('收全款 → 出货', 'Paid → shipped')}</em>
        <b>${avg(s.shipToDeliverDays, tr(' 天', ' d'))}</b><em>${tr('出货 → 签收', 'Shipped → delivered')}</em>
        <b>${avg(s.deliverToFirstDays, tr(' 天', ' d'))}</b><em>${tr('签收 → 第一件作品', 'Delivered → first piece')}</em>
        <b>${s.reviewRate == null ? '—' : s.reviewRate + '%'}</b><em>${tr('零售客户留下评价', 'Retail customers reviewing')}</em>
        <b>${s.avgRating == null ? '—' : s.avgRating}</b><em>${tr('平均评分', 'Average rating')}</em></div>
      <div class="scm-tabs">${[['open', tr('进行中', 'Open'), open.length], ['closed', tr('已完成', 'Done'), data.items.length - open.length], ['all', tr('全部', 'All'), data.items.length]]
        .map(([k, t, n]) => `<button class="${ui.tab === k ? 'on' : ''}" data-ord="tab" data-v="${k}">${t} <b>${n}</b></button>`).join('')}</div>
      <div class="ord-filters">
        <label class="ord-search">${icon('magnifying-glass')}<input data-ord-q value="${esc(ui.q)}" placeholder="${tr('订单号、客户、城市、跟踪号、SKU', 'Order, customer, city, tracking, SKU')}"></label>
        <div class="scm-mf">${window.WorkOSMulti.html({ scope:'ord', key:'kind', all:tr('全部类型', 'All types'), opts:Object.entries(KIND).map(([k, v]) => [k, `${w(v)} (${count(k)})`]), sel:ui.kind, lang:lang() })}</div>
        <div class="scm-mf">${window.WorkOSMulti.html({ scope:'ord', key:'stage', all:tr('全部阶段', 'All stages'), opts:Object.keys(STAGE).map(k => [k, w(STAGE[k])]), sel:ui.stage, lang:lang() })}</div>
        <label class="ord-check"><input type="checkbox" data-ord-flag="mine" ${ui.mine ? 'checked' : ''}> ${tr('我负责的', 'Mine')}</label>
        <label class="ord-check"><input type="checkbox" data-ord-flag="late" ${ui.late ? 'checked' : ''}> ${tr('只看超时', 'Late only')}</label>
        ${ui.kpi || ui.q || ui.kind.length || ui.stage.length || ui.mine || ui.late ? `<button class="scm-link" data-ord="clear">${icon('x-circle')} ${tr('清除筛选', 'Clear filters')}</button>` : ''}
        <span class="ord-count">${tr(`${list.length} 张订单`, `${list.length} orders`)}</span>
      </div>
      <div class="scm-table-wrap"><table class="scm-table ord-table"><thead><tr>
        <th>${tr('订单', 'Order')}</th><th>${tr('类型', 'Type')}</th><th>${tr('客户', 'Customer')}</th><th>${tr('产品', 'Product')}</th><th class="num">${tr('金额 / 未收', 'Total / owed')}</th>
        <th>${tr('进度', 'Progress')}</th><th>${tr('当前阶段', 'Stage')}</th><th>${tr('负责人', 'Owner')}</th><th>${tr('物流', 'Freight')}</th></tr></thead>
        <tbody>${list.map(o => `<tr class="${o.late ? 'late' : ''}" data-ord-open="${esc(o.id)}" tabindex="0">
          <td class="mono">${esc(o.number)}<small>${esc(day(o.placedAt))}</small></td><td>${kindChip(o)}</td>
          <td>${esc(o.customer.name || '—')}<small>${esc([o.customer.city, o.customer.state].filter(Boolean).join(', '))}</small></td>
          <td>${esc(o.lines.map(l => `${l.qty > 1 ? l.qty + ' × ' : ''}${l.name || l.sku}`).join(', '))}<small>${o.shipment === 'parcel' ? tr('快递', 'Parcel') : 'LTL'}${o.liftgate ? tr(' · 尾板', ' · liftgate') : ''}${o.residential ? tr(' · 住宅', ' · residential') : ''}</small></td>
          <td class="num">${usd(o.totalCents)}${o.owedCents && o.stage === 'pay' ? `<small class="late">${tr('未收', 'owed')} ${usd(o.owedCents)}</small>` : ''}</td>
          <td>${dots(o)}</td><td>${stageChip(o)}</td><td>${esc(o.ownerName || (o.stage === 'approve' ? tr('主管理员', 'Main admin') : '—'))}</td>
          <td class="mono">${o.tracking ? `${esc(o.carrier)}<small>${esc(o.tracking)}</small>` : '—'}</td></tr>`).join('')
          || `<tr><td colspan="9" class="ord-empty">${tr('没有符合的订单', 'No matching orders')}</td></tr>`}</tbody></table></div>
    </div>`;
  }

  /* ---------- one order ---------- */
  async function openOrder(id) {
    try { detail = await ctx.api.get('/orders/' + encodeURIComponent(id)); } catch (e) { ctx.toast?.(e.message); return; }
    paintDetail();
  }
  function timeline(o) {
    return `<ol class="ord-line">${NODES(o.kind).map(n => { const done = nodeDone(o, n), now = !done && stageNode(o) === n;
      return `<li class="${done ? 'done' : now ? (o.late ? 'late' : 'now') : ''}"><b>${esc(w(NODE_LABEL[n]))}</b><small>${done ? esc(when(nodeAt(o, n)) || '✓') : now ? esc(dueText(o) || tr('进行中', 'In progress')) : ''}</small></li>`; }).join('')}</ol>`;
  }
  const field = (label, html) => `<label class="field"><span>${label}</span>${html}</label>`;
  function actions(o) {
    if (!data.canManage && !data.canRelease) return '';
    const f = (step, inner, btn, cls = 'primary') => `<form class="ord-step" data-ord-step="${step}">${inner}<button class="btn ${cls}" type="submit">${btn}</button><p class="ord-error" role="alert"></p></form>`;
    const out = [];
    if (o.stage === 'pay' && o.source === 'manual' && data.canManage) out.push(f('payment', field(tr('已收金额（美元）', 'Received (USD)'), `<input name="paid" type="number" min="0" step="0.01" value="${(o.paidCents / 100).toFixed(2)}" required>`), tr('记录收款', 'Record payment')));
    if (o.stage === 'pay' && o.source === 'shopify') out.push(`<p class="ord-hint">${tr('Shopify 订单的收款以 Shopify 为准：在 Shopify 里记录收款，再点“同步 Shopify 订单”。', 'Shopify orders take payment from Shopify: record it there, then sync.')}</p>`);
    if (['pay', 'approve'].includes(o.stage) && data.canRelease) out.push(f('release', field(o.stage === 'approve' ? tr('批准原因（例如合作约定）', 'Reason (e.g. the agreement)') : tr('特批原因', 'Reason'), `<input name="reason" required minlength="3" maxlength="500">`)
      + (o.stage === 'pay' ? field(tr('约定付款日', 'Promised payment date'), `<input name="payBy" type="date" min="${today()}">`) : ''), o.stage === 'approve' ? tr('批准发货', 'Approve shipping') : tr('特批发货（未收全款）', 'Release before full payment'), o.stage === 'approve' ? 'primary' : 'danger'));
    if (!data.canManage) return out.join('');
    if (o.stage === 'ship') out.push(f('ship', field(tr('货运公司', 'Carrier'), `<input name="carrier" required maxlength="80" placeholder="${tr('GTZ 上选的承运商', 'Carrier booked on GTZ')}">`)
      + field(tr('跟踪号', 'Tracking number'), `<input name="tracking" required maxlength="80">`) + field(tr('预计到达', 'ETA'), `<input name="eta" type="date" min="${today()}">`), tr('已提货出货', 'Picked up and shipped')));
    if (['transit', 'delivery'].includes(o.stage)) {
      out.push(f('track', field(tr('新的预计到达', 'New ETA'), `<input name="eta" type="date">`) + field(tr('跟进说明', 'Note'), `<input name="note" maxlength="500" placeholder="${tr('例如：已到中转站', 'e.g. reached the hub')}">`), tr('记录跟进', 'Record an update'), ''));
      if (!o.terminalAt) out.push(f('terminal', '', tr('已到目的地货站', 'At destination terminal'), ''));
      out.push(f('appointment', field(tr('预约送货日', 'Delivery appointment'), `<input name="on" type="date" required value="${o.appointmentOn || ''}">`), tr('已约好送货', 'Delivery booked'), o.stage === 'delivery' ? 'primary' : ''));
      out.push(f('delivered', field(tr('验货结果', 'Inspection'), `<select name="damage"><option value="none">${tr('完好', 'No damage')}</option><option value="damaged">${tr('有破损（签收单已注明）', 'Damaged (noted on the receipt)')}</option></select>`), tr('已签收', 'Delivered'), ''));
    }
    if (o.stage === 'running') out.push(f('first_piece', `<p class="ord-hint">${tr('客户发来第一件作品的照片、或工程师确认客户已经会用之后点这里。', 'When the customer sends a photo of their first piece, or an engineer confirms they are up and running.')}</p>`, tr('客户做出第一件作品', 'First piece made')));
    if (o.stage === 'review' || (o.kind === 'retail' && o.reviewInvitedAt && !o.reviewedAt)) {
      const plat = (data.settings.reviewPlatforms || Object.keys(PLATFORM)).map(p => `<option value="${p}" ${o.reviewPlatform === p ? 'selected' : ''}>${PLATFORM[p]}</option>`).join('');
      if (!o.reviewInvitedAt) out.push(f('review_invited', field(tr('评价平台（按优先级）', 'Platform (in priority order)'), `<select name="platform">${plat}</select>`), tr('已发评价邀请', 'Review invitation sent')));
      out.push(f('reviewed', field(tr('平台', 'Platform'), `<select name="platform">${plat}</select>`) + field(tr('评分', 'Rating'), `<select name="rating">${[5, 4, 3, 2, 1].map(n => `<option>${n}</option>`).join('')}</select>`), tr('客户已评价', 'Customer reviewed'), ''));
    }
    if (o.stage === 'content') out.push(f('content', field(tr('KOL 发布的内容链接', 'Link to the KOL’s post'), `<input name="url" type="url" required maxlength="500" placeholder="https://">`), tr('记录内容', 'Record content')));
    return out.join('');
  }
  function paintDetail() {
    const o = detail; if (!o) return;
    const c = o.customer, EV = { created:['新建订单', 'Order created'], imported:['从 Shopify 导入', 'Imported from Shopify'], payment:['记录收款', 'Payment recorded'], release:['特批 / 批准发货', 'Released / approved'],
      kind:['改订单类型', 'Type changed'], delivery_needs:['改送货要求', 'Delivery needs changed'], ship:['出货', 'Shipped'], track:['物流跟进', 'Freight update'], terminal:['到达货站', 'At terminal'],
      appointment:['约好送货', 'Delivery booked'], delivered:['签收', 'Delivered'], first_piece:['第一件作品', 'First piece'], review_invited:['发评价邀请', 'Review invited'], reviewed:['客户已评价', 'Reviewed'],
      content:['KOL 内容', 'KOL content'], note:['备注', 'Note'], cancel:['取消订单', 'Cancelled'] };
    const detailText = e => { const d = e.details || {}; return [d.carrier, d.tracking, d.eta && tr('预计 ' + d.eta, 'ETA ' + d.eta), d.on, d.damage === 'damaged' ? tr('有破损', 'damaged') : '', d.platform && PLATFORM[d.platform], d.rating && d.rating + '★', d.reason, d.text, d.note, d.url, d.kind && w(KIND[d.kind]), d.paid != null && '$' + d.paid].filter(Boolean).join(' · '); };
    const body = `<div class="ord-detail">
      <div class="ord-head">${kindChip(o)} ${stageChip(o)} ${o.ownerName ? `<span class="ord-owner">${icon('user')} ${esc(o.ownerName)}</span>` : ''}</div>
      ${timeline(o)}
      <div class="ord-grid">
        <section><h4>${tr('客户与送货', 'Customer & delivery')}</h4><p><b>${esc(c.name || '—')}</b><br>${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}<br>${esc([c.city, c.state, c.zip].filter(Boolean).join(', '))}</p>
          <p class="ord-hint">${o.shipment === 'parcel' ? tr('快递件', 'Parcel') : 'LTL'} · ${o.liftgate ? tr('需要尾板', 'Liftgate') : tr('不需要尾板', 'No liftgate')} · ${o.residential ? tr('住宅地址', 'Residential') : tr('商业地址', 'Commercial')}</p></section>
        <section><h4>${tr('产品与金额', 'Items & payment')}</h4><p>${o.lines.map(l => `${esc(l.qty)} × ${esc(l.name || l.sku)} <span class="mono">${esc(l.sku)}</span>`).join('<br>')}</p>
          <p>${tr('金额', 'Total')} <b>${usd(o.totalCents)}</b> · ${tr('已收', 'Paid')} <b>${usd(o.paidCents)}</b>${o.owedCents ? ` · <b class="late">${tr('未收', 'Owed')} ${usd(o.owedCents)}</b>` : ''}</p>
          ${o.release ? `<p class="ord-hint">${tr('特批 / 批准', 'Released')}：${esc(o.release.byName)} · ${esc(when(o.release.at))} · ${esc(o.release.reason)}${o.release.payBy ? tr(` · 约定 ${o.release.payBy} 付款`, ` · pay by ${o.release.payBy}`) : ''}</p>` : ''}</section>
        <section><h4>${tr('物流', 'Freight')}</h4><p>${o.tracking ? `${esc(o.carrier)} <span class="mono">${esc(o.tracking)}</span>` : tr('还没出货', 'Not shipped yet')}${o.eta ? `<br>${tr('预计到达', 'ETA')} ${esc(o.eta)}` : ''}${o.appointmentOn ? `<br>${tr('约好送货', 'Delivery booked')} ${esc(o.appointmentOn)}` : ''}${o.damage === 'damaged' ? `<br><b class="late">${tr('签收有破损：请转退货维修并向承运商索赔', 'Delivered damaged: open a return and file a carrier claim')}</b>` : ''}</p></section>
        <section><h4>${tr('上手与评价', 'Getting started & review')}</h4><p>${o.firstPieceAt ? tr(`第一件作品 ${when(o.firstPieceAt)}`, `First piece ${when(o.firstPieceAt)}`) : tr('还没做出第一件作品', 'No first piece yet')}${o.reviewInvitedAt ? `<br>${tr('已邀请评价', 'Review invited')} · ${esc(PLATFORM[o.reviewPlatform] || '')}` : ''}${o.reviewedAt ? `<br>${tr('已评价', 'Reviewed')} ${esc(o.reviewRating)}★ · ${esc(PLATFORM[o.reviewPlatform] || '')}` : ''}${o.contentUrl ? `<br><a href="${esc(o.contentUrl)}" target="_blank" rel="noopener">${tr('KOL 内容', 'KOL content')}</a>` : ''}</p></section>
      </div>
      ${o.stage !== 'done' && o.stage !== 'cancelled' ? `<h4>${tr('下一步', 'Next step')}</h4><div class="ord-steps">${actions(o)}</div>` : ''}
      ${data.canManage && o.stage !== 'cancelled' ? `<details class="ord-more"><summary>${tr('改类型、送货要求、备注、取消', 'Type, delivery needs, note, cancel')}</summary><div class="ord-steps">
        <form class="ord-step" data-ord-step="kind">${field(tr('订单类型', 'Type'), `<select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${o.kind === k ? 'selected' : ''}>${w(v)}</option>`).join('')}</select>`)}<button class="btn" type="submit">${tr('保存类型', 'Save type')}</button><p class="ord-error" role="alert"></p></form>
        <form class="ord-step" data-ord-step="delivery_needs">${field(tr('运输方式', 'Shipping'), `<select name="shipment"><option value="ltl" ${o.shipment === 'ltl' ? 'selected' : ''}>LTL</option><option value="parcel" ${o.shipment === 'parcel' ? 'selected' : ''}>${tr('快递', 'Parcel')}</option></select>`)}
          <label class="ord-check"><input type="checkbox" name="liftgate" ${o.liftgate ? 'checked' : ''}> ${tr('需要尾板', 'Liftgate')}</label><label class="ord-check"><input type="checkbox" name="residential" ${o.residential ? 'checked' : ''}> ${tr('住宅地址', 'Residential')}</label><button class="btn" type="submit">${tr('保存送货要求', 'Save delivery needs')}</button><p class="ord-error" role="alert"></p></form>
        <form class="ord-step" data-ord-step="note">${field(tr('备注', 'Note'), `<input name="text" required maxlength="2000">`)}<button class="btn" type="submit">${tr('加备注', 'Add note')}</button><p class="ord-error" role="alert"></p></form>
        <form class="ord-step" data-ord-step="cancel">${field(tr('取消原因', 'Reason to cancel'), `<input name="reason" required minlength="3" maxlength="500">`)}<button class="btn danger" type="submit">${tr('取消订单', 'Cancel order')}</button><p class="ord-error" role="alert"></p></form>
      </div></details>` : ''}
      <h4>${tr('记录', 'History')}</h4><ul class="ord-events">${o.events.map(e => `<li><b>${esc(w(EV[e.kind]) || e.kind)}</b> <span>${esc(detailText(e))}</span><small>${esc(e.by)} · ${esc(when(e.at))}</small></li>`).join('')}</ul>
    </div>`;
    ctx.modal(`${tr('订单', 'Order')} ${esc(o.number)}`, body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
  }

  /* ---------- new order, settings, Shopify check ---------- */
  function newOrderForm() {
    ctx.modal(tr('新建订单（电话、邮件等线下成交）', 'New order (phone, email or other offline sale)'), `<form id="ord-new" class="ord-form">
      <div class="ord-row">${field(tr('订单号', 'Order number'), `<input name="number" required maxlength="60" placeholder="${tr('例如 Shopify 订单号或合同号', 'e.g. the Shopify or contract number')}">`)}
        ${field(tr('类型', 'Type'), `<select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${w(v)}</option>`).join('')}</select>`)}
        ${field(tr('运输方式', 'Shipping'), `<select name="shipment"><option value="ltl">LTL</option><option value="parcel">${tr('快递', 'Parcel')}</option></select>`)}</div>
      <div class="ord-row">${field(tr('客户姓名 / 公司', 'Customer'), `<input name="name" required maxlength="200">`)}${field(tr('邮箱', 'Email'), `<input name="email" type="email" maxlength="254">`)}${field(tr('电话', 'Phone'), `<input name="phone" maxlength="40">`)}</div>
      <div class="ord-row">${field(tr('城市', 'City'), `<input name="city" maxlength="100">`)}${field(tr('州', 'State'), `<input name="state" maxlength="2" placeholder="CA">`)}${field(tr('邮编', 'ZIP'), `<input name="zip" maxlength="10">`)}</div>
      <div class="ord-row">${field('SKU', `<input name="sku" required maxlength="80">`)}${field(tr('产品名称', 'Product'), `<input name="product" maxlength="200">`)}${field(tr('数量', 'Qty'), `<input name="qty" type="number" min="1" value="1" required>`)}</div>
      <div class="ord-row">${field(tr('订单金额（美元，KOL 填 0）', 'Total (USD, 0 for KOL)'), `<input name="total" type="number" min="0" step="0.01" required>`)}${field(tr('已收金额', 'Received'), `<input name="paid" type="number" min="0" step="0.01" value="0">`)}
        <div class="field"><span>${tr('送货要求', 'Delivery needs')}</span><label class="ord-check"><input type="checkbox" name="liftgate"> ${tr('需要尾板', 'Liftgate')}</label><label class="ord-check"><input type="checkbox" name="residential"> ${tr('住宅地址', 'Residential')}</label></div></div>
      <p class="ord-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="ord-new">${tr('保存', 'Save')}</button>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
  }
  async function settingsForm() {
    try { settingsData = await ctx.api.get('/orders/settings'); } catch (e) { ctx.toast?.(e.message); return; }
    const s = settingsData.settings, who = (name, v) => `<select name="${name}"><option value="">${tr('未指定', 'Not set')}</option>${settingsData.people.map(p => `<option value="${esc(p.id)}" ${v === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
    const num = (name, v, max) => `<input name="${name}" type="number" min="1" max="${max}" value="${v}" required>`;
    ctx.modal(tr('负责人与时限', 'Owners & deadlines'), `<form id="ord-settings" class="ord-form">
      <h4>${tr('负责人（超时提醒给这个人）', 'Owners (late orders show under them)')}</h4>
      <div class="ord-row">${field(tr('收款', 'Payment'), who('payOwner', s.payOwner))}${field(tr('出货与物流跟进', 'Shipping & freight follow-up'), who('shipOwner', s.shipOwner))}</div>
      <div class="ord-row">${field(tr('约送货（美国白天打电话）', 'Delivery appointments (US-hours calls)'), who('callOwner', s.callOwner))}${field(tr('上手培训', 'Training'), who('trainOwner', s.trainOwner))}</div>
      <h4>${tr('时限', 'Deadlines')}</h4>
      <div class="ord-row">${field(tr('机器（LTL）收全款后几小时内出货', 'Machines (LTL): hours from full payment to shipping'), num('shipHoursLtl', s.shipHoursLtl, 720))}${field(tr('快递件几小时内出货', 'Parcels: hours to ship'), num('shipHoursParcel', s.shipHoursParcel, 720))}</div>
      <div class="ord-row">${field(tr('下单几天还没收全款算超时', 'Days to full payment'), num('payDays', s.payDays, 60))}${field(tr('到站几天还没约送货算超时', 'Days at terminal without an appointment'), num('terminalDays', s.terminalDays, 30))}</div>
      <div class="ord-row">${field(tr('物流几天没更新算超时', 'Days without a freight update'), num('stallDays', s.stallDays, 30))}${field(tr('签收几天没做出第一件就主动联系', 'Days after delivery before reaching out'), num('trainDays', s.trainDays, 60))}</div>
      <p class="ord-hint">${tr('评价邀请按顺序：Trustpilot → BBB → Google → Facebook。评价链接发给每一位零售客户，不只发给满意的客户。', 'Review invitations in order: Trustpilot → BBB → Google → Facebook. Every retail customer gets the link, not only happy ones.')}</p>
      <p class="ord-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="ord-settings">${tr('保存', 'Save')}</button>`);
  }
  async function shopifyCheck() {
    let r; try { r = await ctx.api.get('/orders/shopify-check'); } catch (e) { ctx.toast?.(e.message); return; }
    const ok = (yes, label, fix) => `<li class="${yes ? 'ok' : 'bad'}">${icon(yes ? 'check-circle' : 'x-circle')} ${label}${yes ? '' : `<small>${fix}</small>`}</li>`;
    ctx.modal(tr('Shopify 连接检查', 'Shopify check'), !r.configured ? `<p>${tr('这里还没连接 Shopify。', 'Shopify is not connected here.')}</p>` : `<ul class="ord-checks">
      ${ok(r.hasReadOrders, tr('能读订单（read_orders）', 'Can read orders (read_orders)'), tr('在 Shopify 后台给这个应用打开 read_orders。', 'Enable read_orders for the app in Shopify.'))}
      ${ok(r.hasReadAllOrders, tr('能读 60 天以前的订单（read_all_orders）', 'Can read orders older than 60 days (read_all_orders)'), tr('履约台只需要 60 天内的订单；做历史分析时再申请。', 'Fulfillment only needs the last 60 days; request it later for history.'))}
      ${ok(r.customerReadable, tr('能读客户姓名和收货地址', 'Can read customer names and addresses'), tr('需要在 Shopify 合作伙伴后台为应用申请“受保护的客户数据”访问。', 'Request protected customer data access for the app in the Shopify Partner dashboard.'))}
      <li>${icon('calendar')} ${tr('最早能读到的订单', 'Oldest readable order')}：${esc(r.oldestOrder ? day(r.oldestOrder) + ' ' + new Date(r.oldestOrder).getFullYear() : '—')}</li>
      ${r.scopes?.length ? `<li><small>${tr('已开权限', 'Scopes')}：${esc(r.scopes.join(', '))}</small></li>` : ''}
      ${r.errors?.length ? `<li class="bad"><small>${esc(r.errors.join('; '))}</small></li>` : ''}</ul>`, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async e => {
    if (!ctx) return;
    const row = e.target.closest?.('[data-ord-open]'); if (row) return openOrder(row.dataset.ordOpen);
    const b = e.target.closest?.('[data-ord]'); if (!b) return;
    const a = b.dataset.ord;
    if (a === 'tab') { ui.tab = b.dataset.v; return ctx.rerender(); }
    if (a === 'kpi') { ui.kpi = ui.kpi === b.dataset.v ? '' : b.dataset.v; ui.tab = b.dataset.v === 'damaged' ? 'all' : 'open'; return ctx.rerender(); }
    if (a === 'clear') { Object.assign(ui, { q:'', kind:[], stage:[], mine:false, late:false, kpi:'' }); return ctx.rerender(); }
    if (a === 'new') return newOrderForm();
    if (a === 'settings') return settingsForm();
    if (a === 'check') return shopifyCheck();
    if (a === 'sync') { b.disabled = true; try { const r = await ctx.api.post('/orders/sync', {}); ctx.toast?.(tr(`已同步：新增 ${r.created} 单，更新 ${r.updated} 单${r.customerDetails ? '' : '（读不到客户姓名和地址，见“Shopify 连接检查”）'}`, `Synced: ${r.created} new, ${r.updated} updated${r.customerDetails ? '' : ' (customer details not readable; see Shopify check)'}`)); data = null; load(); } catch (x) { ctx.toast?.(x.message); b.disabled = false; } }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-ord-open]')) openOrder(e.target.dataset.ordOpen); });
  document.addEventListener('input', e => { if (ctx && e.target.matches?.('[data-ord-q]')) { ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender(); const el = document.querySelector('[data-ord-q]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* ignore */ } } } });
  document.addEventListener('change', e => { if (ctx && e.target.matches?.('[data-ord-flag]')) { ui[e.target.dataset.ordFlag] = e.target.checked; ctx.rerender(); } });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx) return;
    const err = () => f.querySelector('.ord-error');
    if (f.matches?.('[data-ord-step]')) {
      e.preventDefault(); const step = f.dataset.ordStep, v = Object.fromEntries(new FormData(f)), body = { step };
      if (step === 'payment') body.paid = Number(v.paid);
      if (step === 'release') { body.reason = String(v.reason || '').trim(); if (v.payBy) body.payBy = v.payBy; }
      if (step === 'kind') body.kind = v.kind;
      if (step === 'delivery_needs') Object.assign(body, { shipment:v.shipment, liftgate:!!f.querySelector('[name="liftgate"]')?.checked, residential:!!f.querySelector('[name="residential"]')?.checked });
      if (step === 'ship') Object.assign(body, { carrier:String(v.carrier).trim(), tracking:String(v.tracking).trim(), ...(v.eta ? { eta:v.eta } : {}) });
      if (step === 'track') Object.assign(body, { ...(v.eta ? { eta:v.eta } : {}), note:String(v.note || '').trim() });
      if (step === 'appointment') body.on = v.on;
      if (step === 'delivered') body.damage = v.damage;
      if (step === 'review_invited') body.platform = v.platform;
      if (step === 'reviewed') Object.assign(body, { platform:v.platform, rating:Number(v.rating) });
      if (step === 'content') body.url = String(v.url).trim();
      if (step === 'note') body.text = String(v.text).trim();
      if (step === 'cancel') { if (!window.confirm?.(tr('确定取消这张订单？', 'Cancel this order?'))) return; body.reason = String(v.reason).trim(); }
      try { await ctx.api.post(`/orders/${encodeURIComponent(detail.id)}/step`, body); ctx.toast?.(tr('已保存', 'Saved')); data = null; load(); await openOrder(detail.id); }
      catch (x) { const el = err(); if (el) el.textContent = x.message || tr('保存失败', 'Could not save'); }
      return;
    }
    if (f.id === 'ord-new') {
      e.preventDefault(); const v = Object.fromEntries(new FormData(f));
      try {
        const r = await ctx.api.post('/orders', { number:String(v.number).trim(), kind:v.kind, channel:'offline', shipment:v.shipment, liftgate:!!f.querySelector('[name="liftgate"]').checked, residential:!!f.querySelector('[name="residential"]').checked,
          customer:{ name:String(v.name).trim(), email:String(v.email || '').trim(), phone:String(v.phone || '').trim(), city:String(v.city || '').trim(), state:String(v.state || '').trim(), zip:String(v.zip || '').trim(), country:'US' },
          lines:[{ sku:String(v.sku).trim(), name:String(v.product || '').trim(), qty:Number(v.qty) }], total:Number(v.total), paid:Number(v.paid || 0) });
        ctx.closeOverlay(); ctx.toast?.(tr('已新建订单', 'Order created')); data = null; load(); openOrder(r.id);
      } catch (x) { err().textContent = x.message || tr('保存失败', 'Could not save'); }
    }
    if (f.id === 'ord-settings') {
      e.preventDefault(); const v = Object.fromEntries(new FormData(f));
      try {
        await ctx.api.request('/orders/settings', { method:'PUT', body:{ payOwner:v.payOwner || null, shipOwner:v.shipOwner || null, callOwner:v.callOwner || null, trainOwner:v.trainOwner || null,
          shipHoursLtl:Number(v.shipHoursLtl), shipHoursParcel:Number(v.shipHoursParcel), payDays:Number(v.payDays), terminalDays:Number(v.terminalDays), stallDays:Number(v.stallDays), trainDays:Number(v.trainDays),
          reviewPlatforms:settingsData.settings.reviewPlatforms } });
        ctx.closeOverlay(); ctx.toast?.(tr('已保存', 'Saved')); data = null; load();
      } catch (x) { err().textContent = x.message || tr('保存失败', 'Could not save'); }
    }
  });

  window.WorkOSOrders = { configure, render, reset };
})();
