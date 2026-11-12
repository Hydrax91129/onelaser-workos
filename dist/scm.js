/*
 * Supply chain (SCM): a lean decision board.
 *  - Reorder: daily sales (DS) per SKU from Shopify over 365 and 30 days, the monthly need, what the US LA warehouse
 *    holds and what is on the way, and the suggestion: ship from factory stock, or order production.
 *  - In transit: containers and parcels with tracking, ship date, days to arrive and the SKUs and quantities on board.
 *    Creating one moves the goods to "in transit" in WMS; "arrived" moves them into the US LA warehouse.
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
  const STATUS = { risk:['缺货风险', 'Stockout risk', 'red'], reorder:['需补货', 'Reorder', 'amber'], ok:['正常', 'OK', 'green'], overstock:['库存过多', 'Overstock', 'blue'], no_sales:['有货没销量', 'Stock, no sales', 'grey'], idle:['无货无销量', 'No stock, no sales', 'grey'] };
  const ORDER = ['risk', 'reorder', 'overstock', 'ok', 'no_sales', 'idle'];
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
    const it = data.items, s = data.settings, sh = data.shopify, open = data.shipments.filter(x => x.status === 'in_transit');
    const count = k => it.filter(x => x.status === k).length, sum = k => it.reduce((a, x) => a + (x[k] || 0), 0);
    const kpi = (label, value, note, cls = '') => `<div class="scm-kpi ${cls}"><span>${label}</span><b>${value}</b><em>${note}</em></div>`;
    return `<div class="scm">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · SCM</div><h1>${tr('供应链管理（SCM）', 'Supply chain (SCM)')}</h1>
        <p>${tr(`按 Shopify 日销（DS）算每个 SKU 一个月要多少货、该补多少；在途货柜看到哪里了。补货目标：交期 + ${s.targetDays} 天销量 + ${s.safetyDays} 天安全库存。`, `Daily sales (DS) from Shopify drive each SKU's monthly need and reorder; containers show what is on the way. Target: lead time + ${s.targetDays} days of sales + ${s.safetyDays} safety days.`)}</p></div>
        <div class="heading-actions">${window.WorkOSErpAccess?.button?.('supply') || ''}${data.canManage ? `<button class="btn" data-scm="settings">${icon('sliders-horizontal')} ${tr('补货参数', 'Reorder settings')}</button><button class="btn primary" data-scm="sync" ${busy ? 'disabled' : ''}>${icon('arrows-clockwise')} ${busy ? tr('同步中…', 'Syncing…') : tr('同步 Shopify 销量', 'Sync Shopify sales')}</button>` : ''}</div></div>
      <div class="scm-sync ${sh.configured ? '' : 'off'}">${icon('storefront')} ${!sh.configured && sh.lastAt && sh.units ? tr(`Shopify 还没连接到这个站点；下面是已有的销量数据（${sh.since} 起 ${fmt(sh.units)} 件${sh.note ? '，' + esc(sh.note) : ''}）。`, `Shopify is not connected here; the board uses the sales already stored (${fmt(sh.units)} units since ${sh.since}${sh.note ? ', ' + esc(sh.note) : ''}).`)
        : !sh.configured ? tr('Shopify 还没连接：请主管理员在部署配置里设置 Shopify（需要 read_orders 和 read_all_orders 权限，才能读到 365 天的订单）。没连接之前，日销都是 0。', 'Shopify is not connected yet: a main admin sets it in the deployment settings (read_orders and read_all_orders are needed for 365 days of orders). Until then daily sales are 0.')
        : sh.lastAt ? tr(`Shopify 已连接 · 最近同步 ${new Date(sh.lastAt).toLocaleString('zh-CN')} ${sh.status === 'failed' ? '（失败）' : `· ${sh.since} 起 ${fmt(sh.orders)} 单、${fmt(sh.units)} 件`} · 日销按 ${sh.daysOfHistory} 天算`, `Shopify connected · last sync ${new Date(sh.lastAt).toLocaleString('en-US')} ${sh.status === 'failed' ? '(failed)' : `· since ${sh.since}: ${fmt(sh.orders)} orders, ${fmt(sh.units)} units`} · DS over ${sh.daysOfHistory} days`)
        : tr('Shopify 已连接，还没同步过：点右上角“同步 Shopify 销量”。', 'Shopify connected, not synced yet: use Sync Shopify sales.')}</div>
      <div class="scm-kpis">
        ${kpi(tr('缺货风险', 'Stockout risk'), count('risk'), tr('可售天数短于交期', 'cover shorter than lead time'), count('risk') ? 'red' : '')}
        ${kpi(tr('需补货', 'Reorder'), count('reorder'), tr('低于补货目标', 'below the target'), count('reorder') ? 'amber' : '')}
        ${kpi(tr('建议工厂发货', 'Ship from factory'), fmt(sum('ship')), tr('件（用工厂现货）', 'units from factory stock'))}
        ${kpi(tr('建议下单生产', 'Order production'), fmt(sum('make')), tr('件', 'units'))}
        ${kpi(tr('在途货柜', 'In transit'), open.length, tr(`${fmt(open.reduce((a, x) => a + x.units, 0))} 件 · ${open.filter(x => x.daysLeft < 0).length} 个已过预计到港`, `${fmt(open.reduce((a, x) => a + x.units, 0))} units · ${open.filter(x => x.daysLeft < 0).length} past ETA`), open.some(x => x.daysLeft < 0) ? 'amber' : '')}
      </div>
      <div class="scm-tabs"><button class="${ui.tab === 'reorder' ? 'on' : ''}" data-scm="tab" data-v="reorder">${icon('chart-line-up')} ${tr('补货建议', 'Reorder')}</button><button class="${ui.tab === 'ship' ? 'on' : ''}" data-scm="tab" data-v="ship">${icon('boat')} ${tr('在途货柜', 'In transit')} <b>${open.length}</b></button></div>
      ${ui.tab === 'reorder' ? reorderView() : shipView()}
    </div>`;
  }

  const sortTh = (k, label, cls = '') => `<th class="${cls} scm-sort ${ui.sort === k ? 'on' : ''}" data-scm="sort" data-v="${k}">${label}${ui.sort === k ? (ui.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  function reorderView() {
    const q = ui.q.trim().toLowerCase();
    let list = data.items.filter(x => (!ui.status || x.status === ui.status) && (!q || [x.sku, x.nameZh, x.nameEn].some(v => String(v || '').toLowerCase().includes(q))));
    const key = x => ui.sort === 'sku' ? x.sku : ui.sort ? (x[ui.sort] ?? -1) : ORDER.indexOf(x.status) * 1e6 + (x.cover ?? 999999);
    list = list.slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * (ui.sort ? ui.dir : 1); });
    const chips = [['', tr('全部', 'All'), data.items.length], ...ORDER.map(k => [k, w(STATUS[k]), data.items.filter(x => x.status === k).length]).filter(([, , n]) => n)];
    return `<div class="scm-bar"><label class="scm-search">${icon('magnifying-glass')}<input data-scm-q value="${esc(ui.q)}" placeholder="${tr('搜索 SKU 或名称', 'Search SKU or name')}"></label>
        <div class="scm-chips">${chips.map(([k, label, n]) => `<button class="${ui.status === k ? 'on' : ''}" data-scm="status" data-v="${k}">${esc(label)} <b>${n}</b></button>`).join('')}</div></div>
      <div class="scm-table-wrap"><table class="scm-table"><thead><tr>${sortTh('sku', 'SKU')}<th>${tr('产品', 'Product')}</th>${sortTh('ds365', tr('DS · 365 天', 'DS · 365d'), 'num')}${sortTh('ds30', tr('DS · 30 天', 'DS · 30d'), 'num')}${sortTh('monthly', tr('月需求', 'Monthly need'), 'num')}
        ${sortTh('us', tr('美国仓', 'US'), 'num')}${sortTh('transit', tr('在途', 'In transit'), 'num')}${sortTh('factory', tr('工厂仓', 'Factory'), 'num')}${sortTh('cover', tr('可售天数', 'Days of cover'), 'num')}${sortTh('leadDays', tr('交期', 'Lead'), 'num')}
        ${sortTh('ship', tr('建议发货', 'Ship'), 'num')}${sortTh('make', tr('建议生产', 'Produce'), 'num')}<th>${tr('状态', 'Status')}</th></tr></thead><tbody>
        ${list.map(x => { const st = STATUS[x.status] || STATUS.idle, trend = x.ds365 > 0 ? (x.ds30 - x.ds365) / x.ds365 : null;
          return `<tr><td class="mono">${esc(x.sku)}</td><td>${esc(nameOf(x))}</td><td class="num"><b>${x.ds365}</b></td><td class="num">${x.ds30}${trend != null && Math.abs(trend) >= 0.2 ? ` <span class="${trend > 0 ? 'up' : 'down'}">${trend > 0 ? '▲' : '▼'}${Math.round(Math.abs(trend) * 100)}%</span>` : ''}</td>
            <td class="num">${fmt(x.monthly)}</td><td class="num">${fmt(x.us)}</td><td class="num">${fmt(x.transit)}</td><td class="num">${fmt(x.factory)}</td>
            <td class="num ${x.status === 'risk' ? 'red' : ''}">${x.cover == null ? '—' : fmt(x.cover) + tr(' 天', 'd')}</td><td class="num" title="${x.leadFromLibrary ? tr('来自产品资料：生产交期 + 头程时间', 'From the product library: production + first leg') : tr('产品资料没填，用默认交期', 'Not in the product library; default lead time')}">${x.leadDays}${x.leadFromLibrary ? '' : '*'}</td>
            <td class="num">${x.ship ? `<b>${fmt(x.ship)}</b>` : '—'}</td><td class="num">${x.make ? `<b class="red">${fmt(x.make)}</b>` : '—'}</td><td><span class="scm-pill ${st[2]}">${w(st)}</span></td></tr>`; }).join('') || `<tr><td colspan="13" class="scm-empty">${tr('没有符合的 SKU', 'No matching SKU')}</td></tr>`}
      </tbody></table></div>
      <p class="scm-hint">${tr('DS = 每天平均卖出的件数。可售天数 = (美国仓 + 在途) ÷ DS（365 天）。建议量 = DS × (交期 + 目标天数 + 安全天数) − 美国仓 − 在途：先用工厂仓现货发，不够的下单生产。交期带 * 表示产品资料里没填，用默认值。', 'DS = units sold per day. Days of cover = (US + in transit) ÷ DS (365d). Suggestion = DS × (lead + target + safety days) − US − in transit: ship from factory stock first, produce the rest. * = no lead time in the product library; default used.')}</p>`;
  }

  function shipView() {
    const list = data.shipments.slice().sort((a, b) => (a.status === b.status ? 0 : a.status === 'in_transit' ? -1 : 1) || String(a.eta).localeCompare(String(b.eta)));
    const trackLink = t => /^https:\/\//.test(t) ? `<a href="${esc(t)}" target="_blank" rel="noopener">${esc(t.replace(/^https:\/\/(www\.)?/, '').slice(0, 40))}</a>` : esc(t || '—');
    return `<div class="scm-bar"><span class="scm-hint">${tr('新建货柜时，货会从工厂仓（或作为新生产的货）转到“在途运输中”；到港后点“到港入仓”，货转进美国LA仓。都记在库存流水里。', 'A new shipment moves the goods to In transit (from a factory warehouse or as new goods); Arrived moves them into the US LA warehouse. Both show in the stock log.')}</span><span class="scm-sp"></span>
        ${data.canManage ? `<button class="btn primary" data-scm="new-ship">${icon('plus')} ${tr('新建货柜', 'New shipment')}</button>` : ''}</div>
      <div class="scm-ships">${list.map(x => `<div class="scm-ship ${x.status}">
        <div class="head"><b class="mono">${esc(x.number)}</b><span class="scm-pill ${x.status === 'arrived' ? 'green' : x.daysLeft < 0 ? 'red' : 'blue'}">${x.status === 'arrived' ? tr(`已到港 ${x.arrivedOn}`, `Arrived ${x.arrivedOn}`) : x.daysLeft < 0 ? tr(`已超预计到港 ${-x.daysLeft} 天`, `${-x.daysLeft} days past ETA`) : tr(`还有 ${x.daysLeft} 天到`, `${x.daysLeft} days to go`)}</span>
          <span class="scm-sp"></span>${data.canManage && x.status === 'in_transit' ? `<button class="btn small" data-scm="arrive" data-id="${esc(x.id)}">${icon('check')} ${tr('到港入仓', 'Arrived')}</button>` : ''}</div>
        <dl><div><dt>${tr('方式', 'Mode')}</dt><dd>${esc(w(MODE[x.mode]))}${x.carrier ? ' · ' + esc(x.carrier) : ''}</dd></div><div><dt>Tracking</dt><dd>${trackLink(x.tracking)}</dd></div>
          <div><dt>${tr('发货 → 预计到港', 'Shipped → ETA')}</dt><dd>${esc(x.shippedOn)} → <b>${esc(x.eta)}</b></dd></div><div><dt>${tr('来源', 'From')}</dt><dd>${esc(w(SOURCE[x.source]))}</dd></div></dl>
        <div class="lines">${x.lines.map(l => `<span><span class="mono">${esc(l.sku)}</span> × <b>${fmt(l.qty)}</b></span>`).join('')}<em>${tr(`共 ${x.lines.length} 个 SKU、${fmt(x.units)} 件`, `${x.lines.length} SKUs, ${fmt(x.units)} units`)}</em></div>
        ${x.note ? `<p class="scm-hint">${esc(x.note)}</p>` : ''}</div>`).join('') || `<p class="scm-empty">${tr('还没有在途货柜', 'Nothing in transit')}</p>`}</div>`;
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
      <label class="field"><span>${tr('预计到港日期', 'ETA')}</span><input name="eta" type="date" readonly data-scm-eta></label></div>
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
      <label class="field"><span>${tr('默认交期（天，产品资料没填时用）', 'Default lead time (days, when the product library has none)')}</span><input name="leadDays" type="number" min="1" max="365" value="${s.leadDays}" required></label></div>
      <p class="scm-hint">${tr('交期优先用产品资料里的“生产交期 + 头程时间”。', 'Lead time comes from the product library (production + first leg) when filled in.')}</p><p class="scm-error" role="alert"></p></form>`,
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
    if (a === 'add-line') { shipLines.push({ sku:'', qty:'' }); return paintLines(); }
    if (a === 'rm-line') { shipLines.splice(Number(b.dataset.i), 1); return paintLines(); }
    if (a === 'sync') {
      if (busy) return; busy = true; ctx.rerender();
      try { const r = await ctx.api.post('/scm/sync', { days:365 }); ctx.toast?.(tr(`已同步：${r.since} 起 ${fmt(r.orders)} 单、${fmt(r.units)} 件`, `Synced: ${fmt(r.orders)} orders, ${fmt(r.units)} units since ${r.since}`)); data = null; }
      catch (x) { ctx.toast?.(x.message || tr('同步失败', 'Sync failed')); }
      finally { busy = false; data ? ctx.rerender() : load(); }
      return;
    }
    if (a === 'arrive') {
      if (!window.confirm?.(tr('确认这个货柜已经到港？货会从“在途运输中”转进美国LA仓。', 'Confirm this shipment arrived? The goods move from In transit into the US LA warehouse.'))) return;
      try { await ctx.api.post(`/scm/shipments/${encodeURIComponent(b.dataset.id)}/arrive`, {}); ctx.toast?.(tr('已入仓', 'Received')); data = null; load(); }
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
    const f = e.target; if (!ctx || !['scm-ship', 'scm-settings'].includes(f.id)) return;
    e.preventDefault(); const err = f.querySelector('.scm-error'); err.textContent = '';
    const v = Object.fromEntries(new FormData(f));
    try {
      if (f.id === 'scm-settings') { await ctx.api.request('/scm/settings', { method:'PUT', body:{ targetDays:Number(v.targetDays), safetyDays:Number(v.safetyDays), leadDays:Number(v.leadDays) } }); }
      else {
        const lines = shipLines.filter(l => l.sku).map(l => ({ sku:l.sku, qty:Number(l.qty) }));
        if (!lines.length || lines.some(l => !Number.isInteger(l.qty) || l.qty < 1)) throw new Error(tr('请填每个 SKU 和数量（正整数）。', 'Fill in each SKU and a quantity above 0.'));
        await ctx.api.post('/scm/shipments', { number:String(v.number).trim(), mode:v.mode, carrier:String(v.carrier || '').trim() || undefined, tracking:String(v.tracking || '').trim() || undefined,
          source:v.source, shippedOn:v.shippedOn, etaDays:Number(v.etaDays), note:String(v.note || '').trim() || undefined, lines });
        ui.tab = 'ship';
      }
      ctx.closeOverlay(); ctx.toast?.(tr('已保存', 'Saved')); data = null; load();
    } catch (x) { err.textContent = x.message || tr('保存失败', 'Could not save'); }
  });

  window.WorkOSScm = { configure, render, reset };
})();
