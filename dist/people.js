'use strict';
/* People & reports: personal workbench, team task analysis (follows reporting
 * lines), personal settings (avatar, contact info) and organization &
 * permissions (admins: reporting lines, titles, roles, admin, feature grants).
 */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let ctx = null;
  const ui = { team:null, teamLoading:false, teamError:'', teamScope:'reports', teamOpen:new Set(), org:null, orgLoading:false, orgError:'', orgView:'table', chart:null, chartLoading:false, chartError:'', chartCollapsed:new Set(), chartLoc:'', saving:false, profileMsg:'', invites:null, inviteOpen:false, inviteResult:null, inviteError:'', inviteBusy:false, disabling:null };
  const S = () => ctx.state();
  const lang = () => ctx.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  /* Factory contacts (quality tracking only); ids match the API's QUALITY_FACTORIES. */
  const FACTORIES = [{ id:'dg', zh:'东莞工厂', en:'Dongguan factory' }, { id:'jn', zh:'济南工厂', en:'Jinan factory' }];
  const factoryBadge = id => { const f = FACTORIES.find(x => x.id === id); return f ? `<span class="pp-badge factory">${icon('factory')} ${esc(tr(f.zh, f.en))}</span>` : ''; };
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  const caps = () => S().capabilities?.orgProfiles === true;
  const me = () => S().actor;
  // Team reports, the org chart and the admin list also carry people outside my department.
  const userById = id => S().directory.find(u => u.id === id) || (me()?.id === id ? me() : null) || ui.org?.items?.find(u => u.id === id) || ui.team?.members?.find(u => u.id === id) || ui.chart?.items?.find(u => u.id === id);
  const nameOf = id => userById(id)?.display_name || id || '—';
  const hue = id => { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const initials = n => { n = String(n || '?').trim(); return /^[\x00-\x7f]+$/.test(n) ? n.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() : n.slice(-2); };
  function avatar(user, size = 28) {
    if (!user) return '';
    const base = ctx?.apiBase || '/api';
    if (user.avatar_version > 0 || user.avatarDataUrl) {
      const src = user.avatarDataUrl || `${base}/users/${encodeURIComponent(user.id)}/avatar?v=${user.avatar_version}`;
      return `<img class="pp-avatar" src="${esc(src)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`;
    }
    return `<span class="pp-avatar pp-initials" style="--h:${hue(user.id)};width:${size}px;height:${size}px;font-size:${Math.round(size * .36)}px" aria-hidden="true">${esc(initials(user.display_name))}</span>`;
  }
  const fmtDate = v => { try { return new Intl.DateTimeFormat(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'short', day:'numeric' }).format(new Date(v)); } catch { return v; } };
  const heading = (title, desc, actions = '') => `<div class="page-heading"><div><div class="eyebrow">WORK OS</div><h1>${title}</h1><p>${desc}</p></div><div class="heading-actions">${actions}</div></div>`;
  const stat = (label, value, note, tone = '') => `<div class="pp-stat ${tone}"><span>${label}</span><strong>${value}</strong><em>${note}</em></div>`;
  const pctBar = (v, tone = '') => `<div class="pp-bar ${tone}"><span style="width:${v ?? 0}%"></span></div>`;

  /* ---------------- personal workbench ---------------- */
  function workbench() {
    const a = me(), now = Date.now(), soon = now + 3 * 864e5;
    const mine = S().tasks.filter(t => t.owner_id === a.id);
    const open = mine.filter(t => t.status !== 'accepted');
    const overdue = open.filter(t => new Date(t.due_at).getTime() < now);
    const dueSoon = open.filter(t => { const d = new Date(t.due_at).getTime(); return d >= now && d < soon; });
    const revision = mine.filter(t => t.status === 'revision');
    const toReview = S().tasks.filter(t => t.reviewer_id === a.id && t.status === 'submitted');
    const accepted = mine.filter(t => t.status === 'accepted');
    const completion = mine.length ? Math.round(accepted.length / mine.length * 100) : null;
    const okrHelpers = window.WorkOSOkrBoard?._helpers;
    const myObjs = S().objectives.filter(o => o.owner_id === a.id);
    const okrPct = okrHelpers && myObjs.length ? okrHelpers.averagePct ? okrHelpers.averagePct(myObjs) : null : null;
    const pj = window.WorkOSProjects?._data;
    const myProjects = pj ? pj.projects.filter(p => p.members.includes(a.id) || p.owner === a.id) : [];
    const riskyProjects = myProjects.filter(p => p.health !== 'on_track');
    const item = (t, tag, tone) => `<button class="pp-att-row" data-live-task="${esc(t.id)}"><span class="pp-att-tag ${tone}">${tag}</span><span class="pp-att-title">${esc(t.title)}</span><span class="pp-att-meta">${esc(nameOf(t.owner_id))} · ${fmtDate(t.due_at)}</span></button>`;
    const rows = [
      ...toReview.map(t => item(t, tr('待我验收', 'Review'), 'violet')),
      ...overdue.map(t => item(t, tr('已逾期', 'Overdue'), 'red')),
      ...revision.filter(t => !overdue.includes(t)).map(t => item(t, tr('被退回', 'Returned'), 'amber')),
      ...dueSoon.map(t => item(t, tr('3 天内到期', 'Due soon'), 'blue')),
    ];
    const greet = (() => { const h = new Date().getHours(); return h < 12 ? tr('早上好', 'Good morning') : h < 18 ? tr('下午好', 'Good afternoon') : tr('晚上好', 'Good evening'); })();
    return `<div class="pp">
      ${heading(`${greet}，${esc(a.display_name)}`.replace('，', lang() === 'en' ? ', ' : '，'), tr('这里是你的个人表现和需要注意的事项。', 'Your personal performance and what needs your attention.'), `<button class="btn primary" data-live-action="new-task">${icon('plus')} ${tr('新建任务', 'New task')}</button>`)}
      <div class="pp-stats">
        ${stat(tr('进行中的任务', 'Open tasks'), open.length, tr('分派给我的', 'Assigned to me'))}
        ${stat(tr('已逾期', 'Overdue'), overdue.length, tr('需要尽快处理', 'Needs action'), overdue.length ? 'bad' : '')}
        ${stat(tr('待我验收', 'Awaiting my review'), toReview.length, tr('同事已提交成果', 'Submitted by colleagues'), toReview.length ? 'warn' : '')}
        ${stat(tr('任务完成度', 'Completion'), completion === null ? '—' : completion + '%', `${accepted.length}/${mine.length} ${tr('已验收', 'accepted')}`)}
        ${stat(tr('OKR 进度', 'OKR progress'), okrPct === null || okrPct === undefined ? '—' : okrPct + '%', `${myObjs.length} ${tr('个目标', 'objectives')}`)}
      </div>
      <div class="pp-grid">
        <section class="pp-panel"><div class="pp-panel-head"><h2>${icon('bell-ringing')} ${tr('需要注意', 'Needs attention')}</h2><span class="pp-count">${rows.length}</span></div>
          ${rows.join('') || `<div class="pp-empty">${icon('check-circle')}<p>${tr('没有需要处理的事项，保持得很好。', 'Nothing needs your attention. Nice work.')}</p></div>`}
        </section>
        <div class="pp-side">
          <section class="pp-panel"><div class="pp-panel-head"><h2>${icon('target')} ${tr('我的 OKR', 'My OKRs')}</h2><button class="btn small" data-live-page="okr">${tr('查看', 'Open')}</button></div>
            ${myObjs.slice(0, 4).map(o => { const v = okrHelpers?.objectivePct ? okrHelpers.objectivePct(o) : null; return `<div class="pp-mini"><span>${esc(o.title)}</span><div class="pp-mini-bar">${pctBar(v)}<b>${v === null ? '—' : v + '%'}</b></div></div>`; }).join('') || `<p class="pp-hint">${tr('还没有目标。', 'No objectives yet.')}</p>`}
          </section>
          <section class="pp-panel"><div class="pp-panel-head"><h2>${icon('folder')} ${tr('我参与的项目', 'My projects')}</h2><button class="btn small" data-live-page="projects">${tr('查看', 'Open')}</button></div>
            ${myProjects.slice(0, 4).map(p => { const ts = pj.tasks.filter(t => t.project === p.id), v = ts.length ? Math.round(ts.filter(t => t.status === 'done').length / ts.length * 100) : 0; const h = { on_track:['正常','On track','ok'], at_risk:['有风险','At risk','warn'], off_track:['延期','Off track','bad'] }[p.health]; return `<div class="pp-mini"><span>${esc(p.name[lang()] || p.name.zh)} <em class="pp-health ${h[2]}">${tr(h[0], h[1])}</em></span><div class="pp-mini-bar">${pctBar(v)}<b>${v}%</b></div></div>`; }).join('') || `<p class="pp-hint">${tr('还没有参与项目。', 'No projects yet.')}</p>`}
            ${riskyProjects.length ? `<p class="pp-warn">${icon('warning')} ${tr(`${riskyProjects.length} 个项目有风险或延期`, `${riskyProjects.length} project(s) at risk or late`)}</p>` : ''}
          </section>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- team analysis ---------------- */
  async function loadTeam() {
    if (!caps()) return;
    ui.teamLoading = true; ui.teamError = '';
    try { ui.team = await ctx.api.get('/reports/team' + (ui.teamScope === 'all' ? '?scope=all' : '')); window.WorkOSNames?.apply(ui.team?.members); }
    catch (e) { ui.teamError = ctx.explainError(e); }
    finally { ui.teamLoading = false; if (S().page === 'team') ctx.rerender(); }
  }
  function team() {
    if (!caps()) return `<div class="pp">${heading(tr('任务分析', 'Task analysis'), tr('需要后台升级（汇报线功能）后才能使用。', 'Requires the backend upgrade with reporting lines.'))}</div>`;
    if (!ui.team && !ui.teamLoading && !ui.teamError) { loadTeam(); }
    const d = ui.team, t = d?.totals;
    const scopeSwitch = d?.canViewAll ? `<div class="pp-seg"><button class="${ui.teamScope === 'reports' ? 'active' : ''}" data-pp="scope" data-v="reports">${tr('我的下属', 'My reports')}</button><button class="${ui.teamScope === 'all' ? 'active' : ''}" data-pp="scope" data-v="all">${tr('全公司', 'Whole company')}</button></div>` : '';
    const head = heading(tr('任务分析', 'Task analysis'), tr('按汇报线汇总：所有直接和间接向你汇报的同事的任务完成度、准时率和逾期情况。', 'Task completion, on-time rate and overdue work for everyone who reports to you, directly or indirectly.'), `${scopeSwitch}<button class="btn" data-pp="reload-team">${icon('arrows-clockwise')} ${tr('刷新', 'Refresh')}</button>`);
    if (ui.teamLoading && !d) return `<div class="pp">${head}<p class="pp-hint">${tr('正在读取…', 'Loading…')}</p></div>`;
    if (ui.teamError) return `<div class="pp">${head}<div class="pp-alert">${esc(ui.teamError)}</div></div>`;
    if (!d.members.length) return `<div class="pp">${head}<div class="pp-empty big">${icon('tree-structure')}<h3>${tr('还没有人向你汇报', 'No one reports to you yet')}</h3><p>${tr('汇报线由管理员在“组织与权限”里设置。设置后，这里会显示团队成员的任务完成度、准时率和逾期情况。', 'Reporting lines are set by an administrator in Organization & permissions. Then this page shows completion, on-time rate and overdue work for your team.')}</p>${me().isAdmin ? `<button class="btn primary" data-live-page="org">${tr('去设置汇报线', 'Set reporting lines')}</button>` : ''}</div></div>`;
    const sorted = [...d.members].sort((a, b) => (b.stats.overdue - a.stats.overdue) || ((a.stats.completionRate ?? 101) - (b.stats.completionRate ?? 101)));
    return `<div class="pp">${head}${window.WorkOSInsights?.slot('task') || ''}
      <div class="pp-stats">
        ${stat(tr('团队人数', 'People'), d.members.length, d.scope === 'all' ? tr('全公司', 'Whole company') : tr(`直属 ${d.members.filter(m => (m.depth || 1) <= 1).length} + 间接 ${d.members.filter(m => m.depth > 1).length}`, `${d.members.filter(m => (m.depth || 1) <= 1).length} direct + ${d.members.filter(m => m.depth > 1).length} indirect`))}
        ${stat(tr('任务完成度', 'Completion'), t.completionRate === null ? '—' : t.completionRate + '%', `${t.accepted}/${t.total} ${tr('已验收', 'accepted')}`)}
        ${stat(tr('准时完成率', 'On-time rate'), t.onTimeRate === null ? '—' : t.onTimeRate + '%', t.onTimeUnknown ? tr(`验收时间覆盖 ${t.onTimeKnown}/${t.accepted}`, `Acceptance time coverage ${t.onTimeKnown}/${t.accepted}`) : tr('验收时间不晚于截止日', 'Accepted by the due date'))}
        ${stat(tr('平均质量分（满分 10）', 'Avg quality (out of 10)'), t.avgQuality ?? '—', tr('验收人打分', 'Reviewer score'))}
        ${stat(tr('逾期未完成', 'Overdue'), t.overdue, `${t.dueSoon} ${tr('项 7 天内到期', 'due within 7 days')}`, t.overdue ? 'bad' : '')}
      </div>
      <section class="pp-panel pp-table-panel"><table class="pp-table"><thead><tr><th>${tr('成员', 'Member')}</th><th>${tr('任务', 'Tasks')}</th><th>${tr('完成度', 'Completion')}</th><th>${tr('准时率', 'On time')}</th><th>${tr('质量（/10）', 'Quality (/10)')}</th><th>${tr('待验收', 'In review')}</th><th>${tr('逾期', 'Overdue')}</th><th></th></tr></thead><tbody>
        ${(d.scope === 'all' ? [['', sorted]] : [[tr('直属下属', 'Direct reports'), sorted.filter(m => (m.depth || 1) <= 1)], [tr('间接下属（下属的团队）', 'Indirect reports (their teams)'), sorted.filter(m => m.depth > 1)]]).filter(([, rows]) => rows.length).map(([label, rows]) => (label ? `<tr class="pp-group-row"><td colspan="8">${label} <b>${rows.length}</b></td></tr>` : '') + rows.map(m => { const s = m.stats, open = ui.teamOpen.has(m.id); return `<tr class="${s.overdue ? 'pp-row-bad' : ''}"><td><div class="pp-person">${avatar(m, 30)}<div><strong>${esc(m.display_name)}</strong><span>${esc(m.title || '')}${m.manager_id ? ` · ${tr('上级', 'reports to')} ${esc(nameOf(m.manager_id))}` : ''}</span></div></div></td><td>${s.total}<small> / ${s.open} ${tr('进行中', 'open')}</small></td><td><div class="pp-cell-bar">${pctBar(s.completionRate, s.completionRate !== null && s.completionRate < 50 ? 'warn' : '')}<b>${s.completionRate ?? '—'}${s.completionRate === null ? '' : '%'}</b></div></td><td>${s.onTimeRate === null ? '—' : s.onTimeRate + '%'}${s.onTimeUnknown ? `<small>${tr('已核实', 'Verified')} ${s.onTimeKnown}/${s.accepted}</small>` : ''}</td><td>${s.avgQuality ?? '—'}</td><td>${s.waiting}</td><td class="${s.overdue ? 'pp-bad' : ''}">${s.overdue}</td><td class="pp-row-actions"><button class="btn small primary" data-pp="view-tasks" data-id="${esc(m.id)}" title="${tr('打开 TA 的个人任务（只读），按 Esc 或“返回任务分析”回来', 'Open their task list (read-only); press Esc or “Back” to return')}">${icon('list-checks')} ${tr('查看任务', 'View tasks')}</button>${m.attention.length ? `<button class="btn small" data-pp="toggle-member" data-id="${esc(m.id)}">${open ? tr('收起', 'Hide') : tr('查看问题', 'Details')} (${m.attention.length})</button>` : ''}</td></tr>${open ? `<tr class="pp-sub"><td colspan="8">${m.attention.map(a => `<button class="pp-att-row" data-live-task="${esc(a.id)}"><span class="pp-att-tag ${a.overdue ? 'red' : 'amber'}">${a.overdue ? tr('已逾期', 'Overdue') : tr('被退回', 'Returned')}</span><span class="pp-att-title">${esc(a.title)}</span><span class="pp-att-meta">${fmtDate(a.dueAt)}</span></button>`).join('')}</td></tr>` : ''}`; }).join('')).join('')}
      </tbody></table></section>
      <p class="pp-hint">${icon('info')} ${tr('指标只统计系统里有记录的任务；完成度 = 已验收 / 全部任务，准时率按验收时间与截止日比较。数据用于发现需要帮助的地方，不自动形成人事结论。', 'Metrics cover tasks recorded in this system. Completion = accepted / all tasks; on-time compares acceptance with the due date. Use them to spot where help is needed, not as automated HR decisions.')}</p>
    </div>`;
  }

  /* ---------------- personal settings ---------------- */
  const ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Europe/London', 'Europe/Berlin', 'Australia/Sydney'];
  const erp = () => S().capabilities?.erpAccess === true;
  function settings() {
    const a = me(), manager = a.manager_id ? userById(a.manager_id) : null;
    const reports = S().directory.filter(u => u.manager_id === a.id);
    const browserZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
    const zones = [...new Set([a.timezone, browserZone, ...ZONES].filter(Boolean))];
    const field = (name, label, value, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value || '')}" ${extra}></label>`;
    const grants = a.grants || [];
    const yes = v => v ? `<span class="pp-yes">${icon('check-circle')} ${tr('有', 'Yes')}</span>` : `<span class="pp-no">${tr('无', 'No')}</span>`;
    return `<div class="pp">${heading(tr('个人设置', 'Personal settings'), tr('你的头像和联系方式会显示给同事，方便大家找到你。', 'Your photo and contact details are shown to colleagues so they can reach you.'))}
      ${caps() ? '' : `<div class="pp-alert">${tr('需要后台升级后才能保存个人资料。', 'Saving your profile requires the backend upgrade.')}</div>`}
      <div class="pp-settings">
        <section class="pp-panel pp-profile-card">
          <div class="pp-avatar-edit">${avatar(a, 96)}<div><h2>${esc(a.display_name)}</h2><p>${esc(a.title || tr('未设置职位', 'No title yet'))}</p>
            <label class="btn small pp-upload">${icon('camera')} ${tr('上传头像', 'Upload photo')}<input type="file" accept="image/png,image/jpeg,image/webp" data-pp-avatar hidden ${caps() ? '' : 'disabled'}></label>${a.avatar_version > 0 ? `<button class="btn small" data-pp="remove-avatar">${tr('移除', 'Remove')}</button>` : ''}
            <p class="pp-hint">${tr('支持 JPG / PNG / WebP，会自动裁成正方形并压缩。', 'JPG / PNG / WebP; cropped to a square and compressed automatically.')}</p></div></div>
          <dl class="pp-facts"><dt>${tr('姓名', 'Name')}</dt><dd>${esc(a.display_name)} <small>${tr('（来自钉钉）', '(from DingTalk)')}</small></dd>
            <dt>${tr('直属上级', 'Manager')}</dt><dd>${manager ? `${avatar(manager, 22)} ${esc(manager.display_name)}` : tr('未设置', 'Not set')}</dd>
            <dt>${tr('直接下属', 'Direct reports')}</dt><dd>${reports.length ? reports.map(r => `${avatar(r, 22)} ${esc(r.display_name)}`).join('　') : '—'}</dd></dl>
        </section>
        <section class="pp-panel"><h2>${tr('联系方式', 'Contact details')}</h2>
          <form id="pp-profile" class="form-grid">
            ${field('nameZh', tr('中文名', 'Chinese name'), a.name_zh, 'text', 'maxlength="40" required placeholder="' + tr('例如：陈一', 'e.g. 陈一') + '"')}
            ${field('nameEn', tr('英文名', 'English name'), a.name_en, 'text', 'maxlength="60" required pattern="[A-Za-z0-9 .\'\\-]+" placeholder="Yi Chen"')}
            ${field('title', tr('职位', 'Title'), a.title, 'text', 'maxlength="80" placeholder="' + tr('例如：销售经理', 'e.g. Sales manager') + '"')}
            ${field('phone', tr('电话', 'Phone'), a.phone, 'tel', 'maxlength="40" placeholder="+1 949 555 0100"')}
            ${a.email_locked ? `<label class="field"><span>${tr('工作邮箱', 'Work email')}</span><div class="pp-locked-field" title="${tr('由管理员设置', 'Set by an administrator')}">${icon('lock-simple')} ${esc(a.email || '')}<small>${tr('由管理员设置，如需修改请联系管理员', 'Set by an administrator; ask them to change it')}</small></div></label>` : field('email', tr('工作邮箱（必填，接收任务和催办）', 'Work email (required; tasks and reminders)'), a.email, 'email', 'maxlength="200" required placeholder="name@1laser.com"')}
            ${field('wechat', tr('微信', 'WeChat'), a.wechat, 'text', 'maxlength="60"')}
            <label class="field"><span>${tr('工作地点', 'Work location')}</span><div class="pp-locked-field" title="${tr('由管理员在“组织与权限”中设置', 'Set by an administrator in Organization & permissions')}">${icon('lock-simple')} ${esc(a.location || tr('未设置', 'Not set'))}<small>${tr('由管理员设置，如需修改请联系管理员', 'Set by an administrator; ask them to change it')}</small></div></label>
            <label class="field"><span>${tr('时区', 'Time zone')}</span><select name="timezone"><option value="">${tr('未设置', 'Not set')}</option>${zones.map(z => `<option value="${esc(z)}" ${z === a.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
            <div class="pp-form-actions full"><span class="pp-hint" role="status">${esc(ui.profileMsg)}</span><button class="btn primary" type="submit" ${caps() ? '' : 'disabled'}>${tr('保存', 'Save')}</button></div>
          </form>
        </section>
        <section class="pp-panel"><h2>${tr('我的权限', 'My access')}</h2>
          <dl class="pp-facts"><dt>${tr('角色', 'Role')}</dt><dd>${a.role === 'manager' ? tr('主管（可管理本部门任务和目标）', 'Manager (manages department tasks and goals)') : tr('员工', 'Employee')}</dd>
            <dt>${tr('管理员', 'Administrator')}</dt><dd>${yes(a.isAdmin)}</dd>
            <dt>${tr('老板看板', 'Executive overview')}</dt><dd>${yes(a.executiveAccess)}</dd>
            <dt>${tr('客服工作台', 'Support workspace')}</dt><dd>${yes(a.supportAccess?.read)}</dd>
            <dt>${tr('产品+供应链', 'Product hub')}</dt><dd>${yes(grants.includes('products'))}</dd>
            <dt>${tr('看成本', 'Cost access')}</dt><dd>${yes(grants.includes('product_cost_detail'))}</dd></dl>
          <p class="pp-hint">${tr('权限由管理员在“组织与权限”中设置。', 'Access is set by an administrator in Organization & permissions.')}</p>
        </section>
      </div>${(() => { const body = ctx.integrations?.(); return body ? `<section class="pp-panel pp-admin-int"><div class="pp-panel-head"><h2>${icon('plugs-connected')} ${tr('集成与通知（仅系统管理员可见）', 'Integrations & notifications (administrators only)')}</h2></div>${body}</section>` : ''; })()}</div>`;
  }
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const size = 256, c = document.createElement('canvas'); c.width = size; c.height = size; const s = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', .86)); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr('无法读取这张图片', 'This image could not be read'))); };
      img.src = url;
    });
  }

  /* ---------------- organization & permissions ---------------- */
  async function loadOrg() {
    ui.orgLoading = true; ui.orgError = '';
    try {
      ui.org = await ctx.api.get('/org/members'); window.WorkOSNames?.apply(ui.org.items);
      if (canInvite()) { try { ui.invites = await ctx.api.get('/org/invites'); } catch { ui.invites = { items:[], emailDelivery:false }; } }
    } catch (e) { ui.orgError = ctx.explainError(e); }
    finally { ui.orgLoading = false; if (S().page === 'org') ctx.rerender(); }
  }
  const canInvite = () => S().capabilities?.memberInvites === true;
  const canDisable = () => S().capabilities?.memberDisable === true;
  const fmtDay = v => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'short', day:'numeric' }) : '—'; };
  function invitePanel(active) {
    if (!canInvite() || !ui.inviteOpen) return '';
    const r = ui.inviteResult;
    if (r) return `<section class="pp-panel pp-invite"><div class="pp-invite-head"><h3>${icon('check-circle')} ${tr('邀请已生成', 'Invite created')}</h3><button class="pp-btn small" data-pp="invite-close">${tr('完成', 'Done')}</button></div>
      <p class="pp-hint">${r.emailed ? tr(`已发邮件给 ${esc(r.email)}。也可以复制下面的链接用微信发给对方。`, `Emailed to ${esc(r.email)}. You can also copy the link below.`) : tr(`请把下面的链接发给 ${esc(r.email)}（微信或邮件）。链接只显示这一次，7 天内有效，只能使用一次。`, `Send this link to ${esc(r.email)}. It is shown once, valid 7 days, single use.`)}</p>
      <div class="pp-invite-link"><input readonly value="${esc(r.url)}" data-pp-invite-url><button class="pp-btn primary" data-pp="invite-copy">${icon('copy')} ${tr('复制链接', 'Copy link')}</button></div></section>`;
    const opt = (v, label) => `<option value="${esc(v)}">${esc(label)}</option>`;
    return `<section class="pp-panel pp-invite"><div class="pp-invite-head"><h3>${icon('user-plus')} ${tr('邀请成员', 'Invite a member')}</h3><button class="pp-btn small" data-pp="invite-close">${tr('取消', 'Cancel')}</button></div>
      <p class="pp-hint">${tr('适用于不在钉钉里的同事、外部合作伙伴或顾问。对方打开邀请链接设置密码后，用邮箱登录。', 'For people outside DingTalk (contractors, partners). They open the link, set a password and sign in with email.')}</p>
      <form id="pp-invite" class="pp-invite-form">
        <label>${tr('姓名', 'Name')}<input name="displayName" required maxlength="80"></label>
        <label>${tr('邮箱（登录账号）', 'Email (sign-in)')}<input name="email" type="email" required maxlength="200"></label>
        <label>${tr('岗位', 'Title')}<input name="title" maxlength="80"></label>
        <label>${tr('工作地点', 'Work location')}<input name="location" maxlength="80" placeholder="${tr('如 Irvine, CA / 武汉', 'e.g. Irvine, CA')}" list="pp-locations"></label>
        <label>${tr('直属上级', 'Manager')}<select name="managerId">${opt('', tr('无（最高层）', 'None (top)'))}${active.map(u => opt(u.id, u.display_name)).join('')}</select></label>
        <label>${tr('角色', 'Role')}<select name="role">${opt('employee', tr('员工', 'Employee'))}${opt('manager', tr('主管', 'Manager'))}</select></label>
        <label>${tr('工厂对接人', 'Factory contact')}<select name="factory">${opt('', tr('否（公司成员）', 'No (company member)'))}${FACTORIES.map(f => opt(f.id, tr(f.zh, f.en))).join('')}</select><span class="pp-hint">${tr('选了工厂后，对方只能使用“产品质量追踪”，只看到本工厂的问题', 'Factory contacts only use product quality tracking and see only their factory’s issues')}</span></label>
        <div class="pp-invite-grants" ${erp() ? 'hidden' : ''}><label class="pp-check"><input type="checkbox" name="products"> ${tr('产品+供应链', 'Product hub')}</label><label class="pp-check"><input type="checkbox" name="product_cost_detail"> ${tr('成本明细', 'Cost detail')}</label>${ui.invites?.emailDelivery ? `<label class="pp-check"><input type="checkbox" name="sendEmail" checked> ${tr('同时发送邀请邮件', 'Also send an email')}</label>` : ''}</div>
        ${ui.inviteError ? `<div class="pp-alert">${esc(ui.inviteError)}</div>` : ''}
        <div class="pp-invite-actions"><button class="pp-btn primary" type="submit" ${ui.inviteBusy ? 'disabled' : ''}>${icon('link')} ${tr('生成邀请链接', 'Create invite link')}</button><span class="pp-hint">${tr('链接 7 天有效，只能使用一次；对方加入后自动出现在组织架构里。', 'Valid 7 days, single use; the person joins the org chart on acceptance.')}</span></div>
      </form></section>`;
  }
  function invitesList() {
    const list = (ui.invites?.items || []).filter(i => i.status === 'pending');
    if (!canInvite() || !list.length) return '';
    return `<section class="pp-panel"><h3 class="pp-sub-h">${icon('envelope-simple')} ${tr('待接受的邀请', 'Pending invites')} <b>${list.length}</b></h3><table class="pp-table pp-invites"><tbody>${list.map(i => `<tr><td><strong>${esc(i.displayName)}</strong> <span class="pp-muted">${esc(i.email)}</span>${i.factory ? ` ${factoryBadge(i.factory)}` : ''}</td><td>${esc(i.title || '')}</td><td class="pp-muted">${tr('有效至', 'Expires')} ${fmtDay(i.expiresAt)}${i.emailed ? ` · ${tr('已发邮件', 'emailed')}` : ''}</td><td class="pp-right"><button class="pp-btn small danger" data-pp="invite-revoke" data-id="${esc(i.id)}">${tr('撤销', 'Revoke')}</button></td></tr>`).join('')}</tbody></table></section>`;
  }
  function disablePanel(u, active) {
    const d = ui.disabling; if (!d || d.id !== u.id) return '';
    const sameDept = active.filter(x => x.id !== u.id && x.department_id === u.department_id);
    const defaultHeir = sameDept.find(x => x.id === u.manager_id)?.id || sameDept.find(x => x.role === 'manager')?.id || sameDept[0]?.id || '';
    const c = d.counts;
    return `<tr class="pp-disable-row"><td colspan="9"><form id="pp-disable" data-id="${esc(u.id)}" class="pp-disable-form">
      <div><strong>${icon('warning')} ${tr(`停用 ${esc(u.display_name)}？`, `Disable ${esc(u.display_name)}?`)}</strong>
      <p class="pp-hint">${tr('停用后立即下线，钉钉登录和邮箱登录都进不来，并从组织架构、负责人列表中移除。历史任务保留，显示为“已停用”。可以随时恢复。', 'Signed out at once; DingTalk and email sign-in are blocked; removed from the org chart and assignee lists. History stays, marked disabled. Can be restored any time.')}</p>
      <p class="pp-hint">${c ? tr(`未完成任务 ${c.owned} 项 · 待其验收 ${c.reviewing} 项 · 直属下属 ${c.reports} 人（下属会自动改为向其上级汇报）`, `${c.owned} open tasks · ${c.reviewing} awaiting their review · ${c.reports} direct reports (they move up to this person's manager)`) : tr('正在统计未完成任务…', 'Counting open tasks…')}</p></div>
      <label>${tr('未完成任务转给', 'Hand open tasks to')}<select name="reassignTo">${sameDept.map(x => `<option value="${esc(x.id)}" ${x.id === defaultHeir ? 'selected' : ''}>${esc(x.display_name)}</option>`).join('')}<option value="">${tr('暂不转交', 'Do not reassign')}</option></select></label>
      <div class="pp-disable-actions"><button class="pp-btn" type="button" data-pp="disable-cancel">${tr('取消', 'Cancel')}</button><button class="pp-btn danger" type="submit">${tr('确认停用', 'Disable')}</button></div>
    </form></td></tr>`;
  }
  function org() {
    if (!caps()) return `<div class="pp">${heading(tr('组织与权限', 'Organization & permissions'), tr('需要后台升级后才能使用。', 'Requires the backend upgrade.'))}</div>`;
    if (!ui.org && !ui.orgLoading && !ui.orgError) loadOrg();
    const head = heading(tr('组织与权限', 'Organization & permissions'), tr('设置每个人的直属上级、职位、角色和功能权限。汇报线决定谁能在“任务分析”里看到谁。', 'Set each person’s manager, title, role and feature access. Reporting lines decide who sees whom in Task analysis.'),
      `<button class="btn small" data-live-page="orgchart">${icon('tree-structure')} ${tr('查看组织架构', 'View org chart')}</button>`);
    if (ui.orgError) return `<div class="pp">${head}<div class="pp-alert">${esc(ui.orgError)}</div></div>`;
    if (!ui.org) return `<div class="pp">${head}<p class="pp-hint">${tr('正在读取…', 'Loading…')}</p></div>`;
    window.WorkOSNames?.apply(ui.org.items);
    const items = ui.org.items.filter(u => u.active !== false), disabled = ui.org.items.filter(u => u.active === false);
    const loginBadge = u => u.login_email ? `<span class="pp-badge mail">${icon('envelope-simple')} ${tr('邮箱', 'Email')}</span>` : u.dingtalk ? `<span class="pp-badge ding">${tr('钉钉', 'DingTalk')}</span>` : '';
    const statusCell = u => { if (!canDisable()) return '—'; if (u.id === me()?.id || u.executive) return `<span class="pp-lock" title="${tr('不能停用自己或总裁账号', 'You cannot disable yourself or an executive')}">${icon('lock-simple')} ${tr('在职', 'Active')}</span>`;
      return `<label class="pp-switch status" title="${tr('关闭即停用', 'Turn off to disable')}"><input type="checkbox" data-pp-status data-id="${esc(u.id)}" checked><span></span></label> <span class="pp-status-on">${tr('在职', 'Active')}</span>`; };
    const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
    const check = (u, grant, disabled = false) => `<label class="pp-switch"><input type="checkbox" data-pp-grant="${grant}" data-id="${esc(u.id)}" ${(u.grants || []).includes(grant) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span></span></label>`;
    return `<div class="pp">${head}${canInvite() && !ui.inviteOpen ? `<div class="pp-org-actions"><button class="btn primary" data-pp="invite-open">${icon('user-plus')} ${tr('邀请成员', 'Invite member')}</button><span class="pp-hint">${tr('邀请不在钉钉里的人加入；关闭“状态”开关即可停用某人。', 'Invite people outside DingTalk; turn off Status to disable someone.')}</span></div>` : ''}${invitePanel(items)}
      <section class="pp-panel pp-table-panel"><table class="pp-table pp-org" data-help-table="pp-org"><thead><tr><th>${tr('成员', 'Member')}</th><th>${tr('工作邮箱', 'Work email')}</th><th>${tr('职位', 'Title')}</th><th>${tr('工作地点', 'Work location')}</th><th>${tr('直属上级', 'Manager')}</th><th>${tr('角色', 'Role')}</th><th>${tr('管理员', 'Admin')}</th>${erp() ? '' : `<th>${tr('产品+供应链', 'Product hub')}</th><th>${tr('成本明细', 'Cost detail')}</th>`}<th>${tr('状态', 'Status')}</th></tr></thead><tbody>
      ${orgGroups(items).map(([key, label, rows]) => `<tr class="pp-group-row ${key ? '' : 'unset'}"><td colspan="${erp() ? 8 : 10}"><span class="pp-group-name">${key ? `<span class="pp-flag" aria-hidden="true">${flagOf(label)}</span> ${esc(window.WorkOSTranslate?.text(label) ?? label)}` : `${icon('map-pin')} ${tr('未设置工作地点', 'No work location yet')}`}</span><b>${rows.length}</b>${key ? '' : `<em>${tr('填写工作地点后，成员会自动归入对应地点', 'Fill in a work location and the member moves to that group')}</em>`}</td></tr>${rows.map(u => `<tr><td><div class="pp-person">${avatar(u, 30)}<div><strong>${esc(u.display_name)}</strong><span>${esc(u.login_email || u.email || u.phone || '')} ${loginBadge(u)}${u.quality_factory ? ` ${factoryBadge(u.quality_factory)}` : ''}</span><span class="pp-names"><label class="pp-name-field"><em>${tr('中文名', 'Chinese')}</em><input class="pp-inline pp-name ${u.name_zh ? '' : 'missing'}" data-pp-field="nameZh" data-id="${esc(u.id)}" value="${esc(u.name_zh || '')}" maxlength="40" placeholder="${tr('未填写', 'Not set')}" aria-label="${tr('中文名', 'Chinese name')}"></label><label class="pp-name-field"><em>${tr('英文名', 'English')}</em><input class="pp-inline pp-name ${u.name_en ? '' : 'missing'}" data-pp-field="nameEn" data-id="${esc(u.id)}" value="${esc(u.name_en || '')}" maxlength="60" placeholder="${tr('未填写', 'Not set')}" aria-label="${tr('英文名', 'English name')}"></label></span></div></div></td>
        <td><input class="pp-inline pp-email ${u.email ? '' : 'missing'}" type="email" data-pp-field="email" data-id="${esc(u.id)}" value="${esc(u.email || '')}" maxlength="200" placeholder="${tr('未填写', 'Missing')}" title="${u.email_locked ? tr('已由管理员设置，本人不能修改', 'Set by an admin; the person cannot change it') : tr('管理员填写后，本人不能修改', 'Once you set it, the person cannot change it')}">${u.email_locked ? `<i class="ph ph-lock-simple pp-email-lock" aria-label="${tr('已锁定', 'Locked')}"></i>` : ''}</td>
        <td><input class="pp-inline" data-pp-field="title" data-id="${esc(u.id)}" value="${esc(u.title || '')}" maxlength="80" placeholder="${tr('职位', 'Title')}"></td>
        <td><input class="pp-inline" data-pp-field="location" data-id="${esc(u.id)}" value="${esc(u.location || '')}" maxlength="80" placeholder="${tr('如 Irvine, CA / 武汉', 'e.g. Irvine, CA')}" list="pp-locations"></td>
        <td><select class="pp-inline" data-pp-field="managerId" data-id="${esc(u.id)}">${opt('', tr('无（最高层）', 'None (top)'), u.manager_id || '')}${items.filter(x => x.id !== u.id).map(x => opt(x.id, x.display_name, u.manager_id)).join('')}</select></td>
        <td><select class="pp-inline" data-pp-field="role" data-id="${esc(u.id)}">${opt('employee', tr('员工', 'Employee'), u.role)}${opt('manager', tr('主管', 'Manager'), u.role)}</select><select class="pp-inline pp-factory" data-pp-field="factory" data-id="${esc(u.id)}" title="${tr('工厂对接人只能使用产品质量追踪', 'Factory contacts only use product quality tracking')}">${opt('', tr('公司成员', 'Company member'), u.quality_factory || '')}${FACTORIES.map(f => opt(f.id, tr(`工厂对接人 · ${f.zh}`, `Factory contact · ${f.en}`), u.quality_factory || '')).join('')}</select></td>
        <td>${u.adminSource === 'deployment' ? `<span class="pp-lock" title="${tr('由部署配置指定，不能在这里取消', 'Set in deployment config')}">${icon('lock-simple')} ${tr('系统', 'System')}</span>` : `<label class="pp-switch"><input type="checkbox" data-pp-admin data-id="${esc(u.id)}" ${u.admin ? 'checked' : ''}><span></span></label>`}</td>
        ${erp() ? '' : `<td>${check(u, 'products')}</td><td>${check(u, 'product_cost_detail', !(u.grants || []).includes('products'))}</td>`}
        <td class="pp-status">${statusCell(u)}</td></tr>${disablePanel(u, items)}`).join('')}`).join('')}
      </tbody></table><datalist id="pp-locations">${[...new Set(ui.org.items.map(u => (u.location || '').trim()).filter(Boolean))].map(l => `<option value="${esc(l)}">`).join('')}</datalist></section>${invitesList()}
      ${disabled.length ? `<section class="pp-panel pp-disabled"><h3 class="pp-sub-h">${icon('user-minus')} ${tr('已停用成员', 'Disabled members')} <b>${disabled.length}</b></h3><table class="pp-table"><tbody>${disabled.map(u => `<tr><td><div class="pp-person dim">${avatar(u, 26)}<div><strong>${esc(u.display_name)}</strong><span>${esc(u.title || '')} ${loginBadge(u)}</span></div></div></td><td class="pp-muted">${u.disabled_at ? tr(`${fmtDay(u.disabled_at)} 停用`, `Disabled ${fmtDay(u.disabled_at)}`) : tr('已离开钉钉', 'Left DingTalk')}</td><td class="pp-right">${canDisable() ? `<button class="pp-btn small" data-pp="enable" data-id="${esc(u.id)}">${icon('arrow-counter-clockwise')} ${tr('恢复', 'Restore')}</button>` : ''}</td></tr>`).join('')}</tbody></table></section>` : ''}
      <div class="pp-notes"><p>${icon('info')} ${tr('修改后立即保存并记录审计日志。“角色”设为主管后，可以管理本部门的任务和目标；钉钉重新登录不会覆盖这里的设置。', 'Changes save immediately and are audited. Managers can manage department tasks and goals; DingTalk re-login keeps these settings.')}</p>
      ${erp() ? `<p>${icon('shield')} ${tr('产品、价格构成、供应链和仓库库存的权限已移到“产品+供应链 → ERP 权限”统一设置。', 'Product, pricing, supply-chain and warehouse access now live in Product hub → ERP permissions.')} <button class="btn small" data-live-page="erp-access">${tr('前往 ERP 权限', 'Open ERP permissions')}</button></p>` : `<p>${icon('lock-simple')} ${tr('“产品+供应链”只给需要的人开通；“成本明细”可以看到价格的计算过程，开通前请确认。客服工作台目前由部署配置管理。', 'Grant Product hub only to those who need it; Cost detail reveals how prices are calculated. Support access is currently managed in deployment config.')}</p>`}</div>
    </div>`;
  }
  // Organization & permissions groups members by work location: members without one first (they need setting), then each location, largest first.
  function orgGroups(items) {
    const groups = new Map();
    items.forEach(u => { const label = String(u.location || '').trim(), key = label.toLowerCase(); if (!groups.has(key)) groups.set(key, [key, label, []]); groups.get(key)[2].push(u); });
    return [...groups.values()].sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0) || b[2].length - a[2].length || a[1].localeCompare(b[1]));
  }
  /* ---------- org chart (everyone): name, title, location ---------- */
  const LOC_COLORS = ['#579bfc', '#00c875', '#fdab3d', '#a25ddc', '#e2445c', '#00a9a5', '#ff7575', '#9d50dd'];
  const locKey = u => String(u.location || '').trim();
  // Country flag from a free-text location (city, state or country, Chinese or English).
  const FLAGS = [[/中国|china|prc|深圳|东莞|武汉|济南|聊城|上海|北京|广州|杭州|苏州|宁波|厦门|成都|重庆|天津|西安|南京|长沙|郑州|青岛|佛山|中山|惠州/i, '🇨🇳'], [/香港|hong kong/i, '🇭🇰'], [/台湾|taiwan|台北/i, '🇹🇼'],
    [/美国|usa|united states|\bus\b|california|\bca\b|texas|\btx\b|new york|\bny\b|florida|washington|irvine|los angeles|lake forest|san|seattle|chicago|boston|nevada|las vegas/i, '🇺🇸'], [/加拿大|canada|toronto|vancouver/i, '🇨🇦'],
    [/英国|united kingdom|\buk\b|london/i, '🇬🇧'], [/德国|germany|berlin|munich/i, '🇩🇪'], [/日本|japan|tokyo|osaka/i, '🇯🇵'], [/澳大利亚|australia|sydney|melbourne/i, '🇦🇺'], [/法国|france|paris/i, '🇫🇷'], [/墨西哥|mexico/i, '🇲🇽'], [/越南|vietnam/i, '🇻🇳'], [/菲律宾|philippines|manila/i, '🇵🇭'], [/印度|india/i, '🇮🇳'], [/新加坡|singapore/i, '🇸🇬']];
  const flagOf = l => (FLAGS.find(([re]) => re.test(l)) || [, '🌐'])[1];
  async function loadChart() {
    ui.chartLoading = true; ui.chartError = '';
    try { ui.chart = await ctx.api.get('/org/chart'); window.WorkOSNames?.apply(ui.chart.items); } catch (e) { ui.chartError = ctx.explainError(e); }
    finally { ui.chartLoading = false; if (['orgchart', 'org'].includes(S().page)) ctx.rerender(); }
  }
  function orgChart(items) {
    const ids = new Set(items.map(u => u.id));
    const kids = new Map(); items.forEach(u => { const k = u.manager_id && ids.has(u.manager_id) ? u.manager_id : '__root'; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(u); });
    const locs = [...new Set(items.map(locKey).filter(Boolean))];
    const locColor = l => LOC_COLORS[locs.indexOf(l) % LOC_COLORS.length] || '#c4c4c4';
    const size = id => (kids.get(id) || []).reduce((n, k) => n + 1 + size(k.id), 0);
    const node = u => { const ch = kids.get(u.id) || [], collapsed = ui.chartCollapsed.has(u.id), l = locKey(u), dim = ui.chartLoc && l !== ui.chartLoc;
      return `<li><div class="pp-oc-card ${u.id === me()?.id ? 'me' : ''} ${dim ? 'dim' : ''}" style="--lc:${locColor(l)}">${avatar(u, 44)}<div class="pp-oc-text"><strong>${esc(u.display_name)}</strong><span class="pp-oc-title">${esc(u.title ? (window.WorkOSTranslate?.text(u.title) ?? u.title) : (u.role === 'manager' ? tr('主管', 'Manager') : tr('员工', 'Employee')))}</span><span class="pp-oc-loc"><span class="pp-flag" aria-hidden="true">${l ? flagOf(l) : '📍'}</span> ${esc(l ? (window.WorkOSTranslate?.text(l) ?? l) : tr('未填写所在地', 'No location'))}</span></div>
        ${ch.length ? `<button class="pp-oc-toggle" data-pp="chart-toggle" data-id="${esc(u.id)}" aria-expanded="${!collapsed}" title="${collapsed ? tr('展开下属', 'Show reports') : tr('收起下属', 'Hide reports')}">${collapsed ? `+${size(u.id)}` : icon('minus')}</button>` : ''}</div>${ch.length && !collapsed ? `<ul>${ch.map(node).join('')}</ul>` : ''}</li>`; };
    const roots = kids.get('__root') || [];
    const unassigned = roots.filter(u => !kids.get(u.id)?.length && roots.length > 1), tops = roots.filter(u => !unassigned.includes(u));
    const legend = locs.length ? `<div class="pp-oc-legend">${icon('map-pin')} ${locs.map(l => `<button class="${ui.chartLoc === l ? 'on' : ''}" data-pp="chart-loc" data-v="${esc(l)}" style="--lc:${locColor(l)}"><i></i>${flagOf(l)} ${esc(window.WorkOSTranslate?.text(l) ?? l)} <b>${items.filter(u => locKey(u) === l).length}</b></button>`).join('')}</div>` : '';
    return `<section class="pp-panel pp-oc-panel"><div class="pp-oc-bar">${legend}<span class="pp-oc-count">${tr(`共 ${items.length} 人`, `${items.length} people`)}</span><button class="pp-btn small" data-pp="chart-expand">${icon('arrows-out-simple')} ${tr('全部展开', 'Expand all')}</button></div>
      <div class="pp-orgchart"><ul>${tops.map(node).join('')}</ul></div>${unassigned.length ? `<h3 class="pp-sub-h">${tr('尚未设置汇报线', 'No reporting line yet')}</h3><div class="pp-unassigned">${unassigned.map(u => `<span>${avatar(u, 24)} ${esc(u.display_name)}${u.title ? ` · ${esc(u.title)}` : ''}${locKey(u) ? ` · ${esc(locKey(u))}` : ''}</span>`).join('')}</div>` : ''}</section>`;
  }
  function chartPage() {
    const head = heading(tr('组织架构', 'Org chart'), tr('公司的汇报关系，以及每个人的岗位和所在地。点卡片右下角可以收起或展开下属，点所在地只突出显示该地的人。', 'Company reporting lines with each person’s role and location. Use the button on a card to collapse its reports; click a location to highlight it.'));
    if (!caps()) return `<div class="pp">${head}<p class="pp-hint">${tr('需要后台升级后才能使用。', 'Requires the backend upgrade.')}</p></div>`;
    if (!ui.chart && !ui.chartLoading && !ui.chartError) loadChart();
    if (ui.chartError) return `<div class="pp">${head}<div class="pp-alert">${esc(ui.chartError)}</div></div>`;
    if (!ui.chart) return `<div class="pp">${head}<p class="pp-hint">${tr('正在读取…', 'Loading…')}</p></div>`;
    window.WorkOSNames?.apply(ui.chart.items);
    return `<div class="pp">${head}${orgChart(ui.chart.items)}${me()?.isAdmin ? `<p class="pp-hint">${icon('pencil-simple')} ${tr('要修改汇报线、岗位或工作地点：管理员在“组织与权限”里直接修改。', 'Admins change reporting lines, titles and work locations in Organization & permissions.')}</p>` : ''}</div>`;
  }
  async function patchMember(id, body) {
    try {
      const row = await ctx.api.request('/org/members/' + encodeURIComponent(id), { method:'PATCH', body });
      ui.org.items = ui.org.items.map(u => u.id === id ? { ...u, ...row } : u);
      const dirUser = S().directory.find(u => u.id === id); if (dirUser) Object.assign(dirUser, { title:row.title, location:row.location, manager_id:row.manager_id, role:row.role, name_zh:row.name_zh, name_en:row.name_en });
      if (id === me().id) await ctx.refreshMe();
      if ('managerId' in body && ctx.reloadDirectory) { try { await ctx.reloadDirectory(); } catch {} }
      ui.team = null; ui.chart = null; ctx.toast(tr('已保存', 'Saved'));
    } catch (e) { ctx.toast(ctx.explainError(e)); }
    ctx.rerender();
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', e => {
    if (!ctx) return;
    const t = e.target.closest('[data-pp]'); if (!t) return;
    e.preventDefault();
    const a = t.dataset.pp;
    if (a === 'scope') { ui.teamScope = t.dataset.v; ui.team = null; return ctx.rerender(); }
    if (a === 'reload-team') { ui.team = null; return ctx.rerender(); }
    if (a === 'view-tasks') { window.WorkOSTaskBoard?.viewAs?.(t.dataset.id); location.hash = 'tasks'; return; }
    if (a === 'toggle-member') { ui.teamOpen.has(t.dataset.id) ? ui.teamOpen.delete(t.dataset.id) : ui.teamOpen.add(t.dataset.id); return ctx.rerender(); }
    if (a === 'chart-toggle') { const id = t.dataset.id; ui.chartCollapsed.has(id) ? ui.chartCollapsed.delete(id) : ui.chartCollapsed.add(id); return ctx.rerender(); }
    if (a === 'chart-expand') { ui.chartCollapsed.clear(); return ctx.rerender(); }
    if (a === 'chart-loc') { ui.chartLoc = ui.chartLoc === t.dataset.v ? '' : t.dataset.v; return ctx.rerender(); }
    if (a === 'org-view') { ui.orgView = t.dataset.v; return ctx.rerender(); }
    if (a === 'invite-open') { ui.inviteOpen = true; ui.inviteResult = null; ui.inviteError = ''; return ctx.rerender(); }
    if (a === 'invite-close') { ui.inviteOpen = false; ui.inviteResult = null; ui.inviteError = ''; return ctx.rerender(); }
    if (a === 'invite-copy') { const inp = document.querySelector('[data-pp-invite-url]'); const v = inp?.value || ''; (navigator.clipboard?.writeText(v) || Promise.reject()).then(() => ctx.toast(tr('链接已复制', 'Link copied'))).catch(() => { inp?.select(); try { document.execCommand('copy'); ctx.toast(tr('链接已复制', 'Link copied')); } catch {} }); return; }
    if (a === 'invite-revoke') { ctx.api.delete('/org/invites/' + encodeURIComponent(t.dataset.id)).then(() => { ui.invites.items = ui.invites.items.map(i => i.id === t.dataset.id ? { ...i, status:'revoked' } : i); ctx.toast(tr('邀请已撤销', 'Invite revoked')); ctx.rerender(); }).catch(err => ctx.toast(ctx.explainError(err))); return; }
    if (a === 'disable-cancel') { ui.disabling = null; return ctx.rerender(); }
    if (a === 'enable') { setStatus(t.dataset.id, { active:true }); return; }
    if (a === 'remove-avatar') { ctx.api.delete('/me/avatar').then(async () => { await ctx.refreshMe(); ui.chart = null; ui.org = null; ctx.toast(tr('头像已移除', 'Photo removed')); ctx.rerender(); }).catch(err => ctx.toast(ctx.explainError(err))); }
  });
  document.addEventListener('change', async e => {
    if (!ctx) return;
    const el = e.target;
    if (el.matches('[data-pp-avatar]') && el.files?.[0]) {
      try { const dataUrl = await resizeImage(el.files[0]); const r = await ctx.api.request('/me/avatar', { method:'PUT', body:{ dataUrl } }); await ctx.refreshMe(); ui.chart = null; ui.org = null; const self = S().directory.find(u => u.id === me().id); if (self) self.avatar_version = r.avatarVersion; ctx.toast(tr('头像已更新', 'Photo updated')); ctx.rerender(); }
      catch (err) { ctx.toast(ctx.explainError(err)); }
      return;
    }
    if (el.matches('[data-pp-field]')) { const v = el.value.trim(), f = el.dataset.ppField; if (f === 'email' && (!v || !el.checkValidity())) { ctx.toast(tr('请填写有效的邮箱地址', 'Enter a valid email address')); return; } return patchMember(el.dataset.id, { [f]:f === 'managerId' ? (v || null) : v }); }
    if (el.matches('[data-pp-admin]')) return patchMember(el.dataset.id, { isAdmin:el.checked });
    if (el.matches('[data-pp-status]')) {
      if (el.checked) { ui.disabling = null; return ctx.rerender(); }
      const id = el.dataset.id; ui.disabling = { id, counts:null }; ctx.rerender();
      try { const counts = await ctx.api.get('/org/members/' + encodeURIComponent(id) + '/open-tasks'); if (ui.disabling?.id === id) { ui.disabling.counts = counts; ctx.rerender(); } } catch {}
      return;
    }
    if (el.matches('[data-pp-grant]')) {
      const u = ui.org.items.find(x => x.id === el.dataset.id), g = new Set(u.grants || []);
      el.checked ? g.add(el.dataset.ppGrant) : g.delete(el.dataset.ppGrant);
      if (!g.has('products')) g.delete('product_cost_detail');
      return patchMember(u.id, { grants:[...g] });
    }
  });
  async function setStatus(id, body) {
    try {
      const r = await ctx.api.request('/org/members/' + encodeURIComponent(id) + '/status', { method:'POST', body });
      ui.disabling = null; ui.org = null; ui.chart = null; ui.team = null;
      const dir = S().directory; if (!body.active) { const i = dir.findIndex(u => u.id === id); if (i >= 0) dir.splice(i, 1); }
      const n = r.reassigned || {};
      ctx.toast(body.active ? tr('已恢复，对方可以重新登录', 'Restored; they can sign in again') : tr(`已停用 · 转交任务 ${n.owned || 0} 项 · 改验收人 ${n.reviewing || 0} 项`, `Disabled · ${n.owned || 0} tasks handed over · ${n.reviewing || 0} reviews moved`));
      if (ctx.reloadDirectory) await ctx.reloadDirectory();
    } catch (err) { ctx.toast(ctx.explainError(err)); }
    ctx.rerender();
  }
  document.addEventListener('submit', async e => {
    const f = e.target;
    if (ctx && f.id === 'pp-disable') { e.preventDefault(); const v = new FormData(f).get('reassignTo'); return setStatus(f.dataset.id, { active:false, reassignTo:v ? String(v) : null }); }
    if (ctx && f.id === 'pp-invite') {
      e.preventDefault(); const fd = new FormData(f), grants = [];
      if (fd.get('products')) grants.push('products'); if (fd.get('products') && fd.get('product_cost_detail')) grants.push('product_cost_detail');
      const body = { displayName:String(fd.get('displayName') || '').trim(), email:String(fd.get('email') || '').trim(), title:String(fd.get('title') || '').trim(), location:String(fd.get('location') || '').trim(), managerId:fd.get('managerId') ? String(fd.get('managerId')) : null, role:String(fd.get('role') || 'employee'), grants };
      if (fd.get('factory')) { body.factory = String(fd.get('factory')); body.role = 'employee'; body.grants = []; }
      if (ui.invites?.emailDelivery) body.sendEmail = !!fd.get('sendEmail');
      ui.inviteBusy = true; ui.inviteError = ''; ctx.rerender();
      try { const r = await ctx.api.request('/org/invites', { method:'POST', body }); ui.inviteResult = r; ui.invites = ui.invites || { items:[] }; ui.invites.items = [r, ...ui.invites.items]; }
      catch (err) { ui.inviteError = ctx.explainError(err); }
      ui.inviteBusy = false; return ctx.rerender();
    }
    if (!ctx || f.id !== 'pp-profile') return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    try { await ctx.api.request('/me/profile', { method:'PATCH', body:v }); await ctx.refreshMe(); if (S().actor) { S().actor._dn = undefined; } ui.chart = null; const self = S().directory.find(u => u.id === me().id); if (self) Object.assign(self, v); ui.profileMsg = tr('已保存', 'Saved'); ctx.toast(tr('个人资料已保存', 'Profile saved')); }
    catch (err) { ui.profileMsg = ctx.explainError(err); }
    ctx.rerender();
  });

  window.WorkOSPeople = { configure(next) { ctx = next; }, avatar, workbench, team, settings, org, chart:chartPage, reset() { ui.team = null; ui.org = null; ui.chart = null; ui.teamOpen.clear(); }, _ui:ui };
})();
