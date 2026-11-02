'use strict';
/* Hover help for new users.
 * Every button that matches a rule below shows a bilingual tooltip with its
 * purpose ("用途") and how to use it ("怎么用"). Each page title also gets a
 * small (?) icon that explains the whole page.
 *
 * Design rules:
 * - Read-only layer: never changes app state, never sends requests, never
 *   touches business data. It only reads the DOM and positions a tooltip.
 * - The tooltip lives outside #app so app re-renders and i18n never touch it.
 * - Users can switch hints off with the (?) toggle in the top bar; the choice
 *   is stored locally like language and theme.
 * - To add or edit a hint, edit RULES or PAGES below. Keep selectors on
 *   data-* attributes, never on visible text, so translations do not break them.
 */
(() => {
  const STORE_KEY = 'onelaser-workos-help';
  const SHOW_DELAY = 350;
  const lang = () => (window.WorkI18n && window.WorkI18n.lang === 'en') ? 'en' : 'zh';
  const enabled = () => { try { return localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; } };
  const setEnabled = on => { try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch {} };

  // h(title, purpose, how) for zh and en. "how" may be omitted when obvious.
  const h = (zt, zp, zh, et, ep, eh) => ({ zh:{ t:zt, p:zp, h:zh }, en:{ t:et, p:ep, h:eh } });

  /* Page guides: shown from the (?) icon next to each page title. */
  const PAGES = {
    executive: h('老板看板',
      '给公司负责人看的全公司只读总览：OKR 进度、任务交付和需要协调的事项。',
      '先看顶部四个数字，再看“部门全景”找压力大的部门，最后处理“需要协调与跟进”里最早截止的事项。这里只能查看，不能修改。',
      'Executive overview',
      'A company-wide, read-only view for leadership: OKR progress, delivery and items that need coordination.',
      'Scan the four headline numbers, use Department overview to spot pressure, then work through Needs coordination, earliest deadline first. Nothing here can be edited.'),
    overview: h('个人工作台',
      '你的首页：一眼看到今天还有哪些事没做、哪些地方没做好，以及任务完成度、OKR 进度和准时率。',
      '先看“还没做完的事”的彩色卡片（逾期、即将到期、被退回、等我验收、有阻塞），再处理“需要你处理”列表；“自动分析 / AI 分析”用几句话总结你现在最该关注什么。',
      'Work Center',
      'Your home page: what is still undone or not going well today, plus task completion, OKR progress and on-time rate.',
      'Check the colored “Still to do” cards first (overdue, due soon, returned, awaiting my review, blocked), then work through “Needs your action”; the analysis card sums up what matters most right now.'),
    'okr-analysis': h('OKR 分析',
      '你自己的 OKR 完成度、团队每个人的完成度和公司目标完成度，都和本月时间进度对比。',
      '进度条上的竖线是按时间应达到的位置；红色和橙色表示落后。团队列表从低到高排序，先关注最上面的人。',
      'OKR analysis',
      'Your OKR completion, each team member’s and the company’s — all compared with how much of the month has passed.',
      'The marker on each bar is where it should be by now; red and orange mean behind. The team list is sorted lowest first.'),

    team: h('任务分析',
      '按汇报线汇总下属（直接和间接）的任务结果：完成度、准时率、质量分和逾期。',
      '先看顶部总数，再在表格里找逾期多或完成度低的人，点“查看问题”看具体任务。汇报线在“组织与权限”里设置。',
      'Task analysis',
      'Task outcomes of your direct and indirect reports: completion, on-time rate, quality and overdue work.',
      'Scan the totals, then find people with overdue work or low completion and open Details. Reporting lines are set in Organization & permissions.'),
    'project-analysis': h('项目分析',
      '看每个项目的进展是否跟得上时间，以及延期的可能性。',
      '对比“工作进度”和“时间进度”：时间过了一大半而工作没完成，就有延期风险。延期可能性 60 分以上的项目需要马上找负责人沟通。',
      'Project analysis',
      'Whether each project’s progress keeps pace with time, and how likely it is to slip.',
      'Compare work done with time elapsed; risk 60+ needs a conversation with the owner now.'),
    products: h('产品管理',
      '查询公司所有产品，并由产品经理补齐每个 SKU 的属性，建立完整的产品目录。',
      '用搜索和产品线、状态筛选找到产品；“资料待补齐”列出缺少属性的 SKU，点进去补齐后保存。',
      'Product catalog',
      'Look up every company product; PMs complete each SKU’s attributes to build the full catalog.',
      'Search or filter by product line and status; “Needs attributes” lists SKUs missing data — open one, fill it in and save.'),
    orgchart: h('组织架构',
      '整个公司的汇报关系图，每张卡片显示名字、岗位和所在地。',
      '顶部按所在地筛选会突出显示该地的人；卡片下方的按钮可以收起或展开下属。岗位、汇报线和工作地点都由管理员在“组织与权限”里维护。',
      'Org chart',
      'The company’s reporting lines; each card shows the person’s name, role and location.',
      'Click a location at the top to highlight its people; the button under a card collapses or expands its reports. Admins maintain titles, reporting lines and work locations in Organization & permissions.'),
    quality: h('产品质量追踪（测试）',
      'AI 每天把客服工单和论坛里的质量问题收集进来、合并重复、严格分类；工厂填写原因、方案和执行时间，我们批准、验证后关闭。',
      '先看顶部的严重问题和“方案待批准”；点图表里的分类或产品线可以筛选下面的问题清单；点一行打开详情处理。',
      'Quality tracking (test)',
      'AI collects quality issues from support tickets and forums daily, merges duplicates and classifies them; factories write cause, fix and date; we approve, verify and close.',
      'Start with critical issues and plans awaiting approval; click a category or product bar to filter the list; click a row to work on it.'),
    'product-cost': h('成本核算',
      '输入 SKU 或名称，计算最低成本、分销价和最终售价。',
      '总裁在“组织与权限”里决定谁能看成本；其他人只能看到 SKU 和零售价。有权限的人可以调整汇率、运费、运营成本比例做测算。',
      'Cost calculator',
      'Enter a SKU or name to calculate the lowest cost, dealer price and retail price.',
      'The president decides in Organization & permissions who can see costs; everyone else sees only the SKU and retail price. Authorized users can adjust FX, freight and operating-cost assumptions.'),
    feedback: h('Bug 与建议',
      '员工通过右上角红色“Bug 与建议”按钮提交的问题和建议，带截图。',
      '看完处理后点“标为已处理”。开通邮件后，每条提交也会自动发到管理员邮箱。',
      'Bug & ideas',
      'Problems and ideas sent with the red “Bug & ideas” button at the top right, with screenshots.',
      'Mark each one done once handled. With email configured, every note is also sent to the admin inbox.'),
    'erp-access': h('ERP 权限',
      '给每位员工设置产品、价格构成、供应链和仓库库存的权限。',
      '每项选“无 / 查看 / 管理”（价格构成是“查看 MSRP / 价格组成 + 修改”），点一下即保存；“管理”包含“查看”。',
      'ERP permissions',
      'Set each employee’s access to products, price build-up, supply chain and warehouse stock.',
      'Pick None / View / Manage for each (pricing: MSRP only / full build-up + edit); it saves on click and Manage includes View.'),
    'wms': h('库存管理（WMS）',
      '按 SKU 和库位（美国仓、东莞、济南、在途）查看和加减库存，每一次操作都有流水。',
      '仓库管理员做入库、出库、调拨、盘点调整；盘点调整需领导确认。用筛选和表头排序快速找到 SKU；新建 SKU 请到产品管理。',
      'Inventory (WMS)',
      'View and change stock per SKU and location (US, Dongguan, Jinan, in transit); every change is logged.',
      'Warehouse operators record goods in, out, transfers and count adjustments (adjustments need a leader). Use filters and sortable headers; create SKUs in Product catalog.'),
    'supply-chain': h('智能供应链',
      '用颜色标出每个 SKU 的库存健康：需要补货、即将缺货、库存超期、库存过多。',
      '点顶部色块筛选对应的 SKU；底部的补货建议按产品线汇总，可以一键生成采购单草稿。',
      'Smart supply chain',
      'Colors mark each SKU’s stock health: reorder, stock-out risk, aged stock, overstock.',
      'Click a colored tile to filter; replenishment suggestions are grouped by product line and can become a draft PO in one click.'),

    settings: h('个人设置',
      '上传头像、填写联系方式，方便同事找到你；查看自己的权限。',
      '点“上传头像”选一张照片，系统会自动裁剪压缩；填写电话、邮箱、微信和时区后点保存；工作地点由管理员设置。',
      'Personal settings',
      'Upload a photo and contact details so colleagues can reach you; see your access.',
      'Click Upload photo (it is cropped and compressed automatically), fill in phone, email, WeChat and time zone, then Save; your work location is set by an administrator.'),
    org: h('组织与权限',
      '管理员设置每个人的直属上级、职位、角色和功能权限。',
      '在表格里直接修改，改完立即保存。直属上级决定“任务分析”的可见范围；“产品+供应链”和“成本明细”只给需要的人开通。切到“汇报线图”检查组织结构是否正确。',
      'Organization & permissions',
      'Admins set each person’s manager, title, role and feature access.',
      'Edit directly in the table; changes save immediately. Managers decide Team analysis visibility; grant Product hub and Cost detail only as needed. Check the Org chart view.'),
    tasks: h('任务中心 / 团队任务看板',
      '全部门任务的主表格，记录负责人、优先级、状态、分类和截止日期，类似 monday.com。',
      '① 点“新建任务”或分组底部“添加任务”创建；② 直接点表格里的格子修改负责人、状态等；③ 点任务名右侧的对话图标写进度；④ 用上方“人员 / 筛选 / 排序”找任务。状态改成 Done 只代表执行完成，正式验收在“成果验收”里做。',
      'Task hub / Team task board',
      'The department’s main task table: owner, priority, status, category and due date, similar to monday.com.',
      '1) Create with New task or Add task under a group. 2) Click any cell to edit it. 3) Use the speech-bubble icon to post progress. 4) Narrow the list with Person / Filter / Sort. Done only marks execution; formal acceptance happens in Deliverable review.'),
    projects: h('项目管理',
      '管理跨部门的项目：按阶段拆分任务、看进度和时间线、发布项目状态。',
      '① 点“新建项目”选模板；② 在“表格”里按阶段添加任务并分派负责人，任务会自动进入对方的“我的任务”；③ 点彩色格子直接改状态或优先级；④ 用“时间线”看排期，用“概览”每周发布一次项目状态。',
      'Projects',
      'Run cross-department projects: tasks by stage, progress, timeline and status updates.',
      '1) Click New project and pick a template. 2) In Table, add tasks by stage and assign owners; they appear in each person’s My tasks automatically. 3) Click a colored cell to change status or priority. 4) Use Timeline for scheduling and post a weekly status update in Overview.'),
    okr: h('OKR 目标',
      '记录每个人的目标（O）和可量化的关键结果（KR），跟踪进度、状态和进展，周期末自评并由主管确认评分。',
      '① 右上角选周期；② 在“我的 OKR”底部点“添加目标”，写目标和权重；③ 在目标下点“添加关键结果”，填目标值和单位；④ 平时点“进展”写更新、给 KR 标状态；⑤ 周期末点 KR 右侧的分数提交自评，主管确认。“团队 OKR”看同事，“对齐视图”看目标如何层层支撑。',
      'OKRs',
      'Each person’s objectives (O) and measurable key results (KR), with progress, status and updates; self evaluation and manager confirmation at period end.',
      '1) Pick the cycle (top right). 2) Under My OKRs click Add objective and set its weight. 3) Click Add key result and enter target and unit. 4) Use Updates to post progress and set KR status. 5) At period end click the score on a KR to self-evaluate; a manager confirms. Team OKRs shows colleagues; Alignment shows how goals support each other.'),
    reviews: h('成果验收',
      '集中处理已提交、等待你验收的成果。系统要求有证据、由人确认，避免“说做完了但没交付”。',
      '点“检查成果与记录”，对照验收标准查看成果说明和链接；可先让 AI 做证据检查，但最终必须由你勾选“已实际核对”后选择“确认验收通过”或“退回补充”。',
      'Deliverable review',
      'Deliverables submitted and waiting for your review. Acceptance needs evidence and a human decision.',
      'Open Inspect evidence & records, compare the submission and links with the criteria, optionally run the AI check, then tick that you inspected it and choose Confirm acceptance or Return for revision.'),
    performance: h('绩效参考',
      '汇总已人工验收的交付记录，作为绩效沟通的参考依据，不自动给出人事结论。',
      '点“读取当前验收依据”加载已验收任务的版本与验收人，再结合 OKR 评分一起看。',
      'Performance insights',
      'Evidence-backed records of accepted work for performance conversations. No automated personnel decisions.',
      'Click Load current review evidence to load accepted versions and reviewers, then read them together with OKR scores.'),
    support: h('客服工作台',
      '客服团队处理 Zoho 工单、AI 回复草稿、订单物流查询、知识库和服务标准的地方。',
      '用上方标签切换功能：“工单与草稿”看工单并核对 AI 草稿；“订单与物流”按订单号查 Shopify；“知识候选 / 问答资料”维护给 AI 助手用的资料。所有审核都不会自动发邮件给客户。',
      'Support workspace',
      'Where the support team handles Zoho tickets, AI reply drafts, order lookups, knowledge and service standards.',
      'Use the tabs: Tickets & drafts to review tickets and AI drafts, Order & shipping to look up Shopify orders, Knowledge candidates / Q&A sources to maintain what the AI assistant may use. Reviews never email customers automatically.'),
    knowledge: h('知识中心 / Wiki',
      'OneLaser 产品指南、故障排查和下载资源，客服和新人查资料的地方。',
      '用左侧“全部指南 / 下载中心”浏览，或在搜索框输入机型和关键词（例如 Hydra 对焦）。也可以打开 AI 助手提问。',
      'Knowledge center / Wiki',
      'OneLaser product guides, troubleshooting and downloads for support staff and new hires.',
      'Browse All guides / Downloads on the left, or search by model and keyword (e.g. Hydra focus). You can also ask the AI assistant.'),
    integrations: h('集成与通知',
      '查看钉钉、Grok AI 等外部服务的连接状态，并管理成员同步和任务提醒。',
      '新员工入职或离职后点“同步钉钉成员”；需要催办时点“预览提醒”，勾选任务后再确认发送。',
      'Integrations & notifications',
      'Connection status for DingTalk, Grok AI and other services, plus member sync and task reminders.',
      'After people join or leave, click Sync DingTalk members. To nudge people, click Preview reminders, select tasks, then confirm sending.')
  };

  /* Button hints. First matching rule wins, so put specific selectors first. */
  /* Column headers: tables marked data-help-table="key"; one hint per column, left to right. */
  const HEADERS = {
    'pj-analysis':[h('项目','项目名称，点开看详情。','','Project','Project name; open it for details.',''),h('状态','项目当前阶段（进行中 / 有风险 / 已完成等）。','','Status','Current project stage.',''),h('工作进度 vs 时间进度','条形 = 已完成工作量；竖线 = 按时间应完成到哪里。','条形落在竖线左边越多，越落后。','Work vs time','Bar = work done; marker = where it should be by now.','The further the bar is left of the marker, the further behind.'),h('偏差','工作进度减去时间进度。负数代表落后几个百分点。','','Gap','Work progress minus time elapsed; negative means behind.',''),h('逾期 / 卡住','已过截止日期或标记为卡住的任务数。','数字越大越需要关注。','Overdue / stuck','Tasks past due or marked stuck.',''),h('下一个里程碑','最近要到期的里程碑和日期。','','Next milestone','The nearest upcoming milestone.',''),h('延期可能性','综合偏差、逾期和剩余时间估算的延期风险。','高风险的项目优先开会协调。','Delay risk','Estimated from gap, overdue work and time left.','Meet on high-risk projects first.')],
    'pd-ladder':[h('价格档','不同场景下的售价：官网原价、三档折扣、表格最低价、经销商价、清货价。','','Price point','Prices for each scenario: MSRP, three discounts, sheet low, dealer, clearance.',''),h('售价','这一档对客户的标价（美元）。','','Price','Customer price for this tier (USD).',''),h('实收（含运费）','售价加上客户支付的运费，即公司实际收到的钱。','','Revenue','Price plus the shipping fee the customer pays.',''),h('最低成本','产品成本 + 最便宜的头程运费，送到美国仓的硬成本。','在下方“成本设置”里调整工厂价、汇率、运费。','Lowest cost','Product + cheapest freight to the US warehouse.','Adjust factory price, FX and freight in Cost settings below.'),h('运营 / 费用','按售价比例计算的运营成本：广告、KOL、交易手续费、仓储、售后、团队、管理。','比例在“成本设置”的运营费用里修改。','Opex / fees','Operating costs as a share of price: ads, KOL, fees, warehouse, RMA, team, admin.','Change the percentages in Cost settings.'),h('净利润','实收 − 最低成本 − 运营费用。','','Net profit','Revenue − lowest cost − opex.',''),h('利润率','净利润 ÷ 售价。绿色健康，黄色偏低，红色亏损。','','Margin','Net profit ÷ price. Green healthy, amber thin, red loss.',''),h('构成','灰 = 成本，橙 = 运营费用，绿 = 利润。','','Mix','Grey = cost, orange = opex, green = profit.','')],
    'pd-catalog':[h('产品','产品名称和 SKU。','点击打开产品详情，补齐属性。','Product','Name and SKU.','Click to open and complete attributes.'),h('供应链状态','开发中 / 上新中 / 在售 / 清库存 / 计划停售 / 停售。','','Status','Development, launching, on sale, clearance, phasing out, discontinued.',''),h('产品线','所属产品系列。','','Product line','Product family.',''),h('海外仓','美国仓可售库存，后面灰字是在途数量。','','Warehouse','Sellable US stock; grey number is in transit.',''),h('资料完整度','产品属性填写了多少。','低于 100% 的请产品经理补齐。','Completeness','How much of the product record is filled in.','PMs should complete anything below 100%.'),h('最优发货方式','按体积重和费率算出最便宜的头程方式。','','Best shipping','Cheapest freight method by volume weight and rates.',''),h('零售价 MSRP','官网标价。产品目录只显示这一个价格。','','MSRP','List price; the catalog shows only this price.','')],
    'pd-supply':[h('SKU','产品编号。','','SKU','Product code.',''),h('工厂','生产和发货的工厂。','','Factory','Producing factory.',''),h('工厂仓','还在工厂仓库、可以随时调货发美国的数量。','补货时优先从这里调。','Factory stock','Units at the factory, ready to ship to the US.','Transfer from here before a new PO.'),h('在途','已发出、在海上或路上的数量。','','In transit','Shipped and on the way.',''),h('美国仓','美国仓可售库存。','','US stock','Sellable US warehouse stock.',''),h('近90天出库','最近 90 天卖出 / 发出的数量，用来算销售速度。','','Out 90d','Units shipped in the last 90 days (sales speed).',''),h('可售天数','美国仓库存按近期速度还能卖多少天。','低于安全天数就该补货。','Cover (days)','Days the US stock lasts at recent speed.','Reorder when below safety days.'),h('最老库龄','美国仓里最老一批货放了多少天。','超过库龄上限算超期，考虑清库存。','Oldest (days)','Age of the oldest US batch.','Past the age limit means aged stock: consider clearance.'),h('美国仓货值','美国仓库存按出厂价折算的金额。','','US value','US stock valued at factory cost.',''),h('状态','颜色代表健康度：缺货 / 需补货 / 超期 / 积压 / 滞销 / 正常。','先处理红色和紫色。','Status','Health colour: stock-out, reorder, aged, overstock, idle, ok.','Handle red and purple first.')],
    'qa-issues':[h('编号','问题编号。','点击打开详情、方案和审批。','ID','Issue ID.','Open it for details, plan and approval.'),h('问题','问题描述（同类反馈已合并）。','','Issue','Description; duplicate reports are merged.',''),h('分类码','两级分类：大类-小类，例如 OPT-02。','','Code','Two-level category, e.g. OPT-02.',''),h('严重度','S1 安全 / 停机，S2 功能受影响，S3 轻微。','','Severity','S1 safety / down, S2 function affected, S3 minor.',''),h('反馈','收到的反馈次数（客服工单 + 论坛）。','','Reports','Number of reports (tickets + forum).',''),h('来源','反馈来自哪里。','','Sources','Where reports came from.',''),h('责任工厂','负责出方案和执行的工厂。','','Factory','Factory responsible for the fix.',''),h('状态','新问题 → 工厂出方案 → 我们审批 → 执行 → 验证 → 关闭。','','Status','New → plan → review → doing → verify → closed.',''),h('执行时间','工厂承诺的完成日期。','','Due','Date the factory committed to.',''),h('已持续','问题从发现到现在的天数。','','Age','Days since first reported.','')],
    'qa-factory':[h('工厂','责任工厂。','','Factory','Responsible factory.',''),h('未关闭','该工厂还没关闭的问题数。','','Open','Issues not yet closed.',''),h('执行逾期','超过承诺执行时间还没完成的问题数。','','Overdue','Past the committed date and not done.',''),h('平均出方案天数','从分派到工厂提交方案的平均天数。','越短越好。','Avg days to plan','Average days from assignment to plan.','Lower is better.')],
    'pp-org':[h('成员','姓名、登录邮箱和登录方式（钉钉 / 邮箱）。','','Member','Name, sign-in email and method (DingTalk / email).',''),h('职位','显示在组织架构里的岗位名称。','直接修改，离开输入框自动保存。','Title','Role shown on the org chart.','Edit in place; saves when you leave the field.'),h('工作地点','员工常驻的城市或办公室，组织架构按这里显示国旗。','只有管理员能改；员工在个人设置里只能查看。','Work location','City or office; the org chart shows a flag for it.','Only admins can change it.'),h('直属上级','这个人向谁汇报。决定谁能看到谁的任务和数据。','上级能看下级，下级看不到上级。','Manager','Who this person reports to; controls who sees whose tasks.','Managers see reports; reports never see managers.'),h('角色','主管可以给本部门派任务、管理目标；员工只能给自己建任务。','','Role','Managers assign department tasks and manage goals; employees create their own tasks.',''),h('管理员','管理员可以进入“组织与权限”，邀请、停用成员和分配权限。','只给少数人开通。','Admin','Admins open this page, invite / disable members and grant access.','Grant sparingly.'),h('产品+供应链','能否进入产品管理、成本核算和智能供应链。','','Product hub','Access to catalog, cost calculator and supply chain.',''),h('成本明细','能否看到成本构成、经销商价和利润。没开通只看到 SKU 和零售价。','需要先开通产品+供应链。','Cost detail','See cost build-up, dealer price and profit. Without it: SKU and MSRP only.','Requires Product hub.'),h('状态','在职 / 停用。关掉开关会先确认未完成任务转给谁，然后立即停用。','停用的人无法登录，并从组织架构中移除；可随时恢复。','Status','Active / disabled. Turning it off asks who takes over open tasks, then disables.','Disabled people cannot sign in and leave the org chart; restore any time.')],
  };
  const headerHint = node => {
    if (node.tagName !== 'TH') return null;
    const key = node.closest('[data-help-table]')?.dataset.helpTable, list = key && HEADERS[key];
    const i = Number.isInteger(node.cellIndex) ? node.cellIndex : [...node.parentElement.children].indexOf(node);
    return list ? list[i] || null : null;
  };

  const RULES = [
    ['#okr-new-kr button[type="submit"]', h('添加关键结果','保存这条 KR。','之后在 KR 进度里登记实际值，系统自动算进度。','Add key result','Saves this KR.','Then record actual values to track progress.')],
    ['[data-okr="edit-o-desc"]', h('编辑描述','补充目标的背景、为什么重要、怎样算做好。','写清楚能让同事和主管理解这个目标。','Edit description','Add context: why it matters and what good looks like.','')],
    ['#okr-update [name="confidence"]', h('KR 状态','发进展时顺便更新 KR 能否按时达成：正常 / 有风险 / 已延期。','有风险要尽早标出来，方便主管协调资源。','KR status','Update whether the KR is on track, at risk or behind.','Flag risk early.')],
    ['#okr-update button[type="submit"]', h('发布进展','保存这条进展，所有能看到这个目标的人都会看到。','','Post update','Saves the update for everyone who can see this goal.','')],
    ['[data-pd="back"]', h('返回','回到产品目录。','','Back','Back to the catalog.','')],
    ['[data-pd="save-product"]', h('保存产品','保存这个产品的属性修改。','','Save product','Saves attribute changes.','')],
    ['.pd-field input', h('产品属性','补齐这一项产品资料，完整度会随之提高。','改完点右上角“保存”。','Product attribute','Fill in this attribute to raise completeness.','Click Save at the top.')],
    ['.pd-media-add', h('上传图片 / 视频','为产品添加主图、细节图和视频。','','Upload media','Add product images and video.','')],
    ['.pd-select', h('供应链状态','产品生命周期阶段：开发中 → 上新中 → 在售 → 清库存 → 计划停售 → 停售。','状态会影响补货建议和清库存提示。','Supply status','Lifecycle stage.','It drives replenishment and clearance hints.')],
    ['.pd-check input', h('销售渠道','这个产品在哪些渠道上架销售。','','Sales channels','Where this product is listed.','')],
    ['[data-mb="assign"]', h('Assign Task 下达任务','给公司任何同事下达任务，跨部门也可以。','任务会进入对方的任务中心，你是验收人；AI 会自动跟进、催办，逾期时同时提醒你。','Assign Task','Give a task to anyone in the company, across departments.','It lands in their task center, you review it, and AI follows up.')],
    ['#live-assign-task [name="assigneeId"]', h('指派给','选择要接这项任务的同事，按工作地点分组。','','Assign to','The colleague who will do it, grouped by location.','')],
    ['#live-assign-task [name="title"]', h('任务名称','一句话说清楚要做什么。','以动词开头，具体到结果。','Task name','One line saying what to do.','')],
    ['#live-assign-task [name="dueAt"]', h('截止时间','对方必须完成的时间。','AI 会在到期前 3 天、1 天和逾期时提醒对方。','Due','When it must be done.','AI reminds them 3 and 1 days before and when overdue.')],
    ['#live-assign-task [name="priority"]', h('优先级','让对方知道这件事有多急。','','Priority','How urgent it is.','')],
    ['#live-assign-task [name="description"]', h('期望成果','你希望对方交出什么、达到什么效果。','写得越清楚，对方越不会做偏，AI 评分也越准。','Expected outcome','What you expect delivered.','Clear expectations prevent rework.')],
    ['#live-assign-task [name="criteria"]', h('验收标准','一行一条，你验收时逐条检查。','','Acceptance criteria','One per line; you check each when reviewing.','')],
    ['.mb-src-direct', h('任务来源：直接下达','这项任务是某位同事直接下达的，下达人就是验收人。','','Source: assigned','Assigned directly by a colleague, who also reviews it.','')],
    ['.mb-src-okr', h('任务来源：OKR','这项任务来自一条关键结果（KR）。','完成它会推动对应 OKR 的进度。','Source: OKR','Comes from a key result.','')],
    ['.mb-src-project', h('任务来源：项目','这项任务来自项目管理。','','Source: project','Comes from a project.','')],
    ['.ri-assign .ri-row', h('打开任务','查看任务详情、写进展或提交成果。','','Open task','View details, post progress or submit the result.','')],
    ['.ri-nudge', h('AI 跟进提醒','AI 根据截止日期和更新情况自动发出的提醒。','点击打开对应任务处理。','AI follow-up','Automatic reminder based on due date and activity.','Click to open the task.')],
    ['button.okb-pts, span.okb-pts, [data-okr="edit"][data-kind="o-weight"]', h('目标分值','这个目标值多少分；所有目标合计 100 分（例如 O1 = 40 分）。','点击修改。','Objective points','Points this objective is worth; all objectives add up to 100.','Click to change.')],
    ['.okb-kr-simple [data-okr="edit"][data-kind="kr-weight"], .okb-kr-simple .okb-chip', h('KR 权重','占所属目标分值的百分比；同一目标下所有 KR 合计必须正好 100%，不能超过。','例：目标 40 分、KR 25% → 这条 KR 值 10 分。','KR weight','Share of the objective’s points; KRs add up to 100%.','e.g. 40 points × 25% = 10 points.')],
    ['.okb-sc-btn, .okb-lv', h('自评 / 领导评分','六档：0 未开展 · 25 严重滞后 · 50 部分完成 · 75 接近完成 · 100 完成 · 125 完成且卓越。','自评由负责人打，领导评分由其上级打；点击打分。','Self / leader score','Six levels from 0 to 125.','Owner gives the self score, their leader the leader score; click to score.')],
    ['.okb-final', h('最终分','= 自评 50% + 领导评分 50%；领导判定自评不实时为 0。','','Final score','= 50% self + 50% leader; 0 if the leader marks the self score untrue.','')],
    ['.okb-kr-got, .okb-earned', h('得分','= 目标分值 × KR 权重 × 最终分。','评到 125 的部分会让总分超过 100。','Points earned','= objective points × KR % × final score.','125-level scores can push the total above 100.')],
    ['.okb-level', h('评分档位','选择一个档位：0 未开展、25 严重滞后、50 部分完成、75 接近完成、100 完成、125 完成且卓越。','','Score level','Pick one of the six levels.','')],
    ['.okb-veto', h('自评不实','领导发现自评与事实不符时勾选，这条直接记 0 分。','','Untrue self score','Tick when the self score is not truthful; the item scores 0.','')],
    ['#okr-new-kr [name="targetText"]', h('目标值','写“完成”，或一个明确的数字（例如 30 家、3%、$400K）。','写数字时系统会用它衡量进度。','Target','“Done”, or a clear number (30 dealers, 3%, $400K).','')],
    ['.okb-step', h('OKR 节奏','每月：25 日起设置下月 OKR；25–30 日自评（逾期按 0 分）；30 日至下月 3 日领导评分。','系统每天提醒和催办。','OKR rhythm','Monthly: set next month’s OKR from the 25th; self-score 25th–30th (missing = 0); leader scores 30th–3rd.','Daily reminders.')],
    ['.okb-howto', h('计算方式','查看 OKR 总分的完整计算规则和例子。','','How it’s calculated','See the full scoring rules with an example.','')],
    // ---- Sidebar section headers ----
    ['[data-nav-toggle]', h('菜单分组','点击收起或展开这一组菜单。','常用的分组保持展开，不常用的收起，下次打开会记住。','Menu group','Collapse or expand this group.','Your choice is remembered.')],
    // ---- OKR: new objective / key result forms (why each field matters) ----
    ['#okr-new-o [name="title"]', h('目标（O）','写你这个周期想达成的结果，一句话、可以鼓舞人。','好的目标说“要什么”，不说“做什么”，例如“西部经销商渠道销售额增长 20%”。','Objective','The outcome you want this cycle, in one inspiring sentence.','Say what you want, not what you will do.')],
    ['#okr-new-o [name="weight"]', h('目标权重 %','这个目标占你本周期总分的比例。','你所有目标的权重加起来应等于 100%；越重要权重越高。','Objective weight %','Share of your total score for this cycle.','All your objectives should add up to 100%.')],
    ['#okr-new-o [name="ownerId"]', h('负责人','谁对这个目标的结果负责。','主管可以给下属建目标；员工只能给自己建。','Owner','Who is accountable for the outcome.','Managers can create goals for reports.')],
    ['#okr-new-o [name="level"]', h('层级','个人目标只算你自己；部门目标是整个团队共同的目标。','部门目标由主管创建，个人目标对齐到部门或公司目标。','Level','Personal goals are yours; department goals are shared by the team.','Align personal goals to department or company goals.')],
    ['#okr-new-o [name="parentObjectiveId"]', h('对齐到','这个目标支撑哪一个上级或公司目标。','对齐后会出现在“对齐视图”的树里，大家能看到每个人的目标怎么支撑公司目标。','Align to','Which higher-level goal this supports.','Aligned goals appear in the alignment tree.')],
    ['#okr-new-o button[type="submit"]', h('创建目标','保存这个目标。','创建后在下面点“添加关键结果”，写 2–4 条可量化的 KR。','Create objective','Saves the objective.','Then add 2–4 measurable key results.')],
    ['[data-okr="cancel-add"]', h('取消','放弃这次填写。','','Cancel','Discard this entry.','')],
    ['#okr-new-kr [name="title"]', h('关键结果（KR）','用一个数字说明目标怎样算达成。','必须能量化，例如“新增 30 家经销商”，而不是“多开发经销商”。','Key result','A number that proves the objective is met.','Make it measurable.')],
    ['#okr-new-kr [name="target"]', h('目标值','周期结束时要达到的数字。','','Target','The number to reach by the end of the cycle.','')],
    ['#okr-new-kr [name="unit"]', h('单位','数字的单位，例如 家、%、万元、小时。','','Unit','Unit of the number, e.g. dealers, %, hours.','')],
    ['#okr-new-kr [name="weight"]', h('KR 权重 %','这条 KR 在目标里占多少分量。','同一目标下 KR 权重合计应等于目标权重。','KR weight %','How much this KR counts within the objective.','KR weights should add up to the objective weight.')],
    ['#okr-new-kr [name="baseline"]', h('基准值','开始时的数字，用来算进度。','进度 =（实际值 − 基准值）÷（目标值 − 基准值）。','Baseline','Starting number used to calculate progress.','')],
    ['#okr-new-kr [name="direction"]', h('方向','数字越大越好（如销售额）还是越小越好（如响应时间）。','','Direction','Whether higher or lower is better.','')],
    ['#okr-update textarea[name="body"]', h('写进展','记录这段时间做了什么、有什么风险、需要谁帮忙。','每周至少写一次；主管和同事都能看到。','Progress update','What moved, risks and help needed.','Post at least weekly.')],
    // ---- Task board ----
    ['th.mb-col-owner', h('负责人','谁来完成这项任务。','','Owner','Who does the task.','')],
    ['th.mb-col-priority', h('优先级','紧急 / 高 / 中 / 低。','点列标题可以排序。','Priority','Urgent / high / medium / low.','Click a header to sort.')],
    ['th.mb-col-status', h('状态','未开始 / 进行中 / 暂缓 / 待检查 / 完成。','选“完成”必须写完成结果和自评，AI 会打分。','Status','Not started, working, on hold, review, done.','Done requires a result and self-review; AI scores it.')],
    ['th.mb-col-category', h('自定义分类','按团队习惯给任务分类，例如 市场 / 运营 / 人事。','在看板设置里可以增改分类。','Custom category','Your own task categories.','Edit them in board settings.')],
    ['th.mb-col-due', h('截止日期','7 天内变粉，3 天内变红，逾期会闪烁提醒。','','Due date','Pink within 7 days, red within 3, flashing when overdue.','')],
    ['th.mb-col-updated', h('更新日期','最后一次更新的日期：越新越绿，7 天没更新变黑。','黑色说明这项任务很久没人跟进。','Updated','Last update: greener is fresher; black after 7 days.','Black means nobody has followed up.')],
    ['th.mb-task-head', h('任务','任务名称。','点名称打开详情，写更新、传附件。','Task','Task name.','Open it to post updates and attach files.')],
    ['th.mb-addcol', h('显示列','选择表格里显示哪些列。','','Columns','Choose which columns to show.','')],
    ['[data-mb-select], [data-mb-select-group]', h('选择','勾选任务后可以批量修改或移动。','','Select','Select tasks for bulk changes.','')],
    ['#live-new-task [name="title"]', h('任务名称','一句话说清楚要做什么。','以动词开头，例如“整理 11 月竞品价格表”。','Task name','One line saying what to do.','Start with a verb.')],
    ['#live-new-task [name="ownerId"]', h('负责人','谁来完成。','主管可以派给本部门同事；员工只能给自己建任务。','Owner','Who does it.','Managers can assign to their department.')],
    ['#live-new-task [name="reviewerId"]', h('验收人','完成后由谁检查结果。','必须是负责人以外的主管，或负责人的直属上级。','Reviewer','Who checks the result.','A manager other than the owner, or the owner’s manager.')],
    ['#live-new-task [name="dueAt"]', h('截止时间','必须完成的时间（你所在时区）。','','Due','Deadline in your time zone.','')],
    ['#live-new-task [name="description"]', h('期望成果','完成后应该交出什么、达到什么效果。','写得越具体，验收和 AI 评分越准确。','Expected outcome','What should be delivered.','The clearer it is, the fairer the review and AI score.')],
    ['#live-new-task [name="criteria"]', h('验收标准','一行一条，验收人逐条检查。','例如：覆盖 3 个品牌；每条附来源链接。','Acceptance criteria','One per line; the reviewer checks each.','')],
    // ---- Projects ----
    ['[data-pj="new-project"]', h('新建项目','创建一个项目，可以从模板开始（新品开发 / 营销活动 / 展会）。','','New project','Create a project, optionally from a template.','')],
    ['[data-pj="go-home"]', h('全部项目','回到项目列表。','','All projects','Back to the project list.','')],
    ['[data-pj="go-my"]', h('我的任务','只看项目里分给你的任务。','','My tasks','Only project tasks assigned to you.','')],
    ['[data-pj="filter"]', h('筛选','切换只看我参与的项目或全部项目。','','Filter','Projects I am in, or all.','')],
    // ---- Products ----
    ['[data-pd-search]', h('搜索产品','按 SKU、名称或产品线查找。','','Search products','Find by SKU, name or line.','')],
    ['[data-pd-fxlock]', h('锁定汇率','打开后使用你填写的汇率，不再跟随实时汇率。','做报价方案时锁定，避免数字随汇率变化。','Lock FX','Use your own rate instead of the live rate.','Lock it while preparing a quote.')],
    ['[data-pd-ov="fields.factoryRmb"]', h('出厂价（人民币）','工厂给我们的含税价格。','','Factory price (RMB)','Factory price to us.','')],
    ['[data-pd-ov="assume.exportMarkup"]', h('出口加价 %','出口环节的加价比例。','','Export markup %','Markup at export.','')],
    ['[data-pd-ov="fields.extraRmb"]', h('其他成本（人民币）','配件、包装等额外成本。','','Extra cost (RMB)','Accessories, packaging, etc.','')],
    ['[data-pd-ov="fields.gross"]', h('毛重 kg','含包装重量，用来算运费。','','Gross weight kg','Packed weight for freight.','')],
    ['[data-pd-ov="fields.ddpRate"], [data-pd-ov="assume.ddpFixedRmb"]', h('DDP 运费','双清包税的单价和固定费用。','','DDP freight','Delivered-duty-paid rate and fixed fee.','')],
    ['[data-pd-ov="assume.oceanRmbPerKg"], [data-pd-ov="assume.hybridFixedRmb"]', h('Hybrid 运费','海运单价和固定费用（自行清关）。','','Hybrid freight','Ocean rate and fixed fee (own customs).','')],
    ['[data-pd-ov="fields.lastMileRmb"]', h('尾程费（人民币）','美国仓到客户的派送费用。','','Last mile (RMB)','Warehouse-to-customer delivery.','')],
    ['[data-pd-ov="assume.freightBuffer"]', h('运费缓冲 %','给运费上浮留的余量。','','Freight buffer %','Headroom for freight increases.','')],
    ['[data-pd-ov="fields.msrp"], [data-pd-ov="fields.low"], [data-pd-ov="fields.shipFee"]', h('售价设置','官网原价、表格最低价和向客户收的运费。','','Prices','MSRP, sheet low price and the shipping fee charged.','')],
    ['[data-pd-ov="assume.disc1"], [data-pd-ov="assume.disc2"], [data-pd-ov="assume.disc3"]', h('折扣力度 %','三档促销折扣，分别对应日常、节日、黑五。','改完看价格阶梯里每档的利润率。','Discount %','Three promo tiers: everyday, holiday, Black Friday.','Check each tier’s margin in the ladder.')],
    ['[data-pd-ov="assume.dealerDiscount"], [data-pd-ov="assume.dealerSupportPct"]', h('经销商价','经销商折扣和给经销商的支持费用比例。','','Dealer price','Dealer discount and support cost.','')],
    ['[data-pd-ov="assume.clearanceOpsPct"]', h('清货运营费 %','清库存时的运营费用比例，用来算清货最低价。','','Clearance opex %','Opex used to compute the clearance floor.','')],
    ['[data-pd-ov^="opex."]', h('运营费用 %','按售价比例计算的各项费用。','合计会显示在下方；默认合计 38%。','Opex %','Each cost as a share of price.','Default total is 38%.')],
    ['[data-pd-ov="assume.shipMode"]', h('发货方式','自动选更便宜的，或固定 DDP / Hybrid。','','Shipping mode','Auto-pick the cheaper, or force DDP / Hybrid.','')],
    ['[data-pd="ov-save"]', h('保存成本设置','保存这个 SKU 的调整，下次打开仍然生效。','','Save cost settings','Keeps your changes for this SKU.','')],
    ['[data-pd="ov-reset"]', h('恢复默认','丢弃调整，回到成本表里的默认数字。','','Reset','Back to the sheet defaults.','')],
    ['#pd-replen [name="safety"]', h('安全天数','美国仓库存低于这么多天的销量就提醒补货。','','Safety days','Reorder when US stock covers fewer days.','')],
    ['#pd-replen [name="cover"]', h('补货覆盖天数','每次补货要够卖多少天。','','Cover days','How many days each reorder should cover.','')],
    ['#pd-replen [name="ageLimit"]', h('库龄上限','库存放超过这么多天算超期，建议清库存。','','Age limit','Stock older than this counts as aged.','')],
    // ---- Quality ----
    ['[data-qa="open"]', h('打开问题','查看问题详情、工厂方案和审批记录。','','Open issue','Details, factory plan and approvals.','')],
    ['[data-qa-q]', h('搜索问题','按编号、描述或分类码查找。','','Search issues','Find by ID, text or code.','')],
    ['[data-qa-sel]', h('筛选','按严重度、状态或工厂筛选。','','Filter','Filter by severity, status or factory.','')],
    // ---- Personal settings ----
    ['#pp-profile [name="title"]', h('职位','显示在组织架构里的岗位。','','Title','Shown on the org chart.','')],
    ['#pp-profile [name="phone"], #pp-profile [name="email"], #pp-profile [name="wechat"]', h('联系方式','同事找你时看到的电话、邮箱和微信。','只有同部门同事和管理员能看到。','Contact details','How colleagues reach you.','Visible to your department and admins.')],
    ['#pp-profile [name="timezone"]', h('时区','用于显示截止时间和提醒。','跨中美团队协作时请务必填写。','Time zone','Used for due times and reminders.','')],
    ['.pp-locked-field', h('工作地点','由管理员在“组织与权限”中设置。','如有变化请联系管理员修改。','Work location','Set by an administrator.','Ask an admin to change it.')],
    // ---- Organization & permissions ----
    ['[data-pp-field="title"]', h('职位','修改这个人的岗位名称。','离开输入框自动保存。','Title','Edit this person’s title.','Saves when you leave the field.')],
    ['[data-pp-field="location"]', h('工作地点','这个人常驻的城市或办公室。','只有管理员能改；组织架构会按这里显示国旗。','Work location','City or office.','Only admins can edit it.')],
    ['[data-pp-status]', h('在职 / 停用','关掉即停用：会先问未完成任务转给谁。','停用后立即下线、无法登录，并从组织架构移除；可在下方“已停用成员”恢复。','Active / disabled','Turn off to disable; you choose who takes over open tasks.','Restore from Disabled members.')],
    ['[data-pp="invite-open"]', h('邀请成员','邀请不在钉钉里的人（外部伙伴、顾问等）加入。','填好信息后生成一次性链接，7 天有效。','Invite member','Invite people outside DingTalk.','Creates a one-time link valid for 7 days.')],
    ['[data-pp="invite-close"]', h('关闭','收起邀请面板。','','Close','Close the invite panel.','')],
    ['#pp-invite [name="displayName"]', h('姓名','对方的姓名，会显示在组织架构里。','','Name','Shown on the org chart.','')],
    ['#pp-invite [name="email"]', h('登录邮箱','对方以后用这个邮箱登录。','','Sign-in email','They sign in with this email.','')],
    ['#pp-invite [name="title"]', h('岗位','对方的职位。','','Title','Their role.','')],
    ['#pp-invite [name="location"]', h('工作地点','对方常驻的城市；之后只有管理员能改。','','Work location','Their city; only admins can change it later.','')],
    ['#pp-invite [name="managerId"]', h('直属上级','对方向谁汇报，决定谁能看到他的任务。','','Manager','Who they report to.','')],
    ['#pp-invite [name="role"]', h('角色','员工只能给自己建任务；主管可以派任务。','','Role','Employees create own tasks; managers assign.','')],
    ['#pp-invite [name="products"], #pp-invite [name="product_cost_detail"]', h('权限','是否开通产品+供应链和成本明细。','外部人员一般不开通。','Access','Product hub and cost detail.','Usually off for external people.')],
    ['#pp-invite button[type="submit"]', h('生成邀请链接','生成一次性链接，复制发给对方。','链接只显示一次；对方设置密码后即加入。','Create invite link','Creates a one-time link to send.','Shown once; they join after setting a password.')],
    ['[data-pp="invite-copy"]', h('复制链接','复制邀请链接，用微信或邮件发给对方。','','Copy link','Copy and send by WeChat or email.','')],
    ['[data-pp="invite-revoke"]', h('撤销邀请','让这条邀请链接立即失效。','','Revoke','Invalidate this invite link now.','')],
    ['[data-pp="enable"]', h('恢复','让这个人重新可以登录，并回到组织架构。','','Restore','Let them sign in again.','')],
    ['[data-pp="disable-cancel"]', h('取消','不停用，保持在职。','','Cancel','Keep the member active.','')],
    ['#pp-disable [name="reassignTo"]', h('任务转交','他的未完成任务转给谁；等他验收的任务改由其上级验收。','','Hand over to','Who takes their open tasks.','')],
    // Navigation (left sidebar)
    ['[data-live-page="executive"].nav-item', h('老板看板','全公司只读总览，适合管理层每天快速了解进度。','点击进入，查看 OKR 进度、部门交付和待协调事项。','Executive overview','Company-wide read-only view for leadership.','Open it to see OKR progress, delivery and items that need coordination.')],
    ['[data-live-page="overview"].nav-item', h('个人工作台','个人表现和需要你注意的任务、项目。','每天上班先点这里。','Work Center','Your performance and what needs your attention.','Start each day here.')],
    ['[data-live-page="team"].nav-item', h('任务分析','看所有向你汇报的同事的任务完成情况。','有下属才会有数据；汇报线由管理员设置。','Task analysis','Task outcomes of everyone who reports to you.','Data appears once reporting lines are set.')],
    ['[data-live-page="project-analysis"].nav-item', h('项目分析','项目进展、及时性和延期可能性。','','Project analysis','Project progress, timeliness and delay risk.','')],
    ['[data-live-page="products"].nav-item', h('产品管理','查询产品、补齐产品属性。','仅限授权人员。','Product catalog','Look up products and complete their attributes.','Restricted access.')],
    ['[data-live-page="product-cost"].nav-item', h('成本核算','最低成本、分销价和最终售价。','成本只对总裁授权的人可见。','Cost calculator','Lowest cost, dealer price and retail price.','Costs are visible only to people the president authorizes.')],
    ['[data-live-page="supply-chain"].nav-item', h('智能供应链','库存健康和自动补货建议。','','Smart supply chain','Stock health and automatic reorder suggestions.','')],
    ['[data-live-page="settings"].nav-item, .identity-btn', h('个人设置','头像、联系方式和我的权限。','','Personal settings','Photo, contact details and your access.','')],
    ['[data-live-page="org"].nav-item', h('组织与权限','设置汇报线、职位、角色和功能权限（管理员）。','','Organization & permissions','Reporting lines, titles, roles and access (admins).','')],
    ['[data-live-page="tasks"].nav-item', h('任务中心','部门所有任务的主表格，可按表格、看板、日历查看。','在这里创建任务、分配负责人、更新状态。','Task hub','The department’s main task table, with table, kanban and calendar views.','Create tasks, assign owners and update status here.')],
    ['[data-live-page="projects"].nav-item', h('项目管理','跨部门项目：阶段、任务、时间线和项目状态。','项目里分派的任务会自动进入负责人的“我的任务”。','Projects','Cross-department projects: stages, tasks, timeline and status.','Tasks assigned in a project flow into each owner’s My tasks.')],
    ['[data-live-page="okr"].nav-item', h('OKR 目标','个人和团队的目标与关键结果，以及评分。','设定季度 / 月度目标，记录 KR 实际值，周期末评分。','OKRs','Objectives, key results and scores for people and teams.','Set goals, record KR values and score at period end.')],
    ['[data-live-page="reviews"].nav-item', h('成果验收','等你验收的成果都在这里；右侧数字是待处理数量。','点进去逐条检查证据，确认通过或退回。','Deliverable review','Deliverables waiting for your review; the number shows how many.','Open it and check each item’s evidence, then accept or return.')],
    ['[data-live-page="performance"].nav-item', h('绩效参考','已验收交付的汇总，用于绩效沟通参考。','绩效面谈前打开，读取验收依据。','Performance insights','Summary of accepted deliveries for performance conversations.','Open before a review meeting and load the evidence.')],
    ['[data-live-page="support"].nav-item', h('客服工作台','工单、回复草稿、订单查询和客服知识库。','客服同事每天在这里处理工单。','Support workspace','Tickets, reply drafts, order lookup and support knowledge.','Support staff handle tickets here every day.')],
    ['[data-live-page="knowledge"].nav-item', h('知识中心 / Wiki','产品指南、故障排查和下载资源。','遇到产品问题先来这里搜索。','Knowledge center / Wiki','Product guides, troubleshooting and downloads.','Search here first when you have a product question.')],
    ['[data-live-page="integrations"].nav-item', h('集成与通知','钉钉、AI 等外部连接，以及成员同步和提醒。','管理员维护成员名单、发送催办提醒时使用。','Integrations & notifications','External connections, member sync and reminders.','Used by managers to sync members and send reminders.')],
    ['[data-live-action="logout"]', h('退出登录','结束当前账号的登录状态。','在公用电脑上用完后务必点击退出。','Sign out','Ends your current session.','Always sign out when using a shared computer.')],
    ['[data-live-action="login"]', h('钉钉登录','用公司钉钉账号进入系统，不需要单独密码。','点击后在钉钉里确认授权即可。','Sign in with DingTalk','Use your company DingTalk account; no separate password.','Click, then approve in DingTalk.')],
    ['[data-live-action="menu"]', h('导航菜单','在手机或窄屏上打开左侧菜单。','点击展开，再选择要去的页面。','Navigation','Opens the side menu on small screens.','Tap it, then pick a page.')],
    ['[data-wiki-assistant-open]', h('AI 产品助手','基于已核对的知识库回答产品问题。','输入机型和问题，例如“Hydra 如何对焦”。回答仅供参考，以 Wiki 原文为准。','AI product assistant','Answers product questions from reviewed knowledge.','Type the model and question, e.g. “How do I focus the Hydra?”. Check the Wiki article for the final word.')],

    // Top bar
    ['[data-live-lang="zh"]', h('切换到中文','把界面文字切换成中文。','界面文字、同事姓名随之切换；OKR 里大家写的内容会自动翻译，标“译”的点一下可看原文。','Switch to Chinese','Shows the interface in Chinese.','Names switch too, and OKR text is auto-translated; click the Tr badge for the original.')],
    ['[data-live-lang="en"]', h('Switch to English','把界面文字切换成英文，方便美国同事使用。','界面文字、同事姓名随之切换；OKR 里大家写的内容会自动翻译，标“译”的点一下可看原文。','Switch to English','Shows the interface in English.','Names switch too, and OKR text is auto-translated; click the Tr badge for the original.')],
    ['[data-live-action="theme"]', h('日间 / 夜间主题','切换浅色或深色界面，保护眼睛。','点击切换，选择会保存在当前浏览器。','Light / dark theme','Switches between light and dark mode.','Click to toggle; your choice is saved in this browser.')],
    ['[data-live-page="wms"].nav-item', h('库存管理（WMS）','按 SKU 和库位查看、加减库存。','仓库管理员可做入库、出库、调拨、盘点调整；盘点调整需领导确认。','Inventory (WMS)','View and change stock per SKU and location.','Warehouse operators record goods in, out, transfers and count adjustments; adjustments need a leader.')],
    ['[data-wms="op"][data-type="in"]', h('入库','采购到货、退货、维修回库时增加库存。','选 SKU、库位、数量，写清原因；可填采购单号。','Goods in','Adds stock for purchases, returns or repairs coming back.','Pick SKU, location and quantity and give a reason.')],
    ['[data-wms="op"][data-type="out"]', h('出库','销售发货、样机、售后换货时扣减库存。','订单号必填；库存不能扣成负数。','Goods out','Deducts stock for shipments, demos or replacements.','An order number is required; stock cannot go negative.')],
    ['[data-wms="op"][data-type="transfer"]', h('调拨','把库存从一个库位移到另一个库位，例如工厂 → 在途 → 美国仓。','总数不变；到港后再从“在途”调到美国仓。','Transfer','Moves stock between locations, e.g. factory → in transit → US.','The total stays the same.')],
    ['[data-wms="op"][data-type="adjust"]', h('盘点调整','按实盘数量修正系统库存，或记录报损、送修。','提交后需要领导确认才会生效。','Count adjustment','Corrects stock to the counted quantity, or records damage or repair.','Takes effect after a leader confirms.')],
    ['[data-wms="operators"]', h('仓库管理员','主管在这里指定谁可以加减库存。','没被指定的人只能查看库存。','Warehouse operators','Managers choose who can change stock here.','Everyone else can only view.')],
    ['[data-guide-open]', h('使用说明','打开系统使用说明：任务状态、Assign Task、OKR 评分与每月节奏、项目、名字与翻译。','会自动打开与当前页面相关的章节，左侧可切换其他章节。','User guide','Opens the user guide: task status, Assign Task, OKR scoring and monthly rhythm, projects, names and translation.','It opens at the section for the page you are on; switch sections on the left.')],
    ['[data-live-action="refresh"]', h('刷新数据','从服务器重新读取最新数据。','同事刚更新了内容、而你这里没变化时点击。','Refresh data','Reloads the latest data from the server.','Click when a colleague has updated something you don’t see yet.')],

    // Overview / shared
    ['[data-live-action="new-task"]', h('新建任务','给自己或同事布置一项有明确交付和验收标准的工作。','填写标题、说明、负责人、验收人、截止时间和验收标准（每行一条），可关联一个 KR。','New task','Assign a piece of work with a clear deliverable and acceptance criteria.','Fill in title, description, owner, reviewer, due date and criteria (one per line); optionally link a KR.')],
    ['.btn[data-live-page="tasks"]', h('全部任务','跳转到任务中心查看完整任务列表。','点击进入任务看板。','All tasks','Goes to the full task list in the Task hub.','Click to open the task board.')],
    ['.btn[data-live-page="support"]', h('进入客服工作台','跳转到客服工作台查看工单详情。','点击进入。','Open support','Goes to the support workspace.','Click to open.')],
    ['.btn[data-live-page]', h('查看全部','跳转到对应页面查看完整内容。','','View all','Opens the full page.','')],
    ['.todo-row[data-live-task], .kanban-card[data-live-task]', h('打开任务详情','查看任务说明、验收标准、成果和验收记录。','点击打开右侧详情面板；负责人在里面提交成果，验收人在里面验收。','Open task details','See the description, criteria, deliverables and review history.','Click to open the side panel. Owners submit deliverables there; reviewers accept there.')],
    ['[data-live-action="list"]', h('列表视图','按行列出任务，适合快速浏览。','点击切换到列表。','List view','Shows tasks as rows for quick scanning.','Click to switch to list.')],
    ['[data-live-action="board"]', h('看板视图','按状态分列显示任务卡片。','点击切换到看板。','Board view','Shows task cards in status columns.','Click to switch to board.')],

    // People & product hub
    ['[data-pp="scope"]', h('查看范围','“我的下属”只看向你汇报的人；“全公司”仅管理员可用。','','Scope','My reports, or the whole company (admins).','')],
    ['[data-pp="toggle-member"]', h('查看问题','展开这个人逾期或被退回的任务。','点任务可以打开详情。','Details','Shows this person’s overdue or returned tasks.','Click a task to open it.')],
    ['[data-pp-field="managerId"]', h('直属上级','这个人向谁汇报。','上级可以在“任务分析”中看到他的任务结果；不能设成自己或自己的下属。','Manager','Who this person reports to.','The manager sees their outcomes in Task analysis; no cycles allowed.')],
    ['[data-pp-field="role"]', h('角色','主管可以管理本部门的任务和目标，员工只管理自己的。','钉钉重新登录不会覆盖这里的设置。','Role','Managers manage department tasks and goals; employees their own.','DingTalk re-login keeps this setting.')],
    ['[data-pp-admin]', h('管理员','可以修改组织架构和所有人的权限。','只给少数负责人开通。','Administrator','Can change the org structure and everyone’s access.','Grant sparingly.')],
    ['[data-pp-grant="products"]', h('产品+供应链','开通后可以进入产品管理、成本核算（只看 SKU 和零售价）和智能供应链。','','Product hub','Access to catalog, cost calculator (SKU and retail price only) and supply chain.','')],
    ['[data-pp-grant="product_cost_detail"]', h('看成本','可以看到最低成本、分销价、利润，以及价格是如何计算出来的（工厂价、头程运费、运营成本）。','需要先开通产品+供应链。','Cost access','Shows the lowest cost, dealer price, profit and how prices are calculated (factory price, freight, operating cost).','Requires Product hub access.')],
    ['[data-pp-avatar], .pp-upload', h('上传头像','选一张清晰的正面照片。','自动裁成正方形并压缩，同事在各处都能看到。','Upload photo','Choose a clear headshot.','Cropped and compressed automatically.')],
    ['[data-live-page="okr-analysis"].nav-item', h('OKR 分析','自己和团队的 OKR 完成度。','','OKR analysis','Your and your team’s OKR completion.','')],
    ['.ri-card', h('分析结论','根据当前数据自动写出 3–4 句分析，数据变化后自动更新。','开通 AI 后由 AI 生成；未开通时按规则生成，结论同样可以追溯到页面上的数字。','Analysis','3–4 sentences written from the current data; updates when the numbers change.','With AI enabled the AI writes it; otherwise it is rule-based and traceable to the numbers on the page.')],
    ['[data-ri="refresh"]', h('重新生成','让 AI 根据最新数据重新写一次分析。','','Regenerate','Asks the AI to rewrite the analysis from the latest data.','')],
    ['.ri-pace', h('进度条','彩色部分是完成度，竖线是按时间应达到的进度。','','Progress bar','Color = completion; marker = expected by now.','')],
    ['[data-live-page="orgchart"].nav-item', h('组织架构','公司汇报关系、岗位和所在地。','','Org chart','Reporting lines, roles and locations.','')],
    ['[data-pp="chart-toggle"]', h('收起 / 展开下属','数字表示收起了多少人。','','Collapse / expand reports','The number shows how many people are hidden.','')],
    ['[data-pp="chart-loc"]', h('按所在地突出显示','只突出这个所在地的人，再点一次恢复。','','Highlight a location','Highlights people in this location; click again to reset.','')],
    ['[data-pp="chart-expand"]', h('全部展开','展开所有被收起的部门。','','Expand all','Expands every collapsed branch.','')],
    ['[data-live-page="quality"].nav-item', h('产品质量追踪','客服和论坛反馈的质量问题，工厂方案与审批。','测试区，示例数据。','Quality tracking','Quality issues from support and forums, factory plans and approvals.','Test area, sample data.')],
    ['[data-qa="filter"]', h('按处理阶段筛选','待工厂方案 → 方案待批准 → 执行中 → 待验证 → 已关闭。','','Filter by stage','Awaiting plan → awaiting approval → in execution → to verify → closed.','')],
    ['.qa-hbar', h('点击筛选','只看这个分类或产品线的问题，再点一次取消。','','Click to filter','Shows only this category or product line; click again to clear.','')],
    ['[data-qa="approve"]', h('批准方案','同意工厂的原因分析和措施，工厂开始执行。','','Approve plan','Accepts the factory’s analysis and actions; execution starts.','')],
    ['[data-qa="reject"]', h('退回修改','写明原因后退回给工厂重新填写。','','Send back','Returns the plan to the factory with your reason.','')],
    ['[data-qa="verify"]', h('验证关闭','确认执行后不再有同类反馈，再关闭问题。','','Verify & close','Close once no new reports of the defect appear.','')],
    ['[data-qa-code]', h('修正分类码','AI 分错时在这里改正，AI 会学习。','','Correct code','Fix the AI’s classification here.','')],
    ['#qa-plan', h('填写工厂方案','根本原因、纠正措施、预防措施、负责人和承诺日期都必须填写。','','Factory plan','Root cause, corrective and preventive actions, owner and committed date are all required.','')],
    ['.pd-ladder', h('价格阶梯','零售价、三档折扣、表格最低价、经销商价和清货最低价，每一档的利润和利润率。','清货最低价以下就是亏本卖。','Price ladder','Profit and margin at MSRP, three discounts, sheet low price, dealer price and the clearance floor.','Below the clearance floor you sell at a loss.')],
    ['.pd-tip', h('策略建议','根据库存、在途、工厂仓和出库速度自动给出的补货或清库存建议。','','Suggestion','Automatic reorder or clearance advice from stock, inbound, factory stock and sell-through.','')],
    ['[data-pd="incomplete"]', h('资料待补齐','只显示还缺少属性的 SKU。','把鼠标放在完整度上可以看到缺哪些。','Needs attributes','Shows only SKUs missing attributes.','Hover a completeness bar to see what is missing.')],
    ['[data-pd="status-filter"]', h('按供应链状态筛选','开发中、上新中、在售、清库存、计划停售、停售。','再点一次取消筛选。','Filter by status','In development, launching, selling, clearance, phasing out, discontinued.','Click again to clear.')],
    ['[data-pd-filter="typeFilter"]', h('产品线','只看某条产品线。','','Product line','Shows one product line only.','')],
    ['[data-pd="scenario"]', h('定价场景','按零售价 MSRP 或最低价 LowPrice 计算利润。','','Pricing scenario','Calculates profit at MSRP or at the low price.','')],
    ['.pd-htile', h('库存健康色块','红：即将缺货；橙：需要补货；紫：库存超期；蓝：库存过多；灰：无销量；绿：正常。','点击筛选下面的表格，再点一次取消。','Stock health tile','Red: stock-out risk; orange: reorder; purple: aged; blue: overstock; gray: no sales; green: healthy.','Click to filter the table; click again to clear.')],
    ['[data-pd="create-po"]', h('生成采购单草稿','把这家工厂所有建议补货的 SKU 汇总成一张采购单。','确认数量后发给工厂。','Create draft PO','Combines all suggested reorders for this factory.','Confirm quantities, then send to the factory.')],
    ['[data-pd-cost]', h('查询成本','输入 SKU 或产品名称，例如 Cobra。','','Look up cost','Enter a SKU or a product name, e.g. Cobra.','')],

    ['.pp-att-row', h('打开任务','打开这项任务的详情。','“待我验收”的任务在详情里核对成果后确认或退回；逾期任务可以写进展或调整计划。','Open task','Opens this task’s details.','Review submissions there, or update overdue work.')],
    ['[data-pp="reload-team"]', h('刷新','重新计算团队数据。','','Refresh','Recalculates team data.','')],
    ['[data-live-page="orgchart"].btn', h('查看组织架构','打开组织架构图，查看汇报线。','在这里修改直属上级后，组织架构图会同步更新。','View org chart','Opens the org chart with reporting lines.','Managers changed here appear on the org chart right away.')],
    ['[data-pp="org-view"]', h('切换视图','“成员与权限”用来修改设置；“汇报线图”检查组织结构。','','Switch view','Members & access to edit; Org chart to check the structure.','')],
    ['#pp-profile button[type="submit"]', h('保存资料','保存你的联系方式，同事会在通讯录和头像卡片上看到。','','Save profile','Saves your contact details for colleagues to see.','')],
    ['#pp-profile select[name="timezone"]', h('时区','选择你所在的时区，方便中美团队安排沟通时间。','','Time zone','Your time zone, to help US and China teams schedule.','')],
    ['[data-pd="new-product"]', h('添加产品','新建一个 SKU，填写全部产品属性。','','Add product','Creates a new SKU with all attributes.','')],
    ['[data-pj="open-project"]', h('打开项目','进入这个项目查看任务、时间线和状态更新。','','Open project','Opens the project’s tasks, timeline and updates.','')],
    ['[data-pj="open-task"]', h('打开任务','查看任务详情、子任务和评论。','','Open task','Shows task details, subtasks and comments.','')],
    // OKR (Feishu-style board)
    ['[data-okr="tab"][data-value="mine"]', h('我的 OKR','只看你自己这个周期的目标和关键结果。','每周来这里更新进展。','My OKRs','Only your own objectives and key results for this cycle.','Come here weekly to update progress.')],
    ['[data-okr="tab"][data-value="team"]', h('团队 OKR','左侧选成员，查看他们的目标和进度。','了解同事在做什么、哪里有风险。','Team OKRs','Pick a person on the left to see their objectives and progress.','See what colleagues work on and where the risks are.')],
    ['[data-okr="tab"][data-value="align"]', h('对齐视图','以树状展示公司 → 部门 → 个人目标的支撑关系。','检查每个人的目标是否都对齐到了公司目标。','Alignment','A tree of company → department → personal objectives.','Check that personal goals support company goals.')],
    ['[data-okr="cycle-prev"], [data-okr="cycle-next"], [data-okr-cycle]', h('切换周期','选择要查看或填写的月份周期。','新建的目标会归入当前选中的周期。','Change cycle','Choose the monthly cycle to view or plan.','New objectives go into the selected cycle.')],
    ['[data-okr="rubric"]', h('评分标准','查看评分档位和权重规则。','六档：0 / 25 / 50 / 75 / 100 完成 / 125 完成且卓越；同一目标下 KR 权重合计正好 100%。','Scoring guide','Score levels and weight rules.','Six levels: 0 / 25 / 50 / 75 / 100 done / 125 exceptional; KR weights under one objective total exactly 100%.')],
    ['[data-okr="person"]', h('查看成员','切换到这位同事的 OKR。','名字下方三个状态：建立（是否已发布）、自评 已评/总数、领导 已评/总数；绿=完成，黄=进行中，灰=未开始。','View person','Switch to this person’s OKRs.','Three stages under the name: set (published), self scored/total, leader scored/total; green done, amber in progress, grey not started.')],
    ['[data-okr-search]', h('搜索成员','按姓名快速找到同事。','','Search people','Find a colleague by name.','')],
    ['[data-okr="add-o"]', h('添加目标','在当前周期新建一个目标（O）。','写清楚想达成什么，并填写权重（占本周期总分的比例）；创建后会自动打开“添加关键结果”。','Add objective','Creates an objective (O) in the current cycle.','State what you want to achieve and its weight (share of the period); the key-result row opens next.')],
    ['[data-okr="add-kr"]', h('添加关键结果','为这个目标添加一个可量化的 KR。','填目标值、单位和权重；“更多”里可改基准值和方向（例如退货率越低越好）。添加后可以继续添加下一条。','Add key result','Adds a measurable KR to this objective.','Enter target, unit and weight; More lets you set baseline and direction. You can add the next one right after.')],
    ['[data-okr="edit"][data-kind="o-title"], [data-okr="edit"][data-kind="kr-title"]', h('点击修改名称','直接在原位修改目标或 KR 的名称。','改完按回车或点“保存”；按 Esc 取消。','Click to rename','Edit the objective or KR name in place.','Press Enter or Save; Esc cancels.')],
    ['[data-okr="edit"][data-kind="o-weight"], [data-okr="edit"][data-kind="kr-weight"]', h('权重','占本周期总分的比例。','点击修改。KR 权重合计应等于所属目标的权重，不相等时卡片下方会提示。','Weight','Share of the period total.','Click to edit. KR weights should add up to their objective’s weight; a warning appears if not.')],
    ['[data-okr="kr-status"]', h('KR 状态','负责人对这条 KR 能否按时达成的判断：正常 / 有风险 / 已延期。','点击选择。状态只用于提醒和沟通，不影响评分。','KR status','The owner’s view of whether this KR is on track, at risk or off track.','Click to choose. Status is for communication and never changes the score.')],
    ['[data-okr="measure"]', h('KR 进度','根据实际值计算的完成进度。','主管点击可以登记最新实际值和数据来源。','KR progress','Progress calculated from the actual value.','Managers can click to record the latest value and its source.')],
    ['[data-okr="appraisal"]', h('评分','蓝色数字 = 主管已确认的分数；浅蓝“自评” = 员工自评待确认；虚线 = 未评分。','点击提交成果与自评，或由主管核对后确认评分。','Score','Blue number = confirmed by a manager; light “Self” = awaiting confirmation; dashed = not scored.','Click to submit evidence and a self evaluation, or for a manager to confirm.')],
    ['[data-okr="open-o"]', h('进展与详情','打开目标详情：描述、对齐关系、KR 状态和进展时间线。','在里面写本周进展，可同时更新某条 KR 的状态。','Updates & details','Opens the objective: description, alignment, KR status and the update timeline.','Post this week’s progress there and optionally update a KR’s status.')],
    ['[data-okr="menu"]', h('更多操作','设置对齐、编辑描述或指标、删除等。','','More actions','Alignment, description or metric edits, delete and more.','')],
    ['[data-okr="collapse"]', h('收起 / 展开','隐藏或显示这个目标下的关键结果。','','Collapse / expand','Hides or shows this objective’s key results.','')],
    ['[data-okr="edit-align"]', h('设置对齐','把这个目标对齐到上级或公司目标。','对齐后，目标会显示在“对齐视图”的树中。不能对齐到自己的下级目标。','Set alignment','Align this objective to a parent or company objective.','It then appears under that goal in the Alignment view. You can’t align to your own children.')],
    ['#okr-update button[type="submit"]', h('发布进展','记录这段时间的进展、风险或需要的协助。','可以选择关联的 KR 并更新它的状态；进展会按时间显示，团队都能看到。','Post update','Records progress, risks or help needed.','Optionally pick a KR and update its status; updates appear in a timeline for the team.')],
    ['.okb-align-chip', h('对齐的上级目标','这个目标支撑的上级目标。','点击查看上级目标的详情。','Parent objective','The goal this objective supports.','Click to open it.')],

    // OKR
    ['[data-live-action="new-objective"]', h('创建目标','新增一个目标（O），例如“Q4 销售额增长 20%”。','填写目标内容、负责人、周期和权重；保存后再在卡片上添加 KR。','Create objective','Adds an objective (O), e.g. “Grow Q4 sales 20%”.','Enter the objective, owner, period and weight; then add KRs on its card.')],
    ['#live-okr-owner', h('按员工查看','只看某一位员工的目标，或查看全部员工。','从下拉框选择员工。','View by employee','Show one employee’s objectives, or everyone’s.','Pick a person from the list.')],
    ['[data-live-new-kr]', h('添加关键结果（KR）','为这个目标添加可量化的衡量指标，例如“新增 30 家经销商”。','填写 KR 名称、指标类型、基线和目标值、权重。所有 KR 权重之和应等于目标权重。','Add key result (KR)','Adds a measurable result to this objective, e.g. “Sign 30 new dealers”.','Enter the KR name, metric type, baseline, target and weight. KR weights must add up to the objective’s weight.')],
    ['[data-live-objective-source]', h('查看原始记录','查看这个目标的来源和原始导入内容。','核对字段是否与原始表格一致时使用。','View source record','Shows where this objective came from and its original import.','Use it to check fields against the original sheet.')],
    ['[data-live-appraisal]', h('成果与评分','提交这个 KR 的成果和自评，或由主管确认评分。','员工：写成果说明并自评；主管：核对后确认评分（完成 80 分，卓越 100 分）。','Evidence & score','Submit this KR’s evidence and self evaluation, or confirm the manager score.','Owners describe the result and self-score; managers verify and confirm (complete 80, exceptional 100).')],
    ['[data-live-measure]', h('记录实际值','登记这个 KR 当前的真实业务数据，例如本月已签 12 家。','填写实际数值和核验依据；任务完成不会自动更新 KR，需要在这里手动记录。','Record actual value','Logs the KR’s current real-world value, e.g. 12 dealers signed so far.','Enter the value and its evidence. Finishing tasks does not update KRs automatically.')],

    // Reviews / performance / integrations
    ['.btn[data-live-task]', h('检查成果与记录','打开这项待验收的成果，核对证据后做出验收决定。','对照验收标准查看成果说明和链接，确认通过或退回补充。','Inspect evidence & records','Opens the deliverable so you can verify it and decide.','Compare the submission with the criteria, then accept or return it.')],
    ['[data-live-action="load-performance"]', h('读取当前验收依据','加载所有已验收任务的当前版本和验收人。','绩效沟通前点击，数据较多时需要等几秒。','Load current review evidence','Loads the current accepted versions and reviewers.','Click before a performance conversation; it may take a few seconds.')],
    ['[data-live-action="sync-directory"]', h('同步钉钉成员','从钉钉更新员工名单，让新同事可以被分配任务。','有人入职、离职或调岗后点击。不在授权部门内的账号会被停用。','Sync DingTalk members','Updates the employee list from DingTalk so new people can be assigned work.','Click after someone joins, leaves or changes team. Accounts outside approved departments are deactivated.')],
    ['[data-live-action="notifications"]', h('预览提醒','列出需要催办的任务，先预览、再决定发不发。','勾选要提醒的任务，点击“确认发送选定提醒”通过钉钉发出。','Preview reminders','Lists tasks that need a nudge so you can preview before sending.','Select tasks, then click Send selected reminders to notify via DingTalk.')],

    // Task drawer & forms
    ['[data-live-action="analyze"]', h('AI 成果检查','让 AI（Grok）对照验收标准检查当前成果，指出缺失的证据。','点击后等待结果。AI 只是建议，最终是否通过由验收人决定。','AI evidence check','Asks the AI (Grok) to compare the current deliverable with the criteria and flag missing evidence.','Click and wait for the result. The AI only advises; the reviewer decides.')],
    ['[data-live-action="refresh-analysis"]', h('刷新分析状态','查看 AI 分析是否已经完成。','AI 显示“等待中”时点击，不会重复提交。','Refresh assessment','Checks whether the AI assessment has finished.','Click while it shows waiting; it never resubmits.')],
    ['[data-live-action="retry-analysis"]', h('重试 AI 分析','上一次 AI 分析失败或过期时重新提交。','先勾选“我理解可能重复消耗额度”，再点击重试。','Retry AI assessment','Resubmits when the previous assessment failed or expired.','Tick the acknowledgement first, then retry.')],
    ['#live-submission button[type="submit"]', h('提交成果','把你完成的工作交给验收人检查。','写清楚做了什么、结果在哪里，最好附上 HTTPS 链接（文档、截图、网页）。提交新版本会让旧的验收失效。','Submit deliverable','Sends your finished work to the reviewer.','Describe what you did and where the result is, ideally with an HTTPS link. A new version replaces the current acceptance.')],
    ['#live-review button[value="accept"]', h('确认验收通过','确认成果达到验收标准，任务正式完成。','先实际打开成果核对、填写质量分和核验依据，并勾选确认框。','Confirm acceptance','Confirms the deliverable meets the criteria and closes the task.','Inspect the actual work, enter a quality score and evidence, and tick the confirmation box first.')],
    ['#live-review button[value="return"]', h('退回补充','成果不达标时退回给负责人修改。','在“核验依据或退回原因”里写清楚缺什么，负责人修改后重新提交。','Return for revision','Sends the work back when it doesn’t meet the criteria.','Explain what’s missing in the reason field; the owner resubmits.')],
    ['#live-send-notifications button[type="submit"]', h('确认发送选定提醒','通过钉钉向选中任务的负责人发送提醒。','确认勾选无误后点击；“已提交发送队列”不等于对方已读。','Send selected reminders','Sends DingTalk reminders to the owners of the selected tasks.','Check your selection first. “Queued” does not mean the person has read it.')],
    ['#live-measure button[type="submit"]', h('保存核验记录','保存这次 KR 实际值和依据。','确认数值和来源无误后保存，历史记录会保留。','Save measurement','Saves this KR value and its evidence.','Double-check the number and source; history is kept.')],
    ['button[form="live-new-task"]', h('创建任务','保存这项新任务并通知负责人。','确认负责人、验收人、截止时间和验收标准都已填写。','Create task','Saves the new task.','Make sure owner, reviewer, due date and criteria are filled in.')],
    ['button[form="live-new-objective"]', h('保存目标','保存这个新目标。','保存后在目标卡片上添加 KR。','Save objective','Saves the new objective.','Add KRs on its card afterwards.')],
    ['button[form="live-new-kr"]', h('保存 KR','保存这个关键结果。','确认目标值和权重正确。','Save KR','Saves the key result.','Check the target and weight.')],
    // Form fields inside dialogs
    ['#overlay-root select[name="ownerId"]', h('负责人','这项工作由谁来完成。','选择具体执行的同事；他会在“工作台”和“我的任务”里看到这项任务。','Owner','Who will do this work.','Pick the person doing it; it will appear in their Overview and My Work.')],
    ['#overlay-root select[name="reviewerId"]', h('验收人','由谁检查成果并决定是否通过。','一般选直属主管；不能和负责人是同一个人。','Reviewer','Who checks the deliverable and decides.','Usually the direct manager; must differ from the owner.')],
    ['#overlay-root select[name="krId"]', h('关联 KR','这项任务支撑哪一个关键结果。','可不选；关联后方便在 OKR 里追踪，但不会自动修改 KR 实际值。','Linked KR','Which key result this task supports.','Optional; helps tracking in OKRs but never changes KR values automatically.')],
    ['#overlay-root select[name="boardPriority"]', h('优先级','任务的紧急和重要程度。','紧急事项选“紧急 / 高”，看板会优先排在前面。','Priority','How urgent and important the task is.','Choose Urgent / High for time-critical work; it sorts first.')],
    ['#overlay-root select[name="boardCategory"]', h('分类','任务所属的业务类别。','便于按部门职能筛选和统计。','Category','The business area of the task.','Helps filtering and reporting by function.')],
    ['#overlay-root select[name="level"]', h('目标层级','个人目标还是部门目标。','部门目标由负责人设定，个人目标支撑部门目标。','Level','Personal or department objective.','Managers set department objectives; personal ones support them.')],
    ['#overlay-root select[name="objectiveType"]', h('目标类型','基础任务还是奖励任务。','基础任务是岗位必须完成的；奖励任务是额外挑战，可参与奖励评分。','Objective type','Base or bonus objective.','Base objectives are core duties; bonus ones are stretch goals eligible for bonus scoring.')],
    ['#overlay-root select[name="direction"]', h('指标方向','数值越大越好，还是越小越好。','例如销售额选“越高越好”，退货率选“越低越好”。','Direction','Whether higher or lower is better.','Sales: higher is better. Return rate: lower is better.')],
    ['#overlay-root select[name="score"]', h('评分','按完成程度打分：完成 80 分，卓越完成 100 分。','对照成果和 KR 目标值如实选择。','Score','Score by achievement: complete 80, exceptional 100.','Choose honestly against the evidence and KR target.')],

    ['[data-live-action="close"]', h('关闭','关闭当前面板或弹窗。','未保存的内容可能会丢失，关闭前请先保存。','Close','Closes this panel or dialog.','Save first; unsaved input may be lost.')],

    // Team task board (task-board.js)
    ['[data-mb="refresh"]', h('刷新看板','重新读取看板上的最新任务。','同事刚改过任务、你这里还没更新时点击；未保存的视图设置会保留。','Refresh board','Reloads the latest tasks on the board.','Click when a colleague changed something you don’t see yet.')],
    ['[data-mb="people"]', h('团队成员','查看这个看板涉及哪些人，以及你的权限范围。','只能查看；账号和权限由管理员在钉钉中管理。','Board people','Shows who is on this board and your access scope.','View only; administrators manage accounts in DingTalk.')],
    ['[data-mb="copy-link"]', h('复制链接','复制当前看板的网址，发给同事。','对方打开后仍需要自己的权限才能看到内容。','Copy link','Copies this board’s URL to share.','Recipients still need their own access.')],
    ['[data-mb="settings"]', h('看板设置','修改分组、状态、优先级和分类标签的名称与颜色。','仅部门负责人可修改，修改会影响全部门的看板。','Board settings','Edit names and colors of groups, statuses, priorities and categories.','Managers only; changes apply to the whole department.')],
    ['[data-mb="scope"][data-value="team"]', h('团队看板','显示部门内所有你有权限看到的任务。','点击切换到全部门视图。','Team board','Shows all department tasks you can access.','Click for the department view.')],
    ['[data-mb="scope"][data-value="mine"]', h('我的任务','只显示分派给你的任务，按日期集中查看。','每天开始工作前点这里，看自己今天要做什么。','My Work','Shows only tasks assigned to you, by date.','Start your day here to see your own work.')],
    ['[data-mb="display"][data-value="table"]', h('主表格','以表格显示任务，可直接点格子编辑。','最常用的视图，适合批量整理任务。','Main table','Tasks as a table; click cells to edit.','The everyday view for organizing tasks.')],
    ['[data-mb="display"][data-value="kanban"]', h('看板','按状态分列显示任务卡片。','把卡片拖到另一列即可改变状态。','Kanban','Task cards in status columns.','Drag a card to another column to change its status.')],
    ['[data-mb="display"][data-value="calendar"]', h('日历','按截止日期在日历上显示任务。','查看本月哪天任务集中；默认隐藏周末，可切换显示。','Calendar','Tasks placed on their due dates.','See which days are busy; weekends are hidden by default.')],
    ['[data-mb="display"][data-value="dashboard"]', h('团队汇总','按状态和负责人统计任务数量。','点击图表中的状态或人名，可直接筛选出对应任务。','Team summary','Task counts by status and owner.','Click a status or person to filter the tasks.')],
    ['[data-mb="new"][data-group]', h('添加任务','在这个分组里给自己新建一项任务。','填写名称、优先级、截止日期和详细描述后确认。','Add task','Creates a task for yourself in this group.','Fill in name, priority, due date and details, then confirm.')],
    ['[data-mb="new"]', h('新建任务','给自己新建一项任务，负责人就是你。','填写名称、优先级、截止日期和详细描述。要给别人下任务，请用 Assign Task。','New task','Creates a task for yourself; you are the owner.','Enter name, priority, due date and details. To give work to someone else, use Assign Task.')],
    ['[data-mb-search]', h('搜索任务','按任务名称快速查找。','输入关键词即可实时筛选。','Search tasks','Find tasks by name.','Type a keyword to filter instantly.')],
    ['[data-mb="person"]', h('人员筛选','只看某位同事负责的任务。','点击后选择人员；再选“全部人员”恢复。','Person filter','Show only one person’s tasks.','Pick a person; choose All people to reset.')],
    ['[data-mb="filter"]', h('筛选','按状态等条件缩小任务范围。','选择条件后表格立即更新；“清除筛选”恢复全部。','Filter','Narrow tasks by status and other fields.','The table updates instantly; Clear filters resets it.')],
    ['[data-mb="sort"]', h('排序','设置任务排列顺序，例如先按优先级、再按截止日期。','可添加多个排序条件，数字表示当前条件数。点“保存到此视图”记住设置。','Sort','Set the order, e.g. by priority then due date.','Add several rules; the number shows how many. Save to this view to keep it.')],
    ['[data-mb="hide"]', h('隐藏 / 显示列','选择表格中显示哪些列。','取消勾选不需要的列，让表格更简洁。','Hide / show columns','Choose which columns appear.','Untick columns you don’t need.')],
    ['[data-mb="groupBy"]', h('分组依据','选择按分组、状态、优先级、分类、负责人或日期把任务分块显示。','换个角度看任务，例如按负责人看每人工作量。','Group by','Group tasks by group, status, priority, category, owner or date.','Switch perspective, e.g. by owner to see workload.')],
    ['[data-mb="add-group"]', h('添加分组','新建一个任务分组，例如一个项目或一个阶段。','填写中英文名称和颜色；仅负责人可操作。','Add group','Creates a new task group, e.g. a project or phase.','Enter Chinese and English names and a color; managers only.')],
    ['[data-mb="collapse-group"]', h('折叠 / 展开分组','收起或展开这个分组里的任务。','点击分组名切换，任务很多时用来聚焦。','Collapse / expand group','Hides or shows the tasks in this group.','Click the group name to focus.')],
    ['[data-mb="edit-group"]', h('分组设置','重命名分组、修改颜色，或批量操作组内任务。','仅负责人可修改。','Group options','Rename, recolor or act on tasks in this group.','Managers only.')],
    ['[data-mb-resize]', h('调整列宽','拖动改变这一列的宽度。','按住左右拖动即可。','Resize column','Drag to change the column width.','Click and drag left or right.')],
    ['[data-mb="column-sort"]', h('按此列排序','点击列标题，按这一列升序或降序排列。','再次点击切换方向。','Sort by this column','Click the header to sort by this column.','Click again to reverse.')],
    ['[data-mb="expand"]', h('展开子任务','查看或添加这项任务下的子任务。','把大任务拆成几个小步骤时使用。','Expand subitems','Shows or adds subitems under this task.','Use it to break big work into steps.')],
    ['[data-mb="rename"]', h('任务名称','点击可直接修改任务名称。','修改后按回车保存。','Task name','Click to rename the task.','Press Enter to save.')],
    ['[data-mb="updates"]', h('任务讨论','记录进度、阻碍或需要协作的事项，数字是已有更新条数。','写一条更新后点“发布更新”。这是内部记录，不会通知客户，也不会触发验收。','Task updates','Post progress, blockers or coordination notes; the number shows existing updates.','Write an update and click Post update. Internal only; no customer email or acceptance.')],
    ['[data-mb="task-menu"]', h('任务选项','重命名、添加子任务、移动分组或打开详情与成果。','点击后从菜单中选择操作。','Task options','Rename, add a subitem, move group or open details & evidence.','Click and pick an action.')],
    ['[data-mb="edit-cell"][data-field="owner"]', h('负责人','这项任务由谁来做。','点击选择同事；只有负责人能调整分派。','Owner','Who does this task.','Click to choose a person; only managers can reassign.')],
    ['[data-mb="edit-cell"][data-field="priority"]', h('优先级','任务的紧急和重要程度：紧急 / 高 / 中 / 低。','点击选择。排序默认先按优先级。','Priority','How urgent and important: Urgent / High / Medium / Low.','Click to choose. Sorting uses priority first by default.')],
    ['[data-mb="edit-cell"][data-field="status"]', h('执行状态','任务做到哪一步：未开始 / 进行中 / 暂缓 / 待检查 / 完成。','点击修改。“完成”满 7 天会自动移入“已完成”分组；正式验收仍需在详情里提交成果。','Status','Where the task stands: Not started / Working / On hold / Review / Done.','Click to change. Done for 7 days moves it to Completed; formal acceptance still happens in details.')],
    ['[data-mb="edit-cell"][data-field="category"]', h('分类','任务所属的业务类别，例如人事、财务、市场。','点击选择；负责人可在“看板设置”里新增分类。','Category','The business area, e.g. HR, finance, marketing.','Click to choose; managers add categories in Board settings.')],
    ['[data-mb="edit-cell"][data-field="due"]', h('截止日期','这项任务需要在哪天之前完成。','点击选择日期，逾期会在老板看板中被标出。','Due date','When the task must be finished.','Click to pick a date; overdue work is flagged on the executive overview.')],
    ['[data-mb="edit-cell"][data-field="notes"]', h('备注','补充说明、链接或注意事项。','点击直接编辑。','Notes','Extra details, links or reminders.','Click to edit.')],
    ['[data-mb="detail"]', h('最后更新 / 详情','显示任务最后修改的时间；点击打开任务详情与成果。','需要提交成果或验收时从这里进入。','Last updated / details','When the task last changed; click to open details & evidence.','Go here to submit or review deliverables.')],
    ['[data-mb="move"]', h('移至分组','把任务移到另一个分组。','选择目标分组；子任务会跟着父任务一起移动。','Move to group','Moves the task to another group.','Choose a group; subitems move with their parent.')],
    ['[data-mb="labels"]', h('编辑标签','修改状态、优先级或分类的中英文名称和颜色。','改动对全部门生效；正在使用的分类不能删除。','Edit labels','Edit Chinese/English names and colors for statuses, priorities or categories.','Changes apply department-wide; categories in use cannot be deleted.')],
    ['[data-mb="add-sort"]', h('新增排序','再加一个排序条件。','例如先按优先级，再按截止日期。','Add sort','Adds another sort rule.','E.g. priority first, then due date.')],
    ['[data-mb="remove-sort"]', h('删除排序','去掉这一条排序条件。','','Remove sort','Removes this sort rule.','')],
    ['[data-mb="save-view"]', h('保存到此视图','把当前的排序、分组、隐藏列等设置保存下来。','只影响你自己的视图，下次打开时保持不变。','Save to this view','Saves the current sort, grouping and column settings.','Only your own view; it stays the same next time.')],
    ['[data-mb="calendar-today"]', h('今天','跳回当前月份。','','Today','Jumps back to the current month.','')],
    ['[data-mb="calendar-prev"], [data-mb="calendar-next"]', h('切换月份','查看上一个月或下一个月的任务。','','Change month','Shows the previous or next month.','')],
    ['[data-mb="calendar-weekends"]', h('显示 / 隐藏周末','切换日历中是否显示周六、周日。','截止日期在周末的任务需要打开才能看到。','Show / hide weekends','Toggles Saturday and Sunday in the calendar.','Turn on to see tasks due on weekends.')],
    ['[data-mb="dashboard-status"], [data-mb="dashboard-person"]', h('点击筛选','点这个统计项，只显示对应的任务。','再点一次或“清除筛选”恢复。','Click to filter','Shows only the matching tasks.','Click again or Clear filters to reset.')],

    // Support workspace (company-support.js)
    ['[data-company-refresh]', h('刷新','重新读取最新的工单和客服数据。','顶部提示“未同步”或数据不对时点击。','Refresh','Reloads the latest tickets and support data.','Click when it says not synced or data looks stale.')],
    ['[data-company-tab="tickets"]', h('工单与草稿','查看已跟踪的 Zoho 工单，对比 AI 草稿、客服修改稿和已发送回复。','点工单号打开，检查 AI 草稿是否准确。','Tickets & drafts','Tracked Zoho tickets with AI drafts, staff edits and sent replies.','Open a ticket to check the AI draft.')],
    ['[data-company-tab="shopify"]', h('订单与物流','按订单号查询 Shopify 订单和物流状态（只读）。','输入完整订单号，例如 #1001，查看各包裹的发货和送达记录。','Order & shipping','Read-only Shopify order and shipping lookup.','Enter the full order number, e.g. #1001, to see each package.')],
    ['[data-company-tab="quality"]', h('质量与交接','检查回复质量，记录需要转交其他同事的工单。','逐条核对后保存核对记录。','Quality & handover','Review reply quality and log tickets handed to others.','Check each item and save the review record.')],
    ['[data-company-tab="publicInbox"]', h('访客请求','官网 AI 助手收到的人工支持请求和客户反馈。','优先处理“标记未解决”的问题，并考虑补充到知识库。','Visitor requests','Human-help requests and feedback from the website assistant.','Prioritize items marked unresolved and consider adding them to the knowledge base.')],
    ['[data-company-tab="candidates"]', h('知识候选','把处理工单时总结的经验整理成知识草稿，审核后再发布。','点“新建候选”填写适用机型、解决方法和来源；去掉客户个人信息。','Knowledge candidates','Turn ticket experience into knowledge drafts for review.','Use New candidate with model, fix and source; remove customer personal data.')],
    ['[data-company-tab="publicKnowledge"]', h('问答资料','决定哪些公开文章可以给 AI 助手用来回答客户。','打开文章核对当前版本，再选择是否允许助手使用。','Q&A sources','Decide which public articles the AI assistant may use.','Review the current version, then allow or deny assistant use.')],
    ['[data-company-tab="answers"]', h('标准回复','常见问题的标准回复候选。','仅供人工核对，审核不会自动发给客户。','Standard responses','Candidate standard replies for common questions.','For human review only; nothing is sent automatically.')],
    ['[data-company-tab="sla"]', h('SLA 草案','客服服务时限标准（例如首次响应时间）的草案。','尚未生效，供讨论确认。','SLA draft','Draft service-time standards such as first-response time.','Not active yet; for discussion.')],
    ['[data-company-tab="operations"]', h('自动化状态','查看客服自动化（工单读取、AI 派发）是否正常运行。','“最近读取成功”时间太久说明自动化可能中断，需要联系管理员。','Automation status','Whether support automation (ticket polling, AI dispatch) is running.','An old last-success time means it may have stopped; tell an admin.')],
    ['[data-company-ticket-search]', h('搜索工单','按工单号、主题、状态或关注原因查找。','输入关键词实时筛选。','Search tickets','Find by number, subject, status or attention reason.','Type to filter instantly.')],
    ['[data-company-ticket]', h('打开工单','查看工单内容、AI 草稿、客服修改稿和已发送回复的对比。','核对 AI 草稿是否准确，必要时记录修改。','Open ticket','See the ticket, AI draft, staff edit and sent reply side by side.','Check whether the AI draft is accurate.')],
    ['[data-company-shopify-lookup]', h('查询订单','按输入的完整订单号查询 Shopify。','只读查询，不会修改订单。','Look up order','Looks up the order in Shopify.','Read-only; nothing is changed.')],
    ['[data-company-candidate-new]', h('新建候选','新建一条知识候选草稿。','写清适用机型、已验证的解决方法、来源和仍待确认的事项。','New candidate','Creates a new knowledge draft.','Include model, verified fix, source and open questions.')],
    ['[data-company-candidate-review]', h('核对候选','审核这条知识候选的事实、来源和适用范围。','确认无误后选择审核结论并保存。','Review candidate','Check this candidate’s facts, sources and scope.','Pick a finding and save.')],
    ['[data-company-public-knowledge]', h('核对使用范围','决定这篇文章当前版本能否给 AI 助手使用。','先阅读原文，再勾选确认并保存。','Review eligibility','Decide whether the assistant may use this article version.','Read it, tick the confirmation and save.')],
    ['[data-company-copy-draft], [data-company-copy-sent]', h('复制内容','复制这段回复文本到剪贴板。','方便粘贴到 Zoho 或对比修改。','Copy text','Copies this reply to the clipboard.','Paste into Zoho or compare edits.')],
    ['[data-company-review]', h('保存核对记录','记录你已核对这条内容。','此操作不会给客户发邮件，也不会发布内容。','Save review record','Records that you checked this item.','Does not email customers or publish anything.')],

    // Wiki
    ['.wiki-nav .wiki-nav-link:nth-of-type(1)', h('知识中心概览','知识中心首页，展示常用指南和产品系列入口。','不知道从哪找起时先看这里。','Knowledge overview','The knowledge center home with popular guides and product families.','Start here if you are not sure where to look.')],
    ['.wiki-nav .wiki-nav-link:nth-of-type(2)', h('全部指南','按产品系列和主题浏览全部文章，并可搜索。','输入机型或关键词筛选，例如 Hydra、安装。','All guides','Browse and search every article by product family and topic.','Filter by model or keyword, e.g. Hydra, setup.')],
    ['.wiki-nav .wiki-nav-link:nth-of-type(3)', h('下载中心','驱动、软件、固件和说明书等下载资源。','找到对应机型后下载；发给客户前确认版本。','Downloads','Drivers, software, firmware and manuals.','Find the model and download; confirm the version before sending to customers.')],
    ['.wiki-nav .wiki-nav-link:nth-of-type(4)', h('档案与核对','保留文章原文、来源版本和人工核对记录（仅有权限的同事可见）。','审核资料来源或核对历史版本时使用。','Archive & review','Original content, source versions and review records (authorized staff only).','Use it to audit sources or check past versions.')],
    ['.wiki-back', h('返回列表','回到指南列表。','看完一篇后点这里继续浏览。','Back to guides','Returns to the guide list.','Click after reading to keep browsing.')],
    ['[data-wiki-search]', h('搜索知识库','按标题或产品系列搜索指南。','输入机型或关键词，例如 Hydra、安装、firmware。','Search knowledge','Search guides by title or product family.','Type a model or keyword, e.g. Hydra, setup, firmware.')],
    ['[data-wiki-article]', h('打开文章','阅读这篇产品指南或排查步骤。','点击打开全文。','Open article','Read this guide or troubleshooting article.','Click to open.')],
    ['[data-wiki-retry]', h('重试','知识中心加载失败时重新读取。','点击重试；多次失败请联系管理员。','Retry','Reloads the knowledge center after an error.','Click to retry; tell an admin if it keeps failing.')],
    ['[data-wiki-assistant-new]', h('新对话','清空当前对话，重新开始提问。','换一个问题时使用。','New chat','Clears the conversation to start over.','Use it for a new question.')],
    ['[data-wiki-handoff-open]', h('转人工','AI 回答不了时，提交给客服同事处理。','留下问题和联系方式。','Talk to a person','Hands the question to support staff when the AI can’t help.','Leave the question and contact details.')]
  ].map(([sel, data]) => ({ sel, data }));

  const SCOPE = '#app, #overlay-root';
  const inScope = el => !!(el && el.closest && el.closest(SCOPE));
  const ruleFor = el => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (!node.matches) continue;
      if (node.matches('.help-page-icon')) return null;
      for (const r of RULES) if (node.matches(r.sel)) return { target:node, data:r.data };
      const hh = headerHint(node); if (hh) return { target:node, data:hh };
    }
    return null;
  };
  const currentPage = () => document.querySelector('#app [data-live-page][aria-current="page"]')?.dataset.livePage || '';

  /* Tooltip element (single, reused). */
  let tip, showTimer, activeTarget, pinned = false;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'help-tip'; tip.className = 'help-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }
  function content(data, wide) {
    const l = lang(), d = data[l], labels = l === 'en' ? ['Purpose','How to use'] : ['用途','怎么用'];
    return `<div class="help-tip-title">${esc(d.t)}</div><div class="help-tip-row"><span>${labels[0]}</span><p>${esc(d.p)}</p></div>${d.h ? `<div class="help-tip-row"><span>${labels[1]}</span><p>${esc(d.h)}</p></div>` : ''}`;
  }
  function place(target) {
    const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect(), gap = 8, vw = innerWidth, vh = innerHeight;
    let top = r.bottom + gap, left = r.left + r.width / 2 - t.width / 2;
    if (top + t.height > vh - 8) top = r.top - t.height - gap;          // flip above
    if (top < 8) top = Math.min(vh - t.height - 8, r.bottom + gap);
    left = Math.max(8, Math.min(left, vw - t.width - 8));
    tip.style.top = `${Math.round(top)}px`; tip.style.left = `${Math.round(left)}px`;
  }
  function show(target, data, opts = {}) {
    ensureTip();
    tip.classList.toggle('help-tip-wide', !!opts.wide);
    tip.innerHTML = content(data);
    tip.hidden = false; tip.style.top = '-9999px'; tip.style.left = '-9999px';
    place(target);
    if (activeTarget && activeTarget !== target) activeTarget.removeAttribute('aria-describedby');
    activeTarget = target; target.setAttribute('aria-describedby', 'help-tip');
  }
  function hide() {
    clearTimeout(showTimer); pinned = false;
    if (tip) tip.hidden = true;
    if (activeTarget) { activeTarget.removeAttribute('aria-describedby'); activeTarget = null; }
  }
  const pageData = () => PAGES[currentPage()];

  /* Hover / focus on buttons. */
  document.addEventListener('pointerover', e => {
    if (pinned || e.pointerType === 'touch') return;
    const icon = e.target.closest?.('.help-page-icon');
    if (icon) { const d = pageData(); if (d) { clearTimeout(showTimer); showTimer = setTimeout(() => show(icon, d, { wide:true }), 120); } return; }
    if (!enabled() || !inScope(e.target)) return;
    const hit = ruleFor(e.target);
    if (!hit) return;
    if (hit.target === activeTarget) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => { if (hit.target.isConnected) show(hit.target, hit.data); }, SHOW_DELAY);
  });
  document.addEventListener('pointerout', e => {
    if (pinned) return;
    const from = e.target.closest?.('.help-page-icon') || (activeTarget && activeTarget.contains(e.target) ? activeTarget : null);
    const to = e.relatedTarget;
    if (from && to && from.contains(to)) return;
    clearTimeout(showTimer);
    if (!to || !activeTarget || !activeTarget.contains(to)) hide();
  });
  document.addEventListener('focusin', e => {
    const icon = e.target.closest?.('.help-page-icon');
    if (icon) { const d = pageData(); if (d) show(icon, d, { wide:true }); return; }
    if (!enabled() || !inScope(e.target) || !e.target.matches(':focus-visible')) return;
    const hit = ruleFor(e.target); if (hit) show(hit.target, hit.data);
  });
  document.addEventListener('focusout', () => { if (!pinned) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', () => { if (!pinned) hide(); }, true);
  addEventListener('resize', hide);

  /* Clicks: page icon pins its guide (touch friendly); help toggle switches hints. */
  document.addEventListener('click', e => {
    const icon = e.target.closest?.('.help-page-icon');
    if (icon) {
      e.preventDefault(); e.stopPropagation();
      const d = pageData(); if (!d) return;
      if (pinned && activeTarget === icon) { hide(); return; }
      show(icon, d, { wide:true }); pinned = true; return;
    }
    const toggle = e.target.closest?.('.help-toggle');
    if (toggle) {
      e.preventDefault(); e.stopPropagation();
      setEnabled(!enabled()); hide(); decorate();
      flash(enabled() ? (lang() === 'en' ? 'Button hints on' : '按钮说明已开启') : (lang() === 'en' ? 'Button hints off' : '按钮说明已关闭'));
      return;
    }
    if (pinned && !e.target.closest?.('#help-tip')) hide();
    else if (!pinned) hide();
  }, true);

  function flash(text) {
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = text; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* Inject (?) icons next to page titles and the hint toggle in the top bar.
   * Re-applied after every app render; each insertion is idempotent. */
  function decorate() {
    const page = currentPage();
    const l = lang();
    const heading = page && PAGES[page] && document.querySelector('#app .page-heading h1, #app .mb-heading h1, #app main h1');
    if (heading && !heading.querySelector('.help-page-icon')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'help-page-icon';
      b.setAttribute('aria-label', l === 'en' ? 'About this page' : '这个页面怎么用');
      b.innerHTML = '<span aria-hidden="true">?</span>';
      heading.appendChild(b);
    }
    const bar = document.querySelector('#app .topbar-right');
    if (bar) {
      let t = bar.querySelector('.help-toggle');
      if (!t) {
        t = document.createElement('button');
        t.type = 'button'; t.className = 'help-toggle';
        t.innerHTML = '<span aria-hidden="true">?</span>';
        bar.insertBefore(t, bar.firstChild);
      }
      const on = enabled();
      t.classList.toggle('help-off', !on);
      t.setAttribute('aria-pressed', String(on));
      const label = on ? (l === 'en' ? 'Button hints are on. Click to turn off.' : '按钮说明已开启，点击关闭') : (l === 'en' ? 'Button hints are off. Click to turn on.' : '按钮说明已关闭，点击开启');
      t.setAttribute('aria-label', label); t.title = label;
    }
  }
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; decorate(); if (activeTarget && !activeTarget.isConnected) hide(); }); };
  function start() {
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(schedule).observe(app, { childList:true, subtree:true });
    decorate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.WorkOSHelp = { RULES, PAGES, ruleFor, enabled, setEnabled };
})();
