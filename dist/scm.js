/*
 * Supply chain (SCM): a lean decision board.
 *  - Reorder: daily sales (DS) per SKU from Shopify over 365, 90 and 30 days, a forecast with seasonality and bursts, the monthly need, what the US LA warehouse
 *    holds and what is on the way, and the suggestion: ship from factory stock, or order production.
 *  - In transit: containers and parcels with tracking, ship date, days to arrive and the SKUs and quantities on board.
 *    Creating one moves the goods to "in transit" in WMS; the arrival notice hands it to WMS 到港入仓, where the warehouse
 *    confirms each line (quantity and bin) and only then the goods move into the US LA warehouse.
 * Data comes from /scm/* (server). No sales or stock data is bundled here.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '', busy = false;
  const ui = { tab:'reorder', q:'', status:'', sort:'', dir:1 };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US');
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  // Three statuses (owner, 2026-11-12): 缺货风险 / 正常 / 库存过多; the 系统判断 column says why.
  const STATUS = { risk:['缺货风险', 'Stockout risk', 'red'], ok:['正常', 'Normal', 'green'], overstock:['库存过多', 'Overstock', 'blue'] };
  const ORDER = ['risk', 'ok', 'overstock'];
  const MODE = { sea:['海运', 'Sea'], air:['空运', 'Air'], express:['快递', 'Express'], truck:['卡车', 'Truck'] };
  const SOURCE = { dg:['东莞工厂仓', 'Dongguan factory'], jn:['济南工厂仓', 'Jinan factory'], new:['工厂直发（新生产）', 'New from production'] };
  const w = p => p ? tr(p[0], p[1]) : '';
  const nameOf = it => (lang() === 'en' ? it.nameEn || it.nameZh : it.nameZh || it.nameEn) || '';

  function configure(next) { ctx = next; }
  function reset() { data = null; error = ''; loading = false; Object.assign(ui, { tab:'reorder', q:'', status:'', sort:'', dir:1 }); }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/scm/board'); error = ''; } catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }

  function render() {
    if (!data && !error) { load(); return `<div class="scm"><p class="scm-hint">${tr('正在读取供应链数据…', 'Loading the supply chain…')}</p></div>`; }
    if (error && !data) return `<div class="scm"><div class="scm-alert">${esc(error)}</div></div>`;
    const it = data.items, s = data.settings, sh = data.shopify, open = data.shipments.filter(x => x.status !== 'arrived');
    const count = k => it.filter(x => x.status === k).length, sum = k => it.reduce((a, x) => a + (x[k] || 0), 0);
    const kpi = (label, value, note, cls = '') => `<div class="scm-kpi ${cls}"><span>${label}</span><b>${value}</b><em>${note}</em></div>`;
    return `<div class="scm">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · SCM</div><h1>${tr('供应链管理（SCM）', 'Supply chain (SCM)')}</h1>
        <p>${tr(`按 Shopify 日销（DS）算每个 SKU 一个月要多少货、该补多少；在途货柜看到哪里了。补货目标：到仓天数 + ${s.targetDays} 天销量 + ${s.safetyDays} 天安全库存。`, `Daily sales (DS) from Shopify drive each SKU's monthly need and reorder; containers show what is on the way. Target: lead time + ${s.targetDays} days of sales + ${s.safetyDays} safety days.`)}</p></div>
        <div class="heading-actions">${window.WorkOSErpAccess?.button?.('supply') || ''}${data.canManage ? `<button class="btn" data-scm="settings">${icon('sliders-horizontal')} ${tr('补货参数', 'Reorder settings')}</button><button class="btn primary" data-scm="sync" ${busy ? 'disabled' : ''}>${icon('arrows-clockwise')} ${busy ? tr('同步中…', 'Syncing…') : tr('同步 Shopify 销量', 'Sync Shopify sales')}</button>` : ''}</div></div>
      <div class="scm-sync ${sh.configured ? '' : 'off'}">${icon('storefront')} ${!sh.configured && sh.lastAt && sh.units ? tr(`Shopify 还没连接到这个站点；下面是已有的销量数据（${sh.since} 起 ${fmt(sh.units)} 件${sh.note ? '，' + esc(sh.note) : ''}）。`, `Shopify is not connected here; the board uses the sales already stored (${fmt(sh.units)} units since ${sh.since}${sh.note ? ', ' + esc(sh.note) : ''}).`)
        : !sh.configured ? tr('Shopify 还没连接：请主管理员在部署配置里设置 Shopify（需要 read_orders 和 read_all_orders 权限，才能读到 365 天的订单）。没连接之前，日销都是 0。', 'Shopify is not connected yet: a main admin sets it in the deployment settings (read_orders and read_all_orders are needed for 365 days of orders). Until then daily sales are 0.')
        : sh.lastAt ? tr(`Shopify 已连接 · 最近同步 ${new Date(sh.lastAt).toLocaleString('zh-CN')} ${sh.status === 'failed' ? '（失败）' : `· ${sh.since} 起 ${fmt(sh.orders)} 单、${fmt(sh.units)} 件`} · 日销按 ${sh.daysOfHistory} 天算`, `Shopify connected · last sync ${new Date(sh.lastAt).toLocaleString('en-US')} ${sh.status === 'failed' ? '(failed)' : `· since ${sh.since}: ${fmt(sh.orders)} orders, ${fmt(sh.units)} units`} · DS over ${sh.daysOfHistory} days`)
        : tr('Shopify 已连接，还没同步过：点右上角“同步 Shopify 销量”。', 'Shopify connected, not synced yet: use Sync Shopify sales.')}</div>
      <div class="scm-kpis">
        ${kpi(tr('缺货风险', 'Stockout risk'), count('risk'), tr('现有货撑不到补货到仓', 'runs out before a reorder arrives'), count('risk') ? 'red' : '')}
        ${kpi(tr('库存过多', 'Overstock'), count('overstock'), tr('超出目标 90 天以上', '90+ days beyond the target'), count('overstock') ? 'amber' : '')}
        ${kpi(tr('建议工厂发货', 'Ship from factory'), fmt(sum('ship')), tr('件（用工厂现货）', 'units from factory stock'))}
        ${kpi(tr('建议下单生产', 'Order production'), fmt(sum('make')), tr('件', 'units'))}
        ${kpi(tr('在途货柜', 'In transit'), open.length, tr(`${fmt(open.reduce((a, x) => a + x.units, 0))} 件 · ${open.filter(x => x.daysLeft < 0).length} 个已过预计到港`, `${fmt(open.reduce((a, x) => a + x.units, 0))} units · ${open.filter(x => x.daysLeft < 0).length} past ETA`), open.some(x => x.daysLeft < 0) ? 'amber' : '')}
      </div>
      <div class="scm-tabs"><button class="${ui.tab === 'reorder' ? 'on' : ''}" data-scm="tab" data-v="reorder">${icon('chart-line-up')} ${tr('补货建议', 'Reorder')}</button><button class="${ui.tab === 'orders' ? 'on' : ''}" data-scm="tab" data-v="orders">${icon('clipboard-text')} ${tr('采购下单', 'Purchase orders')} <b>${(data.orders || []).filter(o => o.status === 'open').length}</b></button><button class="${ui.tab === 'ship' ? 'on' : ''}" data-scm="tab" data-v="ship">${icon('boat')} ${tr('在途货柜', 'In transit')} <b>${open.length}</b></button></div>
      ${ui.tab === 'reorder' ? reorderView() : ui.tab === 'orders' ? ordersView() : shipView()}
    </div>`;
  }

  const sortTh = (k, label, cls = '') => `<th class="${cls} scm-sort ${ui.sort === k ? 'on' : ''}" data-scm="sort" data-v="${k}">${label}${ui.sort === k ? (ui.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const daysWhy = x => { const s = data.settings;
    return tr(`下单 ${s.orderDays} + ${x.factory > 0 ? '生产 0（工厂有现货）' : `生产 ${x.productionDays}`} + 头程 ${x.firstLegDays} + 清关收货 ${s.receiveDays} + 意外 ${s.bufferDays} = ${x.leadDays} 天`,
      `order ${s.orderDays} + ${x.factory > 0 ? 'production 0 (factory stock)' : `production ${x.productionDays}`} + first leg ${x.firstLegDays} + receiving ${s.receiveDays} + buffer ${s.bufferDays} = ${x.leadDays} days`); };
  /** One plain sentence on what the system saw and what it suggests (owner, 2026-11-12). */
  function why(x) {
    const parts = [], sep = tr('；', '; ');
    if (x.signal === 'spike') parts.push(tr(`近 30 天日销 ${x.ds30}，比近 90 天${x.trendPct != null ? `高 ${x.trendPct}%` : '明显高'}（短期爆发，只部分计入）`, `30-day sales ${x.ds30}/day, ${x.trendPct != null ? x.trendPct + '% above' : 'well above'} the 90-day rate (a burst, counted in partly)`));
    if (x.signal === 'dip') parts.push(tr(`近 30 天日销 ${x.ds30}，比近 90 天低 ${Math.abs(x.trendPct)}%（短期下滑）`, `30-day sales ${x.ds30}/day, ${Math.abs(x.trendPct)}% below the 90-day rate (a dip)`));
    if (x.season >= 1.15) parts.push(tr(`去年接下来 90 天是全年平均的 ${x.season} 倍（旺季）`, `last year the coming 90 days sold ${x.season}× the yearly average (peak season)`));
    if (x.season <= 0.85) parts.push(tr(`去年接下来 90 天是全年平均的 ${x.season} 倍（淡季）`, `last year the coming 90 days sold ${x.season}× the yearly average (low season)`));
    parts.push(tr(`预测日销 ${x.forecast}`, `forecast ${x.forecast}/day`));
    if (x.wip) parts.push(tr(`在产 ${fmt(x.wip)} 件已算进建议生产`, `${fmt(x.wip)} in production counted in`));
    const plan = x.ship || x.make ? tr(`建议${x.ship ? `工厂现货先发 ${fmt(x.ship)} 件` : ''}${x.ship && x.make ? '，再' : ''}${x.make ? `下单生产 ${fmt(x.make)} 件${x.moq ? `（起订量 ${x.moq}）` : ''}` : ''}。`,
      `Suggest ${x.ship ? `shipping ${fmt(x.ship)} from factory stock` : ''}${x.ship && x.make ? ', then ' : ''}${x.make ? `ordering ${fmt(x.make)} from production${x.moq ? ` (MOQ ${x.moq})` : ''}` : ''}.`) : '';
    if (x.status === 'overstock' && !x.forecast) return tr('有库存但最近一年没有销量：暂停补货，考虑清库存。', 'Stock but no sales in the past year: hold reorders and consider clearing it.');
    if (!x.forecast) return tr('没有销量也没有库存：不建议补货。', 'No sales and no stock: no reorder suggested.');
    const head = parts.join(sep);
    if (x.status === 'risk') return head + tr(`。现有货（美国仓 + 在途）够卖 ${x.cover} 天，补货要 ${x.leadDays} 天才到仓，会断货约 ${x.shortDays} 天。`, `. Stock on hand and on the way lasts ${x.cover} days; a reorder takes ${x.leadDays} days, so about ${x.shortDays} days without stock. `) + plan;
    if (x.status === 'overstock') return head + tr(`。现有货够卖 ${x.cover} 天，比目标（${x.horizon} 天）多出 ${x.cover - x.horizon} 天：暂停补货，可考虑促销。`, `. Stock lasts ${x.cover} days, ${x.cover - x.horizon} days beyond the target (${x.horizon}): hold reorders, consider a promotion.`);
    return head + tr(`。现有货够卖 ${x.cover} 天，撑得到补货到仓（${x.leadDays} 天）。`, `. Stock lasts ${x.cover} days, enough until a reorder arrives (${x.leadDays} days). `) + (plan || tr('暂不需要补货。', 'No reorder needed yet.'));
  }
  function reorderView() {
    const q = ui.q.trim().toLowerCase(), s = data.settings;
    let list = data.items.filter(x => (!ui.status || x.status === ui.status) && (!q || [x.sku, x.nameZh, x.nameEn].some(v => String(v || '').toLowerCase().includes(q))));
    const key = x => ui.sort === 'sku' ? x.sku : ui.sort ? (x[ui.sort] ?? -1) : ORDER.indexOf(x.status) * 1e6 + (x.cover ?? 999999);
    list = list.slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * (ui.sort ? ui.dir : 1); });
    const chips = [['', tr('全部', 'All'), data.items.length], ...ORDER.map(k => [k, w(STATUS[k]), data.items.filter(x => x.status === k).length])];
    const trend = x => x.signal === 'spike' ? ` <span class="up" title="${tr('短期爆发', 'burst')}">▲${x.trendPct != null ? x.trendPct + '%' : ''}</span>` : x.signal === 'dip' ? ` <span class="down" title="${tr('短期下滑', 'dip')}">▼${Math.abs(x.trendPct)}%</span>` : '';
    return `<div class="scm-bar"><label class="scm-search">${icon('magnifying-glass')}<input data-scm-q value="${esc(ui.q)}" placeholder="${tr('搜索 SKU 或名称', 'Search SKU or name')}"></label>
        <div class="scm-chips">${chips.map(([k, label, n]) => `<button class="${ui.status === k ? 'on' : ''}" data-scm="status" data-v="${k}">${esc(label)} <b>${n}</b></button>`).join('')}</div></div>
      <div class="scm-table-wrap"><table class="scm-table"><thead><tr>${sortTh('sku', 'SKU')}<th>${tr('产品', 'Product')}</th>${sortTh('ds365', tr('DS · 365 天', 'DS · 365d'), 'num')}${sortTh('ds90', tr('DS · 90 天', 'DS · 90d'), 'num')}${sortTh('ds30', tr('DS · 30 天', 'DS · 30d'), 'num')}${sortTh('forecast', tr('预测日销', 'Forecast / day'), 'num')}
        ${sortTh('us', tr('美国LA仓', 'US LA'), 'num')}${sortTh('transit', tr('在途', 'In transit'), 'num')}${sortTh('dg', tr('东莞工厂仓', 'Dongguan'), 'num')}${sortTh('jn', tr('济南工厂仓', 'Jinan'), 'num')}
        ${sortTh('finished', tr('成品合计', 'Finished'), 'num scm-tot')}${sortTh('wip', tr('在产（半成品）', 'In production'), 'num')}${sortTh('pipeline', tr('成品 + 在产', 'Finished + WIP'), 'num scm-tot')}${sortTh('cover', tr('可售天数', 'Days of cover'), 'num')}
        <th>${tr('最小起订量', 'MOQ')}</th>${sortTh('productionDays', tr('生产（天）', 'Production (d)'), 'num')}${sortTh('firstLegDays', tr('头程（天）', 'First leg (d)'), 'num')}${sortTh('leadDays', tr('到仓（天）', 'To warehouse (d)'), 'num')}${sortTh('arriveOn', tr('预计到仓', 'Arrives'), 'num')}
        ${sortTh('ship', tr('建议发货', 'Ship'), 'num')}${sortTh('make', tr('建议生产', 'Produce'), 'num')}<th>${tr('状态', 'Status')}</th><th class="scm-why-h">${tr('系统判断', 'Why')}</th></tr></thead><tbody>
        ${list.map(x => { const st = STATUS[x.status] || STATUS.ok;
          return `<tr><td class="mono">${esc(x.sku)}</td><td>${esc(nameOf(x))}</td><td class="num">${x.ds365}</td><td class="num">${x.ds90}</td><td class="num">${x.ds30}${trend(x)}</td>
            <td class="num" title="${tr(`季节系数 ${x.season}`, `season ${x.season}`)}"><b>${x.forecast}</b></td>
            <td class="num">${fmt(x.us)}</td><td class="num">${fmt(x.transit)}</td><td class="num">${fmt(x.dg)}</td><td class="num">${fmt(x.jn)}</td>
            <td class="num scm-tot"><b>${fmt(x.finished)}</b></td><td class="num">${x.wip ? fmt(x.wip) : '—'}</td><td class="num scm-tot"><b>${fmt(x.pipeline)}</b></td>
            <td class="num ${x.status === 'risk' ? 'red' : ''}" title="${tr('美国仓 + 在途能卖的天数；成品合计和成品 + 在产能卖的天数在下面', 'Days that US + in transit last; below: finished, and finished + in production')}">${x.cover == null ? '—' : fmt(x.cover) + tr(' 天', 'd')}${x.coverAll != null ? `<small class="scm-sub">${tr(`成品 ${fmt(x.coverFinished)} · 含在产 ${fmt(x.coverAll)}`, `fin. ${fmt(x.coverFinished)} · +WIP ${fmt(x.coverAll)}`)}</small>` : ''}</td>
            <td>${esc(x.moq || '—')}</td><td class="num">${x.productionDays}${x.productionFromLibrary ? '' : '*'}</td><td class="num">${x.firstLegDays}${x.firstLegFromLibrary ? '' : '*'}</td>
            <td class="num" title="${esc(daysWhy(x))}"><b>${x.leadDays}</b>${x.factory > 0 ? `<small class="scm-sub">${tr('现货', 'stock')} · ${tr('生产要', 'make')} ${x.supplyDays}</small>` : ''}</td><td class="num">${esc(String(x.arriveOn || '').slice(5))}</td>
            <td class="num">${x.ship ? `<b>${fmt(x.ship)}</b>` : '—'}</td><td class="num">${x.make ? `<b class="red">${fmt(x.make)}</b>${data.canManage ? `<button class="scm-link" data-scm="order-sku" data-sku="${esc(x.sku)}" data-qty="${x.make}">${tr('下单', 'Order')}</button>` : ''}` : '—'}</td>
            <td><span class="scm-pill ${st[2]}">${w(st)}</span></td><td class="scm-why">${esc(why(x))}</td></tr>`; }).join('') || `<tr><td colspan="23" class="scm-empty">${tr('没有符合的 SKU', 'No matching SKU')}</td></tr>`}
      </tbody></table></div>
      <p class="scm-hint">${tr(`预测日销 = 40% 近 30 天 + 30% 近 90 天 + 30% 全年 × 季节系数（去年接下来 90 天 ÷ 全年平均，0.5–2 倍，满一年数据才算）；短期爆发最多按近 90 天的 2 倍计入。到仓天数 = 下单 ${s.orderDays} + 生产交期 + 头程 + 清关收货 ${s.receiveDays} + 意外 ${s.bufferDays} 天，工厂仓有现货时不算生产；生产交期和头程取产品资料，带 * 的用补货参数的默认值。可售天数 = (美国仓 + 在途) ÷ 预测日销；成品合计 = 美国仓 + 在途 + 东莞 + 济南；在产 = 采购单里还没完工的数量。建议发货按成品算（美国仓 + 在途不够的从工厂成品发），建议生产按成品 + 在产算（在产已经算进去，不会重复下单）。缺货风险 = 可售天数短于到仓天数；库存过多 = 比目标（到仓 + ${s.targetDays} + 安全 ${s.safetyDays} 天）多 90 天以上。`,
        `Forecast = 40% last 30 days + 30% last 90 days + 30% the year × season (last year's next 90 days ÷ yearly average, 0.5–2×, with a full year of data); a burst counts in up to 2× the 90-day rate. Days to warehouse = order ${s.orderDays} + production + first leg + receiving ${s.receiveDays} + buffer ${s.bufferDays}; no production while the factory has stock; * = default from the settings. Cover = (US + in transit) ÷ forecast; finished = US + in transit + Dongguan + Jinan; in production = ordered, not finished yet. Shipping is worked out on finished goods, production on finished + in production (so nothing is ordered twice). Risk = cover shorter than days to warehouse; overstock = 90+ days beyond the target (days to warehouse + ${s.targetDays} + safety ${s.safetyDays}).`)}</p>`;
  }

  function shipView() {
    const list = data.shipments.slice().sort((a, b) => (a.status === b.status ? 0 : a.status === 'arrived' ? 1 : b.status === 'arrived' ? -1 : 0) || String(a.eta).localeCompare(String(b.eta)));
    const trackLink = t => /^https:\/\//.test(t) ? `<a href="${esc(t)}" target="_blank" rel="noopener">${esc(t.replace(/^https:\/\/(www\.)?/, '').slice(0, 40))}</a>` : esc(t || '—');
    const item = sku => data.items.find(i => i.sku.toLowerCase() === String(sku).toLowerCase());
    const pill = x => x.status === 'arrived' ? ['green', tr(`已入仓 ${x.arrivedOn}`, `Received ${x.arrivedOn}`)] : x.status === 'at_port' ? ['amber', tr(`已到港 · 待仓库入仓`, 'At port · awaiting receipt')]
      : x.daysLeft < 0 ? ['red', tr(`已超预计到港 ${-x.daysLeft} 天`, `${-x.daysLeft} days past ETA`)] : ['blue', tr(`还有 ${x.daysLeft} 天到港`, `${x.daysLeft} days to port`)];
    // Where the ship is: the share of the voyage gone by the dates, plus the latest position supply chain noted.
    const voyage = x => { const pct = x.status === 'in_transit' ? Math.min(100, Math.round(x.daysGone / x.daysTotal * 100)) : 100;
      return `<div class="scm-voyage"><div class="scm-track"><i style="width:${pct}%"></i><span class="boat" style="left:${pct}%">${icon(x.mode === 'air' ? 'airplane-tilt' : x.mode === 'truck' ? 'truck' : x.mode === 'express' ? 'package' : 'boat')}</span></div>
        <div class="scm-stops"><span>${tr('发货', 'Shipped')} ${esc(x.shippedOn)}</span><span>${x.status === 'in_transit' ? tr(`已走 ${Math.min(x.daysGone, x.daysTotal)} / ${x.daysTotal} 天`, `${Math.min(x.daysGone, x.daysTotal)} / ${x.daysTotal} days`) : ''}</span><span>${tr('预计到港', 'ETA')} <b>${esc(x.eta)}</b></span></div>
        <div class="scm-pos">${icon('map-pin')} ${x.position ? `<b>${esc(x.position)}</b> <small>${tr('更新于', 'as of')} ${esc(x.positionOn || '')}</small>` : `<span class="scm-hint">${tr('还没有更新位置', 'No position noted yet')}</span>`}
          ${data.canManage && x.status === 'in_transit' ? `<button class="scm-link" data-scm="pos" data-id="${esc(x.id)}">${tr('更新位置 / 到港日期', 'Update position / ETA')}</button>` : ''}</div></div>`; };
    return `<div class="scm-bar"><span class="scm-hint">${tr('新建货柜时，货会从工厂仓（或作为新生产的货）转到“在途运输中”。到港后点“到港通知”，货柜进入 WMS 的“到港入仓”，由仓库逐行确认数量和库位后才转进美国LA仓。', 'A new shipment moves the goods to In transit. At port, “Arrival notice” sends it to WMS “Arrivals”, where the warehouse confirms each line’s quantity and bin before the goods move into the US LA warehouse.')}</span><span class="scm-sp"></span>
        ${data.canManage ? `<button class="btn primary" data-scm="new-ship">${icon('plus')} ${tr('新建货柜', 'New shipment')}</button>` : ''}</div>
      <div class="scm-ships">${list.map(x => { const [cls, label] = pill(x), po = x.orderId && (data.orders || []).find(o => o.id === x.orderId);
        return `<div class="scm-ship ${x.status}">
        <div class="head"><b class="mono">${esc(x.number)}</b><span class="scm-pill ${cls}">${label}</span>
          <span class="scm-sp"></span>${data.canManage && x.status === 'in_transit' ? `<button class="btn small" data-scm="notify" data-id="${esc(x.id)}">${icon('bell-ringing')} ${tr('到港通知', 'Arrival notice')}</button>` : ''}</div>
        ${voyage(x)}
        <dl><div><dt>${tr('方式', 'Mode')}</dt><dd>${esc(w(MODE[x.mode]))}${x.carrier ? ' · ' + esc(x.carrier) : ''}</dd></div><div><dt>Tracking</dt><dd>${trackLink(x.tracking)}</dd></div>
          <div><dt>${tr('来源', 'From')}</dt><dd>${esc(w(SOURCE[x.source]))}</dd></div><div><dt>${tr('采购单', 'Purchase order')}</dt><dd>${po ? `<span class="mono">${esc(po.number)}</span>` : '—'}</dd></div></dl>
        <table class="scm-table scm-ship-skus"><thead><tr><th>SKU</th><th>${tr('产品', 'Product')}</th><th class="num">${tr('数量', 'Qty')}</th>${x.status === 'arrived' ? `<th class="num">${tr('实收', 'Received')}</th>` : ''}</tr></thead><tbody>
          ${x.lines.map(l => { const it = item(l.sku); return `<tr><td class="mono"><b>${esc(l.sku)}</b></td><td>${esc(it ? nameOf(it) : '')}</td><td class="num"><b>${fmt(l.qty)}</b></td>${x.status === 'arrived' ? `<td class="num ${l.received != null && l.received < l.qty ? 'red' : ''}">${fmt(l.received ?? l.qty)}</td>` : ''}</tr>`; }).join('')}
          <tr class="sum"><td colspan="2">${tr(`共 ${x.lines.length} 个 SKU`, `${x.lines.length} SKUs`)}</td><td class="num"><b>${fmt(x.units)}</b></td>${x.status === 'arrived' ? '<td></td>' : ''}</tr></tbody></table>
        ${x.note ? `<p class="scm-hint">${esc(x.note)}</p>` : ''}</div>`; }).join('') || `<p class="scm-empty">${tr('还没有在途货柜', 'Nothing in transit')}</p>`}</div>`;
  }
  /* 采购下单: what was ordered from which factory, when, how many, and when it should be ready. */
  const FACTORY = { dg:['东莞工厂', 'Dongguan factory'], jn:['济南工厂', 'Jinan factory'], other:['其他供应商', 'Other supplier'] };
  function ordersView() {
    const list = data.orders || [];
    return `<div class="scm-bar"><span class="scm-hint">${tr('下单后，还没完工的数量就是“在产（半成品）”，算进补货建议，不会重复下单。工厂做完点“完工入库”，货进东莞 / 济南工厂仓；从产线直接发柜的，在新建货柜时选对应的采购单。全部完工自动完成。', 'Ordered units not finished yet are “in production” and count in the reorder suggestion. When the factory finishes some, “Finished” puts them into the Dongguan / Jinan warehouse; goods shipped straight from production are picked on the new shipment. The order closes when all are finished.')}</span><span class="scm-sp"></span>
        ${data.canManage ? `<button class="btn primary" data-scm="new-po">${icon('plus')} ${tr('新建采购单', 'New purchase order')}</button>` : ''}</div>
      <div class="scm-table-wrap"><table class="scm-table"><thead><tr><th>${tr('采购单号', 'PO')}</th><th>${tr('工厂', 'Factory')}</th><th>${tr('下单日期', 'Ordered')}</th><th>${tr('预计完工', 'Ready by')}</th><th>${tr('SKU 和数量（已完工 / 下单）', 'SKUs (finished / ordered)')}</th><th class="num">${tr('在产', 'In production')}</th><th>${tr('状态', 'Status')}</th><th></th></tr></thead><tbody>
        ${list.map(o => `<tr><td class="mono"><b>${esc(o.number)}</b>${o.note ? `<small class="scm-sub">${esc(o.note)}</small>` : ''}</td><td>${esc(w(FACTORY[o.factory]))}</td><td>${esc(o.orderedOn)}</td>
          <td>${esc(o.readyOn || '—')}${o.daysToReady != null ? `<small class="scm-sub ${o.daysToReady < 0 ? 'red' : ''}">${o.daysToReady < 0 ? tr(`已超 ${-o.daysToReady} 天`, `${-o.daysToReady} days late`) : tr(`还有 ${o.daysToReady} 天`, `${o.daysToReady} days`)}</small>` : ''}</td>
          <td>${o.lines.map(l => `<div><span class="mono">${esc(l.sku)}</span> ${fmt(l.done)} / <b>${fmt(l.qty)}</b></div>`).join('')}</td><td class="num"><b>${fmt(o.left)}</b></td>
          <td><span class="scm-pill ${o.status === 'open' ? 'blue' : 'green'}">${o.status === 'open' ? tr('生产中', 'In production') : tr(`已完成 ${o.closedOn || ''}`, `Done ${o.closedOn || ''}`)}</span></td>
          <td class="nowrap">${data.canManage && o.status === 'open' ? `${['dg', 'jn'].includes(o.factory) ? `<button class="btn small" data-scm="finish-po" data-id="${esc(o.id)}">${icon('package')} ${tr('完工入库', 'Finished')}</button>` : ''}<button class="scm-link" data-scm="close-po" data-id="${esc(o.id)}">${tr('关闭', 'Close')}</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="8" class="scm-empty">${tr('还没有采购单', 'No purchase orders yet')}</td></tr>`}
      </tbody></table></div>`;
  }
  function newOrder(prefill) {
    shipLines = prefill ? [{ sku:prefill.sku, qty:String(prefill.qty) }] : [{ sku:'', qty:'' }];
    ctx.modal(tr('新建采购单', 'New purchase order'), `<form id="scm-po" class="scm-form"><div class="form-grid">
      <label class="field"><span>${tr('采购单号（不填自动生成）', 'PO number (blank = automatic)')}</span><input name="number" maxlength="60" placeholder="PO-${today().replace(/-/g, '')}-01"></label>
      <label class="field"><span>${tr('工厂', 'Factory')}</span><select name="factory">${Object.entries(FACTORY).map(([k, v]) => `<option value="${k}">${esc(w(v))}</option>`).join('')}</select></label>
      <label class="field"><span>${tr('下单日期', 'Order date')}</span><input name="orderedOn" type="date" required value="${today()}" min="2000-01-01"></label>
      <label class="field"><span>${tr('预计完工（不填 = 下单日 + 生产交期）', 'Ready by (blank = order date + production days)')}</span><input name="readyOn" type="date" min="2000-01-01"></label></div>
      <div class="scm-lines" data-scm-lines></div><button type="button" class="btn small" data-scm="add-line">${icon('plus')} ${tr('加一个 SKU', 'Add a SKU')}</button>
      <label class="field"><span>${tr('备注', 'Note')}</span><input name="note" maxlength="1000"></label>
      <datalist id="scm-skus">${data.items.map(x => `<option value="${esc(x.sku)}">${esc(nameOf(x))}</option>`).join('')}</datalist>
      <p class="scm-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="scm-po">${tr('保存采购单', 'Save order')}</button>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
    paintLines();
  }
  function finishForm(id) {
    const o = (data.orders || []).find(v => v.id === id); if (!o) return;
    ctx.modal(tr(`完工入库 · ${o.number}`, `Finished · ${o.number}`), `<form id="scm-finish" data-id="${esc(id)}" class="scm-form">
      <p class="scm-hint">${tr(`做完的数量会入到${w(FACTORY[o.factory])}仓，在产数量随之减少。`, `Finished units go into the ${w(FACTORY[o.factory])} warehouse; in production drops by as much.`)}</p>
      <label class="field"><span>${tr('完工日期', 'Date')}</span><input name="opDate" type="date" required value="${today()}" max="${today()}" min="2000-01-01"></label>
      <table class="scm-table"><thead><tr><th>SKU</th><th class="num">${tr('还在生产', 'In production')}</th><th class="num">${tr('这次完工', 'Finished now')}</th></tr></thead><tbody>
        ${o.lines.filter(l => l.qty > l.done).map(l => `<tr><td class="mono">${esc(l.sku)}</td><td class="num">${fmt(l.qty - l.done)}</td><td class="num"><input type="number" min="0" max="${l.qty - l.done}" data-scm-fin="${esc(l.sku)}" value="0" style="width:100px"></td></tr>`).join('')}</tbody></table>
      <p class="scm-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="scm-finish">${tr('入工厂仓', 'Into the factory warehouse')}</button>`);
  }
  function positionForm(id) {
    const x = data.shipments.find(v => v.id === id); if (!x) return;
    ctx.modal(tr(`更新位置 · ${x.number}`, `Update position · ${x.number}`), `<form id="scm-pos" data-id="${esc(id)}" class="scm-form">
      <label class="field"><span>${tr('现在到哪里了', 'Where is it now')}</span><input name="position" maxlength="160" value="${esc(x.position)}" placeholder="${tr('如：已过巴拿马运河 / 洛杉矶港排队卸货', 'e.g. through the Panama Canal / waiting at the Port of LA')}"></label>
      <label class="field"><span>${tr('预计到港日期（船期变了就改）', 'ETA (change it when the schedule slips)')}</span><input name="eta" type="date" value="${esc(x.eta)}" min="${esc(x.shippedOn)}"></label>
      <p class="scm-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="scm-pos">${tr('保存', 'Save')}</button>`);
  }

  /* New shipment: number, mode, carrier, tracking, source, ship date, days to arrive, SKUs and quantities. */
  let shipLines = [];
  function newShip() {
    shipLines = [{ sku:'', qty:'' }];
    const opt = (o, sel) => Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(w(v))}</option>`).join('');
    ctx.modal(tr('新建货柜', 'New shipment'), `<form id="scm-ship" class="scm-form"><div class="form-grid">
      <label class="field"><span>${tr('柜号 / 单号', 'Container / reference')}</span><input name="number" required maxlength="60" placeholder="MSKU1234567"></label>
      <label class="field"><span>${tr('方式', 'Mode')}</span><select name="mode">${opt(MODE, 'sea')}</select></label>
      <label class="field"><span>${tr('承运商', 'Carrier')}</span><input name="carrier" maxlength="80" placeholder="${tr('如 Matson / COSCO / DHL', 'e.g. Matson / COSCO / DHL')}"></label>
      <label class="field"><span>Tracking</span><input name="tracking" maxlength="120" placeholder="${tr('单号或查询链接', 'Number or tracking link')}"></label>
      <label class="field"><span>${tr('货从哪来', 'From')}</span><select name="source">${opt(SOURCE, 'dg')}</select></label>
      <label class="field"><span>${tr('发货日期', 'Ship date')}</span><input name="shippedOn" type="date" required value="${today()}" max="${today()}" min="2000-01-01" data-scm-eta-src></label>
      <label class="field"><span>${tr('预计多少天到', 'Days to arrive')}</span><input name="etaDays" type="number" min="0" max="180" required value="35" data-scm-eta-src></label>
      <label class="field"><span>${tr('预计到港日期', 'ETA')}</span><input name="eta" type="date" readonly data-scm-eta></label>
      <label class="field"><span>${tr('对应采购单（选填）', 'Purchase order (optional)')}</span><select name="orderId"><option value="">${tr('不关联', 'None')}</option>${(data.orders || []).filter(o => o.status === 'open').map(o => `<option value="${esc(o.id)}">${esc(o.number)} · ${tr(`未发 ${o.left} 件`, `${o.left} not shipped`)}</option>`).join('')}</select></label></div>
      <div class="scm-lines" data-scm-lines></div><button type="button" class="btn small" data-scm="add-line">${icon('plus')} ${tr('加一个 SKU', 'Add a SKU')}</button>
      <label class="field"><span>${tr('备注', 'Note')}</span><input name="note" maxlength="1000"></label>
      <datalist id="scm-skus">${data.items.map(x => `<option value="${esc(x.sku)}">${esc(nameOf(x))} · ${tr('东莞', 'DG')} ${x.factory}</option>`).join('')}</datalist>
      <p class="scm-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="scm-ship">${tr('保存，货转到在途', 'Save; move to in transit')}</button>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
    paintLines(); syncEta();
  }
  function paintLines() {
    const box = document.querySelector('[data-scm-lines]'); if (!box) return;
    box.innerHTML = `<table class="scm-table"><thead><tr><th>SKU</th><th>${tr('产品', 'Product')}</th><th class="num">${tr('数量', 'Qty')}</th><th></th></tr></thead><tbody>${shipLines.map((l, i) => { const it = data.items.find(x => x.sku.toLowerCase() === String(l.sku).toLowerCase());
      return `<tr><td><input list="scm-skus" data-scm-line-sku="${i}" value="${esc(l.sku)}" autocomplete="off" required placeholder="SKU"></td><td>${esc(it ? nameOf(it) : '')}</td><td class="num"><input type="number" min="1" step="1" required data-scm-line-qty="${i}" value="${esc(l.qty)}" style="width:96px"></td>
        <td>${shipLines.length > 1 ? `<button type="button" class="scm-link" data-scm="rm-line" data-i="${i}">${icon('x')}</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`;
  }
  function syncEta() {
    const f = document.getElementById('scm-ship'); if (!f) return;
    const d = f.querySelector('[name="shippedOn"]').value, n = Number(f.querySelector('[name="etaDays"]').value);
    if (d && Number.isFinite(n)) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); f.querySelector('[data-scm-eta]').value = x.toISOString().slice(0, 10); }
  }
  function settingsDialog() {
    const s = data.settings;
    ctx.modal(tr('补货参数', 'Reorder settings'), `<form id="scm-settings" class="scm-form"><div class="form-grid">
      <label class="field"><span>${tr('目标：备多少天的货', 'Target: days of sales to hold')}</span><input name="targetDays" type="number" min="1" max="365" value="${s.targetDays}" required></label>
      <label class="field"><span>${tr('安全库存天数', 'Safety days')}</span><input name="safetyDays" type="number" min="0" max="180" value="${s.safetyDays}" required></label>
      <label class="field"><span>${tr('下单（天）', 'Placing the order (days)')}</span><input name="orderDays" type="number" min="0" max="60" value="${s.orderDays}" required></label>
      <label class="field"><span>${tr('清关收货（天）', 'Customs & receiving (days)')}</span><input name="receiveDays" type="number" min="0" max="60" value="${s.receiveDays}" required></label>
      <label class="field"><span>${tr('意外天数（物流变化）', 'Buffer for logistics changes (days)')}</span><input name="bufferDays" type="number" min="0" max="120" value="${s.bufferDays}" required></label>
      <label class="field"><span>${tr('默认生产交期（天，产品资料没填时用）', 'Default production (days, when not in the product library)')}</span><input name="productionDays" type="number" min="0" max="365" value="${s.productionDays}" required></label>
      <label class="field"><span>${tr('默认头程（天，产品资料没填时用）', 'Default first leg (days, when not in the product library)')}</span><input name="firstLegDays" type="number" min="0" max="180" value="${s.firstLegDays}" required></label></div>
      <p class="scm-hint">${tr('到仓天数 = 下单 + 生产交期 + 头程 + 清关收货 + 意外天数；工厂有现货时不算生产交期。生产交期和头程优先用产品资料里每个 SKU 的值，没填的用这里的默认值。', 'Days to warehouse = order + production + first leg + receiving + buffer; production is skipped while the factory has stock. Production and first leg come from each SKU in the product library; these defaults fill the gaps.')}</p><p class="scm-error" role="alert"></p></form>`,
      `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="scm-settings">${tr('保存', 'Save')}</button>`);
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-scm]'); if (!b || !ctx) return;
    const a = b.dataset.scm; e.preventDefault();
    if (a === 'tab') { ui.tab = b.dataset.v; return ctx.rerender(); }
    if (a === 'status') { ui.status = b.dataset.v; return ctx.rerender(); }
    if (a === 'sort') { if (ui.sort === b.dataset.v) ui.dir = -ui.dir; else { ui.sort = b.dataset.v; ui.dir = b.dataset.v === 'sku' ? 1 : -1; } return ctx.rerender(); }
    if (a === 'settings') return settingsDialog();
    if (a === 'new-ship') return newShip();
    if (a === 'new-po') return newOrder();
    if (a === 'order-sku') return newOrder({ sku:b.dataset.sku, qty:b.dataset.qty });
    if (a === 'pos') return positionForm(b.dataset.id);
    if (a === 'finish-po') return finishForm(b.dataset.id);
    if (a === 'close-po') {
      if (!window.confirm?.(tr('关闭这张采购单？没发完的数量不再算进补货。', 'Close this order? What is not shipped no longer counts in the reorder.'))) return;
      try { await ctx.api.post(`/scm/orders/${encodeURIComponent(b.dataset.id)}/close`, {}); data = null; load(); } catch (x) { ctx.toast?.(x.message || tr('操作失败', 'Failed')); }
      return;
    }
    if (a === 'add-line') { shipLines.push({ sku:'', qty:'' }); return paintLines(); }
    if (a === 'rm-line') { shipLines.splice(Number(b.dataset.i), 1); return paintLines(); }
    if (a === 'sync') {
      if (busy) return; busy = true; ctx.rerender();
      try { const r = await ctx.api.post('/scm/sync', { days:365 }); ctx.toast?.(tr(`已同步：${r.since} 起 ${fmt(r.orders)} 单、${fmt(r.units)} 件`, `Synced: ${fmt(r.orders)} orders, ${fmt(r.units)} units since ${r.since}`)); data = null; }
      catch (x) { ctx.toast?.(x.message || tr('同步失败', 'Sync failed')); }
      finally { busy = false; data ? ctx.rerender() : load(); }
      return;
    }
    if (a === 'notify') {
      if (!window.confirm?.(tr('发到港通知给仓库？仓库会在 WMS“到港入仓”里逐行确认数量和库位后入库。', 'Send the arrival notice? The warehouse confirms each line’s quantity and bin in WMS Arrivals.'))) return;
      try { const r = await ctx.api.post(`/scm/shipments/${encodeURIComponent(b.dataset.id)}/notify`, {}); ctx.toast?.(tr(`已通知仓库（${r.notified} 位库存管理同事）`, `Warehouse notified (${r.notified} people)`)); data = null; load(); }
      catch (x) { ctx.toast?.(x.message || tr('操作失败', 'Failed')); }
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches?.('[data-scm-q]')) { ui.q = t.value; const pos = t.selectionStart; ctx.rerender(); const n = document.querySelector('[data-scm-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
    if (t.matches?.('[data-scm-line-sku]')) { shipLines[Number(t.dataset.scmLineSku)].sku = t.value.trim(); return; }
    if (t.matches?.('[data-scm-line-qty]')) { shipLines[Number(t.dataset.scmLineQty)].qty = t.value; return; }
    if (t.matches?.('[data-scm-eta-src]')) syncEta();
  });
  document.addEventListener('change', e => { if (e.target.matches?.('[data-scm-line-sku]')) paintLines(); });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || !['scm-ship', 'scm-settings', 'scm-po', 'scm-pos', 'scm-finish'].includes(f.id)) return;
    e.preventDefault(); const err = f.querySelector('.scm-error'); err.textContent = '';
    const v = Object.fromEntries(new FormData(f));
    try {
      if (f.id === 'scm-settings') { await ctx.api.request('/scm/settings', { method:'PUT', body:{ targetDays:Number(v.targetDays), safetyDays:Number(v.safetyDays), orderDays:Number(v.orderDays), receiveDays:Number(v.receiveDays), bufferDays:Number(v.bufferDays), productionDays:Number(v.productionDays), firstLegDays:Number(v.firstLegDays) } }); }
      else if (f.id === 'scm-finish') {
        const lines = [...f.querySelectorAll('[data-scm-fin]')].map(i => ({ sku:i.dataset.scmFin, qty:Number(i.value || 0) })).filter(l => l.qty > 0);
        if (!lines.length) throw new Error(tr('请填这次完工的数量。', 'Enter the finished quantities.'));
        await ctx.api.post(`/scm/orders/${encodeURIComponent(f.dataset.id)}/finish`, { opDate:v.opDate, lines });
      }
      else if (f.id === 'scm-pos') { await ctx.api.post(`/scm/shipments/${encodeURIComponent(f.dataset.id)}/position`, { position:String(v.position || '').trim(), ...(v.eta ? { eta:v.eta } : {}) }); }
      else if (f.id === 'scm-po') {
        const lines = shipLines.filter(l => l.sku).map(l => ({ sku:l.sku, qty:Number(l.qty) }));
        if (!lines.length || lines.some(l => !Number.isInteger(l.qty) || l.qty < 0)) throw new Error(tr('请填每个 SKU 和数量。', 'Fill in each SKU and its quantity.'));
        await ctx.api.post('/scm/orders', { factory:v.factory, orderedOn:v.orderedOn, lines, ...(String(v.number || '').trim() ? { number:String(v.number).trim() } : {}), ...(v.readyOn ? { readyOn:v.readyOn } : {}), ...(String(v.note || '').trim() ? { note:String(v.note).trim() } : {}) });
        ui.tab = 'orders';
      }
      else {
        const lines = shipLines.filter(l => l.sku).map(l => ({ sku:l.sku, qty:Number(l.qty) }));
        if (!lines.length || lines.some(l => !Number.isInteger(l.qty) || l.qty < 1)) throw new Error(tr('请填每个 SKU 和数量（正整数）。', 'Fill in each SKU and a quantity above 0.'));
        await ctx.api.post('/scm/shipments', { number:String(v.number).trim(), mode:v.mode, carrier:String(v.carrier || '').trim() || undefined, tracking:String(v.tracking || '').trim() || undefined,
          source:v.source, shippedOn:v.shippedOn, etaDays:Number(v.etaDays), note:String(v.note || '').trim() || undefined, lines, ...(v.orderId ? { orderId:v.orderId } : {}) });
        ui.tab = 'ship';
      }
      ctx.closeOverlay(); ctx.toast?.(tr('已保存', 'Saved')); data = null; load();
    } catch (x) { err.textContent = x.message || tr('保存失败', 'Could not save'); }
  });

  window.WorkOSScm = { configure, render, reset };
})();
