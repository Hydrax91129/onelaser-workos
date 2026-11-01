'use strict';
/* Project management (UI prototype).
 * Combines monday.com (colored status table, groups, multiple views) with
 * Asana (project overview, status updates, task side panel, My tasks).
 * Core rule: a project task is an ordinary task with a project tag, so any
 * task assigned to a person automatically shows up in their "My tasks".
 * This prototype keeps sample data in memory; nothing is sent to the server.
 */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let ctx = null;
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;

  /* ---------- sample data ---------- */
  const PEOPLE = {
    'u-kc':{ name:'KC', role:{ zh:'总裁', en:'President' } },
    'u-amy':{ name:'Amy Chen', role:{ zh:'销售', en:'Sales' } },
    'u-ben':{ name:'Ben Li', role:{ zh:'客服', en:'Support' } },
    'u-cara':{ name:'Cara Wang', role:{ zh:'市场', en:'Marketing' } },
    'u-zhang':{ name:'张伟', role:{ zh:'东莞研发', en:'R&D, Dongguan' } },
    'u-li':{ name:'李娜', role:{ zh:'武汉网站', en:'Web, Wuhan' } },
  };
  const STATUS = { done:['完成','Done','#00c875'], working:['进行中','Working','#fdab3d'], stuck:['被暂停','Paused','#df7689'], review:['待审批','In review','#a25ddc'], overdue:['延期','Overdue','#e2445c'], abandoned:['放弃','Abandoned','#4b4f5c'], todo:['未开始','Not started','#c4c4c4'] };
  const PRIORITY = { urgent:['紧急','Urgent','#333333'], high:['高','High','#401694'], medium:['中','Medium','#5559df'], low:['低','Low','#579bfc'] };
  const HEALTH = { on_track:['正常','On track','#00b37e'], at_risk:['有风险','At risk','#f5a623'], off_track:['延期','Off track','#e5484d'] };
  const d = s => s; // ISO dates
  const projects = [
    { id:'p1', name:{ zh:'Hydra 2.0 新机型开发', en:'Hydra 2.0 development' }, color:'#3370ff', emoji:'cpu', owner:'u-kc', members:['u-kc','u-zhang','u-cara','u-li','u-amy'], start:'2026-10-01', end:'2026-12-20', health:'at_risk',
      desc:{ zh:'下一代 Hydra 激光雕刻机：功率提升到 60W，新增自动对焦和摄像头定位。目标 12 月底完成量产准备，1 月 CES 前发布。', en:'Next-gen Hydra engraver: 60W, autofocus and camera positioning. Production-ready by end of December, launch before CES in January.' },
      groups:[{ id:'g1', name:{ zh:'设计', en:'Design' }, color:'#579bfc' }, { id:'g2', name:{ zh:'打样与测试', en:'Prototype & test' }, color:'#a25ddc' }, { id:'g3', name:{ zh:'上市准备', en:'Launch prep' }, color:'#fdab3d' }],
      milestones:[{ name:{ zh:'设计冻结', en:'Design freeze' }, date:'2026-10-24', done:true }, { name:{ zh:'首台样机', en:'First prototype' }, date:'2026-11-14', done:false }, { name:{ zh:'量产准备完成', en:'Production ready' }, date:'2026-12-20', done:false }],
      updates:[{ by:'u-kc', at:'2026-10-29', health:'at_risk', text:{ zh:'样机电源板供应商延期 1 周，正在评估第二家供应商。其他进度正常。', en:'Power board supplier slipped one week; evaluating a second vendor. Everything else on schedule.' } }, { by:'u-kc', at:'2026-10-15', health:'on_track', text:{ zh:'结构设计已完成评审，进入打样阶段。', en:'Mechanical design reviewed; moving into prototyping.' } }] },
    { id:'p2', name:{ zh:'黑五促销活动', en:'Black Friday campaign' }, color:'#e2445c', emoji:'megaphone', owner:'u-cara', members:['u-cara','u-amy','u-li','u-ben'], start:'2026-10-20', end:'2026-12-02', health:'on_track',
      desc:{ zh:'黑五 + 网络星期一全渠道促销，目标销售额 $250K。', en:'Black Friday + Cyber Monday omni-channel campaign, $250K sales goal.' },
      groups:[{ id:'g1', name:{ zh:'策划', en:'Planning' }, color:'#579bfc' }, { id:'g2', name:{ zh:'执行', en:'Execution' }, color:'#00c875' }],
      milestones:[{ name:{ zh:'素材定稿', en:'Creative final' }, date:'2026-11-10', done:false }, { name:{ zh:'活动上线', en:'Go live' }, date:'2026-11-27', done:false }],
      updates:[{ by:'u-cara', at:'2026-10-30', health:'on_track', text:{ zh:'折扣方案已确定，广告素材制作中。', en:'Discount plan locked; ad creatives in production.' } }] },
    { id:'p3', name:{ zh:'2027 拉斯维加斯展会', en:'2027 Las Vegas trade show' }, color:'#00c875', emoji:'storefront', owner:'u-amy', members:['u-amy','u-kc','u-cara'], start:'2026-11-01', end:'2027-01-20', health:'on_track',
      desc:{ zh:'展位搭建、样机运输与经销商邀约。', en:'Booth build, demo machine shipping and dealer invitations.' },
      groups:[{ id:'g1', name:{ zh:'筹备', en:'Preparation' }, color:'#579bfc' }],
      milestones:[{ name:{ zh:'展位确认', en:'Booth confirmed' }, date:'2026-11-20', done:false }], updates:[] },
    { id:'p4', name:{ zh:'1laser.com 官网改版', en:'1laser.com redesign' }, color:'#a25ddc', emoji:'globe', owner:'u-li', members:['u-li','u-cara','u-kc'], start:'2026-09-15', end:'2026-11-30', health:'off_track',
      desc:{ zh:'新首页与产品页模板，提升转化率。', en:'New home and product page templates to lift conversion.' },
      groups:[{ id:'g1', name:{ zh:'开发', en:'Build' }, color:'#a25ddc' }],
      milestones:[{ name:{ zh:'新首页上线', en:'New home live' }, date:'2026-11-15', done:false }],
      updates:[{ by:'u-li', at:'2026-10-28', health:'off_track', text:{ zh:'产品页模板需要重做移动端，预计延期 2 周。', en:'Product page template needs a mobile rework; about two weeks late.' } }] },
  ];
  let seq = 100;
  const T = (project, group, title, owner, status, priority, start, due, extra = {}) => ({ id:'t' + (++seq), project, group, title, owner, status, priority, start, due, subtasks:[], comments:[], desc:'', ...extra });
  const tasks = [
    T('p1','g1',{ zh:'结构与外观设计', en:'Mechanical & industrial design' },'u-zhang','done','high','2026-10-01','2026-10-20'),
    T('p1','g1',{ zh:'电源板与主控方案', en:'Power board & controller' },'u-zhang','done','high','2026-10-05','2026-10-24'),
    T('p1','g2',{ zh:'首台样机组装', en:'Assemble first prototype' },'u-zhang','working','urgent','2026-10-25','2026-11-14', { subtasks:[{ t:{ zh:'激光模组到货', en:'Laser module arrives' }, done:true }, { t:{ zh:'电源板到货', en:'Power board arrives' }, done:false }, { t:{ zh:'整机组装', en:'Final assembly' }, done:false }], comments:[{ by:'u-zhang', at:'2026-10-29', text:{ zh:'电源板晚一周，其他零件已齐。', en:'Power board is a week late; other parts are in.' } }] }),
    T('p1','g2',{ zh:'自动对焦精度测试', en:'Autofocus accuracy test' },'u-zhang','todo','high','2026-11-15','2026-11-28'),
    T('p1','g2',{ zh:'LaserMaker 软件适配', en:'LaserMaker software support' },'u-li','stuck','medium','2026-11-01','2026-11-25'),
    T('p1','g3',{ zh:'产品页与视频脚本', en:'Product page & video script' },'u-cara','todo','medium','2026-11-20','2026-12-10'),
    T('p1','g3',{ zh:'经销商预售通知', en:'Dealer pre-order notice' },'u-amy','todo','low','2026-12-01','2026-12-18'),
    T('p1','g3',{ zh:'定价与毛利测算', en:'Pricing & margin model' },'u-kc','review','high','2026-10-28','2026-11-08'),
    T('p2','g1',{ zh:'折扣方案', en:'Discount plan' },'u-kc','done','high','2026-10-20','2026-10-30'),
    T('p2','g1',{ zh:'Meta 与 Google 广告素材', en:'Meta & Google creatives' },'u-cara','working','urgent','2026-10-28','2026-11-10'),
    T('p2','g2',{ zh:'活动落地页', en:'Campaign landing page' },'u-li','working','high','2026-11-01','2026-11-18'),
    T('p2','g2',{ zh:'邮件营销 3 封', en:'Three marketing emails' },'u-cara','todo','medium','2026-11-10','2026-11-26'),
    T('p2','g2',{ zh:'经销商同步促销', en:'Dealer co-promotion' },'u-amy','todo','medium','2026-11-05','2026-11-24'),
    T('p2','g2',{ zh:'客服话术与 FAQ', en:'Support scripts & FAQ' },'u-ben','todo','low','2026-11-15','2026-11-26'),
    T('p3','g1',{ zh:'展位设计确认', en:'Approve booth design' },'u-amy','working','high','2026-11-01','2026-11-20'),
    T('p3','g1',{ zh:'样机运输', en:'Ship demo machines' },'u-amy','todo','medium','2026-12-01','2027-01-05'),
    T('p3','g1',{ zh:'经销商邀约名单', en:'Dealer invite list' },'u-kc','todo','medium','2026-11-10','2026-12-10'),
    T('p4','g1',{ zh:'新首页开发', en:'Build new home page' },'u-li','review','high','2026-09-20','2026-11-05'),
    T('p4','g1',{ zh:'产品页移动端重做', en:'Rework product page for mobile' },'u-li','stuck','urgent','2026-10-20','2026-11-15'),
    T('p4','g1',{ zh:'首页文案与图片', en:'Home page copy & images' },'u-cara','done','medium','2026-09-15','2026-10-10'),
  ];

  /* ---------- live data (server) ---------- */
  const isLive = () => ctx?.state?.().capabilities?.projectsLive === true && !!ctx?.api;
  let liveState = { loaded:false, loading:false, error:'' };
  const FROM_BOARD = { not_started:'todo', working:'working', hold:'stuck', review:'review', done:'done', overdue:'overdue', abandoned:'abandoned' };
  const day = v => String(v || '').slice(0, 10);
  const T2 = v => ({ zh:v, en:v });
  async function loadLive() {
    if (liveState.loading) return; liveState.loading = true;
    try {
      const [pr, chart] = await Promise.all([ctx.api.get('/projects'), ctx.api.get('/org/chart').catch(() => ({ items:ctx.state().directory || [] }))]);
      window.WorkOSNames?.apply(chart.items);
      for (const k of Object.keys(PEOPLE)) delete PEOPLE[k];
      for (const u of chart.items || []) PEOPLE[u.id] = { name:u.display_name, role:T2(u.title || '') };
      projects.length = 0; tasks.length = 0;
      for (const p of pr.items || []) {
        projects.push({ id:p.id, name:T2(p.name), color:p.color, emoji:p.icon, owner:p.owner_id, members:p.members || [], start:day(p.start_date), end:day(p.end_date), health:p.health, canEdit:p.canEdit, desc:T2(p.description || ''),
          groups:(p.groups || []).map(g => ({ id:g.id, name:T2(g.name), color:g.color })), milestones:(p.milestones || []).map(m => ({ name:T2(m.name), date:m.date, done:m.done })),
          updates:(p.updates || []).map(u => ({ by:u.author_id, at:day(u.created_at), health:u.health, text:T2(u.body) })) });
        for (const t of p.tasks || []) tasks.push({ id:t.id, project:p.id, group:t.project_group_id, title:T2(t.title), owner:t.owner_id, status:FROM_BOARD[t.board_status] || 'todo', priority:t.board_priority || 'medium', start:day(t.created_at), due:day(t.due_at), subtasks:[], comments:[], desc:t.description || '', version:t.version, score:t.completion?.ai_score ?? null, live:true });
      }
      liveState = { loaded:true, loading:false, error:'' };
    } catch (e) { liveState = { loaded:true, loading:false, error:e.message || 'error' }; }
    ctx.rerender();
  }
  const reloadLive = async () => { liveState.loading = false; await loadLive(); repaintPanel(); };
  const failed = e => ctx.toast(e?.code === 'COMPLETION_RESULT_REQUIRED' || /COMPLETION_RESULT_REQUIRED/.test(e?.message || '') ? tr('完成任务需要写完成结果和自评：请在任务中心把它标为“完成”，AI 会打分。', 'To complete it, mark it Done in the Task hub with a result and self-review; AI will score it.') : (e?.message || tr('保存失败', 'Save failed')));
  async function liveTaskPatch(t, body) { try { await ctx.api.request('/projects/' + encodeURIComponent(t.project) + '/tasks/' + encodeURIComponent(t.id), { method:'PATCH', body:{ expectedVersion:t.version, ...body } }); } catch (e) { failed(e); } await reloadLive(); }
  const ui = { view:'home', project:null, tab:'list', task:null, filter:'mine', cell:null, adding:null, myGroup:'due', newProject:false };
  const TODAY_SAMPLE = '2026-10-31';
  let TODAY = TODAY_SAMPLE;
  const L = o => o && typeof o === 'object' ? (o[lang()] ?? o.zh) : o;
  const me = () => ctx?.state?.().actor?.id || null;
  const person = id => PEOPLE[id] || { name:id, role:{ zh:'', en:'' } };
  const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const ini = id => { const n = person(id).name; return /^[\x00-\x7f]+$/.test(n) ? n.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() : n.slice(-2); };
  const av = (id, s = 26) => `<span class="pj-av" title="${esc(person(id).name)}" style="--h:${hue(id)};width:${s}px;height:${s}px;font-size:${Math.round(s * (/^[\x00-\x7f]+$/.test(person(id).name) ? .38 : .34))}px">${esc(ini(id))}</span>`;
  const avs = (ids, s = 24, max = 4) => `<span class="pj-avs">${ids.slice(0, max).map(id => av(id, s)).join('')}${ids.length > max ? `<span class="pj-av pj-more" style="width:${s}px;height:${s}px">+${ids.length - max}</span>` : ''}</span>`;
  const fmt = iso => { const [y, m, dd] = iso.split('-').map(Number); return lang() === 'en' ? new Date(y, m - 1, dd).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : `${m}月${dd}日`; };
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const overdue = t => t.status !== 'done' && t.due < TODAY;
  const proj = id => projects.find(p => p.id === id);
  const tasksOf = p => tasks.filter(t => t.project === p.id);
  const pct = p => { const ts = tasksOf(p); return ts.length ? Math.round(ts.filter(t => t.status === 'done').length / ts.length * 100) : 0; };
  const pill = (map, key, cls = '') => `<span class="pj-pill ${cls}" style="--c:${map[key][2]}">${esc(tr(map[key][0], map[key][1]))}</span>`;
  const healthDot = key => `<span class="pj-health" style="--c:${HEALTH[key][2]}"><i></i>${esc(tr(HEALTH[key][0], HEALTH[key][1]))}</span>`;

  /* ---------- home (portfolio) ---------- */
  const daysTo = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(TODAY + 'T00:00:00')) / 864e5);
  function portfolioSummary(list) {
    const ts = list.flatMap(tasksOf), open = ts.filter(t => t.status !== 'done' && t.status !== 'abandoned');
    const cells = [
      [tr('项目', 'Projects'), list.length, ''],
      [tr('进行中的任务', 'Open tasks'), open.length, ''],
      [tr('延期 / 逾期', 'Overdue'), ts.filter(t => t.status === 'overdue' || overdue(t)).length, 'bad'],
      [tr('待审批', 'In review'), ts.filter(t => t.status === 'review').length, 'warn'],
      [tr('有风险 / 延期项目', 'At risk / off track'), list.filter(p => p.health !== 'on_track').length, 'warn'],
      [tr('我负责的未完成任务', 'My open tasks'), open.filter(t => t.owner === me()).length, 'me']
    ];
    return `<div class="pj-summary">${cells.map(([label, n, cls]) => `<div class="pj-sum-cell ${n && cls ? cls : ''}"><b>${n}</b><span>${label}</span></div>`).join('')}</div>`;
  }
  function projectCard(p) {
    const ts = tasksOf(p), od = ts.filter(t => t.status === 'overdue' || overdue(t)).length, v = pct(p), left = daysTo(p.end);
    const counts = Object.keys(STATUS).map(k => [k, ts.filter(t => t.status === k).length]).filter(([, n]) => n);
    const next = ts.filter(t => t.status !== 'done' && t.status !== 'abandoned').sort((a, b) => a.due.localeCompare(b.due))[0];
    const ms = (p.milestones || []).filter(m => !m.done).sort((a, b) => a.date.localeCompare(b.date))[0];
    const upd = (p.updates || [])[0], mine = ts.filter(t => t.owner === me() && t.status !== 'done').length;
    return `<button class="pj-card" data-pj="open-project" data-id="${p.id}" style="--pc:${p.color}">
        <div class="pj-card-top"><span class="pj-picon">${icon(p.emoji)}</span><div class="pj-card-name"><strong>${esc(L(p.name))}</strong><span>${esc(person(p.owner).name)} · ${fmt(p.start)} – ${fmt(p.end)} · <em class="${left < 0 ? 'late' : left <= 7 ? 'soon' : ''}">${left < 0 ? tr(`已超期 ${-left} 天`, `${-left}d past end`) : tr(`剩 ${left} 天`, `${left}d left`)}</em></span></div>${healthDot(p.health)}</div>
        <div class="pj-card-prog"><div class="pj-bar"><span style="width:${v}%"></span></div><b>${v}%</b></div>
        <div class="pj-stack small pj-card-stack">${counts.map(([k, n]) => `<span style="--c:${STATUS[k][2]};flex:${n}" title="${esc(tr(STATUS[k][0], STATUS[k][1]))} ${n}"></span>`).join('')}</div>
        <div class="pj-card-counts">${counts.map(([k, n]) => `<span style="--c:${STATUS[k][2]}"><i></i>${esc(tr(STATUS[k][0], STATUS[k][1]))} ${n}</span>`).join('') || `<span class="pj-muted">${tr('还没有任务', 'No tasks yet')}</span>`}</div>
        <dl class="pj-card-facts">
          <dt>${icon('calendar-blank')} ${tr('最近截止', 'Next due')}</dt><dd>${next ? `${av(next.owner, 18)} ${esc(L(next.title))} <em class="${overdue(next) ? 'late' : ''}">${fmt(next.due)}</em>` : '—'}</dd>
          ${ms ? `<dt>${icon('diamond')} ${tr('下个里程碑', 'Next milestone')}</dt><dd>${esc(L(ms.name))} <em>${fmt(ms.date)}</em></dd>` : ''}
          <dt>${icon('megaphone-simple')} ${tr('最新状态', 'Latest update')}</dt><dd class="pj-card-upd">${upd ? `${esc(L(upd.text))} <em>${fmt(upd.at)}</em>` : `<span class="pj-muted">${tr('负责人还没有发布项目状态', 'No status posted yet')}</span>`}</dd>
        </dl>
        <div class="pj-card-foot">${avs(p.members)}<span>${ts.filter(t => t.status === 'done').length}/${ts.length} ${tr('任务完成', 'done')}</span>${mine ? `<span class="pj-mine">${tr(`我有 ${mine} 项`, `${mine} mine`)}</span>` : ''}${od ? `<span class="pj-od">${icon('warning-circle')} ${od} ${tr('逾期', 'overdue')}</span>` : ''}</div>
      </button>`;
  }
  function home() {
    const mine = projects.filter(p => p.members.includes(me()));
    const list = ui.filter === 'mine' ? mine : projects;
    const myOpen = tasks.filter(t => t.owner === me() && t.status !== 'done');
    return `<div class="pj">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · PROJECTS</div><h1>${tr('项目管理', 'Projects')}</h1><p>${tr('项目里分派的任务，会自动出现在负责人的“我的任务”里。', 'Tasks assigned in a project automatically appear in the assignee’s My tasks.')}</p>${isLive() ? '' : `<div class="pj-sample">${icon('flask')} ${tr('测试版 · 示例数据：项目管理的后台还在开发，这里的项目和任务是示例，修改不会保存。', 'Test build · sample data: the projects backend is in development; projects and tasks here are examples and changes are not saved.')}</div>`}</div><div class="heading-actions"><button class="pj-btn primary" data-pj="new-project">${icon('plus')} ${tr('新建项目', 'New project')}</button></div></div>
      ${isLive() ? '' : `<div class="pj-proto">${icon('flask')} ${tr('界面原型 · 模拟数据，操作不会保存', 'UI prototype · sample data, nothing is saved')}</div>`}
      <div class="pj-home-tabs"><button class="${ui.view === 'home' ? 'active' : ''}" data-pj="go-home">${icon('squares-four')} ${tr('全部项目', 'Projects')}</button><button class="${ui.view === 'my' ? 'active' : ''}" data-pj="go-my">${icon('check-square')} ${tr('我的任务', 'My tasks')} <b>${myOpen.length}</b></button></div>
      ${ui.view === 'my' ? myTasks() : `
      <div class="pj-toolbar"><div class="pj-seg"><button class="${ui.filter === 'mine' ? 'active' : ''}" data-pj="filter" data-v="mine">${tr('我参与的', 'Mine')} ${mine.length}</button><button class="${ui.filter === 'all' ? 'active' : ''}" data-pj="filter" data-v="all">${tr('全部', 'All')} ${projects.length}</button></div></div>
      ${portfolioSummary(list)}
      <div class="pj-cards">${list.map(projectCard).join('')}
      <button class="pj-card pj-card-new" data-pj="new-project">${icon('plus-circle')}<strong>${tr('新建项目', 'New project')}</strong><span>${tr('从模板开始：新品开发 / 营销活动 / 展会', 'Start from a template: product launch / campaign / trade show')}</span></button></div>`}
    </div>`;
  }

  /* ---------- my tasks (Asana style) ---------- */
  function myTasks() {
    const mine = tasks.filter(t => t.owner === me());
    const week = new Date(TODAY); week.setDate(week.getDate() + 7); const wk = week.toISOString().slice(0, 10);
    const sections = [
      ['overdue', tr('已逾期', 'Overdue'), t => overdue(t)],
      ['week', tr('本周到期', 'Due this week'), t => t.status !== 'done' && t.due >= TODAY && t.due <= wk],
      ['later', tr('以后', 'Later'), t => t.status !== 'done' && t.due > wk],
      ['done', tr('已完成', 'Completed'), t => t.status === 'done'],
    ];
    return `<div class="pj-my"><p class="pj-hint">${icon('info')} ${tr('这里汇总了所有项目中分派给你的任务。你在项目里被分配任务后，它会自动出现在这里，同时也会出现在任务中心的“我的任务”。', 'Every task assigned to you across projects. When someone assigns you a task in a project, it appears here and in Task hub → My Work automatically.')}</p>
      ${sections.map(([id, label, fn]) => { const items = mine.filter(fn).sort((a, b) => a.due.localeCompare(b.due)); return `<section class="pj-my-sec"><h3>${icon(id === 'done' ? 'check-circle' : id === 'overdue' ? 'warning-circle' : 'calendar-blank')} ${label} <span>${items.length}</span></h3>${items.map(t => { const p = proj(t.project); return `<button class="pj-my-row" data-pj="open-task" data-id="${t.id}"><span class="pj-check ${t.status === 'done' ? 'on' : ''}" data-pj="toggle-done" data-id="${t.id}" role="checkbox" aria-checked="${t.status === 'done'}">${icon('check')}</span><span class="pj-my-title">${esc(L(t.title))}</span><span class="pj-tag" style="--c:${p.color}">${esc(L(p.name))}</span>${pill(STATUS, t.status, 'small')}<span class="pj-due ${overdue(t) ? 'late' : ''}">${fmt(t.due)}</span></button>`; }).join('') || `<p class="pj-empty-line">${tr('没有任务', 'Nothing here')}</p>`}</section>`; }).join('')}</div>`;
  }

  /* ---------- project page ---------- */
  function projectPage(p) {
    const tabs = [['overview', tr('概览', 'Overview'), 'house'], ['list', tr('表格', 'Table'), 'table'], ['board', tr('看板', 'Board'), 'kanban'], ['timeline', tr('时间线', 'Timeline'), 'chart-bar-horizontal'], ['calendar', tr('日历', 'Calendar'), 'calendar'], ['activity', tr('动态', 'Activity'), 'chat-circle-dots']];
    return `<div class="pj">
      <div class="pj-crumb"><button data-pj="go-home">${icon('caret-left')} ${tr('全部项目', 'All projects')}</button></div>
      <header class="pj-phead" style="--pc:${p.color}"><span class="pj-picon big">${icon(p.emoji)}</span><div class="pj-phead-main"><h1>${esc(L(p.name))}</h1><div class="pj-phead-meta">${healthDot(p.health)}<span>${icon('user')} ${esc(person(p.owner).name)}</span><span>${icon('calendar-blank')} ${fmt(p.start)} – ${fmt(p.end)}</span><span>${pct(p)}% ${tr('完成', 'complete')}</span></div></div>${avs(p.members, 30, 5)}<button class="pj-btn">${icon('user-plus')} ${tr('邀请成员', 'Invite')}</button></header>
      ${isLive() ? '' : `<div class="pj-proto">${icon('flask')} ${tr('界面原型 · 模拟数据，操作不会保存', 'UI prototype · sample data, nothing is saved')}</div>`}
      <nav class="pj-tabs">${tabs.map(([id, label, ic]) => `<button class="${ui.tab === id ? 'active' : ''}" data-pj="tab" data-v="${id}">${icon(ic)} ${label}</button>`).join('')}</nav>
      ${ui.tab === 'overview' ? overview(p) : ui.tab === 'board' ? board(p) : ui.tab === 'timeline' ? timeline(p) : ui.tab === 'calendar' ? calendar(p) : ui.tab === 'activity' ? activity(p) : table(p)}
    </div>`;
  }

  function overview(p) {
    const ts = tasksOf(p), by = s => ts.filter(t => t.status === s).length;
    const latest = p.updates[0];
    return `<div class="pj-ov">
      <div class="pj-ov-main">
        <section class="pj-panel"><h3>${tr('项目描述', 'Description')}</h3><p class="pj-text">${esc(L(p.desc))}</p></section>
        <section class="pj-panel"><div class="pj-panel-head"><h3>${tr('状态更新', 'Status updates')}</h3><button class="pj-btn small primary" data-pj="post-status">${icon('plus')} ${tr('发布状态更新', 'Post status update')}</button></div>
          ${ui.adding === 'status' ? `<form class="pj-status-form" id="pj-status"><div class="pj-seg">${Object.keys(HEALTH).map(k => `<label><input type="radio" name="health" value="${k}" ${k === p.health ? 'checked' : ''}> <span style="--c:${HEALTH[k][2]}">${esc(tr(HEALTH[k][0], HEALTH[k][1]))}</span></label>`).join('')}</div><textarea name="text" required placeholder="${tr('本周进展、风险、需要谁协助……', 'Progress, risks, help needed…')}"></textarea><div class="pj-form-actions"><button type="button" class="pj-btn small" data-pj="cancel">${tr('取消', 'Cancel')}</button><button class="pj-btn small primary">${tr('发布', 'Post')}</button></div></form>` : ''}
          ${p.updates.map(u => `<article class="pj-update" style="--c:${HEALTH[u.health][2]}"><div class="pj-update-head">${av(u.by, 28)}<strong>${esc(person(u.by).name)}</strong>${healthDot(u.health)}<span>${fmt(u.at)}</span></div><p>${esc(L(u.text))}</p></article>`).join('') || `<p class="pj-empty-line">${tr('还没有状态更新。建议负责人每周发一次，让大家知道项目是否正常。', 'No status updates yet. Owners should post weekly so everyone knows whether the project is on track.')}</p>`}
        </section>
      </div>
      <aside class="pj-ov-side">
        <section class="pj-panel"><h3>${tr('进度', 'Progress')}</h3><div class="pj-ring" style="--p:${pct(p)}"><span>${pct(p)}%</span></div><div class="pj-stack">${Object.keys(STATUS).map(s => by(s) ? `<span style="--c:${STATUS[s][2]};flex:${by(s)}" title="${esc(tr(STATUS[s][0], STATUS[s][1]))} ${by(s)}"></span>` : '').join('')}</div><ul class="pj-legend">${Object.keys(STATUS).map(s => `<li><i style="--c:${STATUS[s][2]}"></i>${esc(tr(STATUS[s][0], STATUS[s][1]))}<b>${by(s)}</b></li>`).join('')}</ul>${ts.filter(overdue).length ? `<p class="pj-od">${icon('warning-circle')} ${ts.filter(overdue).length} ${tr('项任务已逾期', 'tasks overdue')}</p>` : ''}</section>
        <section class="pj-panel"><h3>${tr('里程碑', 'Milestones')}</h3><ul class="pj-ms">${p.milestones.map(m => `<li class="${m.done ? 'done' : ''}">${icon(m.done ? 'check-circle' : 'diamond')}<span>${esc(L(m.name))}</span><b>${fmt(m.date)}</b></li>`).join('')}</ul></section>
        <section class="pj-panel"><h3>${tr('成员', 'Members')}</h3><ul class="pj-members">${p.members.map(id => `<li>${av(id, 28)}<div><strong>${esc(person(id).name)}</strong><span>${esc(L(person(id).role))}${id === p.owner ? ' · ' + tr('项目负责人', 'Project owner') : ''}</span></div><b>${tasksOf(p).filter(t => t.owner === id && t.status !== 'done').length} ${tr('项待办', 'open')}</b></li>`).join('')}</ul></section>
      </aside>
    </div>`;
  }

  function cellMenu(t, field) {
    const map = field === 'status' ? STATUS : PRIORITY;
    return `<div class="pj-menu">${Object.keys(map).filter(k => field !== 'status' || k !== 'todo').map(k => `<button data-pj="set-cell" data-id="${t.id}" data-f="${field}" data-v="${k}" style="--c:${map[k][2]}">${esc(tr(map[k][0], map[k][1]))}</button>`).join('')}</div>`;
  }
  function ownerMenu(t) {
    const p = proj(t.project);
    return `<div class="pj-menu pj-menu-people">${(isLive() ? [...new Set([...p.members, ...Object.keys(PEOPLE)])] : p.members).map(id => `<button class="plain" data-pj="set-cell" data-id="${t.id}" data-f="owner" data-v="${id}">${av(id, 22)} ${esc(person(id).name)}</button>`).join('')}</div>`;
  }
  function table(p) {
    const lo = p.start, span = Math.max(1, days(p.start, p.end));
    return `<div class="pj-table-wrap">${p.groups.map(g => { const items = tasksOf(p).filter(t => t.group === g.id); return `<section class="pj-group" style="--gc:${g.color}">
      <h3 class="pj-group-title">${icon('caret-down')} ${esc(L(g.name))} <span>${items.length} ${tr('项', 'items')}</span></h3>
      <div class="pj-table" role="table">
        <div class="pj-tr pj-th" role="row"><span>${tr('任务', 'Task')}</span><span>${tr('负责人', 'Owner')}</span><span>${tr('状态', 'Status')}</span><span>${tr('优先级', 'Priority')}</span><span>${tr('截止日期', 'Due')}</span><span>${tr('时间线', 'Timeline')}</span></div>
        ${items.map(t => { const open = f => ui.cell && ui.cell.id === t.id && ui.cell.f === f; const left = Math.max(0, days(lo, t.start)) / span * 100, w = Math.max(3, days(t.start, t.due) / span * 100); return `<div class="pj-tr" role="row">
          <span class="pj-td-title"><button class="pj-tlink" data-pj="open-task" data-id="${t.id}">${esc(L(t.title))}</button>${t.subtasks.length ? `<em>${icon('tree-view')} ${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</em>` : ''}${t.comments.length ? `<em>${icon('chat-circle')} ${t.comments.length}</em>` : ''}</span>
          <span class="pj-td-owner"><button class="pj-cellbtn plain" data-pj="cell" data-id="${t.id}" data-f="owner">${av(t.owner, 24)}<span>${esc(person(t.owner).name)}</span></button>${open('owner') ? ownerMenu(t) : ''}</span>
          <span class="pj-td-color"><button class="pj-cellbtn" style="--c:${STATUS[t.status][2]}" data-pj="cell" data-id="${t.id}" data-f="status">${esc(tr(STATUS[t.status][0], STATUS[t.status][1]))}</button>${open('status') ? cellMenu(t, 'status') : ''}</span>
          <span class="pj-td-color"><button class="pj-cellbtn" style="--c:${PRIORITY[t.priority][2]}" data-pj="cell" data-id="${t.id}" data-f="priority">${esc(tr(PRIORITY[t.priority][0], PRIORITY[t.priority][1]))}</button>${open('priority') ? cellMenu(t, 'priority') : ''}</span>
          <span class="pj-due ${overdue(t) ? 'late' : ''}">${overdue(t) ? icon('warning-circle') + ' ' : ''}${fmt(t.due)}</span>
          <span class="pj-mini-tl"><i style="left:${left}%;width:${w}%;--c:${g.color}"></i></span>
        </div>`; }).join('')}
        ${ui.adding === g.id ? `<form class="pj-tr pj-addrow" id="pj-add" data-group="${g.id}"><input name="title" required placeholder="${tr('任务名称，回车保存', 'Task name, press Enter')}" data-pj-focus><select name="owner">${(isLive() ? [...new Set([...p.members, ...Object.keys(PEOPLE)])] : p.members).map(id => `<option value="${id}" ${id === me() ? 'selected' : ''}>${esc(person(id).name)}</option>`).join('')}</select><input name="due" type="date" value="${isLive() ? new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) : '2026-11-20'}" required><button class="pj-btn small primary">${tr('添加', 'Add')}</button><button type="button" class="pj-btn small" data-pj="cancel">${tr('取消', 'Cancel')}</button></form>` : `<button class="pj-addline" data-pj="add-task" data-group="${g.id}">${icon('plus')} ${tr('添加任务', 'Add task')}</button>`}
        <div class="pj-tr pj-sum"><span></span><span></span><span class="pj-stack small">${Object.keys(STATUS).map(s => { const n = items.filter(t => t.status === s).length; return n ? `<span style="--c:${STATUS[s][2]};flex:${n}"></span>` : ''; }).join('')}</span><span></span><span></span><span></span></div>
      </div></section>`; }).join('')}
      <button class="pj-btn pj-addgroup">${icon('plus')} ${tr('添加阶段', 'Add stage')}</button></div>`;
  }

  function board(p) {
    return `<div class="pj-board">${Object.keys(STATUS).map(s => { const items = tasksOf(p).filter(t => t.status === s); return `<section class="pj-col"><h3 style="--c:${STATUS[s][2]}">${esc(tr(STATUS[s][0], STATUS[s][1]))} <span>${items.length}</span></h3>${items.map(t => `<button class="pj-kcard" data-pj="open-task" data-id="${t.id}"><span class="pj-kgroup" style="--c:${p.groups.find(g => g.id === t.group).color}">${esc(L(p.groups.find(g => g.id === t.group).name))}</span><strong>${esc(L(t.title))}</strong><div class="pj-kfoot">${av(t.owner, 22)}${pill(PRIORITY, t.priority, 'small')}<span class="pj-due ${overdue(t) ? 'late' : ''}">${fmt(t.due)}</span></div></button>`).join('')}</section>`; }).join('')}</div>`;
  }

  function timeline(p) {
    const start = new Date(p.start); start.setDate(start.getDate() - start.getDay() + 1);
    const end = new Date(p.end); end.setDate(end.getDate() + 7);
    const total = Math.max(7, days(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)));
    const weeks = []; for (let i = 0; i < total; i += 7) { const w = new Date(start); w.setDate(w.getDate() + i); weeks.push(w.toISOString().slice(0, 10)); }
    const x = iso => Math.max(0, Math.min(100, days(start.toISOString().slice(0, 10), iso) / total * 100));
    return `<div class="pj-gantt"><div class="pj-g-head"><span class="pj-g-label">${tr('任务', 'Task')}</span><div class="pj-g-scale">${weeks.map(w => `<span style="left:${x(w)}%">${fmt(w)}</span>`).join('')}</div></div>
      ${p.groups.map(g => `<div class="pj-g-group" style="--gc:${g.color}"><span class="pj-g-label">${esc(L(g.name))}</span><div class="pj-g-track"></div></div>${tasksOf(p).filter(t => t.group === g.id).map(t => `<div class="pj-g-row"><button class="pj-g-label pj-tlink" data-pj="open-task" data-id="${t.id}">${av(t.owner, 20)} ${esc(L(t.title))}</button><div class="pj-g-track">${weeks.map(w => `<i class="pj-g-grid" style="left:${x(w)}%"></i>`).join('')}<button class="pj-g-bar" data-pj="open-task" data-id="${t.id}" style="left:${x(t.start)}%;width:${Math.max(1.5, x(t.due) - x(t.start))}%;--c:${STATUS[t.status][2]}" title="${esc(L(t.title))} · ${fmt(t.start)} – ${fmt(t.due)}">${t.status === 'done' ? icon('check') : ''}</button></div></div>`).join('')}`).join('')}
      <div class="pj-g-row pj-g-ms"><span class="pj-g-label">${icon('diamond')} ${tr('里程碑', 'Milestones')}</span><div class="pj-g-track">${p.milestones.map(m => `<span class="pj-g-diamond ${m.done ? 'done' : ''}" style="left:${x(m.date)}%" title="${esc(L(m.name))} ${fmt(m.date)}"></span>`).join('')}</div></div>
      <div class="pj-g-today" style="left:calc(220px + (100% - 220px) * ${x(TODAY) / 100})"><span>${tr('今天', 'Today')}</span></div>
    </div>`;
  }

  function calendar(p) {
    const y = 2026, m = 10; // November 2026
    const first = new Date(y, m, 1), startDay = (first.getDay() + 6) % 7, count = new Date(y, m + 1, 0).getDate();
    const cells = []; for (let i = 0; i < startDay; i++) cells.push(null); for (let i = 1; i <= count; i++) cells.push(i);
    const wd = lang() === 'en' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['一','二','三','四','五','六','日'];
    return `<div class="pj-cal"><h3>${tr('2026年11月', 'November 2026')}</h3><div class="pj-cal-grid">${wd.map(w => `<b>${w}</b>`).join('')}${cells.map(n => { if (!n) return '<span class="pj-cal-cell empty"></span>'; const iso = `2026-11-${String(n).padStart(2, '0')}`; const items = tasksOf(p).filter(t => t.due === iso); const ms = p.milestones.filter(x => x.date === iso); return `<span class="pj-cal-cell ${iso === TODAY ? 'today' : ''}"><em>${n}</em>${ms.map(x => `<i class="pj-cal-ms">${icon('diamond')} ${esc(L(x.name))}</i>`).join('')}${items.map(t => `<button data-pj="open-task" data-id="${t.id}" style="--c:${STATUS[t.status][2]}">${esc(L(t.title))}</button>`).join('')}</span>`; }).join('')}</div></div>`;
  }

  function activity(p) {
    const feed = [
      ...p.updates.map(u => ({ at:u.at, by:u.by, html:`${tr('发布了状态更新', 'posted a status update')} ${healthDot(u.health)}`, text:L(u.text) })),
      ...tasksOf(p).flatMap(t => t.comments.map(c => ({ at:c.at, by:c.by, html:`${tr('评论了', 'commented on')} <button class="pj-tlink" data-pj="open-task" data-id="${t.id}">${esc(L(t.title))}</button>`, text:L(c.text) }))),
      ...tasksOf(p).filter(t => t.status === 'done').map(t => ({ at:t.due, by:t.owner, html:`${tr('完成了', 'completed')} <button class="pj-tlink" data-pj="open-task" data-id="${t.id}">${esc(L(t.title))}</button>`, text:'' })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return `<div class="pj-panel pj-feed">${feed.map(f => `<div class="pj-feed-row">${av(f.by, 30)}<div><div><strong>${esc(person(f.by).name)}</strong> ${f.html} <span class="pj-feed-at">${fmt(f.at)}</span></div>${f.text ? `<p>${esc(f.text)}</p>` : ''}</div></div>`).join('')}</div>`;
  }

  /* ---------- task panel (Asana style) ---------- */
  function taskPanel(t) {
    const p = proj(t.project), g = p.groups.find(x => x.id === t.group);
    return `<div class="drawer-top pj-drawer-top"><span class="pj-tag" style="--c:${p.color}">${esc(L(p.name))}</span><span>›</span><span>${esc(L(g.name))}</span><button class="icon-btn" data-live-action="close" aria-label="${tr('关闭', 'Close')}">${icon('x')}</button></div>
      <div class="drawer-body pj-drawer-body">
        <button class="pj-complete ${t.status === 'done' ? 'on' : ''}" data-pj="toggle-done" data-id="${t.id}">${icon('check')} ${t.status === 'done' ? tr('已完成', 'Completed') : tr('标记完成', 'Mark complete')}</button>
        <h2 id="live-dialog-title">${esc(L(t.title))}</h2>
        <dl class="pj-fields">
          <dt>${tr('负责人', 'Assignee')}</dt><dd>${av(t.owner, 24)} ${esc(person(t.owner).name)}</dd>
          <dt>${tr('截止日期', 'Due date')}</dt><dd class="${overdue(t) ? 'pj-late' : ''}">${fmt(t.start)} – ${fmt(t.due)}</dd>
          <dt>${tr('状态', 'Status')}</dt><dd>${pill(STATUS, t.status)}</dd>
          <dt>${tr('优先级', 'Priority')}</dt><dd>${pill(PRIORITY, t.priority)}</dd>
          <dt>${tr('所属项目', 'Project')}</dt><dd><span class="pj-tag" style="--c:${p.color}">${esc(L(p.name))}</span> · ${esc(L(g.name))}</dd>
        </dl>
        ${isLive() ? `<div class="pj-sync">${icon('arrows-clockwise')} ${tr(`这是一条真实任务：已在 ${esc(person(t.owner).name)} 的任务中心里，状态和评论两边同步；标记完成需要在任务中心写完成结果。`, `A live task: it is in ${esc(person(t.owner).name)}’s Task hub and stays in sync; completing it requires a result in the Task hub.`)}</div>` : `<div class="pj-sync">${icon('arrows-clockwise')} ${tr(`示例演示：分派给 ${person(t.owner).name} 的「我的任务」和任务中心；示例不会发送提醒或写入任务中心。`, `Sample preview for ${person(t.owner).name}’s My tasks and Task hub automatically; samples do not send reminders or create live tasks.`)}</div>`}
        <section><h3>${tr('描述', 'Description')}</h3><p class="pj-text pj-muted">${esc(t.desc || tr('添加更详细的说明、验收标准或参考链接……', 'Add details, acceptance criteria or links…'))}</p></section>
        ${t.live ? '' : `<section><h3>${tr('子任务', 'Subtasks')} ${t.subtasks.length ? `<span>${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</span>` : ''}</h3><ul class="pj-subs">${t.subtasks.map((s, i) => `<li><button class="pj-check ${s.done ? 'on' : ''}" data-pj="toggle-sub" data-id="${t.id}" data-i="${i}" role="checkbox" aria-checked="${s.done}">${icon('check')}</button><span class="${s.done ? 'pj-strike' : ''}">${esc(L(s.t))}</span></li>`).join('')}</ul><button class="pj-addline">${icon('plus')} ${tr('添加子任务', 'Add subtask')}</button></section>`}
        <section><h3>${tr('评论', 'Comments')}</h3>${t.comments.map(c => `<div class="pj-comment">${av(c.by, 26)}<div><div><strong>${esc(person(c.by).name)}</strong> <span>${fmt(c.at)}</span></div><p>${esc(L(c.text))}</p></div></div>`).join('')}<form class="pj-comment-form" id="pj-comment" data-id="${t.id}">${av(me(), 26)}<input name="text" required placeholder="${tr('写评论，@提及同事……', 'Comment, @mention someone…')}"><button class="pj-btn small primary">${tr('发送', 'Send')}</button></form></section>
      </div>`;
  }
  function openTask(id) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    ui.task = id;
    ctx.overlay(taskPanel(t), true);
    if (t.live) loadComments(id);
    document.querySelector('#overlay-root .drawer')?.classList.add('pj-drawer');
  }
  const repaintPanel = () => { const t = tasks.find(x => x.id === ui.task), el = document.querySelector('#overlay-root .pj-drawer'); if (t && el) el.innerHTML = taskPanel(t); };

  /* ---------- new project (templates) ---------- */
  function newProjectDialog() {
    const tpl = [['blank', 'file', tr('空白项目', 'Blank'), tr('从零开始', 'Start from scratch')], ['launch', 'cpu', tr('新品开发', 'Product launch'), tr('设计 → 打样测试 → 上市准备', 'Design → prototype → launch')], ['campaign', 'megaphone', tr('营销活动', 'Marketing campaign'), tr('策划 → 素材 → 执行 → 复盘', 'Plan → creative → run → review')], ['show', 'storefront', tr('展会', 'Trade show'), tr('展位 → 物流 → 邀约 → 跟进', 'Booth → shipping → invites → follow-up')]];
    ctx.modal(tr('新建项目', 'New project'), `<form id="pj-new"><label class="field full"><span>${tr('项目名称', 'Project name')}</span><input name="name" required placeholder="${tr('例如：Cobra 2.0 新品开发', 'e.g. Cobra 2.0 launch')}"></label><p class="fine">${tr('选择模板', 'Choose a template')}</p><div class="pj-tpls">${tpl.map(([id, ic, n, s], i) => `<label class="pj-tpl"><input type="radio" name="tpl" value="${id}" ${i === 1 ? 'checked' : ''}><span>${icon(ic)}<strong>${n}</strong><em>${s}</em></span></label>`).join('')}</div><div class="form-grid"><label class="field"><span>${tr('开始日期', 'Start')}</span><input name="start" type="date" value="${isLive() ? new Date().toISOString().slice(0, 10) : '2026-11-02'}"></label><label class="field"><span>${tr('结束日期', 'End')}</span><input name="end" type="date" value="${isLive() ? new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10) : '2026-12-31'}"></label></div><p class="fine">${tr('成员可以来自不同部门；项目成员能看到整个项目，看不到项目以外的内容。', 'Members can come from any department; they see the whole project and nothing outside it.')}</p></form>`, `<button class="btn primary" type="submit" form="pj-new">${tr('创建项目', 'Create project')}</button>`);
  }


  /* ---------- project analysis (reports area) ---------- */
  function analysis() {
    { const g = liveGate(); if (g) return g; }
    const rows = projects.map(p => {
      const ts = tasksOf(p), done = ts.filter(t => t.status === 'done').length, total = ts.length || 1;
      const elapsed = Math.max(0, Math.min(1, days(p.start, TODAY) / Math.max(1, days(p.start, p.end))));
      const progress = done / total, gap = Math.round((progress - elapsed) * 100);
      const od = ts.filter(overdue), stuck = ts.filter(t => t.status === 'stuck');
      const remaining = ts.filter(t => t.status !== 'done').length;
      // Simple, explainable delay estimate: share of time used vs work done, plus overdue and blocked tasks.
      const risk = Math.max(0, Math.min(100, Math.round((elapsed - progress) * 120 + od.length * 12 + stuck.length * 15 + (p.health === 'off_track' ? 20 : p.health === 'at_risk' ? 10 : 0))));
      const nextMs = p.milestones.filter(m => !m.done).sort((a, b) => a.date.localeCompare(b.date))[0];
      return { p, ts, done, progress:Math.round(progress * 100), elapsed:Math.round(elapsed * 100), gap, od, stuck, remaining, risk, nextMs };
    }).sort((a, b) => b.risk - a.risk);
    const lvl = r => r >= 60 ? ['高', 'High', 'bad'] : r >= 30 ? ['中', 'Medium', 'warn'] : ['低', 'Low', 'ok'];
    const totalTasks = rows.reduce((s, r) => s + r.ts.length, 0), totalDone = rows.reduce((s, r) => s + r.done, 0), totalOd = rows.reduce((s, r) => s + r.od.length, 0);
    return `<div class="pj">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · REPORTS</div><h1>${tr('项目分析', 'Project analysis')}</h1><p>${tr('每个项目的进展、是否按时，以及延期的可能性。', 'Progress, timeliness and delay risk for every project.')}</p>${isLive() ? '' : `<div class="pj-sample">${icon('flask')} ${tr('测试版 · 示例数据：项目管理的后台还在开发，这里的项目和任务是示例，修改不会保存。', 'Test build · sample data: the projects backend is in development; projects and tasks here are examples and changes are not saved.')}</div>`}</div></div>
      ${window.WorkOSInsights?.slot('project') || ''}
      ${isLive() ? '' : `<div class="pj-proto">${icon('flask')} ${tr('使用项目管理原型数据；项目管理接入后台后自动换成真实数据', 'Uses project prototype data; switches to real data once projects are connected')}</div>`}
      <div class="pj-an-stats">
        <div><span>${tr('进行中的项目', 'Active projects')}</span><strong>${rows.length}</strong></div>
        <div><span>${tr('任务完成', 'Tasks done')}</span><strong>${totalDone}/${totalTasks}</strong></div>
        <div class="${totalOd ? 'bad' : ''}"><span>${tr('逾期任务', 'Overdue tasks')}</span><strong>${totalOd}</strong></div>
        <div class="${rows.filter(r => r.risk >= 60).length ? 'bad' : ''}"><span>${tr('高延期风险', 'High delay risk')}</span><strong>${rows.filter(r => r.risk >= 60).length}</strong></div>
      </div>
      <section class="pj-panel"><table class="pj-an-table" data-help-table="pj-analysis"><thead><tr><th>${tr('项目', 'Project')}</th><th>${tr('状态', 'Status')}</th><th>${tr('工作进度 vs 时间进度', 'Work vs time elapsed')}</th><th>${tr('偏差', 'Gap')}</th><th>${tr('逾期 / 卡住', 'Overdue / stuck')}</th><th>${tr('下一个里程碑', 'Next milestone')}</th><th>${tr('延期可能性', 'Delay risk')}</th></tr></thead><tbody>
        ${rows.map(r => { const l = lvl(r.risk); return `<tr><td><button class="pj-tlink pj-an-name" data-pj="open-project" data-id="${r.p.id}" data-goto="projects"><span class="pj-picon small" style="--pc:${r.p.color}">${icon(r.p.emoji)}</span><span><strong>${esc(L(r.p.name))}</strong><em>${esc(person(r.p.owner).name)} · ${fmt(r.p.start)} – ${fmt(r.p.end)}</em></span></button></td>
          <td>${healthDot(r.p.health)}</td>
          <td><div class="pj-an-bars"><div title="${tr('工作完成', 'Work done')}"><i style="width:${r.progress}%;--c:#00c875"></i></div><div title="${tr('时间已过', 'Time elapsed')}"><i style="width:${r.elapsed}%;--c:#9699a6"></i></div></div><small>${tr('完成', 'Done')} ${r.progress}% · ${tr('时间', 'Time')} ${r.elapsed}%</small></td>
          <td class="${r.gap < -10 ? 'pj-late' : ''}">${r.gap > 0 ? '+' : ''}${r.gap}%</td>
          <td>${r.od.length ? `<span class="pj-late">${r.od.length}</span>` : 0} / ${r.stuck.length ? `<span class="pj-late">${r.stuck.length}</span>` : 0}</td>
          <td>${r.nextMs ? `${esc(L(r.nextMs.name))}<br><small class="${r.nextMs.date < TODAY ? 'pj-late' : ''}">${fmt(r.nextMs.date)}</small>` : '—'}</td>
          <td><div class="pj-risk ${l[2]}"><b>${r.risk}</b><span>${tr(l[0], l[1])}</span></div></td></tr>`; }).join('')}
      </tbody></table></section>
      <section class="pj-panel"><h3>${tr('需要关注', 'Needs attention')}</h3><ul class="pj-an-list">${rows.flatMap(r => [...r.od.map(t => ({ t, r, why:tr('逾期', 'Overdue') })), ...r.stuck.filter(t => !overdue(t)).map(t => ({ t, r, why:tr('卡住', 'Stuck') }))]).map(({ t, r, why }) => `<li><span class="pj-pill small" style="--c:#e2445c">${why}</span><button class="pj-tlink" data-pj="open-task" data-id="${t.id}">${esc(L(t.title))}</button><span class="pj-tag" style="--c:${r.p.color}">${esc(L(r.p.name))}</span>${av(t.owner, 22)}<span class="pj-due late">${fmt(t.due)}</span></li>`).join('') || `<li class="pj-empty-line">${tr('没有逾期或卡住的任务', 'No overdue or stuck tasks')}</li>`}</ul></section>
      <p class="pj-hint">${icon('info')} ${tr('延期可能性 = 时间已过却未完成的比例 + 逾期任务 + 卡住任务 + 负责人标记的状态，0–100 分；60 分以上需要立即处理。这是一个透明的经验公式，便于讨论，而不是精确预测。', 'Delay risk (0–100) combines time used vs work done, overdue and stuck tasks, and the owner’s status; 60+ needs action now. It is a transparent rule of thumb for discussion, not a precise forecast.')}</p>
    </div>`;
  }

  /* ---------- render & events ---------- */
  function liveGate() { if (!isLive()) return null; TODAY = new Date().toISOString().slice(0, 10); if (!liveState.loaded) { loadLive(); return `<div class="pj"><p class="pj-hint">${tr('正在读取项目…', 'Loading projects…')}</p></div>`; } if (liveState.error) return `<div class="pj"><div class="pj-proto">${esc(liveState.error)}</div></div>`; return null; }
  function render() { if (!ctx) return ''; const g = liveGate(); if (g) return g; const p = ui.project && proj(ui.project); return p ? projectPage(p) : home(); }
  const rerender = () => { ctx.rerender(); requestAnimationFrame(() => document.querySelector('[data-pj-focus]')?.focus()); };
  document.addEventListener('click', e => {
    if (!ctx) return;
    const t = e.target.closest('[data-pj]');
    if (!t) { if (ui.cell && !e.target.closest('.pj-menu')) { ui.cell = null; rerender(); } return; }
    e.preventDefault(); e.stopPropagation();
    const a = t.dataset.pj, id = t.dataset.id;
    if (a !== 'cell' && a !== 'set-cell') ui.cell = null;
    const task = tasks.find(x => x.id === id);
    switch (a) {
      case 'go-home': ui.project = null; ui.view = 'home'; return rerender();
      case 'inbox-toggle': ui.inboxOpen = ui.inboxOpen === false; return rerender();
      case 'go-my': ui.project = null; ui.view = 'my'; return rerender();
      case 'filter': ui.filter = t.dataset.v; return rerender();
      case 'open-project': ui.project = id; ui.tab = 'list'; if (t.dataset.goto && ctx.state().page !== 'projects') { window.location.hash = 'projects'; return; } return rerender();
      case 'tab': ui.tab = t.dataset.v; ui.adding = null; return rerender();
      case 'open-task': return openTask(id);
      case 'cell': ui.cell = ui.cell && ui.cell.id === id && ui.cell.f === t.dataset.f ? null : { id, f:t.dataset.f }; return rerender();
      case 'set-cell': if (isLive()) { ui.cell = null; const f = t.dataset.f, v = t.dataset.v; return liveTaskPatch(task, f === 'owner' ? { ownerId:v } : f === 'status' ? { status:v } : f === 'priority' ? { priority:v } : {}); } task[t.dataset.f] = t.dataset.v; ui.cell = null; ctx.toast(t.dataset.f === 'owner' ? tr(`已分派给 ${person(t.dataset.v).name}；仅为示例，不会写入真实任务`, `Assigned to ${person(t.dataset.v).name}; sample only, no live task created`) : tr('已更新', 'Updated')); return rerender();
      case 'toggle-done': if (isLive()) { if (task.status === 'done') return liveTaskPatch(task, { status:'working' }); return failed({ code:'COMPLETION_RESULT_REQUIRED' }); } task.status = task.status === 'done' ? 'working' : 'done'; rerender(); return repaintPanel();
      case 'toggle-sub': task.subtasks[+t.dataset.i].done = !task.subtasks[+t.dataset.i].done; rerender(); return repaintPanel();
      case 'add-task': ui.adding = t.dataset.group; return rerender();
      case 'post-status': ui.adding = 'status'; return rerender();
      case 'cancel': ui.adding = null; return rerender();
      case 'new-project': return newProjectDialog();
    }
  }, true);
  document.addEventListener('submit', e => {
    const f = e.target; if (!ctx || !f.id?.startsWith('pj-')) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    if (isLive() && ['pj-add', 'pj-status', 'pj-comment', 'pj-new'].includes(f.id)) { liveSubmit(f, v); return; }
    if (f.id === 'pj-add') { const p = proj(ui.project); tasks.push(T(p.id, f.dataset.group, { zh:v.title, en:v.title }, v.owner, 'todo', 'medium', TODAY, v.due)); ctx.toast(tr(`示例任务已添加，仅在原型中展示给 ${person(v.owner).name} 的「我的任务」`, `Sample task added in the prototype for ${person(v.owner).name}’s My tasks`)); return rerender(); }
    if (f.id === 'pj-status') { const p = proj(ui.project); p.health = v.health; p.updates.unshift({ by:me(), at:TODAY, health:v.health, text:{ zh:v.text, en:v.text } }); ui.adding = null; ctx.toast(tr('示例状态已更新；不会通知真实成员', 'Sample status updated; no notifications sent')); return rerender(); }
    if (f.id === 'pj-comment') { const t = tasks.find(x => x.id === f.dataset.id); t.comments.push({ by:me(), at:TODAY, text:{ zh:v.text, en:v.text } }); repaintPanel(); return rerender(); }
    if (f.id === 'pj-new') { const id = 'p' + (++seq); const tplGroups = { launch:[['设计','Design','#579bfc'],['打样与测试','Prototype & test','#a25ddc'],['上市准备','Launch prep','#fdab3d']], campaign:[['策划','Plan','#579bfc'],['素材','Creative','#a25ddc'],['执行','Run','#00c875'],['复盘','Review','#fdab3d']], show:[['展位','Booth','#579bfc'],['物流','Shipping','#a25ddc'],['邀约','Invites','#00c875']], blank:[['待办','To do','#579bfc']] }[v.tpl] || [];
      projects.unshift({ id, name:{ zh:v.name, en:v.name }, color:'#ff7575', emoji:'rocket-launch', owner:me(), members:[me()], start:v.start, end:v.end, health:'on_track', desc:{ zh:'', en:'' }, groups:tplGroups.map((g, i) => ({ id:'g' + i, name:{ zh:g[0], en:g[1] }, color:g[2] })), milestones:[], updates:[] });
      ctx.closeOverlay(); ui.project = id; ui.tab = 'list'; ctx.toast(tr('项目已创建，按阶段添加任务吧', 'Project created — add tasks by stage')); return rerender(); }
  });

  async function liveSubmit(f, v) {
    try {
      if (f.id === 'pj-add') { await ctx.api.post('/projects/' + encodeURIComponent(ui.project) + '/tasks', { title:v.title.trim(), ownerId:v.owner, groupId:f.dataset.group, dueAt:new Date(v.due + 'T17:00:00').toISOString(), priority:'medium' }); ui.adding = null; ctx.toast(tr(`任务已分派给 ${person(v.owner).name}，已进入对方的任务中心`, `Assigned to ${person(v.owner).name}; it is now in their Task hub`)); }
      if (f.id === 'pj-status') { await ctx.api.post('/projects/' + encodeURIComponent(ui.project) + '/updates', { health:v.health, body:v.text.trim() }); ui.adding = null; ctx.toast(tr('项目状态已更新', 'Project status updated')); }
      if (f.id === 'pj-comment') { await ctx.api.post('/tasks/' + encodeURIComponent(f.dataset.id) + '/updates', { requestId:(crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), body:v.text.trim() }); await loadComments(f.dataset.id); }
      if (f.id === 'pj-new') { const tplMap = { blank:'blank', launch:'launch', campaign:'campaign', show:'event' }; const r = await ctx.api.post('/projects', { name:v.name.trim(), startDate:v.start, endDate:v.end, template:tplMap[v.tpl] || 'blank' }); ctx.closeOverlay(); ui.project = r.id; ui.tab = 'list'; ctx.toast(tr('项目已创建，按阶段添加任务吧', 'Project created — add tasks by stage')); }
    } catch (e) { failed(e); }
    await reloadLive();
  }
  async function loadComments(taskId) {
    try { const r = await ctx.api.get('/tasks/' + encodeURIComponent(taskId) + '/updates'); const t = tasks.find(x => x.id === taskId); if (t) t.comments = (r.items || []).map(u => ({ by:u.actor_id, at:day(u.created_at), text:T2(u.body) })).reverse(); repaintPanel(); } catch {}
  }

  /* Task hub inbox: every open project task assigned to me shows up in the Task hub automatically. */
  function taskInbox() { return ''; } // Sample projects never become live assignments.
  window.WorkOSProjects = { configure(next) { ctx = next; }, render, analysis, taskInbox, _data:{ sample:true, projects, tasks }, _ui:ui };
})();
