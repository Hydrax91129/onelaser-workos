/*
 * IT accounts and subscriptions (IT 资产与账号), phase 1 of the IT assets module.
 *
 * Everyone keeps their own accounts current (我的账号) and confirms them once a quarter; managers see their
 * reports' accounts; IT (WORKOS_IT_USER_IDS on the server) manages everything, and executives read everything.
 * Subscription costs and payment labels are only sent by the server to IT and executives.
 *
 * Passwords are never typed here: each account links to its item in the company password manager (vault link),
 * and the server refuses free text that looks like a password or key.
 *
 * Data comes from /it/* (server). CSV export is fetched through the API and saved as a download; CSV import reads
 * the file as UTF-8 and falls back to GBK (Excel on Chinese Windows) when UTF-8 does not decode.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, access = null, my = null, list = null, summary = null, flags = null, checks = null, people = null;
  let loading = false, error = '', detail = null, busy = false, importResult = null;
  const ui = { tab:'mine', q:'', category:'', status:'live' };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const apiBase = () => (window.WORKOS_CONFIG && window.WORKOS_CONFIG.apiBase) || '/api';
  const put = (path, body) => ctx.api.request(path, { method:'PUT', body });
  const CATEGORY = { email:['邮箱', 'Email'], saas:['软件服务', 'Software / SaaS'], social:['社交媒体', 'Social media'], marketplace:['电商平台', 'Marketplace'],
    cloud:['云服务', 'Cloud'], domain:['域名', 'Domain'], finance:['财务银行', 'Finance / bank'], other:['其他', 'Other'] };
  const STATUS = { active:['在用', 'Active', 'green'], to_cancel:['待取消', 'To cancel', 'amber'], cancelled:['已取消', 'Cancelled', 'done'] };
  const MFA = { none:['无', 'None'], sms:['短信', 'SMS'], app:['验证器 App', 'Authenticator app'], email:['邮箱验证', 'Email'], hardware_key:['硬件密钥', 'Hardware key'], other:['其他', 'Other'] };
  const MAILBOX = { personal:['个人邮箱', 'Personal'], shared:['共享邮箱', 'Shared'], alias:['别名', 'Alias'], forwarding:['转发', 'Forwarding'] };
  const CYCLE = { monthly:['月付', 'Monthly'], yearly:['年付', 'Yearly'], one_off:['一次性', 'One-off'] };
  const FLAG = { needs_change:['需要修改', 'Needs change'], stopped_using:['已不再使用', 'No longer used'], problem:['有问题', 'Problem'], missing:['有账号未登记', 'Unregistered account'] };
  const RELATION = { owner:['负责人', 'Owner'], user:['共用', 'User'], mfa:['两步验证在我这', '2FA on me'] };
  const REMIND = { renewal:['续费', 'Renewal'], cancel_before_renewal:['待取消但会自动续费', 'Set to cancel but auto-renews'], leaving_owner:['负责人即将离职', 'Owner leaving'], leaving_mfa:['两步验证人即将离职', '2FA holder leaving'] };
  const w = pair => pair ? tr(pair[0], pair[1]) : '';
  const badge = s => `<span class="rma-badge ${STATUS[s]?.[2] || ''}">${esc(w(STATUS[s]))}</span>`;
  const money = (n, cur) => n == null ? '—' : `${esc(cur || '')} ${Number(n).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits:2 })}`;
  const inDays = d => d == null ? '' : d < 0 ? tr(`已过 ${-d} 天`, `${-d} days ago`) : d === 0 ? tr('今天', 'today') : tr(`${d} 天后`, `in ${d} days`);
  const safeUrl = u => /^(https:\/\/|op:\/\/)/.test(String(u || '')) ? u : '';
  const personName = p => p ? `${esc(p.name)}${p.leaving ? ` <span class="rma-badge amber">${tr('离职中', 'leaving')}</span>` : ''}${p.active === false ? ` <span class="rma-badge red">${tr('已停用', 'inactive')}</span>` : ''}` : '—';
  const PASSWORD_NOTE = () => tr('密码、恢复码和 API 密钥不要填在这里：请保存在公司密码管理器里，这里只贴它的链接。',
    'Never type passwords, recovery codes or API keys here: keep them in the company password manager and paste its link.');

  function configure(next) { ctx = next; }
  function reset() { access = my = list = summary = flags = checks = people = detail = importResult = null; loading = false; error = ''; Object.assign(ui, { tab:'mine', q:'', category:'', status:'live' }); }
  async function load() {
    if (loading) return; loading = true;
    try {
      access = await ctx.api.get('/it/access');
      my = await ctx.api.get('/it/my');
      list = access.seesAll || access.hasReports ? (await ctx.api.get('/it/accounts')).items : null;
      summary = access.seesAll ? await ctx.api.get('/it/summary') : null;
      flags = access.isIt ? (await ctx.api.get('/it/flags')).items : null;
      checks = access.isIt ? await ctx.api.get('/it/checks') : null;
      error = '';
    } catch (e) { error = e.message || tr('账号登记读取失败', 'Could not load accounts'); }
    finally { loading = false; ctx.rerender(); }
  }
  async function reload() { access = null; await load(); }
  async function loadPeople() { if (!people) people = (await ctx.api.get('/it/people')).items; return people; }

  function tabs() {
    const t = [['mine', tr('我的账号', 'My accounts'), my?.accounts.length]];
    if (list) t.push(['all', access.seesAll ? tr('全部账号', 'All accounts') : tr('团队账号', 'Team accounts'), list.length]);
    if (summary) t.push(['summary', tr('费用与提醒', 'Costs & alerts'), null]);
    if (flags) t.push(['flags', tr('员工反馈', 'Reports'), flags.length]);
    if (checks) t.push(['checks', tr('季度确认', 'Quarterly check'), checks.started ? `${checks.percent}%` : null]);
    if (access?.isIt) t.push(['import', tr('导入导出', 'Import / export'), null]);
    if (!t.some(x => x[0] === ui.tab)) ui.tab = 'mine';
    return `<div class="rma-views it-tabs" role="tablist">${t.map(([id, label, n]) => `<button class="${ui.tab === id ? 'on' : ''}" data-it="tab" data-v="${id}">${esc(label)}${n != null && n !== '' ? ` <b>${esc(n)}</b>` : ''}</button>`).join('')}</div>`;
  }

  function render() {
    if (!access && !error) { load(); return `<div class="rma it"><p class="wms-hint">${tr('正在读取账号登记…', 'Loading accounts…')}</p></div>`; }
    if (error && !access) return `<div class="rma it"><div class="wms-alert">${esc(error)}</div></div>`;
    const intro = access.isIt
      ? tr('公司所有账号、邮箱和订阅的登记表：谁负责、谁在用、两步验证在谁手上、密码存在哪里、每月花多少、什么时候续费。', 'The register of every company account, mailbox and subscription: who owns it, who uses it, who holds the 2FA, where its password lives, what it costs and when it renews.')
      : tr('登记你负责和在用的公司账号。每季度确认一次，有变化随时更新。', 'Register the company accounts you own and use. Confirm them once a quarter and update them whenever something changes.');
    const body = { mine:mineTab, all:allTab, summary:summaryTab, flags:flagsTab, checks:checksTab, import:importTab }[ui.tab] || mineTab;
    return `<div class="rma it">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · IT</div><h1>${tr('IT 账号与订阅', 'IT accounts & subscriptions')}</h1><p>${intro}</p></div>
        <div class="page-actions"><button class="btn primary" data-it="new">${icon('plus')} ${tr('登记账号', 'Register account')}</button></div></div>
      <div class="it-vault-note">${icon('lock-key')} ${PASSWORD_NOTE()}</div>
      ${!access.configured && access.seesAll ? `<div class="wms-alert">${tr('还没有设置 IT 管理员（服务器配置 WORKOS_IT_USER_IDS），续费和离职提醒暂时不会发送。', 'No IT admins are configured yet (WORKOS_IT_USER_IDS on the server), so renewal and leaving reminders are not sent.')}</div>` : ''}
      ${tabs()}
      ${body()}
    </div>`;
  }

  /* ---------- my accounts and the quarterly check ---------- */
  function checkCard() {
    const c = my.check;
    if (c.status === 'not_started') return '';
    if (c.status === 'done') return `<div class="it-check done">${icon('seal-check')} ${tr(`本季度（${c.quarter}）已确认`, `Confirmed for ${c.quarter}`)}${c.confirmedAt ? ` · ${esc(String(c.confirmedAt).slice(0, 10))}` : ''}</div>`;
    const rows = my.accounts.map(a => `<li><span><b>${esc(a.service)}</b> <small>${esc(a.login || '')}</small></span>
      <label><input type="radio" name="ok-${esc(a.id)}" value="1" checked> ${tr('正确', 'Correct')}</label>
      <label><input type="radio" name="ok-${esc(a.id)}" value="0"> ${tr('需要修改', 'Needs change')}</label>
      <input class="it-note" name="note-${esc(a.id)}" maxlength="1000" placeholder="${tr('哪里要改？（选“需要修改”时填）', 'What should change?')}"></li>`).join('');
    return `<form id="it-check" class="it-check">
      <h3>${icon('clipboard-text')} ${tr(`请确认你的账号（${c.quarter}）`, `Confirm your accounts (${c.quarter})`)}</h3>
      <p class="wms-hint">${tr('看一下下面每个账号是否还正确：负责人、登录邮箱、两步验证绑定人、密码库链接。还有在用但没登记的账号，写在最下面。', 'Check each account below is still right: owner, login, 2FA holder and vault link. Note any account you use that is not listed.')}</p>
      <ul>${rows || `<li class="wms-hint">${tr('你名下还没有登记任何账号。', 'Nothing is registered to you yet.')}</li>`}</ul>
      <label class="field full"><span>${tr('还有没登记的账号吗？（例如：Canva 团队版，用 design@ 登录）', 'Any account you use that is not listed? (e.g. Canva team, design@)')}</span><textarea name="missing" rows="2" maxlength="1000"></textarea></label>
      <div class="rma-actions"><button class="btn primary" type="submit">${icon('check')} ${tr('确认提交', 'Confirm')}</button></div><p class="wms-error" role="alert"></p></form>`;
  }
  function mineTab() {
    const flagsList = my.openFlags.length ? `<section class="it-panel"><h3>${icon('flag')} ${tr('我提交的反馈（IT 处理中）', 'My reports (with IT)')}</h3><ul class="it-list">${my.openFlags.map(f => `<li><b>${esc(f.service || tr('未登记账号', 'Unregistered account'))}</b> ${esc(w(FLAG[f.kind]))}${f.note ? ` · ${esc(f.note)}` : ''}<span>${esc(String(f.createdAt).slice(0, 10))}</span></li>`).join('')}</ul></section>` : '';
    return `${checkCard()}${accountTable(my.accounts, false, tr('你还没有登记账号。点右上角“登记账号”，把你负责或在用的公司账号加进来。', 'No accounts yet. Use “Register account” to add the company accounts you own or use.'))}${flagsList}`;
  }

  /* ---------- account tables ---------- */
  function filtered(items) {
    const q = ui.q.trim().toLowerCase();
    return items.filter(a => {
      if (ui.category && a.category !== ui.category) return false;
      if (ui.status === 'live' && a.status === 'cancelled') return false;
      if (ui.status && ui.status !== 'live' && a.status !== ui.status) return false;
      return !q || [a.service, a.login, a.url, a.owner?.name, a.mfaHolder?.name, a.notes, ...(a.users || []).map(u => u.name)].some(x => String(x || '').toLowerCase().includes(q));
    });
  }
  function accountTable(items, withFilters, empty) {
    const cost = items.some(a => a.subscription);
    const rows = withFilters ? filtered(items) : items;
    const filters = withFilters ? `<div class="rma-bar">
      <label class="wms-search">${icon('magnifying-glass')}<input data-it-search value="${esc(ui.q)}" placeholder="${tr('搜索服务、登录账号、负责人、备注', 'Search service, login, owner, notes')}"></label>
      <select data-it-filter="category"><option value="">${tr('全部类别', 'All categories')}</option>${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}" ${ui.category === k ? 'selected' : ''}>${esc(w(v))}</option>`).join('')}</select>
      <select data-it-filter="status"><option value="live" ${ui.status === 'live' ? 'selected' : ''}>${tr('在用和待取消', 'Active and to cancel')}</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${ui.status === k ? 'selected' : ''}>${esc(w(v))}</option>`).join('')}<option value="" ${ui.status === '' ? 'selected' : ''}>${tr('全部状态', 'Any status')}</option></select>
    </div>` : '';
    return `${filters}<div class="wms-table-wrap"><table class="wms-table rma-table it-table"><thead><tr><th>${tr('服务', 'Service')}</th><th>${tr('类别', 'Category')}</th><th>${tr('登录账号', 'Login')}</th><th>${tr('负责人', 'Owner')}</th><th>${tr('两步验证', '2FA')}</th><th>${tr('密码库', 'Vault')}</th>${cost ? `<th class="num">${tr('费用', 'Cost')}</th><th>${tr('续费', 'Renews')}</th>` : ''}<th>${tr('状态', 'Status')}</th></tr></thead><tbody>
      ${rows.map(a => { const s = a.subscription;
        return `<tr class="rma-row" data-it="open" data-id="${esc(a.id)}" tabindex="0"><td><b>${esc(a.service)}</b>${a.relation?.length ? `<small>${esc(a.relation.map(r => w(RELATION[r])).join(' · '))}</small>` : ''}</td>
        <td>${esc(w(CATEGORY[a.category]))}${a.mailboxType ? `<small>${esc(w(MAILBOX[a.mailboxType]))}</small>` : ''}</td><td class="mono">${esc(a.login || '—')}</td><td>${personName(a.owner)}</td>
        <td>${a.mfaMethod === 'none' ? `<span class="late">${tr('未开启', 'Off')}</span>` : `${esc(w(MFA[a.mfaMethod]))}${a.mfaHolder ? `<small>${personName(a.mfaHolder)}</small>` : ''}`}</td>
        <td>${a.vaultRef ? `<span class="it-ok">${icon('check-circle')} ${tr('已链接', 'Linked')}</span>` : `<span class="late">${tr('未链接', 'Missing')}</span>`}</td>
        ${cost ? `<td class="num">${s && s.cost != null ? `${money(s.cost, s.currency)}<small>${esc(w(CYCLE[s.cycle]))}</small>` : '—'}</td><td class="${s?.daysToRenewal != null && s.daysToRenewal <= 7 ? 'late' : ''}">${s?.nextRenewal ? `${esc(s.nextRenewal)}<small>${esc(inDays(s.daysToRenewal))}</small>` : '—'}</td>` : ''}
        <td>${badge(a.status)}</td></tr>`; }).join('') || `<tr><td colspan="${cost ? 9 : 7}" class="wms-empty">${esc(empty || tr('没有符合条件的账号。', 'No matching accounts.'))}</td></tr>`}
    </tbody></table></div>`;
  }
  const allTab = () => accountTable(list, true);

  /* ---------- summary, flags, checks ---------- */
  function summaryTab() {
    const s = summary, cur = Object.entries(s.costs);
    const item = (a, extra = '') => `<li data-it="open" data-id="${esc(a.id)}" tabindex="0"><b>${esc(a.service)}</b> <small>${esc(a.login || '')}</small>${extra}</li>`;
    return `<div class="rma-kpis">
        ${cur.map(([c, v]) => `<div class="rma-kpi"><span>${tr('订阅费用', 'Subscriptions')} · ${esc(c)}</span><b>${money(v.monthly, c)}</b><em>${tr(`每月 · 全年约 ${money(v.yearly, c)}`, `per month · ~${money(v.yearly, c)} a year`)}</em></div>`).join('') || `<div class="rma-kpi"><span>${tr('订阅费用', 'Subscriptions')}</span><b>—</b><em>${tr('还没有填写费用', 'No costs entered yet')}</em></div>`}
        <div class="rma-kpi"><span>${tr('账号总数', 'Accounts')}</span><b>${s.counts.total}</b><em>${tr(`在用 ${s.counts.active} · 待取消 ${s.counts.toCancel}`, `${s.counts.active} active · ${s.counts.toCancel} to cancel`)}</em></div>
        <div class="rma-kpi"><span>${tr('需要处理', 'Needs attention')}</span><b class="${s.counts.noOwner + s.counts.noVault + s.counts.leaving ? 'late' : ''}">${s.counts.noOwner + s.counts.noVault + s.counts.leaving}</b><em>${tr(`员工反馈 ${s.counts.openFlags} 条`, `${s.counts.openFlags} open reports`)}</em></div>
      </div>
      <div class="it-grid">
        <section class="it-panel"><h3>${icon('calendar')} ${tr('60 天内续费', 'Renewing within 60 days')}</h3><ul class="it-list">${s.renewals.map(r => `<li data-it="open" data-id="${esc(r.id)}" tabindex="0"><b>${esc(r.service)}</b> ${money(r.cost, r.currency)} ${r.status === 'to_cancel' ? `<span class="rma-badge amber">${tr('待取消', 'to cancel')}</span>` : ''}${r.autoRenew ? '' : ` <small>${tr('不自动续费', 'manual')}</small>`}<span class="${r.days <= 7 ? 'late' : ''}">${esc(r.date)} · ${esc(inDays(r.days))}</span></li>`).join('') || `<li class="wms-hint">${tr('没有近期续费。', 'Nothing renewing soon.')}</li>`}</ul></section>
        <section class="it-panel"><h3>${icon('user-minus')} ${tr('离职人员名下的账号', 'Accounts held by people leaving')}</h3><ul class="it-list">${s.leaving.map(x => item(x, `<span>${esc(x.name)} · ${esc(w(RELATION[x.role]))}</span>`)).join('') || `<li class="wms-hint">${tr('没有。', 'None.')}</li>`}</ul></section>
        <section class="it-panel"><h3>${icon('user-circle-dashed')} ${tr('没有负责人（或负责人已停用）', 'No owner (or owner inactive)')}</h3><ul class="it-list">${s.noOwner.map(x => item(x, x.ownerName ? `<span>${esc(x.ownerName)}</span>` : '')).join('') || `<li class="wms-hint">${tr('没有。', 'None.')}</li>`}</ul></section>
        <section class="it-panel"><h3>${icon('lock-key-open')} ${tr('没有密码库链接', 'No vault link')}</h3><ul class="it-list">${s.noVault.map(x => item(x)).join('') || `<li class="wms-hint">${tr('全部都链接了。', 'All linked.')}</li>`}</ul></section>
      </div>
      ${s.byCategory.length ? `<section class="it-panel"><h3>${icon('chart-bar')} ${tr('按类别', 'By category')}</h3><table class="wms-table"><thead><tr><th>${tr('类别', 'Category')}</th><th class="num">${tr('账号数', 'Accounts')}</th><th class="num">${tr('每月', 'Monthly')}</th><th class="num">${tr('每年', 'Yearly')}</th></tr></thead><tbody>
        ${s.byCategory.map(c => `<tr><td>${esc(w(CATEGORY[c.category]))}</td><td class="num">${c.count}</td><td class="num">${money(c.monthly, c.currency)}</td><td class="num">${money(c.yearly, c.currency)}</td></tr>`).join('')}</tbody></table></section>` : ''}`;
  }
  function flagsTab() {
    return `<div class="wms-table-wrap"><table class="wms-table it-table"><thead><tr><th>${tr('账号', 'Account')}</th><th>${tr('反馈', 'Report')}</th><th>${tr('说明', 'Note')}</th><th>${tr('提交人', 'From')}</th><th>${tr('时间', 'When')}</th><th></th></tr></thead><tbody>
      ${flags.map(f => `<tr><td>${f.accountId ? `<a href="#it" data-it="open" data-id="${esc(f.accountId)}"><b>${esc(f.service)}</b></a>` : `<b>${tr('未登记账号', 'Unregistered account')}</b>`}${f.login ? `<small>${esc(f.login)}</small>` : ''}</td><td>${esc(w(FLAG[f.kind]))}</td><td>${esc(f.note || '—')}</td><td>${esc(f.byName)}</td><td>${esc(String(f.createdAt).slice(0, 10))}</td>
        <td><button class="btn" data-it="resolve" data-id="${esc(f.id)}">${icon('check')} ${tr('已处理', 'Done')}</button></td></tr>`).join('') || `<tr><td colspan="6" class="wms-empty">${tr('没有待处理的反馈。', 'No open reports.')}</td></tr>`}
    </tbody></table></div>`;
  }
  function checksTab() {
    const c = checks;
    if (!c.started) return `<section class="it-panel"><h3>${icon('clipboard-text')} ${tr(`季度确认（${c.quarter}）`, `Quarterly check (${c.quarter})`)}</h3>
      <p>${tr('每个季度第一周系统会自动给所有在职员工发“请确认你的账号与设备”。本季度还没开始，可以现在手动发起。', 'In the first week of each quarter everyone gets “Confirm your accounts”. This quarter has not started; you can start it now.')}</p>
      <button class="btn primary" data-it="start-check">${icon('paper-plane-tilt')} ${tr('现在发起本季度确认', 'Start this quarter now')}</button></section>`;
    return `<div class="rma-kpis"><div class="rma-kpi"><span>${tr('完成率', 'Done')}</span><b>${c.percent}%</b><em>${tr(`${c.done} / ${c.total} 人`, `${c.done} of ${c.total} people`)}</em></div></div>
      <div class="wms-table-wrap"><table class="wms-table it-table"><thead><tr><th>${tr('姓名', 'Name')}</th><th>${tr('状态', 'Status')}</th><th>${tr('确认时间', 'Confirmed')}</th></tr></thead><tbody>
      ${c.people.map(p => `<tr><td>${esc(p.name)}</td><td>${p.status === 'done' ? `<span class="rma-badge green">${tr('已确认', 'Done')}</span>` : `<span class="rma-badge amber">${tr('未确认', 'Pending')}</span>${p.overdueDays >= 7 ? ` <small class="late">${tr(`已 ${p.overdueDays} 天`, `${p.overdueDays} days`)}</small>` : ''}`}</td><td>${esc(p.confirmedAt ? String(p.confirmedAt).slice(0, 10) : '—')}</td></tr>`).join('')}
      </tbody></table></div><p class="wms-hint">${tr('没确认的人会在第 7 天和第 14 天再收到一次提醒。', 'People who have not confirmed are reminded again on day 7 and day 14.')}</p>`;
  }
  function importTab() {
    const r = importResult;
    return `<section class="it-panel"><h3>${icon('download-simple')} ${tr('导出', 'Export')}</h3>
        <p class="wms-hint">${tr('导出全部账号为 CSV（Excel 可直接打开），含费用信息，请勿外传。', 'Export every account as CSV (opens in Excel), including costs. Keep it internal.')}</p>
        <button class="btn" data-it="export">${icon('file-csv')} ${tr('导出 CSV', 'Export CSV')}</button></section>
      <section class="it-panel"><h3>${icon('upload-simple')} ${tr('批量导入', 'Bulk import')}</h3>
        <ol class="it-steps"><li>${tr('下载模板，用 Excel 填写；每行一个账号。', 'Download the template and fill it in Excel, one account per row.')} <button class="btn" data-it="template">${icon('file-arrow-down')} ${tr('下载模板', 'Template')}</button></li>
          <li>${tr('“负责人”“共用人”“两步验证绑定人”填员工姓名或公司邮箱；多个共用人用分号隔开。类别、状态等可直接填中文（邮箱、软件服务、在用、待取消、年付…）。', 'Owner, users and 2FA holder: a name or company email; separate several users with semicolons. Categories, status and cycle accept the Chinese labels.')}</li>
          <li>${tr('“密码库链接”只贴密码管理器里这条记录的链接，不要填密码。', 'Vault link: paste the password-manager item link, never the password.')}</li>
          <li>${tr('先“检查”，没有错误再“导入”。有任何一行出错，整份文件都不会导入；已登记过的（服务名称 + 登录账号相同）会自动跳过。', 'Check first, then import. If any row has an error nothing is imported; rows already registered (same service and login) are skipped.')}</li></ol>
        <form id="it-import" class="form-grid"><label class="field full"><span>${tr('CSV 文件', 'CSV file')}</span><input type="file" name="file" accept=".csv,text/csv" required></label>
          <div class="full rma-actions"><button class="btn" type="submit" name="mode" value="check">${icon('magnifying-glass')} ${tr('检查', 'Check')}</button><button class="btn primary" type="submit" name="mode" value="import">${icon('upload-simple')} ${tr('导入', 'Import')}</button></div>
          <p class="wms-error" role="alert"></p></form>
        ${r ? `<div class="it-import-result ${r.errors?.length ? 'bad' : 'good'}">${r.errors?.length
          ? `<b>${esc(r.message)}</b><ul>${r.errors.map(e => `<li>${tr(`第 ${esc(e.row)} 行`, `Row ${esc(e.row)}`)}：${esc(e.message)}</li>`).join('')}</ul>`
          : r.dryRun ? `${icon('check-circle')} ${tr(`检查通过：共 ${r.rows} 行，可导入 ${r.toImport} 行，跳过 ${r.skipped.length} 行（已登记）。`, `Looks good: ${r.rows} rows, ${r.toImport} to import, ${r.skipped.length} already registered.`)}`
          : `${icon('check-circle')} ${tr(`已导入 ${r.imported} 行，跳过 ${r.skipped.length} 行（已登记）。`, `Imported ${r.imported} rows; ${r.skipped.length} already registered.`)}`}</div>` : ''}
      </section>`;
  }

  /* ---------- account detail and form ---------- */
  async function openAccount(id) {
    try { detail = await ctx.api.get('/it/accounts/' + encodeURIComponent(id)); await loadPeople(); }
    catch (e) { ctx.toast?.(e.message || tr('读取失败', 'Could not load')); return; }
    drawDetail(true);
  }
  const fact = (label, value, full) => `<div${full ? ' class="full"' : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
  const opt = (map, cur, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') + Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(w(v))}</option>`).join('');
  const personOpt = (cur, blank) => `<option value="">${esc(blank)}</option>` + (people || []).map(p => `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  function accountForm(a, isNew) {
    const it = access.isIt, s = a?.subscription || {};
    const t = (name, label, v, max = 120, ph = '', full = false) => `<label class="field${full ? ' full' : ''}"><span>${label}</span><input name="${name}" maxlength="${max}" value="${esc(v || '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
    const ownerField = it ? `<label class="field"><span>${tr('负责人', 'Owner')}</span><select name="ownerId">${personOpt(a?.owner?.id || '', tr('（无）', '(none)'))}</select></label>`
      : `<div class="field"><span>${tr('负责人', 'Owner')}</span><b>${isNew ? tr('我', 'Me') : personName(a.owner)}</b></div>`;
    const usersField = it || isNew || a?.owner?.id === ctx.state().actor?.id ? `<label class="field full"><span>${tr('共用人（按住 Ctrl 多选）', 'Other users (Ctrl-click to pick several)')}</span><select name="userIds" multiple size="4">${(people || []).map(p => `<option value="${esc(p.id)}" ${(a?.users || []).some(u => u.id === p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : '';
    return `<form id="it-account" class="form-grid" data-new="${isNew ? '1' : ''}">
      ${t('service', tr('服务名称', 'Service'), a?.service, 120, tr('例如：Google Workspace、亚马逊卖家后台', 'e.g. Google Workspace, Amazon Seller Central'))}
      <label class="field"><span>${tr('类别', 'Category')}</span><select name="category">${opt(CATEGORY, a?.category || 'saas')}</select></label>
      ${t('login', tr('登录账号（公司邮箱或用户名）', 'Login (company email or username)'), a?.login, 200)}
      <label class="field"><span>${tr('邮箱类型（类别为邮箱时）', 'Mailbox type (email only)')}</span><select name="mailboxType">${opt(MAILBOX, a?.mailboxType || '', '—')}</select></label>
      ${t('url', tr('登录网址', 'Sign-in URL'), a?.url, 500, 'https://')}
      ${ownerField}
      ${t('vaultRef', tr('密码库链接（1Password / Bitwarden 里这条记录的链接）', 'Vault link (the item in 1Password / Bitwarden)'), a?.vaultRef, 500, 'https://… 或 op://…', true)}
      <label class="field"><span>${tr('两步验证方式', '2FA method')}</span><select name="mfaMethod">${opt(MFA, a?.mfaMethod || 'none')}</select></label>
      <label class="field"><span>${tr('两步验证绑定在谁那里', '2FA held by')}</span><select name="mfaHolderId">${personOpt(a?.mfaHolder?.id || '', '—')}</select></label>
      ${t('mfaNote', tr('两步验证说明（例如：绑定公司备用手机 尾号 8899）', '2FA note (e.g. company spare phone ending 8899)'), a?.mfaNote, 300, '', true)}
      <label class="field"><span>${tr('状态', 'Status')}</span><select name="status">${opt(STATUS, a?.status || 'active')}</select></label>
      <label class="field it-check-field"><input type="checkbox" name="shared" ${a?.shared ? 'checked' : ''}> ${tr('多人共用的账号', 'Shared by several people')}</label>
      ${usersField}
      ${it ? `<fieldset class="full it-sub"><legend>${tr('订阅与付款（只有 IT 和管理层能看到）', 'Subscription & payment (IT and executives only)')}</legend><div class="form-grid">
        ${t('plan', tr('套餐', 'Plan'), s.plan, 120)}<label class="field"><span>${tr('席位数', 'Seats')}</span><input type="number" name="seats" min="0" step="1" value="${esc(s.seats ?? '')}"></label>
        <label class="field"><span>${tr('费用', 'Cost')}</span><input type="number" name="cost" min="0" step="0.01" value="${esc(s.cost ?? '')}"></label>
        <label class="field"><span>${tr('币种', 'Currency')}</span><select name="currency">${['', 'CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'].map(c => `<option value="${c}" ${c === (s.currency || '') ? 'selected' : ''}>${c || '—'}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('付费周期', 'Billing cycle')}</span><select name="cycle">${opt(CYCLE, s.cycle || '', '—')}</select></label>
        <label class="field"><span>${tr('下次续费日', 'Next renewal')}</span><input type="date" name="nextRenewal" value="${esc(s.storedRenewal || '')}"></label>
        <label class="field it-check-field"><input type="checkbox" name="autoRenew" ${s.autoRenew ? 'checked' : ''}> ${tr('自动续费', 'Auto-renews')}</label>
        ${t('paymentLabel', tr('付款方式（只写卡的名称）', 'Paid with (card name only)'), s.paymentLabel, 80, tr('例如：招行公司卡', 'e.g. company Amex'))}
        <label class="field"><span>${tr('卡号后四位', 'Card last 4')}</span><input name="cardLast4" maxlength="4" inputmode="numeric" pattern="\\d{4}" value="${esc(s.cardLast4 || '')}"></label>
        ${t('invoiceContact', tr('发票联系人', 'Invoice contact'), s.invoiceContact, 120)}
      </div></fieldset>` : ''}
      <label class="field full"><span>${tr('备注', 'Notes')}</span><textarea name="notes" rows="2" maxlength="4000" placeholder="${esc(tr('用途、谁申请的、注意事项……不要写密码', 'What it is for, who asked for it, caveats… never passwords'))}">${esc(a?.notes || '')}</textarea></label>
      <p class="full it-warn">${icon('warning')} ${PASSWORD_NOTE()}</p>
      <div class="full rma-actions"><button class="btn primary" type="submit">${isNew ? tr('登记', 'Register') : tr('保存', 'Save')}</button>${!it ? `<span class="wms-hint">${tr('费用和付款信息由 IT 填写。', 'IT fills in costs and payment details.')}</span>` : ''}</div>
      <p class="wms-error" role="alert"></p></form>`;
  }

  function drawDetail(first) {
    const a = detail, s = a.subscription, vault = safeUrl(a.vaultRef);
    const mine = (a.relation || []).length > 0;
    const body = `<div class="rma-detail it-detail" data-it-account="${esc(a.id)}">
      <div class="rma-head">${badge(a.status)}<b>${esc(a.service)}</b><span>${esc(w(CATEGORY[a.category]))}${a.mailboxType ? ` · ${esc(w(MAILBOX[a.mailboxType]))}` : ''}</span>${a.login ? `<span class="mono">${esc(a.login)}</span>` : ''}</div>
      <div class="it-vault">${vault ? `<a class="btn primary" href="${esc(vault)}" target="_blank" rel="noopener noreferrer">${icon('key')} ${tr('在密码管理器中打开', 'Open in password manager')}</a>` : `<span class="late">${icon('warning')} ${tr('还没有密码库链接：请把密码存进公司密码管理器，再把链接贴到这里。', 'No vault link yet: save the password in the company password manager and paste its link here.')}</span>`}</div>
      <section class="rma-sec"><h3>${icon('info')} ${tr('账号信息', 'Account')}</h3><dl class="rma-facts">
        ${fact(tr('负责人', 'Owner'), personName(a.owner))}${fact(tr('共用人', 'Users'), a.users.length ? a.users.map(personName).join('、') : '—')}
        ${fact(tr('两步验证', '2FA'), a.mfaMethod === 'none' ? `<span class="late">${tr('未开启', 'Off')}</span>` : `${esc(w(MFA[a.mfaMethod]))}${a.mfaHolder ? ` · ${personName(a.mfaHolder)}` : ''}`)}
        ${fact(tr('登录网址', 'Sign-in URL'), /^https?:\/\//.test(a.url) ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.url)}</a>` : '—')}
        ${a.mfaNote ? fact(tr('两步验证说明', '2FA note'), esc(a.mfaNote), true) : ''}${a.notes ? fact(tr('备注', 'Notes'), esc(a.notes), true) : ''}
      </dl></section>
      ${s ? `<section class="rma-sec"><h3>${icon('credit-card')} ${tr('订阅与付款', 'Subscription & payment')}</h3><dl class="rma-facts">
        ${fact(tr('套餐', 'Plan'), esc(s.plan || '—'))}${fact(tr('席位', 'Seats'), esc(s.seats ?? '—'))}
        ${fact(tr('费用', 'Cost'), s.cost != null ? `${money(s.cost, s.currency)} / ${esc(w(CYCLE[s.cycle]) || '—')}${s.monthlyCost ? ` <small>${tr('折合每月', '≈ monthly')} ${money(s.monthlyCost, s.currency)}</small>` : ''}` : '—')}
        ${fact(tr('下次续费', 'Next renewal'), s.nextRenewal ? `${esc(s.nextRenewal)} · ${esc(inDays(s.daysToRenewal))}${s.autoRenew ? ` <small>${tr('自动续费', 'auto-renews')}</small>` : ''}` : '—')}
        ${fact(tr('付款方式', 'Paid with'), esc([s.paymentLabel, s.cardLast4 ? '****' + s.cardLast4 : ''].filter(Boolean).join(' ') || '—'))}${fact(tr('发票联系人', 'Invoice contact'), esc(s.invoiceContact || '—'))}
      </dl></section>` : ''}
      ${a.canEdit ? `<details class="hr-edit" ${first === 'edit' ? 'open' : ''}><summary>${icon('pencil-simple')} ${tr('修改', 'Edit')}</summary>${accountForm(a, false)}</details>` : ''}
      ${mine || access.isIt ? `<section class="rma-sec"><h3>${icon('flag')} ${tr('反馈给 IT', 'Tell IT')}</h3>
        <form id="it-flag" class="it-flag"><select name="kind">${['needs_change', 'stopped_using', 'problem'].map(k => `<option value="${k}">${esc(w(FLAG[k]))}</option>`).join('')}</select>
          <input name="note" maxlength="1000" placeholder="${tr('说明（例如：登录邮箱改成了 ops@）', 'Details (e.g. login is now ops@)')}"><button class="btn" type="submit">${tr('提交', 'Send')}</button><p class="wms-error" role="alert"></p></form></section>` : ''}
      ${a.flags?.length ? `<section class="rma-sec"><h3>${icon('chats')} ${tr('反馈记录', 'Reports')}</h3><ul class="rma-timeline">${a.flags.map(f => `<li><b>${esc(w(FLAG[f.kind]))}</b>${f.note ? ` · ${esc(f.note)}` : ''} <time>${esc(f.byName)} · ${esc(String(f.createdAt).slice(0, 10))}${f.resolvedAt ? ` · ${tr('已处理', 'handled')}${f.resolution ? `：${esc(f.resolution)}` : ''}` : ''}</time></li>`).join('')}</ul></section>` : ''}
      ${a.history?.length ? `<section class="rma-sec"><h3>${icon('clock-counter-clockwise')} ${tr('修改记录', 'History')}</h3><ul class="rma-timeline">${a.history.map(h => `<li>${esc(String(h.createdAt).slice(0, 16).replace('T', ' '))} <b>${esc(h.byName)}</b> ${esc(historyText(h))}</li>`).join('')}</ul></section>` : ''}
      ${access.isIt ? `<div class="rma-actions"><button class="btn danger" data-it="delete">${icon('trash')} ${tr('删除这条登记', 'Delete this entry')}</button><span class="wms-hint">${tr('停用的账号建议改成“已取消”保留记录，误登记的才删除。', 'Prefer “Cancelled” for retired accounts; delete only mistakes.')}</span></div>` : ''}
    </div>`;
    if (first || !document.querySelector('[data-it-account]')) { ctx.modal(`${esc(a.service)} · ${tr('账号', 'Account')}`, body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`); document.querySelector('#overlay-root .modal')?.classList.add('modal-wide'); }
    else document.querySelector('[data-it-account]').outerHTML = body;
  }
  const historyText = h => ({ 'it.account.create':tr('登记了账号', 'registered it'), 'it.account.users':tr('修改了共用人', 'changed users'), 'it.account.flag':tr('提交了反馈', 'sent a report'),
    'it.flag.resolve':tr('处理了反馈', 'handled a report') }[h.action] || (h.action === 'it.account.update' ? tr(`修改了 ${h.fields.length} 项`, `changed ${h.fields.length} fields`) : h.action));

  async function openNew() {
    try { await loadPeople(); } catch { /* the form still works without pickers */ }
    detail = null;
    ctx.modal(tr('登记账号', 'Register account'), `<div class="rma-detail it-detail">${accountForm(null, true)}</div>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button>`);
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide');
  }

  /** Form values → API body. On edit only changed fields are sent. */
  function formBody(f, a) {
    const g = n => f.querySelector(`[name="${n}"]`), entries = [...new FormData(f)];
    const val = n => { const el = g(n); if (!el) return undefined; const hit = entries.find(([k]) => k === n); if (el.type === 'checkbox') return !!hit; return String(hit?.[1] ?? '').trim(); };
    const body = {};
    for (const k of ['service', 'category', 'login', 'url', 'vaultRef', 'mfaMethod', 'mfaNote', 'status', 'mailboxType', 'notes', 'plan', 'currency', 'cycle', 'paymentLabel', 'cardLast4', 'invoiceContact']) { const v = val(k); if (v !== undefined) body[k] = v; }
    for (const k of ['shared', 'autoRenew']) { const v = val(k); if (v !== undefined) body[k] = v; }
    for (const k of ['ownerId', 'mfaHolderId']) { const v = val(k); if (v !== undefined) body[k] = v || null; }
    for (const k of ['seats', 'cost']) { const v = val(k); if (v !== undefined) body[k] = v === '' ? null : Number(v); }
    const nr = val('nextRenewal'); if (nr !== undefined) body.nextRenewal = nr || null;
    const userIds = g('userIds') ? entries.filter(([k]) => k === 'userIds').map(([, v]) => String(v)) : null;
    if (!a) { if (!access.isIt) delete body.ownerId; return { body, userIds }; }
    const s = a.subscription || {};
    const cur = { service:a.service, category:a.category, login:a.login, url:a.url, vaultRef:a.vaultRef, mfaMethod:a.mfaMethod, mfaNote:a.mfaNote, status:a.status, mailboxType:a.mailboxType, notes:a.notes,
      shared:a.shared, ownerId:a.owner?.id || null, mfaHolderId:a.mfaHolder?.id || null, plan:s.plan, currency:s.currency, cycle:s.cycle, paymentLabel:s.paymentLabel, cardLast4:s.cardLast4,
      invoiceContact:s.invoiceContact, autoRenew:s.autoRenew, seats:s.seats ?? null, cost:s.cost ?? null, nextRenewal:s.storedRenewal || null };
    for (const k of Object.keys(body)) if (String(body[k] ?? '') === String(cur[k] ?? '')) delete body[k];
    const before = (a.users || []).map(u => u.id).sort().join(',');
    return { body, userIds: userIds && userIds.slice().sort().join(',') !== before ? userIds : null };
  }

  /** UTF-8 first; Excel on Chinese Windows saves CSV as GBK, which shows up as replacement characters. */
  async function readCsv(file) {
    const buf = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error(tr('文件读取失败', 'Could not read the file'))); r.readAsArrayBuffer(file); });
    const utf8 = new TextDecoder('utf-8').decode(buf);
    if (!utf8.includes('�')) return utf8;
    try { return new TextDecoder('gbk').decode(buf); } catch { return utf8; }
  }
  async function download(path, name) {
    try {
      const r = await fetch(apiBase() + path, { credentials:'same-origin', cache:'no-store' });
      if (!r.ok) { let m = ''; try { m = (await r.json()).error?.message; } catch { /* not JSON */ } throw new Error(m || tr('下载失败', 'Download failed')); }
      const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (x) { ctx.toast?.(x.message || tr('下载失败', 'Download failed')); }
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest?.('[data-it]'); if (!el || !ctx) return;
    const a = el.dataset.it;
    if (a === 'tab') { ui.tab = el.dataset.v; ctx.rerender(); return; }
    if (a === 'open') { e.preventDefault(); openAccount(el.dataset.id); return; }
    if (a === 'new') { openNew(); return; }
    if (a === 'export') { download('/it/accounts.csv', `IT账号-${new Date().toISOString().slice(0, 10)}.csv`); return; }
    if (a === 'template') { download('/it/import-template.csv', 'IT账号登记模板.csv'); return; }
    if (busy) return;
    if (a === 'resolve') {
      const resolution = window.prompt(tr('处理结果（可选）', 'What was done (optional)'), '') ?? null; if (resolution === null) return;
      busy = true;
      try { await ctx.api.post(`/it/flags/${encodeURIComponent(el.dataset.id)}/resolve`, { resolution:resolution.trim() }); ctx.toast?.(tr('已标记为处理完', 'Marked done')); busy = false; await reload(); }
      catch (x) { ctx.toast?.(x.message || tr('操作失败', 'Could not save')); } finally { busy = false; }
      return;
    }
    if (a === 'start-check') {
      if (!window.confirm(tr('现在给所有在职员工发送本季度的账号确认？', 'Send this quarter’s account check to everyone now?'))) return;
      busy = true;
      try { const r = await ctx.api.post('/it/checks/start', {}); ctx.toast?.(tr(`已发给 ${r.newlyStarted} 人`, `Sent to ${r.newlyStarted} people`)); busy = false; await reload(); }
      catch (x) { ctx.toast?.(x.message || tr('操作失败', 'Could not start')); } finally { busy = false; }
      return;
    }
    if (a === 'delete' && detail) {
      if (!window.confirm(tr(`删除“${detail.service}”这条登记？删除后无法恢复。`, `Delete “${detail.service}”? This cannot be undone.`))) return;
      busy = true;
      try { await ctx.api.delete('/it/accounts/' + encodeURIComponent(detail.id)); ctx.closeOverlay?.(); ctx.toast?.(tr('已删除', 'Deleted')); detail = null; busy = false; await reload(); }
      catch (x) { ctx.toast?.(x.message || tr('删除失败', 'Could not delete')); } finally { busy = false; }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-it="open"]')) openAccount(e.target.dataset.id); });
  document.addEventListener('input', e => {
    if (!e.target.matches?.('[data-it-search]')) return;
    ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender();
    const i = document.querySelector('[data-it-search]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  });
  document.addEventListener('change', e => {
    const f = e.target.closest?.('[data-it-filter]'); if (!f || !ctx) return;
    ui[f.dataset.itFilter] = f.value; ctx.rerender();
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || !['it-account', 'it-flag', 'it-check', 'it-import'].includes(f.id)) return;
    e.preventDefault(); if (busy) return; busy = true;
    const err = f.querySelector('.wms-error'); if (err) err.textContent = '';
    try {
      if (f.id === 'it-account') {
        const isNew = f.dataset.new === '1', { body, userIds } = formBody(f, isNew ? null : detail);
        if (isNew) {
          const created = await ctx.api.post('/it/accounts', { ...body, ...(userIds?.length ? { userIds } : {}) });
          ctx.toast?.(tr('已登记', 'Registered')); detail = await ctx.api.get('/it/accounts/' + encodeURIComponent(created.id)); drawDetail(true);
        } else {
          if (!Object.keys(body).length && !userIds) { if (err) err.textContent = tr('没有修改。', 'No changes.'); return; }
          if (Object.keys(body).length) await put('/it/accounts/' + encodeURIComponent(detail.id), { expectedVersion:detail.version, ...body });
          if (userIds) await put(`/it/accounts/${encodeURIComponent(detail.id)}/users`, { userIds });
          ctx.toast?.(tr('已保存', 'Saved')); detail = await ctx.api.get('/it/accounts/' + encodeURIComponent(detail.id)); drawDetail(false);
        }
        busy = false; reload();
      }
      if (f.id === 'it-flag') {
        const v = Object.fromEntries(new FormData(f));
        await ctx.api.post(`/it/accounts/${encodeURIComponent(detail.id)}/flags`, { kind:v.kind, note:String(v.note || '').trim() });
        ctx.toast?.(tr('已发给 IT', 'Sent to IT')); detail = await ctx.api.get('/it/accounts/' + encodeURIComponent(detail.id)).catch(() => null);
        if (detail) drawDetail(false); else ctx.closeOverlay?.();
        busy = false; reload();
      }
      if (f.id === 'it-check') {
        const items = my.accounts.map(a => ({ accountId:a.id, ok:f.querySelector(`[name="ok-${a.id}"][value="0"]`)?.checked !== true, note:String(f.querySelector(`[name="note-${a.id}"]`)?.value || '').trim() }));
        const bad = items.find(i => !i.ok && !i.note);
        if (bad) { if (err) err.textContent = tr('选了“需要修改”的账号，请写一下哪里要改。', 'Say what should change for each account marked “Needs change”.'); return; }
        const r = await ctx.api.post('/it/checks/confirm', { items, missing:String(f.querySelector('[name="missing"]')?.value || '').trim() });
        ctx.toast?.(r.flagged ? tr(`已确认，${r.flagged} 项已转给 IT`, `Confirmed; ${r.flagged} sent to IT`) : tr('已确认，谢谢', 'Confirmed, thanks'));
        busy = false; await reload();
      }
      if (f.id === 'it-import') {
        const file = f.querySelector('input[type=file]').files[0];
        if (!file) throw new Error(tr('请选择 CSV 文件', 'Choose a CSV file'));
        const dryRun = (e.submitter?.value || 'check') !== 'import';
        try { importResult = await ctx.api.post('/it/accounts/import', { csv:await readCsv(file), dryRun }); }
        catch (x) { if (x.code !== 'IT_IMPORT_INVALID') throw x; importResult = { message:x.message, errors:(x.fields || []).map(r => ({ row:r.path, message:r.message })) }; }
        if (!dryRun && !importResult.errors?.length) { ctx.toast?.(tr('导入完成', 'Imported')); busy = false; await reload(); }
        else ctx.rerender();
      }
    } catch (x) {
      if (err) err.textContent = x.status === 409 ? tr('这条记录刚被别人改过，请关闭后重新打开再改。', 'Someone else changed this entry; close and reopen it.')
        : x.code === 'VALIDATION_ERROR' && x.fields?.length ? `${x.message}（${x.fields.map(f2 => f2.path).join('、')}）` : x.message || tr('保存失败', 'Could not save');
    } finally { busy = false; }
  });

  window.WorkOSIt = { configure, reset, render };
})();
