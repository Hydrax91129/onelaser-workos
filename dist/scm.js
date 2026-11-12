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
  const ui = { tab:'dash', q:'', status:'', sort:'', dir:1 };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US');
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  // Three statuses (owner, 2026-11-12): 缺货风险 / 正常 / 库存过多; the 系统判断 column says why.
  const STATUS = { risk:['缺货风险', 'Stockout risk', 'red'], ok:['正常', 'Normal', 'green'], overstock:['库存过多', 'Overstock', 'blue'] };
  const ORDER = ['risk', 'ok', 'overstock'];
  // 头程 / 尾程 and their default days (owner, 2026-11-12)
  const FIRST_LEG = { air:['空运', 'Air', 7], oa:['OA 普船', 'OA standard ship', 30], fast:['快船', 'Fast ship', 20], matson:['美森特快', 'Matson express', 15] };
  const LAST_LEG = { express:['快递', 'Parcel', 3], port:['港到仓', 'Port to warehouse', 4], truck:['卡派', 'Truck delivery', 7] };
  const MODE = { sea:['海运', 'Sea'], air:['空运', 'Air'], express:['快递', 'Express'], truck:['卡车', 'Truck'] };
  const SOURCE = { dg:['东莞工厂仓', 'Dongguan factory'], jn:['济南工厂仓', 'Jinan factory'], new:['工厂直发（新生产）', 'New from production'] };
  const w = p => p ? tr(p[0], p[1]) : '';
  const nameOf = it => (lang() === 'en' ? it.nameEn || it.nameZh : it.nameZh || it.nameEn) || '';

  function configure(next) { ctx = next; }
  function reset() { data = null; error = ''; loading = false; Object.assign(ui, { tab:'dash', q:'', status:'', sort:'', dir:1 }); }
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
        </div>
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
      <div class="scm-tabs"><button class="${ui.tab === 'dash' ? 'on' : ''}" data-scm="tab" data-v="dash">${icon('chart-pie-slice')} ${tr('供应链看板', 'Dashboard')}</button><button class="${ui.tab === 'reorder' ? 'on' : ''}" data-scm="tab" data-v="reorder">${icon('chart-line-up')} ${tr('补货建议', 'Reorder')}</button><button class="${ui.tab === 'orders' ? 'on' : ''}" data-scm="tab" data-v="orders">${icon('clipboard-text')} ${tr('采购下单', 'Purchase orders')} <b>${(data.orders || []).filter(o => ['draft', 'issued'].includes(o.status)).length}</b></button><button class="${ui.tab === 'ship' ? 'on' : ''}" data-scm="tab" data-v="ship">${icon('boat')} ${tr('在途货柜', 'In transit')} <b>${open.length}</b></button></div>
      ${ui.tab === 'dash' ? dashView() : ui.tab === 'reorder' ? reorderView() : ui.tab === 'orders' ? ordersView() : shipView()}
    </div>`;
  }

  /* Reorder columns: key, header, the hover explanation, class. A key of '' is not sortable. */
  const COLS = () => { const s = data.settings; return [
    ['sku', 'SKU', tr('产品资料里的 SKU。', 'The SKU in the product library.')],
    ['', tr('产品', 'Product'), tr('产品资料里的名称。', 'Name from the product library.')],
    ['ds365', tr('DS · 365 天', 'DS · 365d'), tr('过去 365 天平均每天卖出的件数（Shopify 订单，取消和测试单不算）。', 'Average units sold per day over the last 365 days (Shopify).'), 'num'],
    ['ds90', tr('DS · 90 天', 'DS · 90d'), tr('过去 90 天平均每天卖出的件数。', 'Average units sold per day over the last 90 days.'), 'num'],
    ['ds30', tr('DS · 30 天', 'DS · 30d'), tr('过去 30 天平均每天卖出的件数；▲▼ 是和近 90 天比的涨跌（30% 以上算短期爆发或下滑）。', 'Average per day over the last 30 days; ▲▼ against the 90-day rate (30%+ is a burst or dip).'), 'num'],
    ['forecast', tr('预测日销', 'Forecast / day'), tr('40% 近 30 天 + 30% 近 90 天 + 30% 全年 × 季节系数；短期爆发最多按近 90 天的 2 倍计入。后面的天数都按它算。', '40% last 30 + 30% last 90 + 30% the year × season; bursts count up to 2× the 90-day rate. Everything after uses it.'), 'num'],
    ['us', tr('美国LA仓', 'US LA'), tr('美国LA仓现在的数量（WMS）。', 'In the US LA warehouse now (WMS).'), 'num'],
    ['transit', tr('在途', 'In transit'), tr('已经发出、还没入美国仓的数量（WMS 在途运输中）。', 'Shipped, not yet in the US warehouse (WMS in transit).'), 'num'],
    ['dg', tr('东莞工厂仓', 'Dongguan'), tr('东莞工厂仓的成品数量。', 'Finished goods at the Dongguan factory.'), 'num'],
    ['jn', tr('济南工厂仓', 'Jinan'), tr('济南工厂仓的成品数量。', 'Finished goods at the Jinan factory.'), 'num'],
    ['finished', tr('成品合计', 'Finished'), tr('美国LA仓 + 在途 + 东莞 + 济南。建议发货按它算。', 'US LA + in transit + Dongguan + Jinan. Shipping is worked out on it.'), 'num scm-tot'],
    ['wip', tr('在产（半成品）', 'In production'), tr('采购单里已下单、还没完工的数量。', 'Ordered on purchase orders, not finished yet.'), 'num'],
    ['pipeline', tr('成品 + 在产', 'Finished + WIP'), tr('成品合计 + 在产。建议生产按它算，所以不会重复下单。', 'Finished + in production. Production is worked out on it, so nothing is ordered twice.'), 'num scm-tot'],
    ['cover', tr('可售天数', 'Days of cover'), tr('(美国LA仓 + 在途) ÷ 预测日销：现有货还能卖几天。小字是成品合计、成品 + 在产能卖的天数。', '(US LA + in transit) ÷ forecast: how many days the stock lasts. Below: finished, and finished + in production.'), 'num'],
    ['', tr('最小起订量', 'MOQ'), tr('产品资料里的最小起订量 / 采购单位。', 'MOQ / purchase unit from the product library.')],
    ['productionDays', tr('生产（天）', 'Production (d)'), tr('产品资料里的生产交期；带 * 是没填，用补货参数的默认值。', 'Production lead time from the product library; * = default from the settings.'), 'num'],
    ['firstLegDays', tr('头程（天）', 'First leg (d)'), tr('产品资料里的头程时间；带 * 是没填，用补货参数的默认值。', 'First-leg time from the product library; * = default from the settings.'), 'num'],
    ['leadDays', tr('预测到仓天数', 'Days to warehouse'), tr(`现在补货，多少天能到美国仓：下单 ${s.orderDays} + 生产交期 + 头程 + 清关收货 ${s.receiveDays} + 意外 ${s.bufferDays} 天。工厂有成品时不算生产交期，小字是要重新生产时的天数。`, `If reordered now, days until it is in the US warehouse: order ${s.orderDays} + production + first leg + receiving ${s.receiveDays} + buffer ${s.bufferDays}. No production while the factory has finished goods; below: the days if it must be made.`), 'num'],
    ['arriveOn', tr('预计到仓日期', 'Arrives on'), tr('今天 + 预测到仓天数。', 'Today + days to warehouse.'), 'num'],
    ['shortDays', tr('预测缺货天数', 'Days out of stock'), tr('现有货卖完到补货到仓之间会断货的天数 = 预测到仓天数 − 可售天数；小字是预计卖完的日期。“—”表示不会断货。', 'Days with no stock before a reorder arrives = days to warehouse − days of cover; below: the day it runs out. “—” = no gap.'), 'num'],
    ['ship', tr('建议发货', 'Ship'), tr('按成品算：补货目标 − 美国LA仓 − 在途，从工厂成品里发。补货目标 = 预测日销 × (到仓天数 + 目标 + 安全天数)。', 'From finished goods: target − US LA − in transit, from factory stock. Target = forecast × (days to warehouse + target + safety days).'), 'num'],
    ['make', tr('建议生产', 'Produce'), tr('按成品 + 在产算：补货目标 − 成品 − 在产。点“下单”带着数量去建采购单。', 'From finished + in production: target − finished − in production. “Order” opens a purchase order with it.'), 'num'],
    ['', tr('状态', 'Status'), tr('缺货风险：会断货；库存过多：成品比目标多 90 天以上（或一年没销量）；其余正常。鼠标放在状态上（或点一下）看系统的判断理由。', 'Risk: a gap is coming; overstock: 90+ days past the target (or no sales in a year); otherwise normal. Hover or click a status for the system’s reasoning.')],
  ]; };
  const headTh = (k, label, tip, cls = '') => k ? sortTh(k, label, cls, tip) : `<th class="${cls}" data-tip="${esc(tip)}" tabindex="0">${label}</th>`;
  const sortTh = (k, label, cls = '', tip = '') => `<th class="${cls} scm-sort ${ui.sort === k ? 'on' : ''}" data-scm="sort" data-v="${k}"${tip ? ` data-tip="${esc(tip)}" tabindex="0"` : ''}>${label}${ui.sort === k ? (ui.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  /** 2026-12-01 → "Dec 1st" (owner, 2026-11-12); another year gets the year: "Jan 8th, 2027". */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1:'st', 2:'nd', 3:'rd' })[n % 10] || 'th');
  const md = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return '—';
    return `${MON[Number(m[2]) - 1]} ${ord(Number(m[3]))}${Number(m[1]) !== new Date().getFullYear() ? `, ${m[1]}` : ''}`; };
  const outOn = x => { const d = new Date(Date.now() + x.cover * 86400000); return md(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); };
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
  /* 系统判断 shows on the status: hover or click (owner, 2026-11-12). One floating card, placed under the status. */
  const showWhy = btn => { let pop = document.getElementById('scm-why-pop'); if (!pop) { pop = document.createElement('div'); pop.id = 'scm-why-pop'; pop.className = 'scm-why-pop'; pop.setAttribute('role', 'tooltip'); document.body.appendChild(pop); }
    pop.innerHTML = `<b>${tr('系统判断', 'Why')}</b>${esc(btn.dataset.why)}`; pop.hidden = false; const r = btn.getBoundingClientRect();
    pop.style.top = (window.scrollY + r.bottom + 6) + 'px'; pop.style.left = Math.max(8, Math.min(window.scrollX + r.right - 340, window.innerWidth - 348)) + 'px'; };
  const hideWhy = () => { const pop = document.getElementById('scm-why-pop'); if (pop) pop.hidden = true; };
  document.addEventListener('mouseover', e => { const b = e.target.closest?.('.scm-why-btn'); if (b) showWhy(b); });
  document.addEventListener('mouseout', e => { const b = e.target.closest?.('.scm-why-btn'); if (b && !b.contains(e.relatedTarget) && !b.classList.contains('pinned')) hideWhy(); });
  document.addEventListener('click', e => { const b = e.target.closest?.('.scm-why-btn');
    document.querySelectorAll('.scm-why-btn.pinned').forEach(x => { if (x !== b) x.classList.remove('pinned'); });
    if (b) { b.classList.toggle('pinned'); b.classList.contains('pinned') ? showWhy(b) : hideWhy(); } else if (!e.target.closest?.('#scm-why-pop')) hideWhy(); });
  function reorderView() {
    const q = ui.q.trim().toLowerCase(), s = data.settings;
    let list = data.items.filter(x => (!ui.status || x.status === ui.status) && (!q || [x.sku, x.nameZh, x.nameEn].some(v => String(v || '').toLowerCase().includes(q))));
    const key = x => ui.sort === 'sku' ? x.sku : ui.sort ? (x[ui.sort] ?? -1) : ORDER.indexOf(x.status) * 1e6 + (x.cover ?? 999999);
    list = list.slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * (ui.sort ? ui.dir : 1); });
    const chips = [['', tr('全部', 'All'), data.items.length], ...ORDER.map(k => [k, w(STATUS[k]), data.items.filter(x => x.status === k).length])];
    const trend = x => x.signal === 'spike' ? ` <span class="up" title="${tr('短期爆发', 'burst')}">▲${x.trendPct != null ? x.trendPct + '%' : ''}</span>` : x.signal === 'dip' ? ` <span class="down" title="${tr('短期下滑', 'dip')}">▼${Math.abs(x.trendPct)}%</span>` : '';
    return `<div class="scm-bar"><label class="scm-search">${icon('magnifying-glass')}<input data-scm-q value="${esc(ui.q)}" placeholder="${tr('搜索 SKU 或名称', 'Search SKU or name')}"></label>
        <div class="scm-chips">${chips.map(([k, label, n]) => `<button class="${ui.status === k ? 'on' : ''}" data-scm="status" data-v="${k}">${esc(label)} <b>${n}</b></button>`).join('')}</div>
        <span class="scm-sp"></span>${data.canManage ? `<button class="btn" data-scm="settings">${icon('sliders-horizontal')} ${tr('补货参数', 'Reorder settings')}</button><button class="btn primary" data-scm="sync" ${busy ? 'disabled' : ''}>${icon('arrows-clockwise')} ${busy ? tr('同步中…', 'Syncing…') : tr('同步 Shopify 销量', 'Sync Shopify sales')}</button>` : ''}${window.WorkOSErpAccess?.button?.('supply') || ''}</div>
      <div class="scm-table-wrap"><table class="scm-table"><thead><tr>${COLS().map(([k, label, tip, cls]) => headTh(k, label, tip, cls)).join('')}</tr></thead><tbody>
        ${list.map(x => { const st = STATUS[x.status] || STATUS.ok;
          return `<tr><td class="mono">${esc(x.sku)}</td><td class="scm-name" title="${esc(nameOf(x))}">${esc(nameOf(x))}</td><td class="num">${x.ds365}</td><td class="num">${x.ds90}</td><td class="num">${x.ds30}${trend(x)}</td>
            <td class="num" title="${tr(`季节系数 ${x.season}`, `season ${x.season}`)}"><b>${x.forecast}</b></td>
            <td class="num">${fmt(x.us)}</td><td class="num">${fmt(x.transit)}</td><td class="num">${fmt(x.dg)}</td><td class="num">${fmt(x.jn)}</td>
            <td class="num scm-tot"><b>${fmt(x.finished)}</b></td><td class="num">${x.wip ? fmt(x.wip) : '—'}</td><td class="num scm-tot"><b>${fmt(x.pipeline)}</b></td>
            <td class="num ${x.status === 'risk' ? 'red' : ''}" title="${tr('美国仓 + 在途能卖的天数；成品合计和成品 + 在产能卖的天数在下面', 'Days that US + in transit last; below: finished, and finished + in production')}">${x.cover == null ? '—' : fmt(x.cover) + tr(' 天', 'd')}${x.coverAll != null ? `<small class="scm-sub">${tr(`成品 ${fmt(x.coverFinished)} · 含在产 ${fmt(x.coverAll)}`, `fin. ${fmt(x.coverFinished)} · +WIP ${fmt(x.coverAll)}`)}</small>` : ''}</td>
            <td>${esc(x.moq || '—')}</td><td class="num">${x.productionDays}${x.productionFromLibrary ? '' : '*'}</td><td class="num">${x.firstLegDays}${x.firstLegFromLibrary ? '' : '*'}</td>
            <td class="num scm-days" title="${esc(daysWhy(x))}"><b>${x.leadDays} ${tr('天', 'd')}</b>${x.factory > 0 ? `<small class="scm-sub">${tr(`工厂现货 · 重新生产要 ${x.supplyDays} 天`, `factory stock · ${x.supplyDays}d if made`)}</small>` : ''}</td><td class="num nowrap" title="${esc(x.arriveOn || '')}">${esc(md(x.arriveOn))}</td>
            <td class="num ${x.shortDays ? 'red' : ''}">${x.shortDays ? `<b>${x.shortDays} ${tr('天', 'd')}</b>${x.cover != null ? `<small class="scm-sub">${tr(`${outOn(x)} 卖完`, `runs out ${outOn(x)}`)}</small>` : ''}` : '—'}</td>
            <td class="num">${x.ship ? `<b>${fmt(x.ship)}</b>` : '—'}</td><td class="num">${x.make ? `<b class="red">${fmt(x.make)}</b>${data.canManage ? `<button class="scm-link" data-scm="order-sku" data-sku="${esc(x.sku)}" data-qty="${x.make}">${tr('下单', 'Order')}</button>` : ''}` : '—'}</td>
            <td><button type="button" class="scm-pill ${st[2]} scm-why-btn" data-why="${esc(why(x))}" aria-label="${esc(w(st))}: ${esc(why(x))}">${w(st)}</button></td></tr>`; }).join('') || `<tr><td colspan="23" class="scm-empty">${tr('没有符合的 SKU', 'No matching SKU')}</td></tr>`}
      </tbody></table></div>
      <section class="scm-legend"><h4>${icon('info')} ${tr('字段说明', 'What the columns mean')}</h4><dl>${[
        [tr('DS · 365 / 90 / 30 天', 'DS · 365 / 90 / 30d'), tr('过去 365 / 90 / 30 天平均每天卖出的件数（Shopify 订单，取消和测试单不算）。', 'Average units sold per day over the last 365 / 90 / 30 days (Shopify; cancelled and test orders excluded).')],
        [tr('预测日销', 'Forecast / day'), tr('40% 近 30 天 + 30% 近 90 天 + 30% 全年 × 季节系数。季节系数 = 去年接下来 90 天的日销 ÷ 全年平均（0.5–2 倍，满一年数据才算）。近 30 天比近 90 天高 30% 以上算短期爆发，最多按近 90 天的 2 倍计入；低 30% 以上算短期下滑，如实计入。', '40% last 30 days + 30% last 90 days + 30% the year × season. Season = last year’s next 90 days ÷ yearly average (0.5–2×, with a full year of data). A 30-day rate 30%+ above the 90-day rate is a burst, counted in up to 2×; 30%+ below is a dip, counted in fully.')],
        [tr('美国LA仓 / 在途 / 东莞 / 济南', 'US LA / in transit / Dongguan / Jinan'), tr('各仓库现在的数量，取自库存管理（WMS）。', 'What each warehouse holds now, from Inventory (WMS).')],
        [tr('成品合计', 'Finished'), tr('美国LA仓 + 在途 + 东莞工厂仓 + 济南工厂仓。', 'US LA + in transit + Dongguan + Jinan.')],
        [tr('在产（半成品）', 'In production'), tr('采购单里已下单、还没完工的数量。', 'Ordered on purchase orders and not finished yet.')],
        [tr('成品 + 在产', 'Finished + WIP'), tr('成品合计 + 在产。', 'Finished + in production.')],
        [tr('可售天数', 'Days of cover'), tr('(美国LA仓 + 在途) ÷ 预测日销。下面的小字是成品合计、成品 + 在产分别能卖多少天。', '(US LA + in transit) ÷ forecast. Below: the days that finished goods, and finished + in production, would last.')],
        [tr('生产 / 头程（天）', 'Production / first leg (d)'), tr('取产品资料里这个 SKU 的生产交期和头程时间；带 * 的是产品资料没填，用补货参数的默认值。', 'From the SKU in the product library; * = not filled in, the default from the settings.')],
        [tr('预测到仓天数', 'Days to warehouse'), tr(`下单 ${s.orderDays} + 生产交期 + 头程 + 清关收货 ${s.receiveDays} + 意外 ${s.bufferDays} 天。工厂仓有成品时不算生产交期，下面小字是要重新生产时的天数。`, `Order ${s.orderDays} + production + first leg + receiving ${s.receiveDays} + buffer ${s.bufferDays} days. No production while the factory has finished goods; below: the days if it has to be made.`)],
        [tr('预计到仓日期', 'Arrives on'), tr('今天 + 预测到仓天数。', 'Today + days to warehouse.')],
        [tr('预测缺货天数', 'Days out of stock'), tr('预测到仓天数 − 可售天数：现有货卖完到补货到仓之间会断货几天；小字是预计卖完的日期。', 'Days to warehouse − days of cover: the gap with no stock; below, the day it runs out.')],
        [tr('补货目标', 'Target'), tr(`预测日销 × (到仓天数 + 目标 ${s.targetDays} 天 + 安全 ${s.safetyDays} 天)。`, `Forecast × (days to warehouse + target ${s.targetDays} + safety ${s.safetyDays} days).`)],
        [tr('建议发货', 'Ship'), tr('按成品算：补货目标 − 美国LA仓 − 在途，从工厂成品里发，最多发工厂有的数量。', 'From finished goods: target − US LA − in transit, shipped from factory stock (no more than it holds).')],
        [tr('建议生产', 'Produce'), tr('按成品 + 在产算：补货目标 − 成品 + 在产。在产已经算进去，不会重复下单。', 'From finished + in production: target − (finished + in production), so nothing is ordered twice.')],
        [tr('缺货风险', 'Stockout risk'), tr('可售天数短于到仓天数：现在下单也来不及，会断货。', 'Days of cover shorter than days to warehouse: even an order now arrives too late.')],
        [tr('库存过多', 'Overstock'), tr('成品能卖的天数比补货目标多 90 天以上；有库存但一年没销量也算。', 'Finished goods last 90+ days beyond the target; stock with no sales in a year counts too.')],
        [tr('正常', 'Normal'), tr('其余情况；需要补货时“系统判断”会写出建议数量。', 'Everything else; when a reorder is due, “Why” gives the quantities.')],
      ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`;
  }

  /* ---------- 供应链看板 (owner, 2026-11-12): analytics across the supply chain, plain SVG ----------
     Colors: categorical slots 1–5 (fixed order, never cycled) for the stock stages; status colors only for 缺货风险 / 正常 / 库存过多,
     always with a text label. One axis per chart; hover shows the numbers; the 补货建议 tab is the table view. */
  const STAGES = () => [['us', tr('美国LA仓', 'US LA'), 1], ['transit', tr('在途', 'In transit'), 2], ['dg', tr('东莞工厂仓', 'Dongguan'), 3], ['jn', tr('济南工厂仓', 'Jinan'), 4], ['wip', tr('在产', 'In production'), 5]];
  const svgEsc = esc;
  function dashView() {
    const it = data.items, sh = data.shipments, os = data.orders || [], sales = data.sales || { weekly:[], last30:0, prev30:0 };
    const sum = (a, f) => a.reduce((n, x) => n + (f(x) || 0), 0), fc = sum(it, x => x.forecast), fin = sum(it, x => x.finished), wip = sum(it, x => x.wip);
    const transitUnits = sum(sh.filter(x => x.status !== 'arrived'), x => x.units), delivered = os.filter(o => o.status === 'delivered'), onTime = delivered.filter(o => o.onTime).length;
    const delta = sales.prev30 ? Math.round((sales.last30 - sales.prev30) / sales.prev30 * 100) : null;
    const tile = (label, value, note, tone = '') => `<div class="scm-tile ${tone}"><span>${label}</span><b>${value}</b><em>${note}</em></div>`;
    return `<div class="scm-dash">
      <div class="scm-tiles">
        ${tile(tr('近 30 天销量', 'Sold, last 30 days'), fmt(sales.last30), delta == null ? tr('没有前 30 天数据', 'no prior period') : `<span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</span> ${tr('对比前 30 天', 'vs the 30 days before')}`)}
        ${tile(tr('预测日销（合计）', 'Forecast per day'), (Math.round(fc * 10) / 10).toLocaleString('en-US'), tr('所有 SKU 加总', 'all SKUs'))}
        ${tile(tr('成品库存', 'Finished goods'), fmt(fin), fc > 0 ? tr(`按预测日销够卖约 ${fmt(Math.floor(fin / fc))} 天`, `about ${fmt(Math.floor(fin / fc))} days at the forecast`) : tr('没有销量', 'no sales'))}
        ${tile(tr('在产（半成品）', 'In production'), fmt(wip), tr(`${os.filter(o => o.status === 'issued').length} 张采购单生产中`, `${os.filter(o => o.status === 'issued').length} orders in production`))}
        ${tile(tr('在途', 'In transit'), fmt(transitUnits), tr(`${sh.filter(x => x.status !== 'arrived').length} 个货柜 · ${sh.filter(x => x.status === 'in_transit' && x.daysLeft < 0).length} 个过了预计到港`, `${sh.filter(x => x.status !== 'arrived').length} shipments · ${sh.filter(x => x.status === 'in_transit' && x.daysLeft < 0).length} past ETA`))}
        ${(() => { const s365 = sum(it, x => x.sold365), turns = fin > 0 ? s365 / fin : null; return tile(tr('库存周转率', 'Inventory turnover'), turns == null ? '—' : (Math.round(turns * 10) / 10) + tr(' 次/年', '×/yr'), turns ? tr(`库存天数约 ${fmt(Math.round(365 / turns))} 天 · 年销 ${fmt(s365)} 件`, `about ${fmt(Math.round(365 / turns))} days of inventory · ${fmt(s365)} sold/yr`) : tr('没有成品库存', 'no finished stock')); })()}
        ${tile(tr('采购准时交付率', 'On-time delivery'), delivered.length ? Math.round(onTime / delivered.length * 100) + '%' : '—', delivered.length ? tr(`${onTime} / ${delivered.length} 张准时 · ${os.filter(o => o.status === 'issued' && o.overdue).length} 张逾期中`, `${onTime} / ${delivered.length} on time · ${os.filter(o => o.status === 'issued' && o.overdue).length} overdue`) : tr('还没有交付的采购单', 'no deliveries yet'))}
      </div>
      <div class="scm-charts">
        <section class="scm-card wide"><h4>${tr('每周销量（近 52 周）', 'Units sold per week (52 weeks)')}</h4>${weeklyChart(sales.weekly)}</section>
        <section class="scm-card wide"><h4>${tr('库存分布：每个 SKU 的货在哪里', 'Where each SKU’s stock is')}</h4>${legend()}${stockBars(it)}</section>
        <section class="scm-card"><h4>${tr('可售天数 vs 预测到仓天数', 'Days of cover vs days to warehouse')}</h4><p class="scm-hint">${tr('条 = 美国仓 + 在途能卖的天数；竖线 = 现在补货要多少天到仓。条短于竖线就会断货。', 'Bar = days US + in transit last; line = days a reorder takes. A bar short of the line means a gap.')}</p>${coverBars(it)}</section>
        <section class="scm-card"><h4>${tr('补货状态', 'Reorder status')}</h4>${statusBars(it)}<h4 style="margin-top:14px">${tr('采购单交付表现', 'Purchase-order delivery')}</h4>${poBars(os)}</section>
        <section class="scm-card wide"><h4>${tr('库存周转：按 SKU', 'Inventory turnover by SKU')}</h4><p class="scm-hint">${tr('周转次数 = 近 365 天销量 ÷ 成品库存；库存天数 = 成品库存 ÷ 近 365 天日销。用当前成品库存代替平均库存（还没有每日库存快照）。从慢到快排，慢的在上面。', 'Turns = units sold in 365 days ÷ finished stock; days of inventory = finished stock ÷ daily sales (365d). Current stock stands in for average stock (no daily snapshots yet). Slowest first.')}</p>${turnTable(it)}</section>
        <section class="scm-card"><h4>${tr('仓库：货在哪、够卖多久', 'Warehouses: where the stock is and how long it lasts')}</h4>${whTable(it)}</section>
        <section class="scm-card"><h4>${tr('工厂 / 供应商表现', 'Factories / suppliers')}</h4>${supplierTable(os)}</section>
        <section class="scm-card wide"><h4>${tr('未来到港', 'Arriving')}</h4>${arrivals(sh)}</section>
      </div>
      <div class="scm-tip" role="tooltip" hidden></div>
    </div>`;
  }
  const legend = () => `<div class="scm-legend-row">${STAGES().map(([, label, slot]) => `<span><i class="sw s${slot}"></i>${label}</span>`).join('')}</div>`;
  function weeklyChart(weeks) {
    if (!weeks.length) return `<p class="scm-hint">${tr('还没有销量数据。', 'No sales data yet.')}</p>`;
    const W = 1000, H = 220, L = 44, R = 12, T = 12, B = 26, max = Math.max(1, ...weeks.map(w => w.units)), nice = Math.ceil(max / 5 / Math.pow(10, Math.floor(Math.log10(max / 5 || 1)))) * Math.pow(10, Math.floor(Math.log10(max / 5 || 1))) * 5;
    const x = i => L + (weeks.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (weeks.length - 1)), y = v => T + (H - T - B) * (1 - v / nice);
    const pts = weeks.map((w, i) => `${x(i).toFixed(1)},${y(w.units).toFixed(1)}`).join(' ');
    const grid = [0, 1, 2, 3, 4, 5].map(k => { const v = nice * k / 5; return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${fmt(Math.round(v))}</text>`; }).join('');
    const ticks = weeks.map((w, i) => (i % 8 === 0 || i === weeks.length - 1) ? `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${svgEsc(md(w.week).replace(/, \d{4}$/, ''))}</text>` : '').join('');
    const hits = weeks.map((w, i) => `<rect x="${x(i) - (W - L - R) / weeks.length / 2}" y="${T}" width="${(W - L - R) / weeks.length}" height="${H - T - B}" class="hit" data-tip="${svgEsc(tr(`${md(w.week)} 那周：${fmt(w.units)} 件`, `Week of ${md(w.week)}: ${fmt(w.units)} units`))}" data-cx="${x(i)}" data-cy="${y(w.units)}"/>`).join('');
    return `<svg class="scm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('每周销量折线图', 'Weekly sales line chart')}">${grid}${ticks}
      <polyline points="${pts}" class="line s1"/><line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" hidden/><circle class="dot s1" r="4.5" cx="0" cy="0" hidden/>${hits}</svg>`;
  }
  const r1d = n => Math.round(n * 10) / 10;
  function turnTable(it) {
    const rows = it.map(x => { const turns = x.finished > 0 ? x.sold365 / x.finished : null, dio = x.ds365 > 0 ? Math.round(x.finished / x.ds365) : null; return { x, turns, dio }; })
      .sort((a, b) => (a.turns ?? -1) - (b.turns ?? -1));
    const maxDio = Math.max(1, ...rows.map(r => Math.min(r.dio ?? 0, 730)));
    const band = r => r.turns == null ? ['grey', tr('无库存', 'no stock')] : r.dio == null ? ['red', tr('有货没销量', 'no sales')] : r.dio > 180 ? ['red', tr('周转慢', 'slow')] : r.dio > 90 ? ['amber', tr('偏慢', 'slowish')] : ['green', tr('健康', 'healthy')];
    return `<div class="scm-table-wrap"><table class="scm-table scm-mini-table"><thead><tr><th>SKU</th><th>${tr('产品', 'Product')}</th><th class="num">${tr('近 365 天销量', 'Sold 365d')}</th><th class="num">${tr('成品库存', 'Finished')}</th><th class="num">${tr('周转次数 / 年', 'Turns / yr')}</th><th>${tr('库存天数', 'Days of inventory')}</th><th>${tr('判断', 'Read')}</th></tr></thead><tbody>
      ${rows.map(r => { const [cls, label] = band(r); return `<tr><td class="mono">${svgEsc(r.x.sku)}</td><td class="scm-name" title="${svgEsc(nameOf(r.x))}">${svgEsc(nameOf(r.x))}</td><td class="num">${fmt(r.x.sold365)}</td><td class="num">${fmt(r.x.finished)}</td>
        <td class="num"><b>${r.turns == null ? '—' : r1d(r.turns)}</b></td><td><div class="scm-inline-bar"><i class="seg dio-${cls}" style="width:${r.dio == null ? 0 : Math.min(100, r.dio / maxDio * 100).toFixed(1)}%"></i><span>${r.dio == null ? '—' : fmt(r.dio) + tr(' 天', 'd')}</span></div></td>
        <td><span class="scm-pill ${cls}">${label}</span></td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function whTable(it) {
    const fc = it.reduce((n, x) => n + (x.forecast || 0), 0), total = it.reduce((n, x) => n + (x.finished || 0) + (x.wip || 0), 0) || 1;
    return `<table class="scm-table scm-mini-table"><thead><tr><th>${tr('仓库', 'Warehouse')}</th><th class="num">${tr('件数', 'Units')}</th><th class="num">SKU</th><th>${tr('占比', 'Share')}</th><th class="num">${tr('够卖天数', 'Days of supply')}</th></tr></thead><tbody>
      ${STAGES().map(([k, label, slot]) => { const units = it.reduce((n, x) => n + Number(x[k] || 0), 0), skus = it.filter(x => Number(x[k] || 0) > 0).length, share = units / total * 100;
        return `<tr><td><i class="sw s${slot}" style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px"></i>${label}</td><td class="num"><b>${fmt(units)}</b></td><td class="num">${skus}</td>
          <td><div class="scm-inline-bar"><i class="seg s${slot}" style="width:${share.toFixed(1)}%"></i><span>${Math.round(share)}%</span></div></td><td class="num">${fc > 0 ? fmt(Math.round(units / fc)) + tr(' 天', 'd') : '—'}</td></tr>`; }).join('')}</tbody></table>
      <p class="scm-hint">${tr('够卖天数 = 件数 ÷ 所有 SKU 的预测日销合计。', 'Days of supply = units ÷ total forecast per day.')}</p>`;
  }
  function supplierTable(os) {
    const by = new Map();
    for (const o of os.filter(o => o.status !== 'closed' || o.done)) { const k = o.supplier || tr('（未填供应商）', '(no supplier)'); if (!by.has(k)) by.set(k, []); by.get(k).push(o); }
    if (!by.size) return `<p class="scm-hint">${tr('还没有采购单。', 'No purchase orders yet.')}</p>`;
    const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
    return `<table class="scm-table scm-mini-table"><thead><tr><th>${tr('供应商', 'Supplier')}</th><th class="num">${tr('采购单', 'Orders')}</th><th class="num">${tr('下单件数', 'Units')}</th><th class="num">${tr('在产', 'In production')}</th><th class="num">${tr('准时率', 'On time')}</th><th class="num">${tr('平均延迟', 'Avg late')}</th><th class="num">${tr('实际生产天数', 'Actual days')}</th></tr></thead><tbody>
      ${[...by].map(([k, list]) => { const del = list.filter(o => o.status === 'delivered'), on = del.filter(o => o.onTime).length, late = del.filter(o => !o.onTime);
        const prod = del.filter(o => o.issuedOn && o.deliveredOn).map(o => days(o.deliveredOn, o.issuedOn)), overdue = list.filter(o => o.status === 'issued' && o.overdue).length;
        return `<tr><td>${svgEsc(k)}${overdue ? ` <span class="scm-pill red">${tr(`${overdue} 张逾期`, `${overdue} overdue`)}</span>` : ''}</td><td class="num">${list.length}</td><td class="num">${fmt(list.reduce((n, o) => n + o.units, 0))}</td><td class="num">${fmt(list.filter(o => o.status === 'issued').reduce((n, o) => n + o.left, 0))}</td>
          <td class="num"><b>${del.length ? Math.round(on / del.length * 100) + '%' : '—'}</b>${del.length ? `<small class="scm-sub">${on}/${del.length}</small>` : ''}</td><td class="num">${late.length ? r1d(late.reduce((n, o) => n + o.daysLate, 0) / late.length) + tr(' 天', 'd') : '—'}</td>
          <td class="num">${prod.length ? r1d(prod.reduce((a, b) => a + b, 0) / prod.length) + tr(' 天', 'd') : '—'}</td></tr>`; }).join('')}</tbody></table>
      <p class="scm-hint">${tr('准时率 = 在预计交期前交付的采购单 ÷ 已交付的采购单；实际生产天数 = 下达生产到交付。', 'On time = delivered by the expected date ÷ delivered; actual days = issued to delivered.')}</p>`;
  }
  function stockBars(it) {
    const rows = it.map(x => ({ x, parts: STAGES().map(([k, label, slot]) => ({ k, label, slot, v: Number(x[k] || 0) })) })).map(r => ({ ...r, total: r.parts.reduce((n, p) => n + p.v, 0) })).sort((a, b) => b.total - a.total);
    const max = Math.max(1, ...rows.map(r => r.total));
    return `<div class="scm-hbars">${rows.map(r => `<div class="row"><span class="lab mono" title="${svgEsc(nameOf(r.x))}">${svgEsc(r.x.sku)}</span><div class="track">${r.parts.filter(p => p.v > 0).map(p =>
      `<i class="seg s${p.slot}" style="width:${(p.v / max * 100).toFixed(2)}%" data-tip="${svgEsc(`${r.x.sku} · ${p.label}：${fmt(p.v)}`)}"></i>`).join('')}</div><span class="val">${fmt(r.total)}</span></div>`).join('')}</div>`;
  }
  function coverBars(it) {
    const rows = it.filter(x => x.cover != null).sort((a, b) => (a.cover - a.leadDays) - (b.cover - b.leadDays)), cap = Math.max(60, ...rows.map(x => x.leadDays * 2));
    if (!rows.length) return `<p class="scm-hint">${tr('没有销量的 SKU 不在这里。', 'SKUs without sales are not shown.')}</p>`;
    const st = x => STATUS[x.status] || STATUS.ok;
    return `<div class="scm-hbars cover">${rows.map(x => `<div class="row"><span class="lab mono">${svgEsc(x.sku)}</span><div class="track"><i class="seg cov ${x.status}" style="width:${Math.min(100, x.cover / cap * 100).toFixed(2)}%" data-tip="${svgEsc(tr(`${x.sku}：可售 ${x.cover} 天，到仓要 ${x.leadDays} 天${x.shortDays ? `，会断货约 ${x.shortDays} 天` : ''}`, `${x.sku}: lasts ${x.cover} days, reorder takes ${x.leadDays}${x.shortDays ? `, about ${x.shortDays} days without stock` : ''}`))}"></i>
      <b class="mark" style="left:${Math.min(100, x.leadDays / cap * 100).toFixed(2)}%"></b>${x.cover > cap ? '<em class="more">›</em>' : ''}</div><span class="val"><span class="scm-pill ${st(x)[2]}">${w(st(x))}</span></span></div>`).join('')}</div>`;
  }
  function statusBars(it) {
    const max = Math.max(1, it.length);
    return `<div class="scm-hbars">${ORDER.map(k => { const n = it.filter(x => x.status === k).length; return `<div class="row"><span class="lab">${w(STATUS[k])}</span><div class="track"><i class="seg st-${k}" style="width:${(n / max * 100).toFixed(2)}%" data-tip="${svgEsc(`${w(STATUS[k])}：${n} 个 SKU`)}"></i></div><span class="val">${n}</span></div>`; }).join('')}</div>`;
  }
  function poBars(os) {
    const groups = [['draft', tr('草稿', 'Draft'), o => o.status === 'draft'], ['issued', tr('生产中', 'In production'), o => o.status === 'issued' && !o.overdue], ['overdue', tr('逾期中', 'Overdue'), o => o.status === 'issued' && o.overdue],
      ['ontime', tr('准时交付', 'On time'), o => o.status === 'delivered' && o.onTime], ['late', tr('延迟交付', 'Late'), o => o.status === 'delivered' && !o.onTime]];
    const max = Math.max(1, ...groups.map(g => os.filter(g[2]).length));
    return `<div class="scm-hbars">${groups.map(([k, label, f]) => { const n = os.filter(f).length; return `<div class="row"><span class="lab">${label}</span><div class="track"><i class="seg po-${k}" style="width:${(n / max * 100).toFixed(2)}%" data-tip="${svgEsc(`${label}：${n} 张`)}"></i></div><span class="val">${n}</span></div>`; }).join('')}</div>`;
  }
  function arrivals(sh) {
    const list = sh.filter(x => x.status !== 'arrived').sort((a, b) => String(a.eta).localeCompare(String(b.eta)));
    if (!list.length) return `<p class="scm-hint">${tr('没有在途货柜。', 'Nothing in transit.')}</p>`;
    return `<div class="scm-arr">${list.map(x => { const pct = x.status === 'in_transit' ? Math.min(100, Math.round(x.daysGone / x.daysTotal * 100)) : 100;
      return `<div class="row"><span class="lab mono">${svgEsc(x.number)}</span><div class="track"><i class="seg s1" style="width:${pct}%" data-tip="${svgEsc(tr(`${x.number}：${fmt(x.units)} 件，${x.status === 'at_port' ? '已到港，待入仓' : x.daysLeft < 0 ? `已超预计到港 ${-x.daysLeft} 天` : `还有 ${x.daysLeft} 天到港`}`, `${x.number}: ${fmt(x.units)} units, ${x.status === 'at_port' ? 'at port' : x.daysLeft < 0 ? `${-x.daysLeft} days past ETA` : `${x.daysLeft} days to port`}`))}"></i></div>
        <span class="val nowrap">${svgEsc(md(x.eta))} · ${fmt(x.units)} ${tr('件', 'units')}</span></div>`; }).join('')}</div>`;
  }
  // Hover: one tooltip for every chart; on the line chart a crosshair and a dot follow the nearest week
  document.addEventListener('mousemove', e => {
    const root = e.target.closest?.('.scm-dash'); if (!root) return;
    const tip = root.querySelector('.scm-tip'), el = e.target.closest('[data-tip]');
    const svg = e.target.closest('svg.scm-svg'), cross = svg?.querySelector('.cross'), dot = svg?.querySelector('.dot');
    if (!el) { tip.hidden = true; root.querySelectorAll('.cross,.dot').forEach(n => n.setAttribute('hidden', '')); return; }
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const box = root.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - box.left + 14, box.width - 260) + 'px'; tip.style.top = (e.clientY - box.top + 14) + 'px';
    if (svg && el.dataset.cx) { cross.setAttribute('x1', el.dataset.cx); cross.setAttribute('x2', el.dataset.cx); cross.removeAttribute('hidden'); dot.setAttribute('cx', el.dataset.cx); dot.setAttribute('cy', el.dataset.cy); dot.removeAttribute('hidden'); }
  });
  document.addEventListener('mouseleave', e => { if (e.target?.classList?.contains?.('scm-dash')) { const t = e.target.querySelector('.scm-tip'); if (t) t.hidden = true; } }, true);
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
        ${data.canManage ? `<button class="btn primary" data-scm="new-ship">${icon('plus')} ${tr('新建货柜', 'New shipment')}</button>` : ''}${window.WorkOSErpAccess?.button?.('supply') || ''}</div>
      <div class="scm-ships">${list.map(x => { const [cls, label] = pill(x), po = x.orderId && (data.orders || []).find(o => o.id === x.orderId);
        return `<div class="scm-ship ${x.status}">
        <div class="head"><b class="mono">${esc(x.number)}</b><span class="scm-pill ${cls}">${label}</span>
          <span class="scm-sp"></span>${data.canManage && x.status === 'in_transit' ? `<button class="btn small" data-scm="notify" data-id="${esc(x.id)}">${icon('bell-ringing')} ${tr('到港通知', 'Arrival notice')}</button>` : ''}</div>
        ${voyage(x)}
        <dl><div><dt>${tr('头程 / 尾程', 'First leg / last mile')}</dt><dd>${x.firstLeg ? `${esc(w(FIRST_LEG[x.firstLeg]))} / ${esc(w(LAST_LEG[x.lastLeg]))}` : esc(w(MODE[x.mode]))}${x.carrier ? ' · ' + esc(x.carrier) : ''}</dd></div><div><dt>Tracking</dt><dd>${trackLink(x.tracking)}</dd></div>
          <div><dt>${tr('来源', 'From')}</dt><dd>${esc(w(SOURCE[x.source]))}</dd></div><div><dt>${tr('采购单', 'Purchase order')}</dt><dd>${po ? `<span class="mono">${esc(po.number)}</span>` : '—'}</dd></div></dl>
        <table class="scm-table scm-ship-skus"><thead><tr><th>SKU</th><th>${tr('产品', 'Product')}</th><th class="num">${tr('数量', 'Qty')}</th>${x.status === 'arrived' ? `<th class="num">${tr('实收', 'Received')}</th>` : ''}</tr></thead><tbody>
          ${x.lines.map(l => { const it = item(l.sku); return `<tr><td class="mono"><b>${esc(l.sku)}</b></td><td>${esc(it ? nameOf(it) : '')}</td><td class="num"><b>${fmt(l.qty)}</b></td>${x.status === 'arrived' ? `<td class="num ${l.received != null && l.received < l.qty ? 'red' : ''}">${fmt(l.received ?? l.qty)}</td>` : ''}</tr>`; }).join('')}
          <tr class="sum"><td colspan="2">${tr(`共 ${x.lines.length} 个 SKU`, `${x.lines.length} SKUs`)}</td><td class="num"><b>${fmt(x.units)}</b></td>${x.status === 'arrived' ? '<td></td>' : ''}</tr></tbody></table>
        ${x.note ? `<p class="scm-hint">${esc(x.note)}</p>` : ''}</div>`; }).join('') || `<p class="scm-empty">${tr('还没有在途货柜', 'Nothing in transit')}</p>`}</div>`;
  }
  /* 采购下单 (owner, 2026-11-12): supplier from the product library, draft → 下达生产 → 交付 (on time or late), editable. */
  const PO_STATUS = o => o.status === 'draft' ? ['grey', tr('草稿 · 待和工厂确认', 'Draft · confirm with the factory')]
    : o.status === 'issued' ? (o.overdue ? ['red', tr(`生产中 · 已逾期 ${o.overdue} 天`, `In production · ${o.overdue} days overdue`)] : ['blue', tr('已下达 · 生产中', 'Issued · in production')])
    : o.status === 'delivered' ? (o.onTime ? ['green', tr(`已交付 · 准时（${md(o.deliveredOn)}）`, `Delivered on time (${md(o.deliveredOn)})`)] : ['amber', tr(`已交付 · 延迟 ${o.daysLate} 天（${md(o.deliveredOn)}）`, `Delivered ${o.daysLate} days late (${md(o.deliveredOn)})`)])
    : ['grey', tr(`已关闭 ${o.closedOn || ''}`, `Closed ${o.closedOn || ''}`)];
  function ordersView() {
    const list = data.orders || [];
    const kpi = (k, label) => `<span class="scm-mini"><b>${list.filter(k).length}</b> ${label}</span>`;
    return `<div class="scm-bar"><span class="scm-hint">${tr('保存是草稿（会通知其他供应链管理同事）；和工厂确认后点“下达生产”，才算在产。全部完工即交付，对比预计交期看准不准时。', 'Saving makes a draft (other supply managers are told); “Issue” once the factory confirms — only then it counts as in production. All finished = delivered, on time or late against the expected date.')}</span><span class="scm-sp"></span>
        ${data.canManage ? `<button class="btn primary" data-scm="new-po">${icon('plus')} ${tr('新建采购单', 'New purchase order')}</button>` : ''}${window.WorkOSErpAccess?.button?.('supply') || ''}</div>
      <div class="scm-minis">${kpi(o => o.status === 'draft', tr('草稿', 'drafts'))}${kpi(o => o.status === 'issued', tr('生产中', 'in production'))}${kpi(o => o.status === 'issued' && o.overdue, tr('已逾期', 'overdue'))}${kpi(o => o.status === 'delivered' && o.onTime, tr('准时交付', 'on time'))}${kpi(o => o.status === 'delivered' && !o.onTime, tr('延迟交付', 'late'))}</div>
      <div class="scm-table-wrap"><table class="scm-table"><thead><tr><th>${tr('采购单号', 'PO')}</th><th>${tr('供应商', 'Supplier')}</th><th>${tr('下单日期', 'Ordered')}</th><th>${tr('预计交期', 'Expected')}</th><th>${tr('SKU（已完工 / 下单）', 'SKUs (finished / ordered)')}</th><th class="num">${tr('在产', 'In production')}</th><th>${tr('状态', 'Status')}</th><th></th></tr></thead><tbody>
        ${list.map(o => { const [cls, label] = PO_STATUS(o), item = sku => data.items.find(x => x.sku.toLowerCase() === sku.toLowerCase());
          return `<tr><td class="mono"><b>${esc(o.number)}</b>${o.note ? `<small class="scm-sub">${esc(o.note)}</small>` : ''}${o.edits ? `<small class="scm-sub">${tr(`改过 ${o.edits} 次 · ${o.updatedBy}`, `edited ${o.edits}× · ${o.updatedBy}`)}</small>` : ''}</td>
          <td>${esc(o.supplier || '—')}</td><td class="nowrap">${esc(md(o.orderedOn))}</td>
          <td class="nowrap"><b>${esc(md(o.readyOn))}</b>${o.daysToReady != null && o.daysToReady >= 0 ? `<small class="scm-sub">${tr(`还有 ${o.daysToReady} 天`, `${o.daysToReady} days`)}</small>` : ''}</td>
          <td>${o.lines.map(l => `<div><span class="mono">${esc(l.sku)}</span> <span class="scm-hint">${esc(item(l.sku) ? nameOf(item(l.sku)) : '')}</span> ${fmt(l.done)} / <b>${fmt(l.qty)}</b></div>`).join('')}</td>
          <td class="num"><b>${o.status === 'issued' ? fmt(o.left) : '—'}</b></td><td><span class="scm-pill ${cls}">${label}</span></td>
          <td class="nowrap">${data.canManage && ['draft', 'issued'].includes(o.status) ? `<button class="scm-link" data-scm="edit-po" data-id="${esc(o.id)}">${tr('修改', 'Edit')}</button>
            ${o.status === 'draft' ? `<button class="btn small primary" data-scm="issue-po" data-id="${esc(o.id)}">${icon('factory')} ${tr('下达生产', 'Issue')}</button>` : `<button class="btn small" data-scm="finish-po" data-id="${esc(o.id)}">${icon('package')} ${tr('完工入库', 'Finished')}</button>`}
            <button class="scm-link" data-scm="close-po" data-id="${esc(o.id)}">${o.status === 'draft' ? tr('取消', 'Cancel') : tr('关闭', 'Close')}</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="8" class="scm-empty">${tr('还没有采购单', 'No purchase orders yet')}</td></tr>`}
      </tbody></table></div>`;
  }
  /* The order form: supplier from the product library, SKUs picked from the library with filters (like goods out). */
  const po = { id:null, lines:[], q:'', fam:'', series:'', status:'', brand:'', supplier:'' };
  const suppliersAll = () => [...new Set(data.items.flatMap(x => x.suppliers || []))].sort();
  function orderForm(o, prefill) {
    Object.assign(po, { id:o?.id || null, lines:o ? o.lines.map(l => ({ sku:l.sku, qty:String(l.qty), done:l.done })) : prefill ? [{ sku:prefill.sku, qty:String(prefill.qty), done:0 }] : [], q:'', fam:'', series:'', status:'', brand:'',
      supplier:o?.supplier || (prefill && data.items.find(x => x.sku === prefill.sku)?.suppliers?.[0]) || '' });
    const sups = suppliersAll(), uniq = k => [...new Set(data.items.map(x => x[k]).filter(Boolean))].sort();
    const sel = (attr, all, opts, cur = '') => `<label class="wms-select"><select data-po-${attr}><option value="">${all}</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const FAM = { main:['主机', 'Machine'], acc:['配件/备件', 'Accessory'], cons:['耗材', 'Consumable'], soft:['软件/服务', 'Software'], mat:['内部物料', 'Material'] };
    const LIFE = { dev:['开发中', 'In development'], launch:['上新中', 'Launching'], live:['在售', 'Selling'], clearance:['清库存', 'Clearance'], eolPlanned:['计划停售', 'Phasing out'], eol:['停售', 'Discontinued'] };
    ctx.modal(o ? tr(`修改采购单 · ${o.number}`, `Edit purchase order · ${o.number}`) : tr('新建采购单', 'New purchase order'), `<form id="scm-po" class="scm-form"><div class="form-grid">
      <label class="field"><span>${tr('采购单号（不填自动生成）', 'PO number (blank = automatic)')}</span><input name="number" maxlength="60" value="${esc(o?.number || '')}" placeholder="PO-${today().replace(/-/g, '')}-01"></label>
      <label class="field"><span>${tr('供应商（取自产品资料）', 'Supplier (from the product library)')}</span><select name="supplier" required data-po-supplier><option value="">${tr('请选择', 'Choose')}</option>${sups.map(x => `<option value="${esc(x)}" ${x === po.supplier ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field"><span>${tr('下单日期', 'Order date')}</span><input name="orderedOn" type="date" required value="${esc(o?.orderedOn || today())}" min="2000-01-01"></label>
      <label class="field"><span>${tr('预计交期', 'Expected delivery')}</span><input name="readyOn" type="date" required value="${esc(o?.readyOn || '')}" min="2000-01-01" data-po-ready><small class="scm-hint" data-po-ready-hint></small></label></div>
      ${sups.length ? '' : `<p class="scm-alert">${tr('产品资料里还没有填供应商（主供应商 / 备选供应商），请先在产品资料里补上。', 'No suppliers in the product library yet (main / alternative supplier); add them there first.')}</p>`}
      <div class="wms-finder"><div class="wms-finder-bar"><label class="wms-search">${icon('magnifying-glass')}<input data-po-q placeholder="${tr('从产品库找 SKU：SKU 或中英文名', 'Find a SKU in the product library')}" autocomplete="off"></label>
        ${sel('fam', tr('全部产品族', 'All families'), Object.entries(FAM).map(([k, v]) => [k, w(v)]))}${sel('series', tr('全部系列', 'All series'), uniq('series').map(x => [x, x]))}
        ${sel('status', tr('全部状态', 'All statuses'), Object.entries(LIFE).map(([k, v]) => [k, w(v)]))}${sel('brand', tr('全部品牌', 'All brands'), uniq('brand').map(x => [x, x]))}
        <label class="wms-check"><input type="checkbox" data-po-onlysup checked> ${tr('只看这家供应商的 SKU', 'This supplier’s SKUs only')}</label></div>
        <p class="wms-finder-tip">${icon('hand-pointing')} ${tr('双击一行或点“选择添加该 SKU”加进采购单；SKU 的供应商要在产品资料里有这家。', 'Double-click a row or use “Add this SKU”; the SKU must list this supplier in the product library.')}</p>
        <div class="wms-finder-list" data-po-finder></div></div>
      <div data-po-lines></div>
      <label class="field"><span>${tr('备注', 'Note')}</span><input name="note" maxlength="1000" value="${esc(o?.note || '')}"></label>
      <p class="scm-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="scm-po">${o ? tr('保存修改', 'Save changes') : tr('保存为草稿', 'Save as draft')}</button>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
    paintPo();
  }
  function paintPo() {
    const f = document.getElementById('scm-po'); if (!f) return;
    const onlySup = f.querySelector('[data-po-onlysup]')?.checked, q = po.q.trim().toLowerCase(), taken = new Set(po.lines.map(l => l.sku.toLowerCase()));
    const list = data.items.filter(x => (!po.fam || x.family === po.fam) && (!po.series || x.series === po.series) && (!po.status || x.lifecycle === po.status) && (!po.brand || x.brand === po.brand)
      && (!onlySup || !po.supplier || (x.suppliers || []).includes(po.supplier)) && (!q || [x.sku, x.nameZh, x.nameEn].some(v => String(v || '').toLowerCase().includes(q))));
    f.querySelector('[data-po-finder]').innerHTML = list.slice(0, 40).map(x => `<div class="wms-find-row ${taken.has(x.sku.toLowerCase()) ? 'taken' : ''}" data-po-pick="${esc(x.sku)}" title="${tr('双击选择', 'Double-click to add')}">
        <span class="mono">${esc(x.sku)}</span><span class="nm">${esc(nameOf(x))}</span><span class="wms-tag">${esc((x.suppliers || []).join(' / ') || '—')}</span><span class="num">${tr(`生产 ${x.productionDays} 天`, `${x.productionDays}d`)}</span><span class="num">${x.moq ? esc(x.moq) : ''}</span><span></span>
        <button type="button" class="wms-add-btn" data-po-add="${esc(x.sku)}" ${taken.has(x.sku.toLowerCase()) ? 'disabled' : ''}>${taken.has(x.sku.toLowerCase()) ? icon('check') + ' ' + tr('已选择', 'Added') : icon('check-square') + ' ' + tr('选择添加该 SKU', 'Add this SKU')}</button></div>`).join('')
      || `<p class="wms-hint">${tr('没有符合的 SKU', 'No matching SKU')}${onlySup && po.supplier ? tr('（只看这家供应商的 SKU）', ' (this supplier only)') : ''}</p>`;
    const item = sku => data.items.find(x => x.sku.toLowerCase() === sku.toLowerCase());
    f.querySelector('[data-po-lines]').innerHTML = po.lines.length ? `<table class="scm-table"><thead><tr><th>SKU</th><th>${tr('产品', 'Product')}</th><th>${tr('供应商（产品资料）', 'Suppliers (library)')}</th><th class="num">${tr('已完工', 'Finished')}</th><th class="num">${tr('下单数量', 'Ordered')}</th><th></th></tr></thead><tbody>
      ${po.lines.map((l, i) => { const it = item(l.sku), ok = !po.supplier || (it?.suppliers || []).includes(po.supplier);
        return `<tr><td class="mono"><b>${esc(l.sku)}</b></td><td>${esc(it ? nameOf(it) : '')}</td><td class="${ok ? '' : 'red'}">${esc((it?.suppliers || []).join(' / ') || '—')}${ok ? '' : ` · ${tr('没有这家供应商', 'not this supplier')}`}</td>
        <td class="num">${fmt(l.done || 0)}</td><td class="num"><input type="number" min="${Math.max(1, l.done || 0)}" step="1" required data-po-qty="${i}" value="${esc(l.qty)}" style="width:100px"></td>
        <td>${l.done ? '' : `<button type="button" class="scm-link" data-scm="po-rm" data-i="${i}">${icon('x')}</button>`}</td></tr>`; }).join('')}</tbody></table>`
      : `<p class="wms-hint scm-po-empty">↑ ${tr('从上面的产品库选择 SKU', 'Pick SKUs from the product library above')}</p>`;
    // Suggested expected delivery: order date + the longest production lead time of the lines
    const ready = f.querySelector('[data-po-ready]'), hint = f.querySelector('[data-po-ready-hint]'), od = f.querySelector('[name="orderedOn"]').value;
    const days = Math.max(0, ...po.lines.map(l => item(l.sku)?.productionDays || 0));
    if (od && days) { const d = new Date(od + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); const sug = d.toISOString().slice(0, 10);
      if (!ready.value) ready.value = sug; hint.textContent = tr(`按生产交期建议：${md(sug)}（下单日 + ${days} 天）`, `Suggested from production lead time: ${md(sug)} (+${days} days)`); }
  }
  const poAdd = sku => { if (!po.lines.some(l => l.sku.toLowerCase() === sku.toLowerCase())) { const it = data.items.find(x => x.sku === sku); po.lines.push({ sku, qty:String(it?.make || ''), done:0 }); } paintPo(); };
  document.addEventListener('dblclick', e => { const r = e.target.closest?.('[data-po-pick]'); if (!r || !ctx || e.target.closest('button')) return; e.preventDefault(); poAdd(r.dataset.poPick); });
  document.addEventListener('click', e => {
    const a = e.target.closest?.('[data-po-add]'); if (a && ctx) { e.preventDefault(); return poAdd(a.dataset.poAdd); }
  });
  document.addEventListener('input', e => { const t = e.target;
    if (t.matches?.('[data-po-q]')) { po.q = t.value; return paintPo(); }
    if (t.matches?.('[data-po-qty]')) { po.lines[Number(t.dataset.poQty)].qty = t.value; } });
  document.addEventListener('change', e => { const t = e.target; if (!t.closest?.('#scm-po')) return;
    for (const k of ['fam', 'series', 'status', 'brand']) if (t.matches(`[data-po-${k}]`)) po[k] = t.value;
    if (t.matches('[data-po-supplier]')) po.supplier = t.value;
    if (t.matches('[data-po-supplier],[data-po-onlysup],[data-po-fam],[data-po-series],[data-po-status],[data-po-brand],[name="orderedOn"]')) paintPo(); });
  function finishForm(id) {
    const o = (data.orders || []).find(v => v.id === id); if (!o) return;
    ctx.modal(tr(`完工入库 · ${o.number}`, `Finished · ${o.number}`), `<form id="scm-finish" data-id="${esc(id)}" class="scm-form">
      <p class="scm-hint">${tr('做完的数量入到工厂仓，在产数量随之减少；全部完工就是交付，系统对比预计交期记准时或延迟。', 'Finished units go into a factory warehouse and in production drops; all finished = delivered, on time or late against the expected date.')}</p>
      <div class="form-grid"><label class="field"><span>${tr('完工日期', 'Date')}</span><input name="opDate" type="date" required value="${today()}" max="${today()}" min="2000-01-01"></label>
      <label class="field"><span>${tr('入哪个工厂仓', 'Into which factory warehouse')}</span><select name="location"><option value="dg">${tr('东莞工厂仓', 'Dongguan')}</option><option value="jn">${tr('济南工厂仓', 'Jinan')}</option></select></label></div>
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
      <label class="field"><span>${tr('头程', 'First leg')}</span><select name="firstLeg" required data-scm-legs><option value="">${tr('请选择', 'Choose')}</option>${Object.entries(FIRST_LEG).map(([k, v]) => `<option value="${k}">${esc(w(v))}（${v[2]} ${tr('天', 'd')}）</option>`).join('')}</select></label>
      <label class="field"><span>${tr('尾程', 'Last mile')}</span><select name="lastLeg" required data-scm-legs><option value="">${tr('请选择', 'Choose')}</option>${Object.entries(LAST_LEG).map(([k, v]) => `<option value="${k}">${esc(w(v))}（${v[2]} ${tr('天', 'd')}）</option>`).join('')}</select></label>
      <label class="field"><span>${tr('承运商', 'Carrier')}</span><input name="carrier" maxlength="80" placeholder="${tr('如 Matson / COSCO / DHL', 'e.g. Matson / COSCO / DHL')}"></label>
      <label class="field"><span>Tracking</span><input name="tracking" maxlength="120" placeholder="${tr('单号或查询链接', 'Number or tracking link')}"></label>
      <label class="field"><span>${tr('货从哪来', 'From')}</span><select name="source">${opt(SOURCE, 'dg')}</select></label>
      <label class="field"><span>${tr('发货日期', 'Ship date')}</span><input name="shippedOn" type="date" required value="${today()}" max="${today()}" min="2000-01-01" data-scm-eta-src></label>
      <label class="field"><span>${tr('预计多少天到（= 头程 + 尾程，可改）', 'Days to arrive (= first leg + last mile, editable)')}</span><input name="etaDays" type="number" min="0" max="180" required value="" data-scm-eta-src></label>
      <label class="field"><span>${tr('预计到港日期', 'ETA')}</span><input name="eta" type="date" readonly data-scm-eta></label>
      <label class="field"><span>${tr('对应采购单（选填）', 'Purchase order (optional)')}</span><select name="orderId"><option value="">${tr('不关联', 'None')}</option>${(data.orders || []).filter(o => o.status === 'issued').map(o => `<option value="${esc(o.id)}">${esc(o.number)} · ${tr(`在产 ${o.left} 件`, `${o.left} in production`)}</option>`).join('')}</select></label></div>
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
    if (a === 'new-po') return orderForm();
    if (a === 'order-sku') return orderForm(null, { sku:b.dataset.sku, qty:b.dataset.qty });
    if (a === 'edit-po') return orderForm((data.orders || []).find(o => o.id === b.dataset.id));
    if (a === 'po-rm') { po.lines.splice(Number(b.dataset.i), 1); return paintPo(); }
    if (a === 'issue-po') {
      if (!window.confirm?.(tr('已经和工厂确认，下达生产？下达后这张单的数量算作“在产”。', 'Confirmed with the factory? Once issued, the order counts as in production.'))) return;
      try { await ctx.api.post(`/scm/orders/${encodeURIComponent(b.dataset.id)}/issue`, {}); ctx.toast?.(tr('已下达生产', 'Issued')); data = null; load(); } catch (x) { ctx.toast?.(x.message || tr('操作失败', 'Failed')); }
      return;
    }
    if (a === 'pos') return positionForm(b.dataset.id);
    if (a === 'finish-po') return finishForm(b.dataset.id);
    if (a === 'close-po') {
      if (!window.confirm?.(tr('关闭（或取消）这张采购单？没完工的数量不再算作在产。', 'Close (or cancel) this order? What is not finished no longer counts as in production.'))) return;
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
  // 头程 / 尾程 chosen: their default days fill in “days to arrive”
  document.addEventListener('change', e => { const t = e.target; if (!t.matches?.('[data-scm-legs]')) return;
    const f = t.closest('form'), a = FIRST_LEG[f.querySelector('[name="firstLeg"]').value], b = LAST_LEG[f.querySelector('[name="lastLeg"]').value];
    if (a && b) { f.querySelector('[name="etaDays"]').value = a[2] + b[2]; syncEta(); } });
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
        await ctx.api.post(`/scm/orders/${encodeURIComponent(f.dataset.id)}/finish`, { opDate:v.opDate, location:v.location, lines });
      }
      else if (f.id === 'scm-pos') { await ctx.api.post(`/scm/shipments/${encodeURIComponent(f.dataset.id)}/position`, { position:String(v.position || '').trim(), ...(v.eta ? { eta:v.eta } : {}) }); }
      else if (f.id === 'scm-po') {
        const lines = po.lines.map(l => ({ sku:l.sku, qty:Number(l.qty) }));
        if (!lines.length || lines.some(l => !Number.isInteger(l.qty) || l.qty < 1)) throw new Error(tr('请从产品库选择 SKU，并填每个 SKU 的数量。', 'Pick SKUs from the product library and fill in each quantity.'));
        const body = { supplier:v.supplier, orderedOn:v.orderedOn, readyOn:v.readyOn, lines, ...(String(v.number || '').trim() ? { number:String(v.number).trim() } : {}), ...(String(v.note || '').trim() ? { note:String(v.note).trim() } : {}) };
        if (po.id) await ctx.api.post(`/scm/orders/${encodeURIComponent(po.id)}/edit`, body);
        else { const r = await ctx.api.post('/scm/orders', body); ctx.toast?.(tr(`已保存草稿 ${r.number}，已通知其他供应链管理同事`, `Draft ${r.number} saved; other supply managers were told`)); }
        ui.tab = 'orders';
      }
      else {
        const lines = shipLines.filter(l => l.sku).map(l => ({ sku:l.sku, qty:Number(l.qty) }));
        if (!lines.length || lines.some(l => !Number.isInteger(l.qty) || l.qty < 1)) throw new Error(tr('请填每个 SKU 和数量（正整数）。', 'Fill in each SKU and a quantity above 0.'));
        await ctx.api.post('/scm/shipments', { number:String(v.number).trim(), firstLeg:v.firstLeg, lastLeg:v.lastLeg, carrier:String(v.carrier || '').trim() || undefined, tracking:String(v.tracking || '').trim() || undefined,
          source:v.source, shippedOn:v.shippedOn, etaDays:Number(v.etaDays), note:String(v.note || '').trim() || undefined, lines, ...(v.orderId ? { orderId:v.orderId } : {}) });
        ui.tab = 'ship';
      }
      ctx.closeOverlay(); ctx.toast?.(tr('已保存', 'Saved')); data = null; load();
    } catch (x) { err.textContent = x.message || tr('保存失败', 'Could not save'); }
  });

  window.WorkOSScm = { configure, render, reset };
})();
