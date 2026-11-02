/*
 * "版本更新" — every production release of Work OS, newest first: iteration number, what changed,
 * who made the change and who deployed it, and the exact frontend/backend commits.
 *
 * HOW TO ADD A RELEASE (people and AI sessions alike): when you pin a new frontend commit in the
 * API repo and deploy it, add one entry at the TOP of RELEASES below in the same PR:
 *   - version: previous version + 0.1 (v1.6 → v1.7). Start a new major only for a big platform change.
 *   - date: ISO time with offset of the backend release commit.
 *   - frontend / backend: the commits that went live (frontend = deploy/frontend-revision.txt).
 *   - author: who wrote the change; deployer: who pressed deploy on Render (Events/Deploys).
 *   - changes: plain-language lines an employee understands, Chinese and English.
 * The page compares the top entries with /build-info.json, so the live version is marked automatically.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  const KC = { zh:'KC', en:'KC' };
  const ELIAN = { zh:'Elian', en:'Elian' };
  const c = (zh, en) => ({ zh, en });

  const RELEASES = [
    { version:'v1.6', date:'2026-11-02T01:30:00-08:00', status:'pending', frontend:'', backend:'', author:ELIAN, deployer:null,
      title:c('新增“版本更新”页', 'New “Release notes” page'),
      changes:[c('“其他”分组下新增“版本更新”：列出每次上线的迭代号、改了什么、谁修改、谁发布，以及前后端提交号；当前线上版本自动标出。', 'New “Release notes” under Other: every release with its number, what changed, who changed and deployed it, and the frontend/backend commits; the live version is marked automatically.')] },
    { version:'v1.5', date:'2026-11-02T00:50:00-08:00', frontend:'612588a', backend:'841b46b', author:KC, deployer:KC,
      title:c('公司 OKR 可编辑、负责人头像配色', 'Editable company OKR, owner avatar colours'),
      changes:[
        c('公司 OKR 的负责人和管理员可以编辑公司目标，包括 KR 权重。', 'The company OKR owner and admins can edit company objectives, including KR weights.'),
        c('每位负责人的头像有自己的颜色，看板上更容易区分。', 'Each owner’s avatar has its own colour, so boards are easier to scan.')] },
    { version:'v1.4', date:'2026-11-02T00:11:00-08:00', frontend:'9f51f78', backend:'1bdc3d8', author:KC, deployer:KC,
      title:c('产品 CSV 导入、KR 权重手填、Bug 与建议、任务抽屉可编辑', 'Product CSV import, KR weights by hand, Bug & ideas, editable task drawer'),
      changes:[
        c('产品管理和成本核算支持 CSV 导入（带模板，流程和库存管理一样），导入后用服务器数据代替示例数据。', 'Product catalog and cost calculator import CSV with templates (same flow as Inventory); server data replaces the samples.'),
        c('导航分组改名为“产品+供应链”；管理员能看到产品区。价格表只对有完整价格构成权限的人和管理员开放。', 'Nav section renamed to “Product & supply chain”; admins see it. Price tables are limited to full price build-up access and admins.'),
        c('OKR：每个 KR 的权重自己填写，同一目标下合计必须正好 100%。', 'OKR: type every KR weight yourself; the KRs of an objective must total exactly 100%.'),
        c('右上角新增红色“Bug 与建议”按钮，可粘贴、拖入或上传截图；管理员在“Bug 与建议”页处理，配置邮件后自动发到管理员邮箱。', 'New red “Bug & ideas” button with paste, drag or upload screenshots; admins handle notes on the Bug & ideas page, and they are emailed once email is configured.'),
        c('任务详情抽屉变窄，可直接修改名称、状态、优先级、截止日、负责人、成果和验收标准；提交证据后验收标准固定。', 'The task drawer is narrower and edits name, status, priority, due date, owner, outcome and criteria in place; criteria lock once evidence is submitted.')] },
    { version:'v1.3', date:'2026-11-01T22:51:00-08:00', frontend:'52b3a8e', backend:'db4022b', author:KC, deployer:KC,
      title:c('直属与间接下属分开显示', 'Direct and indirect reports shown separately'),
      changes:[c('团队 OKR 和任务分析里，直属下属和间接下属分开显示；间接下属会标出他向谁汇报。', 'Team OKRs and Task analysis list direct and indirect reports separately; indirect reports show who they report to.')] },
    { version:'v1.2', date:'2026-11-01T22:30:00-08:00', frontend:'66af581', backend:'d275e0f', author:KC, deployer:KC,
      title:c('库存管理上线、项目权限、任务进展可编辑', 'Inventory goes live, project access, editable task updates'),
      changes:[
        c('库存管理（WMS）上线：新建 SKU，管理员用 CSV 导入期初库存，盘点调整由提交人的上级确认；ERP 权限页与服务器同步。', 'Inventory (WMS) goes live: new SKUs, opening stock CSV import for admins, count adjustments confirmed by the submitter’s manager; ERP permissions follow the server.'),
        c('项目只对项目管理员、项目成员和公司管理员可见。', 'Projects are visible only to the project admin, project members and company admins.'),
        c('任务进展：作者可以修改或删除自己发的进展，原文保留在审计记录里；每条进展显示发布了多久。', 'Task updates: authors can edit or delete their own update, with the original kept in the audit log; each update shows how long ago it was posted.')] },
    { version:'v1.1', date:'2026-11-01T19:04:00-08:00', frontend:'228bb51', backend:'7751f2e', author:KC, deployer:ELIAN,
      title:c('OKR 发布规则、项目管理、新登录页', 'OKR publishing rules, projects, new sign-in page'),
      changes:[
        c('OKR 权重规则：同一目标下 KR 合计 100%，同一周期目标合计 100 分；有阶段图例；最高负责人的公司 OKR 合并显示。', 'OKR weights: KRs total 100% per objective and objectives 100 points per cycle; stage legend; the top leader’s company OKR is merged in.'),
        c('OKR 终版发布：发布后负责人锁定，上级修改会通知本人，发布时 KR 自动生成任务。', 'OKR final publish: owner locked, leader changes notify the owner, KRs become tasks on publish.'),
        c('任务：行内新建任务和子项；新建的任务默认给自己，给别人派活用“分配任务”；最上层负责人可以自己建任务；看板不显示上级的任务；跨部门显示负责人中英文名。', 'Tasks: inline new tasks and subitems; new tasks are your own and Assign Task gives work to others; top-level owners create their own tasks; superiors’ tasks hidden on the board; owner names across departments.'),
        c('项目：看板分组、每个视图都能按人筛选、自动分析、项目管理员和邀请；项目表格与任务中心同一风格。', 'Projects: board grouping, person filter on every view, automatic analysis, project admin and invites; project table in the Task hub style.'),
        c('新登录页介绍公司和 OneLaser 文化，新增 /culture.html；组织表按工作地点分组；项目描述和里程碑可编辑。', 'New sign-in page with the company story and culture, plus /culture.html; org table grouped by location; editable project description and milestones.'),
        c('修复：深浅色主题下文字都清晰；静态文件按内容更新缓存；中文错误提示；成本核算汇率请求失败时不再反复重试。', 'Fixes: readable text in light and dark themes, content-hashed asset caching, Chinese error messages, cost calculator stops looping on a failed exchange-rate request.')] },
    { version:'v1.0', date:'2026-11-01T08:09:00-08:00', frontend:'53bf16c', backend:'9bebe89', author:KC, deployer:ELIAN,
      title:c('迁移到公司 Render 环境（基线版本）', 'Moved to the company Render environment (baseline)'),
      changes:[
        c('系统从个人环境迁移到公司的 Render 工作空间和数据库，正式入口为 craftos.app；73 张业务表逐表核对，记录数量一致。', 'Moved from the personal environment to the company Render workspace and database at craftos.app; all 73 business tables matched row for row.'),
        c('此版本包含迁移前已有的全部功能：任务与子项、OKR（自评与上级评分、六级评分、月度节奏）、项目、报表、组织与权限、成员邀请与停用、邮箱登录、客服工作台、Wiki 等。', 'Includes everything built before the move: tasks and subitems, OKRs (self and leader scores, six-level scale, monthly rhythm), projects, reports, organization and access, member invites, email sign-in, support workspace and Wiki.')] },
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
      : current ? `<div class="cl-now ok">${icon('check-circle')} ${tr('当前线上版本', 'Live now')}: <b>${esc(current.version)}</b> · ${tr('前端', 'Frontend')} <code>${esc(liveFront)}</code></div>`
      : `<div class="cl-now">${icon('info')} ${tr('线上前端', 'Live frontend')} <code>${esc(liveFront || '—')}</code>${liveFront ? tr('，比下面最新一条记录更新，日志稍后补上。', ' is newer than the latest entry below; notes will follow.') : ''}</div>`;
    const items = RELEASES.map((r, i) => {
      const tag = i === liveIdx ? `<span class="cl-tag live">${tr('线上', 'Live')}</span>` : r.status === 'pending' && (liveIdx < 0 || i < liveIdx) ? `<span class="cl-tag">${tr('待发布', 'Pending')}</span>` : '';
      return `<article class="cl-item ${i === liveIdx ? 'is-live' : ''}">
        <header><span class="cl-ver">${esc(r.version)}</span>${tag}<h2>${esc(t(r.title))}</h2><time datetime="${esc(r.date)}">${esc(fmt(r.date))}</time></header>
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

  window.WorkOSChangelog = { configure, page, RELEASES, reset() { live = undefined; } };
})();
