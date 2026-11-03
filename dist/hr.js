/*
 * HR records (人事档案), phase 1 of the HR module.
 *
 * Everyone sees their own record; managers see the non-sensitive record of their reports; HR (the
 * WORKOS_HR_USER_IDS list on the server) sees and edits everyone. ID number, bank account, emergency
 * phone and salary arrive masked. "View" asks the server for one value (HR must give a reason, the
 * server audits it) and shows it only in the open dialog: it is never stored or put in the list.
 *
 * Data comes from /hr/* (server). Documents are fetched through the API and saved as a download.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, reminders = null, loading = false, error = '', detail = null, busy = false;
  const revealed = new Map();
  const ui = { q:'', view:'active' };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const apiBase = () => (window.WORKOS_CONFIG && window.WORKOS_CONFIG.apiBase) || '/api';
  const put = (path, body) => ctx.api.request(path, { method:'PUT', body });
  const STATUS = { active:['在职', 'Active', 'green'], leaving:['离职中', 'Leaving', 'amber'], left:['已离职', 'Left', 'done'] };
  const EMPLOYMENT = { full_time:['全职', 'Full-time'], part_time:['兼职', 'Part-time'], intern:['实习', 'Intern'], contractor:['外包 / 顾问', 'Contractor'], other:['其他', 'Other'] };
  const EVENT = { joined:['入职', 'Joined'], probation_passed:['转正', 'Passed probation'], contract_renewed:['续签合同', 'Contract renewed'], title_change:['岗位调整', 'Role change'], transfer:['调岗 / 调部门', 'Transfer'],
    promotion:['晋升', 'Promotion'], warning:['警告 / 处分', 'Warning'], leaving:['提出离职', 'Resigned / notice'], left:['离职', 'Left'], other:['其他', 'Other'] };
  const DOC = { contract:['劳动合同', 'Contract'], id:['身份证件', 'ID document'], certificate:['证书 / 资质', 'Certificate'], education:['学历证明', 'Education'], other:['其他', 'Other'] };
  const SECRET = { idNumber:['身份证号', 'ID number'], bankAccount:['银行卡号', 'Bank account'], emergencyPhone:['紧急联系人电话', 'Emergency phone'] };
  const REMIND = { probation_end:['试用期结束', 'Probation ends'], contract_end:['合同到期', 'Contract ends'], document_expiry:['证件到期', 'Document expires'] };
  const w = pair => pair ? tr(pair[0], pair[1]) : '';
  const badge = s => `<span class="rma-badge ${STATUS[s]?.[2] || ''}">${esc(w(STATUS[s]))}</span>`;
  const tenure = d => d == null ? '—' : d < 31 ? tr(`${d} 天`, `${d} days`) : d < 365 ? tr(`${Math.floor(d / 30.4)} 个月`, `${Math.floor(d / 30.4)} mo`) : tr(`${(d / 365.25).toFixed(1)} 年`, `${(d / 365.25).toFixed(1)} yr`);
  const inDays = d => d == null ? '' : d < 0 ? tr(`已过 ${-d} 天`, `${-d} days ago`) : d === 0 ? tr('今天', 'today') : tr(`${d} 天后`, `in ${d} days`);
  const daysTo = v => v ? Math.round((new Date(v + 'T00:00:00Z') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 864e5) : null;
  const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  function configure(next) { ctx = next; }
  function reset() { data = null; reminders = null; detail = null; loading = false; error = ''; revealed.clear(); Object.assign(ui, { q:'', view:'active' }); }
  async function load() {
    if (loading) return; loading = true;
    try {
      data = await ctx.api.get('/hr/people');
      reminders = data.isHr ? (await ctx.api.get('/hr/reminders')).items : null;
      error = '';
    } catch (e) { error = e.message || tr('人事档案读取失败', 'Could not load HR records'); }
    finally { loading = false; ctx.rerender(); }
  }

  function filtered() {
    const q = ui.q.trim().toLowerCase();
    return data.items.filter(p => {
      if (ui.view !== 'all' && p.status !== ui.view) return false;
      return !q || [p.name, p.nameZh, p.nameEn, p.title, p.departmentName, p.managerName, p.jobLevel].some(x => String(x || '').toLowerCase().includes(q));
    });
  }

  function keyNotice() {
    if (!data.isHr || data.sensitive === 'configured') return '';
    return `<div class="wms-alert">${icon('lock-key')} ${data.sensitive === 'invalid_key'
      ? tr('加密密钥 HR_DATA_KEY 的格式不对，身份证号、银行卡、薪资和文件暂时不能录入或查看。请管理员在服务器配置里改正。', 'HR_DATA_KEY is not a valid key, so ID numbers, bank details, salary and documents cannot be saved or viewed. Ask the administrator to fix the server setting.')
      : tr('还没有设置加密密钥 HR_DATA_KEY：员工档案可以正常使用，身份证号、银行卡、薪资和文件要等管理员在服务器配置里设置密钥后才能录入。', 'HR_DATA_KEY is not set: records work, but ID numbers, bank details, salary and documents can be saved only after the administrator sets the key on the server.')}</div>`;
  }

  function render() {
    if (!data && !error) { load(); return `<div class="rma hr"><p class="wms-hint">${tr('正在读取人事档案…', 'Loading HR records…')}</p></div>`; }
    if (error && !data) return `<div class="rma hr"><div class="wms-alert">${esc(error)}</div></div>`;
    const by = s => data.items.filter(p => p.status === s);
    const onProbation = data.items.filter(p => p.status !== 'left' && p.probationEnd && daysTo(p.probationEnd) >= 0);
    const contracts = data.items.filter(p => p.status !== 'left' && p.contractEnd && daysTo(p.contractEnd) <= 30);
    const views = [['active', tr('在职', 'Active'), by('active').length], ['leaving', tr('离职中', 'Leaving'), by('leaving').length], ['left', tr('已离职', 'Left'), by('left').length], ['all', tr('全部', 'All'), data.items.length]];
    const rows = filtered();
    const intro = data.isHr
      ? tr('全公司员工的雇佣信息、合同与证件、履历。身份证号、银行卡和薪资加密保存，默认只显示后 4 位，每次查看都要填写原因并留下记录。', 'Employment facts, contracts, documents and history for everyone. ID numbers, bank details and salary are encrypted, shown masked, and every view needs a reason and is recorded.')
      : tr('你自己的档案，以及你下属的雇佣信息。敏感资料只有人事和员工本人能看。', 'Your own record and the employment facts of your reports. Sensitive details are visible only to HR and the person themself.');
    return `<div class="rma hr">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · HR</div><h1>${tr('人事档案', 'HR records')}</h1><p>${intro}</p></div></div>
      ${keyNotice()}
      ${data.isHr ? `<div class="rma-kpis">
        <div class="rma-kpi"><span>${tr('在职人数', 'Active')}</span><b>${by('active').length}</b><em>${tr(`离职中 ${by('leaving').length} 人`, `${by('leaving').length} leaving`)}</em></div>
        <div class="rma-kpi"><span>${tr('试用期中', 'On probation')}</span><b>${onProbation.length}</b><em>${tr(`30 天内转正 ${onProbation.filter(p => daysTo(p.probationEnd) <= 30).length} 人`, `${onProbation.filter(p => daysTo(p.probationEnd) <= 30).length} end within 30 days`)}</em></div>
        <div class="rma-kpi"><span>${tr('合同 30 天内到期', 'Contracts ending ≤30 days')}</span><b class="${contracts.length ? 'late' : ''}">${contracts.length}</b><em>${tr('包括已过期未续签', 'including lapsed')}</em></div>
        <div class="rma-kpi"><span>${tr('档案未建', 'No record yet')}</span><b>${data.items.filter(p => !p.hasProfile && p.accountActive).length}</b><em>${tr('有账号但还没填入职信息', 'account but no employment facts')}</em></div>
      </div>
      ${reminders?.length ? `<section class="hr-reminders"><h3>${icon('bell-ringing')} ${tr('近期提醒', 'Coming up')}</h3><ul>${reminders.slice(0, 8).map(r => `<li data-hr="open" data-id="${esc(r.userId)}" tabindex="0"><b>${esc(r.name)}</b> ${esc(w(REMIND[r.kind]))}${r.documentName ? ` · ${esc(r.documentName)}` : ''}<span class="${r.days <= 7 ? 'late' : ''}">${esc(r.date)} · ${esc(inDays(r.days))}</span></li>`).join('')}</ul></section>` : ''}` : ''}
      <div class="rma-bar"><div class="rma-views" role="tablist">${views.map(([id, label, n]) => `<button class="${ui.view === id ? 'on' : ''}" data-hr="view" data-v="${id}">${esc(label)} <b>${n}</b></button>`).join('')}</div>
        <label class="wms-search">${icon('magnifying-glass')}<input data-hr-search value="${esc(ui.q)}" placeholder="${tr('搜索姓名、部门、职位、主管', 'Search name, department, title, manager')}"></label></div>
      <div class="wms-table-wrap"><table class="wms-table rma-table hr-table"><thead><tr><th>${tr('姓名', 'Name')}</th><th>${tr('部门', 'Department')}</th><th>${tr('主管', 'Manager')}</th><th>${tr('入职日期', 'Hired')}</th><th>${tr('司龄', 'Tenure')}</th><th>${tr('用工类型', 'Type')}</th><th>${tr('试用期至', 'Probation to')}</th><th>${tr('合同至', 'Contract to')}</th><th>${tr('状态', 'Status')}</th></tr></thead><tbody>
        ${rows.map(p => { const pd = daysTo(p.probationEnd), cd = daysTo(p.contractEnd);
          return `<tr class="rma-row" data-hr="open" data-id="${esc(p.id)}" tabindex="0"><td><b>${esc(p.name)}</b><small>${esc([p.title, p.jobLevel].filter(Boolean).join(' · '))}</small></td><td>${esc(p.departmentName || p.departmentId)}</td><td>${esc(p.managerName || '—')}</td>
          <td>${esc(p.hireDate || '—')}</td><td>${esc(tenure(p.tenureDays))}</td><td>${esc(w(EMPLOYMENT[p.employmentType]))}</td>
          <td class="${pd != null && pd >= 0 && pd <= 7 ? 'late' : ''}">${esc(p.probationEnd || '—')}</td><td class="${cd != null && cd <= 30 && p.status !== 'left' ? 'late' : ''}">${esc(p.contractEnd || '—')}</td>
          <td>${badge(p.status)}${p.accountActive ? '' : `<small>${tr('账号已停用', 'account off')}</small>`}</td></tr>`; }).join('') || `<tr><td colspan="9" class="wms-empty">${tr('没有符合条件的员工。', 'No matching people.')}</td></tr>`}
      </tbody></table></div></div>`;
  }

  /* ---------- person detail ---------- */
  async function openPerson(id) {
    try { detail = await ctx.api.get('/hr/people/' + encodeURIComponent(id)); }
    catch (e) { ctx.toast?.(e.message || tr('读取失败', 'Could not load')); return; }
    revealed.clear();
    drawDetail(true);
  }
  async function refresh() { if (!detail) return; detail = await ctx.api.get('/hr/people/' + encodeURIComponent(detail.person.id)); drawDetail(false); data = null; load(); }

  const fact = (label, value, full) => `<div${full ? ' class="full"' : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
  function employmentSection() {
    const p = detail.profile, hr = detail.access === 'hr', opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(w(v))}</option>`).join('');
    if (!hr) return `<dl class="rma-facts">
      ${fact(tr('入职日期', 'Hired'), esc(p.hireDate || '—'))}${fact(tr('司龄', 'Tenure'), esc(tenure(detail.tenureDays)))}${fact(tr('用工类型', 'Type'), esc(w(EMPLOYMENT[p.employmentType])))}
      ${fact(tr('试用期至', 'Probation to'), esc(p.probationEnd || '—'))}${fact(tr('合同期', 'Contract'), esc(p.contractStart || p.contractEnd ? `${p.contractStart || '…'} → ${p.contractEnd || '…'}` : '—'))}${fact(tr('职级', 'Level'), esc(p.jobLevel || '—'))}
      ${fact(tr('工作地点', 'Work location'), esc(p.workLocation || '—'))}${p.lastDay ? fact(tr('最后工作日', 'Last day'), esc(p.lastDay)) : ''}
      ${detail.access === 'self' ? fact(tr('紧急联系人', 'Emergency contact'), esc([p.emergencyName, p.emergencyRelation].filter(Boolean).join(' · ') || '—')) + fact(tr('开户银行', 'Bank'), esc(p.bankName || '—')) : ''}
    </dl>${detail.access === 'self' ? `<p class="wms-hint">${tr('资料有误请联系人事修改。', 'Ask HR to correct anything wrong.')}</p>` : ''}`;
    const d = (name, label, v) => `<label class="field"><span>${label}</span><input type="date" name="${name}" value="${esc(v || '')}"></label>`;
    const t = (name, label, v, max = 80, ph = '') => `<label class="field"><span>${label}</span><input name="${name}" maxlength="${max}" value="${esc(v || '')}" placeholder="${esc(ph)}"></label>`;
    return `<form id="hr-profile" class="form-grid">
      ${d('hireDate', tr('入职日期', 'Hire date'), p.hireDate)}
      <label class="field"><span>${tr('用工类型', 'Employment type')}</span><select name="employmentType">${opt(EMPLOYMENT, p.employmentType)}</select></label>
      ${d('probationEnd', tr('试用期结束', 'Probation ends'), p.probationEnd)}
      ${d('contractStart', tr('合同开始', 'Contract starts'), p.contractStart)}${d('contractEnd', tr('合同到期', 'Contract ends'), p.contractEnd)}
      ${t('jobLevel', tr('职级', 'Level'), p.jobLevel, 60, 'P3')}${t('workLocation', tr('工作地点', 'Work location'), p.workLocation)}
      <label class="field"><span>${tr('在职状态', 'Status')}</span><select name="status">${opt(STATUS, p.status)}</select></label>
      ${d('lastDay', tr('最后工作日', 'Last day'), p.lastDay)}
      ${t('emergencyName', tr('紧急联系人', 'Emergency contact'), p.emergencyName, 60)}${t('emergencyRelation', tr('关系', 'Relation'), p.emergencyRelation, 40, tr('配偶 / 父母…', 'Spouse, parent…'))}
      ${t('bankName', tr('开户银行', 'Bank'), p.bankName, 80, tr('例如：招商银行深圳分行', 'e.g. China Merchants Bank'))}
      ${d('consentDate', tr('个人信息授权日期', 'Consent date'), p.consentDate)}${t('consentVersion', tr('授权书版本', 'Consent notice version'), p.consentVersion, 40, '2026-01')}
      <label class="field full"><span>${tr('人事内部备注（员工本人看不到）', 'Internal HR notes (not shown to the employee)')}</span><textarea name="notes" rows="2" maxlength="4000">${esc(p.notes || '')}</textarea></label>
      <div class="full rma-actions"><button class="btn primary" type="submit">${tr('保存', 'Save')}</button><span class="wms-hint">${tr('状态改为“已离职”不会自动停用账号，请在“组织与权限”里单独处理。', 'Marking someone as left does not disable their account; do that in Organization & permissions.')}</span></div>
      <p class="wms-error" role="alert"></p></form>`;
  }

  function secretRow(field, label, info, extra = '') {
    const shown = revealed.get(field), hr = detail.access === 'hr', canView = info?.set && detail.sensitive === 'configured';
    return `<div class="hr-secret"><span>${label}</span><b class="mono">${Array.isArray(shown) ? esc(tr(`${shown.length} 条记录，见下表`, `${shown.length} records, below`)) : shown != null ? esc(shown) : info?.set ? esc(info.hint) : '—'}</b>${extra}
      ${canView && shown == null ? `<button class="btn" type="button" data-hr="reveal" data-field="${field}">${icon('eye')} ${tr('查看', 'View')}</button>` : ''}
      ${shown != null ? `<button class="btn" type="button" data-hr="hide" data-field="${field}">${icon('eye-slash')} ${tr('隐藏', 'Hide')}</button>` : ''}
      ${hr && canView && shown == null ? `<input class="hr-reason" data-hr-reason="${field}" maxlength="300" placeholder="${tr('查看原因（必填）', 'Reason (required)')}">` : ''}</div>`;
  }
  function salaryTable(list) {
    if (!list.length) return `<p class="wms-hint">${tr('还没有薪资记录。', 'No salary records yet.')}</p>`;
    const per = { month:tr('月', 'month'), year:tr('年', 'year'), hour:tr('小时', 'hour') };
    const n = v => Number(v).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN');
    return `<table class="wms-table hr-salary"><thead><tr><th>${tr('生效日期', 'Effective')}</th><th class="num">${tr('基本工资', 'Base')}</th><th class="num">${tr('补贴', 'Allowance')}</th><th>${tr('原因', 'Reason')}</th><th>${tr('录入人', 'By')}</th></tr></thead><tbody>
      ${list.map(s => `<tr><td>${esc(s.effectiveDate)}</td><td class="num">${esc(s.currency)} ${esc(n(s.base))} / ${esc(per[s.period] || s.period)}</td><td class="num">${esc(n(s.allowance))}</td><td>${esc(s.reason || '—')}</td><td>${esc(s.byName)}</td></tr>`).join('')}</tbody></table>`;
  }
  function sensitiveSection() {
    const s = detail.secrets, hr = detail.access === 'hr', ready = detail.sensitive === 'configured', sal = revealed.get('salary');
    const rows = Object.entries(SECRET).map(([f, label]) => secretRow(f, esc(w(label)), s[f])).join('')
      + secretRow('salary', tr('薪资', 'Salary'), detail.salary.set ? { set:true, hint:tr(`已设置 · ${detail.salary.records} 条记录 · 最近生效 ${detail.salary.latestEffective}`, `${detail.salary.records} records · latest ${detail.salary.latestEffective}`) } : { set:false });
    return `${rows}${Array.isArray(sal) ? salaryTable(sal) : ''}
      ${hr && ready ? `<details class="hr-edit"><summary>${icon('pencil-simple')} ${tr('录入或修改敏感资料', 'Enter or change sensitive details')}</summary>
        <form id="hr-secrets" class="form-grid">
          <label class="field"><span>${tr('身份证号', 'ID number')}</span><input name="idNumber" maxlength="40" autocomplete="off" placeholder="${tr('留空 = 不修改', 'Blank = keep')}"></label>
          <label class="field"><span>${tr('银行卡号', 'Bank account')}</span><input name="bankAccount" maxlength="40" autocomplete="off" inputmode="numeric" placeholder="${tr('留空 = 不修改', 'Blank = keep')}"></label>
          <label class="field"><span>${tr('紧急联系人电话', 'Emergency phone')}</span><input name="emergencyPhone" maxlength="40" autocomplete="off" placeholder="${tr('留空 = 不修改', 'Blank = keep')}"></label>
          <div class="full rma-actions"><button class="btn primary" type="submit">${tr('加密保存', 'Encrypt and save')}</button></div><p class="wms-error" role="alert"></p></form>
        <form id="hr-salary" class="form-grid">
          <label class="field"><span>${tr('生效日期', 'Effective date')}</span><input type="date" name="effectiveDate" required></label>
          <label class="field"><span>${tr('基本工资', 'Base pay')}</span><input type="number" name="base" min="0" step="0.01" required></label>
          <label class="field"><span>${tr('补贴', 'Allowance')}</span><input type="number" name="allowance" min="0" step="0.01" value="0"></label>
          <label class="field"><span>${tr('币种 / 周期', 'Currency / per')}</span><span class="hr-pair"><select name="currency">${['CNY', 'USD', 'HKD', 'EUR'].map(c => `<option>${c}</option>`).join('')}</select><select name="period"><option value="month">${tr('每月', 'month')}</option><option value="year">${tr('每年', 'year')}</option><option value="hour">${tr('每小时', 'hour')}</option></select></span></label>
          <label class="field full"><span>${tr('调整原因', 'Reason')}</span><input name="reason" maxlength="500" placeholder="${tr('例如：入职定薪 / 年度调薪 / 转正', 'e.g. starting pay, annual review')}"></label>
          <div class="full rma-actions"><button class="btn primary" type="submit">${tr('添加薪资记录', 'Add salary record')}</button></div><p class="wms-error" role="alert"></p></form>
      </details>` : ''}
      <p class="wms-error" data-hr-reveal-error role="alert"></p>
      <p class="wms-hint">${hr ? tr('每次“查看”都会记录查看人、原因和时间。关闭窗口后自动隐藏。', 'Every view records who, why and when. Values hide again when you close this window.') : tr('这些资料只有你和人事能看到，查看会留下记录。', 'Only you and HR can see these; views are recorded.')}</p>`;
  }

  function documentsSection() {
    const hr = detail.access === 'hr', ready = detail.sensitive === 'configured';
    const list = detail.documents.map(d => `<li><span>${icon(d.mime === 'application/pdf' ? 'file-pdf' : 'file-image')} <b>${esc(w(DOC[d.kind]))}</b> ${esc(d.name)} <small>${esc(size(d.size))}${d.expiresOn ? ` · ${tr('有效期至', 'valid to')} ${esc(d.expiresOn)}` : ''}</small></span>
      <span class="${d.daysToExpiry != null && d.daysToExpiry <= 30 ? 'late' : ''}">${d.daysToExpiry != null && d.daysToExpiry <= 30 ? esc(inDays(d.daysToExpiry)) : ''}</span>
      ${ready ? `<button class="btn" type="button" data-hr="doc" data-id="${esc(d.id)}">${icon('download-simple')} ${tr('下载', 'Download')}</button>` : ''}
      ${hr ? `<button class="btn" type="button" data-hr="doc-delete" data-id="${esc(d.id)}">${icon('trash')}</button>` : ''}</li>`).join('');
    return `<ul class="hr-docs">${list || `<li class="wms-hint">${tr('还没有文件。', 'No documents yet.')}</li>`}</ul>
      ${hr && ready ? `<form id="hr-doc" class="form-grid">
        <label class="field"><span>${tr('类型', 'Type')}</span><select name="kind">${Object.entries(DOC).map(([k, v]) => `<option value="${k}">${esc(w(v))}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('有效期至（可选）', 'Valid to (optional)')}</span><input type="date" name="expiresOn"></label>
        <label class="field full"><span>${tr('文件（PDF 或图片，10 MB 以内）', 'File (PDF or image, up to 10 MB)')}</span><input type="file" name="file" accept="application/pdf,image/png,image/jpeg,image/webp" required></label>
        <div class="full rma-actions"><button class="btn primary" type="submit">${icon('upload-simple')} ${tr('加密上传', 'Encrypt and upload')}</button></div><p class="wms-error" role="alert"></p></form>` : ''}`;
  }

  function historySection() {
    const hr = detail.access === 'hr';
    const items = detail.events.map(e => `<li><b>${esc(e.happenedOn)}</b> ${esc(w(EVENT[e.kind]) || e.kind)}${e.note ? ` · ${esc(e.note)}` : ''} <time>${esc(e.byName)}</time></li>`).join('');
    return `<ul class="rma-timeline">${items || `<li class="wms-hint">${tr('还没有履历记录。', 'No history yet.')}</li>`}</ul>
      ${hr ? `<form id="hr-event" class="form-grid hr-event">
        <label class="field"><span>${tr('事件', 'Event')}</span><select name="kind">${Object.entries(EVENT).map(([k, v]) => `<option value="${k}">${esc(w(v))}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('日期', 'Date')}</span><input type="date" name="happenedOn" required></label>
        <label class="field full"><span>${tr('说明', 'Note')}</span><input name="note" maxlength="2000"></label>
        <div class="full rma-actions"><button class="btn" type="submit">${icon('plus')} ${tr('添加履历', 'Add to history')}</button><span class="wms-hint">${tr('“警告 / 处分”只有人事和员工本人能看到。', 'Warnings are visible only to HR and the employee.')}</span></div><p class="wms-error" role="alert"></p></form>` : ''}`;
  }

  function drawDetail(first) {
    const d = detail, p = d.person, seeSensitive = d.access !== 'manager';
    const body = `<div class="rma-detail hr-detail" data-hr-person="${esc(p.id)}">
      <div class="rma-head">${badge(d.profile.status)}<b>${esc(p.name)}</b><span>${esc(p.title || '')}</span><span>${tr('主管：', 'Manager: ')}${esc(p.managerName || '—')}</span>${p.email ? `<span class="mono">${esc(p.email)}</span>` : ''}${p.accountActive ? '' : `<span class="rma-badge red">${tr('账号已停用', 'Account disabled')}</span>`}</div>
      <section class="rma-sec"><h3>${icon('identification-card')} ${tr('雇佣信息', 'Employment')}</h3>${employmentSection()}</section>
      ${seeSensitive ? `<section class="rma-sec"><h3>${icon('lock-key')} ${tr('敏感资料', 'Sensitive details')}</h3>${sensitiveSection()}</section>
      <section class="rma-sec"><h3>${icon('files')} ${tr('合同与证件', 'Contracts & documents')}</h3>${documentsSection()}</section>` : ''}
      <section class="rma-sec"><h3>${icon('clock-counter-clockwise')} ${tr('履历', 'History')}</h3>${historySection()}</section>
    </div>`;
    if (first || !document.querySelector('[data-hr-person]')) { ctx.modal(`${esc(p.name)} · ${tr('人事档案', 'HR record')}`, body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`); document.querySelector('#overlay-root .modal')?.classList.add('modal-wide'); }
    else { document.querySelector('[data-hr-person]').outerHTML = body; }
  }

  async function reveal(field) {
    const err = document.querySelector('[data-hr-reveal-error]'); if (err) err.textContent = '';
    const reason = document.querySelector(`[data-hr-reason="${field}"]`)?.value.trim() || '';
    if (detail.access === 'hr' && detail.person.id !== ctx.state().actor?.id && reason.length < 4) { if (err) err.textContent = tr('请先填写查看原因（至少 4 个字）。', 'Give a reason first (at least 4 characters).'); document.querySelector(`[data-hr-reason="${field}"]`)?.focus(); return; }
    try { const r = await ctx.api.post(`/hr/people/${encodeURIComponent(detail.person.id)}/reveal`, { field, reason }); revealed.set(field, r.value ?? ''); drawDetail(false); }
    catch (x) { if (err) err.textContent = x.message || tr('查看失败', 'Could not show it'); }
  }
  async function download(docId) {
    const doc = detail.documents.find(d => d.id === docId); if (!doc) return;
    try {
      const r = await fetch(`${apiBase()}/hr/people/${encodeURIComponent(detail.person.id)}/documents/${encodeURIComponent(docId)}`, { credentials:'same-origin', cache:'no-store' });
      if (!r.ok) { let m = ''; try { m = (await r.json()).error?.message; } catch { /* not JSON */ } throw new Error(m || tr('下载失败', 'Download failed')); }
      const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
      a.href = url; a.download = doc.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (x) { ctx.toast?.(x.message || tr('下载失败', 'Download failed')); }
  }
  const b64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error(tr('文件读取失败', 'Could not read the file'))); r.readAsDataURL(f); });

  document.addEventListener('click', async e => {
    if (e.target.closest?.('[data-live-action="close"]') && document.querySelector('[data-hr-person]')) { revealed.clear(); return; }
    const el = e.target.closest?.('[data-hr]'); if (!el || !ctx) return;
    const a = el.dataset.hr;
    if (a === 'view') { ui.view = el.dataset.v; ctx.rerender(); return; }
    if (a === 'open') { openPerson(el.dataset.id); return; }
    if (a === 'reveal') { reveal(el.dataset.field); return; }
    if (a === 'hide') { revealed.delete(el.dataset.field); drawDetail(false); return; }
    if (a === 'doc') { download(el.dataset.id); return; }
    if (a === 'doc-delete') {
      if (busy || !window.confirm(tr('删除这份文件？删除后无法恢复。', 'Delete this document? This cannot be undone.'))) return;
      busy = true;
      try { await ctx.api.delete(`/hr/people/${encodeURIComponent(detail.person.id)}/documents/${encodeURIComponent(el.dataset.id)}`); ctx.toast?.(tr('已删除', 'Deleted')); busy = false; await refresh(); }
      catch (x) { ctx.toast?.(x.message || tr('删除失败', 'Could not delete')); }
      finally { busy = false; }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-hr="open"]')) openPerson(e.target.dataset.id); });
  document.addEventListener('input', e => {
    if (!e.target.matches?.('[data-hr-search]')) return;
    ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender();
    const i = document.querySelector('[data-hr-search]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || !['hr-profile', 'hr-secrets', 'hr-salary', 'hr-doc', 'hr-event'].includes(f.id)) return;
    e.preventDefault(); if (busy) return; busy = true;
    const err = f.querySelector('.wms-error'); if (err) err.textContent = '';
    const id = encodeURIComponent(detail.person.id), v = Object.fromEntries(new FormData(f));
    try {
      if (f.id === 'hr-profile') {
        const body = { expectedVersion:detail.profile.version || 0 };
        for (const k of ['hireDate', 'probationEnd', 'contractStart', 'contractEnd', 'lastDay', 'consentDate']) if ((v[k] || null) !== (detail.profile[k] || null)) body[k] = v[k] || null;
        for (const k of ['employmentType', 'status', 'jobLevel', 'workLocation', 'emergencyName', 'emergencyRelation', 'bankName', 'consentVersion', 'notes']) if (String(v[k] ?? '').trim() !== String(detail.profile[k] ?? '')) body[k] = String(v[k] ?? '').trim();
        if (Object.keys(body).length === 1) { ctx.toast?.(tr('没有修改', 'No changes')); return; }
        await put(`/hr/people/${id}/profile`, body); ctx.toast?.(tr('已保存', 'Saved'));
      }
      if (f.id === 'hr-secrets') {
        const body = {}; for (const k of Object.keys(SECRET)) if (String(v[k] || '').trim()) body[k] = String(v[k]).trim();
        if (!Object.keys(body).length) { if (err) err.textContent = tr('请至少填写一项。', 'Fill in at least one field.'); return; }
        await put(`/hr/people/${id}/secrets`, body); ctx.toast?.(tr('已加密保存', 'Encrypted and saved'));
      }
      if (f.id === 'hr-salary') {
        await ctx.api.post(`/hr/people/${id}/salary`, { effectiveDate:v.effectiveDate, base:Number(v.base), allowance:Number(v.allowance || 0), currency:v.currency, period:v.period, reason:String(v.reason || '').trim() });
        revealed.delete('salary'); ctx.toast?.(tr('已添加薪资记录', 'Salary record added'));
      }
      if (f.id === 'hr-doc') {
        const file = f.querySelector('input[type=file]').files[0];
        if (!file) throw new Error(tr('请选择文件', 'Choose a file'));
        if (file.size > 10 * 1024 * 1024) throw new Error(tr('文件不能超过 10 MB', 'Files must be 10 MB or smaller'));
        await ctx.api.post(`/hr/people/${id}/documents`, { kind:v.kind, name:file.name, mime:file.type, dataBase64:await b64(file), expiresOn:v.expiresOn || null });
        ctx.toast?.(tr('已加密上传', 'Uploaded'));
      }
      if (f.id === 'hr-event') { await ctx.api.post(`/hr/people/${id}/events`, { kind:v.kind, happenedOn:v.happenedOn, note:String(v.note || '').trim() }); ctx.toast?.(tr('已添加', 'Added')); }
      busy = false; await refresh();
    } catch (x) { if (err) err.textContent = x.status === 409 && f.id === 'hr-profile' ? tr('这份档案刚被别人改过，请关闭后重新打开再改。', 'Someone else changed this record; close and reopen it.') : x.message || tr('保存失败', 'Could not save'); }
    finally { busy = false; }
  });

  window.WorkOSHr = { configure, reset, render };
})();
