/*
 * ERP permissions ("ERP 权限").
 *
 * One place to decide, per employee, what they can do in the product hub:
 *   Products        none / view / manage (create SKUs, edit specs)
 *   Price build-up  none / MSRP only / full cost build-up incl. editing
 *   Supply chain    none / view / manage
 *   Warehouse stock none / view / manage (goods in, out, transfers, counts)
 * "Manage" includes "view". Administrators edit every column; managers may set
 * warehouse access for their own reports. These settings no longer live in
 * Organization & permissions.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '', saving = '';
  const ui = { q:'', area:'' };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const AREAS = [
    ['products', 'package', '产品', 'Products', [['none', '无', 'None'], ['view', '查看', 'View'], ['manage', '管理', 'Manage']], '管理 = 新建 SKU、修改产品资料与规格', 'Manage = create SKUs and edit product specs'],
    ['pricing', 'currency-dollar', '价格构成', 'Price build-up', [['none', '无', 'None'], ['msrp', '查看 MSRP', 'MSRP only'], ['full', '价格组成 + 修改', 'Full build-up + edit']], '价格组成包含工厂成本、运费、关税和毛利，请谨慎开通', 'The full build-up shows factory cost, freight, duty and margin; grant with care'],
    ['supply', 'truck', '供应链', 'Supply chain', [['none', '无', 'None'], ['view', '查看', 'View'], ['manage', '管理', 'Manage']], '管理 = 生成采购单草稿、调整补货参数', 'Manage = draft purchase orders and tune reorder settings'],
    ['warehouse', 'warehouse', '仓库库存', 'Warehouse stock', [['none', '无', 'None'], ['view', '查看', 'View'], ['manage', '管理', 'Manage']], '管理 = 入库、出库、调拨、盘点调整；只查看的人不能改数量', 'Manage = goods in, out, transfers and counts; view-only people cannot change quantities']
  ];

  function configure(next) { ctx = next; }
  function reset() { data = null; loading = false; error = ''; ui.q = ''; ui.area = ''; }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/erp/access'); error = ''; }
    catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }
  const canEdit = (area, person) => data.canAdmin || (area === 'warehouse' && data.canWarehouse && person.reportsToMe);

  function render() {
    if (!data && !error) { load(); return `<div class="erpa"><p class="erpa-hint">${tr('正在读取…', 'Loading…')}</p></div>`; }
    if (error && !data) return `<div class="erpa"><div class="erpa-alert">${esc(error)}</div></div>`;
    const q = ui.q.trim().toLowerCase();
    const people = data.people.filter(p => (!q || `${p.name} ${p.title || ''} ${p.location || ''}`.toLowerCase().includes(q)) && (!ui.area || (p.access[ui.area] || 'none') !== 'none'));
    const counts = AREAS.map(([id]) => data.people.filter(p => (p.access[id] || 'none') !== 'none').length);
    return `<div class="erpa">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · ERP</div><h1>${tr('ERP 权限', 'ERP permissions')}</h1><p>${tr('在这里给每位员工设置产品、价格构成、供应链和仓库库存的权限。“管理”自动包含“查看”。这些设置不再放在“组织与权限”里。', 'Set each employee’s access to products, price build-up, supply chain and warehouse stock here. Manage includes view. These settings no longer live in Organization & permissions.')}</p></div></div>
      ${data.canAdmin ? '' : `<div class="erpa-note">${icon('info')} ${tr('你是主管：可以为自己的下属设置“仓库库存”权限，其他权限由管理员设置。', 'As a manager you can set warehouse access for your reports; administrators set everything else.')}</div>`}
      <div class="erpa-legend">${AREAS.map(([id, ic, zh, en, , nzh, nen], i) => `<button class="erpa-card ${ui.area === id ? 'on' : ''}" data-erpa="area" data-v="${id}">${icon(ic)}<span><b>${tr(zh, en)}</b><em>${tr(nzh, nen)}</em></span><strong>${counts[i]}</strong></button>`).join('')}</div>
      <div class="erpa-toolbar"><label class="erpa-search">${icon('magnifying-glass')}<input data-erpa-search value="${esc(ui.q)}" placeholder="${tr('搜索姓名、职位或地点', 'Search name, title or location')}"></label>${ui.area ? `<button class="erpa-link" data-erpa="area" data-v="">${icon('x-circle')} ${tr('看全部人', 'Show everyone')}</button>` : ''}<span class="erpa-hint">${tr(`${people.length} 人`, `${people.length} people`)}${saving ? ' · ' + tr('保存中…', 'Saving…') : ''}</span></div>
      <div class="erpa-table-wrap"><table class="erpa-table"><thead><tr><th>${tr('员工', 'Employee')}</th>${AREAS.map(([, ic, zh, en]) => `<th>${icon(ic)} ${tr(zh, en)}</th>`).join('')}</tr></thead><tbody>
        ${people.map(p => `<tr><td><div class="erpa-person"><span class="erpa-av">${esc(String(p.name || '?').slice(0, 2))}</span><div><strong>${esc(p.name)}</strong><small>${esc([p.title, p.location].filter(Boolean).join(' · '))}</small></div></div></td>${AREAS.map(([id, , , , levels]) => { const cur = p.access[id] || 'none', ok = canEdit(id, p); return `<td><div class="erpa-seg ${ok ? '' : 'ro'}" role="radiogroup" aria-label="${esc(p.name)}">${levels.map(([lv, zh, en]) => `<button class="${cur === lv ? 'on lv-' + lv : ''}" ${ok ? `data-erpa="set" data-user="${esc(p.id)}" data-area="${id}" data-v="${lv}"` : 'disabled'} role="radio" aria-checked="${cur === lv}">${tr(zh, en)}</button>`).join('')}</div></td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${AREAS.length + 1}" class="erpa-empty">${tr('没有匹配的员工', 'No matching people')}</td></tr>`}
      </tbody></table></div>
      <p class="erpa-hint">${icon('clock-counter-clockwise')} ${tr('每次修改都会记录在审计日志里（谁、何时、改了谁的什么权限）。', 'Every change is written to the audit log (who, when, whose access, what changed).')}</p>
    </div>`;
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-erpa]'); if (!b || !ctx) return;
    e.preventDefault();
    if (b.dataset.erpa === 'area') { ui.area = ui.area === b.dataset.v ? '' : b.dataset.v; return ctx.rerender(); }
    if (b.dataset.erpa === 'set') {
      const p = data.people.find(x => x.id === b.dataset.user), area = b.dataset.area, before = p.access[area] || 'none';
      if (before === b.dataset.v) return;
      p.access[area] = b.dataset.v; saving = p.id; ctx.rerender();
      try { const r = await ctx.api.post('/erp/access', { userId:p.id, area, level:b.dataset.v }); if (r?.access) p.access = r.access; ctx.toast?.(tr('已保存', 'Saved')); }
      catch (x) { p.access[area] = before; ctx.toast?.(x.message || tr('保存失败', 'Could not save')); }
      finally { saving = ''; ctx.rerender(); }
    }
  });
  document.addEventListener('input', e => {
    if (!e.target.matches?.('[data-erpa-search]')) return;
    ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender(); const n = document.querySelector('[data-erpa-search]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  });

  window.WorkOSErpAccess = { configure, render, reset };
})();
