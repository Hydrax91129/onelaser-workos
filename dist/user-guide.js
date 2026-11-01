/*
 * User guide ("使用说明") — a pop-up manual opened from the top bar.
 *
 * Any element with data-guide-open opens the guide; its value picks the first
 * section (tasks, assign, okr, projects, names, hints). Content follows the
 * interface language (WorkI18n.lang). The guide is plain reference text: it
 * reads nothing from the server and changes nothing.
 */
(function () {
  const lang = () => (window.WorkI18n && window.WorkI18n.lang === 'en') ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const PAGE_TO_SECTION = { tasks:'tasks', reports:'start', okr:'okr', projects:'projects', people:'names', org:'names', members:'names' };

  const chip = (cls, zh, en) => `<span class="ug-chip ${cls}">${tr(zh, en)}</span>`;
  const list = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  const steps = items => `<ol class="ug-steps">${items.map(i => `<li>${i}</li>`).join('')}</ol>`;
  const note = (zh, en) => `<p class="ug-note"><i class="ph ph-lightbulb" aria-hidden="true"></i>${tr(zh, en)}</p>`;

  const SECTIONS = [
    ['start', 'ph-compass', '快速上手', 'Getting started', () => `
      <p>${tr('CraftOS 把每个人的工作放在一个地方：别人下达给你的任务、你的 OKR、你参与的项目，都会自动出现在你的任务中心。', 'CraftOS keeps everyone’s work in one place: tasks assigned to you, your OKRs and the projects you join all land in your Task Center automatically.')}</p>
      <table class="ug-table"><tbody>
        <tr><th>${tr('工作中心', 'Work Center')}</th><td>${tr('每天打开先看这里：谁给你下达了任务、哪些快到期、系统和 AI 的催办提醒。', 'Start each day here: who assigned you work, what is due soon, and reminders from the system and AI.')}</td></tr>
        <tr><th>${tr('任务中心', 'Task Center')}</th><td>${tr('你所有的任务：更新进度、改状态、提交完成结果。', 'All your tasks: post progress, set status, submit results.')}</td></tr>
        <tr><th>OKR</th><td>${tr('每月设定目标和关键结果，月底自评、领导评分，分数自动算出。', 'Set objectives and key results each month; self score and leader score at month end, and the total is calculated for you.')}</td></tr>
        <tr><th>${tr('项目管理', 'Projects')}</th><td>${tr('跨部门项目：建任务、分派负责人，任务自动进入负责人的任务中心。', 'Cross-team projects: create tasks and assign owners; tasks go straight to each owner’s Task Center.')}</td></tr>
        <tr><th>${tr('组织架构', 'Org chart')}</th><td>${tr('查看同事、汇报关系和工作地点；填写自己的中英文名字。', 'See colleagues, reporting lines and work locations; fill in your Chinese and English names.')}</td></tr>
      </tbody></table>
      ${note('不确定某个按钮是做什么的？把鼠标停在上面，就会出现说明。', 'Not sure what a button does? Hover over it to see a short explanation.')}`],

    ['tasks', 'ph-kanban', '任务与状态', 'Tasks & status', () => `
      <h3>${tr('任务从哪里来', 'Where tasks come from')}</h3>
      <p>${tr('每条任务名称下方都标有来源：', 'Each task shows its source under the title:')}</p>
      ${list([
        `${chip('src-direct', '直接下达', 'Assigned')} ${tr('同事或领导通过 Assign Task 下达给你。', 'A colleague or leader assigned it with Assign Task.')}`,
        `${chip('src-okr', 'OKR', 'OKR')} ${tr('你的每条 KR 保存后自动变成任务。', 'Every KR you save becomes a task automatically.')}`,
        `${chip('src-project', '项目', 'Project')} ${tr('项目里分派给你的任务。', 'A task assigned to you inside a project.')}`,
        `${chip('src-self', '自建', 'Self')} ${tr('你自己新建的任务。', 'A task you created yourself.')}`
      ])}
      <h3>${tr('哪些内容不能改', 'What you cannot change')}</h3>
      <p>${tr('来自下达、OKR 和项目的任务，执行人<b>不能修改</b>任务名称、截止日期、优先级和负责人，只有设定任务的人可以改。执行人负责更新进度、选择状态、提交完成结果。', 'For tasks that come from an assignment, an OKR or a project, the assignee <b>cannot change</b> the title, due date, priority or owner; only the person who set the task can. The assignee posts progress, chooses the status and submits the result.')}</p>
      <h3>${tr('任务状态', 'Task status')}</h3>
      <table class="ug-table ug-status"><tbody>
        <tr><th>${chip('st-not', '未开始', 'Not started')}</th><td>${tr('每个任务的默认状态。', 'The default for every new task.')}</td></tr>
        <tr><th>${chip('st-working', '进行中', 'Working')}</th><td>${tr('只要更新一次进度，系统自动变为进行中。', 'Posting any progress update switches the task to Working automatically.')}</td></tr>
        <tr><th>${chip('st-hold', '被暂停', 'Paused')}</th><td>${tr('因外部原因暂停。暂停期间即使过了截止日期，也不会自动变为延期。', 'Paused for an outside reason. A paused task never turns Overdue, even past its due date.')}</td></tr>
        <tr><th>${chip('st-review', '待审批', 'Awaiting approval')}</th><td>${tr('已经做完，等待审核人确认。', 'Work is finished and waiting for the reviewer.')}</td></tr>
        <tr><th>${chip('st-done', '完成', 'Done')}</th><td>${tr('选择完成时，必须写清楚完成结果和自我评价，AI 会根据结果自动打分。', 'To mark Done you write the result and a self-evaluation; AI scores it automatically.')}</td></tr>
        <tr><th>${chip('st-overdue', '延期', 'Overdue')}</th><td>${tr('过了截止日期还没完成，系统立即自动变为延期。', 'Past the due date and not finished: the system switches it to Overdue at once.')}</td></tr>
        <tr><th>${chip('st-abandoned', '放弃', 'Abandoned')}</th><td>${tr('任务太难做不到，可以主动选择放弃；连续 15 天没有任何更新，系统也会视为放弃。', 'Choose this when a task cannot be done; a task with no update for 15 days is also treated as Abandoned.')}</td></tr>
      </tbody></table>
      <p>${tr('员工可以选择的状态：进行中、被暂停、待审批、完成、延期、放弃。“未开始”由系统设置，不能手动选回。', 'Statuses you can choose: Working, Paused, Awaiting approval, Done, Overdue, Abandoned. “Not started” is set by the system and cannot be chosen again.')}</p>
      <h3>${tr('常用操作', 'Everyday actions')}</h3>
      ${list([
        tr('点击任务右侧的对话图标，写进度更新。', 'Click the speech-bubble icon on a task to post a progress update.'),
        tr('拖动任务左侧，可以把它移到另一个分组；也可以右键点击任务，选择“移动到分组”。', 'Drag a task by its left edge to another group, or right-click it and choose “Move to group”.'),
        tr('完成后 3 天内可以修改结果；超过 3 天，结果和分数锁定。', 'You can revise a result within 3 days of finishing; after that the result and score are locked.')
      ])}`],

    ['assign', 'ph-paper-plane-tilt', '给同事下达任务', 'Assign Task', () => `
      <p>${tr('任何人都可以给公司里的任何同事下达任务。', 'Anyone can assign a task to any colleague in the company.')}</p>
      ${steps([
        tr('在任务中心点击右上角 <b>Assign Task</b>。', 'In the Task Center, click <b>Assign Task</b> at the top right.'),
        tr('选择负责人，写清楚任务名称、说明和验收标准（做到什么算完成）。', 'Pick the owner and write the title, a description and the acceptance criteria (what counts as done).'),
        tr('设定截止日期和优先级，点击下达。', 'Set the due date and priority, then click Assign.')
      ])}
      <p>${tr('下达后：', 'After you assign it:')}</p>
      ${list([
        tr('任务立即出现在对方的任务中心和工作中心，标注“由你下达”。', 'The task appears at once in their Task Center and Work Center, marked as assigned by you.'),
        tr('AI 会跟踪进度：快到期、已逾期或 3 天没有更新时，通过系统内提醒和钉钉工作通知催办。', 'AI follows up: when it is due soon, overdue or has had no update for 3 days, it sends in-app and DingTalk reminders.'),
        tr('对方提交完成结果后，你作为审核人确认。', 'When they submit the result, you review it as the reviewer.')
      ])}
      ${note('截止日期一旦下达，执行人不能自己改。需要延期，请对方在任务里写更新说明，由你来调整。', 'Once assigned, the owner cannot move the due date. If more time is needed, they explain it in an update and you adjust it.')}`],

    ['okr', 'ph-target', 'OKR 怎么填、怎么算分', 'OKRs & scoring', () => `
      <h3>${tr('填写 OKR', 'Writing your OKR')}</h3>
      ${steps([
        tr('新建目标（O），填写分值。一个月所有目标合计 <b>100 分</b>，例如 O1 = 40 分。', 'Add an objective (O) and give it points. All objectives for the month total <b>100 points</b>, e.g. O1 = 40.'),
        tr('在目标下添加关键结果（KR），填写<b>目标值</b>：可以写“完成”，也可以写任何明确的数字，例如“30 条询盘”。', 'Under it add key results (KR) with a <b>target</b>: “Done”, or any clear number such as “30 enquiries”.'),
        tr('给每条 KR 填权重，表示占这个目标的百分比。同一目标下的 KR 权重合计 100%。', 'Give each KR a weight: its share of the objective. KR weights under one objective total 100%.'),
        tr('保存后，每条 KR 自动变成你的任务，进入任务中心。', 'Once saved, each KR becomes a task in your Task Center.')
      ])}
      <h3>${tr('评分等级', 'Score levels')}</h3>
      <div class="ug-levels">
        ${chip('l0', '0 未开展', '0 Not started')}${chip('l25', '25 严重滞后', '25 Far behind')}${chip('l50', '50 部分完成', '50 Partly done')}${chip('l75', '75 接近完成', '75 Nearly done')}${chip('l100', '100 完成', '100 Done')}${chip('l125', '125 完成且卓越 ★', '125 Exceptional ★')}
      </div>
      <h3>${tr('分数怎么算', 'How the score is calculated')}</h3>
      ${list([
        tr('每条 KR：<b>最终评分 = 自评 × 50% + 领导评分 × 50%</b>。自评和领导评分并排显示。', 'Each KR: <b>final = self score × 50% + leader score × 50%</b>. Both scores are shown side by side.'),
        tr('KR 得分 = 目标分值 × KR 权重 × 最终评分 ÷ 100。', 'KR points = objective points × KR weight × final score ÷ 100.'),
        tr('评 125 分的 KR 会超出分值，可以把 OKR 总分提高到 100 分以上。', 'A KR scored 125 earns more than its share and can lift the OKR total above 100.'),
        tr('如果自评不实，领导可以直接把这条 KR 评为 0 分（否决），最终评分即为 0。', 'If a self score is not truthful, the leader can give that KR 0 (veto) and its final score becomes 0.')
      ])}
      <div class="ug-example"><b>${tr('举例', 'Example')}</b>${tr('O1 = 40 分，KR1 权重 25%，即 KR1 满分 10 分。自评 125、领导评 75，最终评分 = (125 + 75) ÷ 2 = 100，KR1 得 10 分。', 'O1 = 40 points and KR1 weighs 25%, so KR1 is worth 10 points. Self 125 and leader 75 give a final of (125 + 75) ÷ 2 = 100, so KR1 earns 10 points.')}</div>
      <h3>${tr('每月节奏（以 11 月 OKR 为例）', 'Monthly rhythm (November OKR as an example)')}</h3>
      <table class="ug-table"><tbody>
        <tr><th>${tr('10 月 25 日起', 'From Oct 25')}</th><td>${tr('设置 11 月 OKR，系统每天提醒，直到目标合计 100 分。', 'Set the November OKR; daily reminders until objectives total 100 points.')}</td></tr>
        <tr><th>${tr('11 月 25 日 – 30 日', 'Nov 25 – 30')}</th><td>${tr('员工自评。30 日前没有自评的 KR，系统自动按 0 分自评。', 'Self scoring. Any KR without a self score by the 30th is scored 0 automatically.')}</td></tr>
        <tr><th>${tr('11 月 30 日 – 12 月 3 日', 'Nov 30 – Dec 3')}</th><td>${tr('领导评分，系统每天催办，直到评分完成。', 'Leader scoring, with daily reminders until it is done.')}</td></tr>
      </tbody></table>
      ${note('OKR 页面顶部的时间条会显示当前处在哪个阶段。', 'The timeline at the top of the OKR page shows which phase you are in.')}`],

    ['projects', 'ph-squares-four', '项目管理', 'Projects', () => `
      ${steps([
        tr('点击“新建项目”，选择模板，填写开始和结束日期。成员可以来自不同部门。', 'Click “New project”, choose a template and set the start and end dates. Members can come from any department.'),
        tr('在分组里添加任务，选择负责人和截止日期。', 'Add tasks in a group and choose an owner and due date.'),
        tr('任务确定后，自动进入负责人的任务中心，来源标为“项目”。负责人不能自己改任务名称和截止日期。', 'Each task goes straight to the owner’s Task Center, marked as a project task. The owner cannot change its title or due date.'),
        tr('负责人在任务中心或项目里更新进度、选择状态；项目进度自动汇总。', 'Owners post progress and set status from the Task Center or the project; project progress rolls up automatically.')
      ])}
      ${list([
        tr('表格、看板、时间线和日历四种视图，看的是同一批任务。', 'Table, board, timeline and calendar views all show the same tasks.'),
        tr('项目负责人可以发布项目状态（正常 / 有风险 / 延期），让大家知道整体情况。', 'The project owner can post a status (on track / at risk / off track) so everyone sees the overall picture.')
      ])}`],

    ['names', 'ph-translate', '名字与翻译', 'Names & translation', () => `
      <h3>${tr('中英文名字', 'Chinese and English names')}</h3>
      <p>${tr('每个人都要填写自己的中文名和英文名。首次登录时系统会提示填写，之后可以在“个人设置”里修改；管理员也可以在组织架构里帮忙补充。界面是中文时显示中文名，英文时显示英文名。', 'Everyone fills in a Chinese and an English name. You are asked on first sign-in and can change them later in Personal settings; admins can also complete them in the org chart. The Chinese interface shows Chinese names, the English one shows English names.')}</p>
      <h3>${tr('自动翻译', 'Automatic translation')}</h3>
      <p>${tr('OKR、项目内容和任务分组名称只需要用一种语言写。切换界面语言后，系统会自动翻译成中文或英文，方便中美团队协作。', 'Write OKRs, project content and task group names in one language. When you switch the interface language, the system translates them to Chinese or English so both teams can work together.')}</p>
      <h3>${tr('工作地点', 'Work location')}</h3>
      <p>${tr('工作地点由管理员在组织架构中设置，员工本人不能修改。', 'Work locations are set by an admin in the org chart; employees cannot change their own.')}</p>`],

    ['hints', 'ph-cursor-click', '悬停提示', 'Hover hints', () => `
      <p>${tr('系统里几乎每个按钮、输入框和表头都有说明：把鼠标停在上面一秒，就会看到“用途”和“怎么用”。', 'Almost every button, field and column header has a hint: hover for a second to see what it is for and how to use it.')}</p>
      ${list([
        tr('手机或平板上，点击页面标题旁的图标查看本页说明。', 'On a phone or tablet, tap the icon beside the page title to see the page guide.'),
        tr('熟悉以后，可以点击顶部的 (?) 按钮关闭提示，再点一次重新开启。', 'Once you know your way around, click the (?) button at the top to turn hints off; click again to turn them back on.'),
        tr('随时点击顶部的“使用说明”重新打开本说明。', 'Click “User guide” at the top any time to reopen this guide.')
      ])}`]
  ];

  let current = 'start', lastFocus = null;
  function html() {
    const body = SECTIONS.find(s => s[0] === current) || SECTIONS[0];
    return `<div class="ug-backdrop" data-guide-close></div><section class="ug-dialog" role="dialog" aria-modal="true" aria-labelledby="ug-title">
      <header class="ug-head"><i class="ph ph-book-open-text" aria-hidden="true"></i><h2 id="ug-title">${tr('使用说明', 'User guide')}</h2><button class="ug-close" data-guide-close aria-label="${tr('关闭', 'Close')}"><i class="ph ph-x" aria-hidden="true"></i></button></header>
      <div class="ug-body"><nav class="ug-nav" aria-label="${tr('说明目录', 'Guide sections')}">${SECTIONS.map(([id, ic, zh, en]) => `<button data-guide-section="${id}" class="${id === current ? 'on' : ''}" ${id === current ? 'aria-current="true"' : ''}><i class="ph ${ic}" aria-hidden="true"></i>${esc(tr(zh, en))}</button>`).join('')}</nav>
      <article class="ug-content" tabindex="-1"><h2>${esc(tr(body[2], body[3]))}</h2>${body[4]()}</article></div></section>`;
  }
  function root() { let el = document.getElementById('user-guide'); if (!el) { el = document.createElement('div'); el.id = 'user-guide'; document.body.appendChild(el); } return el; }
  function open(section) {
    current = SECTIONS.some(s => s[0] === section) ? section : (PAGE_TO_SECTION[section] || 'start');
    if (!document.getElementById('user-guide')?.innerHTML) lastFocus = document.activeElement;
    root().innerHTML = html();
    root().querySelector('.ug-close')?.focus();
    root().querySelector('.ug-nav .on')?.scrollIntoView?.({ block:'nearest', inline:'center' });
  }
  function close() { const el = document.getElementById('user-guide'); if (el) el.innerHTML = ''; lastFocus?.focus?.(); lastFocus = null; }

  document.addEventListener('click', e => {
    const opener = e.target.closest?.('[data-guide-open]');
    if (opener) { e.preventDefault(); open(opener.dataset.guideOpen); return; }
    if (e.target.closest?.('[data-guide-close]')) { e.preventDefault(); close(); return; }
    const sec = e.target.closest?.('[data-guide-section]');
    if (sec) { e.preventDefault(); current = sec.dataset.guideSection; root().innerHTML = html(); root().querySelector(`[data-guide-section="${current}"]`)?.focus(); root().querySelector('.ug-content').scrollTop = 0; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('user-guide')?.innerHTML) close(); });

  window.WorkOSGuide = { open, close, sections: () => SECTIONS.map(s => s[0]) };
})();
