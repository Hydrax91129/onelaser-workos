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
    { version:'1.38', date:'2026-11-04T14:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('人事档案分美国 / 中国 / 海外其他地区三个标签；美国区只有主管理员能看，可以导出给 CPA；中国和海外按人授权', 'HR records split into US / China / other countries; the US is owner-only with an export for the CPA; China and other countries are granted per person'),
      title:c('人事档案按地区管理', 'HR records by region'),
      changes:[c('人事档案分成“美国”“中国”“海外其他地区”三个标签，每个员工属于一个地区。主管理员在员工档案顶部设置地区，还没设置的人在“未分配”里。', 'HR records now have United States, China and Other countries tabs, and each person belongs to one region. The company owner sets it at the top of the record; people without one are under Not assigned.'),
        c('美国区只有主管理员能看、能改，不能授权给别人。中国和海外其他地区由主管理员在“组织与权限”的“人事档案”一栏逐人授权：只读可以看这个地区的全部资料，可管理还能修改、上传和删除。原来部署配置里的人事名单不再自动有权限，需要重新授权。', 'The US region is for the company owner only and cannot be granted. China and other countries are granted per person in Organization & permissions (HR records column): read-only sees everything in that region, manage can also edit, upload and delete. The old deployment HR list no longer opens anything; grant those people again.'),
        c('美国按 Rippling 的员工入职资料：法定姓名、出生日期、SSN、住址、I-9、W-4（2020 及以后版本）、加州 DE 4 和其他州州税表、工资直存（最多三个账户按比例分配）、受抚养人、医疗 / 牙科 / 视力 / 401(k) / HSA / FSA / 人寿保险受益人、EEO 自愿申报（单独保存），以及公司填写的用工类型、FLSA、时薪或年薪、发薪周期、提成、奖金和 PTO。', 'US follows Rippling’s onboarding data: legal name, date of birth, SSN, address, I-9, W-4 (2020+), California DE 4 and other state forms, direct deposit (up to three accounts with splits), dependents, medical / dental / vision / 401(k) / HSA / FSA / life insurance beneficiaries, voluntary EEO (kept separately), plus employment type, FLSA, rate, pay frequency, commission, bonus and PTO.'),
        c('美国区新增“导出给 CPA”：每位在职美国员工一行（CSV，可用 Excel 打开），最后一列写明上次导出后改过哪些字段。只有主管理员能用，每次导出都有记录。文件含 SSN，请用加密方式发送。', 'New “Export for the CPA” on the US tab: one row per active US employee (CSV, opens in Excel), with a last column listing what changed since the previous export. Owner only; every export is logged. The file contains SSNs, so send it encrypted.'),
        c('中国：户籍地和户口性质、现住址、劳动合同类型、社保五险个人和单位比例、公积金、个税专项附加扣除、学历、婚育情况。海外：国家、雇员 / 承包商 / EOR、当地税号、币种。', 'China: hukou, current address, contract type, the five social insurance rates (employee and employer), housing fund, special additional deductions, education, marital status and children. Other countries: country, employee / contractor / EOR, local tax ID, currency.'),
        c('有权限的人打开档案直接看到完整资料，不再遮盖；SSN、身份证号、银行账号、薪资和附件在数据库里加密保存。', 'People with access see every value in full, with no masking; SSNs, ID numbers, bank accounts, salary and attachments are encrypted in the database.'),
        c('附件按类型分类（offer letter、员工手册确认、签字的 W-4 / DE 4、I-9、直存授权、简历、劳动合同等）。新的上传框同时支持粘贴截图、拖进来、点击选择和“上传”按钮。', 'Attachments are sorted by type (offer letter, handbook acknowledgment, signed W-4 / DE 4, I-9, direct deposit form, resume, contract…). The new upload box takes a pasted screenshot, a dragged file, a click or the Upload button.'),
        c('婚姻、子女、受抚养人和 EEO 资料只用于 payroll、福利和合规统计，不能用于聘用、晋升或解雇等决定。', 'Marital status, children, dependents and EEO answers are for payroll, benefits and compliance reporting only, never for hiring, promotion or termination decisions.')] },
    { version:'1.37', date:'2026-11-04T12:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('每个人可以再设一位“第二领导”（虚线汇报），权限和第一领导相同；组织架构图上用虚线连接', 'Each person can have a second leader (dotted line) with the same rights as the first leader; the org chart links them with a dashed line'),
      title:c('第二领导（虚线汇报）', 'Second leader (dotted line)'),
      changes:[c('“组织与权限”成员列表新增“第二领导（虚线汇报）”一栏。第一领导不方便时（例如时差），由第二领导日常查看和指导。', 'Organization & permissions has a new “Second leader (dotted line)” column, for when the first leader is unavailable (for example across time zones).'),
        c('第二领导对这个人的权限和第一领导完全相同：查看 OKR、任务、项目和团队报表，验收任务、给 OKR 领导评分、调整截止时间、审批，也包括 TA 下面的团队。新任务默认验收人仍是第一领导，可以手动改成第二领导。薪资、证件等 HR 敏感信息仍只给 HR。', 'The second leader has exactly the same rights over the person as the first leader: OKRs, tasks, projects and team reports, reviewing tasks, OKR leader scores, due dates and approvals, including the person’s own team. New tasks still default to the first leader as reviewer and can be switched to the second leader. Salary, ID and other sensitive HR data stay with HR.'),
        c('领导（第一或第二）现在也能看到下属所在的项目（只读），并能给其他部门下属的 OKR 打领导分。', 'Leaders (first or second) now also see the projects their reports are in (read-only) and can give leader scores on OKRs of reports in other departments.'),
        c('组织架构图用虚线曲线把第二领导和员工连起来，图上方有“实线 = 第一领导，虚线 = 第二领导”的说明；员工卡片上也写着第二领导是谁，下属收起时第二领导卡片上会列出被收起的虚线下属。', 'The org chart joins the second leader and the person with a dashed curve and shows “Solid = first leader, Dashed = second leader”. The person’s card names the second leader, and when a branch is collapsed the second leader’s card lists the hidden dotted-line reports.')] },
    { version:'1.36', date:'2026-11-04T12:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('个人任务支持批量编辑和删除：勾选任务后底部出现操作栏，删除后 10 秒内可撤销', 'My tasks: bulk edit and delete — tick tasks and use the bar at the bottom; deletes can be undone for 10 seconds'),
      title:c('任务批量编辑与删除', 'Bulk edit and delete tasks'),
      changes:[c('勾选一项或多项任务后，屏幕底部固定出现批量操作栏（列表很长时也看得到）：设置状态、移至分组、设置优先级、调整负责人（负责人可用）、截止日期、删除、清除。每个分组标题旁新增“全选本组”。', 'Tick one or more tasks and a bulk bar stays at the bottom of the screen, even on a long list: set status, move to group, set priority, set owner (managers), due date, delete and clear. Each group header has Select all.'),
        c('删除后显示“已删除 N 项 · 撤销”，10 秒内点撤销即可恢复。删除的任务不再出现在任何列表、报表和排行榜里。', 'After deleting, “Deleted N items · Undo” shows for 10 seconds. Deleted tasks leave every list, report and leaderboard.'),
        c('只能删除自己创建或下达的任务，别人下达给你的任务请让下达人或管理员删除；来自 OKR 的任务请在 OKR 里删除对应 KR。无权操作的任务会被跳过并说明原因（例如“3 项无权删除，已跳过”），其余照常完成。', 'You can delete tasks you created or assigned; ask whoever gave you a task, or an admin, to delete it. Tasks from an OKR are removed by deleting their key result. Rows you may not change are skipped with the reason (e.g. “3 skipped: not yours to delete”); the rest go through.'),
        c('批量设置状态不提供“完成”：完成仍需逐项填写成果。', 'Bulk status does not offer Done: completing still needs a written result per task.')] },
    { version:'1.35', date:'2026-11-04T12:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('完成即上榜；完成后 24 小时内由验收人或下达人评分，没人评分则由 AI 自动评分', 'Done counts right away; the reviewer or assigner scores within 24 hours, otherwise the AI does'),
      title:c('排行榜按完成计数，评分改为先人工、后 AI', 'Leaderboard counts completions; people score first, AI after 24 hours'),
      changes:[c('负责人点“完成”并写好结果后，任务马上计入“完成冠军”，不用再等 AI 评分。', 'As soon as the owner marks a task done with a written result, it counts towards Most completed — no waiting for an AI score.'),
        c('完成后 24 小时内，验收人、下达人、负责人的直属上级或管理员可以在任务讨论里给 0–10 分，这就是最终分；24 小时后仍没人评分，系统自动让 AI 评分。每项成果只有一个最终分，保存后不能修改。', 'Within 24 hours of completion the reviewer, the assigner, the owner’s manager or an administrator can give a 0–10 score in the task thread, and that is the final score. If nobody scores it within 24 hours, the AI scores it automatically. Each result has one final score, which cannot be changed once saved.'),
        c('“质量之星”按最终分取平均；任务、排行榜和讨论里都会标明是“人工评分”还是“AI 评分”。', 'Quality stars average the final scores; tasks, the leaderboard and the thread show whether a score came from a person or from AI.'),
        c('之前因为 AI 没配置或评分失败而一直没有分数的完成任务，在配置好 AI 评分模型后会被自动补评分。', 'Earlier completions left without a score because AI scoring was not configured or failed are scored automatically once a scoring model is configured.')] },
    { version:'1.34', date:'2026-11-04T12:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('夹带英文缩写或产品名的中文 OKR 也会自动翻译', 'Chinese OKR text with English abbreviations or product names is now translated'),
      title:c('中英混写的 OKR 也能自动翻译', 'Mixed Chinese–English OKR text is translated'),
      changes:[c('像“WMS+PIM+SCM+COST 四套供应链管理支撑系统搭建”“12月产品发布GTM 准备完毕”这样夹带英文缩写或产品名的中文内容，切换到英文界面时也会自动翻译，不再保留中文原文。', 'Chinese text that contains English abbreviations or product names, such as "WMS+PIM+SCM+COST 四套供应链管理支撑系统搭建", is now translated in the English interface instead of staying in Chinese.'),
        c('只有明确写成“中文 + 英文”两段的内容（如“销售经理 Sales Manager”“质量追踪 / Quality tracking”）才视为已双语、保持原样。', 'Only text clearly written as two parts, one Chinese and one English (e.g. "销售经理 Sales Manager", "质量追踪 / Quality tracking"), is treated as already bilingual and shown as written.')] },
    { version:'1.33', date:'2026-11-04T00:53:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('OKR 输入的内容自动保存，刷新或崩溃也不会丢；AI 草稿直接保存，只需最后“最终发布”一次', 'OKR edits save automatically and survive a reload or crash; AI drafts are saved at once, and Publish is the only confirmation'),
      title:c('OKR 自动保存，只需确认一次', 'OKR autosave, one confirmation'),
      changes:[c('目标标题、KR 标题、目标值、目标分值、KR 权重和目标描述都会自动保存：停止输入约 0.8 秒或点到别处就保存，不用按回车或“保存”。页面上方显示“保存中… / 已保存 / 保存失败（点击重试）”，断网时会在网络恢复后自动重试。', 'Objective titles, KR titles, targets, objective points, KR weights and objective descriptions save on their own about 0.8 seconds after you stop typing or when you click elsewhere; no Enter or Save. A status line shows Saving… / Saved / Save failed (click to retry), and failed saves retry when the network returns.'),
        c('还没保存到服务器的内容（AI 输入框、正在修改的字段、新目标和新 KR 表单）会先存在本机浏览器里；刷新或页面崩溃后重新打开会自动恢复并继续保存，并提示“已恢复未保存的内容”。', 'Anything not yet confirmed by the server (the AI text box, fields being edited, new objective and KR forms) is kept in this browser; after a reload or crash it comes back, keeps saving, and says “Restored your unsaved changes”.'),
        c('“AI 帮我写 OKR”生成后直接保存为未发布的草稿，出现在下面的 OKR 列表里，不再需要逐个勾选、再点“添加选中的”。不需要的目标或 KR 点 × 删除，几秒内可以“撤销”，不再弹确认框。', '“Draft my OKR with AI” now saves the result straight away as unpublished draft objectives and KRs in the normal list; no ticking each item and no “Add selected”. Remove what you don’t want with ×, with a few seconds to undo instead of a confirm dialog.'),
        c('“最终发布”仍是唯一的确认：发布前会先把所有未保存的修改保存好；目标合计 100 分、KR 权重合计 100% 的检查不变。', 'Publish stays the only confirmation: it first saves anything still pending; the 100-point and 100% KR weight checks are unchanged.')] },
    { version:'1.32', date:'2026-11-04T00:30:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('成本、价格、库存、经销商数据只按授权开放；只有公司负责人能修改功能权限', 'Costs, prices, stock and dealer data follow grants only; only the company owner changes feature access'),
      title:c('敏感数据只按授权开放', 'Sensitive data follows grants only'),
      changes:[c('在系统里勾选的管理员不再自动看到产品成本、计价、库存管理、维修价格和经销商数据，需要单独授权；部署配置里的公司负责人不受影响。', 'Admins ticked in the app no longer see product costs, pricing, stock management, repair prices or dealer data automatically; they need grants. The company owner set in deployment config is unaffected.'),
        c('功能权限（产品、成本、价格、库存、经销商）只有公司负责人可以授予或修改，包括邀请新成员时附带的权限；任何人都不能修改自己的权限。', 'Only the company owner can grant or change feature access (products, costs, prices, stock, dealers), including grants attached to invites; nobody can change their own.')] },
    { version:'1.31', date:'2026-11-03T22:30:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('OKR 新增“AI 帮我写 OKR”；目标分值改为自由填写，合计不是 100 分会标红', 'OKR: draft your OKR with AI; objective points are typed freely and show red until they total 100'),
      title:c('AI 帮我写 OKR，目标分值自由填写', 'Draft OKRs with AI; free objective points'),
      changes:[c('“我的 OKR”页顶部新增“AI 帮我写 OKR”：写几句这个月想做的事，AI 会参考公司目标整理出目标、关键结果、目标值、分值和权重。草稿可以勾选、改字，点“添加选中的”之前不会保存任何内容。', 'My OKRs has a new “Draft my OKR with AI” box: describe the month in a few sentences and AI drafts objectives, key results, targets, points and weights, aligned to the company objectives. Tick and edit the draft; nothing is saved until you click Add selected.'),
        c('改一个目标的分值，其他目标不再被自动按比例调整；目标列表下方显示分值合计，正好 100 分为绿色，否则标红并显示还差或超出多少，合计 100 分后才能最终发布。KR 权重也不再自动调整。', 'Changing one objective’s points no longer rescales the others. A total under the list is green at exactly 100 and red otherwise, showing how far off; final publish needs exactly 100. KR weights are no longer rescaled either.'),
        c('翻译失败时服务器会记录 AI 服务返回的原因，方便排查。', 'When a translation fails, the server now logs the reason the AI service gave.')] },
    { version:'1.30', date:'2026-11-04T00:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('邀请成员时可以设为“工厂对接人”：对方只能使用产品质量追踪，也不用参加 IT 季度账号确认', 'Invite someone as a factory contact: they only use product quality tracking and skip the IT quarterly account check'),
      title:c('工厂对接人用邀请加入', 'Factory contacts join by invite'),
      changes:[c('“组织与权限 → 邀请成员”新增“工厂对接人”选项（东莞工厂 / 济南工厂）：对方接受邀请后只能使用“产品质量追踪”，只看到提交给本工厂的问题，不需要放进钉钉。', 'Organization & permissions → Invite member has a new Factory contact option (Dongguan / Jinan): after accepting, the person only uses product quality tracking and sees only issues sent to their factory — no DingTalk needed.'),
        c('已加入的成员也可以在成员列表的“角色”一栏改为工厂对接人或改回公司成员，名字旁边会显示所属工厂。', 'Existing members can be switched to or from factory contact in the Role column of the member list; their factory shows next to the name.'),
        c('工厂对接人不参加 IT 季度账号确认，不会收到提醒，也不计入完成率。', 'Factory contacts take no part in the IT quarterly account check: no reminders, and they do not count towards its completion rate.')] },
    { version:'1.29', date:'2026-11-03T13:47:22-08:00', frontend:'0c90f372f186a92c4d3457c01ad401a80d1fba82', backend:'23c5d1dbc83c47b2055b1f7334c31e3214f255d8', author:KC, deployer:KC,
      short:c('任务、项目和消息也会跟随界面语言自动翻译，和 OKR 一样', 'Tasks, projects and inbox messages now follow the interface language, like OKRs'),
      title:c('任务、项目、消息自动中英翻译', 'Automatic translation for tasks, projects and the inbox'),
      changes:[c('切换中英文时，任务标题、描述、验收标准、进展更新、完成结果、提交的成果和评审意见都会显示成当前语言；旁边的“译 / Tr”标记点一下可以看原文。', 'When you switch language, task titles, descriptions, acceptance criteria, progress updates, results, submissions and review notes show in that language; click the 译 / Tr badge to see the original.'),
        c('项目名称、描述、分组、里程碑、状态更新和评论，以及消息铃铛里的任务标题和内容，也一样自动翻译。', 'Project names, descriptions, groups, milestones, status updates and comments, and inbox titles and messages, are translated the same way.'),
        c('编辑框里始终是你写的原文，保存时不会把译文存回去。同一段文字只翻译一次，之后直接读取，不再花费。', 'Edit boxes always keep what you wrote, so a translation is never saved back. Each text is translated once and reused after that.'),
        c('需要在服务器上配置 AI 翻译模型后才会生效；没有配置时显示原文。', 'Takes effect once an AI translation model is configured on the server; until then the original text is shown.'),
        c('钉钉登录和同步：允许部门下任意层级子部门的同事也能登录和被同步进来（归入该允许部门）；不在允许部门之下的人仍会被拒绝。服务器设 DINGTALK_INCLUDE_SUBDEPARTMENTS=false 可恢复为只收直属成员。', 'DingTalk sign-in and sync: people in any sub-department of an allowed department can now sign in and are synced (filed under that allowed department); people outside it are still refused. Set DINGTALK_INCLUDE_SUBDEPARTMENTS=false on the server to admit direct members only.')] },
    { version:'1.28', date:'2026-11-03T18:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('新增“KOL 管理”：所有 KOL 资料、合作进度和带货业绩，自动同步 UpPromote', 'New KOL management: every KOL’s details, progress and sales, synced from UpPromote'),
      title:c('KOL 管理（第一阶段）', 'KOL management (phase 1)'),
      changes:[c('侧边栏新增“营销 → KOL 管理”：管理员和在“ERP 权限”里开通 KOL 权限的同事可以使用；“管理”权限可以编辑和同步，“查看”只能看。', 'New Marketing → KOL management for admins and people granted KOL in ERP permissions; Manage can edit and sync, View can only look.'),
        c('每 30 分钟自动从 UpPromote 同步 KOL 的联系方式、社媒账号、联盟计划、优惠码、佣金和推荐订单，也可以随时点“立即同步”。', 'Contact details, social accounts, program, coupons, commission and referral orders sync from UpPromote every 30 minutes, or on Sync now.'),
        c('在系统里维护合作阶段、等级、主平台、粉丝数、领域、负责人、合作产品、费用和备注；记录寄样、内容发布和付款，记录寄样或发布时阶段自动推进。', 'Keep stage, tier, platform, followers, niche, owner, products, fee and notes here, and log samples, published content and payments; logging moves the stage forward.'),
        c('看板显示近 30 天和累计销售额、待付佣金和按月销售趋势；列表可以按阶段、等级、负责人筛选，按销售额或粉丝排序，并导出 CSV。', 'The page shows 30-day and total sales, commission owed and a monthly trend; filter by stage, tier and owner, sort by sales or followers, and export CSV.'),
        c('还没加入 UpPromote 的 KOL 可以手动添加，加入后只要邮箱一致就会自动关联并带入订单。', 'Add KOLs not yet in UpPromote by hand; they link automatically by email once they join.')] },
    { version:'1.27', date:'2026-11-03T16:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('“产品质量追踪”接入真实数据：问题提交给工厂，工厂登录填方案，每一步都有日期和逾期提醒', 'Product quality tracking goes live: issues are sent to factories, factories sign in to plan the fix, every step is dated with overdue reminders'),
      title:c('产品质量追踪（客服系统第一阶段）', 'Product quality tracking (customer-service phase 1)'),
      changes:[c('“产品质量追踪”不再是示例数据：品质负责人建立问题，按两级缺陷分类（如 ELE-01 电源板故障），关联工单、退货和评价，并提交给东莞或济南工厂。', 'Product quality tracking now uses real data: quality leads register issues with a two-level defect code (e.g. ELE-01 power board), link tickets, returns and reviews, and send them to the Dongguan or Jinan factory.'),
        c('工厂人员用钉钉登录后填写根本原因、纠正和预防措施及承诺落实日期；我们批准或退回，工厂落实后填写从哪个批次起生效，我们验证后关闭。', 'Factory staff sign in with DingTalk to write the root cause, corrective and preventive action and a committed date; we approve or return it, the factory reports the batch the fix applies from, and we verify before closing.'),
        c('每一步都记录日期：提交工厂、工厂回复方案、批准、承诺落实、实际落实、验证关闭；自动算出工厂出方案和落实各用了几天，超期标红。', 'Every step is dated — sent, factory plan, approval, committed and actual implementation, verification — with the days each stage took and overdue items in red.'),
        c('工厂账号只能看到提交给本厂的问题，看不到任务、OKR、产品价格等其他页面。', 'Factory accounts only see issues sent to their own factory and none of the other pages (tasks, OKRs, product prices…).'),
        c('提醒：每一步自动通知下一步的人；方案或落实期限前一天提醒工厂，逾期第 1、3、7 天及之后每周提醒工厂和负责人（消息铃铛、钉钉和邮件）。', 'Reminders: each step notifies whoever acts next; the factory is reminded the day before a plan or implementation date, and the factory and owner on day 1, 3, 7 and weekly once overdue (inbox, DingTalk and email).')] },
    { version:'1.26', date:'2026-11-03T12:00:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('新增“IT 账号与订阅”：登记公司账号、邮箱和订阅，每季度确认，续费和离职自动提醒', 'New IT accounts & subscriptions: register company accounts, mailboxes and subscriptions, confirm them quarterly, get renewal and leaving alerts'),
      title:c('IT 账号与订阅（IT 资产第一阶段）', 'IT accounts & subscriptions (IT assets phase 1)'),
      changes:[c('侧边栏“其他”里新增“IT 账号与订阅”：每个人登记自己负责和在用的公司账号、邮箱；主管能看到下属的账号；IT 管理全部，管理层可以查看全部和费用。', 'New “IT accounts” under Other: everyone registers the company accounts and mailboxes they own and use; managers see their reports’ accounts; IT manages everything and executives can view everything, including costs.'),
        c('系统不保存任何密码：每个账号只贴公司密码管理器里那条记录的链接；备注里写了像密码或密钥的内容会被拦下；付款卡只记名称和后四位。', 'No passwords are stored: each account links to its item in the company password manager; text that looks like a password or key is refused; cards are recorded only by name and last 4 digits.'),
        c('记录负责人、共用人、两步验证绑定在谁那里、状态，以及套餐、费用、付费周期、下次续费日（只有 IT 和管理层能看到费用）。', 'Records owner, users, who holds the 2FA, status, and plan, cost, billing cycle and next renewal (costs visible to IT and executives only).'),
        c('每季度第一周，所有人会收到“请确认你的账号与设备”；没确认的第 7 天和第 14 天再提醒。员工可以随时点“反馈给 IT”。', 'In the first week of each quarter everyone is asked to confirm their accounts, with reminders on day 7 and 14. Anyone can “Tell IT” at any time.'),
        c('续费前 30 天、7 天和当天提醒 IT 和负责人；负责人或两步验证绑定人进入“离职中”时提醒 IT 转交。', 'IT and the owner are reminded 30 and 7 days before a renewal and on the day; IT is alerted when an owner or 2FA holder is leaving.'),
        c('IT 可以用 Excel 模板批量导入（先检查，有错整份不导入），也可以导出全部账号。', 'IT can bulk-import from an Excel template (checked first; nothing is imported if any row is wrong) and export everything.')] },
    { version:'1.25', date:'2026-11-02T23:30:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('新增“人事档案”：入职、合同、证件和履历；身份证号、银行卡和薪资加密保存', 'New HR records: hiring, contracts, documents and history; ID numbers, bank details and salary are encrypted'),
      title:c('人事档案（HRM 第一阶段）', 'HR records (HRM phase 1)'),
      changes:[c('侧边栏“其他”里新增“人事档案”：人事看全公司，主管看下属的雇佣信息，每个人都能看自己的档案。', 'New “HR records” under Other: HR sees everyone, managers see their reports’ employment facts, everyone sees their own record.'),
        c('记录入职日期、用工类型、试用期、合同起止、职级、工作地点、在职状态、紧急联系人和履历；合同扫描件和证件可以加密上传。', 'Records hire date, employment type, probation, contract dates, level, location, status, emergency contact and history; contracts and ID documents upload encrypted.'),
        c('身份证号、银行卡号和薪资加密保存，默认只显示后 4 位；点“查看”才显示完整内容，人事查看时必须填写原因，每次查看都会留下记录。主管看不到这些资料。', 'ID numbers, bank accounts and salary are encrypted and shown masked; View reveals one value, HR must give a reason, and every view is recorded. Managers never see them.'),
        c('试用期结束、合同到期、证件到期前 30 天和 7 天，人事会在消息铃铛里收到提醒。', 'HR gets inbox reminders 30 and 7 days before probation ends, contracts end and documents expire.')] },
    { version:'1.24', date:'2026-11-02T21:30:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('右上角新增消息铃铛：有新任务或新互动会出现红点，点进去直达对应任务', 'New inbox bell: a red dot for new tasks and interactions; click to open the task'),
      title:c('消息红点提醒', 'Inbox red dot'),
      changes:[c('右上角新增铃铛，红点数字是未读消息数：别人给你下达任务、任务有新进展、提交成果待验收、验收通过或需要修改、任务完成，以及催办和 OKR 提醒。', 'A bell at the top right shows the unread count: tasks assigned to you, new progress updates, submissions awaiting review, accepted or returned reviews, completed tasks, reminders and OKR alerts.'),
        c('点击消息直接打开对应任务，并自动标为已读；打开任务时，这个任务的消息也会一起清掉；可以一键全部标为已读。', 'Clicking a message opens its task and marks it read; opening a task clears that task’s messages; one click marks everything read.'),
        c('每分钟自动刷新，回到页面时也会刷新。', 'Refreshes every minute and whenever you return to the page.')] },
    { version:'1.23', date:'2026-11-02T20:50:00-08:00', frontend:'', backend:'', author:KC, deployer:KC,
      short:c('下达任务去掉"你会提供的支持"；完成任务去掉自我评价和字数要求', 'Assign Task drops "Support you will give"; completing a task drops the self-evaluation and minimum length'),
      title:c('下达和完成任务更简洁', 'Simpler assigning and completing'),
      changes:[c('下达任务弹窗去掉"你会提供的支持"，只需填写做什么、截止时间和交付标准。', 'The Assign Task dialog drops "Support you will give"; fill in what to do, the due time and the deliverable standard.'),
        c('完成任务只需写完成结果并附上附件，不再要求自我评价，也不再有 30 字的最少字数。', 'Completing a task needs only the result and attachments; no self-evaluation and no 30-character minimum.')] },
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
