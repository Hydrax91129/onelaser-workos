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
  let source = injected?.source || tr('示例数据', 'Sample data');
  // Deterministic sample inventory so the supply chain board has something to show until real stock data is connected.
  const seeded = (sku, n) => { let h = 7; for (const c of sku) h = (h * 31 + c.charCodeAt(0)) % 9973; return (h * (n + 3)) % 97; };
  const buildProduct = raw => {
    const machine = /整机/.test(raw.type || ''), status = STATUS_FROM_ZH[raw.status] || (STATUS[raw.status] ? raw.status : 'none');
    const selling = ['live', 'launch', 'clearance'].includes(status);
    const v = selling ? (machine ? (seeded(raw.sku || raw.name, 1) % 20) / 10 + 0.2 : (seeded(raw.sku || raw.name, 2) % 60) / 10 + 0.5) : 0;
    return { ...raw, sku:raw.sku || '', status, icon:iconFor(raw.type || ''), machine,
      moq:raw.moq ?? (machine ? 5 : 50), moqSet:raw.moq ?? null, prodDays:machine ? 25 : 12, shipDays:/工作日/.test(raw.lead || '') ? 12 : 30,
      wip:status === 'dev' ? 0 : seeded(raw.sku || raw.name, 3) % (machine ? 15 : 200), ready:seeded(raw.sku || raw.name, 4) % (machine ? 8 : 80), transit:seeded(raw.sku || raw.name, 5) % (machine ? 20 : 300), wh:selling ? seeded(raw.sku || raw.name, 6) % (machine ? 40 : 400) : 0,
      age:selling ? 15 + seeded(raw.sku || raw.name, 7) * 4 : 0, velocity:Math.round(v * 10) / 10 };
  };
  const products = (injected?.products || SAMPLE).map(buildProduct);
  const buildShipments = () => [
    { id:'MSKU 482190-3', mode:{ zh:'海运整柜', en:'Ocean FCL' }, eta:addDays(9), from:{ zh:'深圳盐田', en:'Yantian, Shenzhen' }, to:'Lake Forest, CA', items:products.filter(p => p.machine && p.status !== 'dev').slice(0, 3).map(p => [p.sku, p.transit]) },
    { id:'CMAU 771045-8', mode:{ zh:'海运拼柜', en:'Ocean LCL' }, eta:addDays(21), from:{ zh:'青岛', en:'Qingdao' }, to:'Lake Forest, CA', items:products.filter(p => !p.machine && p.status === 'live').slice(0, 4).map(p => [p.sku, p.transit]) },
  ];
  const shipments = buildShipments();

  /* ---------- server data: catalog and (for authorized people) cost inputs, imported from CSV ---------- */
  const srv = { data:null, loading:false, error:'' };
  function loadServer() {
    if (srv.data || srv.loading || !ctx?.api?.get || ctx.state().capabilities?.productsData !== true) return;
    srv.loading = true;
    ctx.api.get('/products').then(async r => { srv.data = r; srv.error = ''; if (r.pricingRules) { rules = { ...clone(DEFAULT_RULES), ...r.pricingRules }; syncOpex(); } if (r.items?.length) { applyServer(r.items); await applyStock(); } }).catch(e => { srv.error = e.message || ''; srv.data = { items:[], failed:true }; }).finally(() => { srv.loading = false; ctx.rerender(); });
  }
  // With real catalog data, the warehouse columns come from Inventory (WMS), never from sample numbers.
  async function applyStock() {
    let stock = null;
    if (ctx.state().capabilities?.wms) { try { stock = await ctx.api.get('/wms/summary'); } catch { stock = null; } }
    const q = new Map((stock?.items || []).map(it => [String(it.sku).toLowerCase(), it.qty || {}]));
    products.forEach(p => { const x = q.get(String(p.sku).toLowerCase()); if (x) Object.assign(p, { wh:Number(x.us || 0), transit:Number(x.transit || 0), ready:Number(x.dg || 0) + Number(x.jn || 0), wip:0, stockKnown:true }); else Object.assign(p, { wh:null, transit:null, ready:null, wip:null, stockKnown:false }); });
  }
  function applyServer(items) {
    products.splice(0, products.length, ...items.map(buildProduct));
    shipments.splice(0, shipments.length, ...buildShipments());
    stockRows.splice(0, stockRows.length, ...buildStock());
    syncInv();
    source = tr(`系统数据 · ${items.length} 个 SKU`, `System data · ${items.length} SKUs`);
    if (srv.data?.pricingRules) { rules = { ...clone(DEFAULT_RULES), ...srv.data.pricingRules }; syncOpex(); }
    if (!bySku(ui.costSku)) ui.costSku = products.find(p => p.factoryRmb && p.msrp)?.sku || products[0]?.sku;
    if (ui.product && !bySku(ui.product)) ui.product = null;
  }
  const ui = { incomplete:false, ageLimit:180, tab:'catalog', product:null, search:'', typeFilter:'', statusFilter:'', costQuery:'', costSku:products.find(p => p.factoryRmb && p.msrp)?.sku || products[0]?.sku, viewAsBasic:false, costView:'sku', scFilter:'all', safety:14, cover:45, scenario:'msrp' };
  /* Assumptions mirror the SKU master sheet: FX, 3% export markup, 15% freight buffer, 38% operating cost. */
  const assumptions = { fx:7.0, exportMarkup:3, freightBuffer:15, ddpFixedRmb:900, oceanRmbPerKg:8.5, hybridFixedRmb:140, parcelRmbPerKg:14.6, operatingPct:38, shipMode:'auto', dealerDiscount:30, dealerSupportPct:5, disc1:10, disc2:15, disc3:25, clearanceOpsPct:8 };
  /* Company pricing rules (KC, Nov 2026). Server copy wins when the API offers it; these are the defaults.
   * price = (delivered cost − shipping the customer pays separately) ÷ (1 − selling rate − target contribution margin) */
  const DEFAULT_RULES = {
    retail:[{ key:'ads', zh:'广告', en:'Advertising', pct:5 }, { key:'txn', zh:'交易费', en:'Transaction fees', pct:3 }, { key:'kol', zh:'KOL', en:'KOL', pct:1.5 }, { key:'brand', zh:'品牌', en:'Brand & PR', pct:1.5 }, { key:'commission', zh:'线下提成', en:'Sales commission', pct:1 }, { key:'rma', zh:'退换货及保修售后', en:'Returns & warranty', pct:2.5 }, { key:'mgmt', zh:'管理费', en:'Management fee', pct:2.5 }],
    wholesalePct:7, platformExtraPct:10, classes:{ standard:30, rd:40, accessory:50 },
    tiers:{ everyday:[25, 30], small:[20, 25], major:[15, 20], clearance:[10, 15] }, floorPct:15, majorPerYear:2,
    wholesale:{ base:25, large:30, over50k:2, over100k:5 },
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  let rules = clone(DEFAULT_RULES), rulesDraft = null;
  // Retail operating cost lines mirror the company rules (selling expense rate).
  const OPEX = [];
  const syncOpex = () => OPEX.splice(0, OPEX.length, ...rules.retail.map(r => [r.key, r.zh, r.en, Number(r.pct) || 0]));
  syncOpex();
  const CLASS = { standard:['标准品', 'Standard product'], rd:['研发创新品', 'R&D / innovation product'], accessory:['不可替代配件', 'Non-substitutable accessory'] };
  const canDetail = () => ((ctx.state().actor?.grants || []).includes('product_cost_detail') || (srv.data?.canSeePricing === true)) && !ui.viewAsBasic;
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

  /* ---------- price system: company pricing rules applied to one SKU ---------- */
  const retailRate = () => rules.retail.reduce((n, r) => n + (Number(r.pct) || 0), 0);
  function plan(p0) {
    const p = eff(p0), c = cost(p0, 'msrp');
    const cls = CLASS[p.priceClass] ? p.priceClass : (p.machine ? 'standard' : 'accessory');
    const landedSet = p.landedUsd != null, landed = landedSet ? p.landedUsd : c.minCost;
    const lastMile = p.lastMileUsd != null ? p.lastMileUsd : 0, custShip = p.shipFee || 0;
    const delivered = landed != null ? landed + lastMile : null, netCost = delivered != null ? delivered - custShip : null;
    const r = retailRate() / 100, w = (Number(rules.wholesalePct) || 0) / 100;
    const priceAt = (cm, rate = r) => netCost != null && 1 - rate - cm / 100 > 0 ? netCost / (1 - rate - cm / 100) : null;
    const cmAt = (price, rate = r) => price && delivered != null ? { usd:price * (1 - rate) + custShip - delivered, pct:(price * (1 - rate) + custShip - delivered) / price * 100 } : null;
    const msrp = p.msrp || null, actual = p.actualPrice ?? msrp;
    const T = rules.tiers;
    const tiers = [
      { key:'msrp', zh:'MSRP', en:'MSRP', range:[rules.classes[cls], rules.classes[cls]], rule:tr(`按产品类型：${CLASS[cls][0]}`, `By product class: ${CLASS[cls][1]}`) },
      { key:'everyday', zh:'日常调整', en:'Everyday adjustment', range:T.everyday, rule:tr('运营与市场部根据竞争调整', 'Ops and Marketing adjust for competition') },
      { key:'small', zh:'小促', en:'Small promotion', range:T.small, rule:tr('常规活动', 'Regular promotions') },
      { key:'major', zh:'大促', en:'Major promotion', range:T.major, rule:tr(`黑五、准备淘汰的型号；每年 ${rules.majorPerYear} 次以内`, `Black Friday, phase-out models; up to ${rules.majorPerYear} times a year`) },
      { key:'clearance', zh:'清货', en:'Clearance', range:T.clearance, rule:tr('清库存，需总裁批准', 'Inventory clearance; President approval') },
    ].map(t => ({ ...t, lo:priceAt(t.range[0]), hi:priceAt(t.range[1]) }));
    const tierOf = pct => pct == null ? null : pct >= rules.classes[cls] - 0.05 ? 'msrp' : ['everyday', 'small', 'major', 'clearance'].find(k => pct >= T[k][0] - 0.05) || 'loss';
    const W = rules.wholesale, ws = [
      [tr('普通经销商', 'Standard dealer'), W.base], [tr('普通经销商 · 单笔超 $5 万', 'Standard · order over $50k'), W.base + W.over50k],
      [tr('大经销商 / 普通单笔超 $10 万', 'Large dealer / standard over $100k'), Math.max(W.large, W.base + W.over100k)],
      [tr('大经销商 · 单笔超 $5 万', 'Large · order over $50k'), W.large + W.over50k], [tr('大经销商 · 单笔超 $10 万', 'Large · order over $100k'), W.large + W.over100k],
    ].map(([label, d]) => { const price = msrp ? msrp * (1 - d / 100) : null, our = price != null && landed != null ? price * (1 - w) - landed : null;
      const dealerAt = sell => sell && price != null ? sell + custShip - price - lastMile : null;
      return { label, d, price, our, ourPct:our != null ? our / price * 100 : null, dealerActual:dealerAt(actual), dealerMsrp:dealerAt(msrp) }; });
    const msrpCm = cmAt(msrp), actualCm = cmAt(actual), suggested = priceAt(rules.classes[cls]);
    const missing = [landed == null && tr('到岸价', 'landed cost'), p.lastMileUsd == null && tr('尾程运费', 'last-mile shipping'), !msrp && 'MSRP'].filter(Boolean);
    return { p, cls, landed, landedSet, lastMile, custShip, delivered, netCost, r, w, tiers, msrp, actual, msrpCm, actualCm, actualTier:tierOf(actualCm?.pct), msrpTier:tierOf(msrpCm?.pct), suggested, ws, missing, priceAt, cmAt,
      platform:cmAt(actual, r + (Number(rules.platformExtraPct) || 0) / 100) };
  }
  const tierName = k => k === 'loss' ? tr('低于清货线', 'Below clearance') : (() => { const t = { msrp:['MSRP', 'MSRP'], everyday:['日常调整', 'Everyday'], small:['小促', 'Small promo'], major:['大促', 'Major promo'], clearance:['清货', 'Clearance'] }[k]; return t ? tr(t[0], t[1]) : '—'; })();
  const cmTone = pct => pct == null ? '' : pct >= 25 ? 'good' : pct >= rules.floorPct ? 'mid' : 'bad';
  const money0 = n => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
  const cmCell = x => x ? `<span class="pd-margin ${cmTone(x.pct)}">${money0(x.usd)} · ${x.pct.toFixed(1)}%</span>` : '—';
  function priceSystem(p0) {
    const P = plan(p0);
    const range = (lo, hi) => lo == null ? '—' : Math.abs(lo - hi) < 0.5 ? money0(lo) : `${money0(hi)} – ${money0(lo)}`;
    const flags = [];
    if (P.msrp && P.suggested && P.msrp < P.suggested - 0.5) flags.push(['warn', tr(`MSRP ${money0(P.msrp)} 低于规则建议 ${money0(P.suggested)}（${CLASS[P.cls][0]} ${rules.classes[P.cls]}%），贡献利润 ${P.msrpCm.pct.toFixed(1)}%。`, `MSRP ${money0(P.msrp)} is below the rule's ${money0(P.suggested)} (${CLASS[P.cls][1]} ${rules.classes[P.cls]}%); CM ${P.msrpCm.pct.toFixed(1)}%.`)]);
    // The latest applied change to the actual price tells whether this below-floor price was approved, and by whom.
    const ok = hist[P.p.sku]?.data?.prices?.find(x => x.target === 'actual' && x.status === 'applied');
    const approved = ok && ok.to === P.actual && ok.needs && ok.decidedBy ? ok : null;
    if (P.actualCm && P.actualCm.pct < rules.floorPct) flags.push(approved ? ['warn', tr(`真实售价的贡献利润 ${P.actualCm.pct.toFixed(1)}% 低于 ${rules.floorPct}% 底线，属于${tierName(P.actualTier)}；已由 ${approved.decidedBy.name} 于 ${when(approved.decidedAt || approved.at)} 批准。`, `Actual price CM ${P.actualCm.pct.toFixed(1)}% is below the ${rules.floorPct}% floor (${tierName(P.actualTier)}); approved by ${approved.decidedBy.name} on ${when(approved.decidedAt || approved.at)}.`)]
      : ['bad', tr(`真实售价的贡献利润 ${P.actualCm.pct.toFixed(1)}% 低于 ${rules.floorPct}% 底线，属于${tierName(P.actualTier)}，需要总裁批准。`, `Actual price CM ${P.actualCm.pct.toFixed(1)}% is below the ${rules.floorPct}% floor (${tierName(P.actualTier)}); needs President approval.`)]);
    else if (P.actualTier === 'major') flags.push(['warn', tr(`真实售价落在大促档（${rules.tiers.major.join('–')}%）。大促每年最多 ${rules.majorPerYear} 次，不宜作为长期售价。`, `Actual price sits in the major-promotion tier (${rules.tiers.major.join('–')}%), allowed up to ${rules.majorPerYear} times a year — not a long-term price.`)]);
    if (P.missing.length) flags.push(['warn', tr(`请补齐：${P.missing.join('、')}。${P.landedSet ? '' : '到岸价暂按成本模型估算（产品 + 最便宜的头程）。'}`, `Please fill in: ${P.missing.join(', ')}.${P.landedSet ? '' : ' Landed cost is estimated by the cost model for now.'}`)]);
    const kpi = (label, value, note, tone = '') => `<div class="pd-kpi"><span>${label}</span><strong class="${tone}">${value}</strong><em>${note}</em></div>`;
    return `<section class="pd-card pd-cost-hero"><div class="pd-prod"><span class="pd-thumb big">${icon(P.p.icon)}</span><div><strong>${esc(L(P.p.name))}</strong><span>${esc(P.p.sku)} · ${esc(P.p.type || '')} · ${esc(tr(CLASS[P.cls][0], CLASS[P.cls][1]))}</span></div>${pill(P.p.status)}</div>
      <div class="pd-kpis">
        ${kpi(tr('送达成本', 'Delivered cost'), money0(P.delivered), tr(`到岸 ${money0(P.landed)} + 尾程 ${money0(P.lastMile)}`, `landed ${money0(P.landed)} + last mile ${money0(P.lastMile)}`))}
        ${kpi('MSRP', money0(P.msrp), P.msrpCm ? tr(`贡献利润 ${P.msrpCm.pct.toFixed(1)}% · 规则建议 ${money0(P.suggested)}`, `CM ${P.msrpCm.pct.toFixed(1)}% · rule ${money0(P.suggested)}`) : '—', P.msrpCm && P.msrpCm.pct < rules.classes[P.cls] - 0.5 ? 'pd-warn-t' : '')}
        ${kpi(tr('真实售价', 'Actual price'), money0(P.actual), P.actualCm ? tr(`贡献利润 ${money0(P.actualCm.usd)}（${P.actualCm.pct.toFixed(1)}%）· ${tierName(P.actualTier)}`, `CM ${money0(P.actualCm.usd)} (${P.actualCm.pct.toFixed(1)}%) · ${tierName(P.actualTier)}`) : '—', P.actualCm && P.actualCm.pct < rules.floorPct ? 'pd-bad' : '')}
        ${kpi(tr(`批发起步（MSRP −${rules.wholesale.base}%）`, `Wholesale base (MSRP −${rules.wholesale.base}%)`), money0(P.ws[0].price), P.ws[0].our != null ? tr(`我们赚 ${money0(P.ws[0].our)}（${P.ws[0].ourPct.toFixed(1)}%）· 经销商付运费`, `we earn ${money0(P.ws[0].our)} (${P.ws[0].ourPct.toFixed(1)}%) · dealer pays freight`) : '—')}
      </div>${flags.map(([t, m]) => `<div class="pd-flag ${t}">${icon(t === 'bad' ? 'warning-octagon' : 'warning')} ${esc(m)}</div>`).join('')}</section>
    <section class="pd-card"><div class="pd-card-head"><h3>${icon('stairs')} ${tr('零售价格档位（按公司计价规则）', 'Retail price tiers (company pricing rules)')}</h3><span class="pd-hint">${tr(`售价 =（送达成本 − 顾客另付运费 ${money0(P.custShip)}）÷（1 − 销售费率 ${retailRate()}% − 目标贡献利润率）`, `Price = (delivered cost − customer-paid shipping ${money0(P.custShip)}) ÷ (1 − selling rate ${retailRate()}% − target CM)`)}</span></div>
      <table class="pd-table" data-help-table="pd-tiers"><thead><tr><th>${tr('档位', 'Tier')}</th><th class="num">${tr('贡献利润率', 'CM %')}</th><th class="num">${tr('售价区间', 'Price range')}</th><th>${tr('规则', 'Rule')}</th></tr></thead><tbody>
        ${P.tiers.map(t => `<tr class="${t.key === P.actualTier ? 'pd-on' : ''}"><td><strong>${tr(t.zh, t.en)}</strong>${t.key === P.actualTier ? `<span class="pd-tag">${tr('当前真实售价', 'Current actual price')}</span>` : ''}${t.key === P.msrpTier && P.msrpTier !== P.actualTier ? `<span class="pd-tag alt">${tr('当前 MSRP', 'Current MSRP')}</span>` : ''}</td><td class="num">${t.range[0] === t.range[1] ? t.range[0] + '%' : t.range.join('–') + '%'}</td><td class="num"><b>${range(t.lo, t.hi)}</b></td><td>${esc(t.rule)}</td></tr>`).join('')}
      </tbody></table>
      <p class="pd-hint">${tr(`Amazon / eBay 销售费率再加 ${rules.platformExtraPct}%：按真实售价卖，贡献利润为 `, `Amazon / eBay add ${rules.platformExtraPct}%: at the actual price CM would be `)}${P.platform ? `${money0(P.platform.usd)}（${P.platform.pct.toFixed(1)}%）` : '—'}。</p></section>
    <section class="pd-card"><div class="pd-card-head"><h3>${icon('handshake')} ${tr('批发价（按 MSRP 打折，经销商付运费）', 'Wholesale (off MSRP, dealer pays freight)')}</h3><span class="pd-hint">${tr(`我们的贡献利润 = 批发价 ×（1 − ${rules.wholesalePct}%）− 到岸价；经销商利润 = 售价 + 顾客另付运费 − 批发价 − 尾程`, `Our CM = wholesale × (1 − ${rules.wholesalePct}%) − landed; dealer profit = selling price + customer shipping − wholesale − last mile`)}</span></div>
      <table class="pd-table" data-help-table="pd-wholesale"><thead><tr><th>${tr('档位', 'Tier')}</th><th class="num">${tr('折扣', 'Discount')}</th><th class="num">${tr('批发价', 'Wholesale')}</th><th class="num">${tr('我们的贡献利润', 'Our CM')}</th><th class="num">${tr('经销商利润（按真实售价卖）', 'Dealer profit at actual price')}</th><th class="num">${tr('经销商利润（按 MSRP 卖）', 'Dealer profit at MSRP')}</th></tr></thead><tbody>
        ${P.ws.map(x => `<tr><td>${esc(x.label)}</td><td class="num">${x.d}%</td><td class="num"><b>${money0(x.price)}</b></td><td class="num">${x.our != null ? `<span class="pd-margin ${cmTone(x.ourPct)}">${money0(x.our)} · ${x.ourPct.toFixed(1)}%</span>` : '—'}</td><td class="num ${x.dealerActual != null && x.dealerActual < 0 ? 'pd-bad' : ''}">${x.dealerActual != null ? `${money0(x.dealerActual)} · ${(x.dealerActual / P.actual * 100).toFixed(1)}%` : '—'}</td><td class="num">${x.dealerMsrp != null ? `${money0(x.dealerMsrp)} · ${(x.dealerMsrp / P.msrp * 100).toFixed(1)}%` : '—'}</td></tr>`).join('')}
      </tbody></table>
      <p class="pd-hint">${tr(`对比：官网按真实售价直销，每台贡献利润 ${P.actualCm ? money0(P.actualCm.usd) : '—'}。经销商以 ACH 或电汇付款；刷卡另加 3%。`, `For comparison, selling direct at the actual price earns ${P.actualCm ? money0(P.actualCm.usd) : '—'} per unit. Dealers pay by ACH or wire; cards add 3%.`)}</p></section>
    ${channelPanel(P)}
    ${planInputs(P)}
    ${historyCard(P.p.sku, Object.keys(TARGET_LABEL), false)}`;
  }
  /* ---------- channel prices: one selling price per channel, checked against the rules like any other price ---------- */
  const CH_KEYS = ['shopify', 'amazon', 'ebay', 'dealer'];
  function channelPanel(P) {
    if (!liveData() || !srv.data?.canSeeChannels) return '';
    const can = srv.data.canEditChannels === true, ch = P.p.channels || {}, pend = P.p.pendingPrices || [];
    const extra = (Number(rules.platformExtraPct) || 0) / 100, cmPctOf = (k, price) => {
      if (!price) return null;
      if (k === 'dealer') return P.landed != null ? (price * (1 - P.w) - P.landed) / price * 100 : null;
      return P.cmAt(price, P.r + (k === 'amazon' || k === 'ebay' ? extra : 0))?.pct ?? null;
    };
    const suggest = k => k === 'dealer' ? P.ws[0].price : P.priceAt(rules.classes[P.cls], P.r + (k === 'amazon' || k === 'ebay' ? extra : 0));
    return `<section class="pd-card"><div class="pd-card-head"><h3>${icon('storefront')} ${tr('渠道价格', 'Channel prices')}</h3><span class="pd-hint">${tr(`建议价按 ${CLASS[P.cls][0]} 的 MSRP 目标（${rules.classes[P.cls]}%）倒推；Amazon / eBay 销售费率多 ${rules.platformExtraPct}%；经销商按批发起步折扣。贡献利润低于 ${rules.floorPct}% 的调价需管理员批准。`, `Suggested prices back out the ${CLASS[P.cls][1]} MSRP target (${rules.classes[P.cls]}%); Amazon / eBay carry ${rules.platformExtraPct}% more fees; dealers use the base wholesale discount. Changes below ${rules.floorPct}% CM need admin approval.`)}</span></div>
      <table class="pd-table" data-help-table="pd-channels"><thead><tr><th>${tr('渠道', 'Channel')}</th><th>${tr('在售', 'Listed')}</th><th class="num">${tr('当前价', 'Price')}</th><th class="num">${tr('建议价', 'Suggested')}</th><th class="num">${tr('贡献利润', 'CM')}</th><th></th></tr></thead><tbody>
      ${CH_KEYS.map(k => { const cur = ch[k] || {}, pc = cmPctOf(k, cur.price), wait = pend.find(x => x.target === k), sg = suggest(k);
        return `<tr><td><strong>${esc(tr(TARGET_LABEL[k][0], TARGET_LABEL[k][1]))}</strong>${wait ? `<span class="pd-tag">${tr(`待审批 ${usd(wait.price)}`, `Awaiting ${usd(wait.price)}`)}</span>` : ''}</td>
          <td><input type="checkbox" data-pd-ch-listed="${k}" ${cur.listed === false ? '' : 'checked'} ${can ? '' : 'disabled'}></td>
          <td class="num"><input class="pd-num-in" type="number" min="0" step="1" data-pd-ch-price="${k}" value="${cur.price ?? ''}" placeholder="${sg != null ? Math.round(sg) : ''}" ${can ? '' : 'disabled'}></td>
          <td class="num">${money0(sg)}</td><td class="num">${pc != null ? `<span class="pd-margin ${cmTone(pc)}">${pc.toFixed(1)}%</span>` : '—'}</td>
          <td>${can ? `<button class="pd-btn small" data-pd="channel-save" data-ch="${k}">${tr('保存', 'Save')}</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table>${can ? `<label class="pd-field"><span>${tr('调价原因（可选，审批人会看到）', 'Reason for the change (optional, shown to the approver)')}</span><input data-pd-ch-reason></label>` : ''}</section>`;
  }
  /* ---------- price approvals: admins decide; everyone else sees and can withdraw their own requests ---------- */
  const approvals = { data:null, loading:false };
  function loadApprovals() {
    if (approvals.data || approvals.loading || !liveData()) return;
    approvals.loading = true;
    ctx.api.get('/products/price-changes').then(r => { approvals.data = r; }).catch(() => { approvals.data = { items:[] }; }).finally(() => { approvals.loading = false; ctx.rerender(); });
  }
  function approvalsPanel() {
    loadApprovals();
    const items = approvals.data?.items || [], canDecide = approvals.data?.canDecide === true, me = ctx.state().actor?.id;
    if (!items.length) return '';
    return `<section class="pd-card pd-approvals"><div class="pd-card-head"><h3>${icon('seal-check')} ${canDecide ? tr(`待审批调价（${items.length}）`, `Price changes awaiting approval (${items.length})`) : tr(`我提交的待审批调价（${items.length}）`, `My price changes awaiting approval (${items.length})`)}</h3></div>
      <table class="pd-table"><thead><tr><th>${tr('产品', 'Product')}</th><th>${tr('价格', 'Price')}</th><th class="num">${tr('调整', 'Change')}</th><th class="num">${tr('贡献利润', 'CM')}</th><th>${tr('原因', 'Reason')}</th><th>${tr('申请人', 'Requested by')}</th><th></th></tr></thead><tbody>
      ${items.map(x => `<tr><td><button class="pd-link" data-pd="pick-cost" data-sku="${esc(x.sku)}"><strong>${esc(x.sku)}</strong></button> ${esc(L(x.name || {}))}</td><td>${esc(tr(TARGET_LABEL[x.target][0], TARGET_LABEL[x.target][1]))}<span class="pd-sub">${x.needs ? esc(tr(NEEDS_LABEL[x.needs][0], NEEDS_LABEL[x.needs][1])) : ''}</span></td>
        <td class="num">${x.from == null ? '—' : usd(x.from)} → <b>${x.to == null ? '—' : usd(x.to)}</b></td><td class="num">${x.cmPct != null ? `<span class="pd-margin ${cmTone(x.cmPct)}">${x.cmPct}%</span>` : '—'}</td>
        <td>${esc(x.reason || '—')}</td><td>${esc(x.requestedBy?.name || '')}<span class="pd-sub">${esc(when(x.at))}</span></td>
        <td class="pd-row-actions">${canDecide ? `<button class="pd-btn small primary" data-pd="pc-approve" data-id="${esc(x.id)}">${tr('批准', 'Approve')}</button><button class="pd-btn small" data-pd="pc-reject" data-id="${esc(x.id)}">${tr('驳回', 'Reject')}</button>` : ''}${x.requestedBy?.id === me ? `<button class="pd-btn small" data-pd="pc-withdraw" data-id="${esc(x.id)}">${tr('撤回', 'Withdraw')}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></section>`;
  }
  function planInputs(P) {
    const live = !!srv.data?.items?.length && ctx.state().capabilities?.pricingRules === true;
    const n = (k, label, v, ph, unit = '$') => `<label class="pd-field"><span>${label} <em>${unit}</em></span><input type="number" step="1" min="0" data-pd-plan="${k}" value="${v ?? ''}" placeholder="${ph ?? ''}"></label>`;
    const p = P.p;
    return `<section class="pd-card pd-settings"><div class="pd-card-head"><h3>${icon('sliders-horizontal')} ${tr('这个 SKU 的定价输入', 'Pricing inputs for this SKU')}</h3></div>
      <form id="pd-plan" class="pd-grid3">
        <label class="pd-field"><span>${tr('产品类型（决定 MSRP 目标）', 'Product class (sets the MSRP target)')}</span><select name="priceClass">${Object.keys(CLASS).map(k => `<option value="${k}" ${k === P.cls ? 'selected' : ''}>${tr(CLASS[k][0], CLASS[k][1])} · ${rules.classes[k]}%</option>`).join('')}</select></label>
        ${n('landedUsd', tr('到岸价', 'Landed cost'), p.landedUsd, P.landedSet ? '' : (P.landed != null ? Math.round(P.landed) : ''))}
        ${n('lastMileUsd', tr('尾程运费', 'Last-mile shipping'), p.lastMileUsd, '')}
        ${n('actualPrice', tr('真实售价', 'Actual selling price'), p.actualPrice, p.msrp ?? '')}
        <label class="pd-field"><span>MSRP <em>$</em></span><input value="${p.msrp ?? ''}" disabled title="${tr('MSRP 在产品资料里维护', 'MSRP is kept in the product catalog')}"></label>
        <label class="pd-field"><span>${tr('顾客另付运费', 'Shipping the customer pays')} <em>$</em></span><input type="number" step="1" min="0" data-pd-plan="shipFee" value="${p.shipFee ?? ''}" ${live && canEditPrice() ? '' : 'disabled'}></label>
        ${live ? `<label class="pd-field"><span>${tr('调价原因（可选）', 'Reason for a price change (optional)')}</span><input name="reason"></label>` : ''}
      </form>
      ${(p.pendingPrices || []).filter(x => x.target === 'actual').map(x => `<div class="pd-flag warn">${icon('hourglass-medium')} ${tr(`真实售价调整为 ${money0(x.price)} 的申请正在等待管理员审批。`, `A change of the actual price to ${money0(x.price)} is awaiting admin approval.`)}</div>`).join('')}
      <div class="pd-actions"><button class="pd-btn primary" data-pd="plan-save">${icon('floppy-disk')} ${live ? tr('保存定价输入', 'Save pricing inputs') : tr('应用（示例数据不保存）', 'Apply (sample data is not saved)')}</button></div>
      <p class="pd-hint">${tr('到岸价 = 工厂价 + 头程运费 + 关税 + 清关杂费；留空时按成本模型估算。真实售价留空时按 MSRP 计算。', 'Landed = factory price + ocean freight + duties + clearance; left blank, the cost model estimates it. Actual price defaults to MSRP.')}</p></section>`;
  }
  function rulesPanel() {
    const can = srv.data?.canEditRules === true || (!srv.data?.items?.length && ctx.state().actor?.isAdmin === true);
    const R = rulesDraft || rules, dis = can ? '' : 'disabled';
    const n = (path, v, step = .5) => `<input type="number" step="${step}" min="0" max="100" data-pd-rule="${path}" value="${v}" ${dis}>`;
    const rows = (k, label, rule) => `<tr><td>${label}</td><td class="num">${n(`tiers.${k}.0`, R.tiers[k][0])} – ${n(`tiers.${k}.1`, R.tiers[k][1])} %</td><td class="num">${(1 / (1 - retailRateOf(R) / 100 - R.tiers[k][1] / 100)).toFixed(2)}–${(1 / (1 - retailRateOf(R) / 100 - R.tiers[k][0] / 100)).toFixed(2)}</td><td>${rule}</td></tr>`;
    const upd = rules.updatedAt ? tr(`最近修改：${new Date(rules.updatedAt).toLocaleString('zh-CN')}`, `Last changed: ${new Date(rules.updatedAt).toLocaleString('en-US')}`) : tr('使用默认规则（2026-11-02 版）', 'Default rules (Nov 2, 2026)');
    return `<section class="pd-card"><div class="pd-card-head"><h3>${icon('scales')} ${tr('销售费率', 'Selling expense rates')}</h3><span class="pd-hint">${upd}${can ? '' : ' · ' + tr('仅公司管理员可以修改', 'only company admins can edit')}</span></div>
      <table class="pd-table"><thead><tr><th>${tr('项目', 'Item')}</th><th class="num">${tr('零售（占售价）', 'Retail (% of price)')}</th></tr></thead><tbody>
      ${R.retail.map((x, i) => `<tr><td>${esc(tr(x.zh, x.en))}</td><td class="num">${n(`retail.${i}.pct`, x.pct)} %</td></tr>`).join('')}
      <tr class="pd-subtotal"><td>${tr('零售合计', 'Retail total')}</td><td class="num"><b>${retailRateOf(R)}%</b></td></tr>
      <tr><td>${tr('批发销售费率（品牌、提成、退换货及保修、管理费）', 'Wholesale rate (brand, commission, returns & warranty, management)')}</td><td class="num">${n('wholesalePct', R.wholesalePct)} %</td></tr>
      <tr><td>${tr('Amazon / eBay 额外费率', 'Amazon / eBay extra')}</td><td class="num">${n('platformExtraPct', R.platformExtraPct)} %</td></tr></tbody></table></section>
    <section class="pd-card"><div class="pd-card-head"><h3>${icon('stairs')} ${tr('零售计价规则（贡献利润率）', 'Retail pricing rules (contribution margin)')}</h3><span class="pd-hint">${tr('倍数 = 售价 ÷ 送达成本（不含顾客另付运费）', 'Multiplier = price ÷ delivered cost (before customer-paid shipping)')}</span></div>
      <table class="pd-table"><thead><tr><th>${tr('档位', 'Tier')}</th><th class="num">${tr('贡献利润率', 'CM %')}</th><th class="num">${tr('售价 ≈ 送达成本 ×', 'Price ≈ delivered ×')}</th><th>${tr('规则', 'Rule')}</th></tr></thead><tbody>
      ${Object.keys(CLASS).map(k => `<tr><td>MSRP · ${tr(CLASS[k][0], CLASS[k][1])}</td><td class="num">${n(`classes.${k}`, R.classes[k], 1)} %</td><td class="num">${(1 / (1 - retailRateOf(R) / 100 - R.classes[k] / 100)).toFixed(2)}</td><td>${k === 'standard' ? tr('其他所有产品，起步', 'All other products, minimum') : k === 'rd' ? tr('自主研发、创新产品', 'In-house R&D / innovation') : tr('机器专用、不可替代', 'Machine-specific, non-substitutable')}</td></tr>`).join('')}
      ${rows('everyday', tr('日常调整', 'Everyday adjustment'), tr('运营与市场部根据竞争调整', 'Ops and Marketing adjust for competition'))}
      ${rows('small', tr('小促', 'Small promotion'), tr('常规活动', 'Regular promotions'))}
      ${rows('major', tr('大促', 'Major promotion'), `${tr('黑五、准备淘汰的型号；每年最多', 'Black Friday, phase-out models; up to')} ${n('majorPerYear', R.majorPerYear, 1)} ${tr('次', 'times a year')}`)}
      ${rows('clearance', tr('清货', 'Clearance'), tr('清库存，需总裁批准', 'Inventory clearance; President approval'))}
      <tr><td>${tr('常规底线', 'Standard floor')}</td><td class="num">${n('floorPct', R.floorPct, 1)} %</td><td></td><td>${tr('低于底线标红，需要总裁批准', 'Below the floor shows red and needs President approval')}</td></tr>
      </tbody></table></section>
    <section class="pd-card"><div class="pd-card-head"><h3>${icon('handshake')} ${tr('批发计价规则（按 MSRP 打折，运费由经销商承担）', 'Wholesale rules (off MSRP, dealer pays freight)')}</h3></div>
      <table class="pd-table"><tbody>
      <tr><td>${tr('普通经销商起步折扣', 'Standard dealer base discount')}</td><td class="num">${n('wholesale.base', R.wholesale.base, 1)} %</td></tr>
      <tr><td>${tr('大经销商折扣', 'Large dealer discount')}</td><td class="num">${n('wholesale.large', R.wholesale.large, 1)} %</td></tr>
      <tr><td>${tr('单笔订单超过 $50,000，再加', 'Order over $50,000, additional')}</td><td class="num">${n('wholesale.over50k', R.wholesale.over50k, 1)} ${tr('个点', 'points')}</td></tr>
      <tr><td>${tr('单笔订单超过 $100,000，再加', 'Order over $100,000, additional')}</td><td class="num">${n('wholesale.over100k', R.wholesale.over100k, 1)} ${tr('个点', 'points')}</td></tr>
      </tbody></table>
      ${can ? `<div class="pd-actions"><button class="pd-btn primary" data-pd="rules-save" ${rulesDraft ? '' : 'disabled'}>${icon('floppy-disk')} ${tr('保存定价规则', 'Save pricing rules')}</button>${rulesDraft ? `<button class="pd-btn" data-pd="rules-cancel">${tr('放弃修改', 'Discard changes')}</button><span class="pd-unsaved">${tr('有未保存的修改', 'Unsaved changes')}</span>` : ''}</div>` : ''}
      <p class="pd-hint">${tr('规则保存后，所有 SKU 的价格档位、批发价和利润会按新规则重算。', 'After saving, every SKU’s tiers, wholesale prices and margins recalculate.')}</p></section>`;
  }
  const retailRateOf = R => Math.round(R.retail.reduce((n, r) => n + (Number(r.pct) || 0), 0) * 100) / 100;

  /* ---------- supply chain rows: real inventory injected at runtime, else derived from the sample catalog ---------- */
  const INV = window.WORKOS_INVENTORY_DATA;
  const invSource = INV?.source || tr('示例库存', 'Sample inventory');
  const isMachine = t => /整机/.test(t || '');
  const buildStock = () => (INV?.items || products.map(p => ({ sku:p.sku, name:L(p.name), type:p.type, factory:tr('示例工厂', 'Sample factory'), unitUsd:p.factoryRmb ? p.factoryRmb / assumptions.fx : 0, wh:p.wh, dg:p.ready, jn:0, transit:p.transit, transitEta:p.transit ? [[addDays(machineDays(p)).toISOString().slice(0, 10), p.transit]] : [], velocity:p.velocity, oldestAge:p.age, avgAge:Math.round(p.age * .7), aged90:p.age > 90 ? p.wh : 0, repair:0, out90:Math.round(p.velocity * 90) }))).map(r => {
    const cat = bySku(r.sku), machine = isMachine(r.type);
    return { ...r, cat, machine, status:cat?.status || 'none', factoryStock:(r.dg || 0) + (r.jn || 0), agedUnits:Math.min(r.wh || 0, r.aged90 || 0),
      moq:machine ? 5 : 20, prodDays:machine ? 25 : 12, shipDays:machine ? 35 : 20, icon:iconFor(r.type || '') };
  });
  const stockRows = buildStock();
  const syncInv = () => { if (INV) products.forEach(p => { const r = stockRows.find(x => x.sku === p.sku); if (r) Object.assign(p, { wh:r.wh || 0, transit:r.transit || 0, ready:r.factoryStock, wip:0, velocity:r.velocity || 0, age:r.oldestAge || 0 }); else Object.assign(p, { wh:0, transit:0, ready:0, wip:0 }); }); };
  syncInv();
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
    cost:['PRODUCT PIM · PRICING', '定价', 'Pricing', '输入 SKU 或名称，按公司计价规则查看送达成本、各档售价、批发价和利润。成本明细由总裁授权查看。', 'Enter a SKU or name to see the delivered cost, price tiers, wholesale prices and margins under the company pricing rules. Cost details are granted by the president.'],
    supply:['WORK OS · SCM', '供应链管理（SCM）', 'Supply chain (SCM)', '用颜色一眼看出哪些 SKU 需要补货、库存超期或库存过多，并自动给出补货建议。', 'Colors show at a glance which SKUs need reordering, have aged stock or are overstocked, with automatic reorder suggestions.'],
  };
  /* 产品资料 is the product library (product-library.js) once the server offers it: real data only, no sample rows or test banner. */
  const libraryOn = () => !!window.WorkOSProductLibrary && ctx?.state?.().capabilities?.productLibrary === true;
  function render(tab) {
    if (!ctx) return '';
    if (tab && tab !== ui.tab) { ui.tab = tab; ui.product = null; }
    if ((tab || ui.tab) === 'catalog' && libraryOn()) return window.WorkOSProductLibrary.render();
    // 定价 is the same product library in pricing mode: basic facts, landed + last mile and the NPCR calculation; MSRP edits save to the product.
    if ((tab || ui.tab) === 'cost' && libraryOn()) return window.WorkOSProductLibrary.render('pricing');
    let [eyebrow, zh, en, dzh, den] = PAGES[ui.tab] || PAGES.catalog;
    loadServer();
    if (ui.tab === 'cost' && !canDetail()) { dzh = '输入 SKU 或名称，查询产品的零售价。'; den = 'Enter a SKU or name to look up the retail price.'; }
    const d = srv.data, live = !!d?.items?.length, last = ui.tab === 'cost' ? d?.lastPricingImport : d?.lastCatalogImport;
    const actions = ui.tab === 'catalog' && d?.canImportCatalog ? `<button class="pd-btn" data-pd="import" data-kind="catalog">${icon('upload-simple')} ${tr('导入产品资料', 'Import catalog')}</button>`
      : ui.tab === 'cost' && d?.canImportPricing && !ui.viewAsBasic ? `<button class="pd-btn" data-pd="import" data-kind="pricing">${icon('upload-simple')} ${tr('导入成本数据', 'Import cost data')}</button>`
      : ui.tab === 'supply' ? window.WorkOSErpAccess?.button?.('supply', 'pd-btn') || '' : '';
    return `<div class="pd">
      <div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${tr(zh, en)}</h1><p>${tr(dzh, den)}${last && ui.tab !== 'supply' ? `<br><small class="pd-hint">${tr(`最近导入：${new Date(last.at).toLocaleString('zh-CN')} · ${last.rows} 行`, `Last import: ${new Date(last.at).toLocaleString('en-US')} · ${last.rows} rows`)}</small>` : ''}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>
      <div class="pd-banner">${icon('lock-simple')} ${live ? (ui.tab === 'cost' && canDetail() ? tr(`受限区域 · 数据来源：${source} · 定价输入、渠道价格和定价规则可直接保存，低于利润底线的调价需管理员批准；工厂成本请用“导入”更新`, `Restricted · data: ${source} · pricing inputs, channel prices and rules save directly; changes below the margin floor need admin approval; update factory costs by import`) : tr(`受限区域 · 数据来源：${source} · 产品资料可直接编辑保存，每次修改都有记录；也可以用“导入”批量更新`, `Restricted · data: ${source} · product details save directly and every change is recorded; bulk updates by import`)) : tr(`受限区域 · 测试原型 · 数据来源：${source} · 修改不会保存${d && !d.failed && (d.canImportCatalog) ? ' · 点右上角“导入产品资料”换成真实数据' : ''}`, `Restricted · test prototype · data: ${source} · changes are not saved${d && !d.failed && d.canImportCatalog ? ' · use “Import catalog” to load real data' : ''}`)}</div>
      ${ui.tab === 'cost' ? costBoard() : ui.tab === 'supply' ? supplyBoard() : ui.product ? productEditor(ui.product === NEW ? NEW : bySku(ui.product)) : catalog()}
    </div>`;
  }

  /* ---------- 1. catalog (Shopify admin style) ---------- */
  const pill = k => `<span class="pd-pill" style="--c:${STATUS[k][2]}">${esc(tr(STATUS[k][0], STATUS[k][1]))}</span>`;
  const typesOf = () => [...new Set(products.map(p => p.type).filter(Boolean))];
  const ATTRS = [['name', '名称', 'Name'], ['sku', 'SKU', 'SKU'], ['type', '产品线', 'Product line'], ['msrp', '零售价 MSRP', 'MSRP'], ['gross', '毛重', 'Gross weight'], ['dims', '包装尺寸', 'Package size'], ['best', '最优发货方式', 'Best shipping'], ['lead', '交期', 'Lead time']];
  const missingAttrs = p => ATTRS.filter(([k]) => { const v = p[k]; return v == null || v === '' || (Array.isArray(v) && !v.every(x => x > 0)); });
  const completeness = p => Math.round((ATTRS.length - missingAttrs(p).length) / ATTRS.length * 100);
  function catalog() {
    const q = ui.search.trim().toLowerCase();
    const list = products.filter(p => (!q || `${p.sku} ${nameText(p)} ${p.type || ''}`.toLowerCase().includes(q)) && (!ui.typeFilter || p.type === ui.typeFilter) && (!ui.statusFilter || p.status === ui.statusFilter) && (!ui.incomplete || completeness(p) < 100));
    const incompleteN = products.filter(p => completeness(p) < 100).length;
    const counts = Object.keys(STATUS).map(k => [k, products.filter(p => p.status === k).length]).filter(x => x[1]);
    const detail = canDetail(), types = typesOf();
    return `<div class="pd-toolbar"><label class="pd-search">${icon('magnifying-glass')}<input data-pd-search placeholder="${tr('搜索 SKU、名称或产品线', 'Search SKU, name or product line')}" value="${esc(ui.search)}"></label>
      <select class="pd-select inline" data-pd-filter="typeFilter"><option value="">${tr('全部产品线', 'All product lines')} (${products.length})</option>${types.map(t => `<option value="${esc(t)}" ${ui.typeFilter === t ? 'selected' : ''}>${esc(t)} (${products.filter(p => p.type === t).length})</option>`).join('')}</select>
      <button class="pd-btn primary" data-pd="new-product">${icon('plus')} ${tr('添加产品', 'Add product')}</button></div>
      <div class="pd-chips"><button class="pd-chip warn ${ui.incomplete ? 'on' : ''}" data-pd="incomplete">${icon('pencil-simple-line')} ${tr('资料待补齐', 'Needs attributes')} ${incompleteN}</button>${counts.map(([k, n]) => `<button class="pd-chip ${ui.statusFilter === k ? 'on' : ''}" data-pd="status-filter" data-v="${k}"><i style="--c:${STATUS[k][2]}"></i>${esc(tr(STATUS[k][0], STATUS[k][1]))} ${n}</button>`).join('')}</div>
      <section class="pd-card"><table class="pd-table" data-help-table="pd-catalog"><thead><tr><th>${tr('产品', 'Product')}</th><th>${tr('供应链状态', 'Status')}</th><th>${tr('产品线', 'Product line')}</th><th class="num">${tr('海外仓', 'Warehouse')}</th><th>${tr('资料完整度', 'Completeness')}</th><th>${tr('最优发货方式', 'Best shipping')}</th><th class="num">${tr('零售价 MSRP', 'MSRP')}</th></tr></thead><tbody>
      ${list.map(p => `<tr data-pd="open-product" data-sku="${esc(p.sku)}" tabindex="0"><td><div class="pd-prod"><span class="pd-thumb">${icon(p.icon)}</span><div><strong>${esc(L(p.name))}</strong><span>${esc(p.sku) || tr('无 SKU', 'No SKU')}${p.note ? ` · ${esc(p.note)}` : ''}</span></div></div></td><td>${pill(p.status)}</td><td>${esc(p.type || '—')}</td><td class="num ${p.wh != null && p.wh < 5 && p.velocity ? 'pd-bad' : ''}">${p.wh == null ? '—' : p.wh}${p.transit ? `<small> · ${p.transit} ${tr('在途', 'inbound')}</small>` : ''}</td><td>${(() => { const c = completeness(p); return `<span class="pd-complete ${c === 100 ? 'ok' : c >= 75 ? 'mid' : 'low'}" title="${esc(missingAttrs(p).map(a => tr(a[1], a[2])).join('、'))}"><i style="--w:${c}%"></i><b>${c}%</b></span>`; })()}</td><td>${esc(p.best || '—')}</td><td class="num">${p.msrp ? usd(p.msrp) : '—'}</td></tr>`).join('') || `<tr><td colspan="7" class="pd-empty">${tr('没有匹配的产品', 'No matching products')}</td></tr>`}
      </tbody></table></section>`;
  }
  /* ---------- product editor: saves to the server when real catalog data is loaded ---------- */
  const NEW = '__new__';
  const serverOn = () => !!srv.data && !srv.data.failed && ctx.state().capabilities?.productsData === true;
  const liveData = () => !!srv.data?.items?.length;
  const isAdmin = () => ctx.state().actor?.isAdmin === true;
  const canEditCat = () => srv.data ? srv.data.canEditCatalog === true : isAdmin() || (ctx.state().actor?.grants || []).includes('products_manage');
  const canEditPrice = () => srv.data ? srv.data.canEditMsrp === true : canEditCat();
  const FIELD_LABEL = { name_zh:['中文名称', 'Chinese name'], name_en:['英文名称', 'English name'], type:['产品线', 'Product line'], status:['状态', 'Status'], gross:['毛重', 'Gross weight'], dims:['包装尺寸', 'Package size'], lead:['交期', 'Lead time'], moq:['MOQ', 'MOQ'], best:['最优发货方式', 'Best shipping'], note:['备注', 'Notes'] };
  const TARGET_LABEL = { msrp:['MSRP', 'MSRP'], actual:['真实售价', 'Actual price'], shopify:['官网 1laser.com', '1laser.com'], amazon:['Amazon', 'Amazon'], ebay:['eBay', 'eBay'], dealer:['经销商', 'Dealers'] };
  const NEEDS_LABEL = { floor:['低于贡献利润底线', 'Below the margin floor'], loss:['低于成本', 'Below cost'], dealer_discount:['超过最大批发折扣', 'Deeper than the largest dealer discount'] };
  const PC_STATUS = { applied:['已生效', 'Applied'], pending:['待审批', 'Awaiting approval'], rejected:['已驳回', 'Rejected'], withdrawn:['已撤回', 'Withdrawn'], superseded:['已被新申请替代', 'Replaced'] };
  const when = at => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }); };
  const fmtVal = (field, v) => v == null || v === '' ? '—' : field === 'status' ? tr((STATUS[v] || STATUS.none)[0], (STATUS[v] || STATUS.none)[1]) : field === 'dims' && Array.isArray(v) ? v.join(' × ') : String(v);
  const hist = {};
  function loadHistory(sku) {
    if (!liveData() || !sku || hist[sku]) return;
    hist[sku] = { loading:true };
    ctx.api.get(`/products/${encodeURIComponent(sku)}/history`).then(r => { hist[sku] = { data:r }; }).catch(e => { hist[sku] = { error:e.message || '' }; }).finally(() => ctx.rerender());
  }
  // targets: which price targets this card shows (the catalog editor shows MSRP only).
  function historyCard(sku, targets, fields = true) {
    if (!liveData()) return '';
    loadHistory(sku);
    const h = hist[sku];
    if (!h || h.loading) return `<section class="pd-card"><h3>${icon('clock-counter-clockwise')} ${tr('变更记录', 'Change history')}</h3><p class="pd-hint">${tr('加载中…', 'Loading…')}</p></section>`;
    if (h.error) return `<section class="pd-card"><h3>${icon('clock-counter-clockwise')} ${tr('变更记录', 'Change history')}</h3><p class="pd-hint">${esc(h.error)}</p></section>`;
    const rows = [
      ...(fields ? h.data.changes.filter(c => FIELD_LABEL[c.field]).map(c => ({ at:c.at, who:c.actor?.name, what:tr(FIELD_LABEL[c.field][0], FIELD_LABEL[c.field][1]), change:`${fmtVal(c.field, c.from)} → ${fmtVal(c.field, c.to)}`, note:c.note, tag:c.source === 'import' ? tr('导入', 'Import') : c.source === 'create' ? tr('新建', 'Created') : '' })) : []),
      ...h.data.prices.filter(p => targets.includes(p.target)).map(p => ({ at:p.at, who:p.requestedBy?.name, what:tr(TARGET_LABEL[p.target][0], TARGET_LABEL[p.target][1]), change:`${p.from == null ? '—' : usd(p.from)} → ${p.to == null ? '—' : usd(p.to)}${p.cmPct != null ? tr(` · 贡献利润 ${p.cmPct}%`, ` · CM ${p.cmPct}%`) : ''}`,
        note:[p.reason === 'import' ? tr('导入', 'Import') : p.reason, p.needs && tr(NEEDS_LABEL[p.needs][0], NEEDS_LABEL[p.needs][1]), p.decidedBy && p.status !== 'superseded' && p.status !== 'withdrawn' && tr(`${p.decidedBy.name} ${p.status === 'rejected' ? '驳回' : '批准'}${p.decisionNote ? `：${p.decisionNote}` : ''}`, `${p.status === 'rejected' ? 'rejected' : 'approved'} by ${p.decidedBy.name}${p.decisionNote ? `: ${p.decisionNote}` : ''}`)].filter(Boolean).join(' · '),
        tag:p.status === 'applied' ? '' : tr(PC_STATUS[p.status][0], PC_STATUS[p.status][1]) })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 30);
    return `<section class="pd-card"><h3>${icon('clock-counter-clockwise')} ${tr('变更记录', 'Change history')}</h3>${rows.length ? `<ol class="pd-hist">${rows.map(r => `<li><div><strong>${esc(r.what)}</strong>${r.tag ? ` <span class="pd-tag">${esc(r.tag)}</span>` : ''}<span class="pd-hist-change">${esc(r.change)}</span></div>${r.note ? `<p>${esc(r.note)}</p>` : ''}<em>${esc(r.who || '')} · ${esc(when(r.at))}</em></li>`).join('')}</ol>` : `<p class="pd-hint">${tr('还没有变更记录。', 'No changes yet.')}</p>`}</section>`;
  }
  function productEditor(p0) {
    const isNew = p0 === NEW;
    const p = isNew ? { sku:'', name:{ zh:'', en:'' }, type:'', status:'dev', icon:'cube', dims:null } : p0;
    if (!p) return catalog();
    const s = isNew ? { lead:'' } : supply(p), c = isNew ? { vol:null } : cost(p), live = isNew ? serverOn() : liveData();
    const ed = live && canEditCat(), edPrice = live && canEditPrice();
    const f = (label, value, attrs = '') => `<label class="pd-field"><span>${label}</span><input value="${esc(value ?? '')}" ${attrs}></label>`;
    const fe = (key, label, value, extra = '', can = ed) => f(label, value, `data-pd-f="${key}" ${extra} ${can ? '' : 'disabled'}`);
    const nm = k => p[k] ?? (typeof p.name === 'object' ? p.name[k === 'nameZh' ? 'zh' : 'en'] : p.name) ?? '';
    const pend = (p.pendingPrices || []).filter(x => x.target === 'msrp');
    const next = (srv.data?.statusNext || {})[p.status === 'none' ? '' : p.status] || [];
    // Admins may move a product anywhere; the usual next steps are listed first so the default is a forward move.
    const options = isAdmin() ? [...next, ...Object.keys(STATUS).filter(k => k !== 'none' && k !== p.status && !next.includes(k))] : next;
    return `<div class="pd-crumb"><button data-pd="back">${icon('caret-left')} ${tr('全部产品', 'All products')}</button></div>
      <div class="pd-editor-head"><span class="pd-thumb big">${icon(p.icon)}</span><div><h2>${isNew ? tr('添加产品', 'Add product') : esc(L(p.name))}</h2><p>${isNew ? tr('新产品从“开发中”开始', 'New products start in development') : `${esc(p.sku)} · ${esc(p.type || '')}`}</p></div>${pill(p.status)}${ed || edPrice || !live ? `<button class="pd-btn primary" data-pd="save-product">${isNew ? tr('创建产品', 'Create product') : tr('保存', 'Save')}</button>` : ''}</div>
      ${!isNew && missingAttrs(p).length ? `<div class="pd-warn">${icon('pencil-simple-line')} ${tr('待产品经理补齐：', 'For the PM to complete: ')}${esc(missingAttrs(p).map(a => tr(a[1], a[2])).join('、'))}</div>` : ''}
      ${pend.length ? `<div class="pd-warn">${icon('hourglass-medium')} ${tr(`MSRP 调整为 ${usd(pend[0].price)} 的申请正在等待管理员审批，批准前仍按 ${p.msrp ? usd(p.msrp) : '—'} 销售。`, `A change of MSRP to ${usd(pend[0].price)} is awaiting admin approval; ${p.msrp ? usd(p.msrp) : '—'} applies until then.`)}</div>` : ''}
      <div class="pd-editor" id="pd-product" data-sku="${esc(p.sku)}" data-new="${isNew ? '1' : ''}">
        <div class="pd-main">
          <section class="pd-card"><h3>${tr('基本信息', 'Basics')}</h3><div class="pd-grid3">${fe('nameZh', tr('中文名称', 'Chinese name'), nm('nameZh'))}${fe('nameEn', tr('英文名称', 'English name'), nm('nameEn'))}${isNew ? fe('sku', 'SKU', '', 'placeholder="OCL-XXX-01"') : f('SKU', p.sku, 'disabled')}${fe('type', tr('产品线', 'Product line'), p.type, 'list="pd-types"')}</div><datalist id="pd-types">${typesOf().map(t => `<option value="${esc(t)}">`).join('')}</datalist>${fe('note', tr('备注', 'Notes'), p.note)}</section>
          ${isNew ? '' : `<section class="pd-card"><h3>${tr('媒体', 'Media')}</h3><div class="pd-media">${[1, 2, 3].map(() => `<span class="pd-thumb big">${icon(p.icon)}</span>`).join('')}<button class="pd-media-add">${icon('upload-simple')}<span>${tr('上传图片 / 视频', 'Upload images / video')}</span></button></div></section>`}
          <section class="pd-card"><h3>${tr('价格', 'Pricing')}</h3><div class="pd-grid3">${fe('msrp', tr('零售价 MSRP (USD)', 'MSRP (USD)'), p.msrp, 'type="number" min="0" step="1"', edPrice)}${edPrice && !isNew ? fe('reason', tr('修改原因（可选，记入变更记录）', 'Reason for the change (optional, kept in the history)'), '', '', true) : ''}</div>
            <p class="pd-hint">${icon('lock-simple')} ${tr('产品管理只维护零售价 MSRP，每次调整都留有记录；贡献利润低于公司底线的调价需管理员批准。其他价格和成本在“成本核算”里，由授权人员查看。', 'The catalog keeps MSRP only; every change is recorded, and a change below the company margin floor needs admin approval. Other prices and costs live in the Cost calculator for authorized people.')}</p></section>
          <section class="pd-card"><h3>${tr('物流参数', 'Shipping')}</h3><div class="pd-grid3">${fe('gross', tr('毛重 (kg)', 'Gross weight (kg)'), p.gross, 'type="number" min="0" step="0.1"')}${f(tr('体积重 (kg，÷6000)', 'Volumetric kg (÷6000)'), c.vol != null ? c.vol.toFixed(1) : '', 'disabled')}${fe('best', tr('最优发货方式', 'Best shipping method'), p.best)}</div>
            <div class="pd-grid3">${[0, 1, 2].map(i => fe(`dims${i}`, [tr('包装 长 (cm)', 'Package L (cm)'), tr('宽 (cm)', 'W (cm)'), tr('高 (cm)', 'H (cm)')][i], p.dims?.[i], 'type="number" min="0" step="1"')).join('')}</div></section>
          <section class="pd-card"><h3>${tr('采购与供应', 'Sourcing')}</h3><div class="pd-grid3">${fe('lead', tr('交期', 'Lead time'), p.lead, 'placeholder="30天左右"')}${fe('moq', tr('最小起订量 (MOQ)', 'MOQ'), live ? p.moqSet : p.moq, 'type="number" min="0" step="1"')}${isNew ? '' : f(tr('计算用总交期（天）', 'Lead time used (days)'), s.lead, 'disabled')}</div>${isNew ? '' : `<p class="pd-hint">${icon('truck')} ${srv.data?.items?.length ? (p.stockKnown ? tr(`库存（来自库存管理）：美国LA仓 ${p.wh} 件 · 在途 ${p.transit} 件 · 工厂仓 ${p.ready} 件`, `Stock (from Inventory): US ${p.wh} · inbound ${p.transit} · factory ${p.ready}`) : tr('库存管理里还没有这个 SKU 的库存记录。', 'No stock record for this SKU in Inventory yet.')) : tr(`海外仓 ${p.wh} 件 · 在途 ${p.transit} 件 · 工厂待发 ${p.ready} 件 · 生产中 ${p.wip} 件${INV ? '' : '（库存为示例，待接入真实库存）'}`, `${p.wh} at warehouse · ${p.transit} inbound · ${p.ready} ready · ${p.wip} in production${INV ? '' : ' (sample stock until real inventory is connected)'}`)}</p>`}</section>
        </div>
        <aside class="pd-side">
          <section class="pd-card"><h3>${tr('产品生命周期', 'Product lifecycle')}</h3>
            <ol class="pd-life">${['dev', 'launch', 'live', 'clearance', 'eolPlanned', 'eol'].map((k, i, arr) => `<li class="${k === p.status ? 'on' : arr.indexOf(p.status) > i ? 'past' : ''}"><i style="--c:${STATUS[k][2]}"></i>${esc(tr(STATUS[k][0], STATUS[k][1]))}</li>`).join('')}</ol>
            ${!isNew && ed ? (options.length ? `<div class="pd-status-form"><select class="pd-select" data-pd-status>${options.map(k => `<option value="${k}">${esc(tr(STATUS[k][0], STATUS[k][1]))}</option>`).join('')}</select>
              <label class="pd-field"><span>${tr('原因（转清库存、计划停售、停售时必填）', 'Reason (required for clearance or leaving sale)')}</span><input data-pd-status-note></label>
              <button class="pd-btn" data-pd="status-save">${icon('arrow-right')} ${tr('更改状态', 'Change status')}</button></div>` : `<p class="pd-hint">${tr('已停售。需要重新上架请联系管理员。', 'Discontinued. Ask an admin to bring it back.')}</p>`) : ''}</section>
          ${isNew ? '' : historyCard(p.sku, ['msrp'])}
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
      ${detail ? approvalsPanel() : ''}
      ${detail ? `<div class="pd-seg pd-viewseg">${[['sku', tr('单个 SKU 定价', 'Price one SKU')], ['rules', tr('公司定价规则', 'Company pricing rules')]].map(([k, l]) => `<button class="${ui.costView === k ? 'active' : ''}" data-pd="cost-view" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
      ${detail && ui.costView === 'rules' ? rulesPanel() : `
      ${p && detail ? priceSystem(p) : ''}
      ${p ? `
        ${detail && c.missing.length && p.landedUsd == null ? `<div class="pd-warn">${icon('warning')} ${tr('缺少数据，结果不完整：', 'Missing data, result incomplete: ')}${esc(c.missing.join('、'))}</div>` : ''}
        ${detail ? `<details class="pd-estimate" ${p.landedUsd == null ? 'open' : ''}><summary>${icon('calculator')} ${p.landedUsd == null ? tr('到岸价估算（按工厂价和头程计算，尚未填写到岸价）', 'Landed cost estimate (from factory price and freight; no landed cost entered yet)') : tr('到岸价估算（已填写到岸价，以下仅供参考）', 'Landed cost estimate (a landed cost is entered; for reference only)')}</summary><div class="pd-cost-grid"><section class="pd-card"><div class="pd-card-head"><h3>${tr('到岸价估算（每台，USD）', 'Landed cost estimate (per unit, USD)')}</h3></div><table class="pd-table pd-breakdown"><tbody>
            ${line(tr('产品成本', 'Product cost'), p.factoryUsd != null ? tr('工厂美元报价', 'factory USD quote') : p.factoryRmb != null ? `¥${int(p.factoryRmb)} × ${(1 + A.exportMarkup / 100).toFixed(2)} ÷ ${A.fx}` : '', c.productUsd)}
            ${line(`${tr('头程到仓', 'Freight to warehouse')} · ${c.mode === 'hybrid' ? 'Hybrid' : 'DDP'}`, c.mode === 'hybrid' ? `(${c.hybNote}) ÷ ${A.fx}` : `(${c.ddpNote}) ÷ ${A.fx}`, c.ship)}
            ${line(tr('到岸价估算', 'Estimated landed cost'), tr('产品 + 头程（填写到岸价后以填写为准）', 'product + freight (an entered landed cost takes priority)'), c.hard, 'pd-total')}
          </tbody></table>
          <div class="pd-ship-compare"><h4>${tr('发货方式对比（头程到仓，每台）', 'Shipping comparison (to warehouse, per unit)')}</h4>
            <div class="pd-compare-row ${c.mode === 'ddp' ? 'on' : ''}"><b>DDP</b><span>${esc(c.ddpNote || '—')}</span><strong>${c.ddp != null ? usd(c.ddp) : '—'}</strong></div>
            <div class="pd-compare-row ${c.mode === 'hybrid' ? 'on' : ''}"><b>Hybrid</b><span>${esc(c.hybNote || tr('无美国尾程报价', 'no US last-mile quote'))}</span><strong>${c.hybrid != null ? usd(c.hybrid) : '—'}</strong></div>
            <p class="pd-hint">${tr(`表格标注的最优方式：${p.best || '未标注'}。计费重量取毛重与体积重（长×宽×高÷6000）较大者：${c.billKg ? c.billKg.toFixed(1) + 'kg' : '—'}。`, `Sheet's best method: ${p.best || 'not set'}. Billable weight = max(gross, L×W×H÷6000): ${c.billKg ? c.billKg.toFixed(1) + 'kg' : '—'}.`)}</p></div></section>
          ${costSettings(p, c)}</div></details>`
        : `<div class="pd-locked">${icon('lock-simple')} ${tr('成本、分销价和利润仅限总裁授权的人员查看。你可以查询 SKU 和零售价。', 'Cost, dealer price and profit are visible only to people the president has authorized. You can look up SKUs and retail prices.')}</div>`}` : `<p class="pd-hint">${tr('输入 SKU 或名称开始查询。', 'Enter a SKU or name to start.')}</p>`}`}
    </div>`;
  }

  /* ---------- editable, savable cost settings for one SKU ---------- */
  function costSettings(p, c) {
    const o = ovOf(p.sku), base = p, A = assumeFor(p);
    const num = (group, key, label, value, def, step = 1, unit = '') => { const changed = o[group][key] != null; return `<label class="pd-field ${changed ? 'changed' : ''}"><span>${label}${unit ? ` <em>${unit}</em>` : ''}</span><input type="number" step="${step}" data-pd-ov="${group}.${key}" value="${value ?? ''}" placeholder="${def ?? ''}">${changed ? `<small>${tr('表格原值', 'Sheet value')}：${def ?? '—'}</small>` : ''}</label>`; };
    const f = k => o.fields[k] ?? base[k], a = k => o.assume[k] ?? assumptions[k];
    const fx = `<div class="pd-fx">${icon('currency-circle-dollar')} <div><strong>USD/CNY ${A.fx}</strong><span>${fxState.live ? tr(`实时汇率 ${fxState.live}（${fxState.source}，${fxState.asOf || ''}）`, `Live rate ${fxState.live} (${fxState.source}, ${fxState.asOf || ''})`) : fxState.loading ? tr('正在获取实时汇率…', 'Fetching live rate…') : tr('未能获取实时汇率，使用默认值', 'Live rate unavailable; using default')}</span></div><label class="pd-check"><input type="checkbox" data-pd-fxlock ${fxState.locked ? 'checked' : ''}> ${tr('锁定汇率', 'Lock rate')}</label>${fxState.locked ? `<input type="number" step="0.01" class="pd-fx-in" data-pd-fx value="${assumptions.fx}">` : ''}</div>`;
    return `<section class="pd-card pd-settings"><div class="pd-card-head"><h3>${icon('sliders-horizontal')} ${tr('到岸价估算参数（该 SKU）', 'Landed-cost estimate settings (this SKU)')}</h3>${dirty(p.sku) ? `<span class="pd-unsaved">${tr('有未保存的修改', 'Unsaved changes')}</span>` : ''}</div>
      ${fx}<p class="pd-hint">${tr('汇率按实时汇率自动更新，所有价格档的利润随之重算；需要按固定汇率测算时可以锁定。', 'FX follows the live rate and every price point recalculates; lock it to test a fixed rate.')}</p>
      <h4>${tr('产品成本', 'Product cost')}</h4><div class="pd-grid3">${num('fields', 'factoryRmb', tr('工厂价（含税）', 'Factory price (incl. tax)'), f('factoryRmb'), base.factoryRmb, 10, '¥')}${num('assume', 'exportMarkup', tr('出口加价', 'Export markup'), a('exportMarkup'), assumptions.exportMarkup, .1, '%')}${num('fields', 'extraRmb', tr('其他成本（包装、配件、赠品）', 'Other cost (packing, accessories)'), f('extraRmb'), 0, 10, '¥')}</div>
      <h4>${tr('头程运费', 'Freight')}</h4><div class="pd-grid3">${num('fields', 'gross', tr('毛重', 'Gross weight'), f('gross'), base.gross, .1, 'kg')}${num('fields', 'ddpRate', tr('DDP 单价', 'DDP rate'), f('ddpRate'), base.ddpRate ?? assumptions.parcelRmbPerKg, .1, '¥/kg')}${num('assume', 'ddpFixedRmb', tr('DDP 固定费用', 'DDP fixed fees'), a('ddpFixedRmb'), assumptions.ddpFixedRmb, 10, '¥')}${num('assume', 'oceanRmbPerKg', tr('Hybrid 海运', 'Hybrid ocean'), a('oceanRmbPerKg'), assumptions.oceanRmbPerKg, .1, '¥/kg')}${num('assume', 'hybridFixedRmb', tr('Hybrid 固定费用', 'Hybrid fixed fees'), a('hybridFixedRmb'), assumptions.hybridFixedRmb, 10, '¥')}${num('fields', 'lastMileRmb', tr('美国尾程', 'US last mile'), f('lastMileRmb'), base.lastMileRmb, 10, '¥')}${num('assume', 'freightBuffer', tr('运费上浮', 'Freight buffer'), a('freightBuffer'), assumptions.freightBuffer, 1, '%')}</div>
      <h4>${tr('售价', 'Prices')}</h4><div class="pd-grid3">${num('fields', 'msrp', 'MSRP', f('msrp'), base.msrp, 1, '$')}${num('fields', 'shipFee', tr('顾客另付运费', 'Shipping the customer pays'), f('shipFee'), base.shipFee, 1, '$')}</div>
      <label class="pd-field"><span>${tr('头程方式', 'Freight method')}</span><select data-pd-ov="assume.shipMode">${[['auto', tr('自动选更便宜的', 'Cheaper of the two')], ['ddp', 'DDP'], ['hybrid', 'Hybrid']].map(([k, l]) => `<option value="${k}" ${A.shipMode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="pd-actions"><button class="pd-btn primary" data-pd="ov-save" ${dirty(p.sku) ? '' : 'disabled'}>${icon('floppy-disk')} ${tr('保存这个 SKU 的成本设置', 'Save cost settings for this SKU')}</button><button class="pd-btn" data-pd="ov-reset">${icon('arrow-counter-clockwise')} ${tr('恢复表格默认值', 'Reset to sheet values')}</button></div>
      <p class="pd-hint">${tr('修改后到岸价估算和价格档位会马上重算；保存后下次打开仍然生效。测试版保存在本机浏览器，正式版会保存到服务器并记录修改人和时间。', 'Changes recalculate the estimate and the price tiers immediately; saved settings persist. The test build saves in this browser; the release saves to the server with who changed what and when.')}</p></section>`;
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
        ${node(825, 150, '#579bfc', tr('美国LA仓', 'US warehouse'), tr(`其中超 90 天 ${money(aged)}`, `${money(aged)} older than 90 days`), us)}
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
        ${kpi(tr('美国LA仓库存货值', 'US warehouse value'), money(M.whValue), `${int(M.rows.reduce((n, x) => n + (x.r.wh || 0), 0))} ${tr('件', 'units')}`)}
        ${kpi(tr('超 90 天库存占比', 'Aged >90 days'), agedPct + '%', `${money(M.agedValue)} ${tr('货值', 'value')}`, agedPct >= 50 ? 'bad' : agedPct >= 25 ? 'warn' : '')}
        ${kpi(tr('工厂仓库存货值', 'Factory warehouse value'), money(M.factoryValue), tr('东莞 + 济南', 'Dongguan + Jinan'))}
        ${kpi(tr('在途货值', 'In transit'), money(M.transitValue), `${int(M.rows.reduce((n, x) => n + (x.r.transit || 0), 0))} ${tr('件', 'units')}`)}
        ${kpi(tr('近 90 天出库', 'Shipped, last 90 days'), int(M.out90), tr('件（美国LA仓）', 'units (US warehouse)'))}
        ${kpi(tr('美国LA仓可售天数', 'US days of cover'), M.coverDays === Infinity ? '∞' : Math.round(M.coverDays), `${tr('按近期出库速度', 'at recent sell-through')}${repairs ? ` · ${repairs} ${tr('台维修/待检', 'in repair/inspection')}` : ''}`, M.coverDays > 180 ? 'warn' : '')}
      </div>
      ${window.WorkOSInsights?.slot('supply') || ''}
      ${regionView(M)}
      <div class="pd-health">${tiles.map(([k, list]) => `<button class="pd-htile ${ui.scFilter === k ? 'on' : ''}" style="--c:${STATE[k][3]}" data-pd="sc-filter" data-v="${ui.scFilter === k ? 'all' : k}"><span>${icon(STATE[k][4])} ${esc(tr(STATE[k][0], STATE[k][1]))}</span><strong>${list.length}</strong><em>SKU · ${money(list.reduce((t, x) => t + x.s.whValue, 0))} ${tr('在美国LA仓', 'in US')}</em></button>`).join('')}</div>
      <p class="pd-hint">${tr(`颜色规则：红 = 美国LA仓加在途不够卖 14 天；橙 = 到了补货点或应从工厂仓调货；紫 = 最老一批库存超过 ${ui.ageLimit} 天；蓝 = 全部库存超过目标的 1.8 倍；灰 = 有库存但近期没有出库。点击色块筛选下表。`, `Red = US + inbound covers under 14 days; orange = at reorder point or should transfer from factory; purple = oldest stock older than ${ui.ageLimit} days; blue = pipeline over 1.8× target; gray = stock but no recent shipments. Click a tile to filter.`)}</p>
      <div class="pd-charts">
        <section class="pd-card"><h3>${icon('hourglass-medium')} ${tr('美国LA仓库龄分布（按货值）', 'US stock age (by value)')}</h3>${svgColumns(M.ages.map(([label, v, old]) => ({ label:label + tr('天', 'd'), parts:[[v, old ? (label === '>365' ? '#e2445c' : '#a25ddc') : '#00c875', `${label}: ${money(v)}`]] })), null, money)}<p class="pd-hint">${tr('紫色和红色是超过 90 天的库存，越高越需要清理。', 'Purple and red are older than 90 days — the taller, the more to clear.')}</p></section>
        <section class="pd-card"><h3>${icon('stack')} ${tr('各产品线库存货值（美国LA仓 / 在途 / 工厂仓）', 'Inventory value by line (US / transit / factory)')}</h3>${svgBars(M.types.slice(0, 8).map(t => ({ label:t.t, parts:[[t.wh, '#579bfc', `${tr('美国LA仓', 'US')} ${money(t.wh)}`], [t.tr, '#00c875', `${tr('在途', 'Transit')} ${money(t.tr)}`], [t.fac, '#fdab3d', `${tr('工厂仓', 'Factory')} ${money(t.fac)}`]] })), { fmt:money })}<ul class="pd-legend-inline"><li><i style="background:#579bfc"></i>${tr('美国LA仓', 'US warehouse')}</li><li><i style="background:#00c875"></i>${tr('在途', 'In transit')}</li><li><i style="background:#fdab3d"></i>${tr('工厂仓', 'Factory')}</li></ul></section>
        ${monthly.length ? `<section class="pd-card"><h3>${icon('chart-bar')} ${tr('美国LA仓月度出库（件）', 'US warehouse shipments per month (units)')}</h3>${svgColumns(monthly.map(([m, v]) => ({ label:m.slice(5) + tr('月', ''), parts:mTypes.map((t, i) => [v[t] || 0, TYPE_COLORS[i % TYPE_COLORS.length], `${t}: ${v[t] || 0}`]) })), null, n => String(n))}<ul class="pd-legend-inline">${mTypes.map((t, i) => `<li><i style="background:${TYPE_COLORS[i % TYPE_COLORS.length]}"></i>${esc(t)}</li>`).join('')}</ul></section>` : ''}
        <section class="pd-card"><h3>${icon('ranking')} ${tr('美国LA仓货值前 10 的 SKU', 'Top 10 SKUs by US value')}</h3>${svgBars([...M.rows].sort((a, b) => b.s.whValue - a.s.whValue).slice(0, 10).map(x => ({ label:x.r.name, parts:[[x.s.whValue, STATE[x.s.state][3], `${x.r.sku} · ${x.r.wh} ${tr('件', 'pcs')} · ${tr('可售', 'cover')} ${x.s.cover === Infinity ? '∞' : Math.round(x.s.cover)} ${tr('天', 'd')}`]] })), { fmt:money })}<p class="pd-hint">${tr('颜色与上方库存健康色块一致。', 'Colors match the stock-health tiles above.')}</p></section>
      </div>
      <div class="pd-strategy">
        <section class="pd-card pd-replen"><div class="pd-card-head"><h3>${icon('magic-wand')} ${tr('补货策略', 'Replenishment plan')} <b class="pd-count">${M.reorders.length}</b></h3><form class="pd-replen-set" id="pd-replen"><label>${tr('安全天数', 'Safety days')} <input type="number" name="safety" min="0" max="120" value="${ui.safety}"></label><label>${tr('目标备货天数', 'Target cover')} <input type="number" name="cover" min="7" max="180" value="${ui.cover}"></label><label>${tr('超期阈值', 'Aged after')} <input type="number" name="ageLimit" min="30" max="720" value="${ui.ageLimit}"></label></form></div>
          ${M.reorders.map(({ r, s }) => `<div class="pd-tip" style="--c:${STATE[s.state][3]}"><div><strong>${esc(r.name)}</strong><span>${esc(r.sku)} · ${tr('美国LA仓', 'US')} ${r.wh} · ${tr('在途', 'transit')} ${r.transit || 0}${s.nextEta ? ` (${s.nextEta[0].slice(5)})` : ''} · ${tr('工厂仓', 'factory')} ${r.factoryStock} · ${tr('日均出库', 'per day')} ${(r.velocity || 0).toFixed(2)}</span></div>
            <p>${s.transferQty ? tr(`先从工厂仓调 <b>${s.transferQty}</b> 件发美国LA仓，约 ${r.shipDays} 天到货，不需要新下单。`, `Transfer <b>${s.transferQty}</b> units from factory stock first (~${r.shipDays} days); no new PO needed.`) : ''}${s.qty ? tr(`再向${esc(r.factory || '工厂')}下单 <b>${s.qty}</b> 件（起订 ${r.moq}），${s.orderIn <= 0 ? '建议今天下单' : `最晚 ${fmtD(addDays(s.orderIn))} 下单`}，约 ${money(s.value)}。`, `Then order <b>${s.qty}</b> from ${esc(r.factory || 'the factory')} (MOQ ${r.moq}) ${s.orderIn <= 0 ? 'today' : `by ${fmtD(addDays(s.orderIn))}`}, about ${money(s.value)}.`) : ''}${!s.transferQty && !s.qty ? tr('在途和工厂仓已足够，盯紧到货时间。', 'Inbound and factory stock are enough — watch the arrival date.') : ''}</p></div>`).join('') || `<div class="pd-empty">${icon('check-circle')} ${tr('目前没有需要补货的 SKU。', 'Nothing needs replenishing right now.')}</div>`}
          ${M.reorders.some(x => x.s.qty) ? `<button class="pd-btn small primary" data-pd="create-po">${icon('file-plus')} ${tr('生成采购单草稿', 'Create draft PO')}</button>` : ''}</section>
        <section class="pd-card"><div class="pd-card-head"><h3>${icon('tag')} ${tr('清库存策略', 'Clearance plan')} <b class="pd-count">${M.clearance.length}</b></h3><span class="pd-hint">${tr('最低价不低于“最低成本 × 1.05”', 'Never below lowest cost × 1.05')}</span></div>
          ${M.clearance.slice(0, 12).map(x => `<div class="pd-tip" style="--c:${STATE[x.s.state][3]}"><div><strong>${esc(x.r.name)}</strong><span>${esc(x.r.sku)} · ${x.r.wh} ${tr('件', 'pcs')} · ${money(x.s.whValue)} · ${tr('最老', 'oldest')} ${x.r.oldestAge} ${tr('天', 'd')} · ${x.months === Infinity ? tr('近 90 天无出库', 'no sales in 90 days') : tr(`按现速度 ${x.months.toFixed(1)} 个月卖完`, `${x.months.toFixed(1)} months to sell through`)}</span></div>
            <p><span class="pd-action ${x.action[0]}">${esc(x.action[1])}</span>${canDetail() && x.maxDiscount !== null ? tr(` 折扣空间最多 <b>${x.maxDiscount}%</b>（零售价 ${usd(x.price)} → 底价 ${usd(x.floor * 1.05)}）。`, ` Up to <b>${x.maxDiscount}%</b> off (MSRP ${usd(x.price)} → floor ${usd(x.floor * 1.05)}).`) : ''}</p></div>`).join('') || `<div class="pd-empty">${icon('check-circle')} ${tr('没有需要清理的库存。', 'No stock needs clearing.')}</div>`}
          ${M.clearance.length > 12 ? `<p class="pd-hint">${tr(`另有 ${M.clearance.length - 12} 个 SKU，见下方明细表（紫色、蓝色、灰色）。`, `${M.clearance.length - 12} more SKUs in the table below (purple, blue, gray).`)}</p>` : ''}</section>
      </div>
      <section class="pd-card"><div class="pd-card-head"><h3>${tr('SKU 库存明细', 'SKU inventory detail')} <b class="pd-count">${filtered.length}</b></h3>${ui.scFilter !== 'all' ? `<button class="pd-link" data-pd="sc-filter" data-v="all">${icon('x')} ${tr('清除筛选', 'Clear filter')}</button>` : ''}</div>
        <table class="pd-table pd-sc-table" data-help-table="pd-supply"><thead><tr><th>SKU</th><th>${tr('工厂', 'Factory')}</th><th class="num">${tr('工厂仓', 'Factory')}</th><th class="num">${tr('在途', 'Transit')}</th><th class="num">${tr('美国LA仓', 'US')}</th><th class="num">${tr('近90天出库', 'Out 90d')}</th><th class="num">${tr('可售天数', 'Cover (d)')}</th><th class="num">${tr('最老库龄', 'Oldest (d)')}</th><th class="num">${tr('美国LA仓货值', 'US value')}</th><th>${tr('状态', 'Status')}</th></tr></thead><tbody>
        ${limit.map(({ r, s }) => `<tr class="pd-row-state" style="--c:${STATE[s.state][3]}"><td><div class="pd-prod small"><span class="pd-thumb">${icon(r.icon)}</span><div><strong>${esc(r.name)}</strong><span>${esc(r.sku)}</span></div></div></td><td>${esc(r.factory || '—')}</td><td class="num">${r.factoryStock || '—'}</td><td class="num">${r.transit || '—'}${s.nextEta ? `<small> ${s.nextEta[0].slice(5)}</small>` : ''}</td><td class="num"><b>${r.wh || 0}</b></td><td class="num">${r.out90 || '—'}</td><td class="num ${s.cover < 14 ? 'pd-bad' : ''}">${s.cover === Infinity ? '—' : Math.round(s.cover)}</td><td class="num ${r.oldestAge > ui.ageLimit ? 'pd-aged' : ''}">${r.wh ? r.oldestAge : '—'}</td><td class="num">${money(s.whValue)}</td><td><span class="pd-state ${STATE[s.state][2]}">${esc(tr(STATE[s.state][0], STATE[s.state][1]))}</span></td></tr>`).join('')}
        </tbody></table>${filtered.length > limit.length ? `<button class="pd-link" data-pd="sc-all">${tr(`显示全部 ${filtered.length} 个 SKU`, `Show all ${filtered.length} SKUs`)}</button>` : ''}
        <p class="pd-hint">${tr('可售天数 = 美国LA仓库存 ÷ 日均出库（取近 90 天和历史平均的较大值）。库龄按美国LA仓入库批次计算。', 'Days of cover = US stock ÷ daily shipments (higher of last-90-day and lifetime rate). Age uses US inbound batches.')}</p></section>
    </div>`;
  }

  /* supply facts for the AI insight card */
  function supplyFacts() {
    const M = supplyModel();
    return { usValue:Math.round(M.whValue), agedOver90Pct:M.whValue ? Math.round(M.agedValue / M.whValue * 100) : 0, factoryValue:Math.round(M.factoryValue), transitValue:Math.round(M.transitValue), shipped90:M.out90, coverDays:M.coverDays === Infinity ? null : Math.round(M.coverDays),
      reorder:M.reorders.slice(0, 4).map(x => tr(`${x.r.name}（美国LA仓 ${x.r.wh} 件，日均出库 ${(x.r.velocity || 0).toFixed(2)}${x.s.transferQty ? `，可从工厂仓调 ${x.s.transferQty} 件` : ''}）`, `${x.r.name} (US ${x.r.wh}, ${(x.r.velocity || 0).toFixed(2)}/day${x.s.transferQty ? `, transfer ${x.s.transferQty} from factory` : ''})`)),
      clearance:M.clearance.slice(0, 4).map(x => tr(`${x.r.name}（${x.r.wh} 件，${money(x.s.whValue)}，最老 ${x.r.oldestAge} 天，${x.months === Infinity ? '近 90 天无出库' : `按现速度 ${x.months.toFixed(1)} 个月卖完`}）`, `${x.r.name}: ${x.r.wh} pcs, ${money(x.s.whValue)}, oldest ${x.r.oldestAge}d, ${x.months === Infinity ? 'no sales in 90d' : x.months.toFixed(1) + ' months to sell'}`)),
      topValueLine:M.types[0] ? `${M.types[0].t} $${Math.round(M.types[0].wh)}` : null };
  }
  function supplyRules(f) {
    const out = [tr(`美国LA仓库存货值 ${money(f.usValue)}，其中 ${f.agedOver90Pct}% 已超过 90 天${f.agedOver90Pct >= 50 ? '，资金占用严重，清库存是当前第一优先级' : ''}。`, `US stock is worth ${money(f.usValue)}; ${f.agedOver90Pct}% is older than 90 days${f.agedOver90Pct >= 50 ? ' — clearing it is the top priority' : ''}.`)];
    if (f.clearance.length) out.push(tr(`货值最大的滞销品：${f.clearance.slice(0, 2).join('；')}，建议限时折扣或打包给经销商。`, `Largest slow movers: ${f.clearance.slice(0, 2).join('; ')} — run a limited-time discount or bundle to dealers.`));
    if (f.reorder.length) out.push(tr(`需要补货：${f.reorder.slice(0, 3).join('；')}，优先用工厂仓现货调拨。`, `Reorder: ${f.reorder.slice(0, 3).join('; ')} — transfer factory stock first.`));
    else out.push(tr('目前没有 SKU 面临缺货。', 'No SKU is at risk of stocking out.'));
    if (f.factoryValue) out.push(tr(`工厂仓还压着 ${money(f.factoryValue)} 的货，${f.coverDays !== null ? `美国LA仓按现速度可卖约 ${f.coverDays} 天，` : ''}新的采购应先消化这部分。`, `Factory warehouses hold ${money(f.factoryValue)}${f.coverDays !== null ? `; US stock covers about ${f.coverDays} days` : ''} — use this before new POs.`));
    return out.slice(0, 4);
  }
  if (window.WorkOSInsights?.register) window.WorkOSInsights.register('supply', () => ctx ? supplyFacts() : {}, supplyRules);
  else window.addEventListener('DOMContentLoaded', () => window.WorkOSInsights?.register?.('supply', () => ctx ? supplyFacts() : {}, supplyRules));


  /* ---------- CSV import (catalog / cost data), same flow as the WMS opening-stock import ---------- */
  const norm = h => String(h || '').toLowerCase().replace(/[\s()（）_\-\/:：]/g, '');
  const IMPORTS = {
    catalog:{ title:['导入产品资料', 'Import catalog'], file:'products-catalog-template.csv', url:'/products/import',
      cols:[['sku', 'SKU', ['sku']], ['nameZh', '中文名称', ['中文名称', '名称', '产品名称', 'namezh', 'chinesename']], ['nameEn', '英文名称', ['英文名称', 'nameen', 'englishname', 'name']], ['type', '产品线', ['产品线', '类型', 'type', 'productline']],
        ['status', '供应链状态', ['供应链状态', '状态', 'status']], ['gross', '毛重(kg)', ['毛重kg', '毛重', 'grosskg', 'gross']], ['l', '长(cm)', ['长cm', '长', 'lengthcm', 'length']], ['w', '宽(cm)', ['宽cm', '宽', 'widthcm', 'width']], ['h', '高(cm)', ['高cm', '高', 'heightcm', 'height']],
        ['lead', '交期', ['交期', 'leadtime', 'lead']], ['msrp', '零售价MSRP', ['零售价msrp', '零售价', 'msrp']], ['low', '最低价LowPrice', ['最低价lowprice', '最低价', 'lowprice', 'low']], ['shipFee', '结账运费', ['结账运费', '运费', 'shippingfee', 'shipfee']],
        ['best', '最优发货方式', ['最优发货方式', 'bestshipping', 'best']], ['note', '备注', ['备注', 'note', 'notes']]],
      example:'EXAMPLE-SKU-01,示例 60W 激光雕刻机,Sample 60W laser,示例整机,在售,120,120,90,70,30天左右,4999,4299,399,海运+尾程,示例备注',
      hint:['把产品总表在 Excel 里“另存为 CSV（UTF-8）”后上传。只有 SKU 必填；空白格表示“不修改”，所以可以只放要更新的几列。供应链状态写：开发中 / 上新中 / 在售 / 清库存 / 计划停售 / 停售。', 'In Excel, save the product sheet as “CSV UTF-8” and upload it. Only SKU is required; blank cells mean “leave unchanged”, so you can include just the columns to update. Status: 开发中 / 上新中 / 在售 / 清库存 / 计划停售 / 停售.'] },
    pricing:{ title:['导入成本数据', 'Import cost data'], file:'products-cost-template.csv', url:'/products/pricing/import',
      cols:[['sku', 'SKU', ['sku']], ['factoryRmb', '工厂价(RMB)', ['工厂价rmb', '工厂价', 'factoryrmb']], ['factoryUsd', '工厂价(USD)', ['工厂价usd', 'factoryusd']], ['extraRmb', '额外成本(RMB)', ['额外成本rmb', '额外成本', 'extrarmb']],
        ['ddpRate', 'DDP单价(RMB/kg)', ['ddp单价rmbkg', 'ddp单价', 'ddprate', 'ddp']], ['lastMileRmb', '尾程(RMB)', ['尾程rmb', '尾程', 'lastmilermb', 'lastmile']]],
      example:'EXAMPLE-SKU-01,12000,,0,12,2800',
      hint:['把成本表在 Excel 里“另存为 CSV（UTF-8）”后上传。SKU 必须已经在“产品管理”里；空白格表示“不修改”。工厂价填人民币或美元其中一个即可（填了美元就按美元算）。这些数据只有“价格组成”权限的人能看到。', 'In Excel, save the cost sheet as “CSV UTF-8” and upload it. Each SKU must already exist in the catalog; blank cells mean “leave unchanged”. Fill factory price in RMB or USD (USD wins if both). Only people with the full price build-up can see this data.'] },
  };
  const NUMERIC = new Set(['gross', 'l', 'w', 'h', 'msrp', 'low', 'shipFee', 'factoryRmb', 'factoryUsd', 'extraRmb', 'ddpRate', 'lastMileRmb']);
  let importState = null;
  function parseCsv(text) {
    const out = []; let row = [], cell = '', q = false;
    text = text.replace(/^﻿/, '');
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
  const STATUS_IN = v => { const t = String(v).trim(); if (!t) return undefined; if (STATUS_FROM_ZH[t]) return STATUS_FROM_ZH[t]; const k = Object.keys(STATUS).find(k => k !== 'none' && (k.toLowerCase() === t.toLowerCase() || STATUS[k][1].toLowerCase() === t.toLowerCase())); return k || null; };
  function readImport(kind, text) {
    const spec = IMPORTS[kind], grid = parseCsv(text);
    if (grid.length < 2) throw new Error(tr('文件里没有数据行。', 'The file has no data rows.'));
    const head = grid[0].map(norm), col = {};
    for (const [k, , names] of spec.cols) { const i = head.findIndex(h => names.includes(h)); if (i >= 0) col[k] = i; }
    if (col.sku === undefined) throw new Error(tr('找不到“SKU”这一列，请用模板的表头。', 'No “SKU” column found; use the template headers.'));
    if (Object.keys(col).length < 2) throw new Error(tr('除了 SKU 之外没有认出任何一列，请用模板的表头。', 'No columns besides SKU were recognised; use the template headers.'));
    const rows = [], problems = [], seen = new Set(), known = new Set(products.map(p => p.sku.toLowerCase()));
    grid.slice(1).forEach((r, n) => {
      const line = n + 2, sku = String(r[col.sku] || '').trim(); if (!sku) return;
      if (seen.has(sku.toLowerCase())) { problems.push(tr(`第 ${line} 行：SKU ${sku} 重复`, `Row ${line}: duplicate SKU ${sku}`)); return; }
      seen.add(sku.toLowerCase());
      if (kind === 'pricing' && srv.data?.items?.length && !known.has(sku.toLowerCase())) { problems.push(tr(`第 ${line} 行：${sku} 还不在产品管理里，请先导入产品资料`, `Row ${line}: ${sku} is not in the catalog yet`)); return; }
      const out = { sku };
      for (const [k] of spec.cols) {
        if (k === 'sku' || col[k] === undefined) continue;
        const raw = String(r[col[k]] ?? '').trim(); if (raw === '') continue;
        if (NUMERIC.has(k)) { const v = Number(raw.replace(/[,$¥\s]/g, '')); if (!Number.isFinite(v) || v < 0) { problems.push(tr(`第 ${line} 行：${sku} 的“${spec.cols.find(c => c[0] === k)[1]}”不是有效数字（${raw}）`, `Row ${line}: ${sku} “${k}” is not a valid number (${raw})`)); continue; } out[k] = v; }
        else if (k === 'status') { const st = STATUS_IN(raw); if (st === null) problems.push(tr(`第 ${line} 行：${sku} 的供应链状态“${raw}”无法识别`, `Row ${line}: ${sku} status “${raw}” not recognised`)); else out.status = st; }
        else out[k] = raw;
      }
      if (kind === 'catalog') {
        const dims = ['l', 'w', 'h'].map(k => out[k]); ['l', 'w', 'h'].forEach(k => delete out[k]);
        if (dims.some(x => x !== undefined)) { if (dims.every(x => x > 0)) out.dims = dims; else problems.push(tr(`第 ${line} 行：${sku} 的长宽高要三项都填`, `Row ${line}: ${sku} needs all of length, width and height`)); }
      }
      rows.push(out);
    });
    return { rows, problems, known };
  }
  function importDialog(kind) {
    const spec = IMPORTS[kind]; importState = { kind, rows:null };
    ctx.modal(tr(...spec.title), `<form id="pd-import" class="pd-import-form" data-kind="${kind}">
      <p class="pd-hint">${tr(...spec.hint)} <button type="button" class="pd-link" data-pd="import-template" data-kind="${kind}">${icon('download-simple')} ${tr('下载模板', 'Download template')}</button></p>
      <label class="pd-field"><span>${tr('文件（CSV）', 'File (CSV)')}</span><input name="file" type="file" accept=".csv,text/csv" required data-pd-import-file></label>
      <div data-pd-import-preview></div>
      <p class="pd-warn">${icon('warning')} ${tr('导入会按 SKU 更新：已有的 SKU 用表里的非空格覆盖，新的 SKU 会新增。表里没有的 SKU 不受影响。每次导入都会记入审计日志。', 'Import updates by SKU: existing SKUs take the non-blank cells, new SKUs are added. SKUs not in the file are unchanged. Every import is written to the audit log.')}</p>
      <p class="pd-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button><button class="btn primary" type="submit" form="pd-import">${tr('确认导入', 'Import')}</button>`);
  }
  function downloadTemplate(kind) {
    const spec = IMPORTS[kind], csv = '﻿' + spec.cols.map(c => c[1]).join(',') + '\n' + spec.example + '\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); a.download = spec.file;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  document.addEventListener('change', async e => {
    const t = e.target; if (!ctx || !t.matches?.('[data-pd-import-file]')) return;
    const f = t.closest('form'), kind = f.dataset.kind, err = f.querySelector('.pd-error'), slot = f.querySelector('[data-pd-import-preview]');
    err.textContent = ''; slot.innerHTML = ''; importState = { kind, rows:null };
    const file = t.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { err.textContent = tr('文件太大（超过 5MB）。', 'File too large (over 5 MB).'); return; }
    try {
      const r = readImport(kind, await file.text());
      if (r.problems.length) { err.innerHTML = r.problems.slice(0, 8).map(esc).join('<br>') + (r.problems.length > 8 ? `<br>${tr(`…另有 ${r.problems.length - 8} 处`, `…and ${r.problems.length - 8} more`)}` : ''); return; }
      if (!r.rows.length) { err.textContent = tr('没有读到任何 SKU。', 'No SKUs found.'); return; }
      if (r.rows.length > 5000) { err.textContent = tr('一次最多导入 5000 个 SKU。', 'At most 5000 SKUs per import.'); return; }
      importState.rows = r.rows;
      const live = srv.data?.items?.length ? new Set(srv.data.items.map(x => x.sku.toLowerCase())) : new Set();
      const fresh = r.rows.filter(x => !live.has(x.sku.toLowerCase())).length;
      const cols = IMPORTS[kind].cols.filter(([k]) => k !== 'sku' && r.rows.some(x => x[k] !== undefined || (['l', 'w', 'h'].includes(k) && x.dims))).map(c => c[1]);
      slot.innerHTML = `<div class="pd-banner info">${icon('check-circle')} ${kind === 'catalog' ? tr(`读取到 ${r.rows.length} 个 SKU（新增 ${fresh} 个，更新 ${r.rows.length - fresh} 个）`, `${r.rows.length} SKUs read (${fresh} new, ${r.rows.length - fresh} updated)`) : tr(`读取到 ${r.rows.length} 个 SKU 的成本数据`, `Cost data for ${r.rows.length} SKUs read`)}<br><small>${tr('会更新的列：', 'Columns to update: ')}${esc(cols.join('、'))}</small></div>`;
    } catch (x) { err.textContent = x.message || tr('读取失败', 'Could not read the file'); }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || f.id !== 'pd-import') return; e.preventDefault();
    const kind = f.dataset.kind, err = f.querySelector('.pd-error');
    if (!importState?.rows) { err.textContent = err.textContent || tr('请先选择一个可以读取的 CSV 文件。', 'Choose a readable CSV file first.'); return; }
    const btn = document.querySelector('button[form="pd-import"]'); if (btn) btn.disabled = true;
    try {
      const r = await ctx.api.post(IMPORTS[kind].url, { rows:importState.rows });
      ctx.closeOverlay?.(); ctx.toast(kind === 'catalog' ? tr(`已导入 ${r.rows} 个 SKU：新增 ${r.created}，更新 ${r.updated}`, `Imported ${r.rows} SKUs: ${r.created} new, ${r.updated} updated`) : tr(`已导入 ${r.rows} 个 SKU 的成本数据`, `Imported cost data for ${r.rows} SKUs`));
      importState = null; srv.data = null; loadServer();
    } catch (x) { err.textContent = x.message || tr('导入失败', 'Import failed'); if (btn) btn.disabled = false; }
  });

  /* ---------- saving products and prices ---------- */
  const refresh = sku => { if (sku) delete hist[sku]; approvals.data = null; srv.data = null; loadServer(); };
  const priceNote = (ch, what) => ch?.status === 'pending' ? tr(`${what}的调整${ch.needs ? `${NEEDS_LABEL[ch.needs][0]}，` : ''}已提交管理员审批，批准后生效`, `${what}: ${ch.needs ? `${NEEDS_LABEL[ch.needs][1].toLowerCase()}; ` : ''}sent to an admin for approval`) : '';
  function saveProduct(btn) {
    const box = document.getElementById('pd-product'); if (!box) return;
    const isNew = box.dataset.new === '1', p = isNew ? null : bySku(box.dataset.sku);
    if (!isNew && !p) return;
    if (!(isNew ? serverOn() : liveData())) { ctx.toast(tr('原型：已模拟保存（示例数据不保存）', 'Prototype: save simulated (sample data is not saved)')); return; }
    const el = k => box.querySelector(`[data-pd-f="${k}"]`), txt = k => el(k) && !el(k).disabled ? el(k).value.trim() : undefined;
    const numOf = k => { const x = txt(k); return x === undefined ? undefined : x === '' ? null : Number(x); };
    const body = {};
    for (const k of ['nameZh', 'nameEn', 'type', 'note', 'best', 'lead']) { const x = txt(k); if (x !== undefined) body[k] = x; }
    for (const k of ['gross', 'moq', 'msrp']) { const x = numOf(k); if (x !== undefined) body[k] = x; }
    if ([body.gross, body.moq, body.msrp].some(x => x != null && !(x >= 0))) return ctx.toast(tr('请输入有效的数字', 'Enter valid numbers'));
    if (body.moq != null && !Number.isInteger(body.moq)) return ctx.toast(tr('MOQ 请填整数', 'MOQ must be a whole number'));
    const d = [0, 1, 2].map(i => numOf(`dims${i}`));
    if (d.every(x => x !== undefined)) { if (d.some(x => x != null && !(x >= 0))) return ctx.toast(tr('请输入有效的包装尺寸', 'Enter a valid package size'));
      if (d.every(x => x == null)) body.dims = null; else if (d.some(x => x == null)) return ctx.toast(tr('包装尺寸请填齐长、宽、高', 'Fill in length, width and height')); else body.dims = d; }
    const fail = x => { ctx.toast(x.message || tr('保存失败', 'Save failed')); btn.disabled = false; };
    btn.disabled = true;
    if (isNew) {
      const sku = txt('sku'); if (!sku) { btn.disabled = false; return ctx.toast(tr('请填写 SKU', 'Enter a SKU')); }
      Object.keys(body).forEach(k => { if (body[k] === '' || body[k] == null) delete body[k]; });
      return ctx.api.post('/products', { sku, ...body }).then(r => { ctx.toast(tr(`已添加 ${r.sku}`, `${r.sku} added`)); ui.product = r.sku; refresh(r.sku); }).catch(fail);
    }
    // Only fields that changed are sent, so the change log and price history stay meaningful.
    const before = { nameZh:p.nameZh ?? '', nameEn:p.nameEn ?? '', type:p.type ?? '', note:p.note ?? '', best:p.best ?? '', lead:p.lead ?? '', gross:p.gross ?? null, moq:p.moqSet ?? null, msrp:p.msrp ?? null, dims:p.dims ?? null };
    Object.keys(body).forEach(k => { if (JSON.stringify(body[k]) === JSON.stringify(before[k])) delete body[k]; });
    if (!Object.keys(body).length) { btn.disabled = false; return ctx.toast(tr('没有需要保存的修改', 'Nothing to save')); }
    const reason = txt('reason'); if (reason) body.reason = reason;
    ctx.api.request(`/products/${encodeURIComponent(p.sku)}`, { method:'PATCH', body }).then(r => { ctx.toast(priceNote(r.msrpChange, 'MSRP') || tr('已保存', 'Saved')); refresh(p.sku); }).catch(fail);
  }

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
    if (a === 'import') return importDialog(t.dataset.kind);
    if (a === 'import-template') return downloadTemplate(t.dataset.kind);
    if (a === 'save-product') return saveProduct(t);
    if (a === 'new-product') { if (!serverOn()) { ctx.toast(tr('原型：接入系统数据后可以添加产品', 'Prototype: adding products needs system data')); return; } ui.product = NEW; return rerender(); }
    if (a === 'status-save') { const box = document.getElementById('pd-product'), sel = document.querySelector('[data-pd-status]'); if (!box || !sel) return;
      const note = document.querySelector('[data-pd-status-note]')?.value.trim() || '';
      t.disabled = true; ctx.api.post(`/products/${encodeURIComponent(box.dataset.sku)}/status`, { status:sel.value, note }).then(() => { ctx.toast(tr(`状态已改为：${STATUS[sel.value][0]}`, `Status changed to ${STATUS[sel.value][1]}`)); refresh(box.dataset.sku); }).catch(x => { ctx.toast(x.message || tr('保存失败', 'Save failed')); t.disabled = false; }); return; }
    if (a === 'channel-save') { const k = t.dataset.ch, p = bySku(ui.costSku); if (!p) return;
      const raw = document.querySelector(`[data-pd-ch-price="${k}"]`)?.value ?? '', price = raw === '' ? null : Number(raw);
      if (price != null && !(price >= 0)) return ctx.toast(tr('请输入有效的金额', 'Enter a valid amount'));
      const reason = document.querySelector('[data-pd-ch-reason]')?.value.trim(), body = { price, listed:!!document.querySelector(`[data-pd-ch-listed="${k}"]`)?.checked, ...(reason ? { reason } : {}) };
      t.disabled = true; ctx.api.request(`/products/${encodeURIComponent(p.sku)}/channel-prices/${k}`, { method:'PUT', body }).then(r => { ctx.toast(priceNote(r.change, tr(TARGET_LABEL[k][0], TARGET_LABEL[k][1])) || tr('渠道价格已保存', 'Channel price saved')); refresh(p.sku); }).catch(x => { ctx.toast(x.message || tr('保存失败', 'Save failed')); t.disabled = false; }); return; }
    if (a === 'pc-approve' || a === 'pc-reject' || a === 'pc-withdraw') { const id = t.dataset.id;
      const go = a === 'pc-withdraw' ? ctx.api.post(`/products/price-changes/${encodeURIComponent(id)}/withdraw`, {}) : ctx.api.post(`/products/price-changes/${encodeURIComponent(id)}/decide`, { approve:a === 'pc-approve' });
      t.disabled = true; go.then(() => { ctx.toast(a === 'pc-approve' ? tr('已批准，新价格已生效', 'Approved; the new price applies') : a === 'pc-reject' ? tr('已驳回', 'Rejected') : tr('已撤回', 'Withdrawn')); refresh(ui.costSku); }).catch(x => { ctx.toast(x.message || tr('操作失败', 'Action failed')); t.disabled = false; }); return; }
    if (a === 'cost-for' || a === 'pick-cost') { ui.tab = 'cost'; ui.costSku = t.dataset.sku; ui.costQuery = ''; ui.product = null; return rerender(); }
    if (a === 'incomplete') { ui.incomplete = !ui.incomplete; return rerender(); }
    if (a === 'scenario') { ui.scenario = t.dataset.v; return rerender(); }
    if (a === 'cost-view') { ui.costView = t.dataset.v; return rerender(); }
    if (a === 'rules-cancel') { rulesDraft = null; return rerender(); }
    if (a === 'rules-save') { const next = rulesDraft; if (!next) return; const body = clone(next); delete body.updatedAt; delete body.updatedBy;
      if (!srv.data?.items?.length || ctx.state().capabilities?.pricingRules !== true) { rules = next; rulesDraft = null; syncOpex(); ctx.toast(tr('已应用（示例数据不保存到服务器）', 'Applied (sample data is not saved to the server)')); return rerender(); }
      t.disabled = true; ctx.api.request('/products/pricing-rules', { method:'PUT', body }).then(r => { rules = { ...clone(DEFAULT_RULES), ...r.rules }; rulesDraft = null; syncOpex(); if (srv.data) srv.data.pricingRules = r.rules; ctx.toast(tr('定价规则已保存', 'Pricing rules saved')); }).catch(x => { ctx.toast(x.message || tr('保存失败', 'Save failed')); }).finally(rerender); return; }
    if (a === 'plan-save') { const f = document.getElementById('pd-plan'), p = bySku(ui.costSku); if (!f || !p) return;
      const val = k => { const v = f.querySelector(`[data-pd-plan="${k}"]`)?.value; return v === '' || v == null ? null : Number(v); };
      const body = { priceClass:f.querySelector('[name="priceClass"]').value, landedUsd:val('landedUsd'), lastMileUsd:val('lastMileUsd'), actualPrice:val('actualPrice') };
      const shipEl = f.querySelector('[data-pd-plan="shipFee"]'), shipFee = shipEl && !shipEl.disabled ? val('shipFee') : undefined, reason = f.querySelector('[name="reason"]')?.value.trim();
      if ([...Object.entries(body), ['shipFee', shipFee]].some(([k, v]) => k !== 'priceClass' && v != null && !(v >= 0))) return ctx.toast(tr('请输入有效的金额', 'Enter valid amounts'));
      if (!srv.data?.items?.length || ctx.state().capabilities?.pricingRules !== true) { Object.assign(p, body); ctx.toast(tr('已应用（示例数据不保存）', 'Applied (sample data is not saved)')); return rerender(); }
      if (reason) body.reason = reason;
      t.disabled = true;
      // Checkout shipping is a catalog field; it is saved first because the margin check of the actual price uses it.
      const ship = shipFee !== undefined && shipFee !== (p.shipFee ?? null) ? ctx.api.request(`/products/${encodeURIComponent(p.sku)}`, { method:'PATCH', body:{ shipFee } }) : Promise.resolve();
      ship.then(() => ctx.api.request(`/products/${encodeURIComponent(p.sku)}/pricing-plan`, { method:'PATCH', body })).then(r => { Object.assign(p, { priceClass:r.priceClass, landedUsd:r.landedUsd, lastMileUsd:r.lastMileUsd, actualPrice:r.actualPrice }); ctx.toast(priceNote(r.actualChange, tr('真实售价', 'Actual price')) || tr('定价输入已保存', 'Pricing inputs saved')); refresh(p.sku); }).catch(x => ctx.toast(x.message || tr('保存失败', 'Save failed'))).finally(rerender); return; }
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
    if (el.matches('input[data-pd-rule]')) {
      const v = Number(el.value); if (el.value === '' || !Number.isFinite(v)) return;
      const d = rulesDraft || (rulesDraft = clone(rules)), path = el.dataset.pdRule.split('.');
      let o = d; for (const k of path.slice(0, -1)) o = o[k]; o[path[path.length - 1]] = v;
      const sel = `[data-pd-rule="${el.dataset.pdRule}"]`; rerender(); requestAnimationFrame(() => { const n = document.querySelector(sel); if (n) n.focus(); }); return;
    }
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

  window.WorkOSProducts = { configure(next) { ctx = next; window.WorkOSProductLibrary?.configure(next); }, render, _data:{ products, assumptions, cost, supply, source, OPEX, ladder, ov, fxState, plan, get rules() { return rules; } }, _ui:ui };
})();
