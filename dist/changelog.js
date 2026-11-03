/*
 * "版本更新" — every production release of Work OS, newest first: iteration number, what changed,
 * who made the change and who deployed it, and the exact frontend/backend commits.
 *
 * HOW TO ADD A RELEASE (people and AI sessions alike): when you pin a new frontend commit in the
 * API repo and deploy it, add one entry at the TOP of RELEASES below in the same PR:
 *   - version: previous version + 0.1 (v1.7 → v1.8). Start a new major only for a big platform change.
 *   - date: ISO time with offset of the backend release commit.
 *   - frontend / backend: the commits that went live (frontend = deploy/frontend-revision.txt).
 *   - author: who wrote the change; deployer: who pressed deploy on Render (Events/Deploys).
 *   - short: one line for the top-right version badge; changes: plain-language lines, Chinese and English.
 * The top-right version badge (feedback.js) reads this same list. The page compares the entries with /build-info.json, so the live version is marked automatically.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  const KC = { zh:'KC', en:'KC' };
  const ELIAN = { zh:'Elian', en:'Elian' };
  const c = (zh, en) => ({ zh, en });

  // Version numbers follow KC's scheme (v1.1, v1.2 … v1.10, v1.11). Keep every release; never trim the list.
  // short: one line for the version badge at the top right; changes: the full notes for this page.
  const RELEASES = [
    { version:'1.22', date:'2026-11-02T19:20:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('成本核算按公司计价规则：零售价格档位、批发价、每个 SKU 的定价输入', 'Cost calculator follows the company pricing rules: retail tiers, wholesale, per-SKU inputs'),
      title:c('公司计价规则进系统', 'Company pricing rules in the system'),
      changes:[
        c('成本核算页新增"公司定价规则"：零售销售费率 17%（逐项列出）、批发 7%、Amazon/eBay 加 10%；MSRP 按产品类型 30% / 40% / 50%，日常调整、小促、大促、清货四档；批发按 MSRP 打折 25% / 30%，单笔超 $5 万再加 2 点、超 $10 万再加 5 点。只有公司管理员能修改。', 'New "Company pricing rules" on the cost page: retail selling rate 17% (itemized), wholesale 7%, Amazon/eBay +10%; MSRP by class 30% / 40% / 50%, everyday, small, major and clearance tiers; wholesale 25% / 30% off MSRP, +2 points over $50k, +5 over $100k. Only company admins can change them.'),
        c('每个 SKU 显示送达成本、MSRP、真实售价、批发起步价和各自的贡献利润；零售五档售价区间；批发五档的我们利润和经销商利润（按真实售价、按 MSRP）。', 'Each SKU shows delivered cost, MSRP, actual price and wholesale base with their contribution margins, the five retail price ranges, and five wholesale tiers with our and the dealer’s profit.'),
        c('MSRP 低于规则、真实售价落在大促档或低于 15% 底线时自动提醒。', 'Alerts when MSRP is below the rule, or the actual price sits in the major-promotion tier or below the 15% floor.'),
        c('可直接保存每个 SKU 的产品类型、到岸价、尾程运费和真实售价；顾客另付的运费会抵扣尾程。', 'Save each SKU’s class, landed cost, last mile and actual price directly; shipping the customer pays offsets the last mile.')] },
    { version:'1.21', date:'2026-11-02T14:40:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('最终发布前，点击 O、KR 名称和 KR 目标值即可直接修改', 'Before publish, click an objective, KR name or KR target to edit it'),
      title:c('O 和 KR 点击即改', 'Click to edit objectives and KRs'),
      changes:[
        c('最终发布前，点击目标名称、KR 名称、KR 目标值都能直接在原处修改（之前 KR 名称点击没有反应，已修复）；回车或点击别处自动保存，Esc 取消。', 'Before final publish, click an objective name, KR name or KR target to edit in place (KR names did not respond before; fixed); Enter or clicking away saves, Esc cancels.'),
        c('可修改的文字鼠标移上去会出现虚线和铅笔图标。', 'Editable text shows a dashed underline and a pencil on hover.')] },
    { version:'1.20', date:'2026-11-02T14:25:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('OKR 改名称和分值不再有“保存 / 取消”按钮：回车或点别处自动保存，Esc 取消', 'OKR inline edits: no Save/Cancel buttons; Enter or clicking away saves, Esc cancels'),
      title:c('OKR 编辑去掉保存按钮', 'OKR edits without a Save button'),
      changes:[c('修改目标名称、KR 名称、目标分值时，不再出现“保存”“取消”按钮；按回车或点击页面其他地方就自动保存，按 Esc 放弃修改。', 'Editing an objective or KR name or objective points no longer shows Save/Cancel; press Enter or click elsewhere to save, Esc to discard.')] },
    { version:'1.19', date:'2026-11-02T12:35:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('给自己新建任务不再填期望成果和验收标准；提交成果只填说明 + 附件（拖入、粘贴、上传）', 'Own tasks: no outcome/criteria; optional details plus attachments (drop, paste, upload)'),
      title:c('简化给自己新建任务', 'Simpler tasks for yourself'),
      changes:[
        c('“新建任务 / 子任务”（给自己的）只需填任务名称、优先级和截止日期；不再要求期望成果和验收标准。', 'New tasks and subitems for yourself need only a name, priority and due date; no expected outcome or acceptance criteria.'),
        c('可选填写详细描述，并可附上文件：拖进来、直接粘贴截图，或点“＋上传”（最多 10 个，每个不超过 8 MB）。附件进入任务的“附件”，任务更新里自动记一条。', 'Optional details and attachments: drop, paste a screenshot or upload (up to 10 files, 8 MB each); they go to the task’s attachments and are noted in its updates.'),
        c('提交成果只需两项：进展说明与成果证据（文字），以及附件（拖入、粘贴截图或上传）；不再填标题和链接，链接可以直接贴在说明里。', 'Submitting a deliverable needs only the progress note and optional attachments (drop, paste or upload); no title or link field.'),
        c('给别人下达任务（Assign Task）仍然要求期望成果、支持和交付标准。', 'Assign Task still requires the expected outcome, support and deliverable standard.')] },
    { version:'1.18', date:'2026-11-02T12:40:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('新增退货维修；OKR 发布前所有分值和 KR 权重可直接改，合计不是 100% 显示红色并提示差多少', 'Returns & repairs; OKR points and KR weights editable in place before publish, red until they total 100%'),
      title:c('退货维修、KR 权重直接修改', 'Returns & repairs, KR weights in place'),
      changes:[
        c('“产品与库存”新增“退货维修”：登记退货（SKU、序列号、客户、订单、原因、收货日期），指定维修人员，填写问题诊断和更换配件，上传收货 / 诊断 / 维修后照片，自动计算维修用时。', 'New Returns & repairs tab: register returns, assign a technician, record diagnosis and parts, upload photos, repair time computed automatically.'),
        c('修好后结案退回库存（默认进入新增的“美国仓·翻新品”库位，自动记一条库存入库流水），也可以报废或寄回客户；退回库存后可设置折扣和售价，标记网站待上架 / 已上架 / 已售出。', 'Restocking adds a goods-in movement (new US refurbished location); scrap or return also supported; refurbished units get a discount, price and listing status.'),
        c('OKR：最终发布前，目标分值和 KR 权重随时可以直接改，不再需要点“确定 / 保存权重”，也不会因为超过 100 被拒绝。', 'OKR: before final publish, objective points and KR weights can be changed any time, without a confirm step or an over-100 refusal.'),
        c('同一目标下 KR 权重合计不是 100% 时，权重显示红色并提示离 100% 还差多少（或超出多少）；正好 100% 显示绿色。合计 100% 后才能评分和最终发布。', 'KR weights show red with how far from 100% they are, green at exactly 100%; scoring and publish need 100%.')] },
    { version:'1.17', date:'2026-11-02T11:40:00-08:00', frontend:'', backend:'', author:ELIAN, deployer:ELIAN,
      short:c('登录后加载时显示工作台的预览骨架，不再闪出登录页和价值观画面', 'While loading after sign-in, show the Work Center outline instead of the sign-in and values page'),
      title:c('登录后加载显示工作台骨架', 'Work Center outline while loading'),
      changes:[c('钉钉登录后、数据加载完成前，页面直接显示个人工作台的轮廓（问候区、进度环、分析卡片、待办数量）并带加载动画，不再先出现登录页和四大价值观；加载完成后无缝切换到真实内容。', 'After DingTalk sign-in, until data arrives, the page shows the Work Center outline (greeting, rings, analysis, counters) with a loading shimmer instead of the sign-in page and core values, then switches to the real content.')] },
    { version:'1.16', date:'2026-11-02T12:00:00-08:00', frontend:'776c3f8', backend:'', author:KC, deployer:c('Elian（随 v1.17 一起发布）', 'Elian (shipped with v1.17)'),
      short:c('工作邮箱必填；管理员填写后本人不能改；下达任务和催办同时发钉钉和邮件', 'Work email required and admin-locked; assignments and reminders go to DingTalk and email'),
      title:c('工作邮箱与钉钉 + 邮件通知', 'Work email, DingTalk + email notifications'),
      changes:[
        c('每个人必须填写工作邮箱：没有邮箱的人登录后会先被要求填写。', 'Everyone must have a work email; people without one are asked on sign-in.'),
        c('管理员可以在“组织与权限”里直接填写每个人的工作邮箱；管理员填写后本人不能修改（个人设置里显示为锁定）。', 'Admins can fill in each person’s work email in Organization & permissions; once set by an admin it is locked for the person.'),
        c('下达任务、催办、一键催办、到期提醒和 OKR 提醒，在站内通知之外同时发钉钉工作通知和邮件（服务器配置好钉钉 AgentId 和发信邮箱后生效）。', 'Assignments, reminders, due-date alerts and OKR reminders also go out by DingTalk and email once those channels are configured on the server.')] },
    { version:'1.15', date:'2026-11-02T11:08:00-08:00', frontend:'ce18f48', backend:'96da52f', author:KC, deployer:KC,
      short:c('下达任务可以附上截图和文件：粘贴、拖入或点“上传”', 'Assign Task takes screenshots and files: paste, drop or upload'),
      title:c('下达任务带附件', 'Attachments when assigning a task'),
      changes:[
        c('下达任务弹窗新增“附件”：直接粘贴截图（⌘/Ctrl+V）、把文件拖进弹窗，或点“＋上传”；每个文件不超过 8 MB，最多 10 个，下达前可移除。', 'Assign Task now takes attachments: paste screenshots, drop files or click Upload; up to 10 files of 8 MB each, removable before sending.'),
        c('下达后附件出现在这项任务的“附件”里，并在任务更新里自动记一条“下达任务时附上 N 个附件”。', 'After assigning, the files appear in the task’s attachments and an update notes them.')] },
    { version:'1.14', date:'2026-11-02T11:05:00-08:00', frontend:'27609aa', backend:'', author:KC, deployer:KC,
      short:c('工作台新增“下达任务给同事”；下达任务弹窗更宽、输入框随内容变高、必填项标红色 *', 'Assign Task on the Work Center; wider assign dialog, growing text boxes, red * on required fields'),
      title:c('下达任务入口与弹窗改进', 'Assign Task entry and dialog'),
      changes:[
        c('个人工作台顶部：“新建个人任务”（给自己）和“下达任务给同事”（给别人，你是验收人）并排放在一起。', 'Work Center: “New task for me” and “Assign Task” sit side by side.'),
        c('下达任务弹窗加宽；描述、支持、交付标准输入框随文字自动变高，超过约六成屏幕高度后可滚动查看。', 'The Assign Task dialog is wider; text boxes grow as you type and scroll past about 60% of the screen.'),
        c('所有弹窗里的必填项在名称后显示红色 *。', 'Required fields in dialogs show a red *.')] },
    { version:'1.13', date:'2026-11-02T10:50:00-08:00', frontend:'', backend:'', author:ELIAN, deployer:ELIAN,
      short:c('新建任务的期望成果和验收标准输入框加高到 3 行；手机上新建任务和选日期更好用', 'Taller outcome and criteria boxes (3 lines); new task and date picking fit phones'),
      title:c('新建任务输入框加高、手机适配', 'Taller new-task boxes, phone layout'),
      changes:[
        c('新建任务和子任务时，“期望成果”和“验收标准”改成可以看到 3 行的多行输入框；验收标准每行一条，也可以用；分开。', 'When creating a task or subitem, the expected outcome and acceptance criteria boxes show 3 lines; one criterion per line, or separate with ;.'),
        c('手机上新建任务的每个输入框都在屏幕内、一行一个，日期和优先级更容易点；输入时不会自动放大页面。', 'On phones every new-task field fits the screen on its own line, with larger date and priority controls; typing no longer zooms the page.')] },
    { version:'1.12', date:'2026-11-02T10:31:00-08:00', frontend:'0958755', backend:'0376dcc', author:KC, deployer:c('Elian（随 v1.13 一起发布）', 'Elian (shipped with v1.13)'),
      short:c('产品管理和库存合并为“产品与库存”一个页面；新增批量入库 / 到港入仓', 'Products and stock on one page; batch goods in'),
      title:c('产品与库存合并、批量入库', 'Products & stock on one page, batch goods in'),
      changes:[
        c('“产品管理”和“库存管理”合并为“产品与库存”，页面顶部切换“产品资料”和“库存”两个标签；各自的权限不变，没有权限的标签不显示。', 'Product catalog and inventory are now one page, “Products & stock”, with Catalog and Stock tabs; each tab keeps its own access rule.'),
        c('产品资料里的海外仓、在途、工厂库存改为直接读取库存系统的实际数量。', 'Stock columns in the catalog now show the real numbers from inventory.'),
        c('库存页新增“批量入库”：从 Excel 复制 SKU 和数量两列粘贴即可，先预览入库后的数量；可选“新货入库”或“到港入仓（从在途转入）”，所有行一起成功或一起不入。', 'New “Batch goods in”: paste SKU and quantity from Excel, preview the result, choose new goods or arrived-from-transit; all lines succeed or none.')] },
    { version:'1.11', date:'2026-11-02T02:25:00-08:00', frontend:'b5c3791', backend:'94172b2', author:ELIAN, deployer:ELIAN,
      short:c('点任务名打开详情，详情可直接修改；新建任务分“期望成果”和“验收标准”；版本更新页保留全部记录', 'Task name opens details, edit in place; separate outcome and criteria; full release notes'),
      title:c('任务详情可直接修改、版本更新页', 'Editable task details, release notes page'),
      changes:[
        c('点任务名称打开任务详情（改名仍在行右侧“…”菜单里）。', 'Clicking a task name opens its details (rename stays in the row’s “…” menu).'),
        c('任务详情里点“编辑详情”，或直接点标题、期望成果、验收标准，就能修改并保存。', 'In task details, click “Edit details” or the title, expected outcome or criteria to edit and save.'),
        c('新建任务和子任务时，“期望成果”和“验收标准”分成两个输入框，验收标准可以写多条，用；分开。', 'New tasks and subitems ask for the expected outcome and acceptance criteria separately; separate several criteria with ;.'),
        c('“其他”分组下新增“版本更新”：每个版本的版本号、改了什么、谁修改、谁发布和提交号，当前线上版本自动标出；右上角版本号显示全部记录，点一下进入此页。', 'New “Release notes” under Other with every version, who changed and deployed it and the commits; the live one is marked. The top-right version badge lists every release and opens the page.')] },
    { version:'1.10', date:'2026-11-02T01:51:00-08:00', frontend:'5131df5', backend:'97142ac', author:KC, deployer:c('Elian（随 v1.11 一起发布）', 'Elian (shipped with v1.11)'),
      short:c('上级和项目管理员可以修改下属 / 项目任务的截止时间；增加版本号与更新说明', 'Managers and project admins can change due dates; version notes'),
      title:c('上级可改截止时间、增加版本号', 'Managers change due dates, version badge'),
      changes:[
        c('任务负责人的上级、项目管理员和公司管理员可以修改任务的截止时间，包括在“任务分析”里查看下属任务时。', 'Anyone above the owner, the project admin and company admins can move a task’s due date, including while viewing a report’s tasks.'),
        c('右上角显示当前版本号，鼠标放上去可以看更新说明。', 'The current version shows at the top right with release notes on hover.')] },
    { version:'1.9', date:'2026-11-02T01:28:00-08:00', frontend:'1d848aa', backend:'5eedeeb', author:KC, deployer:KC,
      short:c('个人任务只显示自己的任务；分组可删除；任务分析里查看下属任务；催办与一键催办', 'Personal task list; delete groups; view reports’ tasks; reminders'),
      title:c('个人任务中心、自定义分组、催办', 'Personal Task hub, own groups, reminders'),
      changes:[
        c('任务中心改为“个人任务”，只显示自己的任务；可以自己新增、改名、删除分组，删除分组时任务会移到其他分组。', 'The Task hub becomes “My tasks” with only your own tasks; add, rename and delete your groups (tasks move when a group is deleted).'),
        c('上级可以从“任务分析”只读打开下属的任务，按 Esc 返回。', 'Managers open a report’s tasks read-only from Task analysis; Esc returns.'),
        c('新增“催办”：可以对单个任务催办，也可以一键催办 3 天内到期的任务。', 'Reminders: nudge one task, or all tasks due within 3 days in one click.')] },
    { version:'1.8', date:'2026-11-02T00:50:00-08:00', frontend:'612588a', backend:'841b46b', author:KC, deployer:KC,
      short:c('公司目标的 KR 权重可保存；每位负责人固定头像颜色', 'Company KR weights save; per-person avatar colours'),
      title:c('公司 OKR 可编辑、负责人头像配色', 'Editable company OKR, owner avatar colours'),
      changes:[
        c('公司 OKR 的负责人和管理员可以编辑公司目标，包括 KR 权重。', 'The company OKR owner and admins can edit company objectives, including KR weights.'),
        c('每位负责人的头像有固定的颜色，看板上更容易区分。', 'Each owner’s avatar has its own colour.')] },
    { version:'1.7', date:'2026-11-02T00:11:00-08:00', frontend:'9f51f78', backend:'1bdc3d8', author:KC, deployer:KC,
      short:c('产品资料和成本数据可导入；KR 权重自己填；Bug 与建议；任务详情可编辑', 'Product & cost import; KR weights; Bug & ideas; editable task details'),
      title:c('产品 CSV 导入、KR 权重手填、Bug 与建议、任务详情可编辑', 'Product CSV import, KR weights by hand, Bug & ideas, editable task details'),
      changes:[
        c('产品管理和成本核算支持 CSV 导入（带模板，流程和库存管理一样），导入后用服务器数据代替示例数据；导航分组改名为“产品+供应链”，管理员能看到产品区；价格表只对有完整价格构成权限的人和管理员开放。', 'Product catalog and cost calculator import CSV with templates; server data replaces samples; section renamed “Product & supply chain”; price tables limited to full price access and admins.'),
        c('OKR：每个 KR 的权重自己填写，同一目标下合计必须正好 100%。', 'OKR: type every KR weight yourself; KRs of an objective total exactly 100%.'),
        c('右上角新增红色“Bug 与建议”按钮，可粘贴、拖入或上传截图；管理员在“Bug 与建议”页处理。', 'Red “Bug & ideas” button with screenshots; admins handle notes on the Bug & ideas page.'),
        c('任务详情可以直接修改名称、状态、优先级、截止日、负责人、成果和验收标准；提交证据后验收标准固定。', 'Task details edit name, status, priority, due date, owner, outcome and criteria in place; criteria lock once evidence is submitted.')] },
    { version:'1.6', date:'2026-11-01T22:51:00-08:00', frontend:'52b3a8e', backend:'db4022b', author:KC, deployer:KC,
      short:c('直属下属和间接下属分开显示', 'Direct and indirect reports shown separately'),
      title:c('直属与间接下属分开显示', 'Direct and indirect reports shown separately'),
      changes:[c('团队 OKR 和任务分析里，直属下属和间接下属分开显示；间接下属会标出他向谁汇报。', 'Team OKRs and Task analysis list direct and indirect reports separately; indirect reports show who they report to.')] },
    { version:'1.5', date:'2026-11-01T22:30:00-08:00', frontend:'66af581', backend:'d275e0f', author:KC, deployer:KC,
      short:c('任务更新可编辑、删除，并显示几天前', 'Edit and delete updates; “days ago” labels'),
      title:c('任务进展可编辑、删除', 'Editable task updates'),
      changes:[c('作者可以修改或删除自己发的任务进展，原文保留在审计记录里；每条进展显示发布了多久。', 'Authors can edit or delete their own task update, with the original kept in the audit log; each update shows how long ago it was posted.')] },
    { version:'1.4', date:'2026-11-01T21:48:00-08:00', frontend:'1a44410', backend:'0d7ae8c', author:KC, deployer:c('KC（与 v1.5 一起发布）', 'KC (shipped with v1.5)'),
      short:c('库存管理（WMS）与 ERP 权限上线；项目只有成员可见', 'Inventory (WMS) and ERP permissions; private projects'),
      title:c('库存管理与 ERP 权限上线、项目权限', 'Inventory and ERP permissions, private projects'),
      changes:[
        c('库存管理（WMS）上线：新建 SKU，管理员用 CSV 导入期初库存，盘点调整由提交人的上级确认；ERP 权限页与服务器同步。', 'Inventory (WMS) goes live: new SKUs, opening stock CSV import for admins, count adjustments confirmed by the submitter’s manager; ERP permissions follow the server.'),
        c('项目只对项目管理员、项目成员和公司管理员可见。', 'Projects are visible only to the project admin, project members and company admins.')] },
    { version:'1.3', date:'2026-11-01T19:04:00-08:00', frontend:'228bb51', backend:'7751f2e', author:KC, deployer:ELIAN,
      short:c('项目看板分组、按人筛选、自动分析、项目管理员与邀请成员', 'Project boards, person filter, auto analysis, project admins'),
      title:c('项目管理、迁移到公司环境', 'Projects, move to the company environment'),
      changes:[
        c('项目：看板分组、每个视图都能按人筛选、自动分析、项目管理员和邀请成员；项目表格与任务中心同一风格。', 'Projects: board grouping, person filter on every view, automatic analysis, project admin and invites; project table in the Task hub style.'),
        c('新建任务和子任务默认给自己，给别人派活用“Assign Task”；跨部门显示负责人中英文名；深浅色主题下文字都清晰。', 'New tasks are your own and Assign Task gives work to others; owner names across departments; readable text in light and dark themes.'),
        c('系统迁移到公司的 Render 工作空间和数据库，正式入口为 craftos.app；73 张业务表逐表核对，记录数量一致。这是公司环境上的第一个功能版本。', 'Moved to the company Render workspace and database at craftos.app; all 73 business tables matched row for row. First feature release on the company environment.')] },
    { version:'1.2', date:'2026-11-01T13:29:00-08:00', frontend:'8bac5bb', backend:'221910f', author:KC, deployer:c('旧环境（迁移前）', 'Old environment (before the move)'),
      short:c('企业文化登录页；成员按工作地点分组；项目描述可编辑', 'Culture sign-in page; members by location; editable project descriptions'),
      title:c('企业文化登录页、组织按地点分组', 'Culture sign-in page, members by location'),
      changes:[
        c('新登录页介绍公司和 OneLaser 文化，新增 /culture.html 文化页。', 'New sign-in page with the company story and OneLaser culture, plus /culture.html.'),
        c('组织表按工作地点分组；项目描述和里程碑可以编辑。', 'Org table grouped by location; editable project description and milestones.'),
        c('OKR 发布规则：同一目标下 KR 合计 100%，终版发布后负责人锁定，上级修改会通知，发布时 KR 自动生成任务。', 'OKR rules: KRs total 100% per objective; on final publish the owner is locked, leader changes notify, KRs become tasks.')] },
    { version:'1.1', date:'2026-10-31T23:02:00-08:00', frontend:'', backend:'', author:KC, deployer:c('旧环境（迁移前）', 'Old environment (before the move)'),
      short:c('任务表格样式统一，夜间模式文字更清楚', 'Task table styling; dark-mode readability'),
      title:c('任务表格样式统一、夜间模式', 'Task table styling, dark mode'),
      changes:[c('任务表格样式统一，夜间模式下文字更清楚。', 'Consistent task table styling; clearer text in dark mode.')] },
  ];

  let ctx = null, live = undefined, loading = false;
  const lang = () => (ctx?.lang?.() || window.WorkI18n?.lang) === 'en' ? 'en' : 'zh';
  const t = v => v?.[lang()] ?? '';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  function configure(next) { ctx = next; }
  async function loadLive() {
    if (loading) return; loading = true;
    try { const r = await fetch('/build-info.json', { cache:'no-store' }); live = r.ok ? await r.json() : null; } catch { live = null; }
    finally { loading = false; ctx?.rerender?.(); }
  }
  const short = h => String(h || '').slice(0, 7);
  const fmt = iso => { try { return new Date(iso).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return iso; } };
  const commit = (repo, h) => h ? `<a href="https://github.com/Yonge6/${repo}/commit/${esc(h)}" target="_blank" rel="noopener"><code>${esc(short(h))}</code></a>` : `<code>—</code>`;

  function page() {
    if (live === undefined) loadLive();
    const liveFront = short(live?.frontendCommit);
    let liveIdx = liveFront ? RELEASES.findIndex(r => r.frontend && short(r.frontend) === liveFront) : -1;
    // The newest entry cannot name its own commit; if the live build matches no older entry, it is that one.
    if (liveIdx < 0 && liveFront && !RELEASES[0].frontend) liveIdx = 0;
    const current = liveIdx >= 0 ? RELEASES[liveIdx] : null;
    const banner = live === undefined ? `<div class="cl-now">${icon('spinner')} ${tr('正在读取线上版本…', 'Reading the live version…')}</div>`
      : current ? `<div class="cl-now ok">${icon('check-circle')} ${tr('当前线上版本', 'Live now')}: <b>v${esc(current.version)}</b> · ${tr('前端', 'Frontend')} <code>${esc(liveFront)}</code></div>`
      : `<div class="cl-now">${icon('info')} ${tr('线上前端', 'Live frontend')} <code>${esc(liveFront || '—')}</code>${liveFront ? tr('，比下面最新一条记录更新，日志稍后补上。', ' is newer than the latest entry below; notes will follow.') : ''}</div>`;
    const items = RELEASES.map((r, i) => {
      const tag = i === liveIdx ? `<span class="cl-tag live">${tr('线上', 'Live')}</span>` : r.status === 'pending' && (liveIdx < 0 || i < liveIdx) ? `<span class="cl-tag">${tr('待发布', 'Pending')}</span>` : '';
      return `<article class="cl-item ${i === liveIdx ? 'is-live' : ''}">
        <header><span class="cl-ver">v${esc(r.version)}</span>${tag}<h2>${esc(t(r.title))}</h2><time datetime="${esc(r.date)}">${esc(fmt(r.date))}</time></header>
        <ul>${r.changes.map(x => `<li>${esc(t(x))}</li>`).join('')}</ul>
        <dl class="cl-meta">
          <div><dt>${icon('user')} ${tr('修改', 'Changed by')}</dt><dd>${esc(t(r.author))}</dd></div>
          <div><dt>${icon('rocket-launch')} ${tr('发布', 'Deployed by')}</dt><dd>${r.deployer ? esc(t(r.deployer)) : i === liveIdx ? tr('已上线（发布人见 Render 部署记录）', 'Live (see Render deploys for who)') : tr('尚未发布', 'Not yet deployed')}</dd></div>
          <div><dt>${icon('git-commit')} ${tr('提交号', 'Commits')}</dt><dd>${tr('前端', 'Frontend')} ${commit('onelaser-workos', r.frontend)} · ${tr('后端', 'Backend')} ${commit('onelaser-workos-api', r.backend)}</dd></div>
        </dl></article>`;
    }).join('');
    return `<div class="cl-page"><div class="page-heading"><div><div class="eyebrow">WORK OS · RELEASES</div><h1>${tr('版本更新', 'Release notes')}</h1><p>${tr('每次上线的迭代号、改了什么、谁修改、谁发布。最新的在最上面。', 'Every release: its number, what changed, who changed it and who deployed it. Newest first.')}</p></div></div>
      ${banner}<div class="cl-list">${items}</div></div>`;
  }

  window.WorkOSChangelog = { configure, page, RELEASES, text:t, reset() { live = undefined; } };
})();
