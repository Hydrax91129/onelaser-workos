/*
 * Inventory management (WMS).
 *
 * Stock is kept per SKU and location (US warehouse, Dongguan factory, Jinan
 * factory, in transit). Warehouse operators record goods in, goods out,
 * transfers and count adjustments; every change is a movement with who, when,
 * how many, the reason and, for goods out, an order number. Count adjustments
 * wait for a leader's confirmation before they change stock. Managers choose
 * who the warehouse operators are. New SKUs are created in Product catalog only;
 * this page changes quantities, never the SKU list.
 *
 * Data comes from /wms/* (server). No product or stock data is bundled here.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '';
  const ui = { q:'', loc:'', type:'', kind:'', stock:'', sort:'', dir:1, tab:'stock', sku:null };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const word = x => x ? (lang() === 'en' ? x.en : x.zh) : '';
  const fmtN = n => Number(n || 0).toLocaleString('en-US');
  const when = iso => new Date(iso).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const TYPES = { in:['入库', 'Goods in', 'arrow-circle-down', 'in'], out:['出库', 'Goods out', 'arrow-circle-up', 'out'], transfer:['调拨', 'Transfer', 'arrows-left-right', 'transfer'], adjust:['盘点调整', 'Count adjustment', 'clipboard-text', 'adjust'] };
  const STATES = { done:['已生效', 'Applied', 'done'], pending:['待领导确认', 'Awaiting leader', 'pending'], rejected:['已驳回', 'Rejected', 'rejected'] };

  function configure(next) { ctx = next; }
  function reset() { data = null; loading = false; error = ''; Object.assign(ui, { q:'', loc:'', type:'', kind:'', stock:'', sort:'', dir:1, tab:'stock', sku:null }); }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/wms/summary'); error = ''; }
    catch (e) { error = e.message || tr('库存读取失败', 'Could not load inventory'); }
    finally { loading = false; ctx.rerender(); }
  }
  const loc = id => data.locations.find(l => l.id === id);
  const total = it => data.locations.reduce((s, l) => s + Number(it.qty?.[l.id] || 0), 0);

  function render() {
    if (!data && !error) { load(); return `<div class="wms"><p class="wms-hint">${tr('正在读取库存…', 'Loading inventory…')}</p></div>`; }
    if (error && !data) return `<div class="wms"><div class="wms-alert">${esc(error)}</div></div>`;
    const items = filtered();
    const pending = data.movements.filter(m => m.status === 'pending');
    const today = data.movements.filter(m => new Date(m.createdAt).toDateString() === new Date().toDateString()).length;
    return `<div class="wms">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · WMS</div><h1>${tr('库存管理', 'Inventory')}</h1><p>${tr('按 SKU 和库位记录库存。每一次入库、出库、调拨和盘点调整都会留下流水；盘点调整需领导确认后生效。新建 SKU 请到“产品管理”。', 'Stock per SKU and location. Every goods-in, goods-out, transfer and count adjustment is logged; count adjustments take effect after a leader confirms. Create new SKUs in Product catalog.')}</p></div>
        <div class="heading-actions">${data.canAssign ? `<button class="btn" data-live-page="erp-access">${icon('user-gear')} ${tr('库存权限设置', 'Stock permissions')}</button>` : ''}</div></div>
      ${data.canOperate ? '' : `<div class="wms-note">${icon('eye')} ${tr('你的仓库库存权限是“查看”：可以看库存和流水，不能加减数量。需要管理权限请联系主管在“ERP 权限”里开通。', 'Your warehouse access is view-only: you can see stock and movements but not change quantities. Ask a manager to grant Manage in ERP permissions.')}</div>`}
      <div class="wms-kpis">${data.locations.map(l => `<button class="wms-kpi ${ui.loc === l.id ? 'on' : ''}" data-wms="loc" data-v="${esc(l.id)}"><span>${esc(word(l))}</span><b>${fmtN(data.items.reduce((s, it) => s + Number(it.qty?.[l.id] || 0), 0))}</b><em>${data.items.filter(it => Number(it.qty?.[l.id] || 0) > 0).length} SKU</em></button>`).join('')}
        <div class="wms-kpi ${pending.length ? 'warn' : ''}"><span>${tr('待领导确认', 'Awaiting leader')}</span><b>${pending.length}</b><em>${tr('盘点调整', 'count adjustments')}</em></div>
        <div class="wms-kpi"><span>${tr('今日流水', 'Today')}</span><b>${today}</b><em>${tr('条操作', 'movements')}</em></div></div>
      ${pending.length && data.canApprove ? `<section class="wms-pending"><h3>${icon('seal-question')} ${tr('待你确认的盘点调整', 'Count adjustments awaiting you')} <b>${pending.length}</b></h3>${pending.map(m => `<div class="wms-pend-row"><span class="wms-type adjust">${tr('盘点调整', 'Adjust')}</span><strong>${esc(m.sku)}</strong><span>${esc(word(loc(m.location)))}</span><span class="${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${fmtN(m.qty)}</span><span class="wms-reason">${esc(m.reason)}</span><span class="wms-by">${esc(m.byName)} · ${when(m.createdAt)}</span><button class="btn small primary" data-wms="approve" data-id="${esc(m.id)}">${tr('确认生效', 'Confirm')}</button><button class="btn small" data-wms="reject" data-id="${esc(m.id)}">${tr('驳回', 'Reject')}</button></div>`).join('')}</section>` : ''}
      <div class="wms-tabs"><button class="${ui.tab === 'stock' ? 'on' : ''}" data-wms="tab" data-v="stock">${icon('package')} ${tr('库存', 'Stock')}</button><button class="${ui.tab === 'log' ? 'on' : ''}" data-wms="tab" data-v="log">${icon('list-bullets')} ${tr('出入库流水', 'Movements')}</button></div>
      <div class="wms-toolbar"><label class="wms-search">${icon('magnifying-glass')}<input data-wms-search value="${esc(ui.q)}" placeholder="${tr('搜索 SKU 或产品名', 'Search SKU or product')}"></label>
        <span class="wms-spacer"></span>
        ${data.canOperate ? Object.entries(TYPES).map(([k, [zh, en, ic]]) => `<button class="btn ${k === 'in' ? 'primary' : ''}" data-wms="op" data-type="${k}">${icon(ic)} ${tr(zh, en)}</button>`).join('') : ''}</div>
      ${ui.tab === 'stock' ? stockTable(items) : logTable(ui.sku ? data.movements.filter(m => m.sku === ui.sku) : data.movements)}
    </div>`;
  }
  /* Filters: search, product type, location with stock, stock situation; any column can be sorted. */
  const STOCK = [['', '全部', 'All'], ['us-out', '美国仓缺货', 'Out of stock in US'], ['us-low', '美国仓 ≤ 2 件', 'US ≤ 2'], ['transit', '有在途', 'In transit'], ['factory', '工厂有货', 'Stock at factory'], ['zero', '全部为 0', 'Zero everywhere']];
  function filtered() {
    const q = ui.q.trim().toLowerCase(), n = (it, l) => Number(it.qty?.[l] || 0);
    const list = data.items.filter(it => (!q || it.sku.toLowerCase().includes(q) || String(it.name || '').toLowerCase().includes(q))
      && (!ui.loc || n(it, ui.loc) > 0) && (!ui.kind || it.type === ui.kind)
      && (!ui.stock || (ui.stock === 'us-out' ? n(it, 'us') === 0 && total(it) > 0 : ui.stock === 'us-low' ? n(it, 'us') <= 2 : ui.stock === 'transit' ? n(it, 'transit') > 0 : ui.stock === 'factory' ? n(it, 'dg') + n(it, 'jn') > 0 : total(it) === 0)));
    if (!ui.sort) return list;
    const key = it => ui.sort === 'sku' ? it.sku : ui.sort === 'name' ? String(it.name || '') : ui.sort === 'type' ? String(it.type || '') : ui.sort === 'total' ? total(it) : n(it, ui.sort);
    return list.slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'zh')) * ui.dir; });
  }
  function filterBar() {
    const kinds = [...new Set(data.items.map(it => it.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
    const count = (k) => { const save = ui.stock; ui.stock = k; const c = filtered().length; ui.stock = save; return c; };
    const active = ui.q || ui.loc || ui.kind || ui.stock;
    return `<div class="wms-filters"><label class="wms-select">${icon('funnel')}<select data-wms-kind aria-label="${tr('产品类型', 'Product type')}"><option value="">${tr('全部类型', 'All types')}</option>${kinds.map(k => `<option value="${esc(k)}" ${ui.kind === k ? 'selected' : ''}>${esc(k)}（${data.items.filter(it => it.type === k).length}）</option>`).join('')}</select></label>
      <label class="wms-select">${icon('warehouse')}<select data-wms-loc aria-label="${tr('库位', 'Location')}"><option value="">${tr('全部库位', 'All locations')}</option>${data.locations.map(l => `<option value="${esc(l.id)}" ${ui.loc === l.id ? 'selected' : ''}>${esc(word(l))} ${tr('有货', 'in stock')}</option>`).join('')}</select></label>
      <div class="wms-seg">${STOCK.map(([k, zh, en]) => `<button class="${ui.stock === k ? 'on' : ''}" data-wms="stock" data-v="${k}">${tr(zh, en)}${k ? ` <b>${count(k)}</b>` : ''}</button>`).join('')}</div>
      ${active ? `<button class="wms-link" data-wms="clear">${icon('x-circle')} ${tr('清除筛选', 'Clear filters')}</button>` : ''}</div>`;
  }
  const sortTh = (key, label, cls = '') => `<th class="${cls} wms-sortable ${ui.sort === key ? 'sorted' : ''}" data-wms="sort" data-v="${key}">${label}${ui.sort === key ? icon(ui.dir > 0 ? 'caret-up' : 'caret-down') : ''}</th>`;
  function stockTable(items) {
    return `${filterBar()}<p class="wms-count">${tr(`显示 ${items.length} / ${data.items.length} 个 SKU · 点击表头排序（例如点“东莞工厂仓”看哪些 SKU 在东莞最多）· 蓝底数字 = 这个 SKU 库存最多的库位`, `${items.length} of ${data.items.length} SKUs · click a header to sort · blue = where this SKU has the most stock`)}</p><div class="wms-table-wrap"><table class="wms-table"><thead><tr>${sortTh('sku', 'SKU')}${sortTh('name', tr('产品', 'Product'))}${sortTh('type', tr('类型', 'Type'))}${data.locations.map(l => sortTh(l.id, esc(word(l)), 'num')).join('')}${sortTh('total', tr('合计', 'Total'), 'num')}<th></th></tr></thead><tbody>
      ${items.map(it => `<tr><td class="mono">${esc(it.sku)}</td><td>${esc(it.name)}</td><td><span class="wms-tag">${esc(it.type || '—')}</span></td>${(() => { const max = Math.max(...data.locations.map(l => Number(it.qty?.[l.id] || 0))); return data.locations.map(l => { const n = Number(it.qty?.[l.id] || 0); return `<td class="num ${n === 0 ? 'zero' : ''} ${l.id === 'us' && n === 0 ? 'out' : ''} ${n > 0 && n === max ? 'top' : ''}" ${n > 0 && n === max ? `title="${esc(tr('这个 SKU 库存最多的库位', 'Location holding most of this SKU'))}"` : ''}>${fmtN(n)}</td>`; }).join(''); })()}<td class="num strong">${fmtN(total(it))}</td><td class="act"><button class="wms-link" data-wms="history" data-sku="${esc(it.sku)}">${tr('流水', 'Log')}</button>${data.canOperate ? `<button class="wms-link" data-wms="op" data-type="out" data-sku="${esc(it.sku)}">${tr('出库', 'Out')}</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="${data.locations.length + 5}" class="wms-empty">${tr('没有匹配的 SKU。新建 SKU 请到“产品管理”。', 'No matching SKU. Create new SKUs in Product catalog.')}</td></tr>`}
    </tbody></table></div>`;
  }
  function logTable(list) {
    return `${ui.sku ? `<p class="wms-hint">${tr('只看', 'Only')} <b class="mono">${esc(ui.sku)}</b> <button class="wms-link" data-wms="history" data-sku="">${tr('看全部', 'Show all')}</button></p>` : ''}<div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>${tr('时间', 'Time')}</th><th>${tr('类型', 'Type')}</th><th>SKU</th><th>${tr('库位', 'Location')}</th><th class="num">${tr('数量', 'Qty')}</th><th>${tr('原因', 'Reason')}</th><th>${tr('单号', 'Reference')}</th><th>${tr('操作人', 'By')}</th><th>${tr('状态', 'Status')}</th></tr></thead><tbody>
      ${list.map(m => { const [zh, en, , cls] = TYPES[m.type] || [m.type, m.type, '', '']; const st = STATES[m.status] || STATES.done; return `<tr><td>${when(m.createdAt)}</td><td><span class="wms-type ${cls}">${tr(zh, en)}</span></td><td class="mono">${esc(m.sku)}</td><td>${esc(word(loc(m.location)))}${m.toLocation ? ` → ${esc(word(loc(m.toLocation)))}` : ''}</td><td class="num ${m.qty < 0 ? 'neg' : 'pos'}">${m.type === 'transfer' ? '' : m.qty > 0 ? '+' : ''}${fmtN(m.qty)}</td><td>${esc(m.reason)}</td><td class="mono">${esc(m.reference || '—')}</td><td>${esc(m.byName)}${m.approvedByName ? `<small>${tr('确认', 'confirmed')}：${esc(m.approvedByName)}</small>` : ''}</td><td><span class="wms-state ${st[2]}">${tr(st[0], st[1])}</span></td></tr>`; }).join('') || `<tr><td colspan="9" class="wms-empty">${tr('还没有流水', 'No movements yet')}</td></tr>`}
    </tbody></table></div>`;
  }

  function opForm(type, sku) {
    const [zh, en] = TYPES[type];
    const skuOpts = data.items.map(it => `<option value="${esc(it.sku)}">${esc(it.name)}</option>`).join('');
    const locOpts = (sel, name) => `<select name="${name}" required>${data.locations.map(l => `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc(word(l))}</option>`).join('')}</select>`;
    const reasons = { in:[tr('采购到货', 'Purchase received'), tr('退货入库', 'Customer return'), tr('维修完成回库', 'Back from repair')], out:[tr('销售发货', 'Sales shipment'), tr('样机 / 展会', 'Demo / trade show'), tr('售后换货', 'Warranty replacement')], transfer:[tr('工厂发美国（海运）', 'Factory to US (sea)'), tr('工厂发美国（空运）', 'Factory to US (air)'), tr('到港入仓', 'Arrived at warehouse')], adjust:[tr('盘点差异', 'Count difference'), tr('损坏报损', 'Damaged'), tr('送修 / 维修中', 'Sent for repair')] }[type];
    return `<form id="wms-op" data-type="${type}" class="wms-form">
      <label class="field"><span>SKU</span><input name="sku" list="wms-skus" required value="${esc(sku || '')}" placeholder="${tr('输入或选择 SKU', 'Type or pick a SKU')}" autocomplete="off"><datalist id="wms-skus">${skuOpts}</datalist><small class="wms-hint">${tr('列表里没有的 SKU 需要先在“产品管理”里新建。', 'SKUs not in the list must first be created in Product catalog.')}</small></label>
      <div class="form-grid">
        <label class="field"><span>${type === 'transfer' ? tr('从库位', 'From') : tr('库位', 'Location')}</span>${locOpts(type === 'in' || type === 'out' ? 'us' : type === 'transfer' ? 'dg' : 'us', 'location')}</label>
        ${type === 'transfer' ? `<label class="field"><span>${tr('到库位', 'To')}</span>${locOpts('transit', 'toLocation')}</label>` : ''}
        ${type === 'adjust' ? `<label class="field"><span>${tr('实盘数量', 'Counted quantity')}</span><input name="counted" type="number" min="0" step="1" required><small class="wms-hint" data-wms-current></small></label>` : `<label class="field"><span>${tr('数量', 'Quantity')}</span><input name="qty" type="number" min="1" step="1" required></label>`}
      </div>
      <label class="field"><span>${tr('原因（必填）', 'Reason (required)')}</span><input name="reason" required minlength="2" maxlength="200" list="wms-reasons"><datalist id="wms-reasons">${reasons.map(r => `<option value="${esc(r)}">`).join('')}</datalist></label>
      <label class="field"><span>${type === 'out' ? tr('订单号 / 单号（必填）', 'Order / reference no. (required)') : tr('单号（采购单、运单等，选填）', 'Reference (PO, waybill…, optional)')}</span><input name="reference" maxlength="80" ${type === 'out' ? 'required' : ''}></label>
      ${type === 'adjust' ? `<p class="wms-note">${icon('seal-question')} ${tr('盘点调整提交后需要你的领导确认，确认后才会改动库存。', 'A count adjustment changes stock only after your leader confirms it.')}</p>` : ''}
      <p class="wms-error" role="alert"></p>
    </form>`;
  }
  function openOp(type, sku) {
    ctx.modal(tr(...TYPES[type].slice(0, 2)), opForm(type, sku), `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="wms-op">${type === 'adjust' ? tr('提交确认', 'Submit for confirmation') : tr('保存', 'Save')}</button>`);
    refreshCurrent();
  }
  function refreshCurrent() {
    const f = document.getElementById('wms-op'); if (!f) return;
    const it = data.items.find(x => x.sku === f.sku.value.trim()), slot = f.querySelector('[data-wms-current]');
    if (slot) slot.textContent = it ? tr(`系统数量：${fmtN(it.qty?.[f.location.value] || 0)}`, `System quantity: ${fmtN(it.qty?.[f.location.value] || 0)}`) : '';
  }
  function operatorsDialog() {
    ctx.modal(tr('仓库管理员', 'Warehouse operators'), `<p class="wms-hint">${tr('只有主管可以指定仓库管理员。被指定的人可以做入库、出库、调拨和盘点调整；其他人只能查看库存。', 'Only managers choose warehouse operators. Operators can record goods in, goods out, transfers and count adjustments; everyone else can only view stock.')}</p>
      <ul class="wms-ops">${data.people.map(p => `<li><span>${esc(p.name)}<small>${esc(p.title || '')}</small></span><label class="wms-switch"><input type="checkbox" data-wms-operator="${esc(p.id)}" ${p.operator ? 'checked' : ''}><i></i></label></li>`).join('')}</ul>`, `<button class="btn" data-live-action="close">${tr('完成', 'Done')}</button>`);
  }
  async function act(fn, ok) {
    try { await fn(); ctx.toast?.(ok); data = null; await load(); return true; }
    catch (e) { ctx.toast?.(e.message || tr('操作失败', 'Failed')); return false; }
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-wms]'); if (!b || !ctx) return;
    e.preventDefault();
    const a = b.dataset.wms;
    if (a === 'tab') { ui.tab = b.dataset.v; return ctx.rerender(); }
    if (a === 'loc') { ui.loc = ui.loc === b.dataset.v ? '' : b.dataset.v; return ctx.rerender(); }
    if (a === 'stock') { ui.stock = b.dataset.v; ui.tab = 'stock'; return ctx.rerender(); }
    if (a === 'clear') { Object.assign(ui, { q:'', loc:'', kind:'', stock:'' }); return ctx.rerender(); }
    if (a === 'sort') { if (ui.sort === b.dataset.v) ui.dir = -ui.dir; else { ui.sort = b.dataset.v; ui.dir = ['sku', 'name', 'type'].includes(b.dataset.v) ? 1 : -1; } return ctx.rerender(); }
    if (a === 'history') { ui.sku = b.dataset.sku || null; ui.tab = 'log'; return ctx.rerender(); }
    if (a === 'op') return openOp(b.dataset.type, b.dataset.sku);
    if (a === 'operators') return operatorsDialog();
    if (a === 'approve' || a === 'reject') return act(() => ctx.api.post('/wms/movements/' + encodeURIComponent(b.dataset.id) + '/' + a, {}), a === 'approve' ? tr('已确认，库存已更新', 'Confirmed; stock updated') : tr('已驳回', 'Rejected'));
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.matches?.('[data-wms-operator]')) { const ok = await act(() => ctx.api.post('/wms/operators', { userId:t.dataset.wmsOperator, enabled:t.checked }), t.checked ? tr('已设为仓库管理员', 'Operator added') : tr('已取消仓库管理员', 'Operator removed')); if (ok) operatorsDialog(); }
    if (t.matches?.('[data-wms-kind]')) { ui.kind = t.value; return ctx.rerender(); }
    if (t.matches?.('[data-wms-loc]')) { ui.loc = t.value; return ctx.rerender(); }
    if (t.closest?.('#wms-op')) refreshCurrent();
  });
  document.addEventListener('input', e => {
    if (e.target.matches?.('[data-wms-search]')) { ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender(); const n = document.querySelector('[data-wms-search]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
    if (e.target.closest?.('#wms-op') && e.target.name === 'sku') refreshCurrent();
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (f.id !== 'wms-op') return; e.preventDefault();
    const v = Object.fromEntries(new FormData(f)), type = f.dataset.type, err = f.querySelector('.wms-error');
    const it = data.items.find(x => x.sku === String(v.sku).trim());
    if (!it) { err.textContent = tr('找不到这个 SKU。新建 SKU 请先到“产品管理”。', 'SKU not found. Create it in Product catalog first.'); return; }
    if (type === 'transfer' && v.location === v.toLocation) { err.textContent = tr('调出和调入库位不能相同。', 'From and to must differ.'); return; }
    const have = Number(it.qty?.[v.location] || 0);
    if ((type === 'out' || type === 'transfer') && Number(v.qty) > have) { err.textContent = tr(`${word(loc(v.location))}只有 ${have} 件，不能扣成负数。`, `${word(loc(v.location))} has only ${have}; stock cannot go negative.`); return; }
    const body = { type, sku:it.sku, location:v.location, reason:String(v.reason).trim(), reference:String(v.reference || '').trim() || undefined, ...(type === 'transfer' ? { toLocation:v.toLocation } : {}), ...(type === 'adjust' ? { counted:Number(v.counted) } : { qty:Number(v.qty) }) };
    try { await ctx.api.post('/wms/movements', body); ctx.closeOverlay(); ctx.toast?.(type === 'adjust' ? tr('已提交，等待领导确认', 'Submitted; awaiting your leader') : tr('已保存，库存已更新', 'Saved; stock updated')); data = null; load(); }
    catch (x) { err.textContent = x.message || tr('保存失败', 'Could not save'); }
  });

  window.WorkOSWms = { configure, render, reset };
})();
