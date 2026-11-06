'use strict';
/* Smart supply chain (智能供应链) — the live page once the server offers it (capability supplyChain).
 * Everything comes from GET /supply/overview, which computes it from the WMS ledger:
 *   DS (daily sold) = US-warehouse goods out over 7 / 30 / 90 days; stock age = first in, first out;
 *   days of cover = US stock ÷ DS30. The company rules (ocean days, safety stock, aged and overstock limits) are
 *   server settings, editable by supply managers.
 * Shipments (vessel, B/L, containers, ETD/ETA, cargo lines) are registered here. Sailing moves the goods from the
 * factory warehouse to in transit; receiving needs a warehouse operator to enter the counted quantity of every line
 * before the goods go into the US warehouse. No product or stock data lives in this file. */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null;
  const S = { data:null, loading:false, error:'', filter:'all', q:'', showAll:false };
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const n0 = v => v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US');
  const n1 = v => v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toLocaleString('en-US');
  const money = v => !isFinite(v) ? '—' : '$' + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v).toLocaleString('en-US'));
  const md = d => d ? d.slice(5).replace('-', '/') : '—';
  const nameOf = it => lang() === 'en' ? it.nameEn || it.name : it.name;
  const D = () => S.data || {};
  const set = () => D().settings || {};

  /* state: zh, en, colour, icon — order is the priority the server uses */
  const STATE = {
    stockout:['即将断货', 'Stock-out risk', '#e2445c', 'warning-octagon'],
    reorder:['需要补货', 'Reorder now', '#fdab3d', 'arrow-clockwise'],
    idle:['不动销', 'Not selling', '#9699a6', 'moon'],
    excess:['库存过多', 'Overstocked', '#579bfc', 'stack'],
    aged:['存放过长', 'Aged stock', '#a25ddc', 'hourglass-low'],
    ok:['正常', 'Healthy', '#00c875', 'check-circle'],
  };
  const SHIP = {
    booked:['已订舱', 'Booked', '#9699a6'], at_sea:['海上', 'At sea', '#00a9a5'], at_port:['已到港', 'At port', '#579bfc'],
    customs:['清关中', 'In customs', '#a25ddc'], received:['已入仓', 'Received', '#00c875'], cancelled:['已取消', 'Cancelled', '#c4c4c4'],
  };
  const FROM = { dg:['东莞工厂仓', 'Dongguan factory'], jn:['济南工厂仓', 'Jinan factory'], new:['新生产直发', 'New production'] };
  const badge = (k, map = STATE) => `<span class="sc-badge" style="--c:${map[k][2]}">${esc(tr(map[k][0], map[k][1]))}</span>`;

  function configure(next) { ctx = next; }
  async function load(force) {
    if (S.loading || (S.data && !force)) return;
    S.loading = true;
    try { S.data = await ctx.api.get('/supply/overview'); S.error = ''; }
    catch (e) { S.error = e?.message || tr('供应链数据读取失败', 'Could not load supply chain data'); }
    finally { S.loading = false; ctx.rerender?.(); }
  }
  const reload = () => { S.data = null; return load(true); };

  /* ---------- page ---------- */
  function render() {
    if (!ctx) return '';
    if (!S.data && !S.error) { load(); return shell(`<p class="pd-hint">${tr('正在读取 WMS 库存与出库数据…', 'Loading WMS stock and sales…')}</p>`); }
    if (S.error && !S.data) return shell(`<div class="pd-banner warn">${icon('warning')} ${esc(S.error)}</div>`);
    const d = D(), items = d.items || [], s = set();
    const sum = f => items.reduce((n, x) => n + (f(x) || 0), 0);
    const us = sum(x => x.qty.us), ds7 = sum(x => x.ds7), ds30 = sum(x => x.ds30), aged = sum(x => x.agedUnits), transit = sum(x => x.qty.transit), factory = sum(x => x.qty.dg + x.qty.jn);
    const priced = d.canSeeValue && items.some(x => x.unitUsd > 0); // no cost on file: show units, not $0
    const value = priced ? sum(x => x.qty.us * (x.unitUsd || 0)) : null, agedValue = priced ? sum(x => x.agedUnits * (x.unitUsd || 0)) : null;
    const cover = ds30 > 0 ? us / ds30 : null, trend = ds30 > 0 ? Math.round((ds7 / ds30 - 1) * 100) : null, agedPct = us ? Math.round(aged / us * 100) : 0;
    const open = (d.shipments || []).filter(x => ['at_sea', 'at_port', 'customs'].includes(x.status)), next = open.filter(x => x.eta).sort((a, b) => a.eta.localeCompare(b.eta))[0];
    const kpi = (label, val, note, tone = '') => `<div class="pd-kpi ${tone}"><span>${label}</span><strong>${val}</strong><em>${note}</em></div>`;
    const counts = Object.keys(STATE).map(k => [k, items.filter(x => k === 'ok' ? x.state === 'ok' : x.flags.includes(k)).length]);
    const actions = [
      d.canManage ? `<button class="pd-btn primary" data-sc="new-ship">${icon('boat')} ${tr('新建船次', 'New shipment')}</button>` : '',
      d.canManage ? `<button class="pd-btn" data-sc="settings">${icon('sliders-horizontal')} ${tr('补货参数', 'Rules')}</button>` : '',
      d.canImportLots ? `<button class="pd-btn" data-sc="lots">${icon('calendar-check')} ${tr('导入期初库龄', 'Import stock age')}</button>` : '',
      `<button class="pd-btn" data-sc="export">${icon('download-simple')} ${tr('导出', 'Export')}</button>`,
      `<button class="pd-btn" data-sc="refresh" title="${tr('重新计算', 'Recalculate')}">${icon('arrows-clockwise')}</button>`,
    ].join('');
    return shell(`
      <div class="pd-banner info">${icon('database')} ${tr(`数据来源：WMS 出入库流水，${new Date(d.asOf).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })} 实时计算`, `Source: the WMS ledger, calculated live at ${new Date(d.asOf).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}`)}${d.lastLotImport ? tr(` · 期初库龄截至 ${d.lastLotImport.asOf}`, ` · opening stock age as of ${d.lastLotImport.asOf}`) : tr(' · 还没有导入期初库龄，现有库存按导入期初库存那天计算库龄', ' · no opening stock age imported yet; stock on hand is aged from the opening import day')}</div>
      <div class="sc-actions">${actions}</div>
      <div class="pd-kpis six">
        ${kpi(tr('美国仓库存', 'US warehouse stock'), n0(us) + `<small> ${tr('件', 'pcs')}</small>`, value != null ? tr(`货值 ${money(value)}`, `Value ${money(value)}`) : tr(`${items.filter(x => x.qty.us > 0).length} 个 SKU`, `${items.filter(x => x.qty.us > 0).length} SKUs`))}
        ${kpi(tr('美国仓可售天数', 'US days of cover'), cover == null ? '∞' : n0(cover), tr('= 库存 ÷ 近 30 天 DS', '= stock ÷ 30-day DS'), cover != null && cover > s.overstockDays ? 'warn' : cover != null && cover < s.safetyDays ? 'bad' : '')}
        ${kpi(tr('DS 近 7 / 30 天', 'DS, 7 / 30 days'), `${n1(ds7)} / ${n1(ds30)}`, trend == null ? tr('近 30 天没有出库', 'No sales in 30 days') : `<span class="${trend >= 0 ? 'pd-good' : 'pd-bad'}">${trend >= 0 ? '↑' : '↓'} ${Math.abs(trend)}%</span> ${tr('近 7 天对比 30 天', '7 vs 30 days')}`)}
        ${kpi(tr(`超 ${s.agedDays} 天库存`, `Older than ${s.agedDays} days`), agedPct + '%', agedValue != null ? tr(`${n0(aged)} 件 · ${money(agedValue)}`, `${n0(aged)} pcs · ${money(agedValue)}`) : tr(`${n0(aged)} 件`, `${n0(aged)} pcs`), agedPct >= 40 ? 'bad' : agedPct >= 20 ? 'warn' : '')}
        ${kpi(tr('在途', 'In transit'), n0(transit) + `<small> ${tr('件', 'pcs')}</small>`, next ? tr(`${open.length} 船 · 最近 ${md(next.eta)} 到港`, `${open.length} ships · next ETA ${md(next.eta)}`) : tr('没有在途船次', 'Nothing at sea'))}
        ${kpi(tr('工厂仓', 'Factory stock'), n0(factory) + `<small> ${tr('件', 'pcs')}</small>`, tr('东莞 + 济南，可随时发货', 'Dongguan + Jinan, ready to ship'))}
      </div>
      <div class="pd-health">${counts.map(([k, c]) => `<button class="pd-htile ${S.filter === k ? 'on' : ''}" style="--c:${STATE[k][2]}" data-sc="filter" data-v="${S.filter === k ? 'all' : k}"><span>${icon(STATE[k][3])} ${esc(tr(STATE[k][0], STATE[k][1]))}</span><strong>${c}</strong></button>`).join('')}</div>
      <p class="pd-hint">${tr(`规则：红 = 卖不到下一船到港（没有在途就按海运 ${s.shipDays} 天算）；橙 = 美国仓 + 在途 + 工厂仓低于“生产 + 海运 ${s.shipDays} 天 + 安全库存 ${s.safetyDays} 天”的用量；灰 = 有库存但近 30 天没有出库；蓝 = 可售天数超过 ${s.overstockDays} 天；紫 = 最老一批超过 ${s.agedDays} 天。点色块筛选下表。`,
        `Rules: red = runs out before the next ship lands (${s.shipDays} days of ocean if nothing is at sea); orange = US + transit + factory below production + ${s.shipDays} days ocean + ${s.safetyDays} days safety; gray = stock but no sales in 30 days; blue = more than ${s.overstockDays} days of cover; purple = oldest batch older than ${s.agedDays} days. Click a tile to filter.`)}</p>
      ${shipmentsCard(d)}
      <div class="pd-strategy">${reorderCard(items, s)}${clearCard(items, s, d.canSeeValue)}</div>
      ${table(items, s)}`);
  }
  const shell = body => `<div class="pd sc"><div class="page-heading"><div><div class="eyebrow">WMS · SUPPLY CHAIN</div><h1>${tr('智能供应链', 'Smart supply chain')}</h1>
    <p>${tr('实时查看每个 SKU 的在库天数、日均销量（DS）、可售天数，自动预警断货和存放过长，并登记船次、到港时间和货物明细。', 'Live days on hand, daily sold (DS) and days of cover per SKU, with stock-out and aged-stock alerts, and inbound shipments with vessel, ETA and cargo.')}</p></div></div>${body}</div>`;

  /* ---------- shipments ---------- */
  function shipmentsCard(d) {
    const list = (d.shipments || []).filter(x => x.status !== 'received' || S.showReceived);
    const received = (d.shipments || []).filter(x => x.status === 'received').length;
    return `<section class="pd-card sc-ships"><div class="pd-card-head"><h3>${icon('boat')} ${tr('船次与在途', 'Shipments')} <b class="pd-count">${(d.shipments || []).filter(x => !['received', 'cancelled'].includes(x.status)).length}</b></h3>
      ${received ? `<button class="pd-link" data-sc="toggle-received">${S.showReceived ? tr('隐藏已入仓', 'Hide received') : tr(`显示近 45 天已入仓（${received}）`, `Show received in the last 45 days (${received})`)}</button>` : ''}</div>
      ${list.length ? `<div class="sc-ship-grid">${list.map(x => shipCard(x, d)).join('')}</div>` : `<p class="pd-hint">${d.canManage ? tr('还没有船次。点右上角“新建船次”，填写船名航次、柜号、到港时间和货物明细。', 'No shipments yet. Use “New shipment” to add the vessel, containers, ETA and cargo.') : tr('还没有船次。', 'No shipments yet.')}</p>`}</section>`;
  }
  function shipCard(x, d) {
    const eta = x.status === 'received' ? tr(`${md(x.receivedAt?.slice(0, 10))} 入仓 · ${esc(x.receivedByName)}`, `Received ${md(x.receivedAt?.slice(0, 10))} · ${esc(x.receivedByName)}`)
      : x.eta ? (x.late ? `<b class="sc-late">ETA ${md(x.eta)} · ${tr(`已过 ${-x.daysToEta} 天`, `${-x.daysToEta} days late`)}</b>` : `ETA <b>${md(x.eta)}</b>${x.daysToEta != null && x.daysToEta >= 0 && ['booked', 'at_sea'].includes(x.status) ? tr(` · 还有 ${x.daysToEta} 天`, ` · in ${x.daysToEta} days`) : ''}`) : tr('未填 ETA', 'No ETA');
    const btn = [];
    if (d.canManage && x.status === 'booked') btn.push(`<button class="pd-btn small primary" data-sc="depart" data-id="${esc(x.id)}">${icon('anchor')} ${tr('已开船', 'Sailed')}</button>`);
    if (d.canReceive && ['at_sea', 'at_port', 'customs'].includes(x.status)) btn.push(`<button class="pd-btn small primary" data-sc="receive" data-id="${esc(x.id)}">${icon('package')} ${tr('核对数量并入库', 'Count & receive')}</button>`);
    if (d.canManage && ['at_sea', 'at_port', 'customs'].includes(x.status)) btn.push(`<button class="pd-btn small" data-sc="status" data-id="${esc(x.id)}">${icon('map-pin')} ${tr('更新状态 / ETA', 'Status / ETA')}</button>`);
    if (d.canManage && x.status === 'booked') btn.push(`<button class="pd-btn small" data-sc="edit-ship" data-id="${esc(x.id)}">${icon('pencil-simple')} ${tr('修改', 'Edit')}</button>`, `<button class="pd-link" data-sc="cancel" data-id="${esc(x.id)}">${tr('取消船次', 'Cancel')}</button>`);
    return `<article class="sc-ship ${x.late ? 'late' : ''}" style="--c:${x.late ? '#e2445c' : SHIP[x.status][2]}">
      <div class="sc-ship-top"><strong>${esc(x.vessel)}${x.voyage ? ' ' + esc(x.voyage) : ''}</strong>${badge(x.status, SHIP)}</div>
      <div class="sc-ship-meta">${[x.containers ? tr('柜号 ', 'Ctr ') + esc(x.containers) : '', x.blNo ? 'B/L ' + esc(x.blNo) : '', x.originPort || x.destPort ? `${esc(x.originPort || '?')} → ${esc(x.destPort || '?')}` : '', x.forwarder ? esc(x.forwarder) : ''].filter(Boolean).join(' · ')}</div>
      <div class="sc-ship-eta">${x.etd ? `ETD ${md(x.etd)} · ` : ''}${eta}</div>
      <ul class="sc-lines">${x.lines.map(l => `<li><span>${esc(l.sku)}</span><b>${n0(l.qty)}</b>${l.received != null && l.received !== l.qty ? `<em class="sc-diff">${tr('实收', 'got')} ${n0(l.received)}</em>` : ''}<small>${esc(tr(FROM[l.from]?.[0] || '', FROM[l.from]?.[1] || ''))}</small></li>`).join('')}</ul>
      <div class="sc-ship-foot"><span>${tr(`${x.lines.length} 个 SKU · ${n0(x.units)} 件`, `${x.lines.length} SKUs · ${n0(x.units)} pcs`)}</span>${x.note ? `<span class="pd-hint">${esc(x.note)}</span>` : ''}</div>
      ${btn.length ? `<div class="sc-ship-btns">${btn.join('')}</div>` : ''}</article>`;
  }

  /* ---------- replenishment and clearance ---------- */
  function reorderCard(items, s) {
    const list = items.filter(x => x.flags.includes('stockout') || x.flags.includes('reorder')).sort((a, b) => (a.cover ?? 1e9) - (b.cover ?? 1e9));
    return `<section class="pd-card pd-replen"><div class="pd-card-head"><h3>${icon('magic-wand')} ${tr('补货建议', 'Replenishment')} <b class="pd-count">${list.length}</b></h3></div>
      ${list.length ? list.slice(0, 12).map(x => `<div class="pd-tip" style="--c:${STATE[x.flags.includes('stockout') ? 'stockout' : 'reorder'][2]}"><div><strong>${esc(nameOf(x))}</strong><span>${esc(x.sku)} · ${tr('美国仓', 'US')} ${n0(x.qty.us)} · ${tr('在途', 'transit')} ${n0(x.qty.transit)}${x.nextEta ? ` (${md(x.nextEta.date)})` : ''} · ${tr('工厂仓', 'factory')} ${n0(x.qty.dg + x.qty.jn)} · DS30 ${n1(x.ds30)} · ${tr('可卖', 'cover')} ${x.cover == null ? '∞' : n0(x.cover)} ${tr('天', 'd')}</span></div>
        <p>${x.transferQty ? tr(`先从工厂仓调 <b>${n0(x.transferQty)}</b> 件上船，约 ${s.shipDays} 天到美国仓。`, `Ship <b>${n0(x.transferQty)}</b> from factory stock first (~${s.shipDays} days).`) : ''}${x.reorderQty > x.transferQty ? tr(` 再下单生产 <b>${n0(x.reorderQty - x.transferQty)}</b> 件（交期约 ${x.lead} 天）。`, ` Order <b>${n0(x.reorderQty - x.transferQty)}</b> more (lead time ~${x.lead} days).`) : ''}${!x.transferQty && x.reorderQty <= x.transferQty ? tr(' 已在补货流程中，留意到港时间。', ' Already covered by inbound stock; watch the ETA.') : ''}</p></div>`).join('')
        : `<p class="pd-hint">${icon('check-circle')} ${tr('目前没有需要补货的 SKU。', 'Nothing needs reordering right now.')}</p>`}
      ${list.length > 12 ? `<p class="pd-hint">${tr(`另有 ${list.length - 12} 个，见下表（红、橙）。`, `${list.length - 12} more in the table below.`)}</p>` : ''}</section>`;
  }
  function clearCard(items, s, canValue) {
    const list = items.filter(x => x.qty.us > 0 && (x.flags.includes('aged') || x.flags.includes('excess') || x.flags.includes('idle'))).sort((a, b) => (b.oldestAge || 0) - (a.oldestAge || 0));
    const advice = x => x.flags.includes('idle') ? tr('近 30 天没有卖出：检查上架、价格和图片，暂停补货', 'No sales in 30 days: check the listing and price; pause reorders')
      : (x.cover ?? 1e9) > s.overstockDays * 2 ? tr('清仓促销或给经销商打包价', 'Clearance promotion or a dealer bundle price')
      : tr('捆绑配件、限时折扣，优先发老批次', 'Bundle with accessories, short promotions; ship the oldest batch first');
    return `<section class="pd-card"><div class="pd-card-head"><h3>${icon('hourglass-medium')} ${tr('存放过长 / 库存过多', 'Aged and overstocked')} <b class="pd-count">${list.length}</b></h3></div>
      ${list.length ? list.slice(0, 12).map(x => `<div class="pd-tip" style="--c:${STATE[x.flags.find(f => ['idle', 'excess', 'aged'].includes(f))][2]}"><div><strong>${esc(nameOf(x))}</strong><span>${esc(x.sku)} · ${n0(x.qty.us)} ${tr('件', 'pcs')}${canValue && x.unitUsd ? ` · ${money(x.qty.us * x.unitUsd)}` : ''} · ${tr('最老', 'oldest')} ${n0(x.oldestAge)} ${tr('天', 'd')} · ${tr('可卖', 'cover')} ${x.cover == null ? '∞' : n0(x.cover)} ${tr('天', 'd')}</span></div><p>${x.flags.filter(f => ['idle', 'excess', 'aged'].includes(f)).map(f => badge(f)).join(' ')} ${advice(x)}</p></div>`).join('')
        : `<p class="pd-hint">${icon('check-circle')} ${tr(`没有超过 ${s.agedDays} 天或可售超过 ${s.overstockDays} 天的库存。`, `Nothing older than ${s.agedDays} days or above ${s.overstockDays} days of cover.`)}</p>`}</section>`;
  }

  /* ---------- SKU table ---------- */
  function rowsOf(items) {
    const q = S.q.trim().toLowerCase(), order = Object.keys(STATE);
    return items.filter(x => (S.filter === 'all' || (S.filter === 'ok' ? x.state === 'ok' : x.flags.includes(S.filter))) && (!q || `${x.sku} ${x.name} ${x.nameEn} ${x.type}`.toLowerCase().includes(q)))
      .sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || (a.cover ?? 1e9) - (b.cover ?? 1e9));
  }
  function table(items, s) {
    const rows = rowsOf(items), shown = S.showAll ? rows : rows.slice(0, 80);
    const trend = x => x.trend == null ? '' : x.trend >= 20 ? `<em class="sc-up">↑${x.trend}%</em>` : x.trend <= -20 ? `<em class="sc-down">↓${-x.trend}%</em>` : '';
    return `<section class="pd-card"><div class="pd-card-head"><h3>${tr('SKU 库存明细', 'SKU detail')} <b class="pd-count">${rows.length}</b></h3>
      <label class="pd-search">${icon('magnifying-glass')}<input data-sc-search placeholder="${tr('搜索 SKU 或名称', 'Search SKU or name')}" value="${esc(S.q)}"></label>${S.filter !== 'all' ? `<button class="pd-link" data-sc="filter" data-v="all">${icon('x')} ${tr('清除筛选', 'Clear filter')}</button>` : ''}</div>
      <div class="sc-table-wrap"><table class="pd-table sc-table"><thead><tr><th>SKU</th><th class="num">${tr('美国仓', 'US')}</th><th class="num">${tr('工厂仓', 'Factory')}</th><th class="num">${tr('在途 / ETA', 'Transit / ETA')}</th>
        <th class="num">DS7</th><th class="num">DS30</th><th class="num">DS90</th><th class="num">${tr('可售天数', 'Cover (d)')}</th><th class="num">${tr('平均库龄', 'Avg age')}</th><th class="num">${tr('最老一批', 'Oldest')}</th><th>${tr('状态', 'Status')}</th></tr></thead><tbody>
      ${shown.map(x => `<tr class="pd-row-state" style="--c:${STATE[x.state][2]}"><td><strong>${esc(nameOf(x))}</strong><br><small>${esc(x.sku)}${x.type ? ' · ' + esc(x.type) : ''}</small></td>
        <td class="num">${n0(x.qty.us)}</td><td class="num">${n0(x.qty.dg + x.qty.jn)}</td>
        <td class="num">${x.qty.transit ? n0(x.qty.transit) : '—'}${x.nextEta ? `<br><small>${md(x.nextEta.date)} · ${n0(x.nextEta.qty)}</small>` : ''}</td>
        <td class="num">${n1(x.ds7)} ${trend(x)}</td><td class="num">${n1(x.ds30)}</td><td class="num">${n1(x.ds90)}</td>
        <td class="num ${x.cover != null && x.cover > s.overstockDays ? 'sc-blue' : x.flags.includes('stockout') ? 'sc-red' : ''}">${x.cover == null ? (x.qty.us ? '∞' : '0') : n0(x.cover)}</td>
        <td class="num">${n0(x.avgAge)}</td><td class="num ${x.oldestAge > s.agedDays ? 'sc-purple' : ''}">${n0(x.oldestAge)}${x.ageKnown === false && x.qty.us ? '<sup title="' + tr('有部分库存找不到入仓记录，按最早一笔计算', 'Some stock predates the ledger; counted with the oldest arrival') + '">*</sup>' : ''}</td>
        <td>${(x.flags.length ? x.flags : ['ok']).map(f => badge(f)).join(' ')}</td></tr>`).join('') || `<tr><td colspan="11" class="pd-hint">${tr('没有符合条件的 SKU。', 'No SKUs match.')}</td></tr>`}
      </tbody></table></div>${rows.length > shown.length ? `<button class="pd-link" data-sc="all">${tr(`显示全部 ${rows.length} 个 SKU`, `Show all ${rows.length} SKUs`)}</button>` : ''}
      <p class="pd-hint">${tr('DS = 美国仓出库件数 ÷ 天数（经销商发货也走 WMS 出库，已包含）。库龄按先进先出计算：现有库存视为最近入仓的那几批。', 'DS = US-warehouse units shipped ÷ days (dealer shipments go out through the WMS too). Stock age is first in, first out: the stock on hand is the most recent arrivals.')}</p></section>`;
  }

  /* ---------- dialogs ---------- */
  const shipById = id => (D().shipments || []).find(x => x.id === id);
  const fromWord = { 东莞: 'dg', dg: 'dg', 济南: 'jn', jn: 'jn', 新: 'new', new: 'new', 新生产: 'new', 直发: 'new' };
  function parseLines(text, def) {
    const out = [], problems = [];
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim(); if (!line) return;
      const p = line.split(/[,，\t]+|\s+/).map(x => x.trim()).filter(Boolean);
      const qty = Number(p[1]), cartons = p[2] != null && /^\d+$/.test(p[2]) ? Number(p[2]) : null;
      const fromTok = p.slice(2).find(x => !/^\d+$/.test(x)), from = fromTok ? fromWord[Object.keys(fromWord).find(k => fromTok.toLowerCase().includes(k))] : def;
      if (!p[0] || !(qty > 0) || !Number.isInteger(qty)) problems.push(tr(`第 ${i + 1} 行：请写成“SKU, 数量, 箱数, 来源”`, `Line ${i + 1}: write “SKU, qty, cartons, origin”`));
      else if (fromTok && !from) problems.push(tr(`第 ${i + 1} 行：来源请写 东莞 / 济南 / 新生产`, `Line ${i + 1}: origin must be dg / jn / new`));
      else out.push({ sku:p[0], qty, cartons, from:from || def });
    });
    return { lines:out, problems };
  }
  function shipDialog(x) {
    const v = x || { lines:[] }, f = (name, zh, en, type = 'text', extra = '') => `<label class="field"><span>${tr(zh, en)}</span><input name="${name}" type="${type}" value="${esc(v[name] || '')}" ${extra}></label>`;
    ctx.modal(x ? tr('修改船次', 'Edit shipment') : tr('新建船次', 'New shipment'), `<form id="sc-ship" class="sc-form" data-id="${esc(x?.id || '')}">
      <div class="sc-grid2">${f('vessel', '船名 *', 'Vessel *', 'text', 'required maxlength="120"')}${f('voyage', '航次', 'Voyage')}${f('blNo', '提单号 B/L', 'B/L no.')}${f('containers', '柜号（多个用逗号分开）', 'Containers (comma separated)')}
        ${f('originPort', '起运港', 'Port of loading')}${f('destPort', '目的港', 'Port of discharge')}${f('etd', '开船日期 ETD', 'ETD', 'date')}${f('eta', '预计到港 ETA', 'ETA', 'date')}${f('forwarder', '货代', 'Forwarder')}
        <label class="field"><span>${tr('默认发货地', 'Default origin')}</span><select name="from">${Object.entries(FROM).map(([k, w]) => `<option value="${k}" ${(v.lines[0]?.from || 'dg') === k ? 'selected' : ''}>${tr(w[0], w[1])}</option>`).join('')}</select></label></div>
      <label class="field"><span>${tr('货物明细 *（每行一个 SKU：SKU, 数量, 箱数, 来源；箱数和来源可省略）', 'Cargo * (one SKU per line: SKU, qty, cartons, origin; cartons and origin optional)')}</span>
        <textarea name="lines" rows="6" data-sc-lines placeholder="DEMO-SKU-01, 20, 20&#10;DEMO-SKU-02, 500, 10, 新生产">${esc(v.lines.map(l => [l.sku, l.qty, l.cartons ?? '', l.from === (v.lines[0]?.from || 'dg') ? '' : tr(FROM[l.from][0], l.from)].filter(y => y !== '').join(', ')).join('\n'))}</textarea></label>
      <div data-sc-lines-preview class="pd-hint"></div>
      <label class="field"><span>${tr('备注', 'Note')}</span><input name="note" maxlength="1000" value="${esc(v.note || '')}"></label>
      <p class="pd-hint">${icon('info')} ${tr('登记后状态为“已订舱”，不影响库存。点“已开船”时，系统才把货从工厂仓转到“在途”。', 'A new shipment is “Booked” and does not touch stock. “Sailed” moves the goods from the factory to in transit.')}</p>
      <p class="sc-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="sc-ship">${tr('保存', 'Save')}</button>`);
    linesPreview(document.getElementById('sc-ship'));
  }
  function linesPreview(f) {
    if (!f) return;
    const r = parseLines(val(f, 'lines'), val(f, 'from')), slot = f.querySelector('[data-sc-lines-preview]');
    slot.innerHTML = r.problems.length ? `<span class="sc-error">${r.problems.slice(0, 4).map(esc).join('<br>')}</span>` : r.lines.length ? tr(`${r.lines.length} 个 SKU · 共 ${n0(r.lines.reduce((n, l) => n + l.qty, 0))} 件`, `${r.lines.length} SKUs · ${n0(r.lines.reduce((n, l) => n + l.qty, 0))} pcs`) : '';
    return r;
  }
  function departDialog(x) {
    const fromFactory = x.lines.filter(l => l.from !== 'new');
    ctx.modal(tr('确认已开船', 'Confirm sailing'), `<form id="sc-depart" class="sc-form" data-id="${esc(x.id)}">
      <p>${tr(`<b>${esc(x.vessel)} ${esc(x.voyage)}</b> 开船后，系统会写入 WMS 流水：`, `Once <b>${esc(x.vessel)} ${esc(x.voyage)}</b> sails, these WMS movements are written:`)}</p>
      <ul class="sc-lines">${x.lines.map(l => `<li><span>${esc(l.sku)}</span><b>${n0(l.qty)}</b><small>${l.from === 'new' ? tr('入库到“在途”（新生产直发）', 'goods in to transit (new production)') : tr(`${FROM[l.from][0]} → 在途`, `${FROM[l.from][1]} → transit`)}</small></li>`).join('')}</ul>
      ${fromFactory.length ? `<label class="sc-check"><input type="checkbox" name="already"> ${tr('这批货在导入期初库存时已经算在“在途”里了（只改状态，不再从工厂仓扣）', 'These goods were already counted in “in transit” by the opening stock import (change the status only)')}</label>` : ''}
      <p class="sc-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="sc-depart">${tr('确认已开船', 'Confirm sailed')}</button>`);
  }
  function receiveDialog(x) {
    ctx.modal(tr('核对数量并入库', 'Count and receive'), `<form id="sc-receive" class="sc-form" data-id="${esc(x.id)}">
      <p>${tr(`请逐行清点 <b>${esc(x.vessel)} ${esc(x.voyage)}</b> 实际到货的数量，全部填完才能入库。数量和装箱单不一致的，会生成一条待主管确认的盘点差异。`, `Count what actually arrived on <b>${esc(x.vessel)} ${esc(x.voyage)}</b>, line by line; every line is required. Any difference from the packing list becomes a count adjustment for your manager to confirm.`)}</p>
      <table class="pd-table small"><thead><tr><th>SKU</th><th class="num">${tr('装箱数量', 'Packed')}</th><th class="num">${tr('箱数', 'Cartons')}</th><th class="num">${tr('实收数量 *', 'Counted *')}</th></tr></thead><tbody>
      ${x.lines.map(l => `<tr><td><strong>${esc(l.name)}</strong><br><small>${esc(l.sku)}</small></td><td class="num">${n0(l.qty)}</td><td class="num">${l.cartons ?? '—'}</td><td class="num"><input class="sc-count" type="number" min="0" step="1" inputmode="numeric" name="l${l.lineNo}" data-line="${l.lineNo}" data-packed="${l.qty}" required></td></tr>`).join('')}
      </tbody></table><div data-sc-receive-diff class="pd-hint"></div>
      <label class="field"><span>${tr('备注（破损、少箱等）', 'Note (damage, missing cartons…)')}</span><input name="note" maxlength="300"></label>
      <p class="sc-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="sc-receive">${tr('确认入库', 'Receive')}</button>`);
  }
  function statusDialog(x) {
    ctx.modal(tr('更新状态 / ETA', 'Update status / ETA'), `<form id="sc-status" class="sc-form" data-id="${esc(x.id)}"><div class="sc-grid2">
      <label class="field"><span>${tr('状态', 'Status')}</span><select name="status">${['at_sea', 'at_port', 'customs'].map(k => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${tr(SHIP[k][0], SHIP[k][1])}</option>`).join('')}</select></label>
      <label class="field"><span>${tr('预计到港 ETA', 'ETA')}</span><input type="date" name="eta" value="${esc(x.eta || '')}"></label></div>
      <label class="field"><span>${tr('备注', 'Note')}</span><input name="note" maxlength="1000" value="${esc(x.note || '')}"></label><p class="sc-error" role="alert"></p></form>`,
      `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="sc-status">${tr('保存', 'Save')}</button>`);
  }
  const SETTINGS = [['shipDays', '海运天数', 'Ocean days'], ['safetyDays', '安全库存天数', 'Safety stock days'], ['prodDaysMachine', '整机生产天数', 'Machine production days'], ['prodDaysOther', '配件生产天数', 'Accessory production days'],
    ['orderCoverDays', '每次补货覆盖天数', 'Days each order covers'], ['agedDays', '超过多少天算存放过长', 'Aged after (days)'], ['overstockDays', '可售超过多少天算库存过多', 'Overstocked above (days of cover)']];
  function settingsDialog() {
    const s = set();
    ctx.modal(tr('补货参数', 'Replenishment rules'), `<form id="sc-settings" class="sc-form"><div class="sc-grid2">${SETTINGS.map(([k, zh, en]) => `<label class="field"><span>${tr(zh, en)}</span><input type="number" min="0" max="730" step="1" name="${k}" value="${esc(s[k])}" required></label>`).join('')}</div>
      <p class="pd-hint">${tr('补货点 = DS30 ×（生产 + 海运 + 安全库存天数）。建议补货量再加上“每次补货覆盖天数”的用量，减去美国仓、在途和工厂仓。', 'Reorder point = DS30 × (production + ocean + safety days). The suggested quantity adds the days each order covers, minus US, transit and factory stock.')}</p><p class="sc-error" role="alert"></p></form>`,
      `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="sc-settings">${tr('保存', 'Save')}</button>`);
  }
  let lotRows = null;
  function lotsDialog() {
    lotRows = null;
    ctx.modal(tr('导入期初库龄', 'Import opening stock age'), `<form id="sc-lots" class="sc-form" data-upload-scope="sc-lots-file">
      <p>${tr('上传美国仓现有库存的入仓批次：每行一个批次，写 SKU、入仓日期、数量（可加批次号）。表里出现的 SKU 会用新表替换原来的批次；没出现的不变。', 'Upload the received batches of the stock now in the US warehouse: one batch per row with SKU, received date and quantity (batch number optional). SKUs in the file replace their earlier batches; others are unchanged.')}</p>
      <p><button type="button" class="pd-link" data-sc="lots-template">${icon('download-simple')} ${tr('下载模板（CSV）', 'Download template (CSV)')}</button></p>
      <label class="field"><span>${tr('数据截至日期', 'Data as of')}</span><input type="date" name="asOf" value="${new Date().toISOString().slice(0, 10)}" required></label>
      ${window.WorkOSUpload ? window.WorkOSUpload.html({ id:'sc-lots-file', lang:lang(), accept:['text/csv', '.csv'], multiple:false, maxBytes:5 * 1024 * 1024, hint:tr('Excel 另存为 CSV', 'Save Excel as CSV') }) : '<input type="file" accept=".csv" data-sc-lots-file>'}
      <div data-sc-lots-preview></div><p class="sc-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="sc-lots">${tr('确认导入', 'Import')}</button>`);
    window.WorkOSUpload?.register('sc-lots-file', { accept:['text/csv', '.csv'], multiple:false, maxBytes:5 * 1024 * 1024, lang:lang(), onFiles:async files => readLots(files[0]) });
  }
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
      if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c; }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(x => x.trim())).filter(r => r.some(Boolean));
  }
  const normDate = s => { const m = String(s).trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const u = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return u ? `${u[3]}-${u[1].padStart(2, '0')}-${u[2].padStart(2, '0')}` : ''; };
  async function readLots(file) {
    const f = document.getElementById('sc-lots'); if (!f || !file) return;
    const err = f.querySelector('.sc-error'), slot = f.querySelector('[data-sc-lots-preview]'); err.textContent = ''; slot.innerHTML = ''; lotRows = null;
    const grid = parseCsv((await file.text()).replace(/^﻿/, ''));
    if (grid.length < 2) { err.textContent = tr('文件里没有数据行。', 'The file has no data rows.'); return; }
    const head = grid[0].map(h => h.toLowerCase()), col = re => head.findIndex(h => re.test(h));
    const cs = col(/sku/), cd = col(/入仓|日期|date|received/), cq = col(/数量|qty|quantity/), cr = col(/批次|ref|batch/);
    if (cs < 0 || cd < 0 || cq < 0) { err.textContent = tr('表头需要包含：SKU、入仓日期、数量。', 'The header needs SKU, received date and quantity.'); return; }
    const rows = [], problems = [];
    grid.slice(1).forEach((r, i) => { const d = normDate(r[cd]), q = Number(String(r[cq]).replace(/,/g, ''));
      if (!r[cs] || !d || !(q > 0) || !Number.isInteger(q)) problems.push(tr(`第 ${i + 2} 行：SKU、日期（YYYY-MM-DD）或数量不正确`, `Row ${i + 2}: check the SKU, date (YYYY-MM-DD) and quantity`));
      else rows.push({ sku:r[cs], receivedOn:d, qty:q, ...(cr >= 0 && r[cr] ? { ref:r[cr].slice(0, 80) } : {}) }); });
    if (problems.length) { err.innerHTML = problems.slice(0, 8).map(esc).join('<br>'); return; }
    lotRows = rows;
    const skus = new Set(rows.map(r => r.sku.toLowerCase())), oldest = rows.map(r => r.receivedOn).sort()[0];
    slot.innerHTML = `<div class="pd-banner info">${icon('check-circle')} ${tr(`读取到 ${rows.length} 个批次、${skus.size} 个 SKU，共 ${n0(rows.reduce((n, r) => n + r.qty, 0))} 件；最早入仓 ${oldest}`, `${rows.length} batches, ${skus.size} SKUs, ${n0(rows.reduce((n, r) => n + r.qty, 0))} pcs; oldest ${oldest}`)}</div>`;
  }
  function downloadCsv(name, rows) {
    const cell = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'], { type:'text/csv;charset=utf-8' })); a.download = name; a.click();
  }
  function exportCsv() {
    const rows = rowsOf(D().items || []);
    downloadCsv(`supply-chain-${new Date().toISOString().slice(0, 10)}.csv`, [['SKU', tr('名称', 'Name'), tr('美国仓', 'US'), tr('东莞', 'Dongguan'), tr('济南', 'Jinan'), tr('在途', 'Transit'), tr('下一船 ETA', 'Next ETA'), 'DS7', 'DS30', 'DS90', tr('可售天数', 'Cover days'), tr('平均库龄', 'Avg age'), tr('最老一批', 'Oldest'), tr('状态', 'Status'), tr('建议调货', 'Transfer'), tr('建议下单', 'Order')],
      ...rows.map(x => [x.sku, nameOf(x), x.qty.us, x.qty.dg, x.qty.jn, x.qty.transit, x.nextEta?.date || '', x.ds7, x.ds30, x.ds90, x.cover ?? '', x.avgAge ?? '', x.oldestAge ?? '', x.flags.map(f => tr(STATE[f][0], STATE[f][1])).join(' / ') || tr('正常', 'Healthy'), x.transferQty || '', Math.max(0, x.reorderQty - x.transferQty) || ''])]);
  }

  /* ---------- events ---------- */
  const el = (f, n) => f.querySelector(`[name="${n}"]`), val = (f, n) => String(el(f, n)?.value ?? '').trim();
  const busy = (id, on) => { const b = document.querySelector(`button[form="${id}"]`); if (b) b.disabled = on; };
  async function submit(id, f, fn, ok) {
    const err = f.querySelector('.sc-error'); err.textContent = ''; busy(id, true);
    try { const r = await fn(); ctx.closeOverlay?.(); ctx.toast?.(typeof ok === 'function' ? ok(r) : ok); await reload(); }
    catch (x) { err.textContent = x?.message || tr('保存失败', 'Could not save'); busy(id, false); }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-sc]'); if (!b || !ctx) return;
    const a = b.dataset.sc, x = b.dataset.id ? shipById(b.dataset.id) : null;
    if (a === 'filter') { S.filter = b.dataset.v; return ctx.rerender(); }
    if (a === 'all') { S.showAll = true; return ctx.rerender(); }
    if (a === 'toggle-received') { S.showReceived = !S.showReceived; return ctx.rerender(); }
    if (a === 'refresh') return reload();
    if (a === 'export') return exportCsv();
    if (a === 'new-ship') return shipDialog(null);
    if (a === 'edit-ship' && x) return shipDialog(x);
    if (a === 'depart' && x) return departDialog(x);
    if (a === 'receive' && x) return receiveDialog(x);
    if (a === 'status' && x) return statusDialog(x);
    if (a === 'settings') return settingsDialog();
    if (a === 'lots') return lotsDialog();
    if (a === 'lots-template') return downloadCsv('stock-age-template.csv', [['SKU', '入仓日期', '数量', '批次号'], ['EXAMPLE-SKU-01', '2026-08-15', '20', 'PO-EXAMPLE-1']]);
    if (a === 'cancel' && x) { if (!window.confirm?.(tr(`确定取消船次 ${x.vessel} ${x.voyage}？`, `Cancel shipment ${x.vessel} ${x.voyage}?`))) return;
      ctx.api.post(`/supply/shipments/${encodeURIComponent(x.id)}/cancel`, {}).then(() => { ctx.toast?.(tr('船次已取消', 'Shipment cancelled')); reload(); }).catch(y => ctx.toast?.(y?.message || tr('取消失败', 'Could not cancel'))); }
  });
  let searchTimer = null;
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches?.('[data-sc-lines]')) linesPreview(t.closest('form'));
    if (t.matches?.('.sc-count')) {
      const f = t.closest('form'), diffs = [...f.querySelectorAll('.sc-count')].filter(i => i.value !== '' && Number(i.value) !== Number(i.dataset.packed));
      f.querySelector('[data-sc-receive-diff]').innerHTML = diffs.length ? `<span class="sc-diff">${icon('warning')} ${tr(`${diffs.length} 行和装箱单不一致，入库后会生成盘点差异待主管确认`, `${diffs.length} lines differ from the packing list; a count adjustment will await your manager`)}</span>` : '';
    }
    if (t.matches?.('[data-sc-search]')) { S.q = t.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { ctx.rerender(); const box = document.querySelector('[data-sc-search]'); if (box) { box.focus(); box.setSelectionRange(S.q.length, S.q.length); } }, 250); }
  });
  document.addEventListener('change', e => {
    if (e.target.closest?.('#sc-ship') && e.target.name === 'from') linesPreview(e.target.closest('form'));
    if (e.target.matches?.('[data-sc-lots-file]')) readLots(e.target.files?.[0]);
  });
  document.addEventListener('submit', e => {
    const f = e.target; if (!f.id?.startsWith('sc-') || !ctx) return;
    e.preventDefault();
    const err = f.querySelector('.sc-error'), id = f.dataset.id;
    if (f.id === 'sc-ship') {
      const r = linesPreview(f);
      if (r.problems.length || !r.lines.length) { err.textContent = r.problems[0] || tr('请填写至少一行货物明细。', 'Add at least one cargo line.'); return; }
      const body = { ...Object.fromEntries(['vessel', 'voyage', 'blNo', 'containers', 'forwarder', 'originPort', 'destPort', 'note'].map(k => [k, val(f, k)])), etd:val(f, 'etd') || null, eta:val(f, 'eta') || null, lines:r.lines };
      return submit(f.id, f, () => id ? ctx.api.request(`/supply/shipments/${encodeURIComponent(id)}`, { method:'PATCH', body }) : ctx.api.post('/supply/shipments', body), id ? tr('船次已更新', 'Shipment updated') : tr('船次已登记（已订舱）', 'Shipment booked'));
    }
    if (f.id === 'sc-depart') return submit(f.id, f, () => ctx.api.post(`/supply/shipments/${encodeURIComponent(id)}/depart`, { stockAlreadyInTransit:!!el(f, 'already')?.checked }), tr('已开船，货物已转到“在途”', 'Sailed; the goods are now in transit'));
    if (f.id === 'sc-receive') {
      const inputs = [...f.querySelectorAll('.sc-count')], empty = inputs.filter(i => i.value === '' || !(Number(i.value) >= 0) || !Number.isInteger(Number(i.value)));
      if (empty.length) { err.textContent = tr(`请逐行填写实收数量（还有 ${empty.length} 行没填）。`, `Enter the counted quantity of every line (${empty.length} missing).`); empty[0].focus(); return; }
      return submit(f.id, f, () => ctx.api.post(`/supply/shipments/${encodeURIComponent(id)}/receive`, { lines:inputs.map(i => ({ lineNo:Number(i.dataset.line), received:Number(i.value) })), ...(val(f, 'note') ? { note:val(f, 'note') } : {}) }),
        r => r.differences ? tr(`已入库 ${n0(r.units)} 件；${r.differences} 行有差异，已提交主管确认`, `${n0(r.units)} pcs received; ${r.differences} differences await your manager`) : tr(`已入库 ${n0(r.units)} 件，美国仓库存已增加`, `${n0(r.units)} pcs received into the US warehouse`));
    }
    if (f.id === 'sc-status') return submit(f.id, f, () => ctx.api.request(`/supply/shipments/${encodeURIComponent(id)}`, { method:'PATCH', body:{ status:val(f, 'status'), eta:val(f, 'eta') || null, note:val(f, 'note') } }), tr('已更新', 'Updated'));
    if (f.id === 'sc-settings') return submit(f.id, f, () => ctx.api.request('/supply/settings', { method:'PUT', body:Object.fromEntries(SETTINGS.map(([k]) => [k, Number(val(f, k))])) }), tr('补货参数已保存，已按新参数重新计算', 'Rules saved and recalculated'));
    if (f.id === 'sc-lots') {
      if (!lotRows) { err.textContent = tr('请先上传可以读取的 CSV 文件。', 'Upload a readable CSV file first.'); return; }
      return submit(f.id, f, () => ctx.api.post('/supply/lots/import', { asOf:val(f, 'asOf'), rows:lotRows }), r => tr(`已导入 ${r.rows} 个批次（${r.skus} 个 SKU），库龄已重新计算`, `${r.rows} batches (${r.skus} SKUs) imported; stock age recalculated`));
    }
  });

  window.WorkOSSupply = { configure, render, _parseLines:parseLines, _state:S };
})();
