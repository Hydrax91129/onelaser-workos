'use strict';
/* Workbench home, OKR analysis and the AI insight cards shown on every report.
 *  - WorkOSReports.home(): the personal workbench (first page in the Workspace section):
 *    an encouraging greeting plus visual answers to "what haven't I done / what isn't going well".
 *  - WorkOSReports.okr(): OKR analysis — my OKR completion and my team's, against time elapsed.
 *  - WorkOSInsights.slot(board): 3–4 sentence analysis for 'home' | 'okr' | 'project' | 'task'.
 *    When the backend offers capabilities.aiInsights the sentences come from POST /insights
 *    (aggregated numbers only, cached server-side) and refresh whenever the numbers change;
 *    otherwise an explainable rule-based summary is shown and labeled as such.
 */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let ctx = null;
  const S = () => ctx.state();
  const lang = () => ctx?.lang?.() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  const me = () => S().actor;
  const now = () => Date.now();
  const DAY = 864e5;
  const okrH = () => window.WorkOSOkrBoard?._helpers;
  const ownerName = id => { const o = S().objectives.find(x => x.owner_id === id && (x.owner_name_zh || x.owner_name_en || x.owner_name)); return o ? (lang() === 'en' ? o.owner_name_en || o.owner_name_zh || o.owner_name : o.owner_name_zh || o.owner_name_en || o.owner_name) : ''; };
  const nameOf = id => S().directory.find(u => u.id === id)?.display_name || (me()?.id === id ? me().display_name : '') || ownerName(id) || id || '—';
  const fmtDate = v => { try { return new Intl.DateTimeFormat(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'short', day:'numeric' }).format(new Date(v)); } catch { return v; } };
  const avatar = (u, n) => window.WorkOSPeople?.avatar ? window.WorkOSPeople.avatar(u, n) : '';

  /* ---------- shared math ---------- */
  function monthElapsed(period) {
    const d = new Date(), m = /^(\d{4})-(\d{2})$/.exec(period || '');
    const y = m ? +m[1] : d.getFullYear(), mo = m ? +m[2] - 1 : d.getMonth();
    const start = new Date(y, mo, 1).getTime(), end = new Date(y, mo + 1, 1).getTime();
    return Math.round(Math.max(0, Math.min(1, (now() - start) / (end - start))) * 100);
  }
  const objPct = o => okrH()?.objectivePct ? okrH().objectivePct(o) : null;
  const avgPct = list => okrH()?.averagePct ? okrH().averagePct(list) : null;
  const krPct = k => window.WorkOSOkr?.metric ? window.WorkOSOkr.metric(k).progress : null;
  function taskFacts(list) {
    const t = now(), open = list.filter(x => x.status !== 'accepted');
    const overdue = open.filter(x => new Date(x.due_at).getTime() < t);
    const dueSoon = open.filter(x => { const d = new Date(x.due_at).getTime(); return d >= t && d < t + 3 * DAY; });
    const accepted = list.filter(x => x.status === 'accepted');
    const timed = accepted.filter(x => x.accepted_at && Number.isFinite(new Date(x.accepted_at).getTime()) && Number.isFinite(new Date(x.due_at).getTime()));
    const onTime = timed.filter(x => new Date(x.accepted_at) <= new Date(x.due_at));
    const by = s => list.filter(x => x.status === s).length;
    return { total:list.length, open:open.length, overdue:overdue.length, dueSoon:dueSoon.length, accepted:accepted.length, revision:by('revision'), blocked:by('blocked'), submitted:by('submitted'), doing:by('doing'), planned:by('planned'),
      completion:list.length ? Math.round(accepted.length / list.length * 100) : null, onTime:timed.length ? Math.round(onTime.length / timed.length * 100) : null, onTimeKnown:timed.length, onTimeUnknown:accepted.length - timed.length, overdueList:overdue, dueSoonList:dueSoon };
  }
  function myObjectives() { return S().objectives.filter(o => o.owner_id === me().id && o.level !== 'company'); }
  function okrPeople() {
    const byOwner = new Map();
    S().objectives.filter(o => o.owner_id && o.level !== 'company').forEach(o => { if (!byOwner.has(o.owner_id)) byOwner.set(o.owner_id, []); byOwner.get(o.owner_id).push(o); });
    return [...byOwner.entries()].map(([id, objs]) => ({ id, name:nameOf(id), objs, pct:avgPct(objs), krs:objs.flatMap(o => S().krs.filter(k => k.objective_id === o.id)) })).sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1));
  }
  function projectRows(includeSample = false) {
    const pj = window.WorkOSProjects; if (!pj?._data || (pj._data.sample === true && !includeSample)) return [];
    const { projects, tasks } = pj._data, today = new Date().toISOString().slice(0, 10);
    return projects.map(p => {
      const ts = tasks.filter(t => t.project === p.id), done = ts.filter(t => t.status === 'done').length;
      const span = Math.max(1, (new Date(p.end) - new Date(p.start)) / DAY), elapsed = Math.max(0, Math.min(1, (new Date(today) - new Date(p.start)) / DAY / span));
      const progress = ts.length ? done / ts.length : 0, od = ts.filter(t => t.status !== 'done' && t.due < today).length, stuck = ts.filter(t => t.status === 'stuck').length;
      const risk = Math.max(0, Math.min(100, Math.round((elapsed - progress) * 120 + od * 12 + stuck * 15 + (p.health === 'off_track' ? 20 : p.health === 'at_risk' ? 10 : 0))));
      return { p, name:typeof p.name === 'object' ? p.name[lang()] || p.name.zh : p.name, progress:Math.round(progress * 100), elapsed:Math.round(elapsed * 100), overdue:od, stuck, risk, mine:p.members.includes(me().id) || p.owner === me().id };
    }).sort((a, b) => b.risk - a.risk);
  }

  /* ---------- facts per board: aggregated numbers only (what the AI sees) ---------- */
  const FACTS = {
    home() {
      const mine = taskFacts(S().tasks.filter(t => t.owner_id === me().id));
      const toReview = S().tasks.filter(t => t.reviewer_id === me().id && t.status === 'submitted').length;
      const objs = myObjectives(), period = objs[0]?.planning?.period;
      const pj = projectRows().filter(r => r.mine);
      const pjTasks = window.WorkOSProjects?._data?.sample === true ? 0 : window.WorkOSProjects?._data?.tasks.filter(t => t.owner === me().id && t.status !== 'done').length || 0;
      return { name:me().display_name, openTasks:mine.open, overdue:mine.overdue, dueIn3Days:mine.dueSoon, returned:mine.revision, blocked:mine.blocked, toReview, completionPct:mine.completion, onTimePct:mine.onTime, onTimeKnown:mine.onTimeKnown, onTimeUnknown:mine.onTimeUnknown,
        okrObjectives:objs.length, okrPct:avgPct(objs), monthElapsedPct:monthElapsed(period), projects:pj.length, riskyProjects:pj.filter(r => r.risk >= 30).map(r => r.name).slice(0, 3), openProjectTasks:pjTasks };
    },
    okr() {
      const objs = myObjectives(), period = objs[0]?.planning?.period, people = okrPeople();
      const behind = people.filter(p => p.pct !== null && p.pct < monthElapsed(period) - 15);
      return { myObjectives:objs.length, myPct:avgPct(objs), monthElapsedPct:monthElapsed(period), myLaggingKrs:objs.flatMap(o => S().krs.filter(k => k.objective_id === o.id)).filter(k => krPct(k) !== null && krPct(k) !== undefined && krPct(k) < monthElapsed(period) - 15).length,
        teamPeople:people.length, teamPct:avgPct(people.flatMap(p => p.objs)), peopleBehind:behind.map(p => p.name).slice(0, 4), peopleWithoutKrs:people.filter(p => !p.krs.length).map(p => p.name).slice(0, 4),
        companyPct:avgPct(S().objectives.filter(o => o.level === 'company')) };
    },
    project() {
      const rows = projectRows(true);
      return { projects:rows.length, highRisk:rows.filter(r => r.risk >= 60).map(r => `${r.name} (${r.risk})`).slice(0, 3), mediumRisk:rows.filter(r => r.risk >= 30 && r.risk < 60).map(r => r.name).slice(0, 3),
        overdueTasks:rows.reduce((n, r) => n + r.overdue, 0), stuckTasks:rows.reduce((n, r) => n + r.stuck, 0), avgProgressPct:rows.length ? Math.round(rows.reduce((n, r) => n + r.progress, 0) / rows.length) : null,
        behindSchedule:rows.filter(r => r.progress < r.elapsed - 10).map(r => `${r.name}: ${r.progress}% done / ${r.elapsed}% time`).slice(0, 3) };
    },
    task() {
      const team = window.WorkOSPeople?._ui?.team;
      if (team?.members?.length) {
        const m = team.members, t = team.totals;
        return { scope:team.scope, people:m.length, total:t.total, accepted:t.accepted, completionPct:t.completionRate, onTimePct:t.onTimeRate, onTimeKnown:t.onTimeKnown, onTimeUnknown:t.onTimeUnknown, overdue:t.overdue,
          mostOverdue:[...m].sort((a, b) => b.stats.overdue - a.stats.overdue).filter(x => x.stats.overdue).slice(0, 3).map(x => `${x.display_name} (${x.stats.overdue})`),
          lowestCompletion:[...m].filter(x => x.stats.completionRate !== null).sort((a, b) => a.stats.completionRate - b.stats.completionRate).slice(0, 2).map(x => `${x.display_name} ${x.stats.completionRate}%`),
          returned:m.reduce((n, x) => n + (x.stats.revision || 0), 0) };
      }
      const f = taskFacts(S().tasks);
      return { scope:'visible', total:f.total, accepted:f.accepted, completionPct:f.completion, onTimePct:f.onTime, onTimeKnown:f.onTimeKnown, onTimeUnknown:f.onTimeUnknown, overdue:f.overdue, returned:f.revision, blocked:f.blocked, awaitingReview:f.submitted };
    },
  };

  /* ---------- rule-based analysis (fallback, always explainable) ---------- */
  const list = a => a.join(lang() === 'en' ? ', ' : '、');
  const RULES = {
    home(f) {
      const out = [];
      if (f.overdue) out.push(tr(`你有 ${f.overdue} 项任务已经逾期，建议今天先处理它们，或者和负责人说明新的完成时间。`, `${f.overdue} of your tasks are overdue — handle them first today, or agree a new date with the reviewer.`));
      else if (f.openTasks) out.push(tr(`你手上有 ${f.openTasks} 项进行中的任务，目前没有逾期，节奏很好。`, `You have ${f.openTasks} open tasks and nothing overdue — good pace.`));
      else out.push(tr('目前没有分派给你的进行中任务，可以主动认领新工作或推进 OKR。', 'No open tasks right now — a good moment to pick up new work or push your OKRs.'));
      if (f.okrPct !== null && f.okrPct !== undefined) out.push(f.okrPct >= f.monthElapsedPct - 10 ? tr(`OKR 完成 ${f.okrPct}%，目标周期已过 ${f.monthElapsedPct}%，进度跟得上。`, `OKRs are ${f.okrPct}% done with ${f.monthElapsedPct}% of the objective cycle elapsed — on pace.`) : tr(`OKR 完成 ${f.okrPct}%，但目标周期已过 ${f.monthElapsedPct}%，需要加快关键结果的推进。`, `OKRs are ${f.okrPct}% done but ${f.monthElapsedPct}% of the objective cycle elapsed — speed up your key results.`));
      else if (f.okrObjectives) out.push(tr(`已有 ${f.okrObjectives} 个目标，进度暂不可计算；请补充关键结果的量化指标或测量记录。`, `You have ${f.okrObjectives} objectives; progress is unknown. Add measurable key results or measurements.`));
      else out.push(tr('你还没有设置 OKR，先定 1–3 个目标，工作会更聚焦。', 'You have no OKRs yet — set 1–3 objectives to stay focused.'));
      if (f.returned || f.toReview) out.push(tr(`${f.returned ? `${f.returned} 项成果被退回需要补充` : ''}${f.returned && f.toReview ? '，' : ''}${f.toReview ? `${f.toReview} 项同事的成果等你验收` : ''}，及时处理能让团队不卡住。`, `${f.returned ? `${f.returned} deliverables were returned for more evidence` : ''}${f.returned && f.toReview ? '; ' : ''}${f.toReview ? `${f.toReview} colleague submissions await your review` : ''} — clearing these keeps the team moving.`));
      if (f.riskyProjects?.length) out.push(tr(`你参与的项目里，${list(f.riskyProjects)} 有延期风险，留意相关任务。`, `${list(f.riskyProjects)} — projects you are on — risk slipping; watch your tasks there.`));
      else if (f.dueIn3Days) out.push(tr(`未来 3 天有 ${f.dueIn3Days} 项任务到期，提前准备好验收材料。`, `${f.dueIn3Days} tasks are due in 3 days — prepare the evidence early.`));
      return out.slice(0, 4);
    },
    okr(f) {
      const out = [];
      out.push(f.myPct === null || f.myPct === undefined ? tr('你的 OKR 暂时还没有可计算的进度，先为目标补充可量化的关键结果。', 'None of your OKRs has measurable progress yet — add quantified key results.') : tr(`你的 OKR 完成 ${f.myPct}%，目标周期已过 ${f.monthElapsedPct}%${f.myPct >= f.monthElapsedPct - 10 ? '，进度正常' : '，落后于时间进度'}。`, `Your OKRs are ${f.myPct}% done with ${f.monthElapsedPct}% of the objective cycle elapsed${f.myPct >= f.monthElapsedPct - 10 ? ' — on pace' : ' — behind schedule'}.`));
      if (f.myLaggingKrs) out.push(tr(`有 ${f.myLaggingKrs} 个关键结果明显落后，建议本周更新一次进展并说明下一步。`, `${f.myLaggingKrs} key results are clearly behind — post an update with next steps this week.`));
      if (f.teamPct !== null && f.teamPct !== undefined) out.push(tr(`团队 ${f.teamPeople} 人整体 OKR 完成 ${f.teamPct}%${f.peopleBehind.length ? `，${list(f.peopleBehind)} 落后较多，值得一对一聊一下` : '，大家进度比较均衡'}。`, `The team's ${f.teamPeople} people average ${f.teamPct}%${f.peopleBehind.length ? `; ${list(f.peopleBehind)} are furthest behind — worth a 1:1` : ' and progress is even'}.`));
      if (f.peopleWithoutKrs.length) out.push(tr(`${list(f.peopleWithoutKrs)} 的目标还没有关键结果，无法衡量进度。`, `${list(f.peopleWithoutKrs)} have objectives without key results, so progress can't be measured.`));
      else if (f.companyPct !== null && f.companyPct !== undefined) out.push(tr(`公司目标整体完成 ${f.companyPct}%。`, `Company objectives are ${f.companyPct}% complete.`));
      return out.slice(0, 4);
    },
    project(f) {
      const out = [tr(`共 ${f.projects} 个项目，平均完成 ${f.avgProgressPct ?? 0}%。`, `${f.projects} projects, ${f.avgProgressPct ?? 0}% complete on average.`)];
      if (f.highRisk.length) out.push(tr(`${list(f.highRisk)} 延期风险高，建议本周和负责人确认资源和新的里程碑。`, `${list(f.highRisk)} are at high risk of slipping — confirm resources and milestones with the owners this week.`));
      if (f.behindSchedule.length) out.push(tr(`进度落后于时间的项目：${list(f.behindSchedule)}。`, `Behind schedule: ${list(f.behindSchedule)}.`));
      if (f.overdueTasks || f.stuckTasks) out.push(tr(`所有项目共有 ${f.overdueTasks} 项逾期任务、${f.stuckTasks} 项卡住的任务，先解决卡住的任务效果最大。`, `${f.overdueTasks} overdue and ${f.stuckTasks} stuck tasks across projects — unblocking stuck work pays off most.`));
      else out.push(tr('目前没有逾期或卡住的项目任务。', 'No overdue or stuck project tasks right now.'));
      return out.slice(0, 4);
    },
    task(f) {
      const percent = v => typeof v === 'number' && Number.isFinite(v) ? `${v}%` : '—';
      const out = [tr(`${f.people ? `团队 ${f.people} 人` : '可见范围内'}共 ${f.total} 项任务，完成度 ${percent(f.completionPct)}，准时率 ${percent(f.onTimePct)}。`, `${f.people ? `${f.people} people` : 'Visible tasks'}: ${f.total} tasks, ${percent(f.completionPct)} complete, ${percent(f.onTimePct)} on time.`)];
      if (f.onTimeUnknown) out.push(tr(`有 ${f.onTimeUnknown} 项已验收任务缺少有效验收时间，准时率仅覆盖 ${f.onTimeKnown || 0} 项已核实记录。`, `${f.onTimeUnknown} accepted tasks have no valid acceptance time; on-time rate covers ${f.onTimeKnown || 0} verified records.`));
      if (f.overdue) out.push(f.mostOverdue?.length ? tr(`有 ${f.overdue} 项任务逾期，主要集中在 ${list(f.mostOverdue)}。`, `${f.overdue} tasks are overdue, mostly with ${list(f.mostOverdue)}.`) : tr(`有 ${f.overdue} 项任务逾期。`, `${f.overdue} tasks are overdue.`));
      else out.push(tr('没有逾期任务，执行情况良好。', 'No overdue tasks — execution is healthy.'));
      if (f.lowestCompletion?.length) out.push(tr(`完成度较低的是 ${list(f.lowestCompletion)}，可以看看是否任务太多或标准不清楚。`, `Lowest completion: ${list(f.lowestCompletion)} — check for overload or unclear acceptance criteria.`));
      if (f.returned) out.push(tr(`${f.returned} 项成果被退回补充，说明验收标准还可以写得更明确。`, `${f.returned} deliverables were returned — acceptance criteria could be clearer.`));
      else if (f.awaitingReview) out.push(tr(`${f.awaitingReview} 项成果等待验收，及时验收能提高准时率。`, `${f.awaitingReview} deliverables await review — prompt reviews raise the on-time rate.`));
      return out.slice(0, 4);
    },
  };

  /* ---------- AI insight card ---------- */
  const cache = new Map(); // board -> { key, sentences, at, source, pending, error }
  const aiOn = () => S().capabilities?.aiInsights === true;
  async function fetchAi(board, key, facts) {
    const entry = { key, pending:true, sentences:cache.get(board)?.sentences, source:cache.get(board)?.source, at:cache.get(board)?.at };
    cache.set(board, entry);
    try {
      const r = await ctx.api.request('/insights', { method:'POST', body:{ board, lang:lang(), facts } });
      if (Array.isArray(r?.sentences) && r.sentences.length) cache.set(board, { key, sentences:r.sentences.slice(0, 4), at:r.generatedAt || new Date().toISOString(), source:'ai' });
      else cache.set(board, { key, error:true });
    } catch { cache.set(board, { key, error:true }); }
    ctx.rerender();
  }
  function slot(board) {
    if (!ctx || !FACTS[board]) return '';
    let facts; try { facts = FACTS[board](); } catch { return ''; }
    const key = lang() + JSON.stringify(facts);
    let c = cache.get(board);
    if (aiOn() && (!c || c.key !== key) && !c?.pending) { fetchAi(board, key, facts); c = cache.get(board); }
    const ai = aiOn() && c?.source === 'ai' && c.sentences;
    const sentences = ai ? c.sentences : RULES[board](facts);
    const label = ai ? tr('AI 分析', 'AI analysis') : tr('自动分析', 'Auto analysis');
    const meta = ai ? `${tr('更新于', 'Updated')} ${new Date(c.at).toLocaleTimeString(lang() === 'en' ? 'en-US' : 'zh-CN', { hour:'2-digit', minute:'2-digit' })}${c.pending ? ' · ' + tr('正在更新…', 'refreshing…') : ''}` : aiOn() && c?.pending ? tr('AI 正在生成…', 'AI is writing…') : tr('根据当前数据实时生成，数据变化后自动更新', 'Generated from live data; updates as numbers change');
    return `<section class="ri-card ${ai ? 'ai' : ''}" data-ri-board="${board}"><div class="ri-head"><span class="ri-badge">${icon('sparkle')} ${label}</span><span class="ri-meta">${esc(meta)}</span>${aiOn() ? `<button class="ri-refresh" data-ri="refresh" data-board="${board}" title="${tr('重新生成', 'Regenerate')}">${icon('arrows-clockwise')}</button>` : ''}</div>
      <ol class="ri-list">${sentences.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>`;
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-ri="refresh"]'); if (!t || !ctx) return;
    e.preventDefault(); const b = t.dataset.board; cache.delete(b);
    if (aiOn()) { const f = FACTS[b](); fetchAi(b, lang() + JSON.stringify(f) + '#' + Date.now(), f); }
    ctx.rerender();
  });

  /* ---------- visuals ---------- */
  function ring(pct, size = 120, color = '#00c875', label = '') {
    const known = typeof pct === 'number' && Number.isFinite(pct), r = size / 2 - 9, c = 2 * Math.PI * r, v = known ? Math.max(0, Math.min(100, pct)) : 0;
    return `<svg class="ri-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${known ? v + '%' : tr('进度未知', 'Progress unknown')}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ri-track)" stroke-width="12"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="${label ? '47%' : '53%'}" text-anchor="middle" class="ri-ring-v">${known ? v + '%' : '—'}</text>${label ? `<text x="50%" y="66%" text-anchor="middle" class="ri-ring-l">${esc(label)}</text>` : ''}</svg>`;
  }
  const paceBar = (pct, expected, color) => `<div class="ri-pace" title="${tr('竖线 = 按时间应达到的进度', 'Marker = where you should be by now')}"><span style="width:${pct ?? 0}%;background:${color}"></span><i style="left:${expected}%"></i></div>`;
  const toneFor = (pct, expected) => pct === null || pct === undefined ? '#c4c4c4' : pct >= expected - 10 ? '#00c875' : pct >= expected - 25 ? '#fdab3d' : '#e2445c';
  function stackBar(parts) {
    const total = parts.reduce((n, p) => n + p[1], 0) || 1;
    return `<div class="ri-stack">${parts.filter(p => p[1]).map(([label, n, color]) => `<span style="flex:${n};background:${color}" title="${esc(label)} ${n}"></span>`).join('')}</div><ul class="ri-legend">${parts.map(([label, n, color]) => `<li><i style="background:${color}"></i>${esc(label)}<b>${n}</b></li>`).join('')}</ul>`;
  }

  /* ---------- assigned work: who gave me tasks, what I assigned, AI follow-ups ---------- */
  let assign = null, assignAt = 0, assignLoading = false;
  function loadAssign() {
    if (!S().capabilities?.assignTasks || assignLoading || (assign && Date.now() - assignAt < 60000)) return;
    assignLoading = true;
    Promise.all([ctx.api.get('/tasks/assignments'), ctx.api.get('/nudges')]).then(([a, n]) => { assign = { ...a, nudges:n.items || [], unread:n.unread || 0 }; assignAt = Date.now(); })
      .catch(() => { assign = assign || { toMe:[], byMe:[], nudges:[], unread:0 }; assignAt = Date.now(); }).finally(() => { assignLoading = false; ctx.rerender(); });
  }
  const isDone = t => t.status === 'accepted' || t.board_status === 'done';
  // One final score per completion: a person's score if given, otherwise the AI's (older API rows only carry ai_score).
  const finalScore = c => c?.final_score != null ? Number(c.final_score) : c?.ai_status === 'scored' && c.ai_score != null ? Number(c.ai_score) : null;
  const scoreSource = c => c?.score_source || (c?.ai_status === 'scored' ? 'ai' : null);
  const scoreTag = c => { const v = finalScore(c); return v == null ? '' : ` ${v}/10 · ${scoreSource(c) === 'human' ? tr('人工评分', 'by a person') : tr('AI 评分', 'by AI')}`; };
  const dueTag = t => { const d = new Date(t.due_at).getTime(), days = Math.ceil((d - Date.now()) / 864e5); if (isDone(t)) return `<em class="ri-due done">${tr('已完成', 'Done')}${scoreTag(t.completion)}</em>`; if (days < 0) return `<em class="ri-due over">${tr(`逾期 ${-days} 天`, `${-days}d overdue`)}</em>`; if (days <= 3) return `<em class="ri-due soon">${tr(`剩 ${days} 天`, `${days}d left`)}</em>`; return `<em class="ri-due">${new Date(t.due_at).toLocaleDateString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'short', day:'numeric' })}</em>`; };
  // Titles and AI messages follow the interface language (translate.js); names come from the localized directory.
  const tx = v => window.WorkOSTranslate ? window.WorkOSTranslate.html(v) : esc(v);
  const who = (id, fallback, names) => (id && (S().directory || []).find(u => u.id === id)?.display_name) || (names && (lang() === 'en' ? names.en || names.zh : names.zh || names.en)) || fallback || '';
  const okrCode = t => { const r = t.okr_ref || {}; return (r.o ? 'O' + r.o : 'OKR') + (r.kr ? ' · KR' + r.kr : ''); };
  const srcLabel = t => t.source_kind === 'okr' ? `<span class="ri-src okr" title="${esc(window.WorkOSTranslate ? window.WorkOSTranslate.text(t.kr_title || '') : t.kr_title || '')}">${icon('target')} ${esc(okrCode(t))}</span>` : t.source_kind === 'project' ? `<span class="ri-src" title="${esc(t.project_name || '')}">${icon('folder')} ${t.project_name ? tx(t.project_name) : tr('项目', 'Project')}</span>` : `<span class="ri-src direct">${icon('paper-plane-tilt')} ${esc(who(t.assigned_by_id, t.assigned_by_name, t.assigned_by_names))}</span>`;
  const nudged = new Set();
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-ri-nudge]'); if (!b || !ctx) return; e.preventDefault(); e.stopPropagation(); if (b.disabled) return; b.disabled = true;
    try {
      if (b.dataset.riNudge === 'due') { const r = await ctx.api.post('/tasks/nudge-due', {}); (assign?.byMe || []).filter(t => !isDone(t) && new Date(t.due_at).getTime() < Date.now() + 3 * 864e5).forEach(t => nudged.add(t.id)); ctx.toast?.(r.sent ? tr(`已催办 ${r.sent} 项任务，负责人会收到提醒${r.alreadyToday ? `；另有 ${r.alreadyToday} 项今天已催过` : ''}`, `Reminded ${r.sent} task owners${r.alreadyToday ? `; ${r.alreadyToday} already reminded today` : ''}`) : tr('这些任务今天都已经催办过了', 'All of these were already reminded today')); }
      else { const r = await ctx.api.post('/tasks/' + encodeURIComponent(b.dataset.riNudge) + '/nudge', {}); nudged.add(b.dataset.riNudge); ctx.toast?.(r.sent ? tr('已催办，负责人会收到提醒', 'Reminder sent to the owner') : tr('今天已经催办过这个任务了', 'Already reminded today')); }
    } catch (x) { ctx.toast?.(x.message || tr('催办失败', 'Could not send the reminder')); }
    ctx.rerender();
  }, true);
  function assignPanel() {
    if (!S().capabilities?.assignTasks) return '';
    loadAssign();
    if (!assign) return '';
    const toMe = assign.toMe.filter(t => !isDone(t)), byMe = assign.byMe, open = byMe.filter(t => !isDone(t));
    const late = open.filter(t => new Date(t.due_at).getTime() < Date.now()).length;
    const dueSoon = open.filter(t => new Date(t.due_at).getTime() < Date.now() + 3 * 864e5);
    const nudges = assign.nudges.slice(0, 4);
    if (!toMe.length && !byMe.length && !nudges.length) return '';
    return `<div class="ri-grid ri-assign">
      <section class="ri-panel"><h3>${icon('tray-arrow-down')} ${tr('别人给我下达的任务', 'Assigned to me')} <b>${toMe.length}</b></h3>
        ${toMe.length ? toMe.slice(0, 6).map(t => `<button class="ri-row" data-live-task="${esc(t.id)}">${srcLabel(t)}<span class="ri-row-t">${tx(t.title)}</span>${dueTag(t)}</button>`).join('') : `<p class="ri-empty">${tr('目前没有别人下达给你的任务。', 'Nothing assigned to you right now.')}</p>`}
        ${nudges.length ? `<div class="ri-nudges"><h4>${icon('bell-ringing')} ${tr('跟进与催办', 'Follow-ups & reminders')}${assign.unread ? ` <b>${assign.unread}</b>` : ''}</h4>${nudges.map(n => `<button class="ri-nudge ${n.read ? '' : 'unread'}" ${n.okr || !n.taskId ? 'data-live-page="okr"' : `data-live-task="${esc(n.taskId)}"`}><span>${n.kind === 'manual' ? `<b class="ri-nudge-tag">${tr('催办', 'Reminder')}</b> ` : ''}${tx(n.message)}</span><em>${n.role === 'assigner' ? tr(`抄送你 · ${esc(who(n.ownerId, n.ownerName, n.ownerNames))}`, `cc · ${esc(who(n.ownerId, n.ownerName, n.ownerNames))}`) : ''} ${new Date(n.createdAt).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</em></button>`).join('')}</div>` : ''}
      </section>
      <section class="ri-panel"><h3>${icon('paper-plane-tilt')} ${tr('我下达的任务', 'Assigned by me')} <b>${open.length}</b>${late ? `<span class="ri-late">${tr(`${late} 项逾期`, `${late} overdue`)}</span>` : ''}${dueSoon.length ? `<button class="ri-nudge-all" data-ri-nudge="due" title="${tr('给 3 天内到期和已逾期任务的负责人各发一条催办提醒（每个任务每天最多一次）', 'Remind the owner of every task due within 3 days or overdue (once per task per day)')}">${icon('bell-ringing')} ${tr(`一键催办 ${dueSoon.length}`, `Remind all ${dueSoon.length}`)}</button>` : ''}</h3>
        ${byMe.length ? byMe.slice(0, 6).map(t => `<div class="ri-row-line"><button class="ri-row" data-live-task="${esc(t.id)}"><span class="ri-src">${icon('user')} ${esc(who(t.owner_id, t.owner_name, t.owner_names))}</span><span class="ri-row-t">${tx(t.title)}</span>${dueTag(t)}</button>${isDone(t) ? '' : nudged.has(t.id) ? `<span class="ri-nudged">${icon('check')} ${tr('已催办', 'Reminded')}</span>` : `<button class="ri-nudge-btn" data-ri-nudge="${esc(t.id)}" title="${tr('提醒负责人尽快更新进展', 'Remind the owner to update progress')}">${icon('bell-ringing')} ${tr('催办', 'Remind')}</button>`}</div>`).join('') : `<p class="ri-empty">${tr('在个人任务点“Assign Task”给同事下达任务，AI 会帮你跟进。', 'Use Assign Task in the Task hub; AI will follow up for you.')}</p>`}
      </section></div>`;
  }

  /* ---------- team leaderboards (aggregated counts for the whole department) ---------- */
  let board = null, boardLoading = false;
  function loadBoard() {
    if (boardLoading || board) return; boardLoading = true;
    ctx.api.get('/reports/leaderboard').then(r => { board = r.items || []; }).catch(() => { board = 'fallback'; }).finally(() => { boardLoading = false; ctx.rerender(); });
  }
  function boardRows() {
    if (Array.isArray(board)) return board.map(x => ({ id:x.id, name:x.display_name, avatar_version:x.avatar_version, total:x.total, done:x.done ?? x.scored_done, scored:x.scored_done, human:x.human_scored || 0, ai:x.ai_scored || 0, score:x.avg_score, overdue:x.overdue }));
    const ids = [...new Set(S().tasks.map(t => t.owner_id))], now = Date.now(), month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    return ids.map(id => { const ts = S().tasks.filter(t => t.owner_id === id), dn = ts.filter(t => t.board_status === 'done' && t.board_done_at && new Date(t.board_done_at) >= month), sc = dn.filter(t => finalScore(t.completion) != null);
      return { id, name:nameOf(id), total:ts.length, done:dn.length, scored:sc.length, human:sc.filter(t => scoreSource(t.completion) === 'human').length, ai:sc.filter(t => scoreSource(t.completion) === 'ai').length, score:sc.length ? Math.round(sc.reduce((n, t) => n + finalScore(t.completion), 0) / sc.length * 10) / 10 : null, overdue:ts.filter(t => t.status !== 'accepted' && t.board_status !== 'done' && new Date(t.due_at).getTime() < now).length }; });
  }
  function leaderboards() {
    loadBoard();
    const rows = boardRows(), medal = i => ['🥇', '🥈', '🥉'][i] || `<b>${i + 1}</b>`;
    const card = (ic, title, sub, color, list, val, empty) => `<section class="ri-lb" style="--c:${color}"><h3>${icon(ic)} ${title}</h3><p>${sub}</p><ol>${list.slice(0, 5).map((x, i) => `<li class="${x.id === me().id ? 'me' : ''}"><span class="ri-medal">${medal(i)}</span>${avatar({ id:x.id, display_name:x.name, avatar_version:x.avatar_version }, 26)}<span class="ri-lb-n">${esc(x.name)}${x.id === me().id ? ` <em>${tr('我', 'me')}</em>` : ''}</span><strong>${val(x)}</strong></li>`).join('') || `<li class="ri-hint">${empty}</li>`}</ol></section>`;
    const by = (f, filter = () => true) => rows.filter(filter).sort((a, b) => f(b) - f(a));
    const mine = rows.find(x => x.id === me().id);
    return `<h2 class="ri-h2">${icon('trophy')} ${tr('本月团队排行榜', 'Team leaderboard this month')}<span class="ri-hint">${tr('完成即上榜；完成后 24 小时内由验收人或下达人评分，没人评分则由 AI 自动评分；每月 1 日重新开始', 'A task counts as soon as it is marked done; the reviewer or assigner scores it within 24 hours, otherwise the AI scores it; resets on the 1st')}</span></h2>
      ${mine ? `<div class="ri-cheer">${icon('hand-heart')} ${mine.done ? tr(`你本月已完成 ${mine.done} 项${mine.score != null ? `，平均评分 ${mine.score}（人工 ${mine.human} 项 · AI ${mine.ai} 项）` : ''}${mine.done > (mine.scored || 0) ? `，${mine.done - (mine.scored || 0)} 项等待评分` : ''}，继续加油！`, `You have completed ${mine.done} this month${mine.score != null ? `, average score ${mine.score} (${mine.human} by a person · ${mine.ai} by AI)` : ''}${mine.done > (mine.scored || 0) ? `, ${mine.done - (mine.scored || 0)} awaiting a score` : ''} — keep going!`) : tr('本月还没有完成的任务，完成一项并写清楚结果，就能上榜！', 'Nothing completed yet this month — finish one with a clear result to get on the board!')}</div>` : ''}
      <div class="ri-lbs">
        ${card('star', tr('质量之星', 'Quality stars'), tr('本月完成任务的平均评分最高（人工评分优先，没人评分则用 AI 评分）', 'Highest average score this month (a person’s score first, otherwise the AI’s)'), '#fdab3d', by(x => x.score ?? -1, x => x.score != null), x => `${x.score.toFixed(1)}<small>/10</small>`, tr('完成任务并获得评分后上榜', 'Appears once a completion is scored'))}
        ${card('check-circle', tr('完成冠军', 'Most completed'), tr('本月完成的任务数量', 'Tasks completed this month'), '#00c875', by(x => x.done, x => x.done > 0), x => `${x.done}<small>${tr('项', '')}</small>`, tr('还没有人完成，先下手为强！', 'Nobody yet — be the first!'))}
        ${card('barbell', tr('劳苦功高', 'Hardest workers'), tr('本月承担的任务最多', 'Most tasks this month'), '#579bfc', by(x => x.total, x => x.total > 0), x => `${x.total}<small>${tr('项', '')}</small>`, tr('暂无任务', 'No tasks yet'))}
        ${card('alarm', tr('逾期大王', 'Overdue kings'), tr('逾期最多，需要大家帮一把', 'Most overdue — give them a hand'), '#e2445c', by(x => x.overdue, x => x.overdue > 0), x => `${x.overdue}<small>${tr('项', '')}</small>`, tr('没有人逾期，太棒了！🎉', 'Nobody is overdue — great! 🎉'))}
      </div>`;
  }

  /* ---------- workbench home ---------- */
  const CHEERS = [
    ['今天也是推进目标的好日子，先把最重要的一件事做完。', 'A good day to move your goals forward — finish the most important thing first.'],
    ['小步快跑，每完成一项都算数。', 'Small steps add up — every finished task counts.'],
    ['专注最关键的 20%，它会带来 80% 的结果。', 'Focus on the vital 20% — it drives 80% of the results.'],
    ['把卡住的事说出来，团队会一起帮你解决。', 'Say what is blocking you — the team will help unblock it.'],
    ['坚持更新进展，让大家看到你的努力。', 'Keep posting progress so everyone sees your work.'],
  ];
  function home() {
    if (!ctx) return '';
    const a = me(), f = FACTS.home(), objs = myObjectives(), mine = S().tasks.filter(t => t.owner_id === a.id), tf = taskFacts(mine);
    const h = new Date().getHours(), greet = h < 12 ? tr('早上好', 'Good morning') : h < 18 ? tr('下午好', 'Good afternoon') : tr('晚上好', 'Good evening');
    const day = Math.floor(now() / DAY), cheer = f.overdue ? ['先清掉逾期任务，你会轻松很多。加油！', 'Clear the overdue items first — you will feel lighter. You’ve got this!'] : !f.openTasks && f.okrPct >= f.monthElapsedPct ? ['做得很棒！所有任务都在掌控之中。', 'Great work — everything is under control.'] : CHEERS[day % CHEERS.length];
    const todo = [
      ['warning-circle', tr('已逾期', 'Overdue'), f.overdue, '#e2445c', tr('超过截止日期还没验收', 'Past due and not accepted')],
      ['clock-countdown', tr('3 天内到期', 'Due in 3 days'), f.dueIn3Days, '#fdab3d', tr('提前准备验收材料', 'Prepare evidence early')],
      ['arrow-u-up-left', tr('被退回待补充', 'Returned'), f.returned, '#a25ddc', tr('按反馈补充后重新提交', 'Add evidence and resubmit')],
      ['seal-check', tr('等我验收', 'Awaiting my review'), f.toReview, '#579bfc', tr('同事已提交成果', 'Submitted by colleagues')],
      ['prohibit', tr('有阻塞', 'Blocked'), f.blocked, '#ff7575', tr('需要协调资源', 'Needs coordination')],
    ];
    const allClear = todo.every(x => !x[2]);
    const pace = f.monthElapsedPct;
    const attention = [
      ...tf.overdueList.map(t => ['#e2445c', tr('逾期', 'Overdue'), t]),
      ...S().tasks.filter(t => t.reviewer_id === a.id && t.status === 'submitted').map(t => ['#579bfc', tr('待验收', 'Review'), t]),
      ...mine.filter(t => t.status === 'revision' && !tf.overdueList.includes(t)).map(t => ['#a25ddc', tr('被退回', 'Returned'), t]),
      ...tf.dueSoonList.map(t => ['#fdab3d', tr('即将到期', 'Due soon'), t]),
    ].slice(0, 8);
    const pj = projectRows().filter(r => r.mine);
    return `<div class="ri">
      <section class="ri-hero"><div class="ri-hero-text"><span class="ri-eyebrow">${icon('sun-horizon')} ${new Intl.DateTimeFormat(lang() === 'en' ? 'en-US' : 'zh-CN', { weekday:'long', month:'long', day:'numeric' }).format(new Date())}</span>
          <h1>${esc(greet)}${lang() === 'en' ? ', ' : '，'}${esc(a.display_name)} 👋</h1><p>${esc(tr(cheer[0], cheer[1]))}</p>
          <div class="ri-hero-actions"><button class="btn primary" data-live-action="new-task">${icon('plus')} ${tr('新建个人任务', 'New task for me')}</button>${S().capabilities?.assignTasks ? `<button class="btn ri-assign-btn" data-live-action="assign-task" title="${tr('给公司任何同事下达任务，你是验收人', 'Give a task to any colleague; you review it')}">${icon('paper-plane-tilt')} ${tr('下达任务给同事', 'Assign Task')}</button>` : ''}<button class="btn" data-live-page="tasks">${icon('list-checks')} ${tr('去个人任务', 'Open Task hub')}</button><button class="btn" data-live-page="okr">${icon('target')} ${tr('更新 OKR', 'Update OKRs')}</button></div></div>
        <div class="ri-hero-rings"><div>${ring(f.completionPct, 112, '#00c875', tr('任务完成', 'Tasks done'))}<span>${tf.accepted}/${tf.total} ${tr('已验收', 'accepted')}</span></div><div>${ring(f.okrPct, 112, toneFor(f.okrPct, pace), 'OKR')}<span>${tr(`目标周期已过 ${pace}%`, `${pace}% of objective cycle elapsed`)}</span></div><div>${ring(f.onTimePct, 112, '#579bfc', tr('准时率', 'On time'))}<span>${f.onTimeUnknown ? tr(`验收时间覆盖 ${f.onTimeKnown}/${f.onTimeKnown + f.onTimeUnknown}`, `Acceptance time coverage ${f.onTimeKnown}/${f.onTimeKnown + f.onTimeUnknown}`) : tr('按时验收的比例', 'Accepted by due date')}</span></div></div></section>
      ${slot('home')}
      ${assignPanel()}
      ${leaderboards()}
      <h2 class="ri-h2">${icon('list-checks')} ${tr('还没做完的事', 'Still to do')}${allClear ? `<span class="ri-ok">${icon('check-circle')} ${tr('全部清零，太棒了！', 'All clear — great job!')}</span>` : ''}</h2>
      <div class="ri-todo">${todo.map(([ic, label, n, color, note]) => `<div class="ri-todo-card ${n ? '' : 'zero'}" style="--c:${color}"><span>${icon(ic)} ${label}</span><strong>${n}</strong><em>${note}</em></div>`).join('')}</div>
      <div class="ri-grid">
        <section class="ri-panel"><h3>${icon('bell-ringing')} ${tr('需要你处理', 'Needs your action')} <b>${attention.length}</b></h3>${attention.map(([color, tag, t]) => `<button class="ri-row" data-live-task="${esc(t.id)}"><i style="background:${color}"></i><span class="ri-tag" style="--c:${color}">${tag}</span><span class="ri-title">${esc(t.title)}</span><span class="ri-meta">${esc(nameOf(t.owner_id))} · ${fmtDate(t.due_at)}</span></button>`).join('') || `<div class="ri-empty">${icon('confetti')}<p>${tr('没有需要处理的事项，继续保持！', 'Nothing needs your action — keep it up!')}</p></div>`}</section>
        <section class="ri-panel"><h3>${icon('chart-donut')} ${tr('我的任务分布', 'My task mix')}</h3>${(() => { const b = k => mine.filter(t => (t.board_status || 'not_started') === k).length; return stackBar([[tr('未开始', 'Not started'), b('not_started'), '#c4c4c4'], [tr('进行中', 'Working'), b('working'), '#fdab3d'], [tr('暂缓', 'On hold'), b('hold'), '#e2445c'], [tr('待检查', 'Review'), b('review'), '#a25ddc'], [tr('已完成', 'Done'), b('done'), '#00c875']]); })()}
          <h3 class="ri-sub">${icon('target')} ${tr('我的 OKR（竖线 = 按时间应达到的进度）', 'My OKRs (marker = expected by now)')}</h3>${objs.slice(0, 5).map(o => { const v = objPct(o); return `<div class="ri-okr-row"><span>${esc(o.title)}</span>${paceBar(v, pace, toneFor(v, pace))}<b>${v ?? '—'}${v === null ? '' : '%'}</b></div>`; }).join('') || `<p class="ri-hint">${tr('还没有本月目标，去 OKR 页面设定 1–3 个。', 'No objectives yet — set 1–3 on the OKR page.')}</p>`}
          ${pj.length ? `<h3 class="ri-sub">${icon('folder')} ${tr('我参与的项目', 'My projects')}</h3>${pj.slice(0, 4).map(r => `<div class="ri-okr-row"><span>${esc(r.name)}</span>${paceBar(r.progress, r.elapsed, r.risk >= 60 ? '#e2445c' : r.risk >= 30 ? '#fdab3d' : '#00c875')}<b>${r.progress}%</b></div>`).join('')}` : ''}</section>
      </div></div>`;
  }

  /* ---------- OKR analysis ---------- */
  function okr() {
    if (!ctx) return '';
    const objs = myObjectives(), period = objs[0]?.planning?.period || S().objectives[0]?.planning?.period, pace = monthElapsed(period);
    const myPct = avgPct(objs), people = okrPeople(), teamPct = avgPct(people.flatMap(p => p.objs)), company = S().objectives.filter(o => o.level === 'company'), companyPct = avgPct(company);
    const allKrs = objs.flatMap(o => S().krs.filter(k => k.objective_id === o.id).map(k => ({ k, o, v:krPct(k) })));
    const buckets = [[tr('已达成 ≥100%', 'Achieved ≥100%'), allKrs.filter(x => (x.v ?? 0) >= 100).length, '#00c875'], [tr('正常', 'On pace'), allKrs.filter(x => x.v !== null && x.v < 100 && x.v >= pace - 10).length, '#579bfc'], [tr('有风险', 'At risk'), allKrs.filter(x => x.v !== null && x.v < pace - 10 && x.v >= pace - 25).length, '#fdab3d'], [tr('落后', 'Behind'), allKrs.filter(x => x.v !== null && x.v < pace - 25).length, '#e2445c'], [tr('无法衡量', 'Not measurable'), allKrs.filter(x => x.v === null).length, '#c4c4c4']];
    const status = (p) => p === null || p === undefined ? [tr('未开始', 'No data'), '#c4c4c4'] : p >= pace - 10 ? [tr('正常', 'On pace'), '#00c875'] : p >= pace - 25 ? [tr('有风险', 'At risk'), '#fdab3d'] : [tr('落后', 'Behind'), '#e2445c'];
    return `<div class="ri">
      <div class="page-heading"><div><div class="eyebrow">REPORTS · OKR</div><h1>${tr('OKR 分析', 'OKR analysis')}</h1><p>${tr(`把 OKR 完成度和时间进度放在一起看：目标周期已过 ${pace}%，完成度低于时间进度越多，风险越大。`, `OKR completion against time: ${pace}% of the objective cycle has passed — the further completion lags, the higher the risk.`)}</p></div></div>
      ${slot('okr')}
      <div class="ri-kpis">
        <div class="ri-kpi">${ring(myPct, 96, toneFor(myPct, pace))}<div><span>${tr('我的 OKR 完成度', 'My OKR completion')}</span><strong style="color:${status(myPct)[1]}">${status(myPct)[0]}</strong><em>${objs.length} ${tr('个目标', 'objectives')} · ${allKrs.length} ${tr('个关键结果', 'key results')}</em></div></div>
        <div class="ri-kpi">${ring(teamPct, 96, toneFor(teamPct, pace))}<div><span>${tr('团队 OKR 完成度', 'Team OKR completion')}</span><strong style="color:${status(teamPct)[1]}">${status(teamPct)[0]}</strong><em>${people.length} ${tr('人有目标', 'people with objectives')}</em></div></div>
        <div class="ri-kpi">${ring(companyPct, 96, toneFor(companyPct, pace))}<div><span>${tr('公司目标完成度', 'Company objectives')}</span><strong style="color:${status(companyPct)[1]}">${status(companyPct)[0]}</strong><em>${company.length} ${tr('个公司目标', 'company objectives')}</em></div></div>
        <div class="ri-kpi time">${ring(pace, 96, '#9699a6')}<div><span>${tr('目标周期进度', 'Objective cycle elapsed')}</span><strong>${pace}%</strong><em>${tr('完成度应接近这个数字', 'Completion should be close to this')}</em></div></div>
      </div>
      <div class="ri-grid">
        <section class="ri-panel"><h3>${icon('user')} ${tr('我的目标与关键结果', 'My objectives & key results')}</h3>
          ${objs.map(o => { const v = objPct(o), ks = S().krs.filter(k => k.objective_id === o.id); return `<div class="ri-obj"><div class="ri-okr-row big"><span>${esc(o.title)}</span>${paceBar(v, pace, toneFor(v, pace))}<b>${v ?? '—'}${v === null ? '' : '%'}</b></div>${ks.map(k => { const kv = krPct(k); return `<div class="ri-okr-row kr"><span>${esc(k.title)}</span>${paceBar(kv, pace, toneFor(kv, pace))}<b>${kv ?? '—'}${kv === null ? '' : '%'}</b></div>`; }).join('') || `<p class="ri-hint">${tr('还没有关键结果', 'No key results yet')}</p>`}</div>`; }).join('') || `<p class="ri-hint">${tr('你本月还没有目标。', 'You have no objectives this month.')}</p>`}
          <h3 class="ri-sub">${icon('chart-donut')} ${tr('我的关键结果健康度', 'My key result health')}</h3>${stackBar(buckets)}</section>
        <section class="ri-panel"><h3>${icon('users-three')} ${tr('团队 OKR 完成度（从低到高）', 'Team OKR completion (lowest first)')}</h3>
          ${people.map(p => { const st = status(p.pct); return `<div class="ri-person"><span class="ri-person-name">${avatar({ id:p.id, display_name:p.name }, 26)}${esc(p.name)}</span>${paceBar(p.pct, pace, st[1])}<b>${p.pct ?? '—'}${p.pct === null ? '' : '%'}</b><span class="ri-tag" style="--c:${st[1]}">${st[0]}</span><small>${p.objs.length} O · ${p.krs.length} KR</small></div>`; }).join('') || `<p class="ri-hint">${tr('你能看到的范围内还没有其他人的目标。', 'No one else’s objectives are visible to you yet.')}</p>`}
          <p class="ri-hint">${tr('竖线表示按时间应达到的进度。管理者可以看到本部门所有人；员工只看到自己和公司目标。', 'The marker shows where each person should be by now. Managers see their department; employees see their own and company objectives.')}</p></section>
      </div></div>`;
  }

  window.WorkOSInsights = { configure(next) { ctx = next; }, slot, register(b, facts, rules) { FACTS[b] = facts; RULES[b] = rules; }, _facts:FACTS, _rules:RULES, reset() { cache.clear(); board = null; } };
  window.WorkOSReports = { configure(next) { ctx = next; }, home, okr, _helpers:{ monthElapsed, taskFacts, projectRows } };
})();
