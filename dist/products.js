'use strict';
/* Product hub (test area) — three boards:
 *  1. Product catalog: every attribute of an e-commerce product, Shopify-admin style
 *  2. Cost calculator: search a SKU or name; everyone with access sees the final cost,
 *     only `product_cost_detail` holders see how it is calculated
 *  3. Supply chain panorama + auto-replenishment: factory / in transit / overseas
 *     warehouse per SKU, days of cover and suggested purchase orders
 *     (Inventory Planner style)
 * Visible only to users granted `products`. Prototype: fictional sample data in memory;
 * real data can be injected at runtime via window.WORKOS_PRODUCT_DATA (never committed).
 */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let ctx = null;
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  const L = o => o && typeof o === 'object' ? (o[lang()] ?? o.zh) : o;
  const usd = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const int = n => Math.round(n).toLocaleString('en-US');
  const TODAY = new Date('2026-10-31T12:00:00');
  const addDays = n => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };
  const fmtD = d => lang() === 'en' ? d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) : `${d.getMonth() + 1}月${d.getDate()}日`;
  const nameText = p => typeof p.name === 'object' ? `${p.name.zh} ${p.name.en}` : String(p.name || '');

  /* ---------- statuses (supply-chain status used in the SKU master sheet) ---------- */
  const STATUS = { dev:['开发中','In development','#a25ddc'], launch:['上新中','Launching','#579bfc'], live:['在售','Selling','#00c875'], clearance:['清库存','Clearance','#fdab3d'], eolPlanned:['计划停售','Phasing out','#e2445c'], eol:['停售','Discontinued','#9699a6'], none:['未标注','Unlabeled','#c4c4c4'] };
  const STATUS_FROM_ZH = { '开发中':'dev', '上新中':'launch', '在售':'live', '清库存':'clearance', '计划停售':'eolPlanned', '停售':'eol' };
  const iconFor = t => /整机/.test(t) ? 'cube' : /材料/.test(t) ? 'stack' : /课程/.test(t) ? 'graduation-cap' : 'wrench';

  /* ---------- data: real data is injected at runtime (never committed); otherwise fictional samples ---------- */
  const SAMPLE = [
    { sku:'DEMO-HYD-60', name:{ zh:'示例 · 60W 激光雕刻机', en:'Sample · 60W laser engraver' }, type:'示例整机', status:'在售', gross:120, dims:[120, 90, 70], factoryRmb:12000, ddpRate:12, lastMileRmb:2800, msrp:4999, low:4299, shipFee:399, lead:'30天左右' },
    { sku:'DEMO-COB-40', name:{ zh:'示例 · 40W 桌面激光机', en:'Sample · 40W desktop laser' }, type:'示例整机', status:'上新中', gross:60, dims:[95, 65, 40], factoryRmb:7200, ddpRate:16.8, lastMileRmb:2800, msrp:2999, low:2499, shipFee:299, lead:'30天左右' },
    { sku:'DEMO-FBR-30', name:{ zh:'示例 · 30W 光纤打标机', en:'Sample · 30W fiber marker' }, type:'示例整机', status:'开发中', gross:27, dims:[77, 46, 46], factoryRmb:7500, ddpRate:14, lastMileRmb:480, msrp:2499, low:1999, shipFee:199, lead:'30天左右' },
    { sku:'DEMO-ACC-ROT', name:{ zh:'示例 · 旋转轴', en:'Sample · rotary axis' }, type:'配件', status:'在售', gross:5, dims:[40, 20, 18], factoryRmb:520, ddpRate:14.6, msrp:299, shipFee:29, lead:'8-15个工作日' },
    { sku:'DEMO-ACC-AF', name:{ zh:'示例 · 烟雾净化器', en:'Sample · fume extractor' }, type:'配件', status:'清库存', gross:28, dims:[50, 45, 75], factoryRmb:2100, ddpRate:14.6, lastMileRmb:170, msrp:899, shipFee:79, lead:'22天左右' },
  ];
  const injected = window.WORKOS_PRODUCT_DATA;
  const source = injected?.source || tr('示例数据', 'Sample data');
  // Deterministic sample inventory so the supply chain board has something to show until real stock data is connected.
  const seeded = (sku, n) => { let h = 7; for (const c of sku) h = (h * 31 + c.charCodeAt(0)) % 9973; return (h * (n + 3)) % 97; };
  const products = (injected?.products || SAMPLE).map(raw => {
    const machine = /整机/.test(raw.type), status = STATUS_FROM_ZH[raw.status] || 'none';
    const selling = ['live', 'launch', 'clearance'].includes(status);
    const v = selling ? (machine ? (seeded(raw.sku || raw.name, 1) % 20) / 10 + 0.2 : (seeded(raw.sku || raw.name, 2) % 60) / 10 + 0.5) : 0;
    return { ...raw, sku:raw.sku || '', status, icon:iconFor(raw.type || ''), machine,
      moq:machine ? 5 : 50, prodDays:machine ? 25 : 12, shipDays:/工作日/.test(raw.lead || '') ? 12 : 30,
      wip:status === 'dev' ? 0 : seeded(raw.sku || raw.name, 3) % (machine ? 15 : 200), ready:seeded(raw.sku || raw.name, 4) % (machine ? 8 : 80), transit:seeded(raw.sku || raw.name, 5) % (machine ? 20 : 300), wh:selling ? seeded(raw.sku || raw.name, 6) % (machine ? 40 : 400) : 0,
      age:selling ? 15 + seeded(raw.sku || raw.name, 7) * 4 : 0, velocity:Math.round(v * 10) / 10 };
  });
  const CHANNELS = { shopify:'1laser.com', amazon:'Amazon', dealer:{ zh:'经销商', en:'Dealers' } };
  const shipments = [
    { id:'MSKU 482190-3', mode:{ zh:'海运整柜', en:'Ocean FCL' }, eta:addDays(9), from:{ zh:'深圳盐田', en:'Yantian, Shenzhen' }, to:'Lake Forest, CA', items:products.filter(p => p.machine && p.status !== 'dev').slice(0, 3).map(p => [p.sku, p.transit]) },
    { id:'CMAU 771045-8', mode:{ zh:'海运拼柜', en:'Ocean LCL' }, eta:addDays(21), from:{ zh:'青岛', en:'Qingdao' }, to:'Lake Forest, CA', items:products.filter(p => !p.machine && p.status === 'live').slice(0, 4).map(p => [p.sku, p.transit]) },
  ];

  const ui = { incomplete:false, ageLimit:180, tab:'catalog', product:null, search:'', typeFilter:'', statusFilter:'', costQuery:'', costSku:products.find(p => p.factoryRmb && p.msrp)?.sku || products[0]?.sku, viewAsBasic:false, scFilter:'all', safety:14, cover:45, scenario:'msrp' };
  /* Assumptions mirror the SKU master sheet: FX, 3% export markup, 15% freight buffer, 38% operating cost. */
  const assumptions = { fx:7.0, exportMarkup:3, freightBuffer:15, ddpFixedRmb:900, oceanRmbPerKg:8.5, hybridFixedRmb:140, parcelRmbPerKg:14.6, operatingPct:38, shipMode:'auto', dealerDiscount:30, dealerSupportPct:5, disc1:10, disc2:15, disc3:25, clearanceOpsPct:8 };
  const OPEX = [['kol', 'KOL', 'KOL', 4], ['ads', '广告', 'Advertising', 10], ['txn', '交易手续费', 'Transaction fees', 5], ['wh', '仓库', 'Warehouse', 2.5], ['rma', '售后退换', 'Returns & after-sales', 1.5], ['team', '团队运营', 'Team operations', 12], ['mgmt', '管理成本', 'Management', 3]];
  const canDetail = () => (ctx.state().actor?.grants || []).includes('product_cost_detail') && !ui.viewAsBasic;
  const bySku = sku => products.find(p => p.sku === sku);

  /* ---------- cost model (per unit, USD) — follows the SKU master sheet ---------- */
  /* ---------- per-SKU cost settings (editable, saved) and live FX ---------- */
  const OV_KEY = 'workos-cost-overrides-v1';
  const ov = (() => { try { return JSON.parse(localStorage.getItem(OV_KEY) || '{}') || {}; } catch { return {}; } })();
  const saved = JSON.parse(JSON.stringify(ov));
  const ovOf = sku => ov[sku] || (ov[sku] = { fields:{}, assume:{}, opex:{} });
  const eff = p => ({ ...p, ...(ov[p.sku]?.fields || {}) });
  const assumeFor = p => ({ ...assumptions, ...(ov[p?.sku]?.assume || {}) });
  const opexPct = (p, k) => { const v = ov[p?.sku]?.opex?.[k]; return v != null ? v : OPEX.find(o => o[0] === k)[3]; };
  const opexSum = p => OPEX.reduce((n, o) => n + opexPct(p, o[0]), 0);
  const dirty = sku => JSON.stringify(ov[sku] || null) !== JSON.stringify(saved[sku] || null) && !(isEmptyOv(ov[sku]) && !saved[sku]);
  const isEmptyOv = o => !o || (!Object.keys(o.fields || {}).length && !Object.keys(o.assume || {}).length && !Object.keys(o.opex || {}).length);
  function saveOv(sku) { if (isEmptyOv(ov[sku])) { delete ov[sku]; delete saved[sku]; } else saved[sku] = JSON.parse(JSON.stringify(ov[sku])); try { localStorage.setItem(OV_KEY, JSON.stringify(saved)); } catch {} }
  // failedAt: a failed or empty FX answer waits 5 minutes before the next try, so a render never re-triggers the request in a loop.
  const fxState = { live:null, asOf:null, source:null, locked:false, loading:false, failedAt:0 };
  function loadFx() {
    if (fxState.loading || fxState.live || !ctx?.api?.get || ctx.state().capabilities?.liveFx === false) return;
    if (fxState.failedAt && Date.now() - fxState.failedAt < 5 * 60 * 1000) return;
    fxState.loading = true;
    ctx.api.get('/fx').then(r => { if (Number.isFinite(r?.rate)) { fxState.live = r.rate; fxState.asOf = r.asOf; fxState.source = r.source; fxState.failedAt = 0; if (!fxState.locked) assumptions.fx = Math.round(r.rate * 10000) / 10000; } else fxState.failedAt = Date.now(); }).catch(() => { fxState.failedAt = Date.now(); }).finally(() => { fxState.loading = false; ctx.rerender(); });
  }
  function cost(p0, scenario = ui.scenario) {
    const p = eff(p0), a = assumeFor(p0), fx = a.fx, buf = 1 + a.freightBuffer / 100;
    const extraUsd = (p.extraRmb || 0) / fx;
    const productUsd = p.factoryUsd != null ? p.factoryUsd + extraUsd : p.factoryRmb != null ? p.factoryRmb * (1 + a.exportMarkup / 100) / fx + extraUsd : null;
    const vol = p.dims && p.dims.every(x => x > 0) ? p.dims[0] * p.dims[1] * p.dims[2] / 6000 : null;
    const billKg = Math.max(p.gross || 0, vol || 0) || null;
    let ddp = null, hybrid = null, ddpNote = '', hybNote = '';
    if (billKg) {
      const rate = p.ddpRate ?? a.parcelRmbPerKg;
      ddp = (rate * billKg * buf + a.ddpFixedRmb) / fx; ddpNote = `¥${rate}/kg × ${billKg.toFixed(1)}kg × ${buf.toFixed(2)} + ¥${a.ddpFixedRmb}`;
      if (p.lastMileRmb != null) { hybrid = (a.oceanRmbPerKg * buf * billKg + a.hybridFixedRmb + p.lastMileRmb) / fx; hybNote = `¥${a.oceanRmbPerKg}/kg × ${billKg.toFixed(1)}kg × ${buf.toFixed(2)} + ¥${a.hybridFixedRmb} + ${tr('尾程', 'last mile')} ¥${p.lastMileRmb}`; }
    }
    const mode = a.shipMode === 'ddp' ? 'ddp' : a.shipMode === 'hybrid' && hybrid != null ? 'hybrid' : (hybrid != null && (ddp == null || hybrid < ddp) ? 'hybrid' : 'ddp');
    const ship = mode === 'hybrid' ? hybrid : ddp;
    const hard = productUsd != null ? productUsd + (ship || 0) : null;
    const price = scenario === 'low' && p.low ? p.low : p.msrp;
    const opex = price ? OPEX.map(([k, zh, en]) => [k, tr(zh, en), price * opexPct(p0, k) / 100, opexPct(p0, k)]) : [];
    const opexTotal = price ? price * opexSum(p0) / 100 : null;
    const total = hard != null && opexTotal != null ? hard + opexTotal : null;
    const revenue = price ? price + (p.shipFee || 0) : null;
    const profit = total != null && revenue != null ? revenue - total : null;
    const margin = profit != null ? profit / revenue * 100 : null;
    const landPct = hard != null && revenue ? hard / revenue * 100 : null;
    const missing = [productUsd == null && tr('工厂价', 'factory price'), !billKg && tr('重量 / 尺寸', 'weight / dimensions'), !price && tr('零售价', 'retail price')].filter(Boolean);
    const cheapest = [ddp, hybrid].filter(x => x != null).sort((x, y) => x - y)[0];
    const minCost = productUsd != null ? productUsd + (cheapest || 0) : null;
    const dealer = p.msrp ? p.msrp * (1 - a.dealerDiscount / 100) : null;
    const dealerProfit = dealer != null && minCost != null ? dealer - minCost - dealer * a.dealerSupportPct / 100 : null;
    const dealerMargin = dealerProfit != null ? dealerProfit / dealer * 100 : null;
    return { minCost, dealer, dealerProfit, dealerMargin, productUsd, vol, billKg, ddp, hybrid, ddpNote, hybNote, mode, ship, hard, price, opex, opexTotal, total, revenue, profit, margin, landPct, missing };
  }
  /* ---------- price ladder: every price point with its profit ---------- */
  function ladder(p) {
    const c = cost(p, 'msrp'), a = assumeFor(p), hard = c.minCost, pe = eff(p), ship = pe.shipFee || 0, opsPct = opexSum(p);
    p = pe;
    if (hard == null) return { c, rows:[] };
    const direct = (key, label, price, note) => { if (!price) return null; const ops = price * opsPct / 100, rev = price + ship, profit = rev - hard - ops; return { key, label, price, note, rev, hard, ops, profit, margin:profit / rev * 100 }; };
    const clearFloor = hard * 1.05 / (1 - a.clearanceOpsPct / 100);
    const rows = [
      direct('msrp', tr('零售价 MSRP', 'MSRP'), p.msrp, tr('官网标价', 'List price')),
      direct('d1', tr(`折扣力度 1（−${a.disc1}%）`, `Discount 1 (−${a.disc1}%)`), p.msrp && p.msrp * (1 - a.disc1 / 100), tr('日常促销', 'Everyday promo')),
      direct('d2', tr(`折扣力度 2（−${a.disc2}%）`, `Discount 2 (−${a.disc2}%)`), p.msrp && p.msrp * (1 - a.disc2 / 100), tr('节日大促', 'Holiday sale')),
      direct('d3', tr(`折扣力度 3（−${a.disc3}%）`, `Discount 3 (−${a.disc3}%)`), p.msrp && p.msrp * (1 - a.disc3 / 100), tr('黑五 / 年度最低', 'Black Friday / yearly low')),
      p.low ? direct('low', tr('表格最低价 LowPrice', 'Sheet low price'), p.low, tr('SKU 总表里的最低售价', 'From the SKU master sheet')) : null,
      (() => { if (!p.msrp) return null; const price = p.msrp * (1 - a.dealerDiscount / 100), ops = price * a.dealerSupportPct / 100, profit = price - hard - ops; return { key:'dealer', label:tr(`经销商售价（零售价 −${a.dealerDiscount}%）`, `Dealer price (MSRP −${a.dealerDiscount}%)`), price, note:tr('经销商自付尾程，我们只承担分销支持费用', 'Dealer pays last mile; we carry dealer support only'), rev:price, hard, ops, profit, margin:profit / price * 100 }; })(),
      (() => { const price = clearFloor, ops = price * a.clearanceOpsPct / 100, profit = price - hard - ops; return { key:'floor', label:tr('清货最低价', 'Clearance floor'), price, note:tr(`最低成本 × 1.05，再覆盖 ${a.clearanceOpsPct}% 交易和仓储费用；低于这个价就是亏本卖`, `Lowest cost × 1.05 plus ${a.clearanceOpsPct}% transaction & storage fees — below this you sell at a loss`), rev:price, hard, ops, profit, margin:profit / price * 100 }; })(),
    ].filter(Boolean);
    return { c, rows };
  }
  function ladderTable(p) {
    const { rows } = ladder(p);
    if (!rows.length) return '';
    const max = Math.max(...rows.map(r => r.rev));
    return `<section class="pd-card pd-ladder"><div class="pd-card-head"><h3>${icon('stairs')} ${tr('价格阶梯与利润（每台，USD）', 'Price ladder & profit (per unit, USD)')}</h3><span class="pd-hint">${tr('硬成本按最低成本（产品 + 最便宜的头程）计算；直营价另收结账运费，运营成本按售价比例计。', 'Hard cost uses the lowest cost (product + cheapest freight); direct prices add the checkout shipping fee; operating cost scales with price.')}</span></div>
      <table class="pd-table" data-help-table="pd-ladder"><thead><tr><th>${tr('价格档', 'Price point')}</th><th class="num">${tr('售价', 'Price')}</th><th class="num">${tr('实收（含运费）', 'Revenue')}</th><th class="num">${tr('最低成本', 'Lowest cost')}</th><th class="num">${tr('运营 / 费用', 'Opex / fees')}</th><th class="num">${tr('净利润', 'Net profit')}</th><th class="num">${tr('利润率', 'Margin')}</th><th style="width:22%">${tr('构成', 'Mix')}</th></tr></thead><tbody>
      ${rows.map(r => { const tone = r.margin >= 20 ? 'good' : r.margin >= 8 ? 'mid' : 'bad'; return `<tr class="pd-lad ${r.key}"><td><strong>${esc(r.label)}</strong><span class="pd-sub">${esc(r.note)}</span></td><td class="num"><b>${usd(r.price)}</b></td><td class="num">${usd(r.rev)}</td><td class="num">${usd(r.hard)}</td><td class="num">${usd(r.ops)}</td><td class="num pd-${tone === 'bad' ? 'bad' : tone === 'good' ? 'good' : ''}"><b>${usd(r.profit)}</b></td><td class="num"><span class="pd-margin ${tone}">${r.margin.toFixed(1)}%</span></td><td><div class="pd-mix" style="width:${r.rev / max * 100}%"><i style="flex:${r.hard};background:#9699a6" title="${tr('最低成本', 'Lowest cost')}"></i><i style="flex:${r.ops};background:#fdab3d" title="${tr('运营费用', 'Opex')}"></i><i style="flex:${Math.max(0, r.profit)};background:#00c875" title="${tr('利润', 'Profit')}"></i></div></td></tr>`; }).join('')}
      </tbody></table><ul class="pd-legend-inline"><li><i style="background:#9699a6"></i>${tr('最低成本', 'Lowest cost')}</li><li><i style="background:#fdab3d"></i>${tr('运营 / 费用', 'Opex / fees')}</li><li><i style="background:#00c875"></i>${tr('净利润', 'Net profit')}</li><li>${tr('利润率：绿 ≥20%，橙 8–20%，红 <8%', 'Margin: green ≥20%, orange 8–20%, red <8%')}</li></ul></section>`;
  }

  /* ---------- supply chain rows: real inventory injected at runtime, else derived from the sample catalog ---------- */
  const INV = window.WORKOS_INVENTORY_DATA;
  const invSource = INV?.source || tr('示例库存', 'Sample inventory');
  const isMachine = t => /整机/.test(t || '');
  const stockRows = (INV?.items || products.map(p => ({ sku:p.sku, name:L(p.name), type:p.type, factory:tr('示例工厂', 'Sample factory'), unitUsd:p.factoryRmb ? p.factoryRmb / assumptions.fx : 0, wh:p.wh, dg:p.ready, jn:0, transit:p.transit, transitEta:p.transit ? [[addDays(machineDays(p)).toISOString().slice(0, 10), p.transit]] : [], velocity:p.velocity, oldestAge:p.age, avgAge:Math.round(p.age * .7), aged90:p.age > 90 ? p.wh : 0, repair:0, out90:Math.round(p.velocity * 90) }))).map(r => {
    const cat = bySku(r.sku), machine = isMachine(r.type);
    return { ...r, cat, machine, status:cat?.status || 'none', factoryStock:(r.dg || 0) + (r.jn || 0), agedUnits:Math.min(r.wh || 0, r.aged90 || 0),
      moq:machine ? 5 : 20, prodDays:machine ? 25 : 12, shipDays:machine ? 35 : 20, icon:iconFor(r.type || '') };
  });
  if (INV) products.forEach(p => { const r = stockRows.find(x => x.sku === p.sku); if (r) Object.assign(p, { wh:r.wh || 0, transit:r.transit || 0, ready:r.factoryStock, wip:0, velocity:r.velocity || 0, age:r.oldestAge || 0 }); else Object.assign(p, { wh:0, transit:0, ready:0, wip:0 }); });
  function machineDays(p) { return /整机/.test(p.type || '') ? 30 : 14; }
  function supply(r) {
    const v = r.velocity || 0, lead = r.prodDays + r.shipDays, pipeline = (r.wh || 0) + (r.transit || 0) + r.factoryStock;
    const cover = v > 0 ? r.wh / v : Infinity, pipeCover = v > 0 ? pipeline / v : Infinity;
    const rop = v * (lead + ui.safety);
    const need = v * (lead + ui.safety + ui.cover) - pipeline;
    const qty = need > 0 ? Math.ceil(need / r.moq) * r.moq : 0;
    const orderIn = v > 0 ? Math.floor((pipeline - rop) / v) : Infinity;
    // Ship from factory stock before ordering more: transfer is ~35 days, a new PO is production + shipping.
    const transferQty = v > 0 && r.factoryStock > 0 ? Math.min(r.factoryStock, Math.max(0, Math.ceil(v * (r.shipDays + ui.safety + ui.cover) - r.wh - (r.transit || 0)))) : 0;
    let state = 'ok';
    if (v === 0 && pipeline > 0) state = 'idle';
    else if (v > 0 && cover < 14 && r.wh + (r.transit || 0) < v * 14) state = 'stockout';
    else if ((qty > 0 && orderIn <= 0) || transferQty > 0) state = 'reorder';
    else if (v > 0 && pipeCover > (lead + ui.safety + ui.cover) * 1.8) state = 'excess';
    if (['eol', 'eolPlanned', 'clearance'].includes(r.status) && ['stockout', 'reorder'].includes(state)) state = 'ok';
    if (!['stockout', 'reorder'].includes(state) && r.wh > 0 && r.oldestAge > ui.ageLimit) state = 'aged';
    const nextEta = (r.transitEta || []).filter(x => x[1] > 0).sort((x, y) => x[0].localeCompare(y[0]))[0];
    return { lead, pipeline, cover, pipeCover, rop, qty, orderIn, transferQty, state, nextEta, value:qty * (r.unitUsd || 0), whValue:(r.wh || 0) * (r.unitUsd || 0) };
  }
  const STATE = { stockout:['即将缺货','Stock-out risk','bad','#e2445c','warning-octagon'], reorder:['需要补货','Reorder now','warn','#fdab3d','arrow-clockwise'], aged:['库存超期','Aged stock','aged','#a25ddc','hourglass-low'], excess:['库存过多','Overstock','info','#579bfc','stack'], idle:['无销量','No sales','muted','#9699a6','moon'], ok:['正常','Healthy','ok','#00c875','check-circle'] };

  /* ---------- shell ---------- */
  const PAGES = {
    catalog:['PRODUCT HUB · CATALOG', '产品管理', 'Product catalog', '查询产品，由产品经理补齐属性，建立公司完整的产品目录。', 'Look up products; PMs complete the attributes to build the full company catalog.'],
    cost:['PRODUCT HUB · COST', '成本核算', 'Cost calculator', '输入 SKU 或名称，查看最低成本、分销价和最终售价。成本明细由总裁授权查看。', 'Enter a SKU or name to see the lowest cost, dealer price and retail price. Cost details are granted by the president.'],
    supply:['PRODUCT HUB · SUPPLY CHAIN', '智能供应链', 'Smart supply chain', '用颜色一眼看出哪些 SKU 需要补货、库存超期或库存过多，并自动给出补货建议。', 'Colors show at a glance which SKUs need reordering, have aged stock or are overstocked, with automatic reorder suggestions.'],
  };
  function render(tab) {
    if (!ctx) return '';
    if (tab && tab !== ui.tab) { ui.tab = tab; ui.product = null; }
    let [eyebrow, zh, en, dzh, den] = PAGES[ui.tab] || PAGES.catalog;
    if (ui.tab === 'cost' && !canDetail()) { dzh = '输入 SKU 或名称，查询产品的零售价。'; den = 'Enter a SKU or name to look up the retail price.'; }
    return `<div class="pd">
      <div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${tr(zh, en)}</h1><p>${tr(dzh, den)}</p></div></div>
      <div class="pd-banner">${icon('lock-simple')} ${tr(`受限区域 · 测试原型 · 数据来源：${source} · 修改不会保存`, `Restricted · test prototype · data: ${source} · changes are not saved`)}</div>
      ${ui.tab === 'cost' ? costBoard() : ui.tab === 'supply' ? supplyBoard() : ui.product ? productEditor(bySku(ui.product)) : catalog()}
    </div>`;
  }

  /* ---------- 1. catalog (Shopify admin style) ---------- */
  const pill = k => `<span class="pd-pill" style="--c:${STATUS[k][2]}">${esc(tr(STATUS[k][0], STATUS[k][1]))}</span>`;
  const types = [...new Set(products.map(p => p.type).filter(Boolean))];
  const ATTRS = [['name', '名称', 'Name'], ['sku', 'SKU', 'SKU'], ['type', '产品线', 'Product line'], ['msrp', '零售价 MSRP', 'MSRP'], ['gross', '毛重', 'Gross weight'], ['dims', '包装尺寸', 'Package size'], ['best', '最优发货方式', 'Best shipping'], ['lead', '交期', 'Lead time']];
  const missingAttrs = p => ATTRS.filter(([k]) => { const v = p[k]; return v == null || v === '' || (Array.isArray(v) && !v.every(x => x > 0)); });
  const completeness = p => Math.round((ATTRS.length - missingAttrs(p).length) / ATTRS.length * 100);
  function catalog() {
    const q = ui.search.trim().toLowerCase();
    const list = products.filter(p => (!q || `${p.sku} ${nameText(p)} ${p.type || ''}`.toLowerCase().includes(q)) && (!ui.typeFilter || p.type === ui.typeFilter) && (!ui.statusFilter || p.status === ui.statusFilter) && (!ui.incomplete || completeness(p) < 100));
    const incompleteN = products.filter(p => completeness(p) < 100).length;
    const counts = Object.keys(STATUS).map(k => [k, products.filter(p => p.status === k).length]).filter(x => x[1]);
    const detail = canDetail();
    return `<div class="pd-toolbar"><label class="pd-search">${icon('magnifying-glass')}<input data-pd-search placeholder="${tr('搜索 SKU、名称或产品线', 'Search SKU, name or product line')}" value="${esc(ui.search)}"></label>
      <select class="pd-select inline" data-pd-filter="typeFilter"><option value="">${tr('全部产品线', 'All product lines')} (${products.length})</option>${types.map(t => `<option value="${esc(t)}" ${ui.typeFilter === t ? 'selected' : ''}>${esc(t)} (${products.filter(p => p.type === t).length})</option>`).join('')}</select>
      <button class="pd-btn primary" data-pd="new-product">${icon('plus')} ${tr('添加产品', 'Add product')}</button></div>
      <div class="pd-chips"><button class="pd-chip warn ${ui.incomplete ? 'on' : ''}" data-pd="incomplete">${icon('pencil-simple-line')} ${tr('资料待补齐', 'Needs attributes')} ${incompleteN}</button>${counts.map(([k, n]) => `<button class="pd-chip ${ui.statusFilter === k ? 'on' : ''}" data-pd="status-filter" data-v="${k}"><i style="--c:${STATUS[k][2]}"></i>${esc(tr(STATUS[k][0], STATUS[k][1]))} ${n}</button>`).join('')}</div>
      <section class="pd-card"><table class="pd-table" data-help-table="pd-catalog"><thead><tr><th>${tr('产品', 'Product')}</th><th>${tr('供应链状态', 'Status')}</th><th>${tr('产品线', 'Product line')}</th><th class="num">${tr('海外仓', 'Warehouse')}</th><th>${tr('资料完整度', 'Completeness')}</th><th>${tr('最优发货方式', 'Best shipping')}</th><th class="num">${tr('零售价 MSRP', 'MSRP')}</th></tr></thead><tbody>
      ${list.map(p => `<tr data-pd="open-product" data-sku="${esc(p.sku)}" tabindex="0"><td><div class="pd-prod"><span class="pd-thumb">${icon(p.icon)}</span><div><strong>${esc(L(p.name))}</strong><span>${esc(p.sku) || tr('无 SKU', 'No SKU')}${p.note ? ` · ${esc(p.note)}` : ''}</span></div></div></td><td>${pill(p.status)}</td><td>${esc(p.type || '—')}</td><td class="num ${p.wh < 5 && p.velocity ? 'pd-bad' : ''}">${p.wh}${p.transit ? `<small> · ${p.transit} ${tr('在途', 'inbound')}</small>` : ''}</td><td>${(() => { const c = completeness(p); return `<span class="pd-complete ${c === 100 ? 'ok' : c >= 75 ? 'mid' : 'low'}" title="${esc(missingAttrs(p).map(a => tr(a[1], a[2])).join('、'))}"><i style="--w:${c}%"></i><b>${c}%</b></span>`; })()}</td><td>${esc(p.best || '—')}</td><td class="num">${p.msrp ? usd(p.msrp) : '—'}</td></tr>`).join('') || `<tr><td colspan="7" class="pd-empty">${tr('没有匹配的产品', 'No matching products')}</td></tr>`}
      </tbody></table></section>`;
  }
  function productEditor(p) {
    if (!p) return catalog();
    const s = supply(p), detail = canDetail(), c = cost(p);
    const f = (label, value, attrs = '') => `<label class="pd-field"><span>${label}</span><input value="${esc(value ?? '')}" ${attrs}></label>`;
    return `<div class="pd-crumb"><button data-pd="back">${icon('caret-left')} ${tr('全部产品', 'All products')}</button></div>
      <div class="pd-editor-head"><span class="pd-thumb big">${icon(p.icon)}</span><div><h2>${esc(L(p.name))}</h2><p>${esc(p.sku)} · ${esc(p.type || '')}</p></div>${pill(p.status)}<button class="pd-btn primary" data-pd="save-product">${tr('保存', 'Save')}</button></div>
      ${missingAttrs(p).length ? `<div class="pd-warn">${icon('pencil-simple-line')} ${tr('待产品经理补齐：', 'For the PM to complete: ')}${esc(missingAttrs(p).map(a => tr(a[1], a[2])).join('、'))}</div>` : ''}
      <div class="pd-editor">
        <div class="pd-main">
          <section class="pd-card"><h3>${tr('基本信息', 'Basics')}</h3><div class="pd-grid3">${f(tr('产品名称', 'Title'), L(p.name))}${f('SKU', p.sku)}${f(tr('产品线', 'Product line'), p.type)}</div>${f(tr('备注', 'Notes'), p.note)}</section>
          <section class="pd-card"><h3>${tr('媒体', 'Media')}</h3><div class="pd-media">${[1, 2, 3].map(() => `<span class="pd-thumb big">${icon(p.icon)}</span>`).join('')}<button class="pd-media-add">${icon('upload-simple')}<span>${tr('上传图片 / 视频', 'Upload images / video')}</span></button></div></section>
          <section class="pd-card"><h3>${tr('价格', 'Pricing')}</h3><div class="pd-grid3">${f(tr('零售价 MSRP (USD)', 'MSRP (USD)'), p.msrp, 'type="number"')}</div>
            <p class="pd-hint">${icon('lock-simple')} ${tr('产品管理只维护零售价 MSRP。折扣价、经销价、成本等都在“成本核算”里，由授权人员查看。', 'The catalog keeps MSRP only. Discounts, dealer prices and costs live in the Cost calculator for authorized people.')}</p></section>
          <section class="pd-card"><h3>${tr('物流参数', 'Shipping')}</h3><div class="pd-grid3">${f(tr('毛重 (kg)', 'Gross weight (kg)'), p.gross)}${f(tr('包装尺寸 长×宽×高 (cm)', 'Package L×W×H (cm)'), p.dims ? p.dims.join(' × ') : '')}${f(tr('体积重 (kg，÷6000)', 'Volumetric kg (÷6000)'), c.vol != null ? c.vol.toFixed(1) : '')}${f(tr('最优发货方式', 'Best shipping method'), p.best)}</div></section>
          <section class="pd-card"><h3>${tr('采购与供应', 'Sourcing')}</h3><div class="pd-grid3">${f(tr('交期', 'Lead time'), p.lead)}${f(tr('最小起订量 (MOQ)', 'MOQ'), p.moq)}${f(tr('计算用总交期（天）', 'Lead time used (days)'), s.lead)}</div><p class="pd-hint">${icon('truck')} ${tr(`海外仓 ${p.wh} 件 · 在途 ${p.transit} 件 · 工厂待发 ${p.ready} 件 · 生产中 ${p.wip} 件${INV ? '' : '（库存为示例，待接入真实库存）'}`, `${p.wh} at warehouse · ${p.transit} inbound · ${p.ready} ready · ${p.wip} in production${INV ? '' : ' (sample stock until real inventory is connected)'}`)}</p></section>
        </div>
        <aside class="pd-side">
          <section class="pd-card"><h3>${tr('供应链状态', 'Supply status')}</h3><select class="pd-select">${Object.keys(STATUS).filter(k => k !== 'none').map(k => `<option ${k === p.status ? 'selected' : ''}>${esc(tr(STATUS[k][0], STATUS[k][1]))}</option>`).join('')}</select>
            <ol class="pd-life">${['dev', 'launch', 'live', 'clearance', 'eolPlanned', 'eol'].map((k, i, arr) => `<li class="${k === p.status ? 'on' : arr.indexOf(p.status) > i ? 'past' : ''}"><i style="--c:${STATUS[k][2]}"></i>${esc(tr(STATUS[k][0], STATUS[k][1]))}</li>`).join('')}</ol></section>
          <section class="pd-card"><h3>${tr('销售渠道', 'Sales channels')}</h3>${Object.keys(CHANNELS).map(ch => `<label class="pd-check"><input type="checkbox" ${ch === 'shopify' && p.msrp ? 'checked' : ''}> ${esc(L(CHANNELS[ch]))}</label>`).join('')}</section>
        </aside>
      </div>`;
  }

  /* ---------- 2. cost calculator ---------- */
  const pct = n => n == null ? '—' : `${n.toFixed(1)}%`;
  function costBoard() {
    const q = ui.costQuery.trim().toLowerCase();
    const matches = q ? products.filter(p => `${p.sku} ${nameText(p)}`.toLowerCase().includes(q)).slice(0, 8) : [];
    const p = bySku(ui.costSku), detail = canDetail();
    const c = p && cost(p);
    const previewSwitch = window.WORKOS_PREVIEW && (ctx.state().actor?.grants || []).includes('product_cost_detail') ? `<label class="pd-preview-switch"><input type="checkbox" data-pd-viewas ${ui.viewAsBasic ? 'checked' : ''}> ${tr('预览：以“只看最终成本”的身份查看（如袁勇）', 'Preview: view as a final-cost-only user')}</label>` : '';
    const scen = `<div class="pd-seg">${[['msrp', tr('按零售价 MSRP', 'At MSRP')], ['low', tr('按最低价 LowPrice', 'At low price')]].map(([k, l]) => `<button class="${ui.scenario === k ? 'active' : ''}" data-pd="scenario" data-v="${k}">${l}</button>`).join('')}</div>`;
    const line = (label, formula, v, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="pd-formula">${esc(formula)}</td><td class="num">${v == null ? '—' : usd(v)}</td><td class="pd-share">${v != null && c.revenue ? `<i style="width:${Math.min(100, Math.max(0, Math.round(v / c.revenue * 100)))}%"></i>` : ''}</td></tr>`;
    const A = p ? assumeFor(p) : assumptions; loadFx();
    return `<div class="pd-cost">
      <div class="pd-cost-search"><label class="pd-search big">${icon('magnifying-glass')}<input data-pd-cost placeholder="${tr('输入 SKU 或产品名称，例如 Cobra 或 OCL-CBR', 'Enter a SKU or name, e.g. Cobra or OCL-CBR')}" value="${esc(ui.costQuery)}" autocomplete="off"></label>
        ${matches.length ? `<div class="pd-suggest">${matches.map(m => `<button data-pd="pick-cost" data-sku="${esc(m.sku)}"><span class="pd-thumb">${icon(m.icon)}</span><strong>${esc(m.sku)}</strong> ${esc(L(m.name))}</button>`).join('')}</div>` : ''}
        ${previewSwitch}</div>
      ${p && !detail ? `<section class="pd-card pd-cost-hero basic"><div class="pd-prod"><span class="pd-thumb big">${icon(p.icon)}</span><div><strong>${esc(L(p.name))}</strong><span>${esc(p.type || '')}</span></div>${pill(p.status)}</div>
        <div class="pd-final"><span>SKU</span><strong class="mono">${esc(p.sku) || '—'}</strong></div>
        <div class="pd-final"><span>${tr('零售价', 'Retail price')}</span><strong>${p.msrp ? usd(p.msrp) : '—'}</strong></div></section>` : ''}
      ${p && detail ? `<section class="pd-card pd-cost-hero"><div class="pd-prod"><span class="pd-thumb big">${icon(p.icon)}</span><div><strong>${esc(L(p.name))}</strong><span>${esc(p.sku)} · ${esc(p.type || '')}</span></div>${pill(p.status)}</div>
        <div class="pd-kpis">
          <div class="pd-kpi"><span>${tr('最低成本（到美国仓）', 'Lowest cost (to US warehouse)')}</span><strong>${c.minCost != null ? usd(c.minCost) : '—'}</strong><em>${tr('产品 + 最便宜的头程', 'product + cheapest freight')}</em></div>
          <div class="pd-kpi"><span>${tr('分销价', 'Dealer price')}</span><strong>${c.dealer != null ? usd(c.dealer) : '—'}</strong><em class="${c.dealerMargin != null && c.dealerMargin < 10 ? 'pd-bad' : 'pd-good'}">${tr('零售价', 'MSRP')} −${assumptions.dealerDiscount}% · ${tr('分销利润', 'dealer profit')} ${c.dealerProfit != null ? usd(c.dealerProfit) : '—'} (${pct(c.dealerMargin)})</em></div>
          <div class="pd-kpi"><span>${tr('最终售价 MSRP / 最低价', 'Retail MSRP / low price')}</span><strong>${p.msrp ? usd(p.msrp) : '—'}</strong><em>${tr('最低价', 'Low')} ${p.low ? usd(p.low) : '—'} · ${tr('结账运费', 'shipping fee')} ${usd(p.shipFee || 0)}</em></div>
          <div class="pd-kpi"><span>${tr('直营净利润', 'Direct net profit')} · ${ui.scenario === 'low' ? tr('最低价', 'low price') : 'MSRP'}</span><strong class="${c.profit != null && c.profit < 0 ? 'pd-bad' : ''}">${c.profit != null ? usd(c.profit) : '—'}</strong><em class="${c.margin != null && c.margin < 15 ? 'pd-bad' : 'pd-good'}">${tr('净利率', 'Net margin')} ${pct(c.margin)} · ${tr('全成本', 'full cost')} ${c.total != null ? usd(c.total) : '—'}</em></div>
        </div></section>` : ''}
      ${p ? `
        ${p && detail ? ladderTable(p) : ''}
        ${detail && c.missing.length ? `<div class="pd-warn">${icon('warning')} ${tr('缺少数据，结果不完整：', 'Missing data, result incomplete: ')}${esc(c.missing.join('、'))}</div>` : ''}
        ${detail ? `<div class="pd-cost-grid"><section class="pd-card"><div class="pd-card-head"><h3>${tr('成本构成（每台，USD）', 'Cost breakdown (per unit, USD)')}</h3>${scen}</div><table class="pd-table pd-breakdown"><tbody>
            ${line(tr('产品成本', 'Product cost'), p.factoryUsd != null ? tr('工厂美元报价', 'factory USD quote') : p.factoryRmb != null ? `¥${int(p.factoryRmb)} × ${(1 + A.exportMarkup / 100).toFixed(2)} ÷ ${A.fx}` : '', c.productUsd)}
            ${line(`${tr('头程到仓', 'Freight to warehouse')} · ${c.mode === 'hybrid' ? 'Hybrid' : 'DDP'}`, c.mode === 'hybrid' ? `(${c.hybNote}) ÷ ${A.fx}` : `(${c.ddpNote}) ÷ ${A.fx}`, c.ship)}
            ${line(tr('硬成本', 'Hard cost'), '', c.hard, 'pd-subtotal')}
            ${c.opex.map(([k, label, v, pc]) => line(label, `${tr('售价', 'price')} × ${pc}%`, v)).join('')}
            ${line(tr(`运营成本合计（${opexSum(p)}%）`, `Operating cost (${opexSum(p)}%)`), '', c.opexTotal, 'pd-subtotal')}
            ${line(tr('最终成本', 'Final cost'), tr('硬成本 + 运营成本', 'hard + operating'), c.total, 'pd-total')}
            ${line(tr('收入（售价 + 结账运费）', 'Revenue (price + shipping fee)'), '', c.revenue)}
            ${line(tr('净利润', 'Net profit'), tr('收入 − 最终成本', 'revenue − final cost'), c.profit, 'pd-total')}
          </tbody></table>
          <div class="pd-ship-compare"><h4>${tr('发货方式对比（头程到仓，每台）', 'Shipping comparison (to warehouse, per unit)')}</h4>
            <div class="pd-compare-row ${c.mode === 'ddp' ? 'on' : ''}"><b>DDP</b><span>${esc(c.ddpNote || '—')}</span><strong>${c.ddp != null ? usd(c.ddp) : '—'}</strong></div>
            <div class="pd-compare-row ${c.mode === 'hybrid' ? 'on' : ''}"><b>Hybrid</b><span>${esc(c.hybNote || tr('无美国尾程报价', 'no US last-mile quote'))}</span><strong>${c.hybrid != null ? usd(c.hybrid) : '—'}</strong></div>
            <p class="pd-hint">${tr(`表格标注的最优方式：${p.best || '未标注'}。计费重量取毛重与体积重（长×宽×高÷6000）较大者：${c.billKg ? c.billKg.toFixed(1) + 'kg' : '—'}。`, `Sheet's best method: ${p.best || 'not set'}. Billable weight = max(gross, L×W×H÷6000): ${c.billKg ? c.billKg.toFixed(1) + 'kg' : '—'}.`)}</p></div></section>
          ${costSettings(p, c)}</div>`
        : `<div class="pd-locked">${icon('lock-simple')} ${tr('成本、分销价和利润仅限总裁授权的人员查看。你可以查询 SKU 和零售价。', 'Cost, dealer price and profit are visible only to people the president has authorized. You can look up SKUs and retail prices.')}</div>`}` : `<p class="pd-hint">${tr('输入 SKU 或名称开始查询。', 'Enter a SKU or name to start.')}</p>`}
    </div>`;
  }

  /* ---------- editable, savable cost settings for one SKU ---------- */
  function costSettings(p, c) {
    const o = ovOf(p.sku), base = p, A = assumeFor(p);
    const num = (group, key, label, value, def, step = 1, unit = '') => { const changed = o[group][key] != null; return `<label class="pd-field ${changed ? 'changed' : ''}"><span>${label}${unit ? ` <em>${unit}</em>` : ''}</span><input type="number" step="${step}" data-pd-ov="${group}.${key}" value="${value ?? ''}" placeholder="${def ?? ''}">${changed ? `<small>${tr('表格原值', 'Sheet value')}：${def ?? '—'}</small>` : ''}</label>`; };
    const f = k => o.fields[k] ?? base[k], a = k => o.assume[k] ?? assumptions[k];
    const fx = `<div class="pd-fx">${icon('currency-circle-dollar')} <div><strong>USD/CNY ${A.fx}</strong><span>${fxState.live ? tr(`实时汇率 ${fxState.live}（${fxState.source}，${fxState.asOf || ''}）`, `Live rate ${fxState.live} (${fxState.source}, ${fxState.asOf || ''})`) : fxState.loading ? tr('正在获取实时汇率…', 'Fetching live rate…') : tr('未能获取实时汇率，使用默认值', 'Live rate unavailable; using default')}</span></div><label class="pd-check"><input type="checkbox" data-pd-fxlock ${fxState.locked ? 'checked' : ''}> ${tr('锁定汇率', 'Lock rate')}</label>${fxState.locked ? `<input type="number" step="0.01" class="pd-fx-in" data-pd-fx value="${assumptions.fx}">` : ''}</div>`;
    return `<section class="pd-card pd-settings"><div class="pd-card-head"><h3>${icon('sliders-horizontal')} ${tr('成本参数（该 SKU，可修改并保存）', 'Cost settings for this SKU (edit & save)')}</h3>${dirty(p.sku) ? `<span class="pd-unsaved">${tr('有未保存的修改', 'Unsaved changes')}</span>` : ''}</div>
      ${fx}<p class="pd-hint">${tr('汇率按实时汇率自动更新，所有价格档的利润随之重算；需要按固定汇率测算时可以锁定。', 'FX follows the live rate and every price point recalculates; lock it to test a fixed rate.')}</p>
      <h4>${tr('产品成本', 'Product cost')}</h4><div class="pd-grid3">${num('fields', 'factoryRmb', tr('工厂价（含税）', 'Factory price (incl. tax)'), f('factoryRmb'), base.factoryRmb, 10, '¥')}${num('assume', 'exportMarkup', tr('出口加价', 'Export markup'), a('exportMarkup'), assumptions.exportMarkup, .1, '%')}${num('fields', 'extraRmb', tr('其他成本（包装、配件、赠品）', 'Other cost (packing, accessories)'), f('extraRmb'), 0, 10, '¥')}</div>
      <h4>${tr('头程运费', 'Freight')}</h4><div class="pd-grid3">${num('fields', 'gross', tr('毛重', 'Gross weight'), f('gross'), base.gross, .1, 'kg')}${num('fields', 'ddpRate', tr('DDP 单价', 'DDP rate'), f('ddpRate'), base.ddpRate ?? assumptions.parcelRmbPerKg, .1, '¥/kg')}${num('assume', 'ddpFixedRmb', tr('DDP 固定费用', 'DDP fixed fees'), a('ddpFixedRmb'), assumptions.ddpFixedRmb, 10, '¥')}${num('assume', 'oceanRmbPerKg', tr('Hybrid 海运', 'Hybrid ocean'), a('oceanRmbPerKg'), assumptions.oceanRmbPerKg, .1, '¥/kg')}${num('assume', 'hybridFixedRmb', tr('Hybrid 固定费用', 'Hybrid fixed fees'), a('hybridFixedRmb'), assumptions.hybridFixedRmb, 10, '¥')}${num('fields', 'lastMileRmb', tr('美国尾程', 'US last mile'), f('lastMileRmb'), base.lastMileRmb, 10, '¥')}${num('assume', 'freightBuffer', tr('运费上浮', 'Freight buffer'), a('freightBuffer'), assumptions.freightBuffer, 1, '%')}</div>
      <h4>${tr('售价', 'Prices')}</h4><div class="pd-grid3">${num('fields', 'msrp', 'MSRP', f('msrp'), base.msrp, 1, '$')}${num('fields', 'low', tr('最低价', 'Low price'), f('low'), base.low, 1, '$')}${num('fields', 'shipFee', tr('结账运费', 'Shipping fee charged'), f('shipFee'), base.shipFee, 1, '$')}${num('assume', 'disc1', tr('折扣力度 1', 'Discount 1'), a('disc1'), assumptions.disc1, 1, '%')}${num('assume', 'disc2', tr('折扣力度 2', 'Discount 2'), a('disc2'), assumptions.disc2, 1, '%')}${num('assume', 'disc3', tr('折扣力度 3', 'Discount 3'), a('disc3'), assumptions.disc3, 1, '%')}${num('assume', 'dealerDiscount', tr('经销商折扣', 'Dealer discount'), a('dealerDiscount'), assumptions.dealerDiscount, 1, '%')}${num('assume', 'dealerSupportPct', tr('分销支持费用', 'Dealer support'), a('dealerSupportPct'), assumptions.dealerSupportPct, .5, '%')}${num('assume', 'clearanceOpsPct', tr('清货交易与仓储费', 'Clearance fees'), a('clearanceOpsPct'), assumptions.clearanceOpsPct, .5, '%')}</div>
      <h4>${tr(`运营成本（占售价，合计 ${opexSum(p)}%）`, `Operating cost (% of price, total ${opexSum(p)}%)`)}</h4><div class="pd-grid3">${OPEX.map(([k, zh, en, def]) => num('opex', k, tr(zh, en), opexPct(p, k), def, .5, '%')).join('')}</div>
      <label class="pd-field"><span>${tr('头程方式', 'Freight method')}</span><select data-pd-ov="assume.shipMode">${[['auto', tr('自动选更便宜的', 'Cheaper of the two')], ['ddp', 'DDP'], ['hybrid', 'Hybrid']].map(([k, l]) => `<option value="${k}" ${A.shipMode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="pd-actions"><button class="pd-btn primary" data-pd="ov-save" ${dirty(p.sku) ? '' : 'disabled'}>${icon('floppy-disk')} ${tr('保存这个 SKU 的成本设置', 'Save cost settings for this SKU')}</button><button class="pd-btn" data-pd="ov-reset">${icon('arrow-counter-clockwise')} ${tr('恢复表格默认值', 'Reset to sheet values')}</button></div>
      <p class="pd-hint">${tr('修改后上面的成本构成和价格阶梯会马上重算；保存后下次打开仍然生效。测试版保存在本机浏览器，正式版会保存到服务器并记录修改人和时间。', 'Changes recalculate the breakdown and price ladder immediately; saved settings persist. The test build saves in this browser; the release saves to the server with who changed what and when.')}</p></section>`;
  }

  /* ---------- 3. supply chain panorama + replenishment ---------- */
  /* ---------- 3. smart supply chain ---------- */
  const money = n => '$' + (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : int(n));
  const AGE_BUCKETS = [[0, 30, '≤30'], [31, 60, '31–60'], [61, 90, '61–90'], [91, 180, '91–180'], [181, 365, '181–365'], [366, 1e9, '>365']];
  function supplyModel() {
    const rows = stockRows.filter(r => (r.wh || 0) + (r.transit || 0) + r.factoryStock + (r.out90 || 0) > 0).map(r => ({ r, s:supply(r) }));
    const sum = f => rows.reduce((t, x) => t + f(x), 0);
    const whValue = sum(x => x.s.whValue), factoryValue = sum(x => x.r.factoryStock * (x.r.unitUsd || 0)), transitValue = sum(x => (x.r.transit || 0) * (x.r.unitUsd || 0));
    const agedValue = sum(x => x.r.agedUnits * (x.r.unitUsd || 0)), out90 = sum(x => x.r.out90 || 0);
    const dailyCostOut = sum(x => (x.r.velocity || 0) * (x.r.unitUsd || 0));
    const coverDays = dailyCostOut > 0 ? whValue / dailyCostOut : Infinity;
    const ages = AGE_BUCKETS.map(([lo, hi, label]) => [label, sum(x => x.r.wh > 0 && x.r.avgAge >= lo && x.r.avgAge <= hi ? x.s.whValue : 0), lo > 90]);
    const types = [...new Set(rows.map(x => x.r.type || tr('其他', 'Other')))].map(t => { const xs = rows.filter(x => (x.r.type || tr('其他', 'Other')) === t); return { t, wh:xs.reduce((n, x) => n + x.s.whValue, 0), tr:xs.reduce((n, x) => n + (x.r.transit || 0) * (x.r.unitUsd || 0), 0), fac:xs.reduce((n, x) => n + x.r.factoryStock * (x.r.unitUsd || 0), 0) }; }).sort((a, b) => (b.wh + b.tr + b.fac) - (a.wh + a.tr + a.fac));
    const reorders = rows.filter(x => ['stockout', 'reorder'].includes(x.s.state)).sort((a, b) => (a.s.cover === Infinity ? 1e9 : a.s.cover) - (b.s.cover === Infinity ? 1e9 : b.s.cover));
    const clearance = rows.filter(x => x.r.wh > 0 && (x.s.state === 'aged' || x.s.state === 'excess' || x.s.state === 'idle')).map(x => {
      const c = x.r.cat ? cost(x.r.cat) : null, floor = c?.minCost ?? x.r.unitUsd ?? 0, price = x.r.cat?.msrp || null;
      const maxDiscount = price && floor ? Math.max(0, Math.floor((1 - floor * 1.05 / price) * 100)) : null;
      const months = x.r.velocity > 0 ? x.r.wh / x.r.velocity / 30 : Infinity;
      const action = x.r.velocity === 0 ? ['stop', tr('暂停补货，检查上架与定价', 'Pause reorders; check listing & price')] : months > 12 ? ['deep', tr('清仓促销 / 经销商打包', 'Clearance promo / dealer bundle')] : months > 6 ? ['bundle', tr('捆绑赠配件、限时折扣', 'Bundle accessories / limited-time offer')] : ['watch', tr('放缓补货，观察 30 天', 'Slow reorders; review in 30 days')];
      return { ...x, floor, price, maxDiscount, months, action };
    }).sort((a, b) => b.s.whValue - a.s.whValue);
    return { rows, whValue, factoryValue, transitValue, agedValue, out90, coverDays, ages, types, reorders, clearance };
  }
  function svgBars(items, opts = {}) {
    const w = 520, rowH = 26, h = items.length * rowH + 8, max = Math.max(1, ...items.map(i => i.parts.reduce((n, p) => n + p[0], 0)));
    return `<svg class="pd-chart" viewBox="0 0 ${w} ${h}" role="img">${items.map((it, i) => { let x = 130; const y = i * rowH + 4; return `<text x="0" y="${y + 15}" class="pd-ax">${esc(it.label.length > 14 ? it.label.slice(0, 13) + '…' : it.label)}</text>${it.parts.map(([v, color, tip]) => { const bw = v / max * (w - 210); const el = bw > 0 ? `<rect x="${x}" y="${y}" width="${bw}" height="${rowH - 9}" rx="3" fill="${color}"><title>${esc(tip)}</title></rect>` : ''; x += bw; return el; }).join('')}<text x="${x + 6}" y="${y + 15}" class="pd-val">${esc(opts.fmt ? opts.fmt(it.parts.reduce((n, p) => n + p[0], 0)) : '')}</text>`; }).join('')}</svg>`;
  }
  function svgColumns(cols, colors, fmt) {
    const w = 520, h = 190, base = 160, max = Math.max(1, ...cols.map(c => c.parts.reduce((n, p) => n + p[0], 0))), bw = Math.min(56, (w - 40) / cols.length - 14);
    return `<svg class="pd-chart" viewBox="0 0 ${w} ${h}" role="img"><line x1="20" x2="${w}" y1="${base}" y2="${base}" class="pd-axis"/>${cols.map((c, i) => { const x = 30 + i * ((w - 40) / cols.length); let y = base; const total = c.parts.reduce((n, p) => n + p[0], 0); return `${c.parts.map(([v, color, tip]) => { const bh = v / max * (base - 24); y -= bh; return bh > 0 ? `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${color}" rx="2"><title>${esc(tip)}</title></rect>` : ''; }).join('')}<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="pd-val">${esc(fmt(total))}</text><text x="${x + bw / 2}" y="${base + 16}" text-anchor="middle" class="pd-ax">${esc(c.label)}</text>`; }).join('')}</svg>`;
  }
  /* Region view: value and units at each location along the China → ocean → US pipeline. */
  function regionView(M) {
    const loc = (filter, qty) => { const xs = M.rows.filter(filter); return { units:xs.reduce((n, x) => n + qty(x.r), 0), value:xs.reduce((n, x) => n + qty(x.r) * (x.r.unitUsd || 0), 0), skus:xs.filter(x => qty(x.r) > 0).length }; };
    const dg = loc(() => true, r => r.dg || 0), jn = loc(() => true, r => r.jn || 0), sea = loc(() => true, r => r.transit || 0), us = loc(() => true, r => r.wh || 0);
    const aged = M.agedValue, max = Math.max(1, dg.value, jn.value, sea.value, us.value), rad = v => 18 + Math.sqrt(v / max) * 30;
    const etas = M.rows.flatMap(x => (x.r.transitEta || []).map(e => e[0])).sort();
    const node = (x, y, color, title, sub, d, extra = '') => `<g class="pd-node"><circle cx="${x}" cy="${y}" r="${rad(d.value)}" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="2"/><text x="${x}" y="${y - 4}" text-anchor="middle" class="pd-node-v">${money(d.value)}</text><text x="${x}" y="${y + 14}" text-anchor="middle" class="pd-node-u">${int(d.units)} ${tr('件', 'pcs')} · ${d.skus} SKU</text><text x="${x}" y="${y + rad(d.value) + 20}" text-anchor="middle" class="pd-node-t">${esc(title)}</text><text x="${x}" y="${y + rad(d.value) + 36}" text-anchor="middle" class="pd-node-s">${esc(sub)}</text>${extra}</g>`;
    return `<section class="pd-card pd-region"><div class="pd-card-head"><h3>${icon('globe-hemisphere-east')} ${tr('地区视图：工厂 → 在船 → 海外仓', 'Region view: factory → at sea → overseas warehouse')}</h3><span class="pd-hint">${tr('圆越大货值越高；数字为按工厂单价计算的货值', 'Bigger circle = more value; values at factory unit cost')}</span></div>
      <svg class="pd-map" viewBox="0 0 960 340" role="img" aria-label="${tr('地区库存分布', 'Inventory by region')}">
        <rect x="10" y="20" width="250" height="300" rx="18" class="pd-land"/><text x="30" y="46" class="pd-land-t">${tr('中国', 'China')}</text>
        <rect x="700" y="20" width="250" height="300" rx="18" class="pd-land"/><text x="720" y="46" class="pd-land-t">${tr('美国', 'United States')}</text>
        <text x="480" y="46" text-anchor="middle" class="pd-land-t">${tr('太平洋', 'Pacific Ocean')}</text>
        <path d="M 190 95 C 330 60, 420 70, 470 140" class="pd-route"/><path d="M 190 240 C 330 270, 420 240, 470 175" class="pd-route"/><path d="M 520 145 C 600 120, 680 130, 800 150" class="pd-route strong"/>
        ${node(120, 92, '#fdab3d', tr('东莞工厂仓', 'Dongguan factory'), tr('可随时调货发美国', 'Ready to ship'), dg)}
        ${node(120, 238, '#fdab3d', tr('济南工厂仓', 'Jinan factory'), tr('可随时调货发美国', 'Ready to ship'), jn)}
        ${node(495, 150, '#00c875', tr('在船 / 在途', 'At sea / in transit'), etas.length ? tr(`最近到港 ${etas[0].slice(5)}`, `Next ETA ${etas[0].slice(5)}`) : tr('暂无在途', 'Nothing inbound'), sea)}
        ${node(825, 150, '#579bfc', tr('美国仓', 'US warehouse'), tr(`其中超 90 天 ${money(aged)}`, `${money(aged)} older than 90 days`), us)}
      </svg></section>`;
  }
  const TYPE_COLORS = ['#579bfc', '#00c875', '#fdab3d', '#a25ddc', '#e2445c', '#00a9a5', '#9699a6', '#ff7575'];
  function supplyBoard() {
    const M = supplyModel(), order = Object.keys(STATE);
    const filtered = M.rows.filter(x => ui.scFilter === 'all' || x.s.state === ui.scFilter).sort((a, b) => order.indexOf(a.s.state) - order.indexOf(b.s.state) || b.s.whValue - a.s.whValue);
    const tiles = order.map(k => [k, M.rows.filter(x => x.s.state === k)]);
    const kpi = (label, value, note, tone = '') => `<div class="pd-kpi ${tone}"><span>${label}</span><strong>${value}</strong><em>${note}</em></div>`;
    const agedPct = M.whValue ? Math.round(M.agedValue / M.whValue * 100) : 0;
    const monthly = INV?.monthly ? Object.entries(INV.monthly) : [];
    const mTypes = [...new Set(monthly.flatMap(([, v]) => Object.keys(v)))];
    const repairs = INV?.repairs ? Object.values(INV.repairs).reduce((n, x) => n + x, 0) : 0;
    const limit = ui.scShowAll ? filtered : filtered.slice(0, 40);
    return `<div class="pd-sc">
      <div class="pd-banner info">${icon('database')} ${tr(`库存数据：${invSource}`, `Inventory data: ${invSource}`)}${INV ? '' : tr(' · 示例数据，接入真实库存后自动替换', ' · sample data until real inventory is connected')}</div>
      <div class="pd-kpis six">
        ${kpi(tr('美国仓库存货值', 'US warehouse value'), money(M.whValue), `${int(M.rows.reduce((n, x) => n + (x.r.wh || 0), 0))} ${tr('件', 'units')}`)}
        ${kpi(tr('超 90 天库存占比', 'Aged >90 days'), agedPct + '%', `${money(M.agedValue)} ${tr('货值', 'value')}`, agedPct >= 50 ? 'bad' : agedPct >= 25 ? 'warn' : '')}
        ${kpi(tr('工厂仓库存货值', 'Factory warehouse value'), money(M.factoryValue), tr('东莞 + 济南', 'Dongguan + Jinan'))}
        ${kpi(tr('在途货值', 'In transit'), money(M.transitValue), `${int(M.rows.reduce((n, x) => n + (x.r.transit || 0), 0))} ${tr('件', 'units')}`)}
        ${kpi(tr('近 90 天出库', 'Shipped, last 90 days'), int(M.out90), tr('件（美国仓）', 'units (US warehouse)'))}
        ${kpi(tr('美国仓可售天数', 'US days of cover'), M.coverDays === Infinity ? '∞' : Math.round(M.coverDays), `${tr('按近期出库速度', 'at recent sell-through')}${repairs ? ` · ${repairs} ${tr('台维修/待检', 'in repair/inspection')}` : ''}`, M.coverDays > 180 ? 'warn' : '')}
      </div>
      ${window.WorkOSInsights?.slot('supply') || ''}
      ${regionView(M)}
      <div class="pd-health">${tiles.map(([k, list]) => `<button class="pd-htile ${ui.scFilter === k ? 'on' : ''}" style="--c:${STATE[k][3]}" data-pd="sc-filter" data-v="${ui.scFilter === k ? 'all' : k}"><span>${icon(STATE[k][4])} ${esc(tr(STATE[k][0], STATE[k][1]))}</span><strong>${list.length}</strong><em>SKU · ${money(list.reduce((t, x) => t + x.s.whValue, 0))} ${tr('在美国仓', 'in US')}</em></button>`).join('')}</div>
      <p class="pd-hint">${tr(`颜色规则：红 = 美国仓加在途不够卖 14 天；橙 = 到了补货点或应从工厂仓调货；紫 = 最老一批库存超过 ${ui.ageLimit} 天；蓝 = 全部库存超过目标的 1.8 倍；灰 = 有库存但近期没有出库。点击色块筛选下表。`, `Red = US + inbound covers under 14 days; orange = at reorder point or should transfer from factory; purple = oldest stock older than ${ui.ageLimit} days; blue = pipeline over 1.8× target; gray = stock but no recent shipments. Click a tile to filter.`)}</p>
      <div class="pd-charts">
        <section class="pd-card"><h3>${icon('hourglass-medium')} ${tr('美国仓库龄分布（按货值）', 'US stock age (by value)')}</h3>${svgColumns(M.ages.map(([label, v, old]) => ({ label:label + tr('天', 'd'), parts:[[v, old ? (label === '>365' ? '#e2445c' : '#a25ddc') : '#00c875', `${label}: ${money(v)}`]] })), null, money)}<p class="pd-hint">${tr('紫色和红色是超过 90 天的库存，越高越需要清理。', 'Purple and red are older than 90 days — the taller, the more to clear.')}</p></section>
        <section class="pd-card"><h3>${icon('stack')} ${tr('各产品线库存货值（美国仓 / 在途 / 工厂仓）', 'Inventory value by line (US / transit / factory)')}</h3>${svgBars(M.types.slice(0, 8).map(t => ({ label:t.t, parts:[[t.wh, '#579bfc', `${tr('美国仓', 'US')} ${money(t.wh)}`], [t.tr, '#00c875', `${tr('在途', 'Transit')} ${money(t.tr)}`], [t.fac, '#fdab3d', `${tr('工厂仓', 'Factory')} ${money(t.fac)}`]] })), { fmt:money })}<ul class="pd-legend-inline"><li><i style="background:#579bfc"></i>${tr('美国仓', 'US warehouse')}</li><li><i style="background:#00c875"></i>${tr('在途', 'In transit')}</li><li><i style="background:#fdab3d"></i>${tr('工厂仓', 'Factory')}</li></ul></section>
        ${monthly.length ? `<section class="pd-card"><h3>${icon('chart-bar')} ${tr('美国仓月度出库（件）', 'US warehouse shipments per month (units)')}</h3>${svgColumns(monthly.map(([m, v]) => ({ label:m.slice(5) + tr('月', ''), parts:mTypes.map((t, i) => [v[t] || 0, TYPE_COLORS[i % TYPE_COLORS.length], `${t}: ${v[t] || 0}`]) })), null, n => String(n))}<ul class="pd-legend-inline">${mTypes.map((t, i) => `<li><i style="background:${TYPE_COLORS[i % TYPE_COLORS.length]}"></i>${esc(t)}</li>`).join('')}</ul></section>` : ''}
        <section class="pd-card"><h3>${icon('ranking')} ${tr('美国仓货值前 10 的 SKU', 'Top 10 SKUs by US value')}</h3>${svgBars([...M.rows].sort((a, b) => b.s.whValue - a.s.whValue).slice(0, 10).map(x => ({ label:x.r.name, parts:[[x.s.whValue, STATE[x.s.state][3], `${x.r.sku} · ${x.r.wh} ${tr('件', 'pcs')} · ${tr('可售', 'cover')} ${x.s.cover === Infinity ? '∞' : Math.round(x.s.cover)} ${tr('天', 'd')}`]] })), { fmt:money })}<p class="pd-hint">${tr('颜色与上方库存健康色块一致。', 'Colors match the stock-health tiles above.')}</p></section>
      </div>
      <div class="pd-strategy">
        <section class="pd-card pd-replen"><div class="pd-card-head"><h3>${icon('magic-wand')} ${tr('补货策略', 'Replenishment plan')} <b class="pd-count">${M.reorders.length}</b></h3><form class="pd-replen-set" id="pd-replen"><label>${tr('安全天数', 'Safety days')} <input type="number" name="safety" min="0" max="120" value="${ui.safety}"></label><label>${tr('目标备货天数', 'Target cover')} <input type="number" name="cover" min="7" max="180" value="${ui.cover}"></label><label>${tr('超期阈值', 'Aged after')} <input type="number" name="ageLimit" min="30" max="720" value="${ui.ageLimit}"></label></form></div>
          ${M.reorders.map(({ r, s }) => `<div class="pd-tip" style="--c:${STATE[s.state][3]}"><div><strong>${esc(r.name)}</strong><span>${esc(r.sku)} · ${tr('美国仓', 'US')} ${r.wh} · ${tr('在途', 'transit')} ${r.transit || 0}${s.nextEta ? ` (${s.nextEta[0].slice(5)})` : ''} · ${tr('工厂仓', 'factory')} ${r.factoryStock} · ${tr('日均出库', 'per day')} ${(r.velocity || 0).toFixed(2)}</span></div>
            <p>${s.transferQty ? tr(`先从工厂仓调 <b>${s.transferQty}</b> 件发美国仓，约 ${r.shipDays} 天到货，不需要新下单。`, `Transfer <b>${s.transferQty}</b> units from factory stock first (~${r.shipDays} days); no new PO needed.`) : ''}${s.qty ? tr(`再向${esc(r.factory || '工厂')}下单 <b>${s.qty}</b> 件（起订 ${r.moq}），${s.orderIn <= 0 ? '建议今天下单' : `最晚 ${fmtD(addDays(s.orderIn))} 下单`}，约 ${money(s.value)}。`, `Then order <b>${s.qty}</b> from ${esc(r.factory || 'the factory')} (MOQ ${r.moq}) ${s.orderIn <= 0 ? 'today' : `by ${fmtD(addDays(s.orderIn))}`}, about ${money(s.value)}.`) : ''}${!s.transferQty && !s.qty ? tr('在途和工厂仓已足够，盯紧到货时间。', 'Inbound and factory stock are enough — watch the arrival date.') : ''}</p></div>`).join('') || `<div class="pd-empty">${icon('check-circle')} ${tr('目前没有需要补货的 SKU。', 'Nothing needs replenishing right now.')}</div>`}
          ${M.reorders.some(x => x.s.qty) ? `<button class="pd-btn small primary" data-pd="create-po">${icon('file-plus')} ${tr('生成采购单草稿', 'Create draft PO')}</button>` : ''}</section>
        <section class="pd-card"><div class="pd-card-head"><h3>${icon('tag')} ${tr('清库存策略', 'Clearance plan')} <b class="pd-count">${M.clearance.length}</b></h3><span class="pd-hint">${tr('最低价不低于“最低成本 × 1.05”', 'Never below lowest cost × 1.05')}</span></div>
          ${M.clearance.slice(0, 12).map(x => `<div class="pd-tip" style="--c:${STATE[x.s.state][3]}"><div><strong>${esc(x.r.name)}</strong><span>${esc(x.r.sku)} · ${x.r.wh} ${tr('件', 'pcs')} · ${money(x.s.whValue)} · ${tr('最老', 'oldest')} ${x.r.oldestAge} ${tr('天', 'd')} · ${x.months === Infinity ? tr('近 90 天无出库', 'no sales in 90 days') : tr(`按现速度 ${x.months.toFixed(1)} 个月卖完`, `${x.months.toFixed(1)} months to sell through`)}</span></div>
            <p><span class="pd-action ${x.action[0]}">${esc(x.action[1])}</span>${canDetail() && x.maxDiscount !== null ? tr(` 折扣空间最多 <b>${x.maxDiscount}%</b>（零售价 ${usd(x.price)} → 底价 ${usd(x.floor * 1.05)}）。`, ` Up to <b>${x.maxDiscount}%</b> off (MSRP ${usd(x.price)} → floor ${usd(x.floor * 1.05)}).`) : ''}</p></div>`).join('') || `<div class="pd-empty">${icon('check-circle')} ${tr('没有需要清理的库存。', 'No stock needs clearing.')}</div>`}
          ${M.clearance.length > 12 ? `<p class="pd-hint">${tr(`另有 ${M.clearance.length - 12} 个 SKU，见下方明细表（紫色、蓝色、灰色）。`, `${M.clearance.length - 12} more SKUs in the table below (purple, blue, gray).`)}</p>` : ''}</section>
      </div>
      <section class="pd-card"><div class="pd-card-head"><h3>${tr('SKU 库存明细', 'SKU inventory detail')} <b class="pd-count">${filtered.length}</b></h3>${ui.scFilter !== 'all' ? `<button class="pd-link" data-pd="sc-filter" data-v="all">${icon('x')} ${tr('清除筛选', 'Clear filter')}</button>` : ''}</div>
        <table class="pd-table pd-sc-table" data-help-table="pd-supply"><thead><tr><th>SKU</th><th>${tr('工厂', 'Factory')}</th><th class="num">${tr('工厂仓', 'Factory')}</th><th class="num">${tr('在途', 'Transit')}</th><th class="num">${tr('美国仓', 'US')}</th><th class="num">${tr('近90天出库', 'Out 90d')}</th><th class="num">${tr('可售天数', 'Cover (d)')}</th><th class="num">${tr('最老库龄', 'Oldest (d)')}</th><th class="num">${tr('美国仓货值', 'US value')}</th><th>${tr('状态', 'Status')}</th></tr></thead><tbody>
        ${limit.map(({ r, s }) => `<tr class="pd-row-state" style="--c:${STATE[s.state][3]}"><td><div class="pd-prod small"><span class="pd-thumb">${icon(r.icon)}</span><div><strong>${esc(r.name)}</strong><span>${esc(r.sku)}</span></div></div></td><td>${esc(r.factory || '—')}</td><td class="num">${r.factoryStock || '—'}</td><td class="num">${r.transit || '—'}${s.nextEta ? `<small> ${s.nextEta[0].slice(5)}</small>` : ''}</td><td class="num"><b>${r.wh || 0}</b></td><td class="num">${r.out90 || '—'}</td><td class="num ${s.cover < 14 ? 'pd-bad' : ''}">${s.cover === Infinity ? '—' : Math.round(s.cover)}</td><td class="num ${r.oldestAge > ui.ageLimit ? 'pd-aged' : ''}">${r.wh ? r.oldestAge : '—'}</td><td class="num">${money(s.whValue)}</td><td><span class="pd-state ${STATE[s.state][2]}">${esc(tr(STATE[s.state][0], STATE[s.state][1]))}</span></td></tr>`).join('')}
        </tbody></table>${filtered.length > limit.length ? `<button class="pd-link" data-pd="sc-all">${tr(`显示全部 ${filtered.length} 个 SKU`, `Show all ${filtered.length} SKUs`)}</button>` : ''}
        <p class="pd-hint">${tr('可售天数 = 美国仓库存 ÷ 日均出库（取近 90 天和历史平均的较大值）。库龄按美国仓入库批次计算。', 'Days of cover = US stock ÷ daily shipments (higher of last-90-day and lifetime rate). Age uses US inbound batches.')}</p></section>
    </div>`;
  }

  /* supply facts for the AI insight card */
  function supplyFacts() {
    const M = supplyModel();
    return { usValue:Math.round(M.whValue), agedOver90Pct:M.whValue ? Math.round(M.agedValue / M.whValue * 100) : 0, factoryValue:Math.round(M.factoryValue), transitValue:Math.round(M.transitValue), shipped90:M.out90, coverDays:M.coverDays === Infinity ? null : Math.round(M.coverDays),
      reorder:M.reorders.slice(0, 4).map(x => tr(`${x.r.name}（美国仓 ${x.r.wh} 件，日均出库 ${(x.r.velocity || 0).toFixed(2)}${x.s.transferQty ? `，可从工厂仓调 ${x.s.transferQty} 件` : ''}）`, `${x.r.name} (US ${x.r.wh}, ${(x.r.velocity || 0).toFixed(2)}/day${x.s.transferQty ? `, transfer ${x.s.transferQty} from factory` : ''})`)),
      clearance:M.clearance.slice(0, 4).map(x => tr(`${x.r.name}（${x.r.wh} 件，${money(x.s.whValue)}，最老 ${x.r.oldestAge} 天，${x.months === Infinity ? '近 90 天无出库' : `按现速度 ${x.months.toFixed(1)} 个月卖完`}）`, `${x.r.name}: ${x.r.wh} pcs, ${money(x.s.whValue)}, oldest ${x.r.oldestAge}d, ${x.months === Infinity ? 'no sales in 90d' : x.months.toFixed(1) + ' months to sell'}`)),
      topValueLine:M.types[0] ? `${M.types[0].t} $${Math.round(M.types[0].wh)}` : null };
  }
  function supplyRules(f) {
    const out = [tr(`美国仓库存货值 ${money(f.usValue)}，其中 ${f.agedOver90Pct}% 已超过 90 天${f.agedOver90Pct >= 50 ? '，资金占用严重，清库存是当前第一优先级' : ''}。`, `US stock is worth ${money(f.usValue)}; ${f.agedOver90Pct}% is older than 90 days${f.agedOver90Pct >= 50 ? ' — clearing it is the top priority' : ''}.`)];
    if (f.clearance.length) out.push(tr(`货值最大的滞销品：${f.clearance.slice(0, 2).join('；')}，建议限时折扣或打包给经销商。`, `Largest slow movers: ${f.clearance.slice(0, 2).join('; ')} — run a limited-time discount or bundle to dealers.`));
    if (f.reorder.length) out.push(tr(`需要补货：${f.reorder.slice(0, 3).join('；')}，优先用工厂仓现货调拨。`, `Reorder: ${f.reorder.slice(0, 3).join('; ')} — transfer factory stock first.`));
    else out.push(tr('目前没有 SKU 面临缺货。', 'No SKU is at risk of stocking out.'));
    if (f.factoryValue) out.push(tr(`工厂仓还压着 ${money(f.factoryValue)} 的货，${f.coverDays !== null ? `美国仓按现速度可卖约 ${f.coverDays} 天，` : ''}新的采购应先消化这部分。`, `Factory warehouses hold ${money(f.factoryValue)}${f.coverDays !== null ? `; US stock covers about ${f.coverDays} days` : ''} — use this before new POs.`));
    return out.slice(0, 4);
  }
  if (window.WorkOSInsights?.register) window.WorkOSInsights.register('supply', () => ctx ? supplyFacts() : {}, supplyRules);
  else window.addEventListener('DOMContentLoaded', () => window.WorkOSInsights?.register?.('supply', () => ctx ? supplyFacts() : {}, supplyRules));

  /* ---------- events ---------- */
  const rerender = () => ctx.rerender();
  document.addEventListener('click', e => {
    if (!ctx) return;
    const t = e.target.closest('[data-pd]'); if (!t) return;
    e.preventDefault();
    const a = t.dataset.pd;
    if (a === 'tab') { ui.tab = t.dataset.v; ui.product = null; return rerender(); }
    if (a === 'open-product') { ui.product = t.dataset.sku; return rerender(); }
    if (a === 'back') { ui.product = null; return rerender(); }
    if (a === 'save-product') { ctx.toast(tr('原型：已模拟保存', 'Prototype: save simulated')); return; }
    if (a === 'new-product') { ctx.toast(tr('原型：将打开新产品表单', 'Prototype: opens a new product form')); return; }
    if (a === 'cost-for' || a === 'pick-cost') { ui.tab = 'cost'; ui.costSku = t.dataset.sku; ui.costQuery = ''; ui.product = null; return rerender(); }
    if (a === 'incomplete') { ui.incomplete = !ui.incomplete; return rerender(); }
    if (a === 'scenario') { ui.scenario = t.dataset.v; return rerender(); }
    if (a === 'status-filter') { ui.statusFilter = ui.statusFilter === t.dataset.v ? '' : t.dataset.v; return rerender(); }
    if (a === 'sc-filter') { ui.scFilter = t.dataset.v; return rerender(); }
    if (a === 'ov-save') { saveOv(ui.costSku); ctx.toast(tr('已保存该 SKU 的成本设置', 'Cost settings saved')); return rerender(); }
    if (a === 'ov-reset') { delete ov[ui.costSku]; saveOv(ui.costSku); ctx.toast(tr('已恢复表格默认值', 'Reset to sheet values')); return rerender(); }
    if (a === 'sc-all') { ui.scShowAll = true; return rerender(); }
    if (a === 'create-po') { const list = supplyModel().reorders.filter(x => x.s.qty > 0); const byF = {}; list.forEach(x => { (byF[x.r.factory || tr('工厂', 'Factory')] ||= []).push(x); });
      ctx.modal(tr('采购单草稿', 'Draft purchase orders'), Object.entries(byF).map(([f, xs]) => `<h4>${esc(f)}</h4><table class="pd-table small"><thead><tr><th>SKU</th><th class="num">${tr('数量', 'Qty')}</th><th class="num">${tr('单价', 'Unit')}</th><th class="num">${tr('金额', 'Amount')}</th></tr></thead><tbody>${xs.map(({ r, s }) => `<tr><td>${esc(r.sku)} ${esc(r.name)}</td><td class="num">${s.qty}</td><td class="num">${usd(r.unitUsd || 0)}</td><td class="num">${usd(s.value)}</td></tr>`).join('')}</tbody></table>`).join('') + `<p class="pd-hint">${tr('原型：正式版会生成采购单并通知工厂确认交期，确认后自动计入“在途”。', 'Prototype: the real version creates the PO, asks the factory to confirm, then tracks it as inbound.')}</p>`, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`); }
  });
  document.addEventListener('input', e => {
    if (!ctx) return;
    const el = e.target;
    if (el.matches('input[data-pd-ov]') || el.matches('[data-pd-fx]')) {
      const key = el.dataset.pdOv, v = el.value === '' ? null : Number(el.value);
      if (el.matches('[data-pd-fx]')) { if (v > 0) assumptions.fx = v; } else { const [g, k] = key.split('.'), o = ovOf(ui.costSku), def = g === 'opex' ? OPEX.find(x => x[0] === k)[3] : g === 'assume' ? assumptions[k] : bySku(ui.costSku)?.[k]; if (v == null || v === def) delete o[g][k]; else if (Number.isFinite(v)) o[g][k] = v; }
      const sel = el.matches('[data-pd-fx]') ? '[data-pd-fx]' : `[data-pd-ov="${key}"]`, pos = el.selectionStart; rerender();
      requestAnimationFrame(() => { const n = document.querySelector(sel); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }); return;
    }
    if (el.matches('[data-pd-search]') || el.matches('[data-pd-cost]')) {
      const key = el.matches('[data-pd-search]') ? 'search' : 'costQuery', sel = el.matches('[data-pd-search]') ? '[data-pd-search]' : '[data-pd-cost]';
      ui[key] = el.value; const pos = el.selectionStart;
      if (key === 'costQuery') { const exact = products.find(p => p.sku && p.sku.toUpperCase() === el.value.trim().toUpperCase()); if (exact) ui.costSku = exact.sku; }
      rerender(); requestAnimationFrame(() => { const n = document.querySelector(sel); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
    }
    if (el.closest('#pd-assume')) { const k = el.name, v = Number(el.value); if (!Number.isFinite(v)) return; assumptions[k] = v; const name = el.name; rerender(); requestAnimationFrame(() => { const n = document.querySelector(`#pd-assume [name="${name}"]`); if (n) { n.focus(); } }); }
  });
  document.addEventListener('change', e => {
    if (!ctx) return;
    const el = e.target;
    if (el.matches('[data-pd-fxlock]')) { fxState.locked = el.checked; if (!el.checked && fxState.live) assumptions.fx = fxState.live; return rerender(); }
    if (el.matches('select[data-pd-ov]')) { const [g, k] = el.dataset.pdOv.split('.'); ovOf(ui.costSku)[g][k] = el.value; return rerender(); }
    if (el.matches('[data-pd-filter]')) { ui[el.dataset.pdFilter] = el.value; return rerender(); }
    if (el.closest('#pd-assume') && el.name === 'shipMode') { assumptions.shipMode = el.value; return rerender(); }
    if (el.matches('[data-pd-viewas]')) { ui.viewAsBasic = el.checked; rerender(); }
    if (el.closest('#pd-replen')) { const v = Math.max(0, Number(el.value) || 0); ui[el.name] = v; rerender(); }
  });

  window.WorkOSProducts = { configure(next) { ctx = next; }, render, _data:{ products, assumptions, cost, supply, source, OPEX, ladder, ov, fxState }, _ui:ui };
})();
