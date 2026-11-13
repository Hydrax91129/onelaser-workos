/*
 * Supply chain permissions ("供应链权限管理", formerly "ERP 权限").
 *
 * One place to decide, per employee, what they can do in the product hub:
 *   Product data    none / view general / view confidential / manage (everything, incl. bulk updates)
 *   Pricing         none / view / edit one SKU at a time / manage (incl. bulk updates)
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
  const ALL_AREAS = [
    ['products', 'package', '产品资料', 'Product data', [['none', '无', 'None'], ['view', '查看普通信息', 'View general'], ['secret', '查看保密信息', 'View confidential'], ['manage', '管理信息', 'Manage']], '普通信息 = 名称、规格、包装等；保密信息 = 供应商、到岸价、尾程运费、报关和文件；管理信息 = 新建 SKU、修改全部资料（含保密信息）和批量更新', 'General = names, specs, packaging; confidential = suppliers, landed cost, last mile, customs and files; manage = create SKUs, edit everything (confidential included) and bulk updates'],
    ['pricing', 'currency-dollar', '价格', 'Pricing', [['none', '无', 'None'], ['view', '查看', 'View'], ['edit', '单项修改', 'Edit one by one'], ['manage', '管理', 'Manage']], '查看 = 看定价页的成本、费率和利润；单项修改 = 逐个 SKU 改价格、成本和费率；管理 = 再加批量更新。价格参数（NPCR）只有主管理员能改，请谨慎开通', 'View = cost, rates and margins on the Pricing page; edit = change prices, cost and rates one SKU at a time; manage = also bulk updates. Price parameters (NPCR) stay main-admin only; grant with care'],
    ['supply', 'truck', '供应链', 'Supply chain', [['none', '无', 'None'], ['view', '查看', 'View'], ['manage', '管理', 'Manage']], '管理 = 生成采购单草稿、调整补货参数', 'Manage = draft purchase orders and tune reorder settings'],
    ['warehouse', 'warehouse', '仓库库存', 'Warehouse stock', [['none', '无', 'None'], ['view', '查看', 'View'], ['manage', '管理', 'Manage'], ['approve', '审批', 'Approve']], '管理 = 入库、出库、调拨、提交盘点调整；审批 = 管理 + 确认盘点调整（自己提交的也由自己确认）。只有主管理员能设审批', 'Manage = goods in, out, transfers and submitting counts; approve = manage + confirming counts (your own too). Only main admins grant approve'],
    ['returns', 'arrow-u-up-left', '退货维修', 'Returns & repairs', [['none', '无', 'None'], ['view', '查看', 'View'], ['manage', '管理', 'Manage']], '管理 = 登记退货、维修、入库上架和售出；查看 = 只看退货记录', 'Manage = register returns, repair, put away and sell; view = see the returns only'],
    ['kol', 'users-three', 'KOL 管理', 'KOL management', [['none', '无', 'None'], ['view', '查看', 'View'], ['manage', '管理', 'Manage']], '管理 = 新增和编辑 KOL、记录寄样和发布、从 UpPromote 同步；查看可以看到 KOL 的联系方式和佣金', 'Manage = add and edit KOLs, log samples and content, sync UpPromote; view shows KOL contact details and commission'],
    ['dealers', 'storefront', '经销商', 'Dealers', [['none', '无', 'None'], ['view', '查看', 'View'], ['manage', '管理', 'Manage']], '管理 = 审核经销商、发货并填写物流单号、取消未付款订单', 'Manage = approve dealers, ship with tracking, cancel unpaid orders']
  ];

  /* Each module has its own permissions page (no separate menu item): 产品资料, 定价, 库存, 退货维修, 供应链, 经销商, KOL.
     A button on the module opens #erp-access/<area>, which shows only that module's columns and a way back. */
  const PAGES = { products:{ areas:['products'], zh:'产品资料权限', en:'Product permissions', back:'products', bzh:'产品资料', ben:'Products' },
    pricing:{ areas:['pricing'], zh:'价格权限', en:'Pricing permissions', back:'products', bzh:'定价试算器', ben:'Pricing calculator' },
    warehouse:{ areas:['warehouse'], zh:'库存权限', en:'Stock permissions', back:'wms', bzh:'库存管理', ben:'Inventory' },
    returns:{ areas:['returns'], zh:'退货权限', en:'Returns permissions', back:'wms', bzh:'退货维修', ben:'Returns' },
    supply:{ areas:['supply'], zh:'供应链权限', en:'Supply chain permissions', back:'scm', bzh:'供应链管理', ben:'Supply chain' },
    dealers:{ areas:['dealers'], zh:'经销商权限', en:'Dealer permissions', back:'products', bzh:'经销商订单', ben:'Dealer orders' },
    kol:{ areas:['kol'], zh:'KOL 权限', en:'KOL permissions', back:'kol', bzh:'KOL 管理', ben:'KOL management' } };
  const pageOf = () => PAGES[ctx?.area?.() || ''] || null;
  /** The permissions button for a module, or '' when this person cannot set that module's access. */
  function button(area, cls = 'btn') {
    const pg = PAGES[area]; if (!pg || !ctx?.canSet?.(area)) return '';
    return `<a class="${cls}" href="#erp-access/${area}" data-erpa-open="${area}">${icon('user-gear')} ${tr(pg.zh, pg.en)}</a>`;
  }
  function configure(next) { ctx = next; }
  function reset() { data = null; loading = false; error = ''; ui.q = ''; ui.area = ''; }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/erp/access'); error = ''; }
    catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }
  // 库存审批 (2026-11-13): only main admins give it or take it away; managers keep setting none / view / manage for their reports.
  const approveOk = (area, cur, lv) => data.canAdmin || area !== 'warehouse' || (lv !== 'approve' && cur !== 'approve');
  const canEdit = (area, person) => data.canAdmin || (((area === 'warehouse' && data.canWarehouse) || (area === 'returns' && data.canReturns)) && person.reportsToMe);

  function render() {
    if (!data && !error) { load(); return `<div class="erpa"><p class="erpa-hint">${tr('正在读取…', 'Loading…')}</p></div>`; }
    if (error && !data) return `<div class="erpa"><div class="erpa-alert">${esc(error)}</div></div>`;
    // Rows for modules the server does not offer yet (by capability) stay hidden.
    const pg = pageOf(), AREAS = ALL_AREAS.filter(([id]) => (!ctx?.supports || ctx.supports(id)) && (!pg || pg.areas.includes(id)));
    if (ui.area && !AREAS.some(([id]) => id === ui.area)) ui.area = '';
    const q = ui.q.trim().toLowerCase();
    const people = data.people.filter(p => (!q || `${p.name} ${p.title || ''} ${p.location || ''}`.toLowerCase().includes(q)) && (!ui.area || (p.access[ui.area] || 'none') !== 'none'));
    const counts = AREAS.map(([id]) => data.people.filter(p => (p.access[id] || 'none') !== 'none').length);
    return `<div class="erpa">
      ${pg ? `<a class="erpa-back" href="#${pg.back}">${icon('arrow-left')} ${tr(`返回${pg.bzh}`, `Back to ${pg.ben}`)}</a>` : ''}
      <div class="page-heading"><div><div class="eyebrow">WORK OS · ERP</div><h1>${pg ? tr(pg.zh, pg.en) : tr('全部权限', 'All permissions')}</h1><p>${pg ? tr(`设置每位员工在“${pg.bzh}”的权限，点一下即保存；“管理”自动包含“查看”。`, `Set each employee’s access to ${pg.ben}; it saves on click and Manage includes View.`) : tr('在这里给每位员工设置产品、价格构成、供应链和仓库库存的权限。“管理”自动包含“查看”。这些设置不再放在“组织与权限”里。', 'Set each employee’s access to products, price build-up, supply chain and warehouse stock here. Manage includes view. These settings no longer live in Organization & permissions.')}</p></div></div>
      ${data.canAdmin ? '' : `<div class="erpa-note">${icon('info')} ${tr('你是主管：可以为自己的下属设置“仓库库存”和“退货维修”权限，其他权限由主管理员设置。', 'As a manager you can set warehouse and returns access for your reports; main admins set everything else.')}</div>`}
      <div class="erpa-legend">${AREAS.map(([id, ic, zh, en, , nzh, nen], i) => `<button class="erpa-card ${ui.area === id ? 'on' : ''}" data-erpa="area" data-v="${id}">${icon(ic)}<span><b>${tr(zh, en)}</b><em>${tr(nzh, nen)}</em></span><strong>${counts[i]}</strong></button>`).join('')}</div>
      <div class="erpa-toolbar"><label class="erpa-search">${icon('magnifying-glass')}<input data-erpa-search value="${esc(ui.q)}" placeholder="${tr('搜索姓名、职位或地点', 'Search name, title or location')}"></label>${ui.area ? `<button class="erpa-link" data-erpa="area" data-v="">${icon('x-circle')} ${tr('看全部人', 'Show everyone')}</button>` : ''}<span class="erpa-hint">${tr(`${people.length} 人`, `${people.length} people`)}${saving ? ' · ' + tr('保存中…', 'Saving…') : ''}</span></div>
      <div class="erpa-table-wrap"><table class="erpa-table"><thead><tr><th>${tr('员工', 'Employee')}</th>${AREAS.map(([, ic, zh, en]) => `<th>${icon(ic)} ${tr(zh, en)}</th>`).join('')}</tr></thead><tbody>
        ${people.map(p => `<tr><td><div class="erpa-person"><span class="erpa-av">${esc(String(p.name || '?').slice(0, 2))}</span><div><strong>${esc(p.name)}</strong><small>${esc([p.title, p.location].filter(Boolean).join(' · '))}</small></div></div></td>${AREAS.map(([id, , , , levels]) => { const cur = p.access[id] || 'none', ok = canEdit(id, p); return `<td><div class="erpa-seg ${ok ? '' : 'ro'}" role="radiogroup" aria-label="${esc(p.name)}">${levels.map(([lv, zh, en]) => { const can = ok && approveOk(id, cur, lv); return `<button class="${cur === lv ? 'on lv-' + lv : ''}" ${can ? `data-erpa="set" data-user="${esc(p.id)}" data-area="${id}" data-v="${lv}"` : `disabled${ok && !can ? ` title="${esc(tr('只有主管理员能设置或取消库存审批', 'Only main admins grant or remove stock approval'))}"` : ''}`} role="radio" aria-checked="${cur === lv}">${tr(zh, en)}</button>`; }).join('')}</div></td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${AREAS.length + 1}" class="erpa-empty">${tr('没有匹配的员工', 'No matching people')}</td></tr>`}
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

  window.WorkOSErpAccess = { configure, render, reset, button, parentOf:area => PAGES[area]?.back || null };
})();
