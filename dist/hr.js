/*
 * HR records (人事档案), split into three region tabs: United States, China, other countries.
 *
 * Who sees what is decided by the server (/hr/*); this page only follows the flags it returns:
 *  - the US tab is for the company owner only; the owner also assigns each person's region and exports US payroll for the CPA;
 *  - hr_cn_* / hr_intl_* grants (given by the owner in Organization & permissions) open China or other countries, read-only or editable;
 *  - people outside the US see their own record; managers see the basic employment facts of their reports.
 * Whoever may open a record sees every value in full (SSN, ID, bank, salary); the server keeps them encrypted at rest.
 * Attachments use the shared upload box (upload-zone.js: paste, drag, click or button) and download through the API.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, reminders = null, loading = false, error = '', detail = null, busy = false;
  const ui = { q:'', view:'active', region:null };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const apiBase = () => (window.WORKOS_CONFIG && window.WORKOS_CONFIG.apiBase) || '/api';
  const put = (path, body) => ctx.api.request(path, { method:'PUT', body });
  const STATUS = { active:['在职', 'Active', 'green'], leaving:['离职中', 'Leaving', 'amber'], left:['已离职', 'Left', 'done'] };
  const REGION = { us:['美国', 'United States'], cn:['中国', 'China'], intl:['海外其他地区', 'Other countries'], '':['未分配', 'Not assigned'] };
  const EMPLOYMENT = { full_time:['全职', 'Full-time'], part_time:['兼职', 'Part-time'], temporary:['临时', 'Temporary'], intern:['实习', 'Intern'], contractor:['外包 / 顾问', 'Contractor'], other:['其他', 'Other'] };
  const EVENT = { joined:['入职', 'Joined'], probation_passed:['转正', 'Passed probation'], contract_renewed:['续签合同', 'Contract renewed'], title_change:['岗位调整', 'Role change'], transfer:['调岗 / 调部门', 'Transfer'],
    promotion:['晋升', 'Promotion'], warning:['警告 / 处分', 'Warning'], leaving:['提出离职', 'Resigned / notice'], left:['离职', 'Left'], other:['其他', 'Other'] };
  const DOC = { resume:['简历', 'Resume'], id:['身份证 / 护照', 'ID / passport'], offer_letter:['Offer letter', 'Offer letter'], handbook_ack:['员工手册确认', 'Handbook acknowledgment'], w4:['签字的 W-4', 'Signed W-4'], de4:['签字的 DE 4', 'Signed DE 4'], i9:['I-9 及证件', 'I-9 and documents'], tax_form:['税务表格', 'Tax form'], direct_deposit:['直存授权 / 作废支票', 'Direct deposit form / voided check'],
    contract:['劳动合同', 'Employment contract'], certificate:['证书 / 资质', 'Certificate'], education:['学历证明', 'Education'], other:['其他', 'Other'] };
  const DOC_BY_REGION = { us:['offer_letter', 'handbook_ack', 'w4', 'de4', 'tax_form', 'i9', 'direct_deposit', 'id', 'resume', 'contract', 'certificate', 'education', 'other'], cn:['resume', 'id', 'contract', 'certificate', 'education', 'other'],
    intl:['resume', 'id', 'tax_form', 'contract', 'certificate', 'education', 'other'], '':Object.keys(DOC) };
  const DOC_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const SECRET = { ssn:['SSN（社会安全号）', 'SSN'], idNumber:['身份证 / 护照号', 'ID / passport number'], localTaxId:['当地税号', 'Local tax ID'], bankRouting:['银行 routing number', 'Bank routing number'],
    bankAccount:['工资卡 / 直存账号', 'Pay account number'], emergencyPhone:['紧急联系人电话', 'Emergency phone'] };
  const SECRET_BY_REGION = { us:['ssn', 'emergencyPhone'], cn:['idNumber', 'bankAccount', 'emergencyPhone'], intl:['localTaxId', 'idNumber', 'bankAccount', 'emergencyPhone'], '':Object.keys(SECRET) };
  const REMIND = { probation_end:['试用期结束', 'Probation ends'], contract_end:['合同到期', 'Contract ends'], document_expiry:['证件到期', 'Document expires'], work_auth_expiry:['工作授权到期', 'Work authorization expires'] };
  const w = pair => pair ? tr(pair[0], pair[1]) : '';
  const badge = s => `<span class="rma-badge ${STATUS[s]?.[2] || ''}">${esc(w(STATUS[s]))}</span>`;
  const regionBadge = r => `<span class="hr-region ${r ? 'r-' + r : 'none'}">${esc(w(REGION[r || '']))}</span>`;
  const tenure = d => d == null ? '—' : d < 31 ? tr(`${d} 天`, `${d} days`) : d < 365 ? tr(`${Math.floor(d / 30.4)} 个月`, `${Math.floor(d / 30.4)} mo`) : tr(`${(d / 365.25).toFixed(1)} 年`, `${(d / 365.25).toFixed(1)} yr`);
  const inDays = d => d == null ? '' : d < 0 ? tr(`已过 ${-d} 天`, `${-d} days ago`) : d === 0 ? tr('今天', 'today') : tr(`${d} 天后`, `in ${d} days`);
  const daysTo = v => v ? Math.round((new Date(v + 'T00:00:00Z') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 864e5) : null;
  const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const canManage = () => !!detail && (detail.canManage ?? detail.access === 'hr');
  const limited = () => !detail || detail.access === 'manager' || detail.access === 'basic';

  function configure(next) { ctx = next; }
  function reset() { data = null; reminders = null; detail = null; loading = false; error = ''; Object.assign(ui, { q:'', view:'active', region:null }); }
  async function load() {
    if (loading) return; loading = true;
    try {
      data = await ctx.api.get('/hr/people');
      reminders = data.isHr ? (await ctx.api.get('/hr/reminders')).items : null;
      error = '';
    } catch (e) { error = e.message || tr('人事档案读取失败', 'Could not load HR records'); }
    finally { loading = false; ctx.rerender(); }
  }

  /** Region tabs the viewer may open: regions with a grant, plus "not assigned" for whoever assigns regions. */
  function regionTabs() {
    if (!data?.isHr || !data.regions) return [];
    const tabs = ['us', 'cn', 'intl'].filter(r => data.regions[r]);
    if (data.global || data.canAssignRegion) tabs.push('');
    return tabs;
  }
  function filtered() {
    const q = ui.q.trim().toLowerCase(), tabs = regionTabs();
    return data.items.filter(p => {
      if (tabs.length && ui.region !== 'all' && (p.region || '') !== ui.region) return false;
      if (ui.view !== 'all' && p.status !== ui.view) return false;
      return !q || [p.name, p.nameZh, p.nameEn, p.title, p.departmentName, p.managerName, p.jobLevel].some(x => String(x || '').toLowerCase().includes(q));
    });
  }

  function keyNotice() {
    if (!data.isHr || data.sensitive === 'configured') return '';
    return `<div class="wms-alert">${icon('lock-key')} ${data.sensitive === 'invalid_key'
      ? tr('加密密钥 HR_DATA_KEY 的格式不对，SSN、身份证号、银行信息、薪酬与税务和附件暂时不能录入或查看。请管理员在服务器配置里改正。', 'HR_DATA_KEY is not a valid key, so SSNs, ID numbers, bank details, pay & tax and attachments cannot be saved or viewed. Ask the administrator to fix the server setting.')
      : tr('还没有设置加密密钥 HR_DATA_KEY：员工档案可以正常使用，SSN、身份证号、银行信息、薪酬与税务和附件要等管理员在服务器配置里设置密钥后才能录入。', 'HR_DATA_KEY is not set: records work, but SSNs, ID numbers, bank details, pay & tax and attachments can be saved only after the administrator sets the key on the server.')}</div>`;
  }

  function render() {
    if (!data && !error) { load(); return `<div class="rma hr"><p class="wms-hint">${tr('正在读取人事档案…', 'Loading HR records…')}</p></div>`; }
    if (error && !data) return `<div class="rma hr"><div class="wms-alert">${esc(error)}</div></div>`;
    const tabs = regionTabs();
    if (tabs.length && ui.region !== 'all' && !tabs.includes(ui.region)) ui.region = tabs[0];
    const scoped = tabs.length && ui.region !== 'all' ? data.items.filter(p => (p.region || '') === ui.region) : data.items;
    const by = s => scoped.filter(p => p.status === s);
    const onProbation = scoped.filter(p => p.status !== 'left' && p.probationEnd && daysTo(p.probationEnd) >= 0);
    const contracts = scoped.filter(p => p.status !== 'left' && p.contractEnd && daysTo(p.contractEnd) <= 30);
    const views = [['active', tr('在职', 'Active'), by('active').length], ['leaving', tr('离职中', 'Leaving'), by('leaving').length], ['left', tr('已离职', 'Left'), by('left').length], ['all', tr('全部', 'All'), scoped.length]];
    const rows = filtered();
    const remind = (reminders || []).filter(r => !tabs.length || ui.region === 'all' || (r.region ?? ui.region) === ui.region);
    const intro = data.isHr
      ? tr('按地区管理员工的雇佣信息、payroll 资料、附件和履历。美国区只有主管理员能看；中国和海外其他地区只有主管理员选定的人能看。SSN、身份证号、银行信息和薪资在数据库里加密保存。', 'Employment facts, payroll setup, attachments and history, by region. The US region is for the company owner only; China and other countries only for the people the owner picks. SSNs, ID numbers, bank details and salary are encrypted in the database.')
      : tr('你自己的档案，以及你下属的雇佣信息。', 'Your own record and the employment facts of your reports.');
    const count = r => data.items.filter(p => (p.region || '') === r).length;
    return `<div class="rma hr">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · HR</div><h1>${tr('人事档案', 'HR records')}</h1><p>${intro}</p></div></div>
      ${keyNotice()}
      ${tabs.length ? `<div class="hr-regions" role="tablist" aria-label="${tr('地区', 'Region')}">${tabs.map(r => `<button role="tab" aria-selected="${ui.region === r}" class="${ui.region === r ? 'on' : ''}" data-hr="region-tab" data-r="${r}">${esc(w(REGION[r]))} <b>${count(r)}</b>${r && data.regions[r] === 'view' ? `<small>${tr('只读', 'read-only')}</small>` : ''}</button>`).join('')}${tabs.length > 1 ? `<button role="tab" aria-selected="${ui.region === 'all'}" class="${ui.region === 'all' ? 'on' : ''}" data-hr="region-tab" data-r="all">${tr('全部', 'All')} <b>${data.items.length}</b></button>` : ''}</div>` : ''}
      ${ui.region === '' && tabs.includes('') ? `<p class="wms-hint">${tr('这里是还没有设置地区的员工。打开员工档案，在顶部选择“美国 / 中国 / 海外其他地区”。只有主管理员能设置地区。', 'People without a region yet. Open a record and choose United States, China or Other countries at the top. Only the company owner sets regions.')}</p>` : ''}
      ${ui.region === 'us' && data.canExportUs ? `<div class="hr-export">${'<button class="btn primary" type="button" data-hr="export-us">' + icon('file-csv') + ' ' + tr('导出给 CPA', 'Export for the CPA') + '</button>'}
        <span>${tr('导出所有在职美国员工的 payroll 资料（CSV，可用 Excel 打开），最后一列列出上次导出后改过的字段。', 'All active US employees’ payroll data (CSV, opens in Excel); the last column lists what changed since the previous export.')}
        <b>${tr('文件含 SSN 和银行账号，请用加密方式（例如加密压缩包或安全文件传输）发给 CPA，不要用普通邮件附件。', 'The file contains SSNs and bank accounts: send it to the CPA encrypted (e.g. an encrypted archive or secure file transfer), never as a plain email attachment.')}</b>
        ${data.lastUsExport ? `<small>${tr('上次导出：', 'Last export: ')}${esc(String(data.lastUsExport.at).slice(0, 16).replace('T', ' '))} · ${esc(data.lastUsExport.byName)} · ${tr(`${data.lastUsExport.rows} 人`, `${data.lastUsExport.rows} people`)}</small>` : ''}</span></div>` : ''}
      ${data.isHr ? `<div class="rma-kpis">
        <div class="rma-kpi"><span>${tr('在职人数', 'Active')}</span><b>${by('active').length}</b><em>${tr(`离职中 ${by('leaving').length} 人`, `${by('leaving').length} leaving`)}</em></div>
        <div class="rma-kpi"><span>${tr('试用期中', 'On probation')}</span><b>${onProbation.length}</b><em>${tr(`30 天内转正 ${onProbation.filter(p => daysTo(p.probationEnd) <= 30).length} 人`, `${onProbation.filter(p => daysTo(p.probationEnd) <= 30).length} end within 30 days`)}</em></div>
        <div class="rma-kpi"><span>${tr('合同 30 天内到期', 'Contracts ending ≤30 days')}</span><b class="${contracts.length ? 'late' : ''}">${contracts.length}</b><em>${tr('包括已过期未续签', 'including lapsed')}</em></div>
        <div class="rma-kpi"><span>${tr('档案未建', 'No record yet')}</span><b>${scoped.filter(p => !p.hasProfile && p.accountActive).length}</b><em>${tr('有账号但还没填入职信息', 'account but no employment facts')}</em></div>
      </div>
      ${remind.length ? `<section class="hr-reminders"><h3>${icon('bell-ringing')} ${tr('近期提醒', 'Coming up')}</h3><ul>${remind.slice(0, 8).map(r => `<li data-hr="open" data-id="${esc(r.userId)}" tabindex="0"><b>${esc(r.name)}</b> ${esc(w(REMIND[r.kind]))}${r.documentName ? ` · ${esc(r.documentName)}` : ''}<span class="${r.days <= 7 ? 'late' : ''}">${esc(r.date)} · ${esc(inDays(r.days))}</span></li>`).join('')}</ul></section>` : ''}` : ''}
      <div class="rma-bar"><div class="rma-views" role="tablist">${views.map(([id, label, n]) => `<button class="${ui.view === id ? 'on' : ''}" data-hr="view" data-v="${id}">${esc(label)} <b>${n}</b></button>`).join('')}</div>
        <label class="wms-search">${icon('magnifying-glass')}<input data-hr-search value="${esc(ui.q)}" placeholder="${tr('搜索姓名、部门、职位、主管', 'Search name, department, title, manager')}"></label></div>
      <div class="wms-table-wrap"><table class="wms-table rma-table hr-table"><thead><tr><th>${tr('姓名', 'Name')}</th>${tabs.length ? `<th>${tr('地区', 'Region')}</th>` : ''}<th>${tr('部门', 'Department')}</th><th>${tr('主管', 'Manager')}</th><th>${tr('入职日期', 'Hired')}</th><th>${tr('司龄', 'Tenure')}</th><th>${tr('用工类型', 'Type')}</th><th>${tr('试用期至', 'Probation to')}</th><th>${tr('合同至', 'Contract to')}</th><th>${tr('状态', 'Status')}</th></tr></thead><tbody>
        ${rows.map(p => { const pd = daysTo(p.probationEnd), cd = daysTo(p.contractEnd);
          return `<tr class="rma-row" data-hr="open" data-id="${esc(p.id)}" tabindex="0"><td><b>${esc(p.name)}</b><small>${esc([p.title, p.jobLevel].filter(Boolean).join(' · '))}</small></td>${tabs.length ? `<td>${regionBadge(p.region)}</td>` : ''}<td>${esc(p.departmentName || p.departmentId)}</td><td>${esc(p.managerName || '—')}</td>
          <td>${esc(p.hireDate || '—')}</td><td>${esc(tenure(p.tenureDays))}</td><td>${esc(w(EMPLOYMENT[p.employmentType]))}</td>
          <td class="${pd != null && pd >= 0 && pd <= 7 ? 'late' : ''}">${esc(p.probationEnd || '—')}</td><td class="${cd != null && cd <= 30 && p.status !== 'left' ? 'late' : ''}">${esc(p.contractEnd || '—')}</td>
          <td>${badge(p.status)}${p.accountActive ? '' : `<small>${tr('账号已停用', 'account off')}</small>`}</td></tr>`; }).join('') || `<tr><td colspan="${tabs.length ? 10 : 9}" class="wms-empty">${tr('没有符合条件的员工。', 'No matching people.')}</td></tr>`}
      </tbody></table></div></div>`;
  }

  /* ---------- field specs: one list drives both the form and the read-only view ---------- */
  const F = (path, zh, en, type = 'text', extra = {}) => ({ path, zh, en, type, ...extra });
  const O = (...pairs) => pairs.map(([v, zh, en]) => ({ v, zh, en }));
  const G = (zh, en, fields, note) => ({ zh, en, fields, note });
  const I9 = O(['citizen', '美国公民', 'U.S. citizen'], ['noncitizen_national', '美国非公民国民', 'Noncitizen national'], ['permanent_resident', '永久居民（绿卡）', 'Lawful permanent resident'], ['authorized_alien', '有工作许可的外国人', 'Noncitizen authorized to work'], ['pending', '待完成', 'Pending']);
  const EDU = G('学历', 'Education', [F('education.level', '最高学历', 'Highest level', 'select', { o:O(['high_school', '高中', 'High school'], ['vocational', '中专 / 职高', 'Vocational'], ['associate', '大专', 'Associate'], ['bachelor', '本科', 'Bachelor'], ['master', '硕士', 'Master'], ['doctorate', '博士', 'Doctorate'], ['other', '其他', 'Other']) }),
    F('education.school', '学校', 'School'), F('education.major', '专业', 'Major'), F('education.graduatedOn', '毕业日期', 'Graduated', 'date')]);
  const CONTACT = note => G('联系方式与住址', 'Contact and home address', [F('contact.phone', '电话', 'Phone', 'tel'), F('contact.personalEmail', '个人邮箱', 'Personal email', 'email'),
    F('contact.address.line1', '地址第 1 行', 'Address line 1', 'text', { full:1 }), F('contact.address.line2', '地址第 2 行', 'Address line 2', 'text', { full:1 }), F('contact.address.city', '城市', 'City'),
    F('contact.address.state', '州 / 省', 'State / province'), F('contact.address.postalCode', '邮编', 'ZIP / postal code'), F('contact.address.country', '国家', 'Country')], note);
  const DETAILS = {
    us:[G('法定姓名', 'Legal name', [F('legal.firstName', '名（与 SSN 卡一致）', 'First name (as on SSN card)'), F('legal.middleName', '中间名', 'Middle name'), F('legal.lastName', '姓', 'Last name'), F('legal.preferredName', '常用名', 'Preferred name'),
        F('legal.dateOfBirth', '出生日期', 'Date of birth', 'date'), F('legal.gender', '性别（选填）', 'Gender (optional)', 'select', { o:O(['female', '女', 'Female'], ['male', '男', 'Male'], ['nonbinary', '非二元', 'Non-binary'], ['decline', '不愿透露', 'Prefer not to say']) })]),
      CONTACT(['W-4 和州税按这里的住址。地址变了要同时更新签字的 W-4。', 'W-4 and state tax use this address. When it changes, collect a new signed W-4.']),
      G('工作授权（I-9 第一部分）', 'Work authorization (I-9 Section 1)', [F('workAuth.i9Status', '公民或移民身份', 'Citizenship / immigration status', 'select', { o:I9 }), F('workAuth.documentType', '证件类型', 'Document type', 'text', { ph:'List A / B + C' }),
        F('workAuth.expiresOn', '授权有效期至', 'Authorization expires', 'date'), F('workAuth.i9CompletedOn', 'I-9 完成日期', 'I-9 completed', 'date'),
        F('workAuth.taxState', '工作所在州（州税，两位代码）', 'Work state for state tax (2 letters)', 'text', { max:2, ph:'CA', upper:1 }), F('workAuth.notes', '备注', 'Notes', 'textarea')],
        ['I-9 证件请上传到下方“合同与证件”，类型选“I-9 及证件”。', 'Upload the I-9 documents under Contracts & documents below.']), EDU],
    cn:[G('身份与户籍', 'Identity and hukou', [F('legal.nativeName', '法定姓名（与身份证一致）', 'Legal name (as on ID card)'), F('cn.hukouLocation', '户籍地', 'Hukou location'),
        F('cn.hukouType', '户口性质', 'Hukou type', 'select', { o:O(['urban', '城镇', 'Urban'], ['rural', '农村', 'Rural'], ['resident', '居民户口（统一）', 'Resident (unified)']) }), F('cn.currentAddress', '现住址', 'Current address', 'text', { full:1 })]),
      G('联系方式', 'Contact', [F('contact.phone', '手机', 'Mobile', 'tel'), F('contact.personalEmail', '个人邮箱', 'Personal email', 'email')]),
      G('劳动合同', 'Employment contract', [F('cn.contractType', '合同类型', 'Contract type', 'select', { o:O(['fixed_term', '固定期限', 'Fixed term'], ['open_ended', '无固定期限', 'Open-ended'], ['project', '以完成一定工作任务为期限', 'Project-based'], ['part_time', '非全日制', 'Part-time'], ['dispatch', '劳务派遣', 'Labor dispatch'], ['internship', '实习协议', 'Internship'], ['retiree', '退休返聘（劳务协议）', 'Retiree rehire']) })],
        ['合同起止日期和试用期在上方“雇佣信息”里填写。', 'Contract dates and probation are in Employment above.']), EDU],
    intl:[G('姓名', 'Name', [F('legal.firstName', '名', 'First name'), F('legal.lastName', '姓', 'Last name'), F('legal.nativeName', '本地语言姓名', 'Name in local language')]),
      G('用工方式', 'Engagement', [F('intl.country', '国家（两位代码）', 'Country (2 letters)', 'text', { max:2, ph:'DE', upper:1 }), F('intl.engagement', '用工方式', 'Engagement', 'select', { o:O(['employee', '雇员', 'Employee'], ['contractor', '承包商', 'Contractor'], ['eor', 'EOR（名义雇主）', 'EOR']) }),
        F('intl.eorProvider', 'EOR / 外包服务商', 'EOR / agency'), F('intl.currency', '薪资币种', 'Pay currency', 'text', { max:3, ph:'EUR', upper:1 }), F('intl.contractType', '合同类型', 'Contract type')],
        ['合同起止日期在上方“雇佣信息”里填写；当地税号在“敏感资料”里加密保存。', 'Contract dates are in Employment above; the local tax ID is stored encrypted under Sensitive details.']), CONTACT(), EDU],
    '':[G('姓名', 'Name', [F('legal.firstName', '名', 'First name'), F('legal.lastName', '姓', 'Last name'), F('legal.nativeName', '法定姓名', 'Legal name')]), CONTACT(), EDU],
  };
  const COV = k => [F(`benefits.${k}.plan`, '计划', 'Plan'), F(`benefits.${k}.status`, '状态', 'Status', 'select', { o:O(['enrolled', '已参加', 'Enrolled'], ['waived', '放弃', 'Waived'], ['not_eligible', '不符合条件', 'Not eligible']) }),
    F(`benefits.${k}.tier`, '覆盖人员', 'Coverage', 'select', { o:O(['employee', '本人', 'Employee'], ['employee_spouse', '本人 + 配偶', 'Employee + spouse'], ['employee_children', '本人 + 子女', 'Employee + children'], ['family', '全家', 'Family']) }),
    F(`benefits.${k}.deduction`, '每期员工扣款', 'Employee deduction / pay period', 'number')];
  const FREQ = F('comp.payFrequency', '发薪周期', 'Pay frequency', 'select', { o:O(['weekly', '每周', 'Weekly'], ['biweekly', '每两周', 'Biweekly'], ['semimonthly', '每月两次', 'Semimonthly'], ['monthly', '每月', 'Monthly']) });
  const PAYTYPE = F('comp.payType', '计薪方式', 'Pay type', 'select', { o:O(['hourly', '小时工', 'Hourly'], ['salary', '年薪 / 固定薪资', 'Salaried'], ['commission_only', '纯提成', 'Commission only'], ['contract', '按合同', 'Contract']) });
  const COMMISSION = G('提成方案', 'Commission plan', [F('commission.plan', '计算方式', 'Method', 'select', { o:O(['none', '无提成', 'None'], ['percent_revenue', '按销售额比例', '% of revenue'], ['percent_margin', '按毛利比例', '% of margin'], ['tiered', '阶梯比例', 'Tiered'], ['per_unit', '按件', 'Per unit'], ['other', '其他', 'Other']) }),
    F('commission.rate', '比例 %', 'Rate %', 'number'), F('commission.perUnit', '每件金额', 'Amount per unit', 'number'),
    F('commission.payout', '发放周期', 'Paid', 'select', { o:O(['monthly', '每月', 'Monthly'], ['quarterly', '每季度', 'Quarterly'], ['annual', '每年', 'Annually'], ['per_deal', '每单', 'Per deal']) }),
    ...[0, 1, 2].flatMap(i => [F(`commission.tiers.${i}.from`, `阶梯 ${i + 1}：起`, `Tier ${i + 1}: from`, 'number'), F(`commission.tiers.${i}.to`, `阶梯 ${i + 1}：止（空 = 以上）`, `Tier ${i + 1}: to (blank = and up)`, 'number'), F(`commission.tiers.${i}.rate`, `阶梯 ${i + 1}：比例 %`, `Tier ${i + 1}: rate %`, 'number')]),
    F('commission.basis', '计算基数', 'Calculated on', 'text', { full:1 }), F('commission.notes', '方案说明', 'Plan description', 'textarea')]);
  const BONUS = G('奖金', 'Bonus', [F('bonus.eligible', '有奖金', 'Eligible for a bonus', 'bool'), F('bonus.type', '类型', 'Type', 'select', { o:O(['annual', '年终', 'Annual'], ['quarterly', '季度', 'Quarterly'], ['signing', '签约', 'Signing'], ['performance', '绩效', 'Performance'], ['retention', '留任', 'Retention'], ['referral', '推荐', 'Referral'], ['other', '其他', 'Other']) }),
    F('bonus.amountType', '金额方式', 'Amount is', 'select', { o:O(['fixed', '固定金额', 'Fixed'], ['percent_of_base', '基本工资的百分比', '% of base']) }), F('bonus.amount', '金额或比例', 'Amount or %', 'number'), F('bonus.notes', '说明', 'Notes', 'textarea')]);
  const FAMILY = (children, zh, en) => G(zh, en, [F('family.maritalStatus', '婚姻状况', 'Marital status', 'select', { o:O(['single', '未婚', 'Single'], ['married', '已婚', 'Married'], ['domestic_partner', '同居伴侣', 'Domestic partner'], ['divorced', '离异', 'Divorced'], ['separated', '分居', 'Separated'], ['widowed', '丧偶', 'Widowed']) }),
    ...children, F('family.notes', '备注', 'Notes')],
    ['只用于 payroll 和福利，不能用于聘用、晋升或解雇等决定。', 'For payroll and benefits only. Never use it for hiring, promotion or termination decisions.']);
  const SHARE = (k, zh, en, personal = true) => [...(personal ? [F(`socialInsurance.${k}.personal`, `${zh}：个人 %`, `${en}: employee %`, 'number')] : []), F(`socialInsurance.${k}.employer`, `${zh}：单位 %`, `${en}: employer %`, 'number')];
  const DED = (k, zh, en, extra = []) => [F(`specialDeductions.${k}.claimed`, zh, en, 'bool'), ...extra, F(`specialDeductions.${k}.${k === 'seriousIllness' ? 'annual' : 'monthly'}`, `${zh}：${k === 'seriousIllness' ? '年度' : '每月'}金额`, `${en}: ${k === 'seriousIllness' ? 'yearly' : 'monthly'} amount`, 'number')];
  const PAYROLL = {
    us:[G('计薪', 'Pay', [PAYTYPE, F('comp.flsa', 'FLSA', 'FLSA', 'select', { o:O(['exempt', '豁免（不计加班）', 'Exempt'], ['non_exempt', '非豁免（需付加班费）', 'Non-exempt']) }), FREQ,
        F('comp.standardHours', '每周标准工时', 'Standard hours / week', 'number'), F('comp.notes', '备注', 'Notes', 'textarea')],
        ['时薪或年薪金额在下方“敏感资料 → 薪资记录”里添加：小时工选“每小时”，年薪选“每年”。', 'Add the hourly rate or annual salary under Sensitive details → Salary records (per hour or per year).']),
      COMMISSION, BONUS,
      G('福利', 'Benefits', [...COV('medical').map(f => ({ ...f, zh:'医疗：' + f.zh, en:'Medical: ' + f.en })),
        ...COV('dental').map(f => ({ ...f, zh:'牙科：' + f.zh, en:'Dental: ' + f.en })), ...COV('vision').map(f => ({ ...f, zh:'视力：' + f.zh, en:'Vision: ' + f.en })),
        F('benefits.retirement.enrolled', '参加 401(k)', 'Enrolled in 401(k)', 'bool'), F('benefits.retirement.employeePercent', '401(k) 员工缴纳 %', '401(k) employee %', 'number'),
        F('benefits.retirement.rothPercent', '其中 Roth %', 'of which Roth %', 'number'), F('benefits.retirement.employerMatch', '公司匹配规则', 'Employer match'),
        F('benefits.hsa.enrolled', '参加 HSA', 'Enrolled in HSA', 'bool'), F('benefits.hsa.perPeriod', 'HSA 每期扣款', 'HSA / pay period', 'number'),
        F('benefits.fsa.enrolled', '参加 FSA', 'Enrolled in FSA', 'bool'), F('benefits.fsa.kind', 'FSA 类型', 'FSA type', 'select', { o:O(['health', '医疗', 'Health care'], ['limited', '有限用途', 'Limited purpose'], ['dependent_care', '家属照护', 'Dependent care']) }),
        F('benefits.fsa.perPeriod', 'FSA 每期扣款', 'FSA / pay period', 'number'), F('benefits.life.coverage', '人寿保险额度', 'Life insurance coverage'),
        ...[0, 1].flatMap(i => [F(`benefits.life.beneficiaries.${i}.name`, `受益人 ${i + 1}：姓名`, `Beneficiary ${i + 1}: name`), F(`benefits.life.beneficiaries.${i}.relation`, `受益人 ${i + 1}：关系`, `Beneficiary ${i + 1}: relation`), F(`benefits.life.beneficiaries.${i}.percent`, `受益人 ${i + 1}：比例 %`, `Beneficiary ${i + 1}: %`, 'number')]),
        F('benefits.pto.daysPerYear', '带薪假（天 / 年）', 'PTO days / year', 'number'), F('benefits.pto.sickDaysPerYear', '病假（天 / 年）', 'Sick days / year', 'number'), F('benefits.pto.policy', 'PTO 规则', 'PTO policy'), F('benefits.other', '其他福利', 'Other benefits', 'textarea')]),
      G('工资直存', 'Direct deposit', [0, 1, 2].flatMap(i => [F(`directDeposit.${i}.bankName`, `账户 ${i + 1}：银行`, `Account ${i + 1}: bank`), F(`directDeposit.${i}.accountType`, `账户 ${i + 1}：类型`, `Account ${i + 1}: type`, 'select', { o:O(['checking', '支票账户', 'Checking'], ['savings', '储蓄账户', 'Savings']) }),
        F(`directDeposit.${i}.routing`, `账户 ${i + 1}：routing number`, `Account ${i + 1}: routing number`, 'text', { max:9 }), F(`directDeposit.${i}.account`, `账户 ${i + 1}：账号`, `Account ${i + 1}: account number`, 'text', { max:17 }),
        F(`directDeposit.${i}.split`, `账户 ${i + 1}：分配方式`, `Account ${i + 1}: split`, 'select', { o:O(['percent', '按比例 %', 'Percent'], ['amount', '固定金额', 'Fixed amount'], ['remainder', '剩余全部', 'Remainder']) }), F(`directDeposit.${i}.value`, `账户 ${i + 1}：比例或金额`, `Account ${i + 1}: % or amount`, 'number')]),
        ['最多三个账户；最后一个账户通常选“剩余全部”。', 'Up to three accounts; the last one usually takes the remainder.']),
      G('受抚养人 / 家属（福利用）', 'Dependents (for benefits)', [0, 1, 2, 3].flatMap(i => [F(`dependents.${i}.name`, `家属 ${i + 1}：姓名`, `Dependent ${i + 1}: name`), F(`dependents.${i}.relation`, `家属 ${i + 1}：关系`, `Dependent ${i + 1}: relation`, 'select', { o:O(['spouse', '配偶', 'Spouse'], ['domestic_partner', '同居伴侣', 'Domestic partner'], ['child', '子女', 'Child'], ['other', '其他', 'Other']) }),
        F(`dependents.${i}.dateOfBirth`, `家属 ${i + 1}：出生日期`, `Dependent ${i + 1}: date of birth`, 'date'), F(`dependents.${i}.ssn`, `家属 ${i + 1}：SSN`, `Dependent ${i + 1}: SSN`, 'text', { max:11, ph:'000-00-0000' })])),
      FAMILY([F('family.dependents', '受抚养人数量', 'Dependents', 'number'), F('family.children', '子女数量', 'Children', 'number')], '婚姻与受抚养人', 'Marital status and dependents'),
      G('联邦 W-4（2020 及以后版本）', 'Federal W-4 (2020 or later)', [F('w4.formYear', '表格年份', 'Form year', 'number'),
        F('w4.filingStatus', 'Step 1(c) 申报身份', 'Step 1(c) filing status', 'select', { o:O(['single_or_mfs', '单身或已婚分别申报', 'Single or married filing separately'], ['mfj_or_qss', '已婚合并申报或符合条件的丧偶配偶', 'Married filing jointly or qualifying surviving spouse'], ['head_of_household', '户主', 'Head of household']) }),
        F('w4.multipleJobs', 'Step 2：多份工作或配偶也工作（已勾选）', 'Step 2: multiple jobs or spouse works (checked)', 'bool'), F('w4.dependentsAmount', 'Step 3：受抚养人金额', 'Step 3: dependents amount', 'number'),
        F('w4.otherIncome', 'Step 4(a)：其他收入', 'Step 4(a): other income', 'number'), F('w4.deductions', 'Step 4(b)：扣除', 'Step 4(b): deductions', 'number'),
        F('w4.extraWithholding', 'Step 4(c)：每期额外预扣', 'Step 4(c): extra withholding per period', 'number'), F('w4.exempt', '申报免预扣（Exempt）', 'Claims exemption', 'bool'), F('w4.signedOn', '签字日期', 'Signed on', 'date')],
        ['签字的 W-4 请上传到下方“合同与证件”，类型选“签字的 W-4”。', 'Upload the signed W-4 under Contracts & documents below.']),
      G('加州 DE 4', 'California DE 4', [F('de4.filingStatus', '申报身份', 'Filing status', 'select', { o:O(['single_or_married_multi', '单身，或已婚（两份及以上收入）', 'Single or married (with two or more incomes)'], ['married_one_income', '已婚（一份收入）', 'Married (one income)'], ['head_of_household', '户主', 'Head of household']) }),
        F('de4.allowances', '预扣津贴数（Allowances）', 'Withholding allowances', 'number'), F('de4.additionalAllowances', '估算扣除的额外津贴', 'Additional allowances for estimated deductions', 'number'),
        F('de4.extraWithholding', '每期额外预扣', 'Additional withholding per period', 'number'), F('de4.exempt', '申报免预扣（Exempt）', 'Claims exemption', 'bool'), F('de4.signedOn', '签字日期', 'Signed on', 'date')],
        ['不在加州工作的员工不用填。', 'Leave blank for people who do not work in California.']),
      G('其他州州税表', 'Other state withholding form', [F('stateTax.state', '州（两位代码）', 'State (2 letters)', 'text', { max:2, upper:1 }), F('stateTax.form', '表格名称', 'Form name'), F('stateTax.filingStatus', '申报身份', 'Filing status'),
        F('stateTax.allowances', '津贴 / 豁免数', 'Allowances / exemptions', 'number'), F('stateTax.extraWithholding', '每期额外预扣', 'Additional withholding per period', 'number'), F('stateTax.exempt', '申报免预扣', 'Claims exemption', 'bool'), F('stateTax.notes', '备注', 'Notes', 'textarea')],
        ['在加州以外的州工作时填写。', 'For people working in a state other than California.'])],
    cn:[G('计薪', 'Pay', [FREQ, F('comp.notes', '备注', 'Notes', 'textarea')], ['工资金额在下方“敏感资料 → 薪资记录”里添加。', 'Add the salary amount under Sensitive details → Salary records.']), COMMISSION, BONUS,
      G('社保', 'Social insurance', [F('socialInsurance.city', '缴纳城市', 'City'), F('socialInsurance.base', '缴费基数', 'Contribution base', 'number'),
        ...SHARE('pension', '养老', 'Pension'), ...SHARE('medical', '医疗', 'Medical'), ...SHARE('unemployment', '失业', 'Unemployment'), ...SHARE('injury', '工伤', 'Work injury', false), ...SHARE('maternity', '生育', 'Maternity', false)]),
      G('住房公积金', 'Housing fund', [F('housingFund.city', '缴纳城市', 'City'), F('housingFund.base', '缴存基数', 'Base', 'number'), F('housingFund.personal', '个人 %', 'Employee %', 'number'), F('housingFund.employer', '单位 %', 'Employer %', 'number')]),
      G('个税专项附加扣除', 'Special additional deductions (IIT)', [...DED('childEducation', '子女教育', 'Child education', [F('specialDeductions.childEducation.count', '子女教育：人数', 'Child education: children', 'number')]),
        ...DED('infantCare', '3 岁以下婴幼儿照护', 'Infant care (under 3)', [F('specialDeductions.infantCare.count', '婴幼儿照护：人数', 'Infant care: children', 'number')]),
        ...DED('continuingEducation', '继续教育', 'Continuing education'), ...DED('seriousIllness', '大病医疗', 'Serious illness'), ...DED('housingLoanInterest', '住房贷款利息', 'Mortgage interest'),
        ...DED('housingRent', '住房租金', 'Housing rent'), ...DED('elderlySupport', '赡养老人', 'Elderly support')],
        ['按员工在个税 App 里的申报填写，用于核对每月预扣。', 'Copy what the employee declared in the IIT app; used to check monthly withholding.']),
      FAMILY([F('family.children', '子女数量', 'Children', 'number')], '婚育情况', 'Marital status and children')],
    intl:[G('计薪', 'Pay', [PAYTYPE, FREQ, F('intl.paymentMethod', '付款方式', 'Paid through', 'select', { o:O(['local_payroll', '当地 payroll', 'Local payroll'], ['eor_invoice', 'EOR 账单', 'EOR invoice'], ['contractor_invoice', '承包商发票', 'Contractor invoice'], ['wire', '电汇', 'Wire'], ['other', '其他', 'Other']) }),
        F('intl.notes', '备注', 'Notes', 'textarea')], ['薪资金额和币种在下方“敏感资料 → 薪资记录”里添加。', 'Add the pay amount and currency under Sensitive details → Salary records.']), COMMISSION, BONUS,
      G('福利', 'Benefits', [F('benefits.pto.daysPerYear', '带薪假（天 / 年）', 'Paid leave days / year', 'number'), F('benefits.other', '其他福利', 'Other benefits', 'textarea')]),
      FAMILY([F('family.dependents', '受抚养人数量', 'Dependents', 'number')], '婚姻与受抚养人', 'Marital status and dependents')],
  };
  PAYROLL[''] = PAYROLL.us.slice(0, 3);
  const EEO = [G('EEO 自愿申报（全部选填）', 'Voluntary EEO self-identification (all optional)', [
    F('ethnicity', '种族 / 族裔', 'Race / ethnicity', 'select', { o:O(['hispanic_latino', '西班牙裔或拉丁裔', 'Hispanic or Latino'], ['white', '白人', 'White'], ['black', '非裔', 'Black or African American'], ['asian', '亚裔', 'Asian'], ['native_american', '美洲原住民或阿拉斯加原住民', 'American Indian or Alaska Native'], ['pacific_islander', '夏威夷原住民或太平洋岛民', 'Native Hawaiian or Pacific Islander'], ['two_or_more', '两种及以上', 'Two or more races'], ['decline', '不愿透露', 'Decline to state']) }),
    F('gender', '性别', 'Gender', 'select', { o:O(['female', '女', 'Female'], ['male', '男', 'Male'], ['nonbinary', '非二元', 'Non-binary'], ['decline', '不愿透露', 'Decline to state']) }),
    F('veteran', '退伍军人', 'Veteran status', 'select', { o:O(['protected_veteran', '受保护退伍军人', 'Protected veteran'], ['not_protected', '不是受保护退伍军人', 'Not a protected veteran'], ['decline', '不愿透露', 'Decline to state']) }),
    F('disability', '残障', 'Disability', 'select', { o:O(['yes', '有', 'Yes'], ['no', '无', 'No'], ['decline', '不愿透露', 'Decline to state']) })],
    ['员工自愿填写，单独加密保存，只用于合规统计，不能用于任何聘用决定。', 'Voluntary, stored separately and encrypted, for compliance reporting only and never for employment decisions.'])];

  const get = (o, path) => path.split('.').reduce((v, k) => v == null ? undefined : v[k], o);
  const setIn = (o, path, v) => { const ks = path.split('.'); let cur = o; ks.slice(0, -1).forEach(k => { cur = cur[k] ??= {}; }); cur[ks[ks.length - 1]] = v; };
  const shown = (f, v) => {
    if (v === undefined || v === null || v === '') return '';
    if (f.type === 'bool') return v ? tr('是', 'Yes') : tr('否', 'No');
    if (f.type === 'select') { const o = f.o.find(x => x.v === v); return o ? tr(o.zh, o.en) : String(v); }
    return typeof v === 'number' ? v.toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN') : String(v);
  };
  function input(f, v) {
    const label = esc(tr(f.zh, f.en)), name = esc(f.path), full = f.full || f.type === 'textarea' ? ' full' : '';
    if (f.type === 'bool') return `<label class="field hr-check${full}"><input type="checkbox" name="${name}" data-kind="bool" ${v ? 'checked' : ''}><span>${label}</span></label>`;
    if (f.type === 'select') return `<label class="field${full}"><span>${label}</span><select name="${name}" data-kind="select"><option value="">—</option>${f.o.map(o => `<option value="${esc(o.v)}" ${o.v === v ? 'selected' : ''}>${esc(tr(o.zh, o.en))}</option>`).join('')}</select></label>`;
    if (f.type === 'textarea') return `<label class="field full"><span>${label}</span><textarea name="${name}" data-kind="text" rows="2" maxlength="2000">${esc(v ?? '')}</textarea></label>`;
    const type = f.type === 'number' ? 'number" step="any" min="0' : f.type;
    return `<label class="field${full}"><span>${label}</span><input type="${type}" name="${name}" data-kind="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" value="${esc(v ?? '')}" ${f.max ? `maxlength="${f.max}"` : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.upper ? 'data-upper="1"' : ''} autocomplete="off"></label>`;
  }
  function groupsView(groups, values, formId) {
    if (formId) return `<form id="${formId}" class="hr-groups">${groups.map(g => `<fieldset class="hr-group"><legend>${esc(tr(g.zh, g.en))}</legend>${g.note ? `<p class="wms-hint">${esc(w(g.note))}</p>` : ''}<div class="form-grid">${g.fields.map(f => input(f, get(values, f.path))).join('')}</div></fieldset>`).join('')}
      <div class="rma-actions"><button class="btn primary" type="submit">${tr('保存', 'Save')}</button></div><p class="wms-error" role="alert"></p></form>`;
    return groups.map(g => {
      const filled = g.fields.map(f => [f, shown(f, get(values, f.path))]).filter(([, v]) => v);
      return `<div class="hr-group"><h4>${esc(tr(g.zh, g.en))}</h4>${g.note ? `<p class="wms-hint">${esc(w(g.note))}</p>` : ''}${filled.length ? `<dl class="rma-facts">${filled.map(([f, v]) => `<div><dt>${esc(tr(f.zh, f.en))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : `<p class="wms-hint">${tr('未填写', 'Not filled in')}</p>`}</div>`;
    }).join('');
  }
  const valueOf = el => {
    if (!el) return '';
    const kind = el.getAttribute('data-kind');
    if (kind === 'bool') return typeof el.checked === 'boolean' ? el.checked : el.hasAttribute('checked');
    let v = el.tagName === 'SELECT' && typeof el.value !== 'string' ? ((el.querySelector('option[selected]') || el.querySelector('option'))?.getAttribute('value') ?? '') : (el.value ?? el.getAttribute('value') ?? el.textContent ?? '');
    v = String(v).trim();
    if (el.getAttribute('data-upper')) v = v.toUpperCase();
    if (kind === 'number') return v === '' ? null : Number(v);
    if (kind === 'date') return v || null;
    return v;
  };
  function collect(form, groups) {
    const out = {};
    for (const f of groups.flatMap(g => g.fields)) { const el = form.querySelector(`[name="${f.path}"]`); if (el) setIn(out, f.path, valueOf(el)); }
    // Numbered rows (tiers, accounts, dependents, beneficiaries) become arrays without the empty rows.
    const filled = o => Object.values(o).some(v => v !== null && v !== '' && v !== false && !(v && typeof v === 'object' && !filled(v)));
    const lists = o => { for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') { const keys = Object.keys(v); if (keys.length && keys.every(x => /^\d+$/.test(x))) o[k] = keys.sort((a, b) => a - b).map(x => v[x]).filter(filled); else lists(v); } };
    lists(out);
    if (out.commission?.tiers) out.commission.tiers = out.commission.tiers.filter(t => t.rate != null && t.from != null);
    return out;
  }

  /* ---------- person detail ---------- */
  async function openPerson(id) {
    try { detail = await ctx.api.get('/hr/people/' + encodeURIComponent(id)); }
    catch (e) { ctx.toast?.(e.message || tr('读取失败', 'Could not load')); return; }
    drawDetail(true);
  }
  async function refresh() { if (!detail) return; detail = await ctx.api.get('/hr/people/' + encodeURIComponent(detail.person.id)); drawDetail(false); data = null; load(); }

  const fact = (label, value, full) => `<div${full ? ' class="full"' : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
  function employmentSection() {
    const p = detail.profile, opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(w(v))}</option>`).join('');
    if (!canManage()) return `<dl class="rma-facts">
      ${fact(tr('入职日期', 'Hired'), esc(p.hireDate || '—'))}${fact(tr('司龄', 'Tenure'), esc(tenure(detail.tenureDays)))}${fact(tr('用工类型', 'Type'), esc(w(EMPLOYMENT[p.employmentType])))}
      ${fact(tr('试用期至', 'Probation to'), esc(p.probationEnd || '—'))}${fact(tr('合同期', 'Contract'), esc(p.contractStart || p.contractEnd ? `${p.contractStart || '…'} → ${p.contractEnd || '…'}` : '—'))}${fact(tr('职级', 'Level'), esc(p.jobLevel || '—'))}
      ${fact(tr('工作地点', 'Work location'), esc(p.workLocation || '—'))}${p.lastDay ? fact(tr('最后工作日', 'Last day'), esc(p.lastDay)) : ''}
      ${!limited() ? fact(tr('紧急联系人', 'Emergency contact'), esc([p.emergencyName, p.emergencyRelation].filter(Boolean).join(' · ') || '—')) + fact(tr('开户银行', 'Bank'), esc(p.bankName || '—')) : ''}
    </dl>${detail.access === 'self' ? `<p class="wms-hint">${tr('资料有误请联系人事修改。', 'Ask HR to correct anything wrong.')}</p>` : detail.access === 'view' ? `<p class="wms-hint">${tr('你对这个地区只有只读权限。', 'You have read-only access to this region.')}</p>` : ''}`;
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
      ${t('bankName', tr('开户银行', 'Bank'), p.bankName, 80, tr('例如：示例银行', 'e.g. Example Bank'))}
      ${d('consentDate', tr('个人信息授权日期', 'Consent date'), p.consentDate)}${t('consentVersion', tr('授权书版本', 'Consent notice version'), p.consentVersion, 40, '2026-01')}
      <label class="field full"><span>${tr('人事内部备注（员工本人看不到）', 'Internal HR notes (not shown to the employee)')}</span><textarea name="notes" rows="2" maxlength="4000">${esc(p.notes || '')}</textarea></label>
      <div class="full rma-actions"><button class="btn primary" type="submit">${tr('保存', 'Save')}</button><span class="wms-hint">${tr('在“组织与权限”里停用账号，会自动把这里改为“已离职”；反过来，这里改为“已离职”不会停用账号。', 'Disabling the account in Organization & permissions marks this record as left automatically; marking someone as left here does not disable their account.')}</span></div>
      <p class="wms-error" role="alert"></p></form>`;
  }

  const regionOf = () => detail.region || '';
  function detailsSection() {
    const r = regionOf();
    return `${r ? '' : `<p class="wms-hint">${tr('还没有设置所属地区，只显示通用资料。设置地区后会出现对应的 payroll 字段。', 'No region yet, so only general fields show. Set the region to get the payroll fields for it.')}</p>`}
      ${groupsView(DETAILS[r], detail.details || {}, canManage() ? 'hr-details' : null)}`;
  }
  function payrollSection() {
    if (detail.sensitive !== 'configured') return `<p class="wms-hint">${tr('加密密钥未设置，暂时不能录入或查看。', 'The data key is not set, so this cannot be entered or viewed yet.')}</p>`;
    return groupsView(PAYROLL[regionOf()], detail.payroll?.data || {}, canManage() ? 'hr-payroll' : null);
  }
  function eeoSection() { return groupsView(EEO, detail.eeo || {}, canManage() ? 'hr-eeo' : null); }

  function secretRow(label, info) {
    return `<div class="hr-secret"><span>${label}</span><b class="mono">${info?.set ? (info.value != null ? esc(info.value) : tr('无法读取（密钥未设置或已更换）', 'Unreadable (data key missing or changed)')) : '—'}</b></div>`;
  }
  function salaryTable(list) {
    if (!list.length) return `<p class="wms-hint">${tr('还没有薪资记录。', 'No salary records yet.')}</p>`;
    const per = { month:tr('月', 'month'), year:tr('年', 'year'), hour:tr('小时', 'hour') };
    const n = v => Number(v).toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN');
    return `<table class="wms-table hr-salary"><thead><tr><th>${tr('生效日期', 'Effective')}</th><th class="num">${tr('基本工资', 'Base')}</th><th class="num">${tr('补贴', 'Allowance')}</th><th>${tr('原因', 'Reason')}</th><th>${tr('录入人', 'By')}</th></tr></thead><tbody>
      ${list.map(s => `<tr><td>${esc(s.effectiveDate)}</td><td class="num">${esc(s.currency)} ${esc(n(s.base))} / ${esc(per[s.period] || s.period)}</td><td class="num">${esc(n(s.allowance))}</td><td>${esc(s.reason || '—')}</td><td>${esc(s.byName)}</td></tr>`).join('')}</tbody></table>`;
  }
  function sensitiveSection() {
    const s = detail.secrets, manage = canManage(), ready = detail.sensitive === 'configured', sal = detail.salary?.list || [];
    const fields = SECRET_BY_REGION[regionOf()];
    const cur = regionOf() === 'us' ? 'USD' : regionOf() === 'cn' ? 'CNY' : (detail.details?.intl?.currency || 'CNY');
    const currencies = [...new Set([cur, 'CNY', 'USD', 'EUR', 'GBP', 'HKD', 'CAD', 'AUD', 'JPY'])];
    const periods = regionOf() === 'us' ? ['hour', 'year', 'month'] : ['month', 'year', 'hour'];
    return `${fields.map(f => secretRow(esc(w(SECRET[f])), s[f])).join('')}
      <h4 class="hr-sub">${tr('薪资记录', 'Salary records')}</h4>${salaryTable(sal)}
      ${manage && ready ? `<details class="hr-edit"><summary>${icon('pencil-simple')} ${tr('修改号码、添加薪资记录', 'Change numbers, add a salary record')}</summary>
        <form id="hr-secrets" class="form-grid">
          ${fields.map(f => `<label class="field"><span>${esc(w(SECRET[f]))}</span><input name="${f}" maxlength="40" autocomplete="off" value="${esc(s[f]?.value || '')}" ${f === 'ssn' ? 'placeholder="000-00-0000"' : ''}></label>`).join('')}
          <div class="full rma-actions"><button class="btn primary" type="submit">${tr('保存', 'Save')}</button><span class="wms-hint">${tr('清空一项即删除。', 'Clear a field to delete it.')}</span></div><p class="wms-error" role="alert"></p></form>
        <form id="hr-salary" class="form-grid">
          <label class="field"><span>${tr('生效日期', 'Effective date')}</span><input type="date" name="effectiveDate" required></label>
          <label class="field"><span>${tr('金额（时薪 / 月薪 / 年薪）', 'Amount (hourly / monthly / yearly)')}</span><input type="number" name="base" min="0" step="0.01" required></label>
          <label class="field"><span>${tr('补贴', 'Allowance')}</span><input type="number" name="allowance" min="0" step="0.01" value="0"></label>
          <label class="field"><span>${tr('币种 / 周期', 'Currency / per')}</span><span class="hr-pair"><select name="currency">${currencies.map(c => `<option>${c}</option>`).join('')}</select><select name="period">${periods.map(p => `<option value="${p}">${esc({ month:tr('每月', 'month'), year:tr('每年', 'year'), hour:tr('每小时', 'hour') }[p])}</option>`).join('')}</select></span></label>
          <label class="field full"><span>${tr('调整原因', 'Reason')}</span><input name="reason" maxlength="500" placeholder="${tr('例如：入职定薪 / 年度调薪 / 转正', 'e.g. starting pay, annual review')}"></label>
          <div class="full rma-actions"><button class="btn primary" type="submit">${tr('添加薪资记录', 'Add salary record')}</button></div><p class="wms-error" role="alert"></p></form>
      </details>` : ''}`;
  }

  function documentsSection() {
    const manage = canManage(), ready = detail.sensitive === 'configured', kinds = DOC_BY_REGION[regionOf()];
    const order = Object.keys(DOC), docs = [...detail.documents].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const list = docs.map(d => `<li><span>${icon(d.mime === 'application/pdf' ? 'file-pdf' : String(d.mime).startsWith('image/') ? 'file-image' : 'file-doc')} <b>${esc(w(DOC[d.kind]) || d.kind)}</b> ${esc(d.name)} <small>${esc(size(d.size))}${d.expiresOn ? ` · ${tr('有效期至', 'valid to')} ${esc(d.expiresOn)}` : ''}</small></span>
      <span class="${d.daysToExpiry != null && d.daysToExpiry <= 30 ? 'late' : ''}">${d.daysToExpiry != null && d.daysToExpiry <= 30 ? esc(inDays(d.daysToExpiry)) : ''}</span>
      ${ready ? `<button class="btn" type="button" data-hr="doc" data-id="${esc(d.id)}">${icon('download-simple')} ${tr('下载', 'Download')}</button>` : ''}
      ${manage ? `<button class="btn" type="button" data-hr="doc-delete" data-id="${esc(d.id)}" aria-label="${tr('删除', 'Delete')}">${icon('trash')}</button>` : ''}</li>`).join('');
    const box = window.WorkOSUpload ? window.WorkOSUpload.html({ id:'hr-doc', lang:lang(), accept:DOC_MIME, multiple:true, maxBytes:10 * 1024 * 1024, hint:tr('PDF、Word、PNG、JPEG、WebP', 'PDF, Word, PNG, JPEG, WebP') }) : '';
    return `<ul class="hr-docs">${list || `<li class="wms-hint">${tr('还没有附件。', 'No attachments yet.')}</li>`}</ul>
      ${manage && ready ? `<div data-upload-scope="hr-doc"><form id="hr-doc" class="form-grid">
        <label class="field"><span>${tr('附件类型', 'Type')}</span><select name="kind" data-kind="select">${kinds.map(k => `<option value="${k}">${esc(w(DOC[k]))}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('有效期至（可选）', 'Valid to (optional)')}</span><input type="date" name="expiresOn" data-kind="date"></label></form>
        ${box}<p class="wms-hint">${tr('先选类型，再粘贴、拖入、点击选择或点“上传”。文件加密保存，只有有权限的人能下载。', 'Pick the type, then paste, drag, click or press Upload. Files are encrypted and only people with access can download them.')}</p></div>` : ''}`;
  }

  function historySection() {
    const manage = canManage();
    const items = detail.events.map(e => `<li><b>${esc(e.happenedOn)}</b> ${esc(w(EVENT[e.kind]) || e.kind)}${e.note ? ` · ${esc(e.note)}` : ''} <time>${esc(e.byName)}</time></li>`).join('');
    return `<ul class="rma-timeline">${items || `<li class="wms-hint">${tr('还没有履历记录。', 'No history yet.')}</li>`}</ul>
      ${manage ? `<form id="hr-event" class="form-grid hr-event">
        <label class="field"><span>${tr('事件', 'Event')}</span><select name="kind">${Object.entries(EVENT).map(([k, v]) => `<option value="${k}">${esc(w(v))}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('日期', 'Date')}</span><input type="date" name="happenedOn" required></label>
        <label class="field full"><span>${tr('说明', 'Note')}</span><input name="note" maxlength="2000"></label>
        <div class="full rma-actions"><button class="btn" type="submit">${icon('plus')} ${tr('添加履历', 'Add to history')}</button><span class="wms-hint">${tr('“警告 / 处分”只有人事和员工本人能看到。', 'Warnings are visible only to HR and the employee.')}</span></div><p class="wms-error" role="alert"></p></form>` : ''}`;
  }

  function regionControl() {
    if (detail.region === undefined) return '';
    if (!detail.canSetRegion) return regionBadge(regionOf());
    return `<label class="hr-region-pick">${tr('所属地区', 'Region')} <select data-hr-region data-kind="select">${['', 'us', 'cn', 'intl'].map(x => `<option value="${x}" ${x === regionOf() ? 'selected' : ''}>${esc(w(REGION[x]))}</option>`).join('')}</select></label>`;
  }

  function drawDetail(first) {
    const d = detail, p = d.person, seeSensitive = !limited();
    const body = `<div class="rma-detail hr-detail" data-hr-person="${esc(p.id)}">
      <div class="rma-head">${badge(d.profile.status)}<b>${esc(p.name)}</b><span>${esc(p.title || '')}</span><span>${tr('主管：', 'Manager: ')}${esc(p.managerName || '—')}</span>${p.email ? `<span class="mono">${esc(p.email)}</span>` : ''}${p.accountActive ? '' : `<span class="rma-badge red">${tr('账号已停用', 'Account disabled')}</span>`}${regionControl()}</div>
      <section class="rma-sec"><h3>${icon('identification-card')} ${tr('雇佣信息', 'Employment')}</h3>${employmentSection()}</section>
      ${seeSensitive && d.details !== undefined ? `<section class="rma-sec"><h3>${icon('address-book')} ${tr('基本资料', 'Personal details')}${regionOf() ? ` · ${esc(w(REGION[regionOf()]))}` : ''}</h3>${detailsSection()}</section>` : ''}
      ${seeSensitive && d.payroll !== undefined ? `<section class="rma-sec"><h3>${icon('currency-circle-dollar')} ${tr('薪酬与税务', 'Pay & tax')}</h3>${payrollSection()}</section>` : ''}
      ${seeSensitive && d.eeo !== undefined ? `<section class="rma-sec"><h3>${icon('hand-heart')} ${tr('EEO 自愿申报', 'Voluntary EEO')}</h3>${eeoSection()}</section>` : ''}
      ${seeSensitive ? `<section class="rma-sec"><h3>${icon('lock-key')} ${tr('敏感资料', 'Sensitive details')}</h3>${sensitiveSection()}</section>
      <section class="rma-sec"><h3>${icon('files')} ${tr('合同与证件', 'Contracts & documents')}</h3>${documentsSection()}</section>` : ''}
      <section class="rma-sec"><h3>${icon('clock-counter-clockwise')} ${tr('履历', 'History')}</h3>${historySection()}</section>
    </div>`;
    if (first || !document.querySelector('[data-hr-person]')) { ctx.modal(`${esc(p.name)} · ${tr('人事档案', 'HR record')}`, body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`); document.querySelector('#overlay-root .modal')?.classList.add('modal-wide'); }
    else { document.querySelector('[data-hr-person]').outerHTML = body; }
    window.WorkOSUpload?.register('hr-doc', { lang:lang(), accept:DOC_MIME, multiple:true, maxBytes:10 * 1024 * 1024, onFiles:uploadDocs });
  }

  async function uploadDocs(files) {
    const form = document.getElementById('hr-doc'), id = encodeURIComponent(detail.person.id);
    const kind = (form && valueOf(form.querySelector('[name="kind"]'))) || 'other', expiresOn = form ? valueOf(form.querySelector('[name="expiresOn"]')) : null;
    for (const file of files) await ctx.api.post(`/hr/people/${id}/documents`, { kind, name:file.name, mime:file.type, dataBase64:await b64(file), expiresOn:expiresOn || null });
    ctx.toast?.(tr(`已加密上传 ${files.length} 个文件`, `${files.length} file(s) uploaded`));
    await refresh();
    return '';
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
  /** US payroll file for the CPA (company owner only). The file holds SSNs, so the page says how to send it. */
  async function exportUs() {
    if (busy) return; busy = true;
    try {
      const r = await ctx.api.post('/hr/exports/us', {});
      const url = URL.createObjectURL(new Blob([r.csv], { type:'text/csv;charset=utf-8' })), a = document.createElement('a');
      a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      ctx.toast?.(tr(`已导出 ${r.rows} 位员工`, `Exported ${r.rows} employees`)); busy = false; data = null; load();
    } catch (x) { ctx.toast?.(x.message || tr('导出失败', 'Export failed')); }
    finally { busy = false; }
  }
  const b64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error(tr('文件读取失败', 'Could not read the file'))); r.readAsDataURL(f); });

  document.addEventListener('click', async e => {
    const el = e.target.closest?.('[data-hr]'); if (!el || !ctx) return;
    const a = el.dataset.hr;
    if (a === 'view') { ui.view = el.dataset.v; ctx.rerender(); return; }
    if (a === 'region-tab') { ui.region = el.dataset.r; ctx.rerender(); return; }
    if (a === 'open') { openPerson(el.dataset.id); return; }
    if (a === 'export-us') { exportUs(); return; }
    if (a === 'doc') { download(el.dataset.id); return; }
    if (a === 'doc-delete') {
      if (busy || !window.confirm(tr('删除这份文件？删除后无法恢复。', 'Delete this document? This cannot be undone.'))) return;
      busy = true;
      try { await ctx.api.delete(`/hr/people/${encodeURIComponent(detail.person.id)}/documents/${encodeURIComponent(el.dataset.id)}`); ctx.toast?.(tr('已删除', 'Deleted')); busy = false; await refresh(); }
      catch (x) { ctx.toast?.(x.message || tr('删除失败', 'Could not delete')); }
      finally { busy = false; }
    }
  });
  document.addEventListener('change', async e => {
    if (!e.target.matches?.('[data-hr-region]') || !detail || busy) return;
    const to = valueOf(e.target);
    if (!window.confirm(tr(`把 ${detail.person.name} 的地区改为“${w(REGION[to])}”？之后只有这个地区有权限的人能看到这份档案。`, `Move ${detail.person.name} to “${w(REGION[to])}”? Only people with access to that region will see this record.`))) { drawDetail(false); return; }
    busy = true;
    try { await put(`/hr/people/${encodeURIComponent(detail.person.id)}/region`, { region:to }); ctx.toast?.(tr('已更改地区', 'Region changed')); busy = false; await refresh(); }
    catch (x) { ctx.toast?.(x.message || tr('保存失败', 'Could not save')); drawDetail(false); }
    finally { busy = false; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-hr="open"]')) openPerson(e.target.dataset.id); });
  document.addEventListener('input', e => {
    if (!e.target.matches?.('[data-hr-search]')) return;
    ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender();
    const i = document.querySelector('[data-hr-search]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || !['hr-profile', 'hr-details', 'hr-payroll', 'hr-eeo', 'hr-secrets', 'hr-salary', 'hr-doc', 'hr-event'].includes(f.id)) return;
    e.preventDefault(); if (f.id === 'hr-doc' || busy) return; busy = true;
    const err = f.querySelector('.wms-error'); if (err) err.textContent = '';
    const id = encodeURIComponent(detail.person.id), v = ['hr-details', 'hr-payroll', 'hr-eeo'].includes(f.id) ? {} : Object.fromEntries(new FormData(f));
    try {
      if (f.id === 'hr-profile') {
        const body = { expectedVersion:detail.profile.version || 0 };
        for (const k of ['hireDate', 'probationEnd', 'contractStart', 'contractEnd', 'lastDay', 'consentDate']) if ((v[k] || null) !== (detail.profile[k] || null)) body[k] = v[k] || null;
        for (const k of ['employmentType', 'status', 'jobLevel', 'workLocation', 'emergencyName', 'emergencyRelation', 'bankName', 'consentVersion', 'notes']) if (String(v[k] ?? '').trim() !== String(detail.profile[k] ?? '')) body[k] = String(v[k] ?? '').trim();
        if (Object.keys(body).length === 1) { ctx.toast?.(tr('没有修改', 'No changes')); return; }
        await put(`/hr/people/${id}/profile`, body); ctx.toast?.(tr('已保存', 'Saved'));
      }
      if (f.id === 'hr-details') { await put(`/hr/people/${id}/details`, { expectedVersion:detail.profile.version || 0, details:collect(f, DETAILS[regionOf()]) }); ctx.toast?.(tr('已保存', 'Saved')); }
      if (f.id === 'hr-payroll') { await put(`/hr/people/${id}/payroll`, { expectedVersion:detail.payroll?.version ?? null, payroll:collect(f, PAYROLL[regionOf()]) }); ctx.toast?.(tr('已保存', 'Saved')); }
      if (f.id === 'hr-eeo') { await put(`/hr/people/${id}/eeo`, collect(f, EEO)); ctx.toast?.(tr('已保存', 'Saved')); }
      if (f.id === 'hr-secrets') {
        const body = {}; for (const k of SECRET_BY_REGION[regionOf()]) if (k in v && String(v[k] ?? '').trim() !== String(detail.secrets[k]?.value ?? '')) body[k] = String(v[k] ?? '').trim();
        if (!Object.keys(body).length) { ctx.toast?.(tr('没有修改', 'No changes')); return; }
        await put(`/hr/people/${id}/secrets`, body); ctx.toast?.(tr('已保存', 'Saved'));
      }
      if (f.id === 'hr-salary') {
        await ctx.api.post(`/hr/people/${id}/salary`, { effectiveDate:v.effectiveDate, base:Number(v.base), allowance:Number(v.allowance || 0), currency:v.currency, period:v.period, reason:String(v.reason || '').trim() });
        ctx.toast?.(tr('已添加薪资记录', 'Salary record added'));
      }
      if (f.id === 'hr-event') { await ctx.api.post(`/hr/people/${id}/events`, { kind:v.kind, happenedOn:v.happenedOn, note:String(v.note || '').trim() }); ctx.toast?.(tr('已添加', 'Added')); }
      busy = false; await refresh();
    } catch (x) { if (err) err.textContent = x.status === 409 ? tr('这份档案刚被别人改过，请关闭后重新打开再改。', 'Someone else changed this record; close and reopen it.') : x.message || tr('保存失败', 'Could not save'); }
    finally { busy = false; }
  });

  window.WorkOSHr = { configure, reset, render };
})();
