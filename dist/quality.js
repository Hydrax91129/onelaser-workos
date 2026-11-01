'use strict';
/* Product quality tracking (labs).
 * Every customer-service ticket and forum post is scanned by AI daily, de-duplicated into issues
 * and classified with a strict two-level code (category → defect). Factory staff write the root
 * cause, corrective/preventive action and an execution date; OneLaser approves or sends it back,
 * then verifies the fix before closing. Quality charts show where problems concentrate.
 * Prototype: fictional sample data in memory; the backend will receive AI scan results and store
 * plans, approvals and verification with an audit trail.
 */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let ctx = null;
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const L = o => o && typeof o === 'object' ? (o[lang()] ?? o.zh) : o;
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  const TODAY = new Date('2026-10-31T12:00:00');
  const iso = d => d.toISOString().slice(0, 10);
  const ago = n => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return iso(d); };
  const ahead = n => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return iso(d); };
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const fmt = s => { const [, m, d] = s.split('-').map(Number); return lang() === 'en' ? new Date(s).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : `${m}月${d}日`; };

  /* ---------- strict classification: category → defect code ---------- */
  const CATS = {
    OPT:['光学 / 激光', 'Optics / laser', '#e2445c', { '01':['功率衰减', 'Power drop'], '02':['光斑不均 / 对焦偏', 'Uneven spot / focus'], '03':['激光管 / 光源损坏', 'Laser source failure'], '04':['红光指示偏移', 'Red-dot offset'] }],
    ELE:['电气', 'Electrical', '#fdab3d', { '01':['电源板故障', 'Power board failure'], '02':['主板 / 控制卡', 'Mainboard / controller'], '03':['线束松动', 'Loose wiring'], '04':['冷水机报警', 'Chiller alarm'] }],
    MEC:['机械 / 运动', 'Mechanics / motion', '#579bfc', { '01':['导轨异响', 'Rail noise'], '02':['皮带松 / 失步', 'Belt slip / lost steps'], '03':['升降台卡滞', 'Z-table jam'], '04':['旋转轴精度', 'Rotary accuracy'] }],
    SFW:['软件 / 固件', 'Software / firmware', '#a25ddc', { '01':['LightBurn 连接', 'LightBurn connection'], '02':['固件升级失败', 'Firmware update failure'], '03':['WiFi / 网络', 'WiFi / network'] }],
    STR:['结构 / 外观', 'Structure / finish', '#00a9a5', { '01':['钣金变形', 'Sheet-metal dent'], '02':['门盖 / 铰链', 'Lid / hinge'], '03':['划痕 / 掉漆', 'Scratches / paint'] }],
    PKG:['包装 / 运输', 'Packaging / shipping', '#9d50dd', { '01':['运输破损', 'Transit damage'], '02':['少件 / 错件', 'Missing / wrong parts'] }],
    DOC:['使用 / 文档', 'Usage / documentation', '#9699a6', { '01':['说明书不清楚', 'Unclear manual'], '02':['操作误解', 'User misunderstanding'] }],
  };
  const SOURCES = { ticket:['客服工单', 'Support ticket', 'headset'], forum:['用户论坛', 'User forum', 'chats-circle'], fb:['Facebook 群组', 'Facebook group', 'users-three'], reddit:['Reddit', 'Reddit', 'reddit-logo'], amazon:['Amazon 评论', 'Amazon review', 'star'] };
  const SEV = { S1:['S1 安全 / 停机', 'S1 Safety / down', '#e2445c'], S2:['S2 功能受影响', 'S2 Function impaired', '#fdab3d'], S3:['S3 轻微', 'S3 Minor', '#579bfc'] };
  const FLOW = { new:['新问题', 'New', '#c4c4c4'], plan:['待工厂方案', 'Awaiting factory plan', '#fdab3d'], review:['方案待批准', 'Plan awaiting approval', '#a25ddc'], doing:['执行中', 'In execution', '#579bfc'], verify:['待验证', 'Awaiting verification', '#00a9a5'], closed:['已关闭', 'Closed', '#00c875'] };
  const FACTORIES = { dg:['东莞工厂', 'Dongguan factory'], jn:['济南工厂', 'Jinan factory'] };
  const PRODUCTS = [['Hydra 整机', 'dg'], ['X 整机', 'dg'], ['VertiGo 整机', 'dg'], ['Cobra 整机', 'jn'], ['配件', 'dg']];

  let seq = 100;
  const I = (code, product, sev, status, first, reports, title, quotes, extra = {}) => ({ id:'Q-' + (++seq), code, product, factory:PRODUCTS.find(p => p[0] === product)[1], sev, status, first, last:extra.last || ago(Math.max(0, days(first, iso(TODAY)) - 3)), reports, title, quotes, confidence:extra.confidence ?? 0.92, units:extra.units ?? reports, plan:extra.plan || null, history:extra.history || [], closed:extra.closed || null });
  const issues = [
    I('ELE-01', 'Hydra 整机', 'S1', 'review', ago(18), 9, { zh:'Hydra 13 Pro 开机后电源板过热保护，自动断电', en:'Hydra 13 Pro power board over-heats and shuts down' }, [['ticket', 'Machine shuts off after ~20 min, power board smells hot.'], ['forum', 'Same here on my H13 Pro, second time this month.'], ['fb', '电源板换了一次还是会断电']], { units:7, plan:{ by:'dg', root:{ zh:'第 2026-08 批电源板散热片与外壳间隙不足，导风不畅。', en:'Batch 2026-08 power boards have too little gap between heatsink and housing.' }, fix:{ zh:'更换为加大散热片的 V2 电源板，已出货机器免费寄送替换件。', en:'Switch to V2 board with larger heatsink; ship free replacements to affected units.' }, prevent:{ zh:'来料检验增加 30 分钟满载温升测试。', en:'Add a 30-minute full-load thermal test at incoming inspection.' }, due:ahead(12), owner:{ zh:'雷工（东莞品质部）', en:'Lei (Dongguan QA)' }, at:ago(2) }, history:[[ago(18), 'ai'], [ago(16), 'assign'], [ago(2), 'plan']] }),
    I('OPT-01', 'X 整机', 'S2', 'plan', ago(11), 14, { zh:'XRF 38W 使用 3 个月后切割功率明显下降', en:'XRF 38W cutting power drops after ~3 months' }, [['reddit', 'XRF lost almost 30% power after 90 days, anyone else?'], ['ticket', 'Customer reports needing 3 passes for 3mm plywood now.'], ['amazon', 'Great at first, then power faded.']], { units:12, history:[[ago(11), 'ai'], [ago(10), 'assign']] }),
    I('MEC-02', 'Cobra 整机', 'S2', 'doing', ago(26), 6, { zh:'Cobra 10 长时间雕刻后 Y 轴皮带失步', en:'Cobra 10 Y-axis belt slips on long jobs' }, [['ticket', 'Image shifts by 2mm halfway through a 40-minute job.'], ['forum', 'Tightened belt per manual, still slipping.']], { plan:{ by:'jn', root:{ zh:'皮带张紧器弹簧规格偏软。', en:'Belt tensioner spring is under-spec.' }, fix:{ zh:'更换为 1.2mm 线径弹簧，并寄送张紧器升级包。', en:'Change to 1.2mm spring; ship tensioner upgrade kit.' }, prevent:{ zh:'出厂前增加 60 分钟连续雕刻测试。', en:'Add a 60-minute continuous engraving test before shipping.' }, due:ahead(5), owner:{ zh:'王工（济南）', en:'Wang (Jinan)' }, at:ago(15), approvedBy:'KC', approvedAt:ago(13) }, history:[[ago(26), 'ai'], [ago(24), 'assign'], [ago(15), 'plan'], [ago(13), 'approve']] }),
    I('SFW-01', 'X 整机', 'S3', 'verify', ago(34), 11, { zh:'XRF 在 macOS 上 LightBurn 识别不到设备', en:'LightBurn on macOS cannot find the XRF' }, [['forum', 'Mac Sonoma + LightBurn 1.7: device not detected.'], ['ticket', 'Works on Windows, not on the customer’s MacBook.']], { plan:{ by:'dg', root:{ zh:'USB 驱动芯片 CH340 在新版 macOS 需要签名驱动。', en:'CH340 USB chip needs a signed driver on recent macOS.' }, fix:{ zh:'发布签名驱动并更新官网下载与说明书。', en:'Publish a signed driver and update the download page and manual.' }, prevent:{ zh:'每次 macOS 大版本发布后 2 周内完成兼容性测试。', en:'Test compatibility within 2 weeks of every major macOS release.' }, due:ago(3), owner:{ zh:'软件组', en:'Software team' }, at:ago(28), approvedBy:'李帅', approvedAt:ago(27) }, history:[[ago(34), 'ai'], [ago(28), 'plan'], [ago(27), 'approve'], [ago(3), 'done']] }),
    I('PKG-01', 'Hydra 整机', 'S2', 'closed', ago(52), 5, { zh:'Hydra 16 海运到仓外箱角部破损', en:'Hydra 16 crate corners damaged in ocean freight' }, [['ticket', 'Crate corner crushed, side panel dented.']], { plan:{ by:'dg', root:{ zh:'木箱角部未加护角。', en:'No corner guards on the crate.' }, fix:{ zh:'增加钢护角和防撞泡棉。', en:'Add steel corner guards and impact foam.' }, prevent:{ zh:'包装方案通过跌落测试后才可变更。', en:'Packaging changes require a drop test.' }, due:ago(30), owner:{ zh:'包装组', en:'Packaging team' }, at:ago(48), approvedBy:'KC', approvedAt:ago(47) }, closed:ago(20), history:[[ago(52), 'ai'], [ago(48), 'plan'], [ago(47), 'approve'], [ago(30), 'done'], [ago(20), 'verified']] }),
    I('ELE-04', 'Hydra 整机', 'S2', 'new', ago(1), 3, { zh:'Hydra 9 冷水机 E1 报警频繁', en:'Hydra 9 chiller E1 alarm keeps firing' }, [['fb', 'Chiller shows E1 every morning.'], ['ticket', 'E1 alarm, water level is fine.']], { confidence:0.81, history:[[ago(1), 'ai']] }),
    I('DOC-02', 'VertiGo 整机', 'S3', 'new', ago(0), 4, { zh:'VertiGo 用户不知道如何校准竖直对焦', en:'VertiGo users unsure how to calibrate vertical focus' }, [['forum', 'How do I set focus on the VertiGo? Manual skips it.'], ['reddit', 'VertiGo focus calibration video please']], { confidence:0.77, history:[[ago(0), 'ai']] }),
    I('STR-02', 'Cobra 整机', 'S3', 'plan', ago(7), 2, { zh:'Cobra 8 上盖铰链螺丝松动', en:'Cobra 8 lid hinge screws loosen' }, [['ticket', 'Lid wobbles, screws backing out.']], { history:[[ago(7), 'ai'], [ago(6), 'assign']] }),
    I('MEC-04', '配件', 'S3', 'closed', ago(60), 6, { zh:'旋转轴卡盘夹持不紧导致图案拉伸', en:'Rotary chuck slips and stretches the design' }, [['amazon', 'Tumblers slip in the rotary chuck.']], { plan:{ by:'dg', root:{ zh:'卡爪防滑垫材质偏硬。', en:'Chuck pads too hard.' }, fix:{ zh:'换成硅胶防滑垫。', en:'Switch to silicone pads.' }, prevent:{ zh:'增加不锈钢杯夹持测试。', en:'Add a steel-tumbler grip test.' }, due:ago(40), owner:{ zh:'配件组', en:'Accessories team' }, at:ago(55), approvedBy:'KC', approvedAt:ago(54) }, closed:ago(35), history:[[ago(60), 'ai'], [ago(55), 'plan'], [ago(54), 'approve'], [ago(40), 'done'], [ago(35), 'verified']] }),
    I('OPT-02', 'Hydra 整机', 'S2', 'doing', ago(21), 4, { zh:'Hydra 7 Pro 双光切换后对焦偏移', en:'Hydra 7 Pro focus shifts after switching sources' }, [['forum', 'After switching to RF the focus is off by 1mm.']], { plan:{ by:'dg', root:{ zh:'双光模组出厂同轴度校准标准偏宽。', en:'Dual-source coaxial calibration tolerance too wide.' }, fix:{ zh:'收紧校准公差，并发布用户校准视频。', en:'Tighten tolerance and publish a user calibration video.' }, prevent:{ zh:'每台出厂附校准报告。', en:'Ship a calibration report with each unit.' }, due:ago(2), owner:{ zh:'雷工（东莞品质部）', en:'Lei (Dongguan QA)' }, at:ago(17), approvedBy:'KC', approvedAt:ago(16) }, history:[[ago(21), 'ai'], [ago(17), 'plan'], [ago(16), 'approve']] }),
  ];
  const weekly = [[8, 3], [6, 5], [11, 4], [9, 7], [12, 6], [7, 8]]; // [new, closed] per week, last 6 weeks (sample)

  const ui = { filter:'open', cat:'', product:'', sev:'', q:'', openId:null, asFactory:false, form:null };
  const role = () => ui.asFactory ? 'factory' : 'approver';
  const catOf = code => CATS[code.split('-')[0]];
  const codeLabel = code => { const c = catOf(code); return `${code} · ${tr(c[3][code.split('-')[1]][0], c[3][code.split('-')[1]][1])}`; };
  const pill = (map, k, cls = '') => `<span class="qa-pill ${cls}" style="--c:${map[k][2]}">${esc(tr(map[k][0], map[k][1]))}</span>`;
  const overdueExec = i => i.status === 'doing' && i.plan?.due < iso(TODAY);
  const ageDays = i => days(i.first, i.closed || iso(TODAY));

  /* ---------- page ---------- */
  function render() {
    if (!ctx) return '';
    const open = issues.filter(i => i.status !== 'closed');
    const closed = issues.filter(i => i.closed);
    const mttr = closed.length ? Math.round(closed.reduce((n, i) => n + ageDays(i), 0) / closed.length) : null;
    const kpi = (label, v, note, tone = '') => `<div class="qa-kpi ${tone}"><span>${label}</span><strong>${v}</strong><em>${note}</em></div>`;
    const list = issues.filter(i => (ui.filter === 'all' || (ui.filter === 'open' ? i.status !== 'closed' : i.status === ui.filter)) && (!ui.cat || i.code.startsWith(ui.cat)) && (!ui.product || i.product === ui.product) && (!ui.sev || i.sev === ui.sev) && (!ui.q || `${i.id} ${L(i.title)} ${i.code}`.toLowerCase().includes(ui.q.toLowerCase())))
      .sort((a, b) => a.sev.localeCompare(b.sev) || b.reports - a.reports);
    return `<div class="qa">
      <div class="page-heading"><div><div class="eyebrow">LABS · QUALITY</div><h1>${tr('产品质量追踪', 'Product quality tracking')}</h1><p>${tr('AI 每天扫描客服工单和论坛，把同一个问题合并、严格分类；工厂填写原因、方案和执行时间，我们批准并验证后关闭。', 'AI scans support tickets and forums daily, merges duplicates and classifies them strictly; the factory writes cause, fix and date; we approve and verify before closing.')}</p></div>
        <div class="heading-actions">${window.WORKOS_PREVIEW ? `<label class="qa-switch"><input type="checkbox" data-qa-role ${ui.asFactory ? 'checked' : ''}> ${tr('预览：以工厂人员身份查看', 'Preview: view as factory staff')}</label>` : ''}</div></div>
      <div class="qa-banner">${icon('robot')} ${tr(`AI 今日 07:00 已扫描：客服工单 46 条、论坛与社群 128 条 → 新增 2 个问题，合并重复反馈 9 条。下次扫描：明天 07:00。`, `AI scan today 07:00: 46 support tickets, 128 forum/community posts → 2 new issues, 9 duplicate reports merged. Next scan: tomorrow 07:00.`)} <span class="qa-tag">${tr('测试 · 示例数据', 'Test · sample data')}</span></div>
      <div class="qa-kpis">
        ${kpi(tr('未关闭问题', 'Open issues'), open.length, `${open.filter(i => i.sev === 'S1').length} ${tr('个 S1 严重', 'S1 critical')}`, open.some(i => i.sev === 'S1') ? 'bad' : '')}
        ${kpi(tr('影响设备', 'Affected units'), open.reduce((n, i) => n + i.units, 0), tr('去重后的反馈台数', 'De-duplicated units'))}
        ${kpi(tr('待工厂方案', 'Awaiting factory plan'), issues.filter(i => ['new', 'plan'].includes(i.status)).length, tr('需要工厂回复', 'Factory to respond'), 'warn')}
        ${kpi(tr('方案待批准', 'Awaiting approval'), issues.filter(i => i.status === 'review').length, tr('等你审批', 'Needs your decision'), issues.some(i => i.status === 'review') ? 'violet' : '')}
        ${kpi(tr('执行逾期', 'Execution overdue'), issues.filter(overdueExec).length, tr('超过承诺日期', 'Past committed date'), issues.some(overdueExec) ? 'bad' : '')}
        ${kpi(tr('平均关闭天数', 'Avg days to close'), mttr ?? '—', tr('从首次反馈到验证关闭', 'First report → verified'))}
      </div>
      ${window.WorkOSInsights?.slot('quality') || ''}
      <div class="qa-charts">
        <section class="qa-card"><h3>${icon('chart-bar-horizontal')} ${tr('按问题分类（反馈次数）', 'By category (reports)')}</h3>${hbars(Object.keys(CATS).map(k => [tr(CATS[k][0], CATS[k][1]), issues.filter(i => i.code.startsWith(k)).reduce((n, i) => n + i.reports, 0), CATS[k][2], k]), 'cat')}</section>
        <section class="qa-card"><h3>${icon('cube')} ${tr('按产品线（未关闭）', 'By product line (open)')}</h3>${hbars(PRODUCTS.map(([p]) => [p, open.filter(i => i.product === p).reduce((n, i) => n + i.reports, 0), '#579bfc', p]), 'product')}</section>
        <section class="qa-card"><h3>${icon('trend-up')} ${tr('近 6 周新增 vs 关闭', 'New vs closed, last 6 weeks')}</h3>${trend()}</section>
        <section class="qa-card"><h3>${icon('list-numbers')} ${tr('缺陷排行（帕累托）', 'Top defects (Pareto)')}</h3>${pareto()}</section>
      </div>
      <div class="qa-two">
        <section class="qa-card"><h3>${icon('tree-structure')} ${tr('问题分类树（一级分类 → 二级缺陷）', 'Issue tree (category → defect)')}</h3>${tree()}</section>
        <section class="qa-card"><h3>${icon('flow-arrow')} ${tr('解决进度分析', 'Resolution progress')}</h3>${progress()}</section>
      </div>
      <section class="qa-card">
        <div class="qa-toolbar"><div class="qa-seg">${[['open', tr('未关闭', 'Open')], ['plan', tr('待工厂方案', 'Awaiting plan')], ['review', tr('待批准', 'Awaiting approval')], ['doing', tr('执行中', 'In execution')], ['verify', tr('待验证', 'To verify')], ['closed', tr('已关闭', 'Closed')], ['all', tr('全部', 'All')]].map(([k, l]) => `<button class="${ui.filter === k ? 'active' : ''}" data-qa="filter" data-v="${k}">${l} <b>${k === 'open' ? open.length : k === 'all' ? issues.length : issues.filter(i => i.status === k || (k === 'plan' && i.status === 'new')).length}</b></button>`).join('')}</div>
          <label class="qa-search">${icon('magnifying-glass')}<input data-qa-q placeholder="${tr('搜索编号、问题或分类码', 'Search ID, issue or code')}" value="${esc(ui.q)}"></label>
          <select data-qa-sel="sev"><option value="">${tr('全部严重度', 'All severities')}</option>${Object.keys(SEV).map(k => `<option value="${k}" ${ui.sev === k ? 'selected' : ''}>${esc(tr(SEV[k][0], SEV[k][1]))}</option>`).join('')}</select>
          ${ui.cat || ui.product ? `<button class="qa-link" data-qa="clear">${icon('x')} ${tr('清除图表筛选', 'Clear chart filter')}: ${esc(ui.cat ? tr(CATS[ui.cat][0], CATS[ui.cat][1]) : ui.product)}</button>` : ''}</div>
        <table class="qa-table" data-help-table="qa-issues"><thead><tr><th>${tr('编号', 'ID')}</th><th>${tr('问题', 'Issue')}</th><th>${tr('分类码', 'Code')}</th><th>${tr('严重度', 'Severity')}</th><th class="num">${tr('反馈', 'Reports')}</th><th>${tr('来源', 'Sources')}</th><th>${tr('责任工厂', 'Factory')}</th><th>${tr('状态', 'Status')}</th><th>${tr('执行时间', 'Due')}</th><th class="num">${tr('已持续', 'Age')}</th></tr></thead><tbody>
        ${list.map(i => `<tr data-qa="open" data-id="${i.id}" tabindex="0" class="${i.sev === 'S1' && i.status !== 'closed' ? 'qa-s1' : ''}"><td class="qa-id">${i.id}</td><td><strong>${esc(L(i.title))}</strong><span>${esc(i.product)}</span></td><td><span class="qa-code" style="--c:${catOf(i.code)[2]}">${esc(codeLabel(i.code))}</span></td><td>${pill(SEV, i.sev)}</td><td class="num"><b>${i.reports}</b></td><td>${[...new Set(i.quotes.map(q => q[0]))].map(s => `<span class="qa-src" title="${esc(tr(SOURCES[s][0], SOURCES[s][1]))}">${icon(SOURCES[s][2])}</span>`).join('')}</td><td>${esc(tr(...FACTORIES[i.factory]))}</td><td>${pill(FLOW, i.status === 'new' ? 'plan' : i.status)}${i.status === 'new' ? `<small class="qa-new">${tr('新', 'New')}</small>` : ''}</td><td class="${overdueExec(i) ? 'qa-bad' : ''}">${i.plan?.due ? fmt(i.plan.due) : '—'}</td><td class="num">${ageDays(i)}${tr('天', 'd')}</td></tr>`).join('') || `<tr><td colspan="10" class="qa-empty">${tr('没有符合条件的问题', 'No matching issues')}</td></tr>`}
        </tbody></table></section>
    </div>`;
  }
  function hbars(rows, kind) {
    const max = Math.max(1, ...rows.map(r => r[1]));
    return `<div class="qa-hbars">${rows.sort((a, b) => b[1] - a[1]).map(([label, n, color, key]) => `<button class="qa-hbar ${(kind === 'cat' ? ui.cat : ui.product) === key ? 'on' : ''}" data-qa="chart-${kind}" data-v="${esc(key)}"><span>${esc(label)}</span><i style="width:${n / max * 100}%;background:${color}"></i><b>${n}</b></button>`).join('')}</div>`;
  }
  function trend() {
    const w = 360, h = 150, base = 124, max = Math.max(...weekly.flat()), bw = 18;
    return `<svg class="qa-svg" viewBox="0 0 ${w} ${h}" role="img"><line x1="10" x2="${w}" y1="${base}" y2="${base}" class="qa-axis"/>${weekly.map(([n, c], i) => { const x = 22 + i * 56; const hn = n / max * 100, hc = c / max * 100; return `<rect x="${x}" y="${base - hn}" width="${bw}" height="${hn}" rx="2" fill="#e2445c"><title>${tr('新增', 'New')} ${n}</title></rect><rect x="${x + bw + 3}" y="${base - hc}" width="${bw}" height="${hc}" rx="2" fill="#00c875"><title>${tr('关闭', 'Closed')} ${c}</title></rect><text x="${x + bw}" y="${base + 16}" text-anchor="middle" class="qa-ax">${i === 5 ? tr('本周', 'This wk') : tr(`${5 - i}周前`, `${5 - i}w ago`)}</text>`; }).join('')}</svg><ul class="qa-legend"><li><i style="background:#e2445c"></i>${tr('新增问题', 'New issues')}</li><li><i style="background:#00c875"></i>${tr('关闭问题', 'Closed issues')}</li></ul>`;
  }
  function tree() {
    const total = issues.reduce((n, i) => n + i.reports, 0) || 1;
    return `<div class="qa-tree">${Object.entries(CATS).map(([k, c]) => { const xs = issues.filter(i => i.code.startsWith(k)); if (!xs.length) return ''; const reps = xs.reduce((n, i) => n + i.reports, 0), open = xs.filter(i => i.status !== 'closed').length;
      return `<details ${ui.cat === k || reps / total > .15 ? 'open' : ''}><summary style="--c:${c[2]}"><b class="qa-code" style="--c:${c[2]}">${k}</b><span>${esc(tr(c[0], c[1]))}</span><i style="width:${reps / total * 100}%;background:${c[2]}"></i><em>${reps} ${tr('次', 'reports')} · ${open} ${tr('未关闭', 'open')}</em></summary>
        <ul>${Object.entries(c[3]).map(([n, d]) => { const ys = xs.filter(i => i.code === `${k}-${n}`); if (!ys.length) return ''; const r2 = ys.reduce((m, i) => m + i.reports, 0), worst = ys.reduce((a, i) => a.status === 'closed' ? i : a, ys[0]);
          return `<li><span class="qa-code light" style="--c:${c[2]}">${k}-${n}</span><span class="qa-tn">${esc(tr(d[0], d[1]))}</span><span class="qa-tbar"><i style="width:${r2 / reps * 100}%;background:${c[2]}"></i></span><b>${r2}</b>${ys.map(i => `<button class="qa-mini" data-qa="open" data-id="${i.id}" style="--c:${FLOW[i.status === 'new' ? 'plan' : i.status][2]}" title="${esc(L(i.title))}">${i.id}</button>`).join('')}</li>`; }).join('')}</ul></details>`; }).join('')}</div>`;
  }
  function progress() {
    const stages = ['plan', 'review', 'doing', 'verify', 'closed'], count = k => issues.filter(i => (i.status === 'new' ? 'plan' : i.status) === k).length, max = Math.max(1, ...stages.map(count));
    const planned = issues.filter(i => i.plan), onTime = issues.filter(i => i.plan && ['verify', 'closed'].includes(i.status) && (i.history.find(h => h[1] === 'done')?.[0] || i.closed) <= i.plan.due);
    const finished = issues.filter(i => i.plan && ['verify', 'closed'].includes(i.status));
    const avg = (fn, xs) => xs.length ? Math.round(xs.reduce((n, i) => n + fn(i), 0) / xs.length) : null;
    const tPlan = avg(i => days(i.first, i.plan.at), planned), tApprove = avg(i => days(i.plan.at, i.plan.approvedAt), planned.filter(i => i.plan.approvedAt)), tExec = avg(i => days(i.plan.approvedAt, i.history.find(h => h[1] === 'done')?.[0] || iso(TODAY)), planned.filter(i => i.plan.approvedAt));
    const byFactory = Object.keys(FACTORIES).map(f => { const xs = issues.filter(i => i.factory === f); return [tr(...FACTORIES[f]), xs.filter(i => i.status !== 'closed').length, xs.filter(overdueExec).length, avg(i => days(i.first, i.plan?.at || iso(TODAY)), xs)]; });
    return `<div class="qa-funnel">${stages.map(k => `<div><span>${esc(tr(FLOW[k][0], FLOW[k][1]))}</span><i style="width:${count(k) / max * 100}%;background:${FLOW[k][2]}"></i><b>${count(k)}</b></div>`).join('')}</div>
      <div class="qa-times"><div><strong>${tPlan ?? '—'}</strong><span>${tr('天：反馈 → 工厂出方案', 'days: report → factory plan')}</span></div><div><strong>${tApprove ?? '—'}</strong><span>${tr('天：方案 → 我们批准', 'days: plan → approval')}</span></div><div><strong>${tExec ?? '—'}</strong><span>${tr('天：批准 → 执行完成', 'days: approval → executed')}</span></div><div><strong>${finished.length ? Math.round(onTime.length / finished.length * 100) + '%' : '—'}</strong><span>${tr('按承诺日期完成的比例', 'executed by committed date')}</span></div></div>
      <table class="qa-table small" data-help-table="qa-factory"><thead><tr><th>${tr('工厂', 'Factory')}</th><th class="num">${tr('未关闭', 'Open')}</th><th class="num">${tr('执行逾期', 'Overdue')}</th><th class="num">${tr('平均出方案天数', 'Avg days to plan')}</th></tr></thead><tbody>${byFactory.map(r => `<tr><td>${esc(r[0])}</td><td class="num">${r[1]}</td><td class="num ${r[2] ? 'qa-bad' : ''}">${r[2]}</td><td class="num">${r[3] ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  }
  function pareto() {
    const rows = [...issues].sort((a, b) => b.reports - a.reports).slice(0, 6), total = issues.reduce((n, i) => n + i.reports, 0);
    let cum = 0;
    return `<ol class="qa-pareto">${rows.map(i => { cum += i.reports; return `<li data-qa="open" data-id="${i.id}"><span class="qa-code" style="--c:${catOf(i.code)[2]}">${i.code}</span><span class="qa-pt">${esc(L(i.title))}</span><b>${i.reports}</b><em>${Math.round(cum / total * 100)}%</em></li>`; }).join('')}</ol><p class="qa-hint">${tr('右侧百分比是累计占比：前几个问题通常占了大部分反馈，优先解决它们。', 'The right column is cumulative share: the top few issues usually account for most reports.')}</p>`;
  }

  /* ---------- issue detail ---------- */
  function detail(i) {
    const p = i.plan, f = role() === 'factory', canPlan = f && ['new', 'plan'].includes(i.status), canApprove = !f && i.status === 'review', canVerify = !f && i.status === 'verify', canDone = f && i.status === 'doing';
    const step = Object.keys(FLOW).indexOf(i.status === 'new' ? 'plan' : i.status);
    const steps = Object.keys(FLOW).filter(k => k !== 'new');
    return `<div class="qa-detail">
      <div class="qa-d-head"><span class="qa-id">${i.id}</span>${pill(SEV, i.sev)}<span class="qa-code" style="--c:${catOf(i.code)[2]}">${esc(codeLabel(i.code))}</span><button class="qa-x" data-live-action="close" aria-label="${tr('关闭', 'Close')}">${icon('x')}</button></div>
      <h2>${esc(L(i.title))}</h2>
      <p class="qa-sub">${esc(i.product)} · ${esc(tr(...FACTORIES[i.factory]))} · ${tr(`首次反馈 ${fmt(i.first)}，共 ${i.reports} 次反馈、影响 ${i.units} 台`, `First reported ${fmt(i.first)} · ${i.reports} reports · ${i.units} units`)}</p>
      <ol class="qa-steps">${steps.map((k, n) => `<li class="${n + 1 < step ? 'done' : n + 1 === step ? 'on' : ''}"><i></i>${esc(tr(FLOW[k][0], FLOW[k][1]))}</li>`).join('')}</ol>
      <section><h3>${icon('robot')} ${tr('AI 归类依据', 'AI classification')}</h3><p class="qa-hint">${tr(`置信度 ${Math.round(i.confidence * 100)}%。`, `Confidence ${Math.round(i.confidence * 100)}%.`)}${i.confidence < 0.85 ? tr(' 置信度较低，请确认分类是否正确。', ' Low confidence — please confirm the classification.') : ''}</p>
        <ul class="qa-quotes">${i.quotes.map(([s, q]) => `<li>${icon(SOURCES[s][2])}<span><b>${esc(tr(SOURCES[s][0], SOURCES[s][1]))}</b>${esc(q)}</span></li>`).join('')}</ul>
        ${!f ? `<label class="qa-field inline"><span>${tr('修正分类码', 'Correct the code')}</span><select data-qa-code data-id="${i.id}">${Object.entries(CATS).flatMap(([k, c]) => Object.entries(c[3]).map(([n, d]) => `<option value="${k}-${n}" ${i.code === `${k}-${n}` ? 'selected' : ''}>${k}-${n} · ${esc(tr(c[0], c[1]))} / ${esc(tr(d[0], d[1]))}</option>`)).join('')}</select></label>` : ''}</section>
      <section><h3>${icon('factory')} ${tr('工厂方案', 'Factory plan')}</h3>
        ${p ? `<dl class="qa-plan"><dt>${tr('根本原因', 'Root cause')}</dt><dd>${esc(L(p.root))}</dd><dt>${tr('纠正措施', 'Corrective action')}</dt><dd>${esc(L(p.fix))}</dd><dt>${tr('预防措施', 'Preventive action')}</dt><dd>${esc(L(p.prevent))}</dd><dt>${tr('负责人', 'Owner')}</dt><dd>${esc(L(p.owner))}</dd><dt>${tr('承诺完成', 'Committed date')}</dt><dd class="${overdueExec(i) ? 'qa-bad' : ''}">${fmt(p.due)}${overdueExec(i) ? ` · ${tr('已逾期', 'overdue')} ${days(p.due, iso(TODAY))} ${tr('天', 'd')}` : ''}</dd>${p.approvedBy ? `<dt>${tr('批准', 'Approved')}</dt><dd>${esc(p.approvedBy)} · ${fmt(p.approvedAt)}</dd>` : ''}${p.rejected ? `<dt>${tr('退回意见', 'Sent back')}</dt><dd class="qa-bad">${esc(p.rejected)}</dd>` : ''}</dl>` : `<p class="qa-hint">${tr('等待工厂填写。工厂人员登录后会在这里看到填写表单。', 'Waiting for the factory. Factory staff see a form here when they sign in.')}</p>`}
        ${canPlan ? `<form class="qa-form" id="qa-plan" data-id="${i.id}">${[['root', tr('根本原因', 'Root cause')], ['fix', tr('纠正措施（已出货的怎么处理）', 'Corrective action (units already shipped)')], ['prevent', tr('预防措施（以后怎么避免）', 'Preventive action (stop it recurring)')]].map(([k, l]) => `<label class="qa-field"><span>${l}</span><textarea name="${k}" rows="2" required>${p ? esc(L(p[k])) : ''}</textarea></label>`).join('')}<div class="qa-row"><label class="qa-field"><span>${tr('负责人', 'Owner')}</span><input name="owner" required value="${p ? esc(L(p.owner)) : ''}"></label><label class="qa-field"><span>${tr('承诺完成日期', 'Committed date')}</span><input type="date" name="due" required value="${p?.due || ahead(14)}"></label></div><button class="btn primary">${icon('paper-plane-tilt')} ${tr('提交方案等待批准', 'Submit plan for approval')}</button></form>` : ''}
        ${canApprove ? `<div class="qa-actions"><button class="btn primary" data-qa="approve" data-id="${i.id}">${icon('check')} ${tr('批准方案', 'Approve plan')}</button><input class="qa-reason" data-qa-reason placeholder="${tr('退回原因（必填）', 'Reason for sending back (required)')}"><button class="btn" data-qa="reject" data-id="${i.id}">${icon('arrow-u-up-left')} ${tr('退回修改', 'Send back')}</button></div>` : ''}
        ${canDone ? `<div class="qa-actions"><button class="btn primary" data-qa="done" data-id="${i.id}">${icon('flag-checkered')} ${tr('已执行完成，申请验证', 'Executed — request verification')}</button></div>` : ''}
        ${canVerify ? `<div class="qa-actions"><button class="btn primary" data-qa="verify" data-id="${i.id}">${icon('seal-check')} ${tr('验证有效，关闭问题', 'Verified — close issue')}</button><button class="btn" data-qa="reopen" data-id="${i.id}">${icon('arrow-counter-clockwise')} ${tr('仍有反馈，重新打开', 'Still reported — reopen')}</button></div><p class="qa-hint">${tr('建议执行完成后观察 2 周，确认 AI 扫描没有再出现同类反馈再关闭。', 'Watch for 2 weeks after execution and close only if the AI scan finds no new reports of the same defect.')}</p>` : ''}</section>
      <section><h3>${icon('clock-counter-clockwise')} ${tr('处理记录', 'History')}</h3><ul class="qa-hist">${i.history.map(([d, k]) => `<li><b>${fmt(d)}</b>${esc({ ai:tr('AI 扫描发现并归类', 'Found and classified by AI'), assign:tr('分派给责任工厂', 'Assigned to factory'), plan:tr('工厂提交方案', 'Factory submitted plan'), approve:tr('方案已批准', 'Plan approved'), reject:tr('方案被退回', 'Plan sent back'), done:tr('工厂执行完成', 'Factory executed'), verified:tr('验证有效，已关闭', 'Verified and closed'), reopen:tr('重新打开', 'Reopened'), recode:tr('人工修正分类', 'Classification corrected') }[k] || k)}</li>`).join('')}</ul></section>
    </div>`;
  }
  const find = id => issues.find(i => i.id === id);
  const reopenDetail = id => { ctx.closeOverlay?.(); ctx.overlay(detail(find(id)), true); };
  const log = (i, k) => i.history.push([iso(TODAY), k]);

  document.addEventListener('click', e => {
    if (!ctx) return;
    const t = e.target.closest('[data-qa]'); if (!t) return;
    const a = t.dataset.qa, i = t.dataset.id && find(t.dataset.id);
    if (a === 'filter') { ui.filter = t.dataset.v; return ctx.rerender(); }
    if (a === 'chart-cat') { ui.cat = ui.cat === t.dataset.v ? '' : t.dataset.v; ui.product = ''; ui.filter = 'all'; return ctx.rerender(); }
    if (a === 'chart-product') { ui.product = ui.product === t.dataset.v ? '' : t.dataset.v; ui.cat = ''; ui.filter = 'open'; return ctx.rerender(); }
    if (a === 'clear') { ui.cat = ''; ui.product = ''; return ctx.rerender(); }
    if (a === 'open' && i) { ui.openId = i.id; return ctx.overlay(detail(i), true); }
    if (a === 'approve' && i) { i.plan.approvedBy = ctx.state().actor?.display_name || 'KC'; i.plan.approvedAt = iso(TODAY); i.plan.rejected = null; i.status = 'doing'; log(i, 'approve'); ctx.toast(tr('已批准，工厂开始执行', 'Approved — factory starts execution')); ctx.rerender(); return reopenDetail(i.id); }
    if (a === 'reject' && i) { const r = document.querySelector('[data-qa-reason]')?.value.trim(); if (!r) { ctx.toast(tr('请写明退回原因', 'Please give a reason')); return; } i.plan.rejected = r; i.status = 'plan'; log(i, 'reject'); ctx.toast(tr('已退回工厂', 'Sent back to the factory')); ctx.rerender(); return reopenDetail(i.id); }
    if (a === 'done' && i) { i.status = 'verify'; log(i, 'done'); ctx.toast(tr('已提交验证', 'Verification requested')); ctx.rerender(); return reopenDetail(i.id); }
    if (a === 'verify' && i) { i.status = 'closed'; i.closed = iso(TODAY); log(i, 'verified'); ctx.toast(tr('问题已关闭', 'Issue closed')); ctx.rerender(); return reopenDetail(i.id); }
    if (a === 'reopen' && i) { i.status = 'doing'; log(i, 'reopen'); ctx.rerender(); return reopenDetail(i.id); }
  });
  document.addEventListener('submit', e => {
    if (!ctx || e.target.id !== 'qa-plan') return;
    e.preventDefault();
    const i = find(e.target.dataset.id), fd = new FormData(e.target), v = k => String(fd.get(k) || '').trim();
    i.plan = { by:i.factory, root:v('root'), fix:v('fix'), prevent:v('prevent'), owner:v('owner'), due:v('due'), at:iso(TODAY) };
    i.status = 'review'; log(i, 'plan'); ctx.toast(tr('方案已提交，等待批准', 'Plan submitted for approval')); ctx.rerender(); reopenDetail(i.id);
  });
  document.addEventListener('change', e => {
    if (!ctx) return;
    if (e.target.matches('[data-qa-role]')) { ui.asFactory = e.target.checked; return ctx.rerender(); }
    if (e.target.matches('[data-qa-sel]')) { ui[e.target.dataset.qaSel] = e.target.value; return ctx.rerender(); }
    if (e.target.matches('[data-qa-code]')) { const i = find(e.target.dataset.id); i.code = e.target.value; i.confidence = 1; log(i, 'recode'); ctx.toast(tr('分类已修正，AI 会学习这次修正', 'Classification corrected')); ctx.rerender(); reopenDetail(i.id); }
  });
  document.addEventListener('input', e => {
    if (!ctx || !e.target.matches('[data-qa-q]')) return;
    ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender();
    requestAnimationFrame(() => { const n = document.querySelector('[data-qa-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
  });

  /* ---------- AI insight facts ---------- */
  function facts() {
    const open = issues.filter(i => i.status !== 'closed'), byCat = Object.keys(CATS).map(k => [tr(CATS[k][0], CATS[k][1]), open.filter(i => i.code.startsWith(k)).reduce((n, i) => n + i.reports, 0)]).sort((a, b) => b[1] - a[1]);
    return { open:open.length, s1:open.filter(i => i.sev === 'S1').map(i => L(i.title)), topCategory:byCat[0], topIssues:[...open].sort((a, b) => b.reports - a.reports).slice(0, 2).map(i => `${L(i.title)} (${i.reports})`),
      awaitingPlan:issues.filter(i => ['new', 'plan'].includes(i.status)).length, awaitingApproval:issues.filter(i => i.status === 'review').map(i => i.id), overdue:issues.filter(overdueExec).map(i => `${i.id} ${L(i.title)}`), newLast2Weeks:weekly.slice(-2).reduce((n, w) => n + w[0], 0), closedLast2Weeks:weekly.slice(-2).reduce((n, w) => n + w[1], 0) };
  }
  function rules(f) {
    const out = [];
    if (f.s1.length) out.push(tr(`有 ${f.s1.length} 个 S1 严重问题未关闭（${f.s1.join('；')}），涉及安全或停机，应优先处理并主动联系受影响客户。`, `${f.s1.length} S1 issue(s) open (${f.s1.join('; ')}) — safety or downtime; prioritize and contact affected customers.`));
    if (f.topCategory?.[1]) out.push(tr(`反馈最多的分类是“${f.topCategory[0]}”（${f.topCategory[1]} 次），最集中的问题：${f.topIssues.join('；')}。`, `Most reports fall under “${f.topCategory[0]}” (${f.topCategory[1]}); top issues: ${f.topIssues.join('; ')}.`));
    if (f.awaitingApproval.length || f.overdue.length) out.push(tr(`${f.awaitingApproval.length ? `${f.awaitingApproval.length} 个方案等你批准` : ''}${f.awaitingApproval.length && f.overdue.length ? '，' : ''}${f.overdue.length ? `${f.overdue.length} 个执行已超过承诺日期（${f.overdue.join('；')}）` : ''}。`, `${f.awaitingApproval.length ? `${f.awaitingApproval.length} plan(s) await your approval` : ''}${f.awaitingApproval.length && f.overdue.length ? '; ' : ''}${f.overdue.length ? `${f.overdue.length} execution(s) past due (${f.overdue.join('; ')})` : ''}.`));
    out.push(f.newLast2Weeks > f.closedLast2Weeks ? tr(`近两周新增 ${f.newLast2Weeks} 个、关闭 ${f.closedLast2Weeks} 个，问题在累积，建议每周和工厂开一次质量会。`, `Last two weeks: ${f.newLast2Weeks} new vs ${f.closedLast2Weeks} closed — issues are piling up; hold a weekly quality review with the factories.`) : tr(`近两周关闭 ${f.closedLast2Weeks} 个、新增 ${f.newLast2Weeks} 个，整体在改善。`, `Last two weeks: ${f.closedLast2Weeks} closed vs ${f.newLast2Weeks} new — improving.`));
    return out.slice(0, 4);
  }
  const reg = () => window.WorkOSInsights?.register?.('quality', facts, rules);
  if (window.WorkOSInsights) reg(); else window.addEventListener('DOMContentLoaded', reg);

  window.WorkOSQuality = { configure(next) { ctx = next; }, render, _data:{ issues, CATS }, _ui:ui };
})();
