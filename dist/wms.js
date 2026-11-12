/*
 * Inventory management (WMS).
 *
 * Stock is kept per SKU and location (US warehouse, Dongguan factory, Jinan
 * factory, in transit). Warehouse operators record goods in, goods out,
 * transfers and count adjustments; every change is a movement with who, when,
 * how many, the reason and, for goods out, an order number. Count adjustments
 * wait for a leader's confirmation before they change stock. Managers choose
 * who the warehouse operators are. Warehouse managers can add a SKU here; an
 * administrator loads the opening balance from a CSV file (Excel → Save as CSV).
 *
 * Data comes from /wms/* (server). No product or stock data is bundled here.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '';
  const PAGE = 300; // rows drawn at once; thousands of SKUs made every keystroke redraw the whole table
  const ui = { q:'', loc:'', type:'', fam:'', series:'', status:'', brand:'', pmin:'', pmax:'', stock:'', sort:'', dir:1, tab:'stock', sku:null, limit:PAGE };
  const history = { sku:null, list:null, loading:false };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const word = x => x ? (lang() === 'en' ? x.en : x.zh) : '';
  const fmtN = n => Number(n || 0).toLocaleString('en-US');
  const when = iso => new Date(iso).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const TYPES = { in:['入库', 'Goods in', 'arrow-circle-down', 'in'], out:['出库', 'Goods out', 'arrow-circle-up', 'out'], transfer:['调拨', 'Transfer', 'arrows-left-right', 'transfer'], adjust:['盘点调整', 'Count adjustment', 'clipboard-text', 'adjust'], move:['移库', 'Bin move', 'arrows-down-up', 'transfer'] };
  const apiBase = () => (window.WORKOS_CONFIG && window.WORKOS_CONFIG.apiBase) || '/api';
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const famName = k => k ? word(data.families?.find(f => f.key === k)) || k : '';
  const usd = v => v == null || v === '' ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits:2 });
  /* Product facts from the product library (PIM): Chinese / English name, family, series, MSRP and the main image. */
  const pname = it => (lang() === 'en' ? it.nameEn || it.nameZh : it.nameZh || it.nameEn) || it.name || '';
  const pother = it => { const o = lang() === 'en' ? it.nameZh : it.nameEn; return o && o !== pname(it) ? o : ''; };
  const thumb = it => it.imageId ? `<img class="wms-thumb" loading="lazy" decoding="async" src="${apiBase()}/products/library/files/${encodeURIComponent(it.imageId)}" alt="">` : `<span class="wms-thumb none" aria-hidden="true">${icon('image')}</span>`;
  const skuCell = it => `<td class="wms-skucell">${thumb(it)}<span class="mono">${esc(it.sku)}</span></td>`;
  const prodCell = it => `<td class="wms-prod">${esc(pname(it))}${pother(it) ? `<small>${esc(pother(it))}</small>` : ''}</td>`;
  const famCell = it => `<td>${it.family ? `<span class="wms-tag">${esc(famName(it.family))}</span>` : `<span class="wms-tag dim">${tr('未设置', 'Not set')}</span>`}${it.series ? `<small>${esc(it.series)}</small>` : ''}</td>`;
  const binsOf = (it, l) => (it.bins?.[l] || ['', '', '']).concat(['', '', '']).slice(0, 3);
  const binQ = (it, l) => (it.binQty?.[l] || [0, 0, 0]).concat([0, 0, 0]).slice(0, 3).map(Number);
  const unassigned = (it, l) => Math.max(0, n(it, l) - binQ(it, l).reduce((a, b) => a + b, 0));
  /* How a movement was made: by hand, several SKUs in one go, opening import or a dealer shipment. */
  const methodLabel = m => { const t = TYPES[m.type] ? tr(TYPES[m.type][0], TYPES[m.type][1]) : m.type;
    return m.method === 'import' ? tr('期初导入', 'Opening import') : m.method === 'dealer' ? tr('经销商发货', 'Dealer shipment')
      : m.method === 'batch' ? tr(`批量${m.type === 'adjust' ? '盘点' : t}`, `Batch ${t.toLowerCase()}`) : tr(`手动${m.type === 'adjust' ? '盘点' : t}`, `Manual ${t.toLowerCase()}`); };
  const STATES = { done:['已生效', 'Applied', 'done'], pending:['待确认', 'Awaiting confirmation', 'pending'], rejected:['已驳回', 'Rejected', 'rejected'] };

  function configure(next) { ctx = next; }
  function reset() { data = null; loading = false; error = ''; Object.assign(ui, { q:'', loc:'', type:'', fam:'', series:'', status:'', brand:'', pmin:'', pmax:'', stock:'', sort:'', dir:1, tab:'stock', sku:null, limit:PAGE }); Object.assign(history, { sku:null, list:null, loading:false }); }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/wms/summary'); error = ''; history.list = null; if (data.canOperate) await loadArrivals(); }
    catch (e) { error = e.message || tr('库存读取失败', 'Could not load inventory'); }
    finally { loading = false; ctx.rerender(); }
  }
  /* The summary carries only the latest 500 movements; one SKU's full history comes from the server. */
  async function loadHistory(sku) {
    Object.assign(history, { sku, list:null, loading:true });
    try { const r = await ctx.api.get('/wms/movements?sku=' + encodeURIComponent(sku)); if (history.sku === sku) history.list = r.movements; }
    catch { if (history.sku === sku) history.list = data.movements.filter(m => m.sku === sku); }
    finally { if (history.sku === sku) { history.loading = false; ctx.rerender(); } }
  }
  function logList() {
    if (ui.sku && (history.sku !== ui.sku || (!history.list && !history.loading))) loadHistory(ui.sku);
    const base = ui.sku ? (history.list || data.movements.filter(m => m.sku === ui.sku)) : data.movements;
    const q = ui.q.trim().toLowerCase();
    return base.filter(m => (!ui.type || m.type === ui.type)
      && (!q || [m.sku, m.reason, m.reference, m.byName, m.opDate, methodLabel(m)].some(x => String(x || '').toLowerCase().includes(q))));
  }
  const loc = id => data.locations.find(l => l.id === id);
  const total = it => data.locations.reduce((s, l) => s + Number(it.qty?.[l.id] || 0), 0);

  function render() {
    if (!data && !error) { load(); return `<div class="wms"><p class="wms-hint">${tr('正在读取库存…', 'Loading inventory…')}</p></div>`; }
    if (error && !data) return `<div class="wms"><div class="wms-alert">${esc(error)}</div></div>`;
    const items = filtered();
    const pending = data.movements.filter(m => m.status === 'pending'), mineToDecide = pending.filter(m => m.canDecide);
    const today = data.movements.filter(m => new Date(m.createdAt).toDateString() === new Date().toDateString()).length;
    return `<div class="wms">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · WMS</div><h1>${tr('库存管理', 'Inventory')}</h1><p>${tr('按 SKU 和库位记录库存。每一次入库、出库、调拨和盘点调整都会留下流水；盘点调整需直属主管确认后生效。', 'Stock per SKU and location. Every goods-in, goods-out, transfer and count adjustment is logged; count adjustments take effect after the submitter’s manager confirms.')}${data.lastImport ? `<br><small class="wms-hint">${tr(`期初库存截至 ${String(data.lastImport.asOf).slice(0, 10)}`, `Opening stock as of ${String(data.lastImport.asOf).slice(0, 10)}`)}</small>` : ''}</p></div>
        <div class="heading-actions">${data.items.length ? `<button class="btn" data-wms="export" title="${tr('按当前筛选和排序导出库存', 'Exports the stock with the current filter and sort')}">${icon('download-simple')} ${tr('导出 CSV', 'Export CSV')}</button>` : ''}${data.canImport ? `<button class="btn" data-wms="import">${icon('upload-simple')} ${tr('导入期初库存', 'Import opening stock')}</button>` : ''}${data.canOperate ? `<button class="btn" data-wms="new-sku">${icon('plus')} ${tr('新增 SKU', 'New SKU')}</button>` : ''}${window.WorkOSErpAccess?.button?.('warehouse') || ''}</div></div>
      ${data.canOperate ? '' : `<div class="wms-note">${icon('eye')} ${tr('你的仓库库存权限是“查看”：可以看库存和流水，不能加减数量。需要管理权限请联系主管在“供应链权限管理”里开通。', 'Your warehouse access is view-only: you can see stock and movements but not change quantities. Ask a manager to grant Manage in Supply chain permissions.')}</div>`}
      <div class="wms-kpis">${data.locations.map(l => `<button class="wms-kpi ${ui.loc === l.id ? 'on' : ''}" data-wms="loc" data-v="${esc(l.id)}"><span>${esc(word(l))}</span><b>${fmtN(data.items.reduce((s, it) => s + Number(it.qty?.[l.id] || 0), 0))}</b><em>${data.items.filter(it => Number(it.qty?.[l.id] || 0) > 0).length} SKU${data.values ? ` · ${data.values.cost ? tr('成本货值', 'cost') : tr('零售货值', 'retail')} ${usd(data.values.cost ? data.values.cost[l.id] : data.values.msrp[l.id])}` : ''}</em></button>`).join('')}
        <div class="wms-kpi ${pending.length ? 'warn' : ''}"><span>${tr('待确认', 'Awaiting confirmation')}</span><b>${pending.length}</b><em>${tr('盘点调整', 'count adjustments')}</em></div>
        <div class="wms-kpi"><span>${tr('今日流水', 'Today')}</span><b>${today}</b><em>${tr('条操作', 'movements')}</em></div></div>
      ${!data.items.length ? `<div class="wms-note">${icon('info')} ${data.canImport ? tr('还没有库存数据。请点右上角“导入期初库存”，上传库存表（Excel 另存为 CSV）。', 'No stock yet. Use “Import opening stock” at the top right and upload the stock sheet (Excel saved as CSV).') : tr('还没有库存数据，等待管理员导入期初库存。', 'No stock yet; waiting for an administrator to import the opening balance.')}</div>` : ''}
      ${mineToDecide.length ? `<section class="wms-pending"><h3>${icon('seal-question')} ${tr('待你确认的盘点调整', 'Count adjustments awaiting you')} <b>${mineToDecide.length}</b></h3>${mineToDecide.map(m => `<div class="wms-pend-row"><span class="wms-type adjust">${tr('盘点调整', 'Adjust')}</span><strong>${esc(m.sku)}</strong><span>${esc(word(loc(m.location)))}</span><span class="${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${fmtN(m.qty)}</span><span class="wms-by">${tr(`系统 ${fmtN(m.systemQty)} → 实盘 ${fmtN(m.counted)}`, `system ${fmtN(m.systemQty)} → counted ${fmtN(m.counted)}`)}</span><span class="wms-reason">${esc(m.reason)}</span><span class="wms-by">${esc(m.byName)} · ${when(m.createdAt)}</span><button class="btn small primary" data-wms="approve" data-id="${esc(m.id)}">${tr('确认生效', 'Confirm')}</button><button class="btn small" data-wms="reject" data-id="${esc(m.id)}">${tr('驳回', 'Reject')}</button></div>`).join('')}</section>` : ''}
      <div class="wms-tabs"><button class="${ui.tab === 'stock' ? 'on' : ''}" data-wms="tab" data-v="stock">${icon('package')} ${tr('库存', 'Stock')}</button><button class="${ui.tab === 'log' ? 'on' : ''}" data-wms="tab" data-v="log">${icon('list-bullets')} ${tr('出入库流水', 'Movements')}</button></div>
      <div class="wms-toolbar"><label class="wms-search">${icon('magnifying-glass')}<input data-wms-search value="${esc(ui.q)}" placeholder="${ui.tab === 'stock' ? tr('搜索 SKU 或产品名', 'Search SKU or product') : tr('搜索 SKU、原因、单号或操作人', 'Search SKU, reason, reference or person')}"></label>
        <span class="wms-spacer"></span>
        ${data.canOperate ? `<button class="btn primary" data-wms="arrivals">${icon('boat')} ${tr('到港入仓', 'Arrivals')}${arrivals?.arrivals?.length ? ` <b class="wms-badge">${arrivals.arrivals.length}</b>` : ''}</button>` + Object.entries(TYPES).filter(([k]) => k !== 'move').map(([k, [zh, en, ic]]) => `<button class="btn" data-wms="op" data-type="${k}">${icon(ic)} ${tr(zh, en)}</button>`).join('') + `<button class="btn" data-wms="binmgr">${icon('grid-four')} ${tr('库位管理', 'Bins')}</button>` : ''}</div>
      ${ui.tab === 'stock' ? stockTable(items) : logTable(logList())}
    </div>`;
  }
  /* Filters: search, product type, location with stock, stock situation; any column can be sorted. */
  const STOCK = [['', '全部', 'All'], ['us-out', '美国LA仓缺货', 'Out of stock in US LA'], ['us-low', '美国LA仓 ≤ 2 件', 'US LA ≤ 2'], ['transit', '在途运输中有货', 'In transit'], ['factory', '东莞 / 济南工厂仓有货', 'Stock at a factory'], ['zero', '所有库位都为 0', 'Zero everywhere']];
  const n = (it, l) => Number(it.qty?.[l] || 0);
  const stockIs = (it, k) => !k || (k === 'us-out' ? n(it, 'us') === 0 && total(it) > 0 : k === 'us-low' ? n(it, 'us') <= 2 : k === 'transit' ? n(it, 'transit') > 0 : k === 'factory' ? n(it, 'dg') + n(it, 'jn') > 0 : total(it) === 0);
  function baseFiltered() {
    const q = ui.q.trim().toLowerCase();
    const lo = ui.pmin === '' ? null : Number(ui.pmin), hi = ui.pmax === '' ? null : Number(ui.pmax);
    return data.items.filter(it => (!q || [it.sku, it.name, it.nameZh, it.nameEn, it.series, ...Object.values(it.bins || {}).flat()].some(x => String(x || '').toLowerCase().includes(q)))
      && (!ui.fam || (ui.fam === '-' ? !it.family : it.family === ui.fam)) && (!ui.series || it.series === ui.series) && (!ui.status || it.status === ui.status) && (!ui.brand || it.brand === ui.brand)
      && (lo == null || (it.msrp != null && it.msrp >= lo)) && (hi == null || (it.msrp != null && it.msrp <= hi)));
  }
  function filtered(base = baseFiltered()) {
    const list = base.filter(it => stockIs(it, ui.stock));
    if (!ui.sort) return list;
    const key = it => ui.sort === 'sku' ? it.sku : ui.sort === 'name' ? pname(it) : ui.sort === 'type' ? famName(it.family) + ' ' + (it.series || '') : ui.sort === 'msrp' ? Number(it.msrp ?? -1)
      : ui.sort === 'bin' ? binsOf(it, ui.loc)[0] || '\uffff' : ui.sort === 'total' ? total(it) : n(it, ui.sort);
    return list.slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'zh')) * ui.dir; });
  }
  function filterBar() {
    // Product filters stay visible even when a list is short (owner, 2026-11-12): family (主机 / 配件 / 耗材 …), series, status, brand, MSRP range.
    const fams = data.families || [], noFam = data.items.filter(it => !it.family).length;
    const series = [...new Set(data.items.filter(it => !ui.fam || it.family === ui.fam).map(it => it.series).filter(Boolean))].sort();
    const base = baseFiltered(), count = k => base.filter(it => stockIs(it, k)).length;
    const active = ui.q || ui.loc || ui.fam || ui.series || ui.status || ui.brand || ui.pmin !== '' || ui.pmax !== '' || ui.stock;
    const statuses = data.statuses || [], brands = [...new Set(data.items.map(it => it.brand).filter(Boolean))].sort();
    return `<div class="wms-filters">
      <label class="wms-select">${icon('warehouse')}<select data-wms-loc aria-label="${tr('仓库', 'Warehouse')}"><option value="">${tr('全部仓库（各仓数量）', 'All warehouses (quantities)')}</option>${data.locations.map(l => `<option value="${esc(l.id)}" ${ui.loc === l.id ? 'selected' : ''}>${esc(word(l))} · ${tr('库位', 'bins')}</option>`).join('')}</select></label>
      <label class="wms-select">${icon('funnel')}<select data-wms-fam aria-label="${tr('产品族', 'Family')}"><option value="">${tr('全部产品族', 'All families')}</option>${fams.map(f => `<option value="${esc(f.key)}" ${ui.fam === f.key ? 'selected' : ''}>${esc(word(f))}（${data.items.filter(it => it.family === f.key).length}）</option>`).join('')}${noFam ? `<option value="-" ${ui.fam === '-' ? 'selected' : ''}>${tr('未设置产品族', 'No family')}（${noFam}）</option>` : ''}</select></label>
      <label class="wms-select"><select data-wms-series aria-label="${tr('产品线 / 系列', 'Series')}"><option value="">${tr('全部系列', 'All series')}</option>${series.map(x => `<option value="${esc(x)}" ${ui.series === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="wms-select"><select data-wms-flt="status" aria-label="${tr('状态', 'Status')}"><option value="">${tr('全部状态', 'All statuses')}</option>${statuses.map(x => `<option value="${esc(x.key)}" ${ui.status === x.key ? 'selected' : ''}>${esc(word(x))}（${data.items.filter(it => it.status === x.key).length}）</option>`).join('')}</select></label>
      <label class="wms-select"><select data-wms-flt="brand" aria-label="${tr('品牌', 'Brand')}"><option value="">${tr('全部品牌', 'All brands')}</option>${brands.map(x => `<option value="${esc(x)}" ${ui.brand === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="wms-select wms-price" title="${tr('按 MSRP 筛选', 'Filter by MSRP')}">$<input data-wms-pmin inputmode="decimal" value="${esc(ui.pmin)}" placeholder="${tr('最低', 'min')}" aria-label="${tr('最低 MSRP', 'Min MSRP')}">–<input data-wms-pmax inputmode="decimal" value="${esc(ui.pmax)}" placeholder="${tr('最高', 'max')}" aria-label="${tr('最高 MSRP', 'Max MSRP')}"></label>
      <div class="wms-seg">${STOCK.map(([k, zh, en]) => `<button class="${ui.stock === k ? 'on' : ''}" data-wms="stock" data-v="${k}">${tr(zh, en)}${k ? ` <b>${count(k)}</b>` : ''}</button>`).join('')}</div>
      ${active ? `<button class="wms-link" data-wms="clear">${icon('x-circle')} ${tr('清除筛选', 'Clear filters')}</button>` : ''}</div>`;
  }
  const sortTh = (key, label, cls = '') => `<th class="${cls} wms-sortable ${ui.sort === key ? 'sorted' : ''}" data-wms="sort" data-v="${key}">${label}${ui.sort === key ? icon(ui.dir > 0 ? 'caret-up' : 'caret-down') : ''}</th>`;
  /* All warehouses: one quantity column per warehouse. One warehouse: its shelf bins (preferred + two alternates) and quantity. */
  function stockTable(items) {
    const L = ui.loc ? loc(ui.loc) : null, ops = data.canOperate;
    const acts = it => `<td class="act">${L && ops ? `<button class="wms-link" data-wms="bins" data-sku="${esc(it.sku)}">${tr('库位', 'Bins')}</button>` : ''}<button class="wms-link" data-wms="history" data-sku="${esc(it.sku)}">${tr('流水', 'Log')}</button>${ops ? `<button class="wms-link" data-wms="op" data-type="out" data-sku="${esc(it.sku)}">${tr('出库', 'Out')}</button>` : ''}</td>`;
    const binCell = (it, i) => { const b = binsOf(it, ui.loc)[i], q = binQ(it, ui.loc)[i]; return `<td class="wms-bin ${i ? '' : 'first'}">${b ? `<span class="mono">${esc(b)}</span> <b class="${q ? '' : 'zero'}">${fmtN(q)}</b>` : '<span class="wms-dim">—</span>'}</td>`; };
    const head = L ? `${sortTh('sku', 'SKU')}${sortTh('name', tr('产品', 'Product'))}${sortTh('type', tr('产品族 / 系列', 'Family / series'))}${sortTh('msrp', 'MSRP', 'num')}${sortTh('bin', tr('首选库位 · 数量', 'Preferred bin · qty'))}<th>${tr('备选库位 1 · 数量', 'Alt bin 1 · qty')}</th><th>${tr('备选库位 2 · 数量', 'Alt bin 2 · qty')}</th><th class="num">${tr('未分库位', 'Unassigned')}</th>${sortTh(ui.loc, tr(`${word(L)}合计`, `${word(L)} total`), 'num')}<th></th>`
      : `${sortTh('sku', 'SKU')}${sortTh('name', tr('产品', 'Product'))}${sortTh('type', tr('产品族 / 系列', 'Family / series'))}${sortTh('msrp', 'MSRP', 'num')}${data.locations.map(l => sortTh(l.id, esc(word(l)), 'num')).join('')}${sortTh('total', tr('合计', 'Total'), 'num')}<th></th>`;
    const row = it => {
      const common = `${skuCell(it)}${prodCell(it)}${famCell(it)}<td class="num">${usd(it.msrp)}</td>`;
      if (L) { const q = n(it, ui.loc), un = unassigned(it, ui.loc); return `<tr>${common}${[0, 1, 2].map(i => binCell(it, i)).join('')}<td class="num ${un ? 'warn' : 'zero'}">${fmtN(un)}</td><td class="num strong ${q === 0 ? 'zero' : ''}">${fmtN(q)}</td>${acts(it)}</tr>`; }
      const max = Math.max(...data.locations.map(l => n(it, l.id)));
      return `<tr>${common}${data.locations.map(l => { const q = n(it, l.id); return `<td class="num ${q === 0 ? 'zero' : ''} ${l.id === 'us' && q === 0 ? 'out' : ''} ${q > 0 && q === max ? 'top' : ''}" ${q > 0 && q === max ? `title="${esc(tr('这个 SKU 库存最多的仓库', 'Warehouse holding most of this SKU'))}"` : ''}>${fmtN(q)}</td>`; }).join('')}<td class="num strong">${fmtN(total(it))}</td>${acts(it)}</tr>`;
    };
    const cols = L ? 10 : data.locations.length + 6;
    const tot = L ? data.items.reduce((s2, it) => s2 + n(it, ui.loc), 0) : 0, totUn = L ? data.items.reduce((s2, it) => s2 + unassigned(it, ui.loc), 0) : 0;
    const hint = L ? tr(`${word(L)}合计 <b>${fmtN(tot)}</b> 件${totUn ? `，其中 ${fmtN(totUn)} 件还没放进库位` : ''} · 每个 SKU 一个首选库位、两个备选库位，入库默认进首选库位，出库默认从首选库位开始扣${ops ? ' · 改库位、移库点每行的“库位”' : ''}`, `${word(L)} total <b>${fmtN(tot)}</b>${totUn ? `, ${fmtN(totUn)} not in a bin yet` : ''} · goods in go to the preferred bin, goods out start from it${ops ? ' · use “Bins” on a row to set bins or move stock' : ''}`)
      : tr('点击表头排序 · 蓝底数字 = 这个 SKU 库存最多的仓库 · 选择某个仓库可看库位', 'Click a header to sort · blue = where this SKU has the most stock · pick a warehouse to see its bins');
    return `${filterBar()}<p class="wms-count">${tr(`显示 ${items.length} / ${data.items.length} 个 SKU`, `${items.length} of ${data.items.length} SKUs`)} · ${L ? hint : esc(hint)}</p><div class="wms-table-wrap"><table class="wms-table"><thead><tr>${head}</tr></thead><tbody>
      ${items.slice(0, ui.limit).map(row).join('') || `<tr><td colspan="${cols}" class="wms-empty">${data.items.length ? tr('没有匹配的 SKU。', 'No matching SKU.') : tr('还没有 SKU。', 'No SKUs yet.')}</td></tr>`}
    </tbody></table></div>${items.length > ui.limit ? `<p class="wms-count">${tr(`为保持流畅只显示前 ${fmtN(ui.limit)} 行`, `Showing the first ${fmtN(ui.limit)} rows`)} <button class="wms-link" data-wms="more">${tr(`再显示 ${fmtN(Math.min(PAGE, items.length - ui.limit))} 行`, `Show ${fmtN(Math.min(PAGE, items.length - ui.limit))} more`)}</button><button class="wms-link" data-wms="all">${tr(`全部显示（${fmtN(items.length)}）`, `Show all (${fmtN(items.length)})`)}</button></p>` : ''}`;
  }
  function exportCsv() {
    const cell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
    const head = ['SKU', '中文名', 'English name', tr('产品族', 'Family'), tr('系列', 'Series'), 'MSRP', ...data.locations.map(l => l.zh), tr('合计', 'Total'), ...data.locations.flatMap(l => [`${l.zh} 首选库位`, `${l.zh} 备选库位1`, `${l.zh} 备选库位2`])];
    const rows = filtered().map(it => [it.sku, it.nameZh || it.name, it.nameEn, famName(it.family), it.series, it.msrp ?? '', ...data.locations.map(l => n(it, l.id)), total(it), ...data.locations.flatMap(l => binsOf(it, l.id))]);
    const csv = '﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); a.download = `wms-stock-${d}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function logTable(list) {
    const types = [['', tr('全部', 'All')], ...Object.entries(TYPES).map(([k, [zh, en]]) => [k, tr(zh, en)])];
    return `<div class="wms-filters"><div class="wms-seg">${types.map(([k, label]) => `<button class="${ui.type === k ? 'on' : ''}" data-wms="type" data-v="${k}">${esc(label)}</button>`).join('')}</div>
      ${ui.sku ? `<span class="wms-hint">${tr('只看', 'Only')} <b class="mono">${esc(ui.sku)}</b>${history.loading ? ` · ${tr('正在读取完整流水…', 'loading full history…')}` : history.list ? ` · ${tr(`完整流水 ${history.list.length} 条`, `full history, ${history.list.length}`)}` : ''} <button class="wms-link" data-wms="history" data-sku="">${tr('看全部', 'Show all')}</button></span>` : `<span class="wms-hint">${tr('显示最近 500 条；点库存表里的“流水”可看单个 SKU 的完整记录', 'Latest 500 shown; use “Log” on a stock row for one SKU’s full history')}</span>`}</div>
      <div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>${tr('操作日期', 'Date')}</th><th>${tr('类型', 'Type')}</th><th>${tr('操作方式', 'How')}</th><th>SKU</th><th>${tr('仓库', 'Warehouse')}</th><th class="num">${tr('数量', 'Qty')}</th><th>${tr('原因', 'Reason')}</th><th>${tr('单号', 'Reference')}</th><th>${tr('操作人', 'By')}</th><th>${tr('状态', 'Status')}</th></tr></thead><tbody>
      ${list.map(m => { const [zh, en, , cls] = TYPES[m.type] || [m.type, m.type, '', '']; const st = STATES[m.status] || STATES.done; return `<tr><td class="nowrap">${esc(m.opDate || '')}<small title="${tr('录入时间', 'Recorded at')}">${tr('录入', 'rec.')} ${when(m.createdAt)}</small></td><td><span class="wms-type ${cls}">${tr(zh, en)}</span></td><td class="nowrap">${esc(methodLabel(m))}${m.method === 'batch' || m.method === 'import' || m.method === 'dealer' && m.batchSkus > 1 ? `<small>${tr(`本批 ${m.batchSkus} 个 SKU · 共 ${fmtN(m.batchUnits)} 件`, `${m.batchSkus} SKUs · ${fmtN(m.batchUnits)} units in this batch`)}</small>` : ''}</td><td class="mono">${esc(m.sku)}</td><td>${esc(word(loc(m.location)))}${m.toLocation ? ` → ${esc(word(loc(m.toLocation)))}` : ''}</td><td class="num ${m.qty < 0 ? 'neg' : 'pos'}">${m.type === 'transfer' ? '' : m.qty > 0 ? '+' : ''}${fmtN(m.qty)}</td><td>${esc(m.reason)}</td><td class="mono">${esc(m.reference || '—')}</td><td>${esc(m.byName)}${m.approvedByName ? `<small>${tr('确认', 'confirmed')}：${esc(m.approvedByName)}</small>` : ''}</td><td><span class="wms-state ${st[2]}">${tr(st[0], st[1])}</span>${m.status === 'pending' && m.confirmers?.length ? `<small class="wms-who">${tr('可确认：', 'Can confirm: ')}${esc(m.confirmers.join(tr('、', ', ')))}</small>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="10" class="wms-empty">${tr('还没有流水', 'No movements yet')}</td></tr>`}
    </tbody></table></div>`;
  }

  /* Goods in / out / transfer / count: one date, warehouse, reason and order number, any number of SKUs (one order often has
     several products). A finder with filters adds SKUs; each line has its own quantity (or counted quantity for a count). */
  const op = { type:'in', lines:[], q:'', fam:'', series:'', status:'', brand:'', inStock:false };
  const REASONS = () => ({ in:[tr('采购到货', 'Purchase received'), tr('退货入库（未拆封，按新品上架）', 'Customer return (unopened, as new)'), tr('调拨到货', 'Transfer received'), tr('维修完成回库', 'Back from repair'), tr('盘盈', 'Count surplus'), tr('其他', 'Other')],
    out:[tr('销售发货', 'Sales shipment'), tr('经销商发货', 'Dealer shipment'), tr('样机 / 展会', 'Demo / trade show'), tr('赠送 / 样品', 'Gift / sample'), tr('售后换货', 'Warranty replacement'), tr('破损报废', 'Damaged / scrapped'), tr('其他', 'Other')], transfer:[tr('工厂发美国（海运）', 'Factory to US (sea)'), tr('工厂发美国（空运）', 'Factory to US (air)'), tr('到港入仓', 'Arrived at warehouse')], adjust:[tr('月底盘点', 'Month-end count'), tr('抽盘', 'Spot count'), tr('破损报废', 'Damaged / scrapped')] });
  function opForm(type) {
    const locOpts = (sel, name) => `<select name="${name}" required>${data.locations.map(l => `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc(word(l))}</option>`).join('')}</select>`;
    // Every goods-in / out / transfer / count can narrow the SKUs by family, series, status and brand (owner, 2026-11-12).
    const fams = data.families || [], uniq = k => [...new Set(data.items.map(it => it[k]).filter(Boolean))].sort();
    const sel = (attr, label, all, opts) => `<label class="wms-select"><select data-wms-${attr} aria-label="${label}"><option value="">${all}</option>${opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`;
    return `<form id="wms-op" data-type="${type}" class="wms-form">
      <div class="wms-op-head">
        <label class="field"><span>${tr('操作日期', 'Date')}</span><input name="opDate" type="date" required min="2000-01-01" max="${today()}" value="${today()}"></label>
        <label class="field"><span>${type === 'transfer' ? tr('从仓库', 'From') : tr('仓库', 'Warehouse')}</span>${locOpts(type === 'transfer' ? 'dg' : 'us', 'location')}</label>
        ${type === 'transfer' ? `<label class="field"><span>${tr('到仓库', 'To')}</span>${locOpts('transit', 'toLocation')}</label>` : ''}
      </div>
      <div class="wms-finder">
        <div class="wms-finder-bar"><label class="wms-search">${icon('magnifying-glass')}<input data-wms-fq placeholder="${tr('找 SKU：输入 SKU、中英文名或库位', 'Find a SKU: SKU, name or bin')}" autocomplete="off"></label>
          ${sel('ffam', tr('产品族', 'Family'), tr('全部产品族', 'All families'), fams.map(f => [f.key, word(f)]))}
          ${sel('fseries', tr('系列', 'Series'), tr('全部系列', 'All series'), uniq('series').map(x => [x, x]))}
          ${sel('fstatus', tr('状态', 'Status'), tr('全部状态', 'All statuses'), (data.statuses || []).map(x => [x.key, word(x)]))}
          ${sel('fbrand', tr('品牌', 'Brand'), tr('全部品牌', 'All brands'), uniq('brand').map(x => [x, x]))}
          <label class="wms-check"><input type="checkbox" data-wms-fstock ${type === 'in' ? '' : 'checked'}> ${tr('只看这个仓库有货的', 'In stock here only')}</label></div>
        <p class="wms-finder-tip">${icon('hand-pointing')} ${tr('双击一行或点“选择添加该 SKU”把它加进本单；可以选多个 SKU，在下方给每个 SKU 填数量。', 'Double-click a row or use “Add this SKU” to put it on this order; add as many as you need and fill in each quantity below.')}</p>
        <div class="wms-finder-list" data-wms-finder></div>
      </div>
      <div data-wms-lines></div>
      <div class="form-grid">
        <label class="field"><span>${tr('原因', 'Reason')}</span><input name="reason" required minlength="2" maxlength="200" list="wms-reasons" value="${esc(REASONS()[type][0])}"><datalist id="wms-reasons">${REASONS()[type].map(r => `<option value="${esc(r)}">`).join('')}</datalist>
          <span class="wms-reasons">${REASONS()[type].map((r, i) => `<button type="button" class="${i ? '' : 'on'}" data-wms-reason="${esc(r)}">${esc(r)}</button>`).join('')}</span></label>
        <label class="field"><span>${type === 'out' ? tr('订单号 / 单号（必填）', 'Order / reference no. (required)') : tr('单号（采购单、运单等，选填）', 'Reference (PO, waybill…, optional)')}</span><input name="reference" maxlength="80" ${type === 'out' ? 'required' : ''}></label>
      </div>
      ${type === 'adjust' ? `<p class="wms-note">${icon('seal-question')} ${tr('填每个 SKU 的实盘数量；和系统一样的会自动跳过。提交后需要你的直属主管确认，确认后才会改动库存。', 'Enter the counted quantity of each SKU; lines that match the system are skipped. Your manager confirms before stock changes.')}</p>` : ''}
      <p class="wms-error" role="alert"></p>
    </form>`;
  }
  function openOp(type, sku) {
    Object.assign(op, { type, lines:[], q:'', fam:'', series:'', status:'', brand:'', inStock:type !== 'in' });
    const it = sku && data.items.find(x => x.sku === sku); if (it) op.lines.push({ sku:it.sku, qty:'' });
    ctx.modal(tr(...TYPES[type].slice(0, 2)), opForm(type), `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="wms-op">${type === 'adjust' ? tr('提交确认', 'Submit for confirmation') : tr('保存', 'Save')}</button>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
    paintFinder(); paintLines();
  }
  const fld = (f, n) => f?.querySelector(`[name="${n}"]`);
  const opLoc = () => fld(document.getElementById('wms-op'), 'location')?.value || 'us';
  function paintFinder() {
    const box = document.querySelector('[data-wms-finder]'); if (!box) return;
    const q = op.q.trim().toLowerCase(), l = opLoc(), taken = new Set(op.lines.map(x => x.sku));
    const list = data.items.filter(it => (!op.fam || it.family === op.fam) && (!op.series || it.series === op.series) && (!op.status || it.status === op.status)
      && (!op.brand || it.brand === op.brand) && (!op.inStock || n(it, l) > 0)
      && (!q || [it.sku, it.nameZh, it.nameEn, it.name, it.series, ...binsOf(it, l)].some(x => String(x || '').toLowerCase().includes(q))));
    box.innerHTML = list.slice(0, 40).map(it => `<div class="wms-find-row ${taken.has(it.sku) ? 'taken' : ''}" data-wms-pick="${esc(it.sku)}" title="${tr('双击选择', 'Double-click to select')}">${thumb(it)}<span class="mono">${esc(it.sku)}</span><span class="nm">${esc(pname(it))}</span><span class="wms-tag">${esc(famName(it.family) || '—')}</span><span class="bin">${esc(binsOf(it, l)[0] || '')}</span><span class="num">${tr('现有', 'on hand')} ${fmtN(n(it, l))}</span>
      <button type="button" class="wms-add-btn" data-wms-add="${esc(it.sku)}" ${taken.has(it.sku) ? 'disabled' : ''}>${taken.has(it.sku) ? icon('check') + ' ' + tr('已选择', 'Selected') : icon('check-square') + ' ' + tr('选择添加该 SKU', 'Add this SKU')}</button></div>`).join('')
      + (list.length > 40 ? `<p class="wms-hint">${tr(`还有 ${list.length - 40} 个，请输入更多关键词或用产品族筛选`, `${list.length - 40} more; narrow the search`)}</p>` : '')
      || `<p class="wms-hint">${tr('没有符合的 SKU', 'No matching SKU')}${op.inStock ? tr('（已勾选“只看这个仓库有货的”）', ' (in-stock only is on)') : ''}</p>`;
  }
  function paintLines() {
    const box = document.querySelector('[data-wms-lines]'); if (!box) return;
    const l = opLoc(), adj = op.type === 'adjust';
    box.innerHTML = op.lines.length ? `<div class="wms-batch-table"><table class="wms-table"><thead><tr><th>SKU</th><th>${tr('产品', 'Product')}</th><th>${tr('首选库位', 'Bin')}</th><th class="num">${tr('现有', 'On hand')}</th>${adj ? '' : `<th>${op.type === 'in' ? tr('放入库位', 'Into bin') : tr('从库位', 'From bin')}</th>`}<th class="num">${adj ? tr('实盘数量', 'Counted') : tr('数量', 'Qty')}</th>${adj ? `<th class="num">${tr('差异', 'Difference')}</th>` : ''}<th></th></tr></thead><tbody>
      ${op.lines.map((x, i) => { const it = data.items.find(y => y.sku === x.sku) || {}; const have = n(it, l), v = x.qty === '' ? null : Number(x.qty), short = !adj && op.type !== 'in' && v > have;
        return `<tr><td class="wms-skucell">${thumb(it)}<span class="mono">${esc(x.sku)}</span></td><td>${esc(pname(it))}</td><td>${esc(binsOf(it, l)[0] || '—')}</td><td class="num">${fmtN(have)}</td>${adj ? '' : (() => { const bs = binsOf(it, l), qs = binQ(it, l), any = bs.some(Boolean);
            return `<td>${any ? `<select class="wms-slot" data-wms-line-slot="${i}" aria-label="${tr('库位', 'Bin')}"><option value="">${op.type === 'in' ? tr('首选库位', 'Preferred') : tr('自动（先首选）', 'Auto (preferred first)')}</option>${bs.map((c, k) => c ? `<option value="${k + 1}" ${x.slot === k + 1 ? 'selected' : ''}>${esc(c)}${op.type === 'in' ? '' : ` · ${fmtN(qs[k])}`}</option>` : '').join('')}</select>` : '<span class="wms-dim">—</span>'}</td>`; })()}
          <td class="num"><input class="wms-qty ${short ? 'bad' : ''}" data-wms-line="${i}" type="number" min="${adj ? 0 : 1}" step="1" required value="${esc(x.qty)}" aria-label="${esc(x.sku)} ${adj ? tr('实盘数量', 'counted') : tr('数量', 'quantity')}"></td>
          ${adj ? `<td class="num ${v == null ? '' : v - have < 0 ? 'neg' : v - have > 0 ? 'pos' : ''}" data-wms-diff="${i}">${v == null ? '' : (v - have > 0 ? '+' : '') + fmtN(v - have)}</td>` : ''}
          <td><button type="button" class="wms-link" data-wms-rm="${i}" aria-label="${tr('移除', 'Remove')}">${icon('x')}</button></td></tr>`; }).join('')}</tbody></table></div>
      <p class="wms-hint" data-wms-total>${tr(`共 ${op.lines.length} 个 SKU`, `${op.lines.length} SKUs`)}${adj ? '' : tr(`，${fmtN(op.lines.reduce((s2, x) => s2 + (Number(x.qty) || 0), 0))} 件`, `, ${fmtN(op.lines.reduce((s2, x) => s2 + (Number(x.qty) || 0), 0))} units`)}</p>`
      : `<p class="wms-hint wms-lines-empty">${icon('arrow-up')} ${tr('从上面的列表选择 SKU，一单可以选多个 SKU，每个填自己的数量。', 'Add SKUs from the list above; one order can hold several SKUs, each with its own quantity.')}</p>`;
  }
  /* Bins of one SKU in one warehouse: set the bin codes (preferred + two alternates) and move stock between bins. */
  /* 库位管理 (owner, 2026-11-12): add, rename and delete shelf bins per warehouse, like the goods-out dialog. */
  const bm = { loc:'us', q:'', list:null, edit:null, err:'' };
  async function binMgrLoad() { try { bm.list = (await ctx.api.get('/wms/bin-codes')).codes; bm.err = ''; } catch (x) { bm.err = x.message || tr('读取失败', 'Could not load'); } paintBinMgr(); }
  function binMgrDialog() {
    bm.q = ''; bm.edit = null; bm.loc = ui.loc || 'us';
    ctx.modal(tr('库位管理', 'Bins'), `<div class="wms-form" id="wms-binmgr">
      <div class="wms-op-head"><label class="field"><span>${tr('仓库', 'Warehouse')}</span><select data-bm-loc>${data.locations.filter(l => l.id !== 'transit').map(l => `<option value="${esc(l.id)}" ${l.id === bm.loc ? 'selected' : ''}>${esc(word(l))}</option>`).join('')}</select></label></div>
      <form id="wms-bm-add" class="wms-bm-add"><label class="field"><span>${tr('新增库位（可一次填多个，用逗号或换行分开）', 'New bins (several at once: comma or new line)')}</span><textarea name="codes" rows="2" placeholder="A-01-01, A-01-02"></textarea></label>
        <label class="field"><span>${tr('备注（选填）', 'Note (optional)')}</span><input name="note" maxlength="120" placeholder="${tr('如：一楼 A 排货架', 'e.g. ground floor, row A')}"></label>
        <button class="btn primary" type="submit">${icon('plus')} ${tr('新增库位', 'Add bins')}</button></form>
      <div class="wms-finder"><div class="wms-finder-bar"><label class="wms-search">${icon('magnifying-glass')}<input data-bm-q placeholder="${tr('找库位：编码、备注或 SKU', 'Find a bin: code, note or SKU')}" autocomplete="off"></label></div>
        <p class="wms-finder-tip">${icon('info')} ${tr('改库位编码时，放在这个库位的 SKU 会一起改过去；库位里还有货就不能删除，请先在 SKU 的“库位”里移库。', 'Renaming a bin renames it for every SKU in it; a bin that still holds stock cannot be deleted — move the stock first from the SKU’s Bins.')}</p>
        <div data-bm-list><p class="wms-hint">${tr('正在读取…', 'Loading…')}</p></div></div>
      <p class="wms-error" role="alert" data-bm-err></p></div>`, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`);
    binMgrLoad();
  }
  function paintBinMgr() {
    const box = document.querySelector('[data-bm-list]'); if (!box) return;
    const e = document.querySelector('[data-bm-err]'); if (e) e.textContent = bm.err;
    if (!bm.list) return;
    const q = bm.q.trim().toLowerCase(), rows = bm.list.filter(c => c.location === bm.loc && (!q || [c.code, c.note, ...c.skus.map(x => x.sku)].some(v => String(v || '').toLowerCase().includes(q))));
    box.innerHTML = rows.length ? `<table class="wms-table wms-bm-table"><thead><tr><th>${tr('库位', 'Bin')}</th><th>${tr('备注', 'Note')}</th><th>${tr('放了哪些 SKU', 'SKUs in it')}</th><th class="num">${tr('件数', 'Units')}</th><th></th></tr></thead><tbody>${rows.map(c => bm.edit === c.code
      ? `<tr class="editing"><td><input data-bm-code value="${esc(c.code)}" maxlength="40"></td><td><input data-bm-note value="${esc(c.note)}" maxlength="120"></td><td>${c.skus.map(x => `<span class="mono">${esc(x.sku)}</span> × ${fmtN(x.qty)}`).join('<br>') || '—'}</td><td class="num">${fmtN(c.qty)}</td>
          <td class="act"><button type="button" class="wms-add-btn" data-wms="bm-save" data-code="${esc(c.code)}">${tr('保存', 'Save')}</button><button type="button" class="wms-link" data-wms="bm-cancel">${tr('取消', 'Cancel')}</button></td></tr>`
      : `<tr><td class="mono"><b>${esc(c.code)}</b></td><td>${esc(c.note || '')}</td><td>${c.skus.map(x => `<span class="mono">${esc(x.sku)}</span> × ${fmtN(x.qty)}`).join('<br>') || `<span class="wms-hint">${tr('空库位', 'Empty')}</span>`}</td><td class="num">${fmtN(c.qty)}</td>
          <td class="act"><button type="button" class="wms-link" data-wms="bm-edit" data-code="${esc(c.code)}">${tr('修改', 'Edit')}</button><button type="button" class="wms-link danger" data-wms="bm-del" data-code="${esc(c.code)}" ${c.qty > 0 ? `disabled title="${tr('库位里还有货，先移库', 'Holds stock; move it first')}"` : ''}>${tr('删除', 'Delete')}</button></td></tr>`).join('')}</tbody></table>`
      : `<p class="wms-hint">${q ? tr('没有符合的库位', 'No matching bin') : tr('这个仓库还没有库位，在上面新增。', 'No bins in this warehouse yet; add some above.')}</p>`;
  }
  async function binMgrRename(code) {
    const to = document.querySelector('[data-bm-code]')?.value.trim(), note = document.querySelector('[data-bm-note]')?.value.trim() ?? '';
    try { await ctx.api.post('/wms/bin-codes/rename', { location:bm.loc, code, to, note }); bm.edit = null; ctx.toast?.(tr('库位已保存', 'Bin saved')); data = await ctx.api.get('/wms/summary'); ctx.rerender(); binMgrLoad(); }
    catch (x) { bm.err = x.message || tr('保存失败', 'Could not save'); paintBinMgr(); }
  }
  async function binMgrDelete(code) {
    if (!window.confirm(tr(`删除库位 ${code}？`, `Delete bin ${code}?`))) return;
    try { await ctx.api.post('/wms/bin-codes/delete', { location:bm.loc, code }); ctx.toast?.(tr('库位已删除', 'Bin deleted')); data = await ctx.api.get('/wms/summary'); ctx.rerender(); binMgrLoad(); }
    catch (x) { bm.err = x.message || tr('删除失败', 'Could not delete'); paintBinMgr(); }
  }
  document.addEventListener('input', e => { if (e.target.matches?.('[data-bm-q]')) { bm.q = e.target.value; paintBinMgr(); } });
  document.addEventListener('change', e => { if (e.target.matches?.('[data-bm-loc]')) { bm.loc = e.target.value; bm.edit = null; paintBinMgr(); } });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'wms-bm-add' || !ctx) return; e.preventDefault();
    const f = e.target, codes = String(fld(f, 'codes').value || '').split(/[,，\n]+/).map(x => x.trim()).filter(Boolean);
    if (!codes.length) { bm.err = tr('请填库位编码', 'Enter at least one bin code'); return paintBinMgr(); }
    try { const r = await ctx.api.post('/wms/bin-codes', { location:bm.loc, codes, note:fld(f, 'note').value.trim() });
      ctx.toast?.(tr(`新增 ${r.added.length} 个库位${r.existing.length ? `（${r.existing.join('、')} 已存在）` : ''}`, `${r.added.length} bins added${r.existing.length ? ` (${r.existing.join(', ')} already there)` : ''}`));
      fld(f, 'codes').value = ''; binMgrLoad(); }
    catch (x) { bm.err = x.message || tr('保存失败', 'Could not save'); paintBinMgr(); }
  });
  /* 到港入仓 (owner, 2026-11-12): shipments supply chain marked at port. Each line is ticked after checking the quantity
     actually received and the bin; the goods then move from In transit into the US LA warehouse. */
  let arrivals = null, arrCur = null;
  const loadArrivals = async () => { try { arrivals = await ctx.api.get('/wms/arrivals'); } catch { arrivals = { arrivals:[], canReceive:false }; } };
  async function arrivalDialog() {
    await loadArrivals();
    const list = arrivals.arrivals || [];
    if (!arrCur || !list.some(x => x.id === arrCur)) arrCur = list[0]?.id || null;
    const a = list.find(x => x.id === arrCur);
    const slotOpts = l => [`<option value="">${tr('未分库位', 'Unassigned')}</option>`, ...l.bins.map((c, i) => c ? `<option value="${i + 1}" ${i === 0 ? 'selected' : ''}>${esc(c)}${i ? tr(`（备选 ${i}）`, ` (alt ${i})`) : tr('（首选）', ' (preferred)')}</option>` : '')].join('');
    ctx.modal(tr('到港入仓', 'Arrivals'), `<form id="wms-arrival" class="wms-form">
      ${list.length ? `<div class="wms-op-head"><label class="field"><span>${tr('到港货柜', 'Shipment')}</span><select data-arr-pick>${list.map(x => `<option value="${esc(x.id)}" ${x.id === arrCur ? 'selected' : ''}>${esc(x.number)} · ${tr(`${x.lines.length} 个 SKU`, `${x.lines.length} SKUs`)}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('入库日期', 'Date')}</span><input name="opDate" type="date" required min="2000-01-01" max="${today()}" value="${today()}"></label></div>
        <p class="wms-finder-tip">${icon('info')} ${esc([a.carrier, a.eta && tr(`预计到港 ${a.eta}`, `ETA ${a.eta}`), a.notifiedOn && tr(`${a.notifiedBy || '供应链'} ${a.notifiedOn} 通知到港`, `notified by ${a.notifiedBy || 'supply chain'} on ${a.notifiedOn}`)].filter(Boolean).join(' · '))}
          · ${tr('逐行点数，填实收数量、选库位，再勾选确认；全部勾选后才能入库。少收的数量留在“在途”。', 'Count each line, fill in what arrived and the bin, then tick it; all lines must be ticked. Anything short stays in transit.')}</p>
        <div class="wms-finder"><table class="wms-table wms-arr-table"><thead><tr><th><button type="button" class="wms-link" data-wms="arr-all">${tr('全选', 'All')}</button></th><th>SKU</th><th>${tr('产品', 'Product')}</th><th class="num">${tr('发货数量', 'Shipped')}</th><th class="num">${tr('实收数量', 'Received')}</th><th>${tr('库位', 'Bin')}</th></tr></thead><tbody>
          ${a.lines.map((l, i) => `<tr data-arr-row="${i}"><td><input type="checkbox" data-arr-ok aria-label="${tr('确认', 'Confirm')} ${esc(l.sku)}"></td><td class="mono">${esc(l.sku)}</td><td>${esc((lang() === 'en' ? l.nameEn || l.nameZh : l.nameZh || l.nameEn) || '')}</td>
            <td class="num">${fmtN(l.qty)}</td><td class="num"><input class="wms-qty" data-arr-qty="${esc(l.sku)}" type="number" min="0" max="${l.qty}" value="${l.qty}" inputmode="numeric"></td><td><select data-arr-slot>${slotOpts(l)}</select></td></tr>`).join('')}
        </tbody></table></div>
        <p class="wms-hint" data-arr-state></p>`
      : `<p class="wms-note">${icon('info')} ${tr('现在没有到港通知。供应链在 SCM 的在途货柜点“到港通知”后，货柜会出现在这里。', 'No arrival notices now. When supply chain sends one from SCM, the shipment shows up here.')}</p>`}
      <p class="wms-hint"><button type="button" class="wms-link" data-wms="batch">${icon('clipboard-text')} ${tr('没有到港通知的货：手动入库（粘贴 Excel）', 'Goods without a notice: manual goods in (paste from Excel)')}</button></p>
      <p class="wms-error" role="alert"></p></form>`,
      `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button>${a && arrivals.canReceive ? `<button class="btn primary" type="submit" form="wms-arrival" data-arr-go disabled>${tr('确认入库', 'Receive')}</button>` : ''}`);
    paintArrivalState();
  }
  function paintArrivalState() {
    const box = document.getElementById('wms-arrival'); if (!box) return;
    const rows = [...box.querySelectorAll('[data-arr-row]')], ok = rows.filter(r => r.querySelector('[data-arr-ok]').checked).length;
    const short = rows.reduce((t, r) => { const q = r.querySelector('[data-arr-qty]'); return t + Math.max(0, Number(q.max) - Number(q.value || 0)); }, 0);
    rows.forEach(r => r.classList.toggle('ok', r.querySelector('[data-arr-ok]').checked));
    const st = box.querySelector('[data-arr-state]'); if (st) st.textContent = tr(`已确认 ${ok} / ${rows.length} 行${short ? ` · 少收 ${fmtN(short)} 件（留在在途）` : ''}`, `${ok} / ${rows.length} lines confirmed${short ? ` · ${fmtN(short)} short (stay in transit)` : ''}`);
    const go = document.querySelector('[data-arr-go]'); if (go) go.disabled = !rows.length || ok < rows.length;
  }
  document.addEventListener('change', e => {
    if (e.target.matches?.('[data-arr-pick]')) { arrCur = e.target.value; return arrivalDialog(); }
    if (e.target.closest?.('#wms-arrival')) paintArrivalState();
  });
  document.addEventListener('input', e => { if (e.target.matches?.('[data-arr-qty]')) paintArrivalState(); });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'wms-arrival' || !ctx) return; e.preventDefault();
    const f = e.target, err = f.querySelector('.wms-error'), go = document.querySelector('[data-arr-go]');
    const lines = [...f.querySelectorAll('[data-arr-row]')].map(r => { const q = r.querySelector('[data-arr-qty]'), slot = r.querySelector('[data-arr-slot]').value; return { sku:q.dataset.arrQty, received:Number(q.value || 0), ...(slot ? { slot:Number(slot) } : {}) }; });
    if (go) go.disabled = true;
    try { const r = await ctx.api.post(`/wms/arrivals/${encodeURIComponent(arrCur)}/receive`, { opDate:fld(f, 'opDate').value, lines });
      ctx.closeOverlay(); ctx.toast?.(tr(`已入库 ${fmtN(r.units)} 件${r.short.length ? `，少收 ${r.short.map(x => `${x.sku} ${x.short}`).join('、')}（留在在途）` : ''}`, `${fmtN(r.units)} units received${r.short.length ? `; short: ${r.short.map(x => `${x.sku} ${x.short}`).join(', ')} (still in transit)` : ''}`));
      arrCur = null; data = null; load(); }
    catch (x) { err.textContent = x.message || tr('入库失败', 'Could not receive'); if (go) go.disabled = false; }
  });
  let binSku = null;
  function binsDialog(sku) {
    if (!bm.list) ctx.api.get('/wms/bin-codes').then(r => { bm.list = r.codes; const dl = document.getElementById('wms-bincodes'); if (dl) dl.innerHTML = bm.list.filter(c => c.location === ui.loc).map(c => `<option value="${esc(c.code)}">`).join(''); }).catch(() => {});
    binSku = sku; const it = data.items.find(x => x.sku === sku), l = ui.loc, b = binsOf(it, l), q = binQ(it, l), un = unassigned(it, l);
    const slotOpt = (v, label) => `<option value="${v}">${esc(label)}</option>`;
    const places = [[0, tr(`未分库位（${fmtN(un)} 件）`, `Unassigned (${fmtN(un)})`)], ...b.map((c, i) => c ? [i + 1, `${c}（${fmtN(q[i])} 件）`] : null).filter(Boolean)];
    ctx.modal(tr(`库位 · ${sku}`, `Bins · ${sku}`), `<div class="wms-form">
      <p class="wms-hint">${esc(word(loc(l)))} · ${tr(`合计 ${fmtN(n(it, l))} 件`, `${fmtN(n(it, l))} in total`)} · ${tr('可以从“库位管理”的列表里选', 'pick from the list in Bins')}</p>
      <datalist id="wms-bincodes">${(bm.list || []).filter(c => c.location === l).map(c => `<option value="${esc(c.code)}">`).join('')}</datalist>
      <form id="wms-bins" class="form-grid">${[0, 1, 2].map(i => `<label class="field"><span>${i ? tr(`备选库位 ${i}`, `Alternate bin ${i}`) : tr('首选库位', 'Preferred bin')}${b[i] ? ` · ${fmtN(q[i])} ${tr('件', '')}` : ''}</span><input name="b${i}" maxlength="40" list="wms-bincodes" value="${esc(b[i])}" placeholder="${i ? '' : 'A-01-01'}"></label>`).join('')}
        <div class="field full"><small class="wms-hint">${tr('改名时数量跟着库位走；清空一个库位，它的数量回到“未分库位”。', 'Renaming keeps the quantity; clearing a bin returns its quantity to unassigned.')}</small><button class="btn" type="submit">${tr('保存库位', 'Save bins')}</button></div></form>
      ${places.length > 1 ? `<form id="wms-binmove" class="form-grid"><h3 class="full" style="margin:6px 0 0;font-size:14px">${tr('移库', 'Move stock')}</h3>
        <label class="field"><span>${tr('从', 'From')}</span><select name="from">${places.map(([v, lab]) => slotOpt(v, lab)).join('')}</select></label>
        <label class="field"><span>${tr('到', 'To')}</span><select name="to">${places.map(([v, lab]) => slotOpt(v, lab)).join('')}</select></label>
        <label class="field"><span>${tr('数量', 'Quantity')}</span><input name="qty" type="number" min="1" step="1" required></label>
        <div class="field"><span>&nbsp;</span><button class="btn primary" type="submit">${tr('移库', 'Move')}</button></div></form>` : `<p class="wms-hint">${tr('先保存至少一个库位，才能把货放进库位。', 'Save at least one bin first to put stock into it.')}</p>`}
      <p class="wms-error" role="alert"></p></div>`, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`);
  }
  /* Batch goods in: paste two columns (SKU, quantity) straight from Excel; one location, reason and reference for all lines. */
  let batchLines = [];
  function parseBatch(text) {
    const lines = [], problems = [], bySku = new Map(data.items.map(it => [it.sku.toLowerCase(), it]));
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim(); if (!line) return;
      const parts = line.split(/[\t,，]+|\s{2,}|\s+(?=\S+$)/).map(x => x.trim()).filter(Boolean);
      if (parts.length < 2) { problems.push(tr(`第 ${i + 1} 行：需要“SKU 数量”两列`, `Line ${i + 1}: needs SKU and quantity`)); return; }
      if (/^sku$/i.test(parts[0])) return;
      const qty = Number(String(parts.at(-1)).replace(/[,\s]/g, '')), sku = parts.slice(0, -1).join(' ').trim(), it = bySku.get(sku.toLowerCase());
      if (!Number.isInteger(qty) || qty <= 0) { problems.push(tr(`第 ${i + 1} 行：${sku} 的数量“${parts.at(-1)}”不是正整数`, `Line ${i + 1}: ${sku} quantity is not a positive whole number`)); return; }
      if (!it) { problems.push(tr(`第 ${i + 1} 行：产品资料和库存里都没有 SKU ${sku}，请检查拼写或先在产品资料里添加`, `Line ${i + 1}: SKU ${sku} is not in the product library or inventory; check the spelling or add it to the product library`)); return; }
      lines.push({ sku:it.sku, name:it.name, qty, line:i + 1 });
    });
    return { lines, problems };
  }
  function batchDialog() {
    batchLines = [];
    const locOpts = (sel, name) => `<select name="${name}">${data.locations.map(l => `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc(word(l))}</option>`).join('')}</select>`;
    ctx.modal(tr('手动入库（粘贴）', 'Manual goods in (paste)'), `<form id="wms-batch" class="wms-form">
      <div class="wms-seg wms-batch-mode"><label><input type="radio" name="mode" value="in" checked> ${tr('新货入库（加到库位）', 'New goods (add to a location)')}</label><label><input type="radio" name="mode" value="transfer"> ${tr('到港入仓（从在途转入）', 'Arrived (move from in transit)')}</label></div>
      <label class="field"><span>${tr('操作日期', 'Date')}</span><input name="opDate" type="date" required min="2000-01-01" max="${today()}" value="${today()}"></label>
      <div class="form-grid"><label class="field" data-wms-batch-from hidden><span>${tr('从库位', 'From')}</span>${locOpts('transit', 'location')}</label><label class="field"><span>${tr('入到库位', 'Into location')}</span>${locOpts('us', 'toLocation')}</label></div>
      <label class="field"><span>${tr('SKU 和数量（每行一个，可以从 Excel 直接复制两列粘贴）', 'SKU and quantity (one per line; paste two columns from Excel)')}</span><textarea name="lines" rows="8" required data-wms-batch-lines placeholder="${tr('例如：ODL-XRF-38-US01 20（一行一个）', 'e.g. SKU-001 20 (one per line)')}"></textarea></label>
      <div data-wms-batch-preview></div>
      <div class="form-grid"><label class="field"><span>${tr('原因', 'Reason')}</span><input name="reason" required minlength="2" maxlength="200" list="wms-batch-reasons" value="${tr('采购到货', 'Purchase received')}"><datalist id="wms-batch-reasons"><option value="${tr('采购到货', 'Purchase received')}"><option value="${tr('到港入仓', 'Arrived at warehouse')}"><option value="${tr('退货入库', 'Customer return')}"></datalist></label>
      <label class="field"><span>${tr('单号（柜号、采购单等，选填）', 'Reference (container, PO…, optional)')}</span><input name="reference" maxlength="80"></label></div>
      <p class="wms-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="wms-batch">${tr('确认入库', 'Confirm')}</button>`);
  }
  function batchPreview(f) {
    const r = parseBatch(f.lines.value), slot = f.querySelector('[data-wms-batch-preview]'), err = f.querySelector('.wms-error');
    batchLines = r.problems.length ? [] : r.lines; err.innerHTML = r.problems.slice(0, 6).map(esc).join('<br>') + (r.problems.length > 6 ? `<br>${tr(`…另有 ${r.problems.length - 6} 处`, `…and ${r.problems.length - 6} more`)}` : '');
    const mode = f.mode.value, to = f.toLocation.value, from = f.location.value;
    slot.innerHTML = r.lines.length ? `<div class="wms-batch-table"><table class="wms-table"><thead><tr><th>SKU</th><th>${tr('产品', 'Product')}</th><th class="num">${tr('数量', 'Qty')}</th><th class="num">${tr('入库后', 'After')}</th></tr></thead><tbody>${r.lines.map(l => { const it = data.items.find(x => x.sku === l.sku), after = Number(it.qty?.[to] || 0) + l.qty, short = mode === 'transfer' && l.qty > Number(it.qty?.[from] || 0); return `<tr class="${short ? 'wms-short' : ''}"><td class="mono">${esc(l.sku)}</td><td>${esc(l.name)}</td><td class="num pos">+${fmtN(l.qty)}</td><td class="num">${fmtN(after)}${short ? `<small>${tr(`${word(loc(from))}只有 ${fmtN(it.qty?.[from] || 0)}`, `only ${fmtN(it.qty?.[from] || 0)} at source`)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div><p class="wms-hint">${tr(`共 ${r.lines.length} 行，${fmtN(r.lines.reduce((s, l) => s + l.qty, 0))} 件`, `${r.lines.length} lines, ${fmtN(r.lines.reduce((s, l) => s + l.qty, 0))} units`)}</p>` : '';
  }

  /* New SKU (warehouse managers). */
  function newSkuDialog() {
    ctx.modal(tr('新增 SKU', 'New SKU'), `<form id="wms-sku" class="wms-form">
      <label class="field"><span>SKU</span><input name="sku" required maxlength="80" autocomplete="off" placeholder="ABC-123-US01"></label>
      <label class="field"><span>${tr('产品名称', 'Product name')}</span><input name="name" required maxlength="200"></label>
      <label class="field"><span>${tr('类型', 'Type')}</span><input name="type" maxlength="60" list="wms-kinds"><datalist id="wms-kinds">${[...new Set(data.items.map(it => it.type).filter(Boolean))].map(k => `<option value="${esc(k)}">`).join('')}</datalist></label>
      <p class="wms-hint">${tr('新增后数量为 0，再用“入库”把货加进来。', 'A new SKU starts at 0; use Goods in to add stock.')}</p>
      <p class="wms-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="wms-sku">${tr('保存', 'Save')}</button>`);
  }

  /* Opening stock import (administrators): CSV with SKU, name, type and one column per location. */
  const HEADERS = { sku:['sku', 'SKU'], name:['产品名称', '名称', '产品', 'name', 'product'], type:['类型', 'type'], us:['美国LA仓', '美国仓', '美国', 'us', 'us la warehouse', 'us warehouse'], dg:['东莞工厂仓', '东莞', 'dg', 'dongguan'], jn:['济南工厂仓', '济南', '山东', 'jn', 'jinan'], transit:['在途运输中', '在途', 'transit', 'in transit'] };
  let importRows = null;
  function parseCsv(text) {
    const out = []; let row = [], cell = '', q = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); out.push(row); }
    return out.filter(r => r.some(x => String(x).trim() !== ''));
  }
  function readRows(text) {
    const grid = parseCsv(text); if (grid.length < 2) throw new Error(tr('文件里没有数据行。', 'The file has no data rows.'));
    const head = grid[0].map(h => String(h).trim().toLowerCase()), col = {};
    for (const [k, names] of Object.entries(HEADERS)) { const i = head.findIndex(h => names.some(n => n.toLowerCase() === h)); if (i >= 0) col[k] = i; }
    if (col.sku === undefined) throw new Error(tr('找不到“SKU”这一列，请用模板的表头。', 'No “SKU” column found; use the template headers.'));
    const locs = data.locations.map(l => l.id).filter(id => col[id] !== undefined);
    if (!locs.length) throw new Error(tr('找不到任何库位列（美国LA仓 / 东莞工厂仓 / 济南工厂仓 / 在途运输中）。', 'No location columns found (US LA warehouse / Dongguan / Jinan / In transit).'));
    const rows = [], seen = new Set(), problems = [];
    grid.slice(1).forEach((r, n) => {
      const sku = String(r[col.sku] || '').trim(); if (!sku) return;
      if (seen.has(sku.toLowerCase())) { problems.push(tr(`第 ${n + 2} 行：SKU ${sku} 重复`, `Row ${n + 2}: duplicate SKU ${sku}`)); return; }
      seen.add(sku.toLowerCase());
      const qty = {};
      for (const id of locs) { const raw = String(r[col[id]] ?? '').replace(/[,\s]/g, ''); const v = raw === '' ? 0 : Number(raw); if (!Number.isInteger(v) || v < 0) problems.push(tr(`第 ${n + 2} 行：${sku} 的数量“${raw}”不是非负整数`, `Row ${n + 2}: ${sku} quantity “${raw}” is not a whole number ≥ 0`)); else qty[id] = v; }
      rows.push({ sku, name:col.name !== undefined ? String(r[col.name] || '').trim() : undefined, type:col.type !== undefined ? String(r[col.type] || '').trim() : undefined, qty });
    });
    return { rows, locs, problems };
  }
  function importDialog() {
    importRows = null;
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    ctx.modal(tr('导入期初库存', 'Import opening stock'), `<form id="wms-import" class="wms-form">
      <p class="wms-hint">${tr('把库存表在 Excel 里“另存为 CSV（UTF-8）”后上传。表头需要包含：SKU、产品名称、类型、美国LA仓、东莞工厂仓、济南工厂仓、在途运输中（没有的库位列可以不放）。退货品（REF- 开头）在“退货维修”里管理，不要放进这张表。', 'In Excel, save the stock sheet as “CSV UTF-8” and upload it. Headers: SKU, 产品名称, 类型, 美国LA仓, 东莞工厂仓, 济南工厂仓, 在途运输中 (location columns you do not have can be left out). Returned goods (REF-…) are handled in Returns & repairs, not in this sheet.')} <button type="button" class="wms-link" data-wms="template">${icon('download-simple')} ${tr('下载模板', 'Download template')}</button></p>
      <label class="field"><span>${tr('库存截至日期', 'Stock as of')}</span><input name="asOf" type="date" required value="${today}"></label>
      <label class="field"><span>${tr('库存表（CSV）', 'Stock sheet (CSV)')}</span><input name="file" type="file" accept=".csv,text/csv" required data-wms-file></label>
      <div data-wms-import-preview></div>
      <p class="wms-note">${icon('warning')} ${tr('导入会把表里每个 SKU 在每个库位的数量设成表里的数字，差额会作为“期初导入”写进流水。表里没有的 SKU 不受影响。', 'Import sets each listed SKU’s quantity at each listed location to the number in the file; the difference is logged as “opening import”. SKUs not in the file are unchanged.')}</p>
      <p class="wms-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="wms-import">${tr('确认导入', 'Import')}</button>`);
  }
  function downloadTemplate() {
    const csv = '\uFEFFSKU,产品名称,类型,美国LA仓,东莞工厂仓,济南工厂仓,在途运输中\nEXAMPLE-SKU-01,示例产品,整机,0,0,0,0\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); a.download = 'wms-opening-stock-template.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function act(fn, ok) {
    try { await fn(); ctx.toast?.(ok); data = null; await load(); return true; }
    catch (e) { ctx.toast?.(e.message || tr('操作失败', 'Failed')); return false; }
  }

  // Double-click a row in the SKU finder adds it, like its Add button.
  const addLine = sku => { if (!op.lines.some(x => x.sku === sku)) op.lines.push({ sku, qty:'' }); paintFinder(); paintLines(); document.querySelector(`[data-wms-line="${op.lines.findIndex(x => x.sku === sku)}"]`)?.focus(); };
  document.addEventListener('dblclick', e => { const row = e.target.closest?.('[data-wms-pick]'); if (!row || !ctx || e.target.closest('button')) return; e.preventDefault(); addLine(row.dataset.wmsPick); });
  document.addEventListener('click', async e => {
    const add = e.target.closest?.('[data-wms-add]'), rm = e.target.closest?.('[data-wms-rm]');
    if (add && ctx) { e.preventDefault(); addLine(add.dataset.wmsAdd); return; }
    const why = e.target.closest?.('[data-wms-reason]');
    if (why && ctx) { e.preventDefault(); const f = why.closest('form'), r = f?.querySelector('[name="reason"]'); if (!r) return;
      // 其他 clears the field for free text; any other chip fills it in.
      r.value = why.dataset.wmsReason === tr('其他', 'Other') ? '' : why.dataset.wmsReason; r.focus();
      why.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === why)); return; }
    if (rm && ctx) { e.preventDefault(); op.lines.splice(Number(rm.dataset.wmsRm), 1); paintFinder(); paintLines(); return; }
    const b = e.target.closest?.('[data-wms]'); if (!b || !ctx) return;
    e.preventDefault();
    const a = b.dataset.wms;
    if (a === 'tab') { ui.tab = b.dataset.v; return ctx.rerender(); }
    if (a === 'loc') { ui.loc = ui.loc === b.dataset.v ? '' : b.dataset.v; ui.tab = 'stock'; ui.limit = PAGE; return ctx.rerender(); }
    if (a === 'stock') { ui.stock = b.dataset.v; ui.tab = 'stock'; ui.limit = PAGE; return ctx.rerender(); }
    if (a === 'type') { ui.type = b.dataset.v; return ctx.rerender(); }
    if (a === 'clear') { Object.assign(ui, { q:'', loc:'', fam:'', series:'', status:'', brand:'', pmin:'', pmax:'', stock:'', limit:PAGE }); return ctx.rerender(); }
    if (a === 'more') { ui.limit += PAGE; return ctx.rerender(); }
    if (a === 'all') { ui.limit = Infinity; return ctx.rerender(); }
    if (a === 'export') return exportCsv();
    if (a === 'sort') { if (ui.sort === b.dataset.v) ui.dir = -ui.dir; else { ui.sort = b.dataset.v; ui.dir = ['sku', 'name', 'type', 'bin'].includes(b.dataset.v) ? 1 : -1; } return ctx.rerender(); }
    if (a === 'history') { ui.sku = b.dataset.sku || null; ui.tab = 'log'; ui.q = ''; return ctx.rerender(); }
    if (a === 'op') return openOp(b.dataset.type, b.dataset.sku);
    if (a === 'bins') return binsDialog(b.dataset.sku);
    if (a === 'binmgr') return binMgrDialog();
    if (a === 'bm-edit') { bm.edit = b.dataset.code; return paintBinMgr(); }
    if (a === 'bm-cancel') { bm.edit = null; return paintBinMgr(); }
    if (a === 'bm-save') return binMgrRename(b.dataset.code);
    if (a === 'bm-del') return binMgrDelete(b.dataset.code);
    if (a === 'new-sku') return newSkuDialog();
    if (a === 'batch') return batchDialog();
    if (a === 'arrivals') return arrivalDialog();
    if (a === 'arr-all') { const box = document.getElementById('wms-arrival'); const on = ![...box.querySelectorAll('[data-arr-ok]')].every(c => c.checked); box.querySelectorAll('[data-arr-ok]').forEach(c => { c.checked = on; }); return paintArrivalState(); }
    if (a === 'import') return importDialog();
    if (a === 'template') return downloadTemplate();
    if (a === 'approve' || a === 'reject') return act(() => ctx.api.post('/wms/movements/' + encodeURIComponent(b.dataset.id) + '/' + a, {}), a === 'approve' ? tr('已确认，库存已更新', 'Confirmed; stock updated') : tr('已驳回', 'Rejected'));
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.matches?.('[data-wms-loc]')) { ui.loc = t.value; ui.limit = PAGE; return ctx.rerender(); }
    if (t.closest?.('#wms-op') && (t.name === 'location' || t.matches('[data-wms-fstock],[data-wms-ffam],[data-wms-fseries],[data-wms-fstatus],[data-wms-fbrand]'))) { const of = t.closest('#wms-op'); op.inStock = !!of.querySelector('[data-wms-fstock]')?.checked;
      for (const k of ['fam', 'series', 'status', 'brand']) op[k] = of.querySelector(`[data-wms-f${k}]`)?.value || ''; paintFinder(); paintLines(); }
    if (t.matches?.('[data-wms-fam]')) { ui.fam = t.value; ui.series = ''; ui.limit = PAGE; return ctx.rerender(); }
    if (t.matches?.('[data-wms-flt]')) { ui[t.dataset.wmsFlt] = t.value; ui.limit = PAGE; return ctx.rerender(); }
    if (t.matches?.('[data-wms-series]')) { ui.series = t.value; ui.limit = PAGE; return ctx.rerender(); }
    if (t.matches?.('[data-wms-pmin],[data-wms-pmax]')) { const v = t.value.trim().replace(/[$,]/g, ''); if (v !== '' && !Number.isFinite(Number(v))) { t.value = ''; return; } ui[t.matches('[data-wms-pmin]') ? 'pmin' : 'pmax'] = v; ui.limit = PAGE; return ctx.rerender(); }
    if (t.matches?.('[data-wms-line-slot]')) { op.lines[Number(t.dataset.wmsLineSlot)].slot = t.value ? Number(t.value) : undefined; return; }
    if (t.closest?.('#wms-batch')) { const f = t.closest('#wms-batch'); f.querySelector('[data-wms-batch-from]').hidden = f.mode.value !== 'transfer'; if (t.name === 'mode') f.reason.value = f.mode.value === 'transfer' ? tr('到港入仓', 'Arrived at warehouse') : tr('采购到货', 'Purchase received'); batchPreview(f); }
    if (t.matches?.('[data-wms-file]')) {
      const f = t.closest('form'), err = f.querySelector('.wms-error'), slot = f.querySelector('[data-wms-import-preview]'); err.textContent = ''; slot.innerHTML = ''; importRows = null;
      const file = t.files?.[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { err.textContent = tr('文件太大（超过 5MB）。', 'File too large (over 5 MB).'); return; }
      try {
        const r = readRows(await file.text());
        if (r.problems.length) { err.innerHTML = r.problems.slice(0, 8).map(esc).join('<br>') + (r.problems.length > 8 ? `<br>${tr(`…另有 ${r.problems.length - 8} 处`, `…and ${r.problems.length - 8} more`)}` : ''); return; }
        if (r.rows.length > 5000) { err.textContent = tr('一次最多导入 5000 个 SKU。', 'At most 5000 SKUs per import.'); return; }
        importRows = r.rows;
        const known = new Set(data.items.map(it => it.sku.toLowerCase())), fresh = r.rows.filter(x => !known.has(x.sku.toLowerCase())).length;
        const sums = r.locs.map(id => `${esc(word(loc(id)))} ${fmtN(r.rows.reduce((s, x) => s + (x.qty[id] || 0), 0))}`).join(' · ');
        slot.innerHTML = `<div class="wms-note">${icon('check-circle')} ${tr(`读取到 ${r.rows.length} 个 SKU（其中新 SKU ${fresh} 个）`, `${r.rows.length} SKUs read (${fresh} new)`)}<br><small>${sums}</small></div>`;
      } catch (x) { err.textContent = x.message || tr('读取失败', 'Could not read the file'); }
    }
  });
  // Search redraws once typing pauses, not on every keystroke (IME input fires many events per word).
  let searchTimer = null, composing = false;
  document.addEventListener('compositionstart', e => { if (e.target.matches?.('[data-wms-search]')) composing = true; });
  document.addEventListener('compositionend', e => { if (e.target.matches?.('[data-wms-search]')) { composing = false; e.target.dispatchEvent(new Event('input', { bubbles:true })); } });
  document.addEventListener('input', e => {
    if (e.target.matches?.('[data-wms-batch-lines]')) batchPreview(e.target.closest('form'));
    if (e.target.matches?.('[data-wms-search]')) {
      ui.q = e.target.value; ui.limit = PAGE; clearTimeout(searchTimer);
      if (composing) return;
      searchTimer = setTimeout(() => { const cur = document.querySelector('[data-wms-search]'), pos = cur?.selectionStart ?? ui.q.length; ctx.rerender(); const box = document.querySelector('[data-wms-search]'); if (box) { box.focus(); box.setSelectionRange(pos, pos); } }, 180);
    }
    if (e.target.matches?.('[data-wms-fq]')) { op.q = e.target.value; paintFinder(); }
    if (e.target.matches?.('[data-wms-line]')) {
      const i = Number(e.target.dataset.wmsLine); op.lines[i].qty = e.target.value;
      const cell = document.querySelector(`[data-wms-diff="${i}"]`), it = data.items.find(y => y.sku === op.lines[i].sku), have = n(it || {}, opLoc()), v = e.target.value === '' ? null : Number(e.target.value);
      if (cell) { cell.textContent = v == null ? '' : (v - have > 0 ? '+' : '') + fmtN(v - have); cell.className = 'num ' + (v == null ? '' : v - have < 0 ? 'neg' : v - have > 0 ? 'pos' : ''); }
      if (op.type === 'out' || op.type === 'transfer') e.target.classList.toggle('bad', v > have);
      const tot = document.querySelector('[data-wms-total]'), units = op.lines.reduce((s2, x) => s2 + (Number(x.qty) || 0), 0);
      if (tot && op.type !== 'adjust') tot.textContent = tr(`共 ${op.lines.length} 个 SKU，${fmtN(units)} 件`, `${op.lines.length} SKUs, ${fmtN(units)} units`);
    }
  });
  document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.id === 'wms-batch') {
      e.preventDefault(); const err = f.querySelector('.wms-error'); batchPreview(f);
      if (!batchLines.length) { err.textContent = err.textContent || tr('请先粘贴要入库的 SKU 和数量。', 'Paste the SKUs and quantities first.'); return; }
      const mode = f.mode.value, body = { opDate:f.opDate.value, type:mode, location:mode === 'transfer' ? f.location.value : f.toLocation.value, ...(mode === 'transfer' ? { toLocation:f.toLocation.value } : {}), reason:f.reason.value.trim(), reference:f.reference.value.trim() || undefined, lines:batchLines.map(l => ({ sku:l.sku, qty:l.qty })) };
      if (mode === 'transfer' && body.location === body.toLocation) { err.textContent = tr('调出和调入库位不能相同。', 'From and to must differ.'); return; }
      const btn = document.querySelector('button[form="wms-batch"]'); if (btn) btn.disabled = true;
      try { const r = await ctx.api.post('/wms/movements/batch', body); ctx.closeOverlay(); ctx.toast?.(tr(`已入库 ${r.lines} 个 SKU，共 ${fmtN(r.units)} 件`, `${r.lines} SKUs, ${fmtN(r.units)} units received`)); batchLines = []; data = null; load(); }
      catch (x) { err.textContent = x.message || tr('入库失败', 'Could not save'); if (btn) btn.disabled = false; }
      return;
    }
    if (f.id === 'wms-bins' || f.id === 'wms-binmove') {
      e.preventDefault(); const err = f.closest('.wms-form').querySelector('.wms-error'), v = Object.fromEntries(new FormData(f));
      try {
        if (f.id === 'wms-bins') await ctx.api.post('/wms/bins', { sku:binSku, location:ui.loc, bins:[v.b0, v.b1, v.b2].map(x => String(x || '').trim()) });
        else await ctx.api.post('/wms/bins/move', { sku:binSku, location:ui.loc, from:Number(v.from), to:Number(v.to), qty:Number(v.qty) });
        ctx.toast?.(f.id === 'wms-bins' ? tr('库位已保存', 'Bins saved') : tr('已移库', 'Moved'));
        data = await ctx.api.get('/wms/summary'); binsDialog(binSku); ctx.rerender();
      } catch (x) { err.textContent = x.message || tr('保存失败', 'Could not save'); }
      return;
    }
    if (f.id === 'wms-sku') {
      e.preventDefault(); const v = Object.fromEntries(new FormData(f)), err = f.querySelector('.wms-error');
      try { await ctx.api.post('/wms/items', { sku:String(v.sku).trim(), name:String(v.name).trim(), type:String(v.type || '').trim() || undefined }); ctx.closeOverlay(); ctx.toast?.(tr('SKU 已新增', 'SKU added')); data = null; load(); }
      catch (x) { err.textContent = x.message || tr('保存失败', 'Could not save'); }
      return;
    }
    if (f.id === 'wms-import') {
      e.preventDefault(); const err = f.querySelector('.wms-error');
      if (!importRows) { err.textContent = err.textContent || tr('请先选择一个可以读取的 CSV 文件。', 'Choose a readable CSV file first.'); return; }
      const btn = document.querySelector('button[form="wms-import"]'); if (btn) btn.disabled = true;
      try { const r = await ctx.api.post('/wms/import', { asOf:f.asOf.value, rows:importRows }); ctx.closeOverlay(); ctx.toast?.(tr(`已导入 ${r.rows} 个 SKU，新增 ${r.created} 个，调整 ${r.changed} 处数量`, `Imported ${r.rows} SKUs: ${r.created} new, ${r.changed} quantities changed`)); importRows = null; data = null; load(); }
      catch (x) { err.textContent = x.message || tr('导入失败', 'Import failed'); if (btn) btn.disabled = false; }
      return;
    }
    if (f.id !== 'wms-op') return; e.preventDefault();
    const type = f.dataset.type, err = f.querySelector('.wms-error'), adj = type === 'adjust', from = fld(f, 'location').value;
    if (!op.lines.length) { err.textContent = tr('请先从列表里添加至少一个 SKU。', 'Add at least one SKU from the list first.'); return; }
    if (!fld(f, 'opDate').value) { err.textContent = tr('请选择操作日期。', 'Choose the date.'); return; }
    if (type === 'transfer' && from === fld(f, 'toLocation').value) { err.textContent = tr('调出和调入仓库不能相同。', 'From and to must differ.'); return; }
    for (const x of op.lines) {
      const v = Number(x.qty), it = data.items.find(y => y.sku === x.sku);
      if (x.qty === '' || !Number.isInteger(v) || v < (adj ? 0 : 1)) { err.textContent = tr(`${x.sku}：请填${adj ? '实盘数量（0 或以上的整数）' : '数量（正整数）'}。`, `${x.sku}: enter a ${adj ? 'counted quantity (0 or more)' : 'quantity (whole number above 0)'}.`); return; }
      if ((type === 'out' || type === 'transfer') && v > n(it, from)) { err.textContent = tr(`${x.sku}：${word(loc(from))}只有 ${n(it, from)} 件，不能扣成负数。`, `${x.sku}: ${word(loc(from))} has only ${n(it, from)}.`); return; }
    }
    const body = { type, location:from, opDate:fld(f, 'opDate').value, reason:fld(f, 'reason').value.trim(), reference:fld(f, 'reference').value.trim() || undefined, ...(type === 'transfer' ? { toLocation:fld(f, 'toLocation').value } : {}),
      lines:op.lines.map(x => adj ? { sku:x.sku, counted:Number(x.qty) } : { sku:x.sku, qty:Number(x.qty), ...(x.slot ? { slot:x.slot } : {}) }) };
    const btn = document.querySelector('button[form="wms-op"]'); if (btn) btn.disabled = true;
    try {
      const r = await ctx.api.post('/wms/movements/batch', body); ctx.closeOverlay();
      const name = tr(TYPES[type][0], TYPES[type][1]);
      ctx.toast?.(adj ? tr(`已提交 ${r.lines} 个 SKU 的盘点${r.unchanged ? `（${r.unchanged} 个与系统一致，已跳过）` : ''}。要由另一位有库存管理权限的同事确认后才生效${r.confirmers?.length ? `，可以找：${r.confirmers.join('、')}` : ''}`, `${r.lines} count lines submitted${r.unchanged ? ` (${r.unchanged} matched, skipped)` : ''}. Another warehouse manager must confirm${r.confirmers?.length ? `: ${r.confirmers.join(', ')}` : ''}`)
        : tr(`已${name} ${r.lines} 个 SKU，共 ${fmtN(r.units)} 件`, `${name}: ${r.lines} SKUs, ${fmtN(r.units)} units`));
      op.lines = []; data = null; load();
    } catch (x) { err.textContent = x.message || tr('保存失败', 'Could not save'); if (btn) btn.disabled = false; }
  });

  window.WorkOSWms = { configure, render, reset };
})();
