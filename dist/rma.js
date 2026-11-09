/*
 * Returns & repairs (RMA), the third tab of "产品与库存".
 *
 * One case per returned unit: received date, reason, who diagnosed and repaired it, photos at receipt /
 * diagnosis / after repair, how many days the repair took, and how it ended (back into stock through a
 * WMS goods-in movement, scrapped, or returned to the customer). A refurbished unit back in stock can get
 * a discount and a listing status for the website.
 *
 * Data comes from /rma/* (server). Photos are read through the API and shown as data: URLs (CSP).
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '', detail = null, busy = false;
  const ui = { q:'', view:'open' };
  const photoCache = new Map();
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const apiBase = () => (window.WORKOS_CONFIG && window.WORKOS_CONFIG.apiBase) || '/api';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const money = n => n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits:0, maximumFractionDigits:2 });
  const when = iso => iso ? new Date(iso).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  const STATUS = {
    received:['已收货', 'Received', 'gray'], diagnosing:['诊断中', 'Diagnosing', 'blue'], waiting_parts:['等配件', 'Waiting for parts', 'amber'], repairing:['维修中', 'Repairing', 'blue'],
    repaired:['已修好，待入库', 'Repaired, to restock', 'green'], restocked:['已退回库存', 'Back in stock', 'done'], scrapped:['已报废', 'Scrapped', 'red'], returned:['已退回客户', 'Returned to customer', 'done'],
  };
  const OPEN = ['received', 'diagnosing', 'waiting_parts', 'repairing', 'repaired'];
  const KIND = { return:['退货', 'Return'], warranty:['保修', 'Warranty'], repair:['付费维修', 'Paid repair'], exchange:['换货', 'Exchange'] };
  const CHANNEL = { website:['官网', 'Website'], amazon:['Amazon', 'Amazon'], dealer:['经销商', 'Dealer'], other:['其他', 'Other'] };
  const PHOTO = { received:['收货时', 'On receipt'], diagnosis:['问题诊断', 'Diagnosis'], repaired:['维修后', 'After repair'], listing:['上架照片', 'Listing photos'] };
  const CLASS = { machine:['机器', 'Machine'], accessory:['配件', 'Accessory'], material:['材料', 'Material'], other:['其他', 'Other'] };
  const IMG_MIME = ['image/png', 'image/jpeg', 'image/webp'];
  let newPhotos = [];
  const LISTING = { none:['不上架', 'Not listed'], pending:['待上架', 'To list'], listed:['已上架', 'Listed'], sold:['已售出', 'Sold'] };
  const GRADE = { A:['A 品（几乎全新）', 'A (like new)'], B:['B 品（轻微使用痕迹）', 'B (light wear)'], C:['C 品（明显痕迹）', 'C (visible wear)'], new:['全新（未拆封/未使用）', 'New (unused)'] };
  const w = pair => pair ? tr(pair[0], pair[1]) : '';
  const badge = s => `<span class="rma-badge ${STATUS[s]?.[2] || ''}">${esc(w(STATUS[s]))}</span>`;

  function configure(next) { ctx = next; }
  function reset() { data = null; detail = null; loading = false; error = ''; photoCache.clear(); Object.assign(ui, { q:'', view:'open' }); }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/rma'); error = ''; }
    catch (e) { error = e.message || tr('退货记录读取失败', 'Could not load returns'); }
    finally { loading = false; ctx.rerender(); }
  }
  const avg = list => list.length ? Math.round(list.reduce((s, x) => s + x, 0) / list.length * 10) / 10 : null;

  function filtered() {
    const q = ui.q.trim().toLowerCase();
    return data.items.filter(c => {
      if (ui.view === 'open' && !OPEN.includes(c.status)) return false;
      if (ui.view === 'repaired' && c.status !== 'repaired') return false;
      if (ui.view === 'sale' && !(c.status === 'restocked' && ['pending', 'listed'].includes(c.listing))) return false;
      if (ui.view === 'closed' && OPEN.includes(c.status)) return false;
      return !q || [c.number, c.sku, c.name, c.serial, c.customer, c.orderRef, c.technicianName, c.reason].some(x => String(x || '').toLowerCase().includes(q));
    });
  }

  function render() {
    if (!data && !error) { load(); return `<div class="rma"><p class="wms-hint">${tr('正在读取退货维修记录…', 'Loading returns…')}</p></div>`; }
    if (error && !data) return `<div class="rma"><div class="wms-alert">${esc(error)}</div></div>`;
    const open = data.items.filter(c => OPEN.includes(c.status));
    const done = data.items.filter(c => c.repairDays != null);
    const month = data.items.filter(c => String(c.receivedAt || '').slice(0, 7) === today().slice(0, 7)).length;
    const toSell = data.items.filter(c => c.status === 'restocked' && ['pending', 'listed'].includes(c.listing));
    const views = [['open', tr('处理中', 'Open'), open.length], ['repaired', tr('已修好待入库', 'Repaired'), data.items.filter(c => c.status === 'repaired').length], ['sale', tr('翻新品销售', 'Refurb sale'), toSell.length], ['closed', tr('已结案', 'Closed'), data.items.length - open.length], ['all', tr('全部', 'All'), data.items.length]];
    const rows = filtered();
    return `<div class="rma">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · RMA</div><h1>${tr('退货维修', 'Returns & repairs')}</h1><p>${tr('每一台退回的产品一条记录：收货、诊断、维修人员、维修前后照片、维修用时；修好后退回库存（进入“美国仓·翻新品”），再设定折扣在网站销售。', 'One case per returned unit: receipt, diagnosis, technician, photos, repair time; repaired units go back into stock (US refurbished) and can be discounted for the website.')}</p></div>
        <div class="heading-actions">${data.canOperate ? `<button class="btn primary" data-rma="new">${icon('plus')} ${tr('登记退货', 'Register a return')}</button>` : ''}</div></div>
      <div class="rma-kpis">
        <div class="rma-kpi"><span>${tr('处理中', 'Open')}</span><b>${open.length}</b><em>${tr(`其中超过 7 天 ${open.filter(c => (c.openDays || 0) > 7).length} 件`, `${open.filter(c => (c.openDays || 0) > 7).length} older than 7 days`)}</em></div>
        <div class="rma-kpi"><span>${tr('平均维修用时', 'Average repair time')}</span><b>${avg(done.map(c => c.repairDays)) ?? '—'}<small>${tr(' 天', ' days')}</small></b><em>${tr(`按 ${done.length} 件已修好计算`, `from ${done.length} repaired`)}</em></div>
        <div class="rma-kpi"><span>${tr('翻新品待售', 'Refurbished for sale')}</span><b>${toSell.length}</b><em>${tr(`待上架 ${toSell.filter(c => c.listing === 'pending').length} · 已上架 ${toSell.filter(c => c.listing === 'listed').length}`, `${toSell.filter(c => c.listing === 'pending').length} to list · ${toSell.filter(c => c.listing === 'listed').length} listed`)}</em></div>
        <div class="rma-kpi"><span>${tr('本月登记', 'Registered this month')}</span><b>${month}</b><em>${tr(`共 ${data.items.length} 条`, `${data.items.length} in total`)}</em></div>
      </div>
      <div class="rma-bar"><div class="rma-views" role="tablist">${views.map(([id, label, n]) => `<button class="${ui.view === id ? 'on' : ''}" data-rma="view" data-v="${id}">${esc(label)} <b>${n}</b></button>`).join('')}</div>
        <label class="wms-search">${icon('magnifying-glass')}<input data-rma-search value="${esc(ui.q)}" placeholder="${tr('搜索单号、SKU、序列号、客户、订单号', 'Search number, SKU, serial, customer, order')}"></label></div>
      <div class="wms-table-wrap"><table class="wms-table rma-table"><thead><tr><th>${tr('单号', 'Case')}</th><th>${tr('产品', 'Product')}</th><th>${tr('序列号', 'Serial')}</th><th>${tr('类型', 'Type')}</th><th>${tr('客户 / 订单', 'Customer / order')}</th><th>${tr('收货', 'Received')}</th><th>${tr('状态', 'Status')}</th><th>${tr('维修人员', 'Technician')}</th><th class="num">${tr('用时', 'Days')}</th><th class="num">${tr('售价', 'Price')}</th></tr></thead><tbody>
        ${rows.map(c => `<tr class="rma-row" data-rma="open" data-id="${esc(c.id)}" tabindex="0"><td class="mono">${esc(c.number)}</td><td><b>${esc(c.name || c.sku)}</b><small class="mono">${esc(c.sku)}${c.qty > 1 ? ` × ${c.qty}` : ''}</small></td><td class="mono">${esc(c.serial || '—')}</td><td>${esc(w(KIND[c.kind]))}</td><td>${esc(c.customer || '—')}<small>${esc(c.orderRef || '')}</small></td><td>${esc(c.receivedAt)}</td><td>${badge(c.status)}</td><td>${esc(c.technicianName || '—')}</td><td class="num ${(c.openDays || 0) > 7 ? 'late' : ''}">${c.repairDays ?? (c.openDays != null ? c.openDays + (lang() === 'en' ? 'd so far' : ' 天（进行中）') : '—')}</td><td class="num">${c.status === 'restocked' && (c.salePrice != null) ? `${money(c.salePrice)}<small>${esc(w(LISTING[c.listing]))}</small>` : '—'}</td></tr>`).join('') || `<tr><td colspan="10" class="wms-empty">${data.items.length ? tr('没有符合条件的记录。', 'No matching cases.') : tr('还没有退货记录。点右上角“登记退货”开始。', 'No returns yet. Use “Register a return” to start.')}</td></tr>`}
      </tbody></table></div></div>`;
  }

  /* Register a return (warehouse managers). */
  function newDialog() {
    const skus = data.skus.map(s => `<option value="${esc(s.sku)}">${esc(s.name)}</option>`).join('');
    const techs = data.technicians.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    const req = '<b class="rma-req" aria-hidden="true">*</b>';
    newPhotos = [];
    window.WorkOSUpload?.register('rma-new-photos', { lang:lang(), accept:IMG_MIME, multiple:true, maxBytes:5 * 1024 * 1024, onFiles:files => { newPhotos.push(...files); paintNewPhotos(); return tr(`已选 ${newPhotos.length} 张`, `${newPhotos.length} selected`); } });
    ctx.modal(tr('登记退货', 'Register a return'), `<form id="rma-new" class="wms-form" data-upload-scope="rma-new-photos">
      <div class="form-grid">
        <label class="field"><span>SKU</span><input name="sku" required list="rma-skus" autocomplete="off" placeholder="RE-XRF38"><datalist id="rma-skus">${skus}</datalist></label>
        <label class="field"><span>${tr('类别', 'Item class')}</span><select name="productClass" required data-rma-class><option value="">${tr('请选择', 'Choose')}</option>${Object.entries(CLASS).map(([k, v]) => `<option value="${k}">${esc(w(v))}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('序列号', 'Serial number')}</span><input name="serial" maxlength="80" placeholder="${tr('机器铭牌上的 SN（机器必填）', 'SN on the label (required for machines)')}"></label>
        <label class="field"><span>${tr('数量', 'Quantity')}</span><input name="qty" type="number" min="1" max="500" value="1" required></label>
        <label class="field"><span>${tr('收货日期', 'Received on')}</span><input name="receivedAt" type="date" required value="${today()}" max="${today()}"></label>
        <label class="field"><span>${tr('来源渠道（选填）', 'Channel (optional)')}</span><select name="channel"><option value="">—</option>${Object.entries(CHANNEL).map(([k, v]) => `<option value="${k}">${esc(w(v))}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('客户（选填）', 'Customer (optional)')}</span><input name="customer" maxlength="120"></label>
        <label class="field"><span>${tr('原订单号（选填）', 'Original order (optional)')}</span><input name="orderRef" maxlength="80" placeholder="#1001"></label>
        <label class="field full"><span>${tr('退货原因 + 退款情况描述', 'Return reason + refund details')}</span><textarea name="reason" required minlength="2" maxlength="2000" rows="3" placeholder="${tr('例如：开机不出光；已全额退款 $3,499', 'e.g. no laser output; refunded $3,499 in full')}"></textarea></label>
        <label class="field full"><span>${tr('退货外观与配件情况', 'Condition and accessories on return')}</span><input name="condition" required minlength="2" maxlength="1000" placeholder="${tr('例如：外箱破损，缺少排风管', 'e.g. box damaged, exhaust hose missing')}"></label>
        <fieldset class="field rma-choice"><legend>${tr('是否可以维修', 'Repairable?')} ${req}</legend><label><input type="radio" name="repairable" value="yes" required> ${tr('可维修', 'Repairable')}</label><label><input type="radio" name="repairable" value="no"> ${tr('不可维修', 'Not repairable')}</label></fieldset>
        <fieldset class="field rma-choice"><legend>${tr('翻新折扣', 'Refurbished discount')}</legend><label><input type="radio" name="discountPct" value="" checked> ${tr('暂不定', 'Later')}</label>${[10, 20, 30].map(n => `<label><input type="radio" name="discountPct" value="${n}"> ${n}% off</label>`).join('')}</fieldset>
        <label class="field"><span>${tr('维修人员（可稍后指定）', 'Technician (optional)')}</span><select name="technicianId"><option value="">${tr('稍后指定', 'Later')}</option>${techs}</select></label>
        <div class="field full"><span>${tr('上架照片', 'Listing photos')}</span><p class="wms-hint" style="margin:2px 0 6px">${tr('之后上架要用：请在光线好的地方、干净背景前拍正面、侧面和细节，画面清楚好看。', 'These are used for the listing: shoot the front, sides and details in good light on a clean background.')}</p>
          ${window.WorkOSUpload ? window.WorkOSUpload.html({ id:'rma-new-photos', lang:lang(), accept:IMG_MIME, multiple:true, maxBytes:5 * 1024 * 1024, hint:'PNG、JPG、WebP' }) : ''}<div class="rma-new-thumbs" data-rma-new-thumbs></div></div>
      </div><p class="wms-hint">${tr('SKU 规则：退货的 SKU 以 RE- 开头，后面接原产品型号，例如 RE-XRF38；物料表里还没有时，登记会自动新建。大货 SKU 照常从列表里选。', 'SKU rule: a return SKU starts with RE- followed by the original model, e.g. RE-XRF38; if it is not in the item list yet, registering creates it. Pick regular SKUs from the list.')}</p><p class="wms-error" role="alert"></p></form>`,
      `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="rma-new">${tr('登记', 'Register')}</button>`);
  }
  function paintNewPhotos() {
    const box = document.querySelector('[data-rma-new-thumbs]'); if (!box) return;
    box.innerHTML = newPhotos.map((f, i) => `<span class="rma-new-thumb"><img alt="" src="${URL.createObjectURL(f)}"><button type="button" class="icon-btn" data-rma-new-rm="${i}" aria-label="${tr('移除', 'Remove')}">×</button></span>`).join('');
  }


  /* Case detail. */
  async function openCase(id) {
    try { detail = await ctx.api.get('/rma/' + encodeURIComponent(id)); }
    catch (e) { ctx.toast?.(e.message || tr('读取失败', 'Could not load')); return; }
    drawDetail(true);
    loadPhotos();
  }
  async function loadPhotos() {
    for (const p of detail?.photos || []) {
      if (photoCache.has(p.id)) continue;
      try {
        const r = await fetch(`${apiBase()}/rma/${encodeURIComponent(detail.id)}/photos/${encodeURIComponent(p.id)}`, { credentials:'same-origin' });
        if (!r.ok) continue;
        const blob = await r.blob();
        const url = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(blob); });
        photoCache.set(p.id, url);
        const img = document.querySelector(`[data-rma-photo="${CSS.escape(p.id)}"]`); if (img) { img.src = url; img.closest('a')?.setAttribute('data-src', url); }
      } catch { /* leave placeholder */ }
    }
  }
  function photoGroup(kind) {
    const list = detail.photos.filter(p => p.kind === kind);
    return `<div class="rma-photos"><h4>${esc(w(PHOTO[kind]))} <small>${list.length}</small></h4><div class="rma-thumbs">${list.map(p => `<a class="rma-thumb" href="#" data-rma="zoom" data-id="${esc(p.id)}" title="${esc(p.name)} · ${esc(p.byName)}"><img data-rma-photo="${esc(p.id)}" alt="${esc(p.name)}" src="${esc(photoCache.get(p.id) || '')}"></a>`).join('')}
      ${detail.canWork ? `<label class="rma-add" data-rma-drop="${kind}">${icon('camera-plus')}<span>${tr('上传 / 粘贴 / 拖入', 'Upload, paste or drop')}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden data-rma-file="${kind}"></label>` : ''}</div></div>`;
  }
  function drawDetail(first) {
    const c = detail, open = OPEN.includes(c.status), opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
    const timeline = c.events.slice().reverse().map(e => `<li><b>${esc(e.byName)}</b> ${esc(eventText(e))} <time>${esc(when(e.at))}</time></li>`).join('');
    const body = `<div class="rma-detail" data-rma-case="${esc(c.id)}">
      <div class="rma-head">${badge(c.status)}<span class="mono">${esc(c.sku)}${c.qty > 1 ? ` × ${c.qty}` : ''}</span><span>${esc(c.name)}</span>${c.serial ? `<span class="mono">SN ${esc(c.serial)}</span>` : ''}</div>
      <dl class="rma-facts">
        <div><dt>${tr('类别', 'Item class')}</dt><dd>${c.productClass ? esc(w(CLASS[c.productClass])) : esc(w(KIND[c.kind]))}${c.channel ? ' · ' + esc(w(CHANNEL[c.channel])) : ''}${c.repairable ? ` · ${c.repairable === 'yes' ? tr('可维修', 'Repairable') : tr('不可维修', 'Not repairable')}` : ''}</dd></div>
        <div><dt>${tr('客户 / 订单', 'Customer / order')}</dt><dd>${esc(c.customer || '—')} ${esc(c.orderRef || '')}</dd></div>
        <div><dt>${tr('收货日期', 'Received')}</dt><dd>${esc(c.receivedAt)}</dd></div>
        <div><dt>${tr('维修完成', 'Repaired')}</dt><dd>${esc(c.repairedAt || '—')}</dd></div>
        <div><dt>${tr('维修用时', 'Repair time')}</dt><dd class="${(c.openDays || 0) > 7 ? 'late' : ''}">${c.repairDays != null ? tr(`${c.repairDays} 天`, `${c.repairDays} days`) : c.openDays != null ? tr(`已 ${c.openDays} 天（进行中）`, `${c.openDays} days so far`) : '—'}</dd></div>
        <div><dt>${tr('登记人', 'Registered by')}</dt><dd>${esc(c.createdByName)}</dd></div>
        <div class="full"><dt>${tr('退货原因 + 退款情况', 'Reason + refund')}</dt><dd>${esc(c.reason)}</dd></div>
        ${c.condition ? `<div class="full"><dt>${tr('退货外观与配件情况', 'Condition and accessories')}</dt><dd>${esc(c.condition)}</dd></div>` : ''}
      </dl>
      <section class="rma-sec"><h3>${icon('wrench')} ${tr('诊断与维修', 'Diagnosis & repair')}</h3>
        ${open && c.canWork ? `<form id="rma-work" class="form-grid">
          <label class="field"><span>${tr('维修人员', 'Technician')}</span>${c.canOperate ? `<select name="technicianId"><option value="">${tr('未指定', 'Not assigned')}</option>${(data?.technicians || []).map(t => opt(t.id, t.name, c.technicianId)).join('')}</select>` : `<input value="${esc(c.technicianName || '—')}" readonly>`}</label>
          <label class="field"><span>${tr('进度', 'Progress')}</span><select name="status">${['received', 'diagnosing', 'waiting_parts', 'repairing'].map(s => opt(s, w(STATUS[s]), c.status === 'repaired' ? 'repairing' : c.status)).join('')}</select></label>
          <label class="field full"><span>${tr('问题诊断', 'Diagnosis')}</span><textarea name="diagnosis" rows="3" maxlength="5000" placeholder="${tr('故障现象、检测结果、原因判断', 'Symptoms, tests, root cause')}">${esc(c.diagnosis)}</textarea></label>
          <label class="field"><span>${tr('更换的配件', 'Parts used')}</span><input name="partsUsed" maxlength="2000" value="${esc(c.partsUsed)}" placeholder="${tr('例如：激光管 ×1', 'e.g. laser tube ×1')}"></label>
          <label class="field"><span>${tr('维修记录', 'Repair notes')}</span><input name="repairNotes" maxlength="5000" value="${esc(c.repairNotes)}"></label>
          <div class="full rma-actions"><button class="btn" type="submit">${tr('保存', 'Save')}</button>${c.status !== 'repaired' ? `<span class="rma-sep"></span><label class="rma-inline">${tr('完成日期', 'Done on')} <input type="date" data-rma-repaired-date value="${today()}" min="${esc(c.receivedAt)}" max="${today()}"></label><button class="btn primary" type="button" data-rma="repaired">${icon('check-circle')} ${tr('标记维修完成', 'Mark repaired')}</button>` : ''}</div>
          <p class="wms-error" role="alert"></p></form>` : `<dl class="rma-facts"><div><dt>${tr('维修人员', 'Technician')}</dt><dd>${esc(c.technicianName || '—')}</dd></div><div><dt>${tr('更换的配件', 'Parts used')}</dt><dd>${esc(c.partsUsed || '—')}</dd></div><div class="full"><dt>${tr('问题诊断', 'Diagnosis')}</dt><dd>${esc(c.diagnosis || '—')}</dd></div><div class="full"><dt>${tr('维修记录', 'Repair notes')}</dt><dd>${esc(c.repairNotes || '—')}</dd></div></dl>`}
        <p class="wms-hint">${tr('标记维修完成前需要：指定维修人员、填写问题诊断、至少一张“维修后”照片。', 'Before marking repaired: a technician, a diagnosis and at least one after-repair photo.')}</p>
      </section>
      <section class="rma-sec"><h3>${icon('images')} ${tr('照片', 'Photos')}</h3>${['listing', 'received', 'diagnosis', 'repaired'].map(photoGroup).join('')}<p class="wms-error" data-rma-photo-error role="alert"></p></section>
      ${open && c.canOperate ? `<section class="rma-sec"><h3>${icon('flag-checkered')} ${tr('结案', 'Close the case')}</h3><form id="rma-close" class="form-grid">
        <label class="field"><span>${tr('处理结果', 'Outcome')}</span><select name="outcome"><option value="restock">${tr('退回库存', 'Back into stock')}</option><option value="scrap">${tr('报废', 'Scrap')}</option><option value="return_customer">${tr('修好寄回客户', 'Return to customer')}</option></select></label>
        <label class="field" data-rma-restock><span>${tr('成色', 'Grade')}</span><select name="grade">${Object.entries(GRADE).map(([k, v]) => opt(k, w(v), 'B')).join('')}</select></label>
        <label class="field" data-rma-restock><span>${tr('入库库位', 'Into location')}</span><select name="location">${(data?.locations || []).map(l => opt(l.id, lang() === 'en' ? l.en : l.zh, 'refurb')).join('')}</select></label>
        <label class="field"><span>${tr('备注', 'Note')}</span><input name="note" maxlength="1000"></label>
        <div class="full rma-actions"><button class="btn primary" type="submit">${tr('确认结案', 'Close case')}</button><span class="wms-hint">${tr('退回库存会自动生成一条库存入库流水（单号即 RMA 编号）。', 'Restocking records a goods-in movement with the RMA number.')}</span></div>
        <p class="wms-error" role="alert"></p></form></section>` : ''}
      ${c.status === 'restocked' ? `<section class="rma-sec"><h3>${icon('tag')} ${tr('翻新品销售', 'Refurbished sale')}</h3>${c.canPrice ? `<form id="rma-price" class="form-grid">
        <label class="field"><span>${tr('零售价 MSRP', 'MSRP')}</span><input value="${esc(money(c.msrp))}" readonly></label>
        <label class="field"><span>${tr('折扣（%）', 'Discount (%)')}</span><input name="discountPct" type="number" min="0" max="95" step="1" value="${c.discountPct ?? ''}" data-rma-pct></label>
        <label class="field"><span>${tr('售价（可直接填）', 'Sale price (or type it)')}</span><input name="salePrice" type="number" min="0" step="0.01" value="${c.salePrice ?? ''}" data-rma-price></label>
        <label class="field"><span>${tr('网站上架', 'Website listing')}</span><select name="listing">${Object.entries(LISTING).map(([k, v]) => opt(k, w(v), c.listing)).join('')}</select></label>
        <div class="full rma-actions"><button class="btn primary" type="submit">${tr('保存价格', 'Save price')}</button><span class="wms-hint">${tr('保存为“待上架”后，网站同事按这个价格上架翻新品；上架、售出后在这里更新状态。', 'Mark “To list” for the web team; update when listed or sold.')}</span></div>
        <p class="wms-error" role="alert"></p></form>` : `<dl class="rma-facts"><div><dt>${tr('售价', 'Price')}</dt><dd>${money(c.salePrice)}${c.discountPct != null ? ` (−${c.discountPct}%)` : ''}</dd></div><div><dt>${tr('网站上架', 'Listing')}</dt><dd>${esc(w(LISTING[c.listing]))}</dd></div></dl>`}</section>` : ''}
      <section class="rma-sec"><h3>${icon('clock-counter-clockwise')} ${tr('处理记录', 'History')}</h3><ul class="rma-timeline">${timeline}</ul></section>
    </div>`;
    if (first || !document.querySelector('[data-rma-case]')) { ctx.modal(`${esc(c.number)} · ${tr('退货维修', 'Return & repair')}`, body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`); document.querySelector('#overlay-root .modal')?.classList.add('modal-wide'); }
    else { const host = document.querySelector('[data-rma-case]'); host.outerHTML = body; }
    syncClose();
  }
  function eventText(e) {
    const a = e.action, n = e.note ? `：${e.note}` : '';
    if (a === 'created') return tr('登记退货', 'registered the return') + n;
    if (a === 'updated') return tr('更新了', 'updated ') + (lang() === 'en' ? (e.note || '') : String(e.note || '').replace(/status:(\w+)/, (_, x) => '进度（' + w(STATUS[x]) + '）').replace('technician', '维修人员').replace('diagnosis', '问题诊断').replace('repair notes', '维修记录').replace('parts', '配件').replace(/, /g, '、'));
    if (a === 'repaired') return tr('标记维修完成', 'marked it repaired') + n;
    if (a.startsWith('photo:')) return tr(`上传了${w(PHOTO[a.slice(6)])}照片`, `uploaded a ${w(PHOTO[a.slice(6)])} photo`);
    if (a.startsWith('closed:')) return ({ restock:tr('结案：退回库存', 'closed: back into stock'), scrap:tr('结案：报废', 'closed: scrapped'), return_customer:tr('结案：寄回客户', 'closed: returned to customer') })[a.slice(7)] + n;
    if (a === 'priced') return tr('设置售价 ', 'set the price ') + String(e.note || '').replace(/listing:(\w+)/, (_, x) => tr('上架：', 'listing: ') + w(LISTING[x]));
    return a + n;
  }
  function syncClose() { const f = document.getElementById('rma-close'); if (!f) return; const restock = f.outcome.value === 'restock'; f.querySelectorAll('[data-rma-restock]').forEach(x => { x.hidden = !restock; }); }
  async function refresh() { if (!detail) return; const id = detail.id; detail = await ctx.api.get('/rma/' + encodeURIComponent(id)); drawDetail(false); loadPhotos(); data = null; load(); }

  const b64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error(tr('照片读取失败', 'Could not read the photo'))); r.readAsDataURL(f); });
  async function upload(kind, files) {
    if (!detail || busy) return; const err = document.querySelector('[data-rma-photo-error]');
    const list = [...files].filter(f => /^image\/(png|jpeg|webp|gif)$/.test(f.type)); if (!list.length) { if (err) err.textContent = tr('只能上传 PNG、JPEG、WebP 或 GIF 图片。', 'Only PNG, JPEG, WebP or GIF images.'); return; }
    busy = true; let failed = '';
    for (const f of list) {
      if (f.size > 5 * 1024 * 1024) { failed = tr(`${f.name} 超过 5 MB`, `${f.name} is over 5 MB`); continue; }
      const name = f.name && f.name !== 'image.png' ? f.name : `${kind}-${Date.now()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
      try { await ctx.api.post(`/rma/${encodeURIComponent(detail.id)}/photos`, { kind, name, mime:f.type, dataBase64:await b64(f) }); } catch (e) { failed = e.message || tr('上传失败', 'Upload failed'); }
    }
    busy = false; await refresh();
    const e2 = document.querySelector('[data-rma-photo-error]'); if (e2) e2.textContent = failed;
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest?.('[data-rma]'); if (!el || !ctx) return;
    const a = el.dataset.rma;
    if (a === 'view') { ui.view = el.dataset.v; ctx.rerender(); return; }
    if (a === 'new') { newDialog(); return; }
    if (a === 'open') { openCase(el.dataset.id); return; }
    if (a === 'zoom') { e.preventDefault(); const src = photoCache.get(el.dataset.id); if (src) { const w2 = window.open(); if (w2) { w2.document.title = 'photo'; w2.document.body.style.margin = '0'; const im = w2.document.createElement('img'); im.src = src; im.style.maxWidth = '100%'; w2.document.body.appendChild(im); } } return; }
    if (a === 'repaired') {
      const f = document.getElementById('rma-work'), err = f?.querySelector('.wms-error'); const at = document.querySelector('[data-rma-repaired-date]')?.value || today();
      try { await saveWork(f, true); await ctx.api.post(`/rma/${encodeURIComponent(detail.id)}/repaired`, { repairedAt:at }); ctx.toast?.(tr('已标记维修完成', 'Marked repaired')); await refresh(); }
      catch (x) { if (err) err.textContent = x.message || tr('操作失败', 'Failed'); }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('.rma-row')) openCase(e.target.dataset.id); });
  document.addEventListener('input', e => {
    if (e.target.matches?.('[data-rma-search]')) { ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender(); const i = document.querySelector('[data-rma-search]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* ignore */ } } return; }
    if (e.target.matches?.('[data-rma-pct]') && detail?.msrp != null) { const p = Number(e.target.value); const price = e.target.form.querySelector('[data-rma-price]'); if (price && e.target.value !== '' && p >= 0 && p <= 95) price.value = (Math.round(detail.msrp * (100 - p)) / 100).toFixed(2); }
  });
  document.addEventListener('change', e => {
    if (e.target.matches?.('[data-rma-file]')) { upload(e.target.dataset.rmaFile, e.target.files); e.target.value = ''; return; }
    if (e.target.closest?.('#rma-close')) syncClose();
  });
  document.addEventListener('dragover', e => { const z = e.target.closest?.('[data-rma-drop]'); if (!z || !e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); z.classList.add('over'); });
  document.addEventListener('dragleave', e => { const z = e.target.closest?.('[data-rma-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  document.addEventListener('drop', e => { const z = e.target.closest?.('[data-rma-drop]'); if (!z || !e.dataTransfer?.files?.length) return; e.preventDefault(); z.classList.remove('over'); upload(z.dataset.rmaDrop, e.dataTransfer.files); });
  document.addEventListener('paste', e => {
    if (!document.querySelector('[data-rma-case]') || !detail?.canWork) return;
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')); if (!files.length) return;
    e.preventDefault();
    const kind = detail.status === 'received' ? 'received' : ['repairing', 'waiting_parts', 'repaired'].includes(detail.status) ? 'repaired' : 'diagnosis';
    upload(kind, files);
  });

  async function saveWork(f, quiet) {
    if (!f) return;
    const v = Object.fromEntries(new FormData(f)), body = {};
    if ('technicianId' in v && (v.technicianId || null) !== (detail.technicianId || null)) body.technicianId = v.technicianId || null;
    for (const k of ['diagnosis', 'partsUsed', 'repairNotes']) if (String(v[k] ?? '') !== String(detail[k] ?? '')) body[k] = String(v[k] || '').trim();
    if (v.status && v.status !== detail.status && !(detail.status === 'repaired' && v.status === 'repairing')) body.status = v.status;
    if (!Object.keys(body).length) { if (!quiet) ctx.toast?.(tr('没有修改', 'No changes')); return; }
    await ctx.api.post(`/rma/${encodeURIComponent(detail.id)}/update`, body);
    if (!quiet) { ctx.toast?.(tr('已保存', 'Saved')); await refresh(); }
  }
  // 机器 needs a serial: the field turns required when 机器 is picked.
  document.addEventListener('change', e => {
    const el = e.target; if (!el?.matches?.('[data-rma-class]')) return;
    const sn = el.form?.querySelector('[name="serial"]'), need = el.value === 'machine';
    if (sn) sn.required = need;
  });
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-rma-new-rm]'); if (!b) return;
    e.preventDefault(); newPhotos.splice(Number(b.dataset.rmaNewRm), 1); paintNewPhotos();
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || !['rma-new', 'rma-work', 'rma-close', 'rma-price'].includes(f.id)) return;
    e.preventDefault(); if (busy) return; busy = true;
    const err = f.querySelector('.wms-error'); if (err) err.textContent = '';
    try {
      if (f.id === 'rma-new') {
        const v = Object.fromEntries(new FormData(f));
        const r = await ctx.api.post('/rma', { sku:String(v.sku).trim(), serial:String(v.serial || '').trim() || undefined, qty:Number(v.qty) || 1, productClass:v.productClass, repairable:v.repairable, discountPct:v.discountPct ? Number(v.discountPct) : undefined, channel:v.channel || undefined, customer:String(v.customer || '').trim() || undefined, orderRef:String(v.orderRef || '').trim() || undefined, reason:String(v.reason).trim(), condition:String(v.condition || '').trim(), receivedAt:v.receivedAt, technicianId:v.technicianId || undefined });
        for (const f of newPhotos) { const name = f.name && f.name !== 'image.png' ? f.name : `listing-${Date.now()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`; await ctx.api.post(`/rma/${encodeURIComponent(r.id)}/photos`, { kind:'listing', name, mime:f.type, dataBase64:await b64(f) }).catch(() => {}); }
        newPhotos = [];
        ctx.closeOverlay(); ctx.toast?.(tr(`已登记 ${r.number}`, `Registered ${r.number}`)); busy = false; await openCase(r.id); data = null; load(); return;
      }
      if (f.id === 'rma-work') { busy = false; await saveWork(f, false); return; }
      if (f.id === 'rma-close') {
        const v = Object.fromEntries(new FormData(f)), restock = v.outcome === 'restock';
        await ctx.api.post(`/rma/${encodeURIComponent(detail.id)}/close`, { outcome:v.outcome, ...(restock ? { grade:v.grade, location:v.location } : {}), note:String(v.note || '').trim() || undefined });
        ctx.toast?.(restock ? tr('已退回库存，并记入库存流水', 'Back in stock; movement recorded') : tr('已结案', 'Case closed'));
      }
      if (f.id === 'rma-price') {
        const v = Object.fromEntries(new FormData(f));
        await ctx.api.post(`/rma/${encodeURIComponent(detail.id)}/price`, { discountPct:v.discountPct === '' ? null : Number(v.discountPct), salePrice:v.salePrice === '' ? null : Number(v.salePrice), listing:v.listing });
        ctx.toast?.(tr('价格已保存', 'Price saved'));
      }
      busy = false; await refresh();
    } catch (x) { if (err) err.textContent = x.message || tr('操作失败', 'Failed'); }
    finally { busy = false; }
  });

  window.WorkOSRma = { configure, reset, render };
})();
