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
    { version:'1.11', date:'2026-11-02T02:25:00-08:00', frontend:'', backend:'', author:ELIAN, deployer:ELIAN,
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
