'use strict';
/* Product library (产品资料库) — the 产品资料 tab under 产品与库存.
 * Built on the owner's spec 「OneLaser 产品资料库」: five product families, eight field groups, a requirement code per family,
 * five visibility levels, file slots, and a pricing worksheet with its 价格参数 settings. The server sends only what the
 * viewer may see (GET /products/library) and validates every save; this page renders it, saves each field as it changes,
 * and runs the admins' bulk template → upload → preview → confirm flow. No product data lives in this file. */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let ctx = null;
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const L = o => o ? (lang() === 'en' ? o.en || o.zh : o.zh) : '';
  const apiBase = () => (window.WORKOS_CONFIG && window.WORKOS_CONFIG.apiBase) || '/api';
  /* Dollars and cents (owner, 2026-11-12): $27.09 keeps its cents, whole amounts stay $4,999. */
  const usd = v => { if (v == null || !isFinite(v)) return '—'; const c = Math.round(Math.abs(v) * 100) / 100;
    return (v < 0 ? '−$' : '$') + c.toLocaleString('en-US', { minimumFractionDigits: c % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  const pct = v => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(1) + '%';
  const pct100 = v => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const kb = n => n == null ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const tone = (cmp, floor) => cmp == null ? '' : cmp < 0 ? 'bad' : floor != null && cmp < floor / 100 ? 'low' : 'good';
  // A save re-renders the page; the field the person moved on to keeps its focus and caret.
  const rerender = () => {
    const el = document.activeElement, id = el && el.closest?.('.pl') ? el.id || (el.dataset?.plF ? `[data-pl-f="${el.dataset.plF}"]` : '') : '';
    let pos = null; try { pos = el?.selectionStart ?? null; } catch { pos = null; }
    // Re-rendering replaces the list, so keep the place the user scrolled to (picking row 150 must not jump to row 1).
    const scrolls = [...document.querySelectorAll('.pl .pl-list, .pl .pl-editor')].map(n => n.scrollTop), winY = window.scrollY;
    ctx?.rerender?.();
    document.querySelectorAll('.pl .pl-list, .pl .pl-editor').forEach((n, i) => { if (scrolls[i] != null) n.scrollTop = scrolls[i]; });
    if (window.scrollY !== winY) window.scrollTo(window.scrollX, winY);
    if (!id) return;
    const n = id.startsWith('[') ? document.querySelector(id) : document.getElementById(id);
    if (n && n !== document.activeElement) { n.focus?.(); if (pos != null) try { n.setSelectionRange(pos, pos); } catch { /* not a text field */ } }
  };
  const toast = m => ctx?.toast?.(m);

  const S = { data:null, loading:false, error:'', view:'products', cur:null, q:'', fam:'', series:'', status:'', gt:'', brand:'', pmin:'', pmax:'', sort:'sku', dir:1, onlyReq:false, creating:false, saving:{}, errs:{}, savedAt:null,
    history:{}, histOpen:false, mode:'catalog', priceOpen:{}, preview:null, pvFilter:'all', skipErrors:false, imports:null, draft:null, busy:'', sel:new Set(), bulkKey:'', bulkVal:'', bulkNote:'' };
  const D = () => S.data || {};
  const spec = () => D().spec || { fields:[], slots:[], groups:[], families:[], statuses:[], visNames:{} };
  const viewer = () => D().viewer || { levels:['all'] };
  const sees = lv => (viewer().levels || []).includes(lv);
  const fieldOf = k => spec().fields.find(f => f.key === k);
  const items = () => D().items || [];
  const itemOf = sku => items().find(i => i.sku === sku);
  const famName = k => L(spec().families.find(f => f.key === k)) || '';
  const visChip = vis => `<span class="pl-vis ${esc(vis)}">${esc(L({ zh:spec().visNames?.[vis]?.[0], en:spec().visNames?.[vis]?.[1] }))}</span>`;
  const famCode = (code, fam) => { const i = spec().families.findIndex(f => f.key === fam); if (i < 0 || !code) return null; const c = code[i]; return c === 'r' ? 'req' : c === 'o' ? 'opt' : 'na'; };
  const badge = c => c === 'req' ? `<span class="pl-chip req">${tr('必填', 'Required')}</span>` : c === 'opt' ? '' : c === 'na' ? `<span class="pl-chip">${tr('不适用', 'N/A')}</span>` : '';
  const optLabel = (f, v) => { const o = (f?.opts || []).find(o => o.key === v); return o ? L(o) : v; };
  const show = (k, v) => { if (v == null || v === '') return tr('（空）', '(empty)'); const f = fieldOf(k); if (!f) return String(v); if (f.type === 'enum') return optLabel(f, v); if (f.type === 'price') return usd(Number(v)); if (f.type === 'number') return `${v} ${f.unit || ''}`.trim(); return String(v); };
  const fieldName = k => k.startsWith('file:') ? L(spec().slots.find(s => s.key === k.slice(5))) || k : L(fieldOf(k)) || ({ mainImage:tr('产品主图', 'Main image'), sku:'SKU' }[k] || k);

  function load(force) {
    if (!ctx?.api?.get || S.loading || (S.data && !force)) return;
    S.loading = true;
    ctx.api.get('/products/library').then(r => { S.data = r; S.error = ''; if (!S.cur || !itemOf(S.cur)) S.cur = [...(r.items || [])].sort((a, b) => a.sku.localeCompare(b.sku))[0]?.sku || null; })
      .catch(e => { S.error = e.message || tr('读取失败', 'Could not load'); }).finally(() => { S.loading = false; rerender(); });
  }
  const replaceItem = it => { const list = items(), i = list.findIndex(x => x.sku === it.sku); if (i >= 0) list[i] = { ...list[i], ...it }; else list.push(it); };

  /* ---------- bulk edit (owner, 2026-11-13): tick SKUs in the list, pick one field, one value for all ---------- */
  const NOT_BULK = new Set(['sku', 'refbSku', 'upc', 'nameZh', 'nameEn', 'mainImage']);
  const bulkFields = () => spec().fields.filter(f => f.writable && f.type !== 'image' && !NOT_BULK.has(f.key));
  function bulkBar() {
    const fields = bulkFields(), f = fieldOf(S.bulkKey), n = S.sel.size;
    const a = `id="pl-bulk-val" data-pl-bulkval`, v = S.bulkVal;
    const ctl = !f ? '' : f.type === 'enum' ? `<select ${a}><option value="">${tr('（清空）', '(clear)')}</option>${f.opts.map(o => `<option value="${esc(o.key)}" ${v === o.key ? 'selected' : ''}>${esc(L(o))}</option>`).join('')}</select>`
      : f.type === 'date' ? `<input type="date" ${a} value="${esc(v)}">`
      : f.type === 'list' ? `<input type="text" ${a} list="pl-bulk-dl" value="${esc(v)}" placeholder="${tr('留空 = 清空', 'empty = clear')}"><datalist id="pl-bulk-dl">${f.opts.map(o => `<option value="${esc(o.key)}">`).join('')}</datalist>`
      : `<input type="text" ${a} ${f.type === 'number' || f.type === 'price' ? 'inputmode="decimal"' : ''} value="${esc(v)}" placeholder="${tr('留空 = 清空', 'empty = clear')}">${f.unit || f.type === 'price' ? `<span class="pl-meta">${esc(f.unit || 'USD')}</span>` : ''}`;
    const needNote = S.bulkKey === 'status' && ['clearance', 'eol'].includes(S.bulkVal);
    return `<div class="pl-bulk" role="region" aria-label="${tr('批量修改', 'Bulk edit')}"><b>${tr(`已选 ${n} 个 SKU`, `${n} SKUs selected`)}</b>
      <select id="pl-bulk-key" data-pl-bulkkey aria-label="${tr('要修改的字段', 'Field to change')}"><option value="">${tr('选择要修改的字段…', 'Choose a field…')}</option>${fields.map(x => `<option value="${esc(x.key)}" ${S.bulkKey === x.key ? 'selected' : ''}>${esc(L(x))}</option>`).join('')}</select>
      ${ctl}${needNote ? `<input type="text" id="pl-bulk-note" data-pl-bulknote value="${esc(S.bulkNote)}" placeholder="${tr('原因（必填）', 'Reason (required)')}">` : ''}
      <button class="pl-btn primary" data-pl="bulk-apply" ${f ? '' : 'disabled'}>${tr('批量修改', 'Apply to all')}</button><button class="pl-link" data-pl="bulk-clear">${tr('取消选择', 'Clear selection')}</button></div>`;
  }
  async function bulkApply(btn) {
    const f = fieldOf(S.bulkKey); if (!f || !S.sel.size) return;
    const skus = [...S.sel], val = S.bulkVal.trim(), shown = val === '' ? tr('（清空）', '(clear)') : f.type === 'enum' ? L(f.opts.find(o => o.key === val)) : val;
    if (S.bulkKey === 'status' && ['clearance', 'eol'].includes(val) && !S.bulkNote.trim()) return toast(tr('转为停产清存或下架封存时，请填写原因', 'Give a reason for clearance or end of sale'));
    if (!window.confirm(tr(`把 ${skus.length} 个 SKU 的“${L(f)}”都改为“${shown}”？`, `Set “${L(f)}” to “${shown}” on ${skus.length} SKUs?`))) return;
    btn.disabled = true;
    try {
      const r = await ctx.api.post('/products/library/bulk-edit', { skus, values: { [f.key]: val === '' ? null : val }, ...(S.bulkNote.trim() ? { note: S.bulkNote.trim() } : {}) });
      toast(tr(`已修改 ${r.changed} 个 SKU${r.changed < r.skus ? `（${r.skus - r.changed} 个本来就是这个值）` : ''}`, `${r.changed} SKUs changed${r.changed < r.skus ? ` (${r.skus - r.changed} already had this value)` : ''}`));
      S.sel.clear(); S.bulkVal = ''; S.bulkNote = ''; load(true);
    } catch (x) { window.alert?.(x.message); btn.disabled = false; }
  }

  /* ---------- rail ---------- */
  /* Left half: the SKU list as a table with filters (family, series, status, new/returned, brand, MSRP range,
     incomplete only) and sortable columns; the right half is the selected product. */
  const msrpOf = i => { const m = i.pricing?.fixed?.[0]; return m ? m.price : i.pricing?.msrp ?? (i.values.msrp === '' || i.values.msrp == null ? null : Number(i.values.msrp)); };
  const nameOf = i => (lang() === 'en' ? i.values.nameEn : i.values.nameZh) || i.values.nameZh || i.values.nameEn || '';
  function filteredItems() {
    const q = S.q.trim().toLowerCase(), lo = S.pmin === '' ? null : Number(S.pmin), hi = S.pmax === '' ? null : Number(S.pmax);
    const list = items().filter(i => { const v = i.values, m = msrpOf(i);
      return (!S.fam || (S.fam === '-' ? !v.family : v.family === S.fam)) && (!S.series || v.series === S.series) && (!S.status || v.status === S.status)
        && (!S.gt || (v.goodsType || 'bulk') === S.gt) && (!S.brand || v.brand === S.brand) && (lo == null || (m != null && m >= lo)) && (hi == null || (m != null && m <= hi))
        && (!S.onlyReq || !i.completeness?.done) && (!q || [i.sku, v.nameZh, v.nameEn, v.series, v.brand, v.upc, v.refbSku].some(x => String(x || '').toLowerCase().includes(q))); });
    const key = i => S.sort === 'name' ? nameOf(i) : S.sort === 'fam' ? famName(i.values.family) + (i.values.series || '') : S.sort === 'status' ? String(i.values.status || '')
      : S.sort === 'msrp' ? msrpOf(i) ?? -1 : S.sort === 'cm' ? i.pricing?.fixed?.[0]?.cmPct ?? -999 : S.sort === 'req' ? (i.completeness?.need ? i.completeness.got / i.completeness.need : 1) : i.sku;
    return list.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'zh')) * S.dir; });
  }
  function rail() {
    const all = items(), list = filteredItems(), inc = all.filter(i => !i.completeness?.done).length;
    const uniq = k => [...new Set(all.map(i => i.values[k]).filter(Boolean))].sort();
    const statusName = k => L(spec().statuses.find(x => x.key === k)) || '';
    const gtOpts = fieldOf('goodsType')?.opts || [];
    const sel = (k, label, opts) => `<select data-pl-flt="${k}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${opts.map(([v, n]) => `<option value="${esc(v)}" ${S[k] === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    const active = S.q || S.fam || S.series || S.status || S.gt || S.brand || S.pmin !== '' || S.pmax !== '' || S.onlyReq;
    const th = (k, label, cls = '') => `<th class="${cls} ${S.sort === k ? 'sorted' : ''}" data-pl-sort="${k}">${label}${S.sort === k ? (S.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    const cmOn = sees('sens'), canBulk = bulkFields().length > 0;
    for (const k of [...S.sel]) if (!itemOf(k)) S.sel.delete(k);
    return `<aside class="pl-rail"><div class="head">
      <input type="search" data-pl-q placeholder="${tr('搜索 SKU、中英文名、系列、品牌、UPC', 'Search SKU, names, series, brand, UPC')}" value="${esc(S.q)}" aria-label="${tr('搜索产品', 'Search products')}">
      <div class="pl-flt">
        ${sel('fam', tr('全部产品族', 'All families'), [...spec().families.filter(f => all.some(i => i.values.family === f.key)).map(f => [f.key, L(f)]), ...(all.some(i => !i.values.family) ? [['-', tr('未设置产品族', 'No family')]] : [])])}
        ${sel('series', tr('全部系列', 'All series'), uniq('series').map(x => [x, x]))}
        ${sel('status', tr('全部状态', 'All statuses'), spec().statuses.filter(x => all.some(i => i.values.status === x.key)).map(x => [x.key, L(x)]))}
        ${sel('gt', tr('大货 + 退货', 'New + returned'), gtOpts.map(o => [o.key, L(o)]))}
        ${sel('brand', tr('全部品牌', 'All brands'), uniq('brand').map(x => [x, x]))}
        <label class="pl-price">MSRP $<input data-pl-p="pmin" inputmode="decimal" value="${esc(S.pmin)}" placeholder="${tr('最低', 'min')}" aria-label="${tr('最低 MSRP', 'Min MSRP')}">–<input data-pl-p="pmax" inputmode="decimal" value="${esc(S.pmax)}" placeholder="${tr('最高', 'max')}" aria-label="${tr('最高 MSRP', 'Max MSRP')}"></label>
      </div>
      <div class="pl-flt-foot"><label class="pl-chk"><input type="checkbox" data-pl-onlyreq ${S.onlyReq ? 'checked' : ''}> ${tr('仅看必填未完成', 'Only incomplete')} ${inc ? `<span class="pl-chip req">${tr(`${inc} 个待补`, `${inc} to fill`)}</span>` : ''}</label>
        <span class="pl-sp"></span><span class="pl-meta">${tr(`显示 ${list.length} / ${all.length} 个 SKU`, `${list.length} of ${all.length} SKUs`)}</span>${active ? `<button class="pl-link" data-pl="clear-filters">${tr('清除筛选', 'Clear')}</button>` : ''}</div>
    </div>${canBulk && S.sel.size ? bulkBar() : ''}<div class="pl-list">${list.length ? `<table class="pl-skus"><thead><tr>${canBulk ? `<th class="ck"><input type="checkbox" data-pl-selall ${list.every(i => S.sel.has(i.sku)) ? 'checked' : ''} aria-label="${tr('全选当前列表', 'Select all listed')}" title="${tr('全选当前筛选出的 SKU', 'Select every SKU in this list')}"></th>` : ''}${th('sku', 'SKU')}${th('name', tr('产品', 'Product'))}${th('fam', tr('产品族 / 系列', 'Family / series'))}${th('status', tr('状态', 'Status'))}${th('msrp', 'MSRP', 'num')}${cmOn ? th('cm', 'CM', 'num') : ''}${th('req', tr('必填', 'Req.'), 'num')}</tr></thead><tbody>
      ${list.map(i => { const v = i.values, m = i.pricing?.fixed?.[0], c = i.completeness || {}, other = lang() === 'en' ? v.nameZh : v.nameEn;
        return `<tr data-pl-pick="${esc(i.sku)}" aria-current="${i.sku === S.cur}" ${S.sel.has(i.sku) ? 'data-sel="1"' : ''}>${canBulk ? `<td class="ck"><input type="checkbox" data-pl-sel="${esc(i.sku)}" ${S.sel.has(i.sku) ? 'checked' : ''} aria-label="${tr(`选择 ${esc(i.sku)}`, `Select ${esc(i.sku)}`)}"></td>` : ''}<td class="sku">${c.done ? '' : `<span class="pl-dot" title="${tr('必填未完成', 'Required fields missing')}"></span>`}${esc(i.sku)}${v.goodsType === 'refb' ? ` <span class="pl-chip warn">${tr('退货', 'Ret.')}</span>` : ''}</td>
          <td class="nm">${esc(nameOf(i) || tr('未命名', 'Unnamed'))}${other && other !== nameOf(i) ? `<small>${esc(other)}</small>` : ''}</td>
          <td>${esc(famName(v.family) || '—')}${v.series ? `<small>${esc(v.series)}</small>` : ''}</td><td>${esc(statusName(v.status) || '—')}</td>
          <td class="num">${msrpOf(i) != null ? usd(msrpOf(i)) : '—'}</td>${cmOn ? `<td class="num ${m ? tone(m.cmPct, D().settings?.dtcFloor) : ''}">${m && m.cmPct != null ? pct(m.cmPct) : '—'}</td>` : ''}
          <td class="num ${c.done ? '' : 'miss'}">${c.need ? `${c.got}/${c.need}` : '—'}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="pl-empty">${S.onlyReq ? tr('没有必填未完成的产品', 'No incomplete products') : all.length ? tr('没有匹配的产品，试试清除筛选', 'No matching products; try clearing the filters') : tr('还没有产品。产品经理可以点“新建产品”录入第一个 SKU；有批量更新权限的同事可以下载标准模板，填好后点“批量更新”上传。', 'No products yet. Product managers can add the first SKU; people allowed to bulk-update can fill in the template and upload it with Bulk update.')}</div>`}</div></aside>`;
  }

  /* ---------- fields ---------- */
  function input(f, it) {
    const v = it.values[f.key], dis = f.writable ? '' : 'disabled', id = `pl-i-${f.key}`, a = `id="${id}" data-pl-f="${esc(f.key)}" ${dis}`;
    if (f.type === 'enum') return `<select ${a}><option value="">${tr('请选择', 'Choose')}</option>${f.opts.map(o => `<option value="${esc(o.key)}" ${v === o.key ? 'selected' : ''}>${esc(L(o))}</option>`).join('')}</select>`;
    if (f.type === 'date') return `<input type="date" ${a} value="${esc(v)}">`;
    if (f.type === 'number' || f.type === 'price') return `<div class="pl-affix"><input type="text" class="n" inputmode="decimal" ${a} value="${esc(v)}" placeholder="${esc(f.type === 'price' && !f.ph ? '0.00' : tr(f.ph, f.phEn || f.ph))}"${f.type === 'price' ? ` title="${tr('最多两位小数，例如 27.09', 'At most two decimals, e.g. 27.09')}"` : ''}><span>${esc(f.unit || 'USD')}</span></div>`;
    if (f.type === 'list') return `<input type="text" ${a} list="pl-dl-${esc(f.key)}" value="${esc(v)}" placeholder="${esc(tr(f.ph, f.phEn || f.ph))}"><datalist id="pl-dl-${esc(f.key)}">${f.opts.map(o => `<option value="${esc(o.key)}">`).join('')}</datalist>`;
    return `<input type="text" ${a} value="${esc(v)}" placeholder="${esc(tr(f.ph, f.phEn || f.ph))}">`;
  }
  function fieldHTML(f, it) {
    const fam = it.values.family, code = f.key === 'refbSku' ? (it.values.goodsType === 'refb' ? 'req' : 'na') : famCode(f.code, fam);
    const miss = (it.completeness?.missing || []).includes(f.key), err = S.errs[f.key];
    if (f.type === 'image') return `<div class="pl-fld wide ${code === 'na' ? 'na' : ''}"><label><b>${esc(L(f))}</b>${badge(code)}${visChip(f.vis)}</label>${imageBody(f, it)}</div>`;
    if (f.key === 'sku') return `<div class="pl-fld"><label><b>SKU</b>${badge(code)}${visChip(f.vis)}</label><input type="text" value="${esc(it.sku)}" disabled></div>`;
    if (f.key === 'refbSku' && it.values.goodsType !== 'refb') return `<div class="pl-fld na"><label><b>${esc(L(f))}</b>${visChip(f.vis)}</label><div class="pl-note">${tr('仅退货产品需要（以 REF- 开头）', 'Only for returned goods (starts with REF-)')}</div></div>`;
    return `<div class="pl-fld ${code === 'na' ? 'na' : ''} ${miss ? 'miss' : ''}"><label for="pl-i-${esc(f.key)}"><b>${esc(L(f))}</b>${badge(code)}${visChip(f.vis)}${S.saving[f.key] ? `<span class="pl-status">${tr('保存中…', 'Saving…')}</span>` : ''}</label>${input(f, it)}${err ? `<span class="err" role="alert">${esc(err)}</span>` : ''}</div>`;
  }
  function imageBody(f, it) {
    const m = it.mainImage;
    const img = m ? `<div class="pl-thumb"><img src="${apiBase()}/products/library/files/${encodeURIComponent(m.id)}" alt="${tr('产品主图', 'Main image')}"><div><div>${esc(m.name)}</div><div class="pl-meta">${kb(m.size)}</div>${f.writable ? `<button class="pl-x" data-pl-rmfile="${esc(m.id)}">${tr('删除', 'Delete')}</button>` : ''}</div></div>` : '';
    if (!f.writable) return img || `<div class="pl-note">${tr('未上传', 'Not uploaded')}</div>`;
    return img + (m ? '' : drop('mainImage', tr('PNG / JPG / WebP，建议白底 ≥ 2000 px', 'PNG / JPG / WebP, white background ≥ 2000 px'), '.png,.jpg,.jpeg,.webp', false));
  }
  const drop = (slot, hint, accept, multi) => `<label class="pl-drop">${S.busy === slot ? `<span class="t">${tr('正在上传…', 'Uploading…')}</span>` : `<span class="t">${tr('点击选择文件上传', 'Click to choose a file')}</span>`}<span class="h">${esc(hint)}</span><input type="file" data-pl-upload="${esc(slot)}" accept="${accept}" ${multi ? 'multiple' : ''}></label>`;
  function filesBody(it) {
    if (!sees('sens')) return `<div class="pl-lock">${tr('文件是敏感信息，只有有成本明细权限的同事可以查看和上传。', 'Files are sensitive: only colleagues with cost access can see and upload them.')}</div>`;
    const files = it.files || {};
    return `<div class="pl-fields pl-slots">${spec().slots.map(s => { const code = famCode(s.code, it.values.family), list = files[s.key] || [];
      return `<div class="pl-fld ${code === 'na' ? 'na' : ''} ${code === 'req' && !list.length ? 'miss' : ''}"><label><b>${esc(L(s))}</b>${badge(code)}${visChip('sens')}</label>
        ${list.length ? `<ul class="pl-files">${list.map(x => `<li><a href="${apiBase()}/products/library/files/${encodeURIComponent(x.id)}" target="_blank" rel="noopener">${esc(x.name)}</a><span class="pl-meta">${kb(x.size)}${x.at ? ' · ' + esc(String(x.at).slice(0, 10)) : ''}</span>${s.writable ? `<button class="pl-x" data-pl-rmfile="${esc(x.id)}">${tr('删除', 'Delete')}</button>` : ''}</li>`).join('')}</ul>` : ''}
        ${s.writable ? drop(s.key, tr(s.hint + '，单个文件 ≤ 20 MB', (s.hintEn || s.hint) + ', ≤ 20 MB each'), s.mode === 'pdf' ? '.pdf' : '.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt', true) : ''}</div>`; }).join('')}</div>
      <p class="pl-note pl-slots-note">${tr('可上传 PDF、图片（PNG / JPG / WebP）、CSV、TXT。Excel 和 Word 文件请先另存为 PDF 或 CSV。', 'PDF, images (PNG / JPG / WebP), CSV and TXT. Save Excel and Word files as PDF or CSV first.')}</p>`;
  }
  const grpHead = (no, name, extra = '') => `<summary><span class="no">${esc(no)}</span>${esc(name)} ${extra}</summary>`;
  const groupCount = (fs, it) => { const req = fs.filter(f => famCode(f.code, it.values.family) === 'req'); const got = req.filter(f => !(it.completeness?.missing || []).includes(f.key)).length; return it.values.family && req.length ? tr(`必填 ${got}/${req.length}`, `Required ${got}/${req.length}`) : tr(`${fs.length} 个字段`, `${fs.length} fields`); };

  /* ---------- pricing ---------- */
  const P = f => fieldOf(f);
  const pin = (k, it) => P(k) ? fieldHTML(P(k), it) : '';
  /** The company selling-cost rate from 价格参数 (percent), as the placeholder of a SKU's own rate. */
  const companyRate = kind => { const w = D().settings || {}, ov = w[kind + 'RateOverride'], items = w[kind + 'Items'] || [];
    return ov != null ? Number(ov) : items.length ? items.reduce((a, x) => a + (Number(x.pct) || 0), 0) : null; };
  const ratePin = (k, kind, it) => { const f = P(k); if (!f) return ''; const c = companyRate(kind);
    return fieldHTML({ ...f, ph: c == null ? tr('价格参数里还没有设置', 'Not set in price parameters') : tr(`默认 ${+c.toFixed(2)}%（价格参数）`, `Default ${+c.toFixed(2)}% (price parameters)`) }, it); };
  function retailHTML(g, it) {
    const name = L(g);
    if (it.values.family === 'mat') return `<details class="pl-grp">${grpHead(g.no, name, `<span class="cnt">${tr('内部物料不对外销售', 'Internal material is not sold')}</span>`)}</details>`;
    const pr = it.pricing || {}, s = D().settings || {};
    if (!sees('sens')) return `<details class="pl-grp" open>${grpHead(g.no, name)}<div class="pl-pm"><div class="pl-fields" style="padding:0">${pin('msrp', it)}${pin('map', it)}${pin('promoFloor', it)}</div>
      <div class="pl-calc">${[[tr('零售价 MSRP', 'MSRP'), pr.msrp], [tr('最低公开售价 MAP', 'MAP'), pr.map], [tr('官网促销底价', 'Promotion floor'), pr.promoFloor]].map(([k, v], i) => `<div class="pl-out ${i ? '' : 'key'}"><div class="k">${k}</div><div class="v">${usd(v)}</div></div>`).join('')}</div></div></details>`;
    const unset = '';
    const fx = pr.fixed || [], lbl = { msrp:tr('MSRP 贡献利润', 'MSRP contribution'), map:tr('MAP 贡献利润', 'MAP contribution'), promoFloor:tr('促销底价贡献利润', 'Promotion floor contribution') };
    return `<details class="pl-grp" open>${grpHead(g.no, name, `<span class="cnt">${tr('官网 DTC · 销售费率', 'DTC · selling-cost rate')} ${pct(pr.dtcRate)}</span>`)}<div class="pl-pm">${unset}
      <div><h4>${tr('成本', 'Cost')} ${visChip('sens')}<small>${tr('送达成本 = 到岸价 + 尾程运费；成本和利润只有成本权限的同事能看到', 'Delivered = landed + last mile; costs and margins are visible to cost access only')}</small></h4>
        <div class="pl-fields" style="padding:0">${pin('landed', it)}${pin('lastMile', it)}${ratePin('dtcRate', 'dtc', it)}</div>
        <div class="pl-calc" style="margin-top:10px"><div class="pl-out key"><div class="k">${tr('送达成本 Delivered', 'Delivered cost')}</div><div class="v">${usd(pr.delivered)}</div><div class="f">${tr('到岸价 + 尾程运费', 'Landed + last mile')}</div></div>
          <div class="pl-out"><div class="k">${tr('MSRP 贡献利润', 'MSRP contribution')}</div><div class="v">${usd(fx[0]?.cm)} <span style="font-size:13px">${pct(fx[0]?.cmPct)}</span></div><div class="f">${tr('售价 × (1 − 零售销售费率) − 送达成本', 'Price × (1 − retail rate) − delivered')}</div></div></div></div>
      <div><h4>${tr('零售档位', 'Retail tiers')} <small>${tr('建议零售价 = 送达成本 ÷ (1 − 销售费率 − 目标贡献利润率)，标价取最接近的 x99', 'Suggested = delivered ÷ (1 − selling rate − target CM), list price at the nearest x99')}</small></h4>
        <div class="pl-tbl"><table><thead><tr><th>${tr('档位', 'Tier')}</th><th>${tr('目标 CM', 'Target CM')}</th><th>${tr('理论售价', 'Theoretical')}</th><th>${tr('建议标价', 'List price')}</th><th>${tr('相当于 MSRP 折扣', 'Off MSRP')}</th><th>${tr('贡献利润', 'Contribution')}</th><th>${tr('适用', 'Use')}</th></tr></thead>
        <tbody>${(pr.retail || []).map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.cmTarget}%</td><td class="num">${usd(r.theory)}</td><td class="num"><b>${usd(r.list)}</b></td><td class="num">${r.offMsrp != null && r.offMsrp > 0.0005 ? pct(r.offMsrp) : '—'}</td><td class="num ${tone(r.cmPct, s.dtcFloor)}">${usd(r.cm)}<span class="p">${pct(r.cmPct)}</span></td><td class="l">${esc(r.use)}</td></tr>`).join('') || `<tr><td colspan="7" class="l">${tr('还没有设置零售档位', 'No retail tiers yet')}</td></tr>`}</tbody></table></div></div>
      <div><h4>${tr('定稿售价', 'Final prices')} ${visChip('all')}</h4><div class="pl-fields" style="padding:0">${pin('msrp', it)}${pin('map', it)}${pin('promoFloor', it)}</div>
        <div class="pl-calc" style="margin-top:10px">${fx.map(x => `<div class="pl-out ${x.key === 'msrp' ? 'key' : ''}"><div class="k">${lbl[x.key]}${visChip('sens')}</div><div class="v">${usd(x.cm)} <span style="font-size:13px">${pct(x.cmPct)}</span></div>${x.belowFloor ? `<div class="f bad">${tr(`低于官网底线 ${s.dtcFloor}%`, `Below the DTC floor ${s.dtcFloor}%`)}</div>` : s.dtcTarget ? `<div class="f">${tr(`官网常态目标 ${esc(s.dtcTarget)}%`, `DTC target ${esc(s.dtcTarget)}%`)}</div>` : ''}</div>`).join('')}</div></div>
      <div><h4>${tr('NPCR 价格阶梯', 'NPCR ladder')} <small>${tr('NPCR = 目标贡献利润率；同一利润率下零售、批发、Amazon/eBay 的理论价', 'NPCR = target contribution margin; retail, wholesale and Amazon/eBay prices at the same margin')}</small></h4>
        <div class="pl-tbl"><table><thead><tr><th>NPCR</th><th>${tr('零售理论价', 'Retail theory')}</th><th>${tr('零售建议标价', 'Retail list')}</th><th>${tr('销售费用', 'Selling cost')}</th><th>${tr('毛利', 'Gross')}</th><th>${tr('贡献利润', 'Contribution')}</th><th>${tr('批发价（经销商付运费）', 'Wholesale (dealer freight)')}</th><th>${tr('批发价（我们付运费）', 'Wholesale (our freight)')}</th><th>Amazon / eBay</th></tr></thead>
        <tbody>${(pr.npcr || []).map(r => `<tr><td class="num">${r.cm}%</td><td class="num">${usd(r.theory)}</td><td class="num"><b>${usd(r.list)}</b></td><td class="num">${usd(r.sellingCost)}</td><td class="num">${usd(r.gross)}</td><td class="num">${usd(r.contribution)}</td><td class="num">${usd(r.whDealerFreight)}</td><td class="num">${usd(r.whOurFreight)}</td><td class="num">${usd(r.marketplace)}</td></tr>`).join('') || `<tr><td colspan="9" class="l">${tr('还没有设置 NPCR 阶梯', 'No NPCR ladder yet')}</td></tr>`}</tbody></table></div></div>
    </div></details>`;
  }
  function wholesaleHTML(g, it) {
    const name = L(g);
    if (it.values.family === 'mat') return `<details class="pl-grp">${grpHead(g.no, name, `<span class="cnt">${tr('内部物料不对外销售', 'Internal material is not sold')}</span>`)}</details>`;
    const pr = it.pricing || {}, s = D().settings || {}, wf = it.values.whFreight === 'us' ? 'us' : 'dealer', canFreight = fieldOf('whFreight')?.writable;
    const note = `<p class="pl-note">${tr('单台由我们直接发货时，批发价另加尾程运费。经销商须用 ACH 或电汇付款。', 'When we ship a single unit, last-mile freight is added. Dealers pay by ACH or wire.')}</p>`;
    if (!sees('sens')) return `<details class="pl-grp" open>${grpHead(g.no, name)}<div class="pl-pm"><div class="pl-tbl"><table><thead><tr><th>${tr('档位', 'Tier')}</th><th>${tr('MSRP 折扣', 'Off MSRP')}</th><th>${tr('批发价', 'Wholesale')}</th></tr></thead><tbody>${(pr.wholesale || []).map(w => `<tr><td>${esc(w.name)}</td><td class="num">${w.discount != null ? w.discount.toFixed(1) + '%' : '—'}</td><td class="num"><b>${usd(w.price)}</b></td></tr>`).join('') || `<tr><td colspan="3" class="l">${tr('还没有设置批发档位', 'No wholesale tiers yet')}</td></tr>`}</tbody></table></div>${note}</div></details>`;
    const rows = (pr.wholesale || []).map((w, i) => { const f = fieldOf('whOv' + i), main = wf === 'dealer' ? [w.cmDealerFreight, w.cmDealerFreightPct] : [w.cmOurFreight, w.cmOurFreightPct], alt = wf === 'dealer' ? [w.cmOurFreight, w.cmOurFreightPct] : [w.cmDealerFreight, w.cmDealerFreightPct];
      return `<tr><td>${esc(w.name)}${w.floor ? ' ' + visChip('sens') : ''}</td><td class="num">${w.discount != null ? w.discount.toFixed(1) + '%' : '—'}</td><td class="num"><b>${usd(w.price)}</b></td>
        <td><input type="text" class="n" inputmode="decimal" style="width:96px" data-pl-f="whOv${i}" value="${esc(it.values['whOv' + i])}" placeholder="${tr('自动', 'Auto')}" ${f?.writable ? '' : 'disabled'} aria-label="${esc(w.name)} ${tr('批发价手动调整', 'override')}"></td>
        <td class="num">${usd(w.dealerMargin)}<span class="p">${pct(w.dealerMarginPct)}</span></td><td class="num ${tone(main[1], s.whFloor)}">${usd(main[0])}<span class="p">${pct(main[1])}</span></td><td class="num" style="color:var(--pl-mute)">${usd(alt[0])}<span class="p">${pct(alt[1])}</span></td></tr>`; }).join('');
    return `<details class="pl-grp" open>${grpHead(g.no, name, `<span class="cnt">${tr('经销商 · 批发费率', 'Dealers · wholesale rate')} ${pct(pr.whRate)}</span>`)}<div class="pl-pm"><div>
      <h4>${tr('批发档位', 'Wholesale tiers')} <span class="pl-seg" role="group" aria-label="${tr('运费承担方', 'Freight paid by')}"><button data-pl-freight="dealer" aria-pressed="${wf === 'dealer'}" ${canFreight ? '' : 'disabled'}>${tr('经销商付运费', 'Dealer pays freight')}</button><button data-pl-freight="us" aria-pressed="${wf === 'us'}" ${canFreight ? '' : 'disabled'}>${tr('我们付运费', 'We pay freight')}</button></span>
        <small>${tr('批发价 = MSRP × (1 − 折扣)，全员可见；贡献利润只有成本权限的同事能看到', 'Wholesale = MSRP × (1 − discount), visible to everyone; margins to cost access only')}</small></h4>
      ${P('whRate') ? `<div class="pl-fields" style="padding:0 0 10px">${ratePin('whRate', 'wh', it)}</div>` : ''}
      <div class="pl-tbl"><table><thead><tr><th>${tr('档位', 'Tier')}</th><th>${tr('折扣', 'Discount')}</th><th>${tr('批发价', 'Wholesale')}</th><th>${tr('手动调整', 'Override')}</th><th>${tr('经销商每台利润', 'Dealer margin / unit')}</th><th>${tr(`我们的贡献利润（${wf === 'dealer' ? '经销商付运费' : '我们付运费'}）`, `Our contribution (${wf === 'dealer' ? 'dealer freight' : 'our freight'})`)}</th><th>${tr('另一种运费方式', 'Other freight option')}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="l">${tr('还没有设置批发档位', 'No wholesale tiers yet')}</td></tr>`}</tbody></table></div>${note}</div></div></details>`;
  }

  /* ---------- editor ---------- */
  function editor() {
    if (S.creating) return createForm();
    const it = itemOf(S.cur);
    if (!it) return `<div class="pl-card pl-empty">${tr('还没有选中产品。在左侧选择一个产品，或点“新建产品”。', 'No product selected. Pick one on the left, or add a new product.')}</div>`;
    const c = it.completeness || { need:0, got:0 }, v = it.values, fs = spec().fields;
    const pending = (it.pendingPrices || []).map(p => `<span class="pl-chip warn">${esc(fieldName(p.target === 'promo_floor' ? 'promoFloor' : /^wh\d+$/.test(p.target) ? 'whOv' + p.target.slice(2) : p.target))} ${usd(p.price)} ${tr('待审批', 'awaiting approval')}</span>`).join('');
    const status = spec().statuses.find(s => s.key === v.status);
    const sum = `<div class="pl-card pl-summary"><div style="min-width:0"><h2>${esc(it.sku)} <span style="font-weight:500;color:var(--pl-mute);font-size:15px">${esc(v.nameZh || v.nameEn || '')}</span></h2>
      <div class="sub">${v.family ? `<span class="pl-chip">${esc(famName(v.family))}</span>` : `<span class="pl-chip warn">${tr('先选择产品族', 'Choose a family first')}</span>`}${status ? `<span class="pl-chip ${v.status === 'live' ? 'ok' : ''}">${esc(L(status))}</span>` : ''}${v.goodsType === 'refb' ? `<span class="pl-chip warn">${tr('退货', 'Returned')}</span>` : ''}
      ${v.family ? `<span>${tr(`必填 ${c.got} / ${c.need}`, `Required ${c.got} / ${c.need}`)}</span><span class="pl-meter" aria-hidden="true"><i style="width:${c.need ? Math.round(c.got / c.need * 100) : 0}%"></i></span>` : ''}
      ${it.duplicate ? `<span class="pl-chip req">${tr('SKU 与其他产品重复（只差大小写）', 'SKU duplicates another product (letter case only)')}</span>` : ''}${pending}</div></div>
      <div>${!viewer().editCatalog && !viewer().editCost && !viewer().editPrices ? '' : `<span class="pl-status ${Object.keys(S.errs).length ? 'err' : 'ok'}">${Object.values(S.saving).some(Boolean) ? tr('保存中…', 'Saving…') : Object.keys(S.errs).length ? tr('有字段没有保存，请看红色提示', 'Some fields were not saved; see the red notes') : S.savedAt ? tr(`已自动保存 ${S.savedAt}`, `Saved automatically ${S.savedAt}`) : tr('修改会自动保存', 'Changes save automatically')}</span>`}${viewer().editCatalog && S.view !== 'pricing' ? `<button type="button" class="pl-btn small pl-del" data-pl-delprod="${esc(it.sku)}" title="${tr('删除这个产品（已有库存、订单或退货记录的产品不能删除，请改为“下架封存”）', 'Delete this product (a product with stock, orders or returns cannot be deleted; set it to Delisted)')}">${tr('删除产品', 'Delete product')}</button>` : ''}</div></div>`;
    // 定价 page: the product's basic facts, then cost (landed + last mile) and the NPCR price calculation; edits save to
    // the same product record, so a new MSRP here is the MSRP in 产品资料 too.
    if (S.mode === 'pricing') {
      const pg = no => spec().groups.find(g => g.no === no);
      return sum + basicEdit(it) + (pg('4') ? retailHTML({ ...pg('4'), no:'2', zh:'定价（零售）', en:'Pricing (retail)' }, it) : '')
        + (pg('5') ? wholesaleHTML({ ...pg('5'), no:'3', zh:'定价（批发）', en:'Pricing (wholesale)' }, it) : '');
    }
    // 产品资料 page (owner, 2026-11-12): only three prices — landed cost, last mile and MSRP. Selling-cost rates, tiers, NPCR and
    // wholesale are worked out on the 定价 page.
    const groups = [...spec().groups].sort((a, b) => Number(a.disp || a.no) - Number(b.disp || b.no)).map(g0 => {
      const g = { ...g0, show: g0.disp || g0.no };
      if (g.no === '5') return '';
      if (g.no === '4') {
        const list = ['landed', 'lastMile', 'msrp'].map(k => fieldOf(k)).filter(Boolean);
        return list.length ? `<details class="pl-grp" open>${grpHead(g.show, L(g), `<span class="cnt">${groupCount(list, it)} ${tr('· 定价计算在“定价”页', '· pricing is worked out on the Pricing page')}</span>`)}<div class="pl-fields">${list.map(f => fieldHTML(f, it)).join('')}</div></details>` : '';
      }
      const list = fs.filter(f => f.group === g.no && !(g.no === '4' || f.key.startsWith('whOv') || f.key === 'whFreight'));
      const body = `<div class="pl-fields">${list.map(f => fieldHTML(f, it)).join('')}</div>`;
      if (g.no === '3') return `<details class="pl-grp" open>${grpHead(g.show, L(g), `<span class="cnt">${groupCount(list, it)}</span>`)}${body}<div class="pl-subhead">${tr('文件上传', 'Files')} ${visChip('sens')}</div>${filesBody(it)}</details>`;
      if (!list.length) return '';
      return `<details class="pl-grp" open>${grpHead(g.show, L(g), `<span class="cnt">${groupCount(list, it)}</span>`)}${body}</details>`;
    }).join('');
    return sum + groups + historyHTML(it);
  }
  /** 定价 page: the product's basic details, editable here too (owner, 2026-11-12); who may change them follows 产品资料 access. */
  function basicEdit(it) {
    const list = ['goodsType', 'family', 'series', 'nameZh', 'nameEn', 'brand', 'status'].map(k => fieldOf(k)).filter(Boolean);
    return `<details class="pl-grp pl-basic" open>${grpHead('1', tr('基本信息', 'Basic details'), `<span class="cnt">${tr('和“产品资料”是同一份，改了两边一起变', 'Same record as Products: a change shows on both pages')}</span>`)}<div class="pl-fields">${list.map(f => fieldHTML(f, it)).join('')}</div></details>`;
  }
  function historyHTML(it) {
    const h = S.history[it.sku], src = { create:tr('新建', 'created'), edit:tr('编辑', 'edit'), import:tr('批量导入', 'import'), undo:tr('撤销导入', 'undo'), price:tr('价格', 'price'), status:tr('状态', 'status') };
    const st = { pending:tr('待审批', 'pending'), rejected:tr('已驳回', 'rejected'), applied:'', superseded:tr('已被替代', 'superseded'), withdrawn:tr('已撤回', 'withdrawn') };
    return `<details class="pl-grp" data-pl-history ${S.histOpen ? 'open' : ''}>${grpHead('#', tr('修改记录', 'Edit history'), `<span class="cnt">${tr('只显示你有权限查看的字段', 'Only fields you may see')}</span>`)}
      ${!S.histOpen ? '' : !h ? `<p class="pl-note" style="padding:0 16px 14px">${tr('读取中…', 'Loading…')}</p>` : h.length ? `<ul class="pl-hist">${h.slice(0, 100).map(x => `<li><span class="when">${esc(new Date(x.at).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN'))}</span><span>${esc(x.actor || '')}</span><b>${esc(fieldName(x.field))}</b><span><span class="pl-old">${esc(show(x.field, x.from))}</span> → <span class="pl-new">${esc(show(x.field, x.to))}</span></span><span class="pl-meta">${esc(src[x.source] || x.source)}${x.status && st[x.status] ? ' · ' + esc(st[x.status]) : ''}</span></li>`).join('')}</ul>` : `<p class="pl-note" style="padding:0 16px 14px">${tr('还没有修改记录', 'No changes yet')}</p>`}</details>`;
  }
  function createForm() {
    const fam = spec().families;
    return `<div class="pl-card" id="pl-new"><h3>${tr('新建产品', 'New product')}</h3><p class="d">${tr('先填 SKU、产品族和中英文名；其余字段创建后在编辑页补齐，修改会自动保存。', 'Start with the SKU, family and names; fill in the rest on the product page, which saves automatically.')}</p>
      <div class="pl-fields" style="padding:0"><div class="pl-fld"><label><b>SKU</b></label><input type="text" data-pl-new="sku" placeholder="${esc(fieldOf('sku')?.ph || '')}"></div>
      <div class="pl-fld"><label><b>${tr('产品族', 'Family')}</b></label><select data-pl-new="family"><option value="">${tr('请选择', 'Choose')}</option>${fam.map(f => `<option value="${esc(f.key)}">${esc(L(f))}</option>`).join('')}</select></div>
      <div class="pl-fld"><label><b>${tr('中文名', 'Chinese name')}</b></label><input type="text" data-pl-new="nameZh"></div><div class="pl-fld"><label><b>${tr('英文名', 'English name')}</b></label><input type="text" data-pl-new="nameEn"></div></div>
      ${S.errs._new ? `<p class="pl-note" style="color:var(--pl-req)" role="alert">${esc(S.errs._new)}</p>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px"><button class="pl-btn primary" data-pl="create">${tr('创建', 'Create')}</button><button class="pl-btn" data-pl="create-cancel">${tr('取消', 'Cancel')}</button></div></div>`;
  }

  /* ---------- 价格参数 ---------- */
  const blankSettings = () => ({ dtcItems:[], whItems:[], mktExtra:null, retailTiers:[], whTiers:[], npcr:[], dtcTarget:'', dtcFloor:null, whTarget:'', whFloor:null, dtcRateOverride:null, whRateOverride:null });
  function settingsView() {
    const s = S.draft || (S.draft = JSON.parse(JSON.stringify({ ...blankSettings(), ...(D().settings || {}) })));
    delete s.updatedAt; delete s.configured;
    const dis = viewer().canEditSettings ? '' : 'disabled', sumOf = a => a.reduce((n, x) => n + (Number(x.pct) || 0), 0);
    const num = (path, v, w = 64) => `<input type="text" class="n" style="width:${w}px" data-pl-s="${path}" value="${v ?? ''}" ${dis} placeholder="—">`;
    const txt = (path, v, w = 150) => `<input type="text" class="w" style="width:${w}px" data-pl-s="${path}" value="${esc(v ?? '')}" ${dis}>`;
    const rm = (key, i) => dis ? '' : `<button class="pl-x" data-pl-srm="${key}.${i}" aria-label="${tr('删除这一行', 'Remove row')}">×</button>`;
    const add = key => dis ? '' : `<button class="pl-btn small" data-pl-sadd="${key}">＋ ${tr('添加一行', 'Add row')}</button>`;
    const items = (key, title) => `<div><div class="pl-tbl"><table><thead><tr><th>${title}</th><th>${tr('费率 %', 'Rate %')}</th><th></th></tr></thead><tbody>${s[key].map((r, i) => `<tr><td>${txt(`${key}.${i}.name`, r.name)}</td><td>${num(`${key}.${i}.pct`, r.pct)}</td><td>${rm(key, i)}</td></tr>`).join('')}<tr><td><b>${tr('合计', 'Total')}</b></td><td class="num"><b>${sumOf(s[key]).toFixed(1)}%</b></td><td></td></tr></tbody></table></div>${add(key)}</div>`;
    const dr = s.dtcRateOverride != null ? s.dtcRateOverride : s.dtcItems.length ? sumOf(s.dtcItems) : null, wr = s.whRateOverride != null ? s.whRateOverride : s.whItems.length ? sumOf(s.whItems) : null;
    return `${D().settings?.configured ? '' : `<div class="pl-notice">${tr('价格参数还是空的。请主管理员录入一次公司的真实费率、档位和目标（只保存在系统数据库里，代码仓库里没有这些数字）。', 'Pricing settings are empty. A main admin enters the real rates, tiers and targets once (they are stored only in the system database, never in the code repository).')}</div>`}
    <div class="pl-settings">
      <div class="pl-card"><h3>${tr('销售费率', 'Selling-cost rates')}</h3><p class="d">${tr('按售价百分比计的变动销售费用。改动后所有产品的建议价自动重算。', 'Variable selling costs as a share of price. Every product’s suggested prices follow.')}</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">${items('dtcItems', tr('官网零售 DTC', 'Retail DTC'))}${items('whItems', tr('批发 Wholesale', 'Wholesale'))}</div>
        <p class="pl-note" style="margin-top:10px">${tr('手动设定合计费率（可选，留空 = 用明细合计）：零售', 'Manual total rate (optional; blank = sum of items): retail')} ${num('dtcRateOverride', s.dtcRateOverride)} % · ${tr('批发', 'wholesale')} ${num('whRateOverride', s.whRateOverride)} %</p>
        <p class="pl-note">${tr('Amazon / eBay 在官网基础上再加', 'Amazon / eBay add on top of DTC')} ${num('mktExtra', s.mktExtra)} %</p></div>
      <div class="pl-card"><h3>${tr('零售档位（按贡献利润率）', 'Retail tiers (by contribution margin)')}</h3><p class="d">${tr('官网常态目标', 'DTC target')} ${txt('dtcTarget', s.dtcTarget, 70)} %，${tr('底线', 'floor')} ${num('dtcFloor', s.dtcFloor, 52)} %</p>
        <div class="pl-tbl"><table><thead><tr><th>${tr('档位', 'Tier')}</th><th>${tr('贡献利润率 %', 'CM %')}</th><th>${tr('适用', 'Use')}</th><th></th></tr></thead><tbody>${s.retailTiers.map((r, i) => `<tr><td>${txt(`retailTiers.${i}.name`, r.name)}</td><td>${num(`retailTiers.${i}.cm`, r.cm)}</td><td>${txt(`retailTiers.${i}.use`, r.use)}</td><td>${rm('retailTiers', i)}</td></tr>`).join('')}</tbody></table></div>${add('retailTiers')}</div>
      <div class="pl-card"><h3>${tr('批发档位（按采购量）', 'Wholesale tiers (by volume)')}</h3><p class="d">${tr('批发常态目标', 'Wholesale target')} ${txt('whTarget', s.whTarget, 70)} %，${tr('底线', 'floor')} ${num('whFloor', s.whFloor, 52)} %。${tr('折扣以 MSRP 为基准；勾选“底线档”的档位只有成本权限的同事能看到。', 'Discounts are off MSRP; a floor tier is visible to cost access only.')}</p>
        <div class="pl-tbl"><table><thead><tr><th>${tr('档位', 'Tier')}</th><th>${tr('MSRP 折扣 %', 'Off MSRP %')}</th><th>${tr('底线档', 'Floor tier')}</th><th></th></tr></thead><tbody>${s.whTiers.map((r, i) => `<tr><td>${txt(`whTiers.${i}.name`, r.name)}</td><td>${num(`whTiers.${i}.discount`, r.discount)}</td><td><input type="checkbox" data-pl-s="whTiers.${i}.floor" ${r.floor ? 'checked' : ''} ${dis}></td><td>${rm('whTiers', i)}</td></tr>`).join('')}</tbody></table></div>${add('whTiers')}</div>
      <div class="pl-card"><h3>${tr('NPCR 价格阶梯', 'NPCR ladder')}</h3><p class="d">${tr('每个产品都会按这些目标贡献利润率算出零售、批发和 Amazon/eBay 理论价。用逗号分隔。', 'Each product gets retail, wholesale and Amazon/eBay prices at these target margins. Comma-separated.')}</p>
        <input type="text" data-pl-s="npcr" value="${esc(s.npcr.join(', '))}" ${dis}>
        <div class="pl-formula" style="margin-top:14px"><b>${tr('建议零售价', 'Suggested retail')}</b> = ${tr('送达成本', 'delivered')} ÷ (1 − ${dr != null ? dr.toFixed(1) + '%' : tr('零售费率', 'retail rate')} − ${tr('目标 CM', 'target CM')})<br><b>${tr('建议批发价', 'Suggested wholesale')}</b> = ${tr('批发成本', 'wholesale cost')} ÷ (1 − ${wr != null ? wr.toFixed(1) + '%' : tr('批发费率', 'wholesale rate')} − ${tr('目标 CM', 'target CM')})<br>${tr('经销商付运费时，批发成本 = 到岸价；我们付运费时 = 送达成本', 'Dealer pays freight: wholesale cost = landed; we pay: delivered')}<br><b>${tr('贡献利润', 'Contribution')}</b> = ${tr('售价 × (1 − 销售费率) − 成本', 'price × (1 − rate) − cost')}<br>${tr('标价取最接近的 x99（例：$6,036 → $5,999）', 'List prices at the nearest x99 (e.g. $6,036 → $5,999)')}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:14px">${viewer().canEditSettings ? `<button class="pl-btn primary" data-pl="settings-save">${tr('保存价格参数', 'Save settings')}</button><button class="pl-btn" data-pl="settings-reset">${tr('放弃修改', 'Discard changes')}</button>` : `<span class="pl-note">${tr('只有主管理员可以修改价格参数。', 'Only main admins change the settings.')}</span>`}</div></div>
    </div>`;
  }

  /* ---------- bulk import (main admins) ---------- */
  const STATUS_LABEL = { new:['新增', 'New'], update:['更新', 'Update'], same:['无变化', 'No change'], error:['有错误', 'Error'] };
  function importView() {
    const p = S.preview;
    if (!p) return '';
    const a = p.analysis, t = a.totals, c = a.completeness;
    const list = p.results.filter(r => S.pvFilter === 'all' || r.status === S.pvFilter);
    const kpi = (k, v, cls = '') => `<div class="pl-out ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const priceRow = (name, x) => `<tr><td>${esc(name)}</td><td class="num">${x.changed}</td><td class="num">${pct100(x.avgPct)}</td><td class="num">${x.max ? `${pct100(x.max.pct)} <span class="p">${esc(x.max.sku)}</span>` : '—'}</td></tr>`;
    const st = Object.entries(a.statusChanges || {});
    const statusName = k => L(spec().statuses.find(s => s.key === k)) || tr('未标注', 'unlabeled');
    const m = a.margins;
    return `<div class="pl-card"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between"><h3>${tr('更新前后对比与分析', 'Before / after and analysis')} · ${esc(p.fileName)}</h3>
        <div style="display:flex;gap:8px"><button class="pl-btn" data-pl="report">${tr('下载预览报告', 'Download report')}</button><button class="pl-btn" data-pl="preview-cancel">${tr('取消，不更新', 'Cancel')}</button></div></div>
      <p class="d">${tr('以下是预览，系统还没有写入任何数据；点“确认更新”才会写入。空白 = 不修改，[清空] = 清空，上传不会删除产品。', 'This is a preview; nothing is written until you click Confirm. Blank = no change, [清空] = clear; uploads never delete products.')}${p.ignoredColumns?.length ? ' ' + tr(`已忽略无法识别的列：${p.ignoredColumns.join('、')}`, `Ignored unknown columns: ${p.ignoredColumns.join(', ')}`) : ''}</p>
      <div class="pl-kpis">${kpi(tr('总行数', 'Rows'), t.rows)}${kpi(tr('新增', 'New'), t.new, t.new ? 'key' : '')}${kpi(tr('更新', 'Updated'), t.update, t.update ? 'key' : '')}${kpi(tr('无变化', 'No change'), t.same)}${kpi(tr('有错误', 'Errors'), t.error)}${kpi(tr('字段变化', 'Field changes'), t.fieldChanges)}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
        <div><h4>${tr('必填完整度', 'Required completeness')}</h4><p>${c.before.pct != null ? c.before.pct.toFixed(1) + '%' : '—'} → <b>${c.after.pct != null ? c.after.pct.toFixed(1) + '%' : '—'}</b> · ${tr(`完整的产品 ${c.before.complete} → ${c.after.complete} 个`, `complete products ${c.before.complete} → ${c.after.complete}`)}</p>
          <h4>${tr('生命周期状态变化', 'Lifecycle changes')}</h4>${st.length ? `<ul class="pl-hist" style="padding:0">${st.map(([k, n]) => { const [f, to] = k.split('→'); return `<li>${esc(statusName(f))} → ${esc(statusName(to))}：<b>${n}</b></li>`; }).join('')}</ul>` : `<p class="pl-note">${tr('没有状态变化', 'No status changes')}</p>`}
          <h4>${tr('新增产品（按产品族）', 'New products by family')}</h4>${Object.keys(a.newByFamily || {}).length ? `<p>${Object.entries(a.newByFamily).map(([k, n]) => `${esc(famName(k) || k)} ${n}`).join(' · ')}</p>` : `<p class="pl-note">${tr('没有新增', 'None')}</p>`}</div>
        <div><h4>${tr('价格变化', 'Price changes')}</h4><div class="pl-tbl"><table><thead><tr><th>${tr('价格', 'Price')}</th><th>${tr('变化个数', 'Changed')}</th><th>${tr('平均变化', 'Average')}</th><th>${tr('最大变化', 'Largest')}</th></tr></thead><tbody>
          ${priceRow('MSRP', a.prices.msrp)}${priceRow('MAP', a.prices.map)}${(a.prices.wholesale || []).map(w => priceRow(tr('批发 · ', 'Wholesale · ') + w.name, w)).join('')}</tbody></table></div>
          ${m ? `<h4 style="margin-top:12px">${tr('贡献利润', 'Contribution margin')} ${visChip('sens')}</h4><p>${tr('改动产品的 MSRP 贡献利润率（平均）', 'MSRP margin of changed products (average)')}：${m.msrpCmPct.before != null ? m.msrpCmPct.before.toFixed(1) + '%' : '—'} → <b>${m.msrpCmPct.after != null ? m.msrpCmPct.after.toFixed(1) + '%' : '—'}</b></p>
            <p>${tr('低于官网底线的 SKU', 'SKUs below the DTC floor')}：${m.belowFloor.before.dtc ?? '—'} → <b>${m.belowFloor.after.dtc ?? '—'}</b> · ${tr('低于批发底线的 SKU', 'below the wholesale floor')}：${m.belowFloor.before.wholesale ?? '—'} → <b>${m.belowFloor.after.wholesale ?? '—'}</b>${m.floors.dtc == null ? `<br><span class="pl-note">${tr('价格参数里还没有底线，无法判断', 'No floors in the settings yet')}</span>` : ''}</p>` : ''}</div>
      </div></div>
    <div class="pl-card"><div class="pl-tabs" role="tablist" style="display:inline-flex;margin-bottom:10px">${['all', 'new', 'update', 'error', 'same'].map(k => `<button role="tab" aria-selected="${S.pvFilter === k}" data-pl-pvf="${k}">${k === 'all' ? tr('全部', 'All') : tr(...STATUS_LABEL[k])} ${k === 'all' ? t.rows : t[k]}</button>`).join('')}</div>
      <div class="pl-tbl"><table><thead><tr><th>${tr('行', 'Row')}</th><th>SKU</th><th>${tr('结果', 'Result')}</th><th class="l">${tr('变化 / 错误', 'Changes / errors')}</th></tr></thead><tbody>${list.slice(0, 500).map(r => `<tr><td class="num">${r.row}</td><td class="num">${esc(r.sku)}</td><td><span class="pl-pill ${r.status}">${tr(...STATUS_LABEL[r.status])}</span></td><td class="l"><div class="pl-changes">
        ${r.status === 'error' ? r.errors.map(e => `<span style="color:var(--pl-req)">${tr(`第 ${r.row} 行 · ${e.col ? e.col + ' 列' : ''}「${e.header}」：`, `Row ${r.row} · ${e.col ? 'column ' + e.col : ''} “${e.header}”: `)}${esc(lang() === 'en' ? e.en : e.zh)}</span>`).join('')
          : r.changes.map(ch => `<span><b>${esc(fieldName(ch.key))}</b>：<span class="pl-old">${esc(show(ch.key, ch.from))}</span> → <span class="pl-new">${esc(show(ch.key, ch.to))}</span></span>`).join('')}
        ${r.warnings?.length ? `<span class="pl-note">${r.warnings.slice(0, 4).map(w => esc(lang() === 'en' ? w.en : w.zh)).join('；')}${r.warnings.length > 4 ? ' …' : ''}</span>` : ''}</div></td></tr>`).join('') || `<tr><td colspan="4" class="l">${tr('没有这一类的行', 'No rows of this kind')}</td></tr>`}</tbody></table></div>
      ${list.length > 500 ? `<p class="pl-note">${tr('只显示前 500 行；完整内容请下载预览报告。', 'Showing the first 500 rows; download the report for all.')}</p>` : ''}
      <div class="pl-confirm"><span>${tr(`确认后将新增 ${t.new} 个、更新 ${t.update} 个产品（共 ${t.fieldChanges} 处字段变化）`, `Confirm adds ${t.new} and updates ${t.update} products (${t.fieldChanges} field changes)`)}${t.error ? tr(`；${t.error} 行有错误`, `; ${t.error} rows have errors`) : ''}。</span>
        ${t.error ? `<label class="pl-chk"><input type="checkbox" data-pl-skip ${S.skipErrors ? 'checked' : ''}> ${tr('跳过错误行，更新其余', 'Skip the rows with errors, update the rest')}</label>` : ''}
        <button class="pl-btn primary" data-pl="confirm" ${(t.error && !S.skipErrors) || !(t.new + t.update) ? 'disabled' : ''}>${tr('确认更新', 'Confirm update')}</button></div></div>`;
  }
  function importsView() {
    const list = S.imports;
    return `<div class="pl-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3>${tr('导入记录', 'Import history')}</h3></div>
      ${!list ? `<p class="pl-note">${tr('读取中…', 'Loading…')}</p>` : list.length ? `<div class="pl-tbl"><table><thead><tr><th>${tr('时间', 'When')}</th><th>${tr('操作人', 'By')}</th><th class="l">${tr('文件', 'File')}</th><th>${tr('新增', 'New')}</th><th>${tr('更新', 'Updated')}</th><th>${tr('跳过错误行', 'Skipped')}</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td>${esc(new Date(x.at).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN'))}</td><td>${esc(x.by || '')}</td><td class="l">${esc(x.fileName || '')}</td><td class="num">${x.summary?.new ?? 0}</td><td class="num">${x.summary?.update ?? 0}</td><td class="num">${x.summary?.skipped ?? 0}</td>
        <td>${x.undoneAt ? `<span class="pl-meta">${tr(`已撤销 · ${x.undoneBy || ''}`, `Undone · ${x.undoneBy || ''}`)}${x.undo?.kept?.length ? tr(`（${x.undo.kept.length} 项因之后又被修改而保留）`, ` (${x.undo.kept.length} kept: changed since)`) : ''}</span>` : `<button class="pl-btn small danger" data-pl-undo="${esc(x.id)}">${tr('撤销这次导入', 'Undo this import')}</button>`}</td></tr>`).join('')}</tbody></table></div>` : `<p class="pl-note">${tr('还没有导入记录', 'No imports yet')}</p>`}</div>`;
  }

  /* ---------- page ---------- */
  function render(mode) {
    if (!ctx) return '';
    S.mode = mode === 'pricing' ? 'pricing' : 'catalog';
    load();
    if (!S.data) return `<div class="pl"><p class="pl-note" role="status">${S.error ? esc(S.error) : tr('正在读取产品资料…', 'Loading the product library…')}</p></div>`;
    // One page: the product list and editor, with every action in the toolbar (no sub-tabs). A bulk-update preview
    // and the import history open in place of the list, with a way back.
    const v = viewer();
    const okView = S.view === 'settings' ? S.mode === 'pricing' && v.canEditSettings : ['import', 'imports'].includes(S.view) && v.canImport && (S.view !== 'import' || !!S.preview);
    if (!okView) S.view = 'products';
    const steps = tr('1. 下载标准模板（含当前数据）→ 2. 在 Excel 里修改 → 3. 点“批量更新”上传 .xlsx 或 .csv → 4. 查看更新前后对比 → 5. 点“确认更新”才会写入', '1. Download the template (with current data) → 2. edit in Excel → 3. click Bulk update and upload .xlsx or .csv → 4. review the comparison → 5. nothing is written until you confirm');
    const bar = `<div class="pl-bar">${S.view !== 'products' ? `<button class="pl-btn" data-pl="view" data-v="products">← ${S.mode === 'pricing' ? tr('返回定价', 'Back to pricing') : tr('返回产品资料', 'Back to products')}</button>` : ''}<span class="pl-sp"></span>
      ${v.editCatalog ? `<button class="pl-btn primary" data-pl="new">＋ ${tr('新建产品', 'New product')}</button>` : ''}
      ${v.canImport ? `<label class="pl-btn" title="${esc(steps)}">${S.busy === 'import' ? tr('正在分析…', 'Analysing…') : tr('批量更新', 'Bulk update')}<input type="file" data-pl-import accept=".xlsx,.csv" hidden></label>` : ''}
      <button class="pl-btn" data-pl="template" data-format="xlsx" title="${tr('导出你有权限查看的全部列（含当前数据），改完用“批量更新”上传', 'Export every column you may see, with current data; upload it with Bulk update')}">${tr('下载标准模板', 'Download template')}</button>
      ${v.canImport ? `<button class="pl-btn" data-pl="view" data-v="imports" ${S.view === 'imports' ? 'aria-pressed="true"' : ''}>${tr('导入记录', 'Import history')}</button>` : ''}
      ${S.mode === 'pricing' && v.canEditSettings ? `<button class="pl-btn" data-pl="view" data-v="settings" ${S.view === 'settings' ? 'aria-pressed="true"' : ''} title="${tr('销售费率、零售与批发档位、NPCR 阶梯和利润底线；改动后所有产品的建议价自动重算', 'Selling rates, retail and wholesale tiers, NPCR steps and floors; every suggested price is recalculated')}">${tr('价格参数（NPCR）', 'Pricing parameters (NPCR)')}</button>` : ''}
      ${window.WorkOSErpAccess?.button?.(S.mode === 'pricing' ? 'pricing' : 'products', 'pl-btn') || ''}</div>`;
    const ro = !v.editCatalog && !v.editCost && !v.editPrices ? `<div class="pl-notice">${tr('你目前只有查看权限。', 'You have view access only.')}</div>` : '';
    const body = S.view === 'import' ? importView() : S.view === 'imports' ? importsView() : S.view === 'settings' ? settingsView() : `<div class="pl-layout">${rail()}<main class="pl-editor" id="pl-editor">${editor()}</main></div>`;
    return `<div class="pl">${bar}${S.view === 'products' ? ro : ''}${body}</div>`;
  }

  /* ---------- saving ---------- */
  const STATUS_NOTE = new Set(['clearance', 'eol']);
  async function saveField(key, raw) {
    const it = itemOf(S.cur); if (!it) return;
    const value = raw === '' ? null : raw;
    if (JSON.stringify(it.values[key] ?? null) === JSON.stringify(value) || String(it.values[key] ?? '') === String(raw)) return;
    let note;
    if (key === 'status' && STATUS_NOTE.has(value)) { note = (window.prompt?.(tr('转为停产清存或下架封存时，请写一句原因：', 'Give a reason for clearance or end of sale:')) || '').trim(); if (!note) { rerender(); return; } }
    S.saving[key] = true; delete S.errs[key]; rerender();
    try {
      const r = await ctx.api.request(`/products/library/${encodeURIComponent(it.sku)}`, { method:'PATCH', body:{ values:{ [key]:value }, ...(note ? { note } : {}) } });
      if (r.item) replaceItem(r.item);
      const pend = Object.entries(r.prices || {}).filter(([, x]) => x?.status === 'pending');
      if (pend.length) { toast(tr('这个价格低于利润底线，已提交管理员审批，批准后生效', 'Below the margin floor: sent to an admin for approval')); load(true); }
      S.savedAt = new Date().toLocaleTimeString(lang() === 'en' ? 'en-US' : 'zh-CN', { hour:'2-digit', minute:'2-digit' });
      delete S.history[it.sku];
    } catch (e) { S.errs[key] = e.message || tr('保存失败', 'Save failed'); toast(S.errs[key]); }
    finally { delete S.saving[key]; rerender(); }
  }
  const b64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error(tr('文件读取失败', 'Could not read the file'))); r.readAsDataURL(f); });
  async function upload(slot, files) {
    const it = itemOf(S.cur); if (!it || !files.length) return;
    S.busy = slot; rerender();
    for (const f of files) {
      if (f.size > 20 * 1048576) { toast(tr(`${f.name} 超过 20 MB`, `${f.name} is over 20 MB`)); continue; }
      try { await ctx.api.post(`/products/library/${encodeURIComponent(it.sku)}/files/${encodeURIComponent(slot)}`, { name:f.name, dataBase64:await b64(f) }); }
      catch (e) { toast(`${f.name}：${e.message || tr('上传失败', 'Upload failed')}`); }
    }
    S.busy = ''; load(true);
  }
  async function download(path, fallbackName) {
    try {
      const r = await fetch(apiBase() + path, { credentials:'same-origin', cache:'no-store', headers:{ 'Accept-Language': tr('zh-CN', 'en') } });
      if (!r.ok) { let m = ''; try { m = (await r.json()).error?.message; } catch { /* not JSON */ } throw new Error(m || tr('下载失败', 'Download failed')); }
      const cd = r.headers.get('content-disposition') || '', name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || fallbackName);
      const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { toast(e.message || tr('下载失败', 'Download failed')); }
  }
  async function previewFile(file) {
    if (!file) return;
    if (file.size > 10 * 1048576) return toast(tr('文件不能超过 10 MB', 'The file must be 10 MB or smaller'));
    S.busy = 'import'; rerender();
    try { S.preview = await ctx.api.post('/products/library/import/preview', { fileName:file.name, dataBase64:await b64(file) }); S.view = 'import'; S.pvFilter = S.preview.analysis.totals.error ? 'error' : 'all'; S.skipErrors = false; }
    catch (e) { toast(e.message || tr('无法分析这个文件', 'Could not analyse the file')); }
    finally { S.busy = ''; rerender(); }
  }
  async function confirmImport(btn) {
    const p = S.preview; if (!p) return;
    const t = p.analysis.totals;
    if (!window.confirm?.(tr(`确认更新？将新增 ${t.new} 个、更新 ${t.update} 个产品，共 ${t.fieldChanges} 处字段变化${t.error ? `；跳过 ${t.error} 行错误` : ''}。更新后可以在导入记录里撤销。`, `Confirm? Adds ${t.new}, updates ${t.update} products (${t.fieldChanges} field changes)${t.error ? `; skips ${t.error} error rows` : ''}. You can undo it from the import history.`))) return;
    btn.disabled = true;
    try {
      const r = await ctx.api.post(`/products/library/import/${encodeURIComponent(p.id)}/confirm`, { skipErrors:S.skipErrors });
      toast(tr(`已更新：新增 ${r.new} 个，更新 ${r.update} 个`, `Updated: ${r.new} new, ${r.update} changed`));
      S.preview = null; S.view = 'imports'; S.imports = null; loadImports(); load(true);
    } catch (e) { toast(e.message || tr('更新失败，没有写入任何数据', 'The update failed; nothing was written')); btn.disabled = false; }
  }
  function loadImports() { ctx.api.get('/products/library/imports').then(r => { S.imports = r.items || []; }).catch(e => { S.imports = []; toast(e.message); }).finally(rerender); }
  function loadHistory(sku) { ctx.api.get(`/products/library/${encodeURIComponent(sku)}/history`).then(r => { S.history[sku] = r.items || []; }).catch(() => { S.history[sku] = []; }).finally(rerender); }
  const setPath = (o, path, v) => { const ks = path.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks[ks.length - 1]] = v; };
  const numOrNull = v => { const s = String(v).trim().replace('%', ''); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };

  /* ---------- events (only inside the library) ---------- */
  const inPl = el => !!(ctx && el?.closest?.('.pl'));
  document.addEventListener('click', e => {
    const t = e.target.closest?.('[data-pl],[data-pl-pick],[data-pl-sort],[data-pl-rmfile],[data-pl-delprod],[data-pl-freight],[data-pl-pvf],[data-pl-undo],[data-pl-sadd],[data-pl-srm]');
    if (!t || !inPl(t)) return;
    if (t.dataset.plSort) { const k = t.dataset.plSort; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = ['msrp', 'cm'].includes(k) ? -1 : 1; } return rerender(); }
    if (t.dataset.plPick && e.target.closest('td.ck')) return;
    if (t.dataset.plPick) { S.cur = t.dataset.plPick; S.creating = false; S.errs = {}; S.histOpen = false; return rerender(); }
    if (t.dataset.plFreight) { e.preventDefault(); return saveField('whFreight', t.dataset.plFreight); }
    if (t.dataset.plPvf) { S.pvFilter = t.dataset.plPvf; return rerender(); }
    if (t.dataset.plSadd) { const k = t.dataset.plSadd, row = { dtcItems:{ name:'', pct:0 }, whItems:{ name:'', pct:0 }, retailTiers:{ name:'', cm:0, use:'' }, whTiers:{ name:'', discount:0, floor:false } }[k]; S.draft[k].push(row); return rerender(); }
    if (t.dataset.plSrm) { const [k, i] = t.dataset.plSrm.split('.'); S.draft[k].splice(Number(i), 1); return rerender(); }
    if (t.dataset.plDelprod) {
      // Delete a product (owner, 2026-11-13): the server refuses a SKU that stock, orders or returns use and says where.
      const sku = t.dataset.plDelprod;
      if (!window.confirm?.(tr(`删除产品 ${sku}？\n产品资料、价格、文件会一起删除，不能恢复。\n已有库存、出入库、订单或退货记录的产品不能删除，请改为“下架封存”。`, `Delete product ${sku}?\nIts details, prices and files go too; this cannot be undone.\nA product with stock, movements, orders or returns cannot be deleted; set it to Delisted.`))) return;
      t.disabled = true;
      ctx.api.request(`/products/library/${encodeURIComponent(sku)}`, { method:'DELETE' })
        .then(() => { toast(tr(`已删除 ${sku}`, `${sku} deleted`)); S.cur = null; load(true); })
        .catch(x => { t.disabled = false; window.alert?.(x.message || tr('删除失败', 'Could not delete')); });
      return;
    }
    if (t.dataset.plRmfile) { if (!window.confirm?.(tr('删除这个文件？', 'Delete this file?'))) return; ctx.api.request(`/products/library/files/${encodeURIComponent(t.dataset.plRmfile)}`, { method:'DELETE' }).then(() => load(true)).catch(x => toast(x.message)); return; }
    if (t.dataset.plUndo) { if (!window.confirm?.(tr('撤销这次导入？导入之前的值会恢复；之后又被别人修改过的字段会保留并列出。', 'Undo this import? The earlier values come back; fields changed since are kept and listed.'))) return;
      t.disabled = true; ctx.api.post(`/products/library/imports/${encodeURIComponent(t.dataset.plUndo)}/undo`, {}).then(r => { toast(tr(`已撤销：恢复 ${r.restored} 处，移除新增产品 ${r.removed} 个${r.kept.length ? `，保留 ${r.kept.length} 项` : ''}`, `Undone: ${r.restored} values restored, ${r.removed} new products removed${r.kept.length ? `, ${r.kept.length} kept` : ''}`)); loadImports(); load(true); }).catch(x => { toast(x.message); t.disabled = false; }); return; }
    const a = t.dataset.pl;
    if (a === 'view') { S.view = t.dataset.v; if (S.view === 'imports' && !S.imports) loadImports(); if (S.view === 'settings') S.draft = null; return rerender(); }
    if (a === 'clear-filters') { Object.assign(S, { q:'', fam:'', series:'', status:'', gt:'', brand:'', pmin:'', pmax:'', onlyReq:false }); return rerender(); }
    if (a === 'new') { S.view = 'products'; S.creating = true; S.errs = {}; return rerender(); }
    if (a === 'create-cancel') { S.creating = false; return rerender(); }
    if (a === 'create') { const box = document.getElementById('pl-new'), val = k => box?.querySelector(`[data-pl-new="${k}"]`)?.value.trim() || '';
      const sku = val('sku'); if (!sku) { S.errs._new = tr('请填写 SKU', 'Enter a SKU'); return rerender(); }
      const values = Object.fromEntries(['family', 'nameZh', 'nameEn'].map(k => [k, val(k)]).filter(([, v]) => v));
      t.disabled = true; ctx.api.post('/products/library', { sku, values }).then(r => { S.creating = false; S.cur = r.sku; S.errs = {}; toast(tr('已创建，继续补齐其他字段', 'Created; fill in the other fields')); load(true); }).catch(x => { S.errs._new = x.message; t.disabled = false; rerender(); }); return; }
    if (a === 'template') return download(`/products/library/template?format=${t.dataset.format === 'csv' ? 'csv' : 'xlsx'}`, `${tr('OneLaser_产品资料', 'OneLaser_products')}.${t.dataset.format === 'csv' ? 'csv' : 'xlsx'}`);
    if (a === 'report' && S.preview) return download(`/products/library/import/${encodeURIComponent(S.preview.id)}/report`, '导入预览报告.csv');
    if (a === 'preview-cancel') { S.preview = null; S.view = 'products'; return rerender(); }
    if (a === 'confirm') return confirmImport(t);
    if (a === 'bulk-apply') return bulkApply(t);
    if (a === 'bulk-clear') { S.sel.clear(); S.bulkVal = ''; S.bulkNote = ''; return rerender(); }
    if (a === 'settings-reset') { S.draft = null; return rerender(); }
    if (a === 'settings-save') { const body = JSON.parse(JSON.stringify(S.draft)); delete body.updatedAt; delete body.configured;
      if (JSON.stringify(body).includes('NaN') || [...body.dtcItems, ...body.whItems, ...body.retailTiers, ...body.whTiers].some(r => !String(r.name || '').trim())) return toast(tr('请把每一行的名称和数字填完整', 'Fill in every row’s name and number'));
      t.disabled = true; ctx.api.request('/products/worksheet-settings', { method:'PUT', body }).then(() => { toast(tr('价格参数已保存，所有产品的建议价已重算', 'Settings saved; suggested prices recalculated')); S.draft = null; load(true); }).catch(x => { toast(x.message); t.disabled = false; }); }
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!inPl(el)) return;
    // Saved on the next tick, once focus has moved on, so the re-render can hand focus back to the next field.
    if (el.matches('[data-pl-f]')) { const k = el.dataset.plF, v = el.value.trim(); setTimeout(() => saveField(k, v), 0); return; }
    if (el.matches('[data-pl-upload]')) { const files = [...(el.files || [])]; el.value = ''; return upload(el.dataset.plUpload, files); }
    if (el.matches('[data-pl-import]')) { const f = el.files?.[0]; el.value = ''; return previewFile(f); }
    if (el.matches('[data-pl-flt]')) { S[el.dataset.plFlt] = el.value; if (el.dataset.plFlt === 'fam') S.series = ''; return rerender(); }
    if (el.matches('[data-pl-p]')) { const v = el.value.trim().replace(/[$,]/g, ''); S[el.dataset.plP] = v !== '' && Number.isFinite(Number(v)) ? v : ''; return rerender(); }
    if (el.matches('[data-pl-sel]')) { el.checked ? S.sel.add(el.dataset.plSel) : S.sel.delete(el.dataset.plSel); return rerender(); }
    if (el.matches('[data-pl-selall]')) { filteredItems().forEach(i => el.checked ? S.sel.add(i.sku) : S.sel.delete(i.sku)); return rerender(); }
    if (el.matches('[data-pl-bulkkey]')) { S.bulkKey = el.value; S.bulkVal = ''; return rerender(); }
    if (el.matches('[data-pl-bulkval]')) { S.bulkVal = el.value; return rerender(); }
    if (el.matches('[data-pl-onlyreq]')) { S.onlyReq = el.checked; return rerender(); }
    if (el.matches('[data-pl-skip]')) { S.skipErrors = el.checked; return rerender(); }
    if (el.matches('[data-pl-s]')) { const path = el.dataset.plS, d = S.draft; if (!d) return;
      if (path === 'npcr') d.npcr = el.value.split(/[,，\s]+/).map(Number).filter(x => Number.isFinite(x) && x > 0 && x < 100);
      else if (el.type === 'checkbox') setPath(d, path, el.checked);
      else if (/(^|\.)(name|use)$/.test(path) || path === 'dtcTarget' || path === 'whTarget') setPath(d, path, el.value.trim());
      else setPath(d, path, numOrNull(el.value));
      return rerender(); }
  });
  document.addEventListener('input', e => {
    const el = e.target; if (!inPl(el)) return;
    if (el.matches('[data-pl-bulkval]')) { S.bulkVal = el.value; return; }
    if (el.matches('[data-pl-bulknote]')) { S.bulkNote = el.value; return; }
    if (!el.matches('[data-pl-q]')) return;
    S.q = el.value; const pos = el.selectionStart; rerender();
    requestAnimationFrame(() => { const n = document.querySelector('[data-pl-q]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* ignore */ } } });
  });
  document.addEventListener('toggle', e => {
    const el = e.target; if (!inPl(el)) return;
    if (el.matches?.('[data-pl-price]')) { S.priceOpen[el.dataset.plPrice] = el.open; return; }
    if (!el.matches?.('[data-pl-history]')) return;
    S.histOpen = el.open; if (el.open && S.cur && !S.history[S.cur]) loadHistory(S.cur);
  }, true);

  window.WorkOSProductLibrary = { configure(next) { ctx = next; }, render, reload:() => load(true), _state:S };
})();
