'use strict';

(() => {
  if (window.WORKOS_CONFIG?.mode !== 'live') return;
  const i18n = window.WorkI18n;
  const tr = (zh, en) => i18n.lang === 'en' ? en : zh;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  // What people write (tasks, OKRs, submissions, reviews) is shown in the interface language (translate.js); edit boxes keep the original.
  const tx = value => window.WorkOSTranslate ? window.WorkOSTranslate.html(value) : esc(value), txt = value => window.WorkOSTranslate ? window.WorkOSTranslate.text(value) : String(value ?? '');
  const state = { executive: null, actor: null, capabilities: {}, tasks: [], objectives: [], krs: [], appraisals: {}, directory: [], audit: [], details: new Map(), page: 'overview', okrOwner: null, loading: true, error: '', search: '', status: '', board: false, menu: false };
  let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  let api, openTaskId = null, overlayGeneration = 0, lastFocus = null, notificationKey = null, busy = false, drawerController = null, analysisWatch = null;
  const paths = { key:'<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',shield:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>', tree:'<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/>', calc:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>', truck:'<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>', chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', box:'<path d="m21 8-9-5-9 5v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>', user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>', folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>', home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>', task:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 9 2 2 3-4M8 16h8"/>', target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', review:'<path d="M9 3H4v18h16v-9M8 16h8M8 12h3"/><path d="m13 5 3 3 5-5"/>', team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>', plug:'<path d="m7 8 9 9M13 2l-3 3M22 11l-3 3M3 21l6-6M7 7l3-3 10 10-3 3a7 7 0 0 1-10-10"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', moon:'<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>', plus:'<path d="M12 4v16M4 12h16"/>',edit:'<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>', refresh:'<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7"/>', arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', file:'<path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>', bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4"/>', shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', logout:'<path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h12"/>', check:'<path d="m5 12 4 4L19 6"/>' };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
  const button = (text, action, style = '', ico = '') => `<button type="button" class="btn ${style}" data-live-action="${action}">${ico ? icon(ico) : ''}${text}</button>`;
  const manager = () => state.actor?.role === 'manager';
  const displayName = id => state.directory.find(user => user.id === id)?.display_name || (state.actor?.id === id ? state.actor.display_name : id || '—');
  const date = value => value ? new Intl.DateTimeFormat(i18n.lang === 'en' ? 'en-GB' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const safeEvidenceUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; } };
  const labels = { planned: ['已分派', 'Assigned', ''], doing: ['进行中', 'In progress', 'blue'], blocked: ['有阻塞', 'Blocked', 'red'], submitted: ['待验收', 'Awaiting review', 'amber'], accepted: ['已验收', 'Accepted', 'green'], revision: ['待补充', 'Needs more evidence', 'amber'] };
  const statusLabel = status => { const item = labels[status]; return item ? tr(item[0], item[1]) : status; };
  const badge = status => `<span class="badge ${labels[status]?.[2] || ''}"><span class="dot"></span>${esc(statusLabel(status))}</span>`;
  const navs = [
    ['overview','home','个人工作台','Work Center','work'],['okr','target','OKR 目标','OKRs','work'],['projects','folder','项目管理','Projects','work'],['tasks','task','个人任务','My tasks','work'],
    ['okr-analysis','target','OKR 分析','OKR analysis','reports'],['project-analysis','chart','项目分析','Project analysis','reports'],['team','team','任务分析','Task analysis','reports'],
    ['support','review','客服工作台','Support workspace','labs'],['knowledge','file','知识中心 / Wiki','Knowledge center / Wiki','labs'],['quality','shield','产品质量追踪','Quality tracking','labs'],['executive','home','老板看板','Executive overview','hidden'],
    ['products','box','产品 PIM','Product PIM','product'],['wms','truck','WMS','WMS','product'],['erp-access','shield','ERP 权限','ERP permissions','product'],['product-cost','calc','定价','Pricing','hidden'],['supply-chain','truck','智能供应链','Smart supply chain','hidden'],
    ['kol','team','KOL 管理','KOL management','marketing'],
    ['integrations','plug','集成与通知','Integrations & notifications','hidden'],['settings','user','个人设置','Personal settings','other'],['orgchart','tree','组织架构','Org chart','other'],['hr','user','人事档案','HR records','other'],['it','key','IT 账号与订阅','IT accounts','other'],['org','team','组织与权限','Organization & permissions','other'],['feedback','review','Bug 与建议','Bug & ideas','other'],['changelog','refresh','版本更新','Release notes','other'],
    ['reviews','review','成果验收','Deliverable review','hidden'],['performance','team','绩效参考','Performance insights','hidden']];
  const navSections = [['work','工作区','Workspace'],['reports','报表区','Reports'],['product','产品+供应链','Product & supply chain'],['marketing','营销','Marketing'],['labs','产品开发测试区','Labs (testing)'],['other','其他','Other']];
  const navClosed = () => { try { return JSON.parse(localStorage.getItem('workos-nav-closed') || '[]'); } catch { return []; } };
  document.addEventListener('click', e => { const b = e.target.closest?.('[data-nav-toggle]'); if (!b) return; e.preventDefault(); const sec = b.dataset.navToggle, list = navClosed(), next = list.includes(sec) ? list.filter(x => x !== sec) : [...list, sec]; try { localStorage.setItem('workos-nav-closed', JSON.stringify(next)); } catch {} b.closest('.nav-group')?.classList.toggle('closed', next.includes(sec)); b.setAttribute('aria-expanded', String(!next.includes(sec))); b.querySelector('.nav-sec-caret').textContent = next.includes(sec) ? '▸' : '▾'; });
  const erpAdmin = () => !!window.WorkOSErpAccess && state.capabilities?.erpAccess === true && (state.actor?.executiveAccess === true || state.actor?.role === 'manager');
  const wmsAccess = () => !!window.WorkOSWms && state.capabilities?.wms === true && ((state.actor?.grants||[]).some(g => g === 'products' || g === 'warehouse') || state.actor?.role === 'manager' || state.actor?.executiveAccess === true);
  const kolAccess = () => !!window.WorkOSKol && state.capabilities?.kol === true && ((state.actor?.grants||[]).includes('kol') || state.actor?.isAdmin === true);
  const dealersAccess = () => !!window.WorkOSDealers && state.capabilities?.dealerPortal === true && ((state.actor?.grants||[]).includes('dealers') || state.actor?.executiveAccess === true);
  const productAccess = () => !!window.WorkOSProducts && ((state.actor?.grants||[]).includes('products') || state.actor?.executiveAccess === true);
  // The product library's 全员 fields are open to every employee; costs, suppliers and files stay behind grants on the server.
  const libraryAccess = () => productAccess() || (!!window.WorkOSProductLibrary && state.capabilities?.productLibrary === true);
  const factoryOnly = () => !!state.actor?.qualityFactory;
  const navVisible = id => factoryOnly() ? id === 'quality' : ({ quality:!!window.WorkOSQuality, 'okr-analysis':!!window.WorkOSReports, projects:!!window.WorkOSProjects, 'project-analysis':!!window.WorkOSProjects, team:!!window.WorkOSPeople, settings:!!window.WorkOSPeople, orgchart:!!window.WorkOSPeople?.chart && state.capabilities?.orgProfiles===true, hr:!!window.WorkOSHr && state.capabilities?.hr===true,it:!!window.WorkOSIt && state.capabilities?.itAssets===true,executive:!!state.actor?.executiveAccess, support:!!state.actor?.supportAccess?.read, products:libraryAccess()||productAccess()||dealersAccess(), 'product-cost':productAccess(), 'supply-chain':productAccess(), wms:wmsAccess()||productAccess(), 'erp-access':erpAdmin(), kol:kolAccess(), org:!!window.WorkOSPeople && state.actor?.isAdmin===true, feedback:!!window.WorkOSFeedback && state.capabilities?.feedback===true && state.actor?.isAdmin===true, changelog:!!window.WorkOSChangelog }[id] ?? true);
  const publicKnowledgeRoute = () => /^#knowledge(?:\/(?:search|downloads|family\/[a-z0-9-]+|article\/en-\d+)?)?(?:\?|$)/.test(window.location.hash||'');
  function routePage() {
    const candidate=(window.location.hash||'').replace(/^#/, '').split(/[/?]/)[0];
    return navs.some(item=>item[0]===candidate)?candidate:null;
  }
  state.page=routePage()||state.page;
  function applyRoute() {
    const page=routePage()||'overview';
    if(factoryOnly()&&page!=='quality')window.history.replaceState(null,'','#quality');
    state.page=factoryOnly()?'quality':page==='executive'&&!state.actor?.executiveAccess?'overview':page;
    if(state.page==='support'&&state.actor&&!state.actor.supportAccess?.read)state.page='overview';
    if(state.page!=='tasks'&&window.WorkOSTaskBoard?.viewing?.()&&!window.WorkOSTaskBoard.viewing.leaving)window.WorkOSTaskBoard.viewAs('');
    state.menu=false;closeOverlay();render();
    if(state.page==='knowledge')window.WorkOSWiki?.ensureLoaded();
  }
  window.addEventListener?.('hashchange',applyRoute);
  const levelLabel = value => ({company:tr('公司目标','Company objective'),department:tr('部门目标','Department objective'),personal:tr('个人目标','Individual objective')}[value] || value);
  const configured = value => value === true || ['configured','ready','enabled','connected'].includes(value);
  const botMode = () => state.capabilities.aiReviewMode === 'bot';
  const activeJobStates = new Set(['dispatching','pending','leased','queued','dispatched','running']);
  const retryJobStates = new Set(['failed','dispatch_unknown','expired']);
  const jobVersion = job => Number(job.submissionVersion);
  const currentJob = task => task.analysisJobs?.find(job => jobVersion(job) === Number(task.submission_version));
  const field = (name, label, input, full = false) => `<label class="field ${full ? 'full' : ''}"><span>${label}</span>${input}</label>`;
  const empty = text => `<div class="empty">${icon('file')}<p>${text}</p></div>`;
  function brand(label='Work OS') { return `<div class="brand official-brand"><img class="brand-wordmark" src="./assets/onelaser-logo-${theme === 'dark' ? 'white' : 'black'}.svg" alt="OneLaser" width="2350" height="535"><small>${label}</small></div>`; }
  function controls() { return `<div class="display-controls"><div class="language-switch" role="group" aria-label="${tr('界面语言','Interface language')}"><button data-live-lang="zh" lang="zh-CN" aria-label="中文" aria-pressed="${i18n.lang === 'zh'}" class="${i18n.lang === 'zh' ? 'active' : ''}">中</button><span aria-hidden="true">/</span><button data-live-lang="en" lang="en" aria-label="English" aria-pressed="${i18n.lang === 'en'}" class="${i18n.lang === 'en' ? 'active' : ''}">EN</button></div><button type="button" class="theme-toggle" data-live-action="theme" aria-label="${theme === 'dark' ? tr('切换到日间主题','Switch to light theme') : tr('切换到夜间主题','Switch to dark theme')}">${icon(theme === 'dark' ? 'sun' : 'moon')}</button></div>`; }
  function updateShellChrome() {
    if(!document.querySelector('.app-shell'))return false;
    document.querySelector('.app-shell').classList.toggle('menu-open',state.menu);
    document.querySelector('.brand-wordmark').setAttribute('src',`./assets/onelaser-logo-${theme==='dark'?'white':'black'}.svg`);
    const toggle=document.querySelector('[data-live-action="theme"]');
    toggle.innerHTML=icon(theme==='dark'?'sun':'moon');
    toggle.setAttribute('aria-label',theme==='dark'?tr('切换到日间主题','Switch to light theme'):tr('切换到夜间主题','Switch to dark theme'));
    return true;
  }
  function heading(title, description, actions = '') { return `<div class="page-heading"><div><div class="eyebrow">WORK OS · ${tr('企业工作空间','COMPANY WORKSPACE')}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`; }
  function notice(text, style = '') { return `<div class="notice ${style}">${icon('shield')}<span>${text}</span></div>`; }
  function toast(text) { const target = document.getElementById('toast'); target.textContent = text; target.classList.add('show'); setTimeout(() => target.classList.remove('show'), 4000); }
  function explainError(error) { if (error?.code?.startsWith('BOT_')) return jobError(error.code); if (error?.code === 'VERSION_CONFLICT') return tr('记录刚被别人更新过，已为你刷新到最新版本。你填写的内容已保留，请核对后再点一次。','Someone just updated this record, so it was refreshed to the latest version. What you entered is kept; check it and confirm again.'); if (error?.code === 'AI_ASSESSMENT_REQUIRED') return tr('Bot 还没有完成对当前成果的证据评估，暂时不能验收通过。请等评估完成；如果评估已过期，点“刷新评估”后重新请求。你也可以先“退回补充”。','The Bot has not finished assessing the current evidence, so it cannot be accepted yet. Wait for the assessment; if it expired, refresh and request it again. You can still request more evidence.'); if (error?.code === 'AI_EVIDENCE_INSUFFICIENT') return tr('Bot 评估认为当前证据不足，暂时不能验收通过。请“退回补充”，让负责人补充证据。','The Bot assessment found the evidence insufficient, so it cannot be accepted yet. Request more evidence from the owner.'); if (error?.status === 409) return error?.message || tr('记录状态已变化，请刷新后重试。','The record changed. Refresh and try again.'); return error?.message || tr('请求未完成，请稍后重试。','The request could not be completed. Try again later.'); }
  function clearPrivateData() { const hadActor=!!state.actor; window.CompanySupport?.reset(); window.WorkOSTaskBoard?.reset(); window.WorkOSOkrBoard?.reset(); window.WorkOSWms?.reset(); window.WorkOSRma?.reset(); window.WorkOSDealers?.reset(); window.WorkOSHr?.reset(); window.WorkOSIt?.reset(); window.WorkOSQuality?.reset(); window.WorkOSKol?.reset(); window.WorkOSInbox?.reset(); window.WorkOSErpAccess?.reset(); window.WorkOSInsights?.reset(); if(hadActor)window.WikiAssistant?.reset(); state.actor = null; state.executive = null; state.tasks = []; state.objectives = []; state.okrOwner = null; state.krs = []; state.appraisals = {}; state.directory = []; state.audit = []; state.details.clear(); openTaskId = null; api?.clearSession(); closeOverlay(); }
  function handleAuthError(error) { if (error?.status === 401) { clearPrivateData(); state.error = tr('登录已过期，请重新使用钉钉登录。','Your session expired. Sign in with DingTalk again.'); render(); return true; } return false; }
  // While sign-in and data are still loading, show the shape of the Work Center (not the sign-in / culture page).
  function renderBootSkeleton() {
    const bar = (w, h = 12) => `<span class="sk" style="width:${w};height:${h}px"></span>`;
    const card = lines => `<div class="sk-card">${bar('38%', 14)}${Array.from({ length:lines }, (_, i) => bar(`${92 - i * 11}%`)).join('')}</div>`;
    return `<div class="app-shell boot-skeleton" aria-busy="true"><aside class="sidebar">${brand()}<div class="sk-nav">${['62%','78%','70%','58%','74%','66%','60%'].map(w => `<div class="sk-nav-row">${bar('16px', 16)}${bar(w)}</div>`).join('')}</div></aside>
      <div class="main-frame"><header class="topbar">${bar('160px')}<span class="sk-top">${bar('64px', 30)}${bar('92px', 30)}</span></header>
      <main class="content"><p class="sr-only" role="status">${tr('正在加载工作台…','Loading your Work Center…')}</p>
        <section class="sk-hero"><div class="sk-hero-text">${bar('150px')}${bar('260px', 30)}${bar('320px')}<span class="sk-row">${bar('150px', 36)}${bar('120px', 36)}${bar('128px', 36)}</span></div><div class="sk-rings">${'<span class="sk-ring-box"><span class="sk sk-ring"></span>' + bar('70%') + '</span>'.repeat(1)}${'<span class="sk-ring-box"><span class="sk sk-ring"></span>' + bar('70%') + '</span>'}${'<span class="sk-ring-box"><span class="sk sk-ring"></span>' + bar('70%') + '</span>'}</div></section>
        <div class="sk-card sk-analysis">${bar('190px', 22)}${bar('62%')}${bar('54%')}${bar('48%')}</div>
        ${bar('220px', 16)}<div class="sk-tiles">${Array.from({ length:4 }, () => `<div class="sk-card sk-tile">${bar('52%', 14)}${bar('70%')}${bar('60%')}</div>`).join('')}</div>
        ${bar('120px', 16)}<div class="sk-tiles sk-five">${Array.from({ length:5 }, () => `<div class="sk-card sk-tile">${bar('50%')}${bar('24px', 30)}${bar('70%')}</div>`).join('')}</div>
      </main></div></div>`;
  }
  function renderLogin() {
    const ready = state.capabilities.auth?.loginEnabled ?? configured(state.capabilities.dingtalk);
    const products = [['x-series','X Series'],['hydra-series','Hydra'],['cobra','Cobra'],['vertigo','VertiGo']];
    const cultureUrl = '/culture.html' + (i18n.lang === 'en' ? '#en' : '#zh');
    const decode = [['MAKE','用行动和速度创造结果','Create results through action and speed'],['BETTER','每天进步，坚持最高标准','Improve every day, hold the highest standard'],['WITH ONE','与客户同行，与团队一体','Walk with customers, work as one team']];
    const values = [
      ['01','每天进步一点','Learn & Get Better Every Day','公司成长的速度，取决于每个人成长的速度。','OneLaser can only grow as fast as our people grow.'],
      ['02','以客户为尊','The Customer Is Our Teacher','客户是我们的老师。从客户出发，倒推我们的工作。','Start with the customer and work backwards.'],
      ['03','创新来自行动与速度','Innovation = Action + Speed','创新是做出来的，不是想出来的。','Innovation is built, not imagined.'],
      ['04','坚持最高标准','Hold the Highest Standard','没完成就是没完成，不提前庆祝。','It’s not done until it’s done.']
    ];
    const signIn = state.loading
      ? `<p role="status" class="login-status">${tr('正在连接服务…','Connecting to the service…')}</p>`
      : `<button class="btn primary login-dingtalk" data-live-action="login" ${ready ? '' : 'disabled'}>${tr('使用钉钉登录','Sign in with DingTalk')} ${icon('arrow')}</button>${ready ? '' : `<p class="fine login-note">${tr('钉钉登录尚未配置，请联系企业管理员完成应用授权。','DingTalk sign-in is not configured yet. Ask your organization administrator to authorize the application.')}</p>${button(tr('重新检查','Check again'),'refresh','','refresh')}`}${emailLogin()}`;
    return `<div class="gateway login-v2">
      <header class="gateway-header">${brand()}${controls()}</header>
      <main class="login-stage">
        <section class="login-story">
          <div class="gateway-label">${tr('OneLaser 企业文化','OneLaser Culture')}</div>
          <h1 class="login-headline">Make Better<br><span>With One</span></h1>
          <p class="login-lead">${tr('一家好企业，每天都在变得更好：产品更好，人更好，服务客户的方式更好。无论身在全球哪个地方，我们都是 One Team。','A great company gets better every day: better products, better people, better ways to serve our customers. Wherever we are in the world, we are One Team.')}</p>
          <div class="login-decode">${decode.map(([w,zh,en]) => `<div><b>${w}</b><span>${tr(zh,en)}</span></div>`).join('')}</div>
          <div class="login-showcase" aria-label="${tr('OneLaser 产品','OneLaser products')}">
            <div class="login-showcase-stage">${products.map(([file,name],i) => `<figure class="login-slide" style="--i:${i}"><img src="./assets/login/${file}.jpg" alt="OneLaser ${name}" loading="${i ? 'lazy' : 'eager'}" width="800" height="600"><figcaption>${name}</figcaption></figure>`).join('')}</div>
            <div class="login-showcase-copy"><div class="login-kicker">${tr('开箱就能出好结果','Great results out of the box')}</div><p>${tr('这就是对客户最大的尊重。参数真实可复现，绝不虚标，承诺的一定做到。','The highest form of respect for a customer. Real, reproducible specs, no inflated claims, and we deliver what we promise.')}</p><div class="login-models">${products.map(([,name],i) => `<span style="--i:${i}">${name}</span>`).join('')}</div></div>
          </div>
          <div class="login-values-head"><h2>${tr('四大核心价值观','Our Four Core Values')}</h2><a class="login-culture-link" href="${cultureUrl}" target="_blank" rel="noopener">${tr('阅读完整企业文化','Read the full culture')} ${icon('arrow')}</a></div>
          <div class="login-values">${values.map(([n,zh,en,czh,cen]) => `<article class="login-value"><div class="login-value-num">${n}</div><div><h3>${tr(zh,en)}</h3><p>${tr(czh,cen)}</p></div></article>`).join('')}</div>
        </section>
        <aside class="login-card panel">
          <div class="login-card-top"><div class="login-kicker">${tr('欢迎回来','Welcome back')}</div><h2>${tr('今天，比昨天更好一点。','Get a little better than yesterday.')}</h2><p class="fine">${tr('钉钉成员直接用钉钉登录，无需另设密码；不在钉钉里的受邀成员请在下方用邮箱登录。','DingTalk members sign in with DingTalk, no password needed; invited members outside DingTalk use email below.')}</p></div>
          ${signIn}${state.error ? `<p class="form-error" role="alert">${esc(state.error)}</p>` : ''}
          <div class="login-done"><div class="login-done-q">${tr('什么才算“完成”？','What does “Done” mean?')}</div><div class="login-formula"><span>${tr('交付','Delivered')}</span><i>+</i><span>${tr('确认','Confirmed')}</span><i>+</i><span>${tr('复盘','Reviewed')}</span><i>=</i><span class="result">Done</span></div><p>${tr('“我已经发出去了”不等于完成。','“I sent it” is not done.')}</p></div>
          <a class="login-culture-card" href="${cultureUrl}" target="_blank" rel="noopener"><span><b>${tr('OneLaser 企业文化','OneLaser Culture')}</b><small>Make Better With One</small></span>${icon('arrow')}</a>
        </aside>
      </main>
      <footer class="gateway-footer"><span>${tr('当没有人看着的时候，你怎么做，就是 OneLaser 的文化。','What you do when no one is watching is OneLaser’s culture.')}</span><span>OneLaser · Lake Forest · ${tr('东莞 · 济南 · 武汉','Dongguan · Jinan · Wuhan')}</span></footer>
    </div>`;
  }
  function publicKnowledge(){return `<section class="company-knowledge"><div class="page-heading"><div><div class="eyebrow">ONELASER · KNOWLEDGE CENTER</div><h1>${tr('知识中心 / Wiki','Knowledge center / Wiki')}</h1><p>${tr('产品指南、问题排查与下载资源。','Product guides, troubleshooting and downloads.')}</p></div></div>${window.WorkOSWiki?.render()||''}</section>`;}
  /* ---- email sign-in (invited members outside DingTalk) and invite acceptance ---- */
  const loginUi={mode:'password',codeSent:false,email:'',busy:false,error:''};
  const inviteUi={token:'',data:null,error:'',busy:false};
  const inviteRoute=()=>/^#invite\/([A-Za-z0-9_-]{43})$/.exec(window.location.hash||'')?.[1]||'';
  async function publicCall(method,path,body){
    const r=await fetch((window.WORKOS_CONFIG.apiBase||'/api')+path,{method,credentials:'same-origin',headers:{'content-type':'application/json','accept-language':i18n.lang==='en'?'en':'zh-CN'},body:body?JSON.stringify(body):undefined});
    const j=await r.json().catch(()=>null);
    if(!r.ok)throw Object.assign(new Error(j?.error?.message||tr('请求失败，请稍后再试','Request failed, try again later')),{status:r.status,code:j?.error?.code});
    return j;
  }
  function emailLogin(){
    if(!state.capabilities?.passwordLogin)return '';
    const code=state.capabilities.emailCodeLogin===true,mode=code?loginUi.mode:'password',e=esc(loginUi.email);
    const tabs=code?`<div class="email-login-tabs" role="tablist"><button type="button" class="${mode==='password'?'active':''}" data-live-login-mode="password">${tr('密码登录','Password')}</button><button type="button" class="${mode==='code'?'active':''}" data-live-login-mode="code">${tr('邮箱验证码','Email code')}</button></div>`:'';
    const form=mode==='password'
      ?`<form id="live-pw-login" class="email-login-form"><input name="email" type="email" autocomplete="username" required placeholder="${tr('邮箱','Email')}" value="${e}"><input name="password" type="password" autocomplete="current-password" required placeholder="${tr('密码','Password')}"><button class="btn" type="submit" ${loginUi.busy?'disabled':''}>${tr('登录','Sign in')}</button></form>`
      :loginUi.codeSent
        ?`<form id="live-code-verify" class="email-login-form"><p class="fine">${tr(`验证码已发送到 ${e}，10 分钟内有效。`,`A code was sent to ${e}; valid 10 minutes.`)}</p><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="${tr('6 位验证码','6-digit code')}"><button class="btn" type="submit" ${loginUi.busy?'disabled':''}>${tr('登录','Sign in')}</button><button type="button" class="link-btn" data-live-login-mode="code">${tr('重新发送','Send again')}</button></form>`
        :`<form id="live-code-request" class="email-login-form"><input name="email" type="email" autocomplete="username" required placeholder="${tr('邮箱','Email')}" value="${e}"><button class="btn" type="submit" ${loginUi.busy?'disabled':''}>${tr('发送验证码','Send code')}</button></form>`;
    return `<div class="email-login"><div class="email-login-sep"><span>${tr('受邀成员 · 邮箱登录','Invited members · email sign-in')}</span></div>${tabs}${form}${loginUi.error?`<p class="form-error" role="alert">${esc(loginUi.error)}</p>`:''}</div>`;
  }
  function renderInvite(token){
    if(inviteUi.token!==token){inviteUi.token=token;inviteUi.data=null;inviteUi.error='';publicCall('GET','/auth/invite/'+token).then(d=>{inviteUi.data=d;render();}).catch(err=>{inviteUi.error=err.message;render();});}
    const d=inviteUi.data;
    const body=inviteUi.error&&!d?`<h2>${tr('邀请链接无效','Invite link unavailable')}</h2><p class="fine">${esc(inviteUi.error)}</p><p class="fine">${tr('请联系邀请您的管理员重新发送。','Ask the administrator who invited you for a new link.')}</p>`
      :!d?`<p role="status">${tr('正在读取邀请…','Loading invite…')}</p>`
      :`<h2>${tr(`${esc(d.invitedBy||'管理员')} 邀请您加入 ${esc(d.team)} WorkOS`,`${esc(d.invitedBy||'An administrator')} invited you to ${esc(d.team)} WorkOS`)}</h2>
        <p class="fine" style="margin:8px 0 18px">${tr('设置密码后即可登录。以后请用这个邮箱和密码登录。','Set a password to join. Afterwards sign in with this email and password.')}</p>
        <form id="live-invite-accept" class="email-login-form invite-form">
          <label>${tr('姓名','Name')}<input name="displayName" maxlength="80" required value="${esc(d.displayName)}"></label>
          <label>${tr('登录邮箱','Sign-in email')}<input value="${esc(d.email)}" readonly></label>
          ${d.title?`<label>${tr('岗位','Title')}<input value="${esc(d.title)}" readonly></label>`:''}
          <label>${tr(`密码（至少 ${d.passwordMinLength} 位）`,`Password (at least ${d.passwordMinLength} characters)`)}<input name="password" type="password" autocomplete="new-password" minlength="${d.passwordMinLength}" required></label>
          <label>${tr('再输入一次','Confirm password')}<input name="confirm" type="password" autocomplete="new-password" minlength="${d.passwordMinLength}" required></label>
          <button class="btn primary" type="submit" ${inviteUi.busy?'disabled':''}>${tr('加入工作空间','Join workspace')} ${icon('arrow')}</button>
          ${inviteUi.error?`<p class="form-error" role="alert">${esc(inviteUi.error)}</p>`:''}
          <p class="fine">${tr(`链接有效期至 ${new Date(d.expiresAt).toLocaleDateString(i18n.lang==='en'?'en-US':'zh-CN')}，只能使用一次。`,`Valid until ${new Date(d.expiresAt).toLocaleDateString('en-US')}, single use.`)}</p>
        </form>`;
    return `<div class="gateway"><header class="gateway-header">${brand()}${controls()}</header><main class="gateway-main live-login"><div class="gateway-label">WELCOME</div><div class="live-login-panel panel invite-panel"><div class="panel-body">${body}</div></div></main></div>`;
  }
  async function afterEmailSignIn(){window.history.replaceState(null,'','/#overview');state.page='overview';loginUi.busy=false;loginUi.error='';loginUi.codeSent=false;await bootstrap();}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-live-login-mode]');if(!b)return;e.preventDefault();loginUi.mode=b.dataset.liveLoginMode;loginUi.codeSent=false;loginUi.error='';render();});
  document.addEventListener('submit',async e=>{
    const f=e.target,id=f?.id;if(!['live-pw-login','live-code-request','live-code-verify','live-invite-accept'].includes(id))return;
    e.preventDefault();const v=Object.fromEntries(new FormData(f));
    if(id==='live-invite-accept'){
      if(v.password!==v.confirm){inviteUi.error=tr('两次输入的密码不一致','Passwords do not match');return render();}
      inviteUi.busy=true;inviteUi.error='';render();
      try{await publicCall('POST','/auth/invite/'+inviteUi.token+'/accept',{password:v.password,displayName:String(v.displayName||'').trim()||undefined});inviteUi.token='';inviteUi.busy=false;toast(tr('欢迎加入！','Welcome aboard!'));await afterEmailSignIn();}
      catch(err){inviteUi.busy=false;inviteUi.error=err.message;render();}
      return;
    }
    loginUi.busy=true;loginUi.error='';if(v.email)loginUi.email=String(v.email).trim();render();
    try{
      if(id==='live-pw-login'){await publicCall('POST','/auth/password',{email:loginUi.email,password:v.password});return afterEmailSignIn();}
      if(id==='live-code-request'){await publicCall('POST','/auth/email-code',{email:loginUi.email});loginUi.codeSent=true;}
      if(id==='live-code-verify'){await publicCall('POST','/auth/email-code/verify',{email:loginUi.email,code:String(v.code||'').trim()});return afterEmailSignIn();}
    }catch(err){loginUi.error=err.status===429?tr('尝试次数过多，请 15 分钟后再试。','Too many attempts; try again in 15 minutes.'):err.message;}
    loginUi.busy=false;render();
  });
  function renderPublicKnowledge(){return `<div class="app-shell public-wiki-shell ${state.menu?'menu-open':''}"><aside class="sidebar">${brand('Support Center')}<div class="nav-label">ONELASER SUPPORT</div><nav aria-label="${tr('知识中心导航','Knowledge navigation')}">${[['#knowledge/','file','知识中心 / Wiki','Knowledge center / Wiki'],['#knowledge/search','search','全部指南','All guides'],['#knowledge/downloads','file','下载中心','Downloads']].map(([href,ico,zh,en])=>`<a class="nav-item ${href==='#knowledge/'&&!/^#knowledge\/(search|downloads)(?:[?]|$)/.test(window.location.hash||'')||href!=='#knowledge/'&&(window.location.hash||'').split('?')[0]===href?'active':''}" href="${href}">${icon(ico)}<span>${tr(zh,en)}</span></a>`).join('')}<button class="nav-item" data-wiki-assistant-open>${icon('review')}<span>${tr('询问 OneLaser','Ask OneLaser')}</span></button><a class="nav-item" href="https://www.1laser.com/pages/contact-us" target="_blank" rel="noopener noreferrer">${icon('team')}<span>${tr('联系支持','Contact support')}</span></a></nav><div class="sidebar-bottom"><button class="nav-item" data-live-action="login">${icon('logout')}<span>${tr('员工登录','Employee sign in')}</span></button></div></aside><div class="main-frame"><header class="topbar"><div class="breadcrumb"><button class="mobile-menu" data-live-action="menu" aria-label="${tr('打开导航','Open navigation')}">${icon('menu')}</button><span>OneLaser</span><strong>${tr('知识中心 / Wiki','Knowledge center / Wiki')}</strong></div><div class="topbar-right">${controls()}</div></header><main class="content" id="live-content">${publicKnowledge()}</main></div></div>`;}
  /* Resizable sidebar: drag its right edge; the width is remembered on this device. */
  const SIDEBAR_KEY='onelaser-workos-sidebar-w';
  const setSidebarWidth=w=>{const v=Math.max(200,Math.min(380,Math.round(w)));document.documentElement.style.setProperty('--sidebar-w',v+'px');return v;};
  try{const saved=Number(localStorage.getItem(SIDEBAR_KEY));if(saved)setSidebarWidth(saved);}catch{}
  document.addEventListener('pointerdown',e=>{const h=e.target.closest?.('[data-sidebar-resize]');if(!h)return;e.preventDefault();h.setPointerCapture?.(e.pointerId);document.body.classList.add('sidebar-resizing');let last=null;
    const move=ev=>{last=setSidebarWidth(ev.clientX);};
    const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.body.classList.remove('sidebar-resizing');if(last)try{localStorage.setItem(SIDEBAR_KEY,String(last));}catch{}};
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);});
  document.addEventListener('dblclick',e=>{if(!e.target.closest?.('[data-sidebar-resize]'))return;setSidebarWidth(240);try{localStorage.removeItem(SIDEBAR_KEY);}catch{}});
  function localizeNames() { const N = window.WorkOSNames; if (!N || !state.actor) return; N.apply([state.actor]); N.apply(state.directory); N.apply(state.reviewers); N.apply(state.former); }
  function render() {
    localizeNames();
    const publicView=!state.actor&&publicKnowledgeRoute(),wikiActive=state.page==='knowledge'&&!/^#knowledge\/archive(?:[/?]|$)/.test(window.location.hash||'')&&(!!state.actor||publicView);
    window.WorkOSWiki?.configure({language:i18n.lang,changed:render,active:wikiActive,canViewArchive:!!state.actor});
    if(state.actor)window.WorkOSTaskBoard?.configure({api,actor:state.actor,directory:state.directory,former:state.former||[],capabilities:state.capabilities,language:i18n.lang,toast,newTask,assignTask:state.capabilities?.assignTasks?assignTask:null,openTask,onTasksChanged:items=>{state.tasks=items;}});
    if(state.actor){const rc={api,state:()=>state,lang:()=>i18n.lang,rerender:render};window.WorkOSReports?.configure(rc);window.WorkOSInsights?.configure(rc);}
    if(state.actor)window.WorkOSPeople?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,explainError,openTask,newTask,integrations:()=>state.actor?.isAdmin===true?integrationBody():'',refreshMe:async()=>{state.actor={...state.actor,...await api.get('/me')};},reloadDirectory:async()=>{const d=await api.get('/directory');state.directory=d.items||[];state.reviewers=d.reviewers||[];state.former=d.former||[];if(!state.directory.some(u=>u.id===state.actor.id))state.directory.push(state.actor);},apiBase:window.WORKOS_CONFIG.apiBase||'/api'});
    if(state.actor)window.WorkOSInbox?.configure({api,state:()=>state,lang:()=>i18n.lang,openTask});
    if(state.actor)window.WorkOSProducts?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,overlay,closeOverlay,modal});
    if(state.actor)window.WorkOSFeedback?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast});window.WorkOSChangelog?.configure({lang:()=>i18n.lang,rerender:render});
    if(state.actor)window.WorkOSWms?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,closeOverlay,modal});
    if(state.actor)window.WorkOSRma?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,closeOverlay,modal});
    if(state.actor)window.WorkOSKol?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,closeOverlay,modal});
    if(state.actor)window.WorkOSDealers?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,closeOverlay,modal});
    if(state.actor)window.WorkOSHr?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,closeOverlay,modal});
    if(state.actor)window.WorkOSIt?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,closeOverlay,modal});
    if(state.actor)window.WorkOSErpAccess?.configure({api,lang:()=>i18n.lang,rerender:render,toast,supports:id=>id==='kol'?state.capabilities?.kol===true:id==='dealers'?state.capabilities?.dealerPortal===true:true});
    if(state.actor)window.WorkOSProjects?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,overlay,closeOverlay,modal});
    if(state.actor)window.WorkOSQuality?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,toast,overlay,closeOverlay,modal});
    if(state.actor)window.WorkOSTranslate?.configure({api,lang:()=>i18n.lang,capabilities:()=>state.capabilities,rerender:render});
    if(state.actor)window.WorkOSOkrBoard?.configure({api,state:()=>state,lang:()=>i18n.lang,rerender:render,refreshOkr,toast,explainError,overlay,closeOverlay,modal,openAppraisal,measurement,openObjectiveSource});
    if(state.actor)window.CompanySupport?.configure({api,actor:state.actor,language:i18n.lang,changed:render,showModal:modal,active:state.page==='knowledge',view:state.page});
    window.WikiAssistant?.configure({language:i18n.lang,active:wikiActive,apiBase:window.WORKOS_CONFIG.apiBase||'/api'});
    document.documentElement.lang = i18n.lang === 'en' ? 'en' : 'zh-CN';
    document.title = `${publicView?tr('知识中心 / Wiki','Knowledge center / Wiki'):state.actor ? tr(...(navs.find(item => item[0] === state.page)?.slice(2,4) || ['工作空间','Workspace'])) : tr('登录','Sign in')} · OneLaser`;
    if (state.actor && state.capabilities?.bilingualNames && window.WorkOSNames?.missing(state.actor) && !document.getElementById('live-names')) setTimeout(namePrompt, 0);
    else if (state.actor && state.capabilities?.notificationChannels && !String(state.actor.email || '').trim() && !document.getElementById('live-names') && !document.getElementById('live-email')) setTimeout(emailPrompt, 0);
    const invite=inviteRoute(); if (invite) { document.getElementById('app').innerHTML = renderInvite(invite); return; }
    if (!state.actor) { document.getElementById('app').innerHTML = publicView?renderPublicKnowledge():state.loading?renderBootSkeleton():renderLogin(); return; }
    const pending = state.tasks.filter(task => task.status === 'submitted').length;
    document.getElementById('app').innerHTML = `<div class="app-shell ${state.menu ? 'menu-open' : ''} ${state.page==='tasks'?'task-board-shell':''}"><aside class="sidebar"><div class="sidebar-resizer" data-sidebar-resize role="separator" aria-orientation="vertical" title="${tr('拖动调整侧边栏宽度，双击恢复','Drag to resize the sidebar; double-click to reset')}"></div>${brand()}<div class="workspace-switch"><span class="workspace-symbol">O</span><span>${tr('OneLaser 工作空间','OneLaser workspace')}</span></div><a class="culture-nav-link" href="/culture.html${i18n.lang==='en'?'#en':'#zh'}" target="_blank" rel="noopener"><b>Make Better With One</b><span>${tr('OneLaser 企业文化','OneLaser Culture')}</span>${icon('arrow')}</a><nav aria-label="${tr('主导航','Main navigation')}">${navSections.map(([sec,szh,sen])=>{const items=navs.filter(n=>n[4]===sec&&navVisible(n[0]));const closed=navClosed().includes(sec),hasActive=items.some(n=>n[0]===state.page);return items.length?`<div class="nav-group nav-group-${sec} ${closed&&!hasActive?'closed':''}"><button type="button" class="nav-label nav-section" data-nav-toggle="${sec}" aria-expanded="${!(closed&&!hasActive)}"><span class="nav-sec-dot"></span><span class="nav-sec-name">${tr(szh,sen)}</span><span class="nav-sec-count">${items.length}</span><span class="nav-sec-caret">${closed&&!hasActive?'▸':'▾'}</span></button><div class="nav-group-items">${items.map(([id,ico,zh,en]) => `<button class="nav-item ${state.page === id ? 'active' : ''}" data-live-page="${id}" ${state.page === id ? 'aria-current="page"' : ''}>${icon(ico)}<span>${tr(zh,en)}</span>${sec==='labs'?`<span class="nav-test">${tr('测试','Test')}</span>`:''}${id === 'overview' && pending ? `<span class="nav-count">${pending}</span>` : ''}</button>`).join('')}</div></div>`:'';}).join('')}</nav><div class="sidebar-bottom"><button class="identity identity-btn" data-live-page="settings" title="${tr('个人设置','Personal settings')}">${window.WorkOSPeople?window.WorkOSPeople.avatar(state.actor,34):`<span class="avatar">${esc(state.actor.display_name?.slice(0,2) || '?')}</span>`}<div><strong class="live-user-name">${esc(state.actor.display_name)}</strong><div class="hint">${esc(state.actor.title || (manager() ? tr('部门负责人','Department manager') : tr('员工','Employee')))}</div></div></button><button class="nav-item" data-live-action="logout">${icon('logout')}<span>${tr('退出登录','Sign out')}</span></button></div></aside><div class="main-frame"><header class="topbar"><div class="breadcrumb"><button class="mobile-menu" data-live-action="menu" aria-label="${tr('打开导航','Open navigation')}">${icon('menu')}</button><span>OneLaser workspace</span><strong>${tr(...navs.find(item => item[0] === state.page).slice(2,4))}</strong></div><div class="topbar-right">${controls()}${window.WorkOSInbox?window.WorkOSInbox.button():''}<button class="guide-btn" data-guide-open="${esc(state.page)}">${'<i class="ph ph-book-open-text" aria-hidden="true"></i>'}<span>${tr('使用说明','User guide')}</span></button>${state.capabilities?.feedback && window.WorkOSFeedback ? window.WorkOSFeedback.button() : ''}<span class="env">${tr('企业模式','Company mode')}</span><button class="icon-btn" data-live-action="refresh" aria-label="${tr('刷新数据','Refresh data')}">${icon('refresh')}</button></div></header><div class="demo-strip live-mode-strip">${icon('shield')}<span>${tr('服务端记录 · 按本人或部门授权 · AI 意见需负责人复核','Server records · authorized personal or department scope · AI findings require human review')}</span><span>${esc(state.actor.department_id)}</span></div><main class="content" id="live-content">${state.error ? `<div class="notice amber live-error" role="alert">${esc(state.error)}</div>` : ''}${state.loading ? `<p class="fine" role="status">${tr('正在刷新服务端数据…','Refreshing server records…')}</p>` : ''}${pageContent()}</main></div></div>`;
  }
  function noAccess(area) { return `<div class="no-access panel"><div class="panel-body"><div class="no-access-icon">${icon('shield')}</div><h2>${tr('没有访问权限','No access')}</h2><p class="fine">${tr(`“${esc(area)}”只对管理员授权的同事开放。如需使用，请联系公司管理员在“组织与权限”中为你开通。`,`${esc(area)} is available only to colleagues an administrator has granted. Ask an administrator to grant access in Organization & permissions.`)}</p><button class="btn" data-live-page="overview">${tr('返回个人工作台','Back to Work Center')}</button></div></div>`; }
  /* Two modules with tabs; each tab keeps its own access rule.
     产品 PIM: catalog, pricing (the former cost calculator) and dealer orders. WMS: stock, returns & repairs, smart supply chain. */
  const tabsPage = (key, label, tabs, force) => {
    if (force) state[key] = force;
    tabs = tabs.filter(Boolean);
    if (!tabs.length) return noAccess(label);
    const active = tabs.some(t => t[0] === state[key]) ? state[key] : tabs[0][0];
    return `<div class="ps-tabs" role="tablist" aria-label="${esc(label)}">${tabs.map(([id, ic, name]) => `<button role="tab" aria-selected="${id === active}" class="${id === active ? 'on' : ''}" data-live-ptab="${id}"><i class="ph ph-${ic}" aria-hidden="true"></i>${name}</button>`).join('')}</div>${tabs.find(t => t[0] === active)[3]()}`;
  };
  function productStockPage(force) {
    return tabsPage('productTab', tr('产品 PIM','Product PIM'), [libraryAccess() && ['catalog', 'package', tr('产品资料','Catalog'), () => window.WorkOSProducts.render('catalog')],
      productAccess() && ['pricing', 'currency-dollar', tr('定价','Pricing'), () => window.WorkOSProducts.render('cost')],
      dealersAccess() && ['dealers', 'storefront', tr('经销商订单','Dealer orders'), () => window.WorkOSDealers.render()]], force);
  }
  function wmsPage(force) {
    return tabsPage('wmsTab', 'WMS', [wmsAccess() && ['stock', 'warehouse', tr('库存','Stock'), () => window.WorkOSWms.render()],
      wmsAccess() && window.WorkOSRma && state.capabilities?.rma === true && ['rma', 'arrow-u-up-left', tr('退货维修','Returns & repairs'), () => window.WorkOSRma.render()],
      productAccess() && ['supply', 'truck', tr('智能供应链','Smart supply chain'), () => window.WorkOSProducts.render('supply')]], force);
  }
  function pageContent() { if (factoryOnly()) return window.WorkOSQuality?.render() || ''; return ({ executive: () => state.actor?.executiveAccess ? window.WorkOSExecutive.render(state.executive,i18n.lang)+(state.actor.supportAccess?.read?window.CompanySupport.summary():'') : overview(), support: () => state.actor.supportAccess?.read ? window.CompanySupport.support() : overview(), knowledge: () => window.CompanySupport.knowledge(), tasks: taskPage, overview: () => window.WorkOSReports ? window.WorkOSReports.home() : window.WorkOSPeople ? window.WorkOSPeople.workbench() : overview(), 'okr-analysis': () => window.WorkOSReports ? window.WorkOSReports.okr() : okrPage(), team: () => window.WorkOSPeople ? window.WorkOSPeople.team() : performancePage(), 'project-analysis': () => window.WorkOSProjects?.analysis ? window.WorkOSProjects.analysis() : overview(), products: () => productStockPage(), 'product-cost': () => productAccess() ? productStockPage('pricing') : noAccess(tr('产品+供应链','Product hub')), 'supply-chain': () => productAccess() ? wmsPage('supply') : noAccess(tr('产品+供应链','Product hub')), wms: () => wmsPage(), 'erp-access': () => erpAdmin() ? window.WorkOSErpAccess.render() : noAccess(tr('ERP 权限','ERP permissions')), kol: () => kolAccess() ? window.WorkOSKol.render() : noAccess(tr('KOL 管理','KOL management')), settings: () => window.WorkOSPeople ? window.WorkOSPeople.settings() : overview(), quality: () => window.WorkOSQuality ? window.WorkOSQuality.render() : overview(), orgchart: () => window.WorkOSPeople?.chart ? window.WorkOSPeople.chart() : overview(), hr: () => window.WorkOSHr && state.capabilities?.hr === true ? window.WorkOSHr.render() : overview(),it: () => window.WorkOSIt && state.capabilities?.itAssets === true ? window.WorkOSIt.render() : overview(),org: () => window.WorkOSPeople && state.actor.isAdmin ? window.WorkOSPeople.org() : noAccess(tr('组织与权限','Organization & permissions')), projects: () => window.WorkOSProjects ? window.WorkOSProjects.render() : overview(), feedback: () => window.WorkOSFeedback && state.actor.isAdmin ? window.WorkOSFeedback.page() : overview(), changelog: () => window.WorkOSChangelog ? window.WorkOSChangelog.page() : overview(), okr: okrPage, reviews: reviewPage, performance: performancePage, integrations: integrationPage }[state.page] || overview)(); }
  function stat(label, value, detail) { return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value num">${value}</div><div class="stat-note">${detail}</div></div>`; }
  function overview() {
    const waiting = state.tasks.filter(task => task.status === 'submitted'), accepted = state.tasks.filter(task => task.status === 'accepted');
    return `${heading(tr(`${esc(state.actor.display_name)}，你好。`,`Hello, ${esc(state.actor.display_name)}.`),tr('从明确计划开始，用可核对的成果推进工作。','Start with clear plans and move work forward with verifiable deliverables.'),button(tr('新建任务','New task'),'new-task','primary','plus'))}<div class="stats-grid">${stat(tr('当前任务','Visible tasks'),state.tasks.length,tr('当前授权范围内','In your authorized scope'))}${stat(tr('等待验收','Awaiting review'),waiting.length,tr('已有成果提交','Deliverables submitted'))}${stat(tr('已验收成果','Accepted deliverables'),accepted.length,tr('人工确认的记录','Confirmed by a human'))}${stat(tr('关键结果','Key results'),state.krs.length,tr('按真实指标记录','Measured business results'))}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>${tr('需要关注的任务','Tasks that need attention')}</h2><button class="btn small" data-live-page="tasks">${tr('全部任务','All tasks')}</button></div>${state.tasks.filter(task => task.status !== 'accepted').slice(0,5).map(task => `<button class="todo-row" data-live-task="${esc(task.id)}"><span class="todo-square">${icon('task')}</span><span class="todo-body"><h3>${tx(task.title)}</h3><span class="todo-meta">${esc(displayName(task.owner_id))} · ${date(task.due_at)}</span></span><span class="todo-end">${badge(task.status)}</span></button>`).join('') || empty(tr('当前没有待处理任务','No tasks need attention right now'))}</section><section class="panel"><div class="panel-head"><h2>${tr('目标与结果','Objectives & results')}</h2></div><div class="panel-body">${state.objectives.slice(0,3).map(objective => `<div class="live-objective-mini"><h3>${tx(objective.title)}</h3><p class="fine">${state.krs.filter(kr => kr.objective_id === objective.id).length} ${tr('个关键结果','key results')}</p></div>`).join('') || `<p class="fine">${tr('还没有目标。先创建目标与可核验的关键结果。','No objectives yet. Create an objective and measurable key results.')}</p>`}</div></section></div><div class="live-space-top">${notice(tr('任务提交、AI 分析与人工验收分别记录。任务完成不会自动增加业务 KR 的实际值。','Submissions, AI assessments and human decisions are separate records. Completing a task does not automatically change a business KR.'))}</div>`;
  }
  function filteredTasks() { const needle = state.search.trim().toLowerCase(); return state.tasks.filter(task => (!state.status || task.status === state.status) && (!needle || `${task.title} ${displayName(task.owner_id)}`.toLowerCase().includes(needle))); }
  function taskRows(tasks) { return tasks.map(task => `<tr tabindex="0" role="button" data-live-task="${esc(task.id)}" aria-label="${esc(tr('查看任务：','View task: ') + txt(task.title))}"><td><div class="task-name">${icon('task')}${tx(task.title)}</div><div class="task-sub">${tx(state.krs.find(kr => kr.id === task.kr_id)?.title || tr('未关联 KR','No linked KR'))}</div></td><td>${esc(displayName(task.owner_id))}</td><td>${badge(task.status)}</td><td>${date(task.due_at)}</td><td>v${Number(task.submission_version) || 0}</td></tr>`).join(''); }
  function taskPage() {
    if(window.WorkOSTaskBoard)return (!window.WorkOSTaskBoard.viewing?.()&&window.WorkOSProjects?.taskInbox?window.WorkOSProjects.taskInbox():'')+window.WorkOSTaskBoard.render();
    const tasks = filteredTasks();
    return `${heading(tr('个人任务','Task hub'),tr('明确交付与验收标准。所有修改由服务端校验并保存。','Define the deliverable and acceptance criteria. The server authorizes and saves every change.'),button(tr('新建任务','New task'),'new-task','primary','plus'))}<section class="panel"><div class="tabs-bar"><div class="tabs"><span class="tab active">${manager() ? tr('部门任务','Department tasks') : tr('我的任务','My tasks')}</span></div><div class="view-toggle"><button data-live-action="list" class="${state.board ? '' : 'active'}">${tr('列表','List')}</button><button data-live-action="board" class="${state.board ? 'active' : ''}">${tr('看板','Board')}</button></div></div><div class="filters"><label class="search">${icon('search')}<span class="sr-only">${tr('搜索任务或负责人','Search tasks or owners')}</span><input id="live-search" value="${esc(state.search)}" placeholder="${tr('搜索任务、负责人…','Search tasks or owners…')}"></label><label><span class="sr-only">${tr('状态筛选','Filter status')}</span><select id="live-status"><option value="">${tr('全部状态','All statuses')}</option>${Object.keys(labels).map(status => `<option value="${status}" ${state.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}</select></label><span class="filter-total">${tasks.length} ${tr('项','tasks')}</span></div><div id="live-task-results">${state.board ? board(tasks) : `<div class="table-wrap"><table class="task-table live-task-table"><thead><tr><th>${tr('任务 / 关键结果','Task / key result')}</th><th>${tr('负责人','Owner')}</th><th>${tr('状态','Status')}</th><th>${tr('截止时间','Due date')}</th><th>${tr('成果版本','Submission')}</th></tr></thead><tbody>${taskRows(tasks)}</tbody></table></div>${tasks.length ? '' : empty(tr('没有匹配的任务','No matching tasks'))}`}</div><div class="table-footer">${tr('服务端当前最多返回 100 条任务，记录范围按你的身份授权。','The server currently returns up to 100 tasks, scoped to your authorized identity.')}</div></section>`;
  }
  function board(tasks) { return `<div class="kanban">${[['planned','doing'],['blocked'],['submitted','revision'],['accepted']].map((statuses,index) => `<div class="kanban-col"><div class="kanban-title"><strong>${[tr('计划与执行','Plan & execution'),tr('等待协调','Needs coordination'),tr('成果待验收','Awaiting review'),tr('已验收','Accepted')][index]}</strong><small>${tasks.filter(task => statuses.includes(task.status)).length}</small></div>${tasks.filter(task => statuses.includes(task.status)).map(task => `<button class="kanban-card" data-live-task="${esc(task.id)}">${badge(task.status)}<h3>${tx(task.title)}</h3><div class="kanban-meta"><span>${esc(displayName(task.owner_id))}</span><span>${date(task.due_at)}</span></div></button>`).join('')}</div>`).join('')}</div>`; }
  function canEditObjective(objective) { return objective.level !== 'company' && (manager() || objective.owner_id === state.actor.id); }
  function okrPage() {
    if(window.WorkOSOkrBoard)return window.WorkOSOkrBoard.render();
    const O=window.WorkOSOkr;
    const owners=[...new Set(state.objectives.map(o=>o.owner_id))].sort((a,b)=>displayName(a).localeCompare(displayName(b)));
    if(state.okrOwner!=='*'&&!owners.includes(state.okrOwner))state.okrOwner=owners.includes(state.actor.id)?state.actor.id:owners[0]||null;
    const visible=state.okrOwner==='*'?owners:owners.filter(id=>id===state.okrOwner);
    return `${heading(tr('OKR 目标','Objectives & key results'),tr('沿用月度权重、成果、自评与主管评价；业务进度单独记录。','Monthly weights, deliverables, self evaluations and manager reviews. Business progress remains separate.'),button(tr('创建目标','New objective'),'new-objective','primary','plus'))}
    <details class="panel okr-fields-help"><summary>${tr('评分标准与字段说明','Scoring rubric & fields')}</summary>${O.rubric(i18n.lang)}<p>${tr('完成为 80 分，卓越完成为 100 分。KR 权重使用周期占比，例如目标 50%，其 KR 为 30% 和 20%。空缺显示未评分。','Complete is 80; exceptional is 100. KR weights are period shares: a 50% objective may have 30% and 20% KRs. Missing scores remain unscored.')}</p><p>${tr('旧表综合公式尚未核实。新版加权贡献以人工核定为准，不自动混合自评，不重复累计父目标。任务详情中保留 AI 检查与人工验收依据。','The legacy formula is unverified. New weighted contributions use human confirmation, without blending self scores or double-counting parent objectives. Task details retain AI findings and human acceptance evidence.')}</p></details>
    ${owners.length?`<div class="okr-person-filter"><label for="live-okr-owner">${tr('按员工查看','View by employee')}</label><select id="live-okr-owner">${owners.map(id=>`<option value="${esc(id)}" ${state.okrOwner===id?'selected':''}>${esc(displayName(id))}</option>`).join('')}<option value="*" ${state.okrOwner==='*'?'selected':''}>${tr('全部员工（按人分组）','All employees (grouped)')}</option></select><span class="fine">${owners.length} ${tr('位员工','employees')}</span></div>${visible.map(id=>{const items=O.orderImported(state.objectives.filter(o=>o.owner_id===id));return `<section class="okr-person-group" data-okr-owner="${esc(id)}"><header><h2>${esc(displayName(id))}</h2><span class="fine">${items.length} ${tr('项目标','objectives')}</span></header>${items.map(objectiveCard).join('')}</section>`;}).join('')}`:empty(tr('还没有目标，创建第一个目标开始。','No objectives yet. Create your first objective to begin.'))}`;
  }
  function objectiveCard(objective){
    const O=window.WorkOSOkr;
    const krs=O.orderImported(state.krs.filter(k=>k.objective_id===objective.id));
      return `<section class="objective-card"><div class="objective-card-head"><span class="objective-letter">${esc(objective.importSource?.itemLabel||'O')}</span><div class="objective-text"><h3>${tx(objective.title)}</h3><div class="objective-info">${esc(levelLabel(objective.level))} · ${esc(displayName(objective.owner_id))}</div></div>${canEditObjective(objective)?`<button class="btn small" data-live-new-kr="${esc(objective.id)}">${icon('plus')} KR</button>`:''}${objective.importSource?`<button class="btn small" data-live-objective-source="${esc(objective.id)}">${tr('历史原始记录','Historical source record')}</button>`:''}</div>${O.plan(objective.planning,i18n.lang,objective.title)}${O.importSourceView(objective.importSource,i18n.lang)}${krs.map((kr,index)=>{
        const metric=O.metric(kr),canReview=objective.department_id===state.actor.department_id&&(manager()||objective.owner_id===state.actor.id);
        return `<div class="kr-row"><span class="kr-symbol">${esc(kr.importSource?.itemLabel||'KR'+(index+1))}</span><div class="kr-name">${tx(kr.title)}<small>${tr('权重','Weight')} ${kr.planning?.weight==null?'—':esc(kr.planning.weight)+'%'}${metric.quantified?` · ${tr('基线','Baseline')} ${esc(kr.baseline)} ${esc(kr.unit)}`:''}</small>${kr.planning?.description&&kr.planning.description.trim()!==kr.title.trim()?`<small>${tx(kr.planning.description)}</small>`:''}${O.importSourceView(kr.importSource,i18n.lang)}</div><div class="kr-metric">${O.metricView(kr,i18n.lang)}</div><div class="okr-score-actions">${canReview?`<button class="btn small" data-live-appraisal="${esc(kr.id)}">${tr('成果与评分','Evidence & scores')}</button>`:''}${metric.quantified&&manager()&&objective.department_id===state.actor.department_id?`<button class="btn small" data-live-measure="${esc(kr.id)}">${tr('记录实际值','Record actual')}</button>`:''}</div></div>`;
      }).join('')||`<div class="panel-body fine">${tr('添加可核验的关键结果。','Add a measurable key result.')}</div>`}${O.summaryHtml(O.summary(objective.planning,krs,state.appraisals),i18n.lang)}</section>`;
  }

  async function openObjectiveSource(objectiveId) {
    const owner=state.actor.id,generation=++overlayGeneration;
    try {
      const legacy=await api.get('/objectives/'+encodeURIComponent(objectiveId)+'/source');
      if(state.actor?.id!==owner||generation!==overlayGeneration)return;
      const objective=state.objectives.find(item=>item.id===objectiveId);
      modal(tr('历史原始记录','Historical source record'),`<h3>${tx(objective?.title)}</h3>${window.WorkOSOkr.legacySourceView(legacy,i18n.lang)||empty(tr('尚无历史原始记录','No historical source record'))}`,button(tr('关闭','Close'),'close'));
    } catch(error){if(!handleAuthError(error))toast(explainError(error));}
  }
  async function openAppraisal(krId) {
    const owner=state.actor.id,generation=++overlayGeneration;
    try {
      const a=await api.get('/key-results/'+encodeURIComponent(krId)+'/appraisal');
      if(state.actor?.id!==owner||generation!==overlayGeneration)return;
      state.appraisals[krId]=a;
      const kr=state.krs.find(k=>k.id===krId),objective=state.objectives.find(o=>o.id===kr.objective_id),kind=objective.owner_id===owner?'self':'manager';
      const canSubmit=kind==='self'||(manager()&&a.self?.metric_version===a.version);
      modal(tr('KR 成果与评分','KR evidence & scores'),`<h3>${tx(kr.title)}</h3>${window.WorkOSOkr.evaluationView(i18n.lang,a,kr)}<p class="fine">${tr('历史记录','History')}: ${a.history.length} · ${tr('当前版本','Current version')}: ${a.version}</p>${canSubmit?`<form id="live-appraisal" data-kr-id="${esc(krId)}" data-kind="${kind}" data-version="${a.version}" data-self-id="${esc(a.self?.id||'')}"><div class="form-grid">${window.WorkOSOkr.evaluationForm(i18n.lang,kind,a)}</div><p role="alert" class="form-error"></p></form>`:`<p class="notice">${(a.manager?tr('当前成果已核定，新成果需重新提交自评。','Current evidence is reviewed. New evidence needs a new self evaluation.'):tr('等待负责人提交当前版本的成果与自评。','Awaiting the owner’s current-version evidence and self evaluation.'))}</p>`}`,canSubmit?submitButton('live-appraisal',kind==='self'?tr('提交成果与自评','Submit evidence & self evaluation'):tr('确认主管评价','Confirm manager evaluation')):button(tr('关闭','Close'),'close'));
    } catch(error){if(!handleAuthError(error))toast(explainError(error));}
  }

  function reviewPage() { const tasks = state.tasks.filter(task => ['submitted','revision'].includes(task.status)); return `${heading(tr('成果验收','Deliverable review'),tr('检查当前成果版本，按约定标准确认或退回。','Inspect the current submission version against the agreed criteria.'))}<section class="panel">${tasks.map(task => `<article class="review-card"><div class="review-card-top"><div><h3>${tx(task.title)}</h3><p>${esc(displayName(task.owner_id))} · ${tr('指定验收人','Reviewer')}: ${esc(displayName(task.reviewer_id))}</p></div>${badge(task.status)}</div><div class="inline-actions"><button class="btn primary small" data-live-task="${esc(task.id)}">${tr('检查成果与记录','Inspect evidence & records')} ${icon('arrow')}</button></div></article>`).join('') || empty(tr('没有等待验收或补充的成果','No deliverables await review or revision'))}</section>`; }
  function performancePage() { const accepted = state.tasks.filter(task => task.status === 'accepted'), known = accepted.map(task => state.details.get(task.id)).filter(Boolean), reviews = known.map(task => task.currentReview).filter(Boolean), average = reviews.length ? Math.round(reviews.reduce((sum,review) => sum + review.quality,0) / reviews.length) : null; return `${heading(tr('绩效参考','Performance insights'),tr('只展示有人工验收依据的数据，不生成自动人事结论。','Show evidence-backed human review data, without automated personnel decisions.'))}<div class="stats-grid">${stat(tr('已验收任务','Accepted tasks'),accepted.length,tr('当前授权范围','Your authorized scope'))}${stat(tr('已加载质量记录','Loaded quality records'),reviews.length,tr('保留版本与验收人','Version and reviewer retained'))}${stat(tr('人工质量均值','Human quality average'),average === null ? '—' : average,tr('仅已加载的当前验收版本','Loaded current accepted versions only'))}${stat(tr('综合执行分','Composite score'),'—',tr('尚未完成岗位与工作日历校准','Role and work-calendar calibration pending'))}</div>${notice(tr('质量分来自负责人确认。速度、工作时间响应与计划变更需要完整口径后才能计算；缺失数据不记零分，当前不跨岗位排名，不处理薪资或员工去留。','Quality scores come from human reviewers. Speed, working-time response and plan changes require complete definitions; missing data is not zero. This view does not rank across roles or handle salary and retention decisions.'))}<div class="live-space-top">${button(tr('读取当前验收依据','Load current review evidence'),'load-performance','','refresh')}</div><section class="panel live-space-top"><div class="panel-head"><h2>${tr('已验收任务','Accepted tasks')}</h2></div>${accepted.map(task => `<button class="todo-row" data-live-task="${esc(task.id)}"><span class="todo-body"><h3>${tx(task.title)}</h3><span class="todo-meta">${esc(displayName(task.owner_id))}</span></span><span class="badge green">${state.details.get(task.id)?.currentReview?.quality ?? '—'}</span></button>`).join('') || empty(tr('暂无人工验收记录','No human review records yet'))}</section>`; }
  function integrationPage() { return state.actor?.isAdmin===true||!window.WorkOSPeople ? `${heading(tr('集成与通知','Integrations & notifications'),tr('仅系统管理员可见。配置状态来自服务端。','Administrators only. Configuration is reported by the server.'))}${integrationBody()}` : overview(); }
  function integrationBody() { const items = [[tr('钉钉身份','DingTalk identity'),state.capabilities.dingtalk],[botMode() ? tr('Grok Bot 成果评审','Grok Bot evidence assessment') : tr('Grok API 成果评审','Grok API evidence assessment'),state.capabilities.aiReview],[tr('钉钉工作通知','DingTalk work notifications'),state.capabilities.notificationDelivery]]; return `<div class="integration-grid">${items.map(([label,value]) => `<section class="integration-card"><div class="integration-top"><div><h3>${label}</h3></div><span class="badge ${configured(value) ? 'green' : 'amber'}">${configured(value) ? tr('已配置','Configured') : tr('待配置','Not configured')}</span></div><p class="integration-description">${esc(typeof value === 'string' ? value : configured(value) ? tr('服务端已配置，请以真实调用结果为准。','Configured on the server; verify actual requests before rollout.') : tr('请由管理员在服务端配置。','An administrator must configure this on the server.'))}</p></section>`).join('')}</div><div class="live-space-top">${notice(botMode() ? tr('当前使用异步 Grok Bot 路径。使用已有 Bot 账户额度，具体配额和可用性由该账户决定；排队与分析完成分别记录。','The asynchronous Grok Bot path is selected. It uses the existing Bot account allowance; quota and availability depend on that account. Queue acceptance and assessment completion are separate states.') : tr('当前使用服务端 Grok 模型 API。调用可用性与模型费用由服务端配置和模型账户决定。','The server-side Grok model API is selected. Availability and model charges depend on server configuration and the model account.'))}</div><div class="live-space-top">${notice(tr('模型只能分析当前授权成果，提供证据、缺口与建议；负责人仍须检查实际交付物。密钥、薪资和私密配置不会在此页面显示。','The model analyzes authorized evidence and suggests findings and gaps. Managers must still inspect the actual deliverable. Keys, compensation and private settings are never displayed here.'))}</div>${manager() ? `<section class="panel live-space-top"><div class="panel-head"><h2>${tr('企业成员','Company members')}</h2>${button(tr('同步钉钉成员','Sync DingTalk members'),'sync-directory','','refresh')}</div><div class="panel-body"><p class="fine">${tr('仅同步管理员已批准的部门，更新成员身份和任务分配名单。已移出范围的账号将停用。','Sync only administrator-approved departments and update the assignment directory. Accounts outside that scope will be deactivated.')}</p><p>${tr('当前可分配成员','Assignable members')}：${state.directory.length}</p><p class="fine">${state.directory.map(user => esc(user.display_name)).join(' · ')}</p></div></section>` : ''}<section class="panel live-space-top"><div class="panel-head"><h2>${tr('工作提醒','Work reminders')}</h2>${button(tr('预览提醒','Preview reminders'),'notifications','','bell')}</div><div class="panel-body fine">${tr('预览只读取当前可见任务。发送需要负责人再次确认，服务端限定收件人为任务负责人并去重。','A preview reads only visible tasks. Sending requires manager confirmation; the server limits recipients to task owners and deduplicates requests.')}</div></section>`; }
  function stopAnalysisWatch() { if (analysisWatch) { clearTimeout(analysisWatch.timer); analysisWatch.controller?.abort(); analysisWatch = null; } }
  function closeOverlay() { stopAnalysisWatch(); drawerController?.abort(); drawerController = null; overlayGeneration++; openTaskId = null; document.getElementById('overlay-root').innerHTML = ''; document.body.style.overflow = ''; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
  /* Text boxes in dialogs grow with what you type (up to about 60% of the screen), then scroll. */
  function fitTextarea(el) { if (!el || el.tagName !== 'TEXTAREA') return; const max = Math.round(window.innerHeight * 0.6); el.style.height = 'auto'; const h = Math.min(el.scrollHeight + 2, max); el.style.height = Math.max(h, el.dataset.minH ? Number(el.dataset.minH) : 0) + 'px'; el.style.overflowY = el.scrollHeight + 2 > max ? 'auto' : 'hidden'; }
  function fitTextareas() { document.querySelectorAll('#overlay-root textarea').forEach(el => { if (!el.dataset.minH) el.dataset.minH = String(el.offsetHeight || 0); fitTextarea(el); }); }
  function overlay(body, drawer = false) { lastFocus = document.activeElement; document.getElementById('overlay-root').innerHTML = `<div class="overlay ${drawer ? 'drawer-overlay' : ''}" data-live-overlay><section class="${drawer ? 'drawer' : 'modal'}" role="dialog" aria-modal="true" aria-labelledby="live-dialog-title" tabindex="-1">${body}</section></div>`; document.body.style.overflow = 'hidden'; requestAnimationFrame(() => document.querySelector('#overlay-root [role="dialog"]')?.focus()); }
  function modal(title, content, footer = '', form = '') { closeOverlay(); overlay(`<div class="modal-header"><h2 id="live-dialog-title">${title}</h2><button class="icon-btn" data-live-action="close" aria-label="${tr('关闭弹窗','Close dialog')}">${icon('close')}</button></div><div class="modal-body">${content}<div class="form-error" id="live-form-error" role="alert"></div></div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}`); }
  const submitButton = (form, label) => `<button class="btn primary" type="submit" form="${form}">${label}</button>`;
  /* Every member fills in a Chinese and an English name so colleagues in both countries can read them. */
  /* Work email is required: task assignments and reminders are also sent there. */
  function emailPrompt() {
    if (!state.actor || !state.capabilities?.notificationChannels || String(state.actor.email || '').trim() || document.getElementById('live-email') || document.getElementById('live-names')) return;
    overlay(`<div class="modal-header"><h2 id="live-dialog-title">${tr('请填写你的工作邮箱','Add your work email')}</h2></div><div class="modal-body"><p class="fine" style="margin-bottom:14px">${tr('别人给你下达任务、催办和到期提醒，会同时发到钉钉和这个邮箱。请填写你每天都会看的工作邮箱。管理员帮你填写后，本人不能再修改。','Task assignments, reminders and due-date alerts are sent to DingTalk and this email. Use the work email you check every day. Once an administrator sets it, only they can change it.')}</p><form id="live-email" class="form-grid">${field('email',tr('工作邮箱','Work email'),'<input name="email" type="email" required maxlength="200" autocomplete="email" placeholder="name@1laser.com">',true)}</form><div class="form-error" id="live-form-error" role="alert"></div></div><div class="modal-footer">${submitButton('live-email',tr('保存','Save'))}</div>`);
  }
  function namePrompt() {
    if (!state.actor || document.getElementById('live-names')) return;
    const a = state.actor, base = a._dn ?? a.display_name ?? '', zh = a.name_zh || (/[\u3400-\u9fff]/.test(base) ? base : ''), en = a.name_en || (!/[\u3400-\u9fff]/.test(base) ? base : '');
    overlay(`<div class="modal-header"><h2 id="live-dialog-title">${tr('请填写你的中文名和英文名','Add your Chinese and English names')}</h2></div><div class="modal-body"><p class="fine" style="margin-bottom:14px">${tr('公司在中美两地协作：界面是中文时同事看到你的中文名，界面是英文时看到英文名。填写后可以在“个人设置”里修改，管理员也可以帮你完善。','We work across China and the US: colleagues see your Chinese name in the Chinese interface and your English name in English. You can change them later in Personal settings; admins can help complete them.')}</p><form id="live-names" class="form-grid">${field('nameZh',tr('中文名','Chinese name'),`<input name="nameZh" required maxlength="40" value="${esc(zh)}" placeholder="${tr('例如：陈一','e.g. 陈一')}">`)}${field('nameEn',tr('英文名','English name'),`<input name="nameEn" required maxlength="60" pattern="[A-Za-z0-9 .'\\-]+" value="${esc(en)}" placeholder="${tr('例如：Yi Chen','e.g. Yi Chen')}">`)}</form><div class="form-error" id="live-form-error" role="alert"></div></div><div class="modal-footer">${submitButton('live-names',tr('保存','Save'))}</div>`);
  }
  /* Assign Task: give a task to anyone in the organization; you review it and AI follows up. */
  /* Attachments for Assign Task: kept in memory until the task exists, then uploaded to it and announced in its updates. */
  let assignFiles = [];
  const ASSIGN_MIME = new Set(['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','video/mp4','application/zip']);
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function addAssignFiles(list) {
    const err = document.getElementById('live-form-error'); let problem = '';
    for (let f of [...list]) {
      if (!f) continue;
      if (f.type.startsWith('image/') && (!f.name || f.name === 'image.png')) { const d = new Date(), p2 = n => String(n).padStart(2, '0'); f = new File([f], `${tr('截图','screenshot')}-${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.${(f.type.split('/')[1] || 'png').replace('jpeg','jpg')}`, { type:f.type }); }
      if (assignFiles.length >= 10) { problem = tr('最多 10 个附件。','At most 10 attachments.'); break; }
      if (!ASSIGN_MIME.has(f.type)) { problem = tr(`不支持这种文件：${f.name}（支持图片、PDF、Word、Excel、PPT、CSV、TXT、MP4、ZIP）`, `Unsupported file: ${f.name}`); continue; }
      if (f.size > 8 * 1024 * 1024) { problem = tr(`${f.name} 超过 8 MB`, `${f.name} is larger than 8 MB`); continue; }
      const item = { file:f, url:'' }; assignFiles.push(item);
      if (f.type.startsWith('image/')) { const r = new FileReader(); r.onload = () => { item.url = String(r.result); drawAssignFiles(); }; r.readAsDataURL(f); }
    }
    if (err) err.textContent = problem; drawAssignFiles();
  }
  function drawAssignFiles() {
    const ul = document.querySelector('[data-assign-list]'); if (!ul) return;
    ul.innerHTML = assignFiles.map((it, i) => `<li>${it.url ? `<img src="${esc(it.url)}" alt="">` : `<span class="assign-ext">${esc((it.file.name.split('.').pop() || '').slice(0, 4).toUpperCase())}</span>`}<span class="assign-name" title="${esc(it.file.name)}">${esc(it.file.name)}</span><small>${kb(it.file.size)}</small><button type="button" class="icon-btn" data-live-action="assign-rm" data-i="${i}" aria-label="${tr('移除','Remove')}">${icon('close')}</button></li>`).join('');
  }
  const fileB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error(tr('文件读取失败','Could not read the file'))); r.readAsDataURL(f); });
  async function uploadAssignFiles(taskId) {
    if (!taskId || !assignFiles.length) return;
    const done = [], failed = [];
    for (const it of assignFiles) { try { await api.post('/tasks/' + encodeURIComponent(taskId) + '/attachments', { name:it.file.name, mime:it.file.type, dataBase64:await fileB64(it.file) }); done.push(it.file.name); } catch (e) { failed.push(`${it.file.name}（${e.message || ''}）`); } }
    if (done.length) await api.post('/tasks/' + encodeURIComponent(taskId) + '/updates', { requestId:crypto.randomUUID(), body:tr(`下达任务时附上 ${done.length} 个附件：`, `Attached ${done.length} file(s) when assigning: `) + done.join('、') + tr('（在“附件”里查看）', ' (see Attachments)') }).catch(() => {});
    if (failed.length) toast(tr('任务已下达，但这些附件没传上去：', 'Task assigned, but these files failed: ') + failed.join('；'));
    assignFiles = [];
  }
  /* Deliverable attachments: kept in memory until submit, uploaded to the task first, then listed in the submission. */
  let subFiles = [], reviewDone = null;
  function addSubFiles(list) {
    const err = document.getElementById('live-form-error'); let problem = '';
    for (let f of [...list]) {
      if (!f) continue;
      if (f.type.startsWith('image/') && (!f.name || f.name === 'image.png')) { const d = new Date(), p2 = n => String(n).padStart(2, '0'); f = new File([f], `${tr('截图','screenshot')}-${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.${(f.type.split('/')[1] || 'png').replace('jpeg','jpg')}`, { type:f.type }); }
      if (subFiles.length >= 10) { problem = tr('最多 10 个附件。','At most 10 attachments.'); break; }
      if (!ASSIGN_MIME.has(f.type)) { problem = tr(`不支持这种文件：${f.name}`, `Unsupported file: ${f.name}`); continue; }
      if (f.size > 8 * 1024 * 1024) { problem = tr(`${f.name} 超过 8 MB`, `${f.name} is larger than 8 MB`); continue; }
      const item = { file:f, url:'' }; subFiles.push(item);
      if (f.type.startsWith('image/')) { const r = new FileReader(); r.onload = () => { item.url = String(r.result); drawSubFiles(); }; r.readAsDataURL(f); }
    }
    if (err) err.textContent = problem; drawSubFiles();
  }
  function drawSubFiles() {
    const ul = document.querySelector('[data-sub-list]'); if (!ul) return;
    ul.innerHTML = subFiles.map((it, i) => `<li>${it.url ? `<img src="${esc(it.url)}" alt="">` : `<span class="assign-ext">${esc((it.file.name.split('.').pop() || '').slice(0, 4).toUpperCase())}</span>`}<span class="assign-name" title="${esc(it.file.name)}">${esc(it.file.name)}</span><small>${kb(it.file.size)}</small><button type="button" class="icon-btn" data-live-action="sub-rm" data-i="${i}" aria-label="${tr('移除','Remove')}">${icon('close')}</button></li>`).join('');
  }
  async function uploadSubFiles(taskId) {
    const ids = [];
    for (const it of subFiles) { if (!it.id) it.id = (await api.post('/tasks/' + encodeURIComponent(taskId) + '/attachments', { name:it.file.name, mime:it.file.type, dataBase64:await fileB64(it.file) })).id; ids.push(it.id); }
    return ids;
  }
  const attachmentUrl = (taskId, f) => (window.WORKOS_CONFIG.apiBase || '/api') + '/tasks/' + encodeURIComponent(taskId) + '/attachments/' + encodeURIComponent(f.id);
  const ATTACHMENT_LINE = /\n*[ \t]*(附件[：:]|Attachments:)[^\n]*\s*$/;
  /** Images show inline as thumbnails that open full size; other files are download links. */
  function attachmentsView(taskId, files) {
    if (!files?.length) return '';
    return `<div class="artifact-files">${files.map(f => { const url = esc(attachmentUrl(taskId, f)); return /^image\/(png|jpeg|webp|gif)$/.test(f.mime) ? `<button type="button" class="artifact-thumb" data-live-action="att-view" data-src="${url}" data-name="${esc(f.name)}" title="${esc(f.name)}" aria-label="${tr('查看大图：','View full size: ')}${esc(f.name)}"><img src="${url}" alt="${esc(f.name)}" loading="lazy"></button>` : `<a class="artifact-file" href="${url}" target="_blank" rel="noopener noreferrer">${icon('file')}<span>${esc(f.name)}</span><small>${kb(f.size)}</small></a>`; }).join('')}</div>`;
  }
  function viewAttachment(src, name) {
    closeAttachment();
    const box = document.createElement('div'); box.className = 'att-lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', name);
    box.innerHTML = `<figure><img src="${esc(src)}" alt="${esc(name)}"><figcaption><span>${esc(name)}</span><a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${tr('新窗口打开','Open in new tab')}</a></figcaption></figure><button type="button" class="icon-btn att-lightbox-close" aria-label="${tr('关闭','Close')}">${icon('close')}</button>`;
    box.addEventListener('click', e => { if (!e.target.closest('figure a')) closeAttachment(); });
    document.body.appendChild(box); box.querySelector('.att-lightbox-close').focus();
  }
  function closeAttachment() { document.querySelector('.att-lightbox')?.remove(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.att-lightbox')) { e.preventDefault(); e.stopImmediatePropagation(); closeAttachment(); } }, true);
  /** A short confirmation so the reviewer sees the decision landed. */
  function celebrate(title, detail) {
    document.querySelector('.review-done')?.remove();
    const el = document.createElement('div'); el.className = 'review-done'; el.setAttribute('role', 'status');
    el.innerHTML = `<div class="review-done-card"><svg class="review-done-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</div>`;
    document.body.appendChild(el); setTimeout(() => el.classList.add('leaving'), 1700); setTimeout(() => el.remove(), 2100);
  }
  async function assignTask(context={}) {
    assignFiles = [];
    let people=[]; try { people=(await api.get('/org/chart')).items||[]; } catch { people=state.directory; }
    people=people.filter(u=>u.id!==state.actor.id).sort((a,b)=>String(a.location||'').localeCompare(String(b.location||''))||String(a.display_name).localeCompare(String(b.display_name)));
    const groups=[...new Set(people.map(u=>u.location||tr('未填写工作地点','No location')))];
    const options=groups.map(g=>`<optgroup label="${esc(g)}">${people.filter(u=>(u.location||tr('未填写工作地点','No location'))===g).map(u=>`<option value="${esc(u.id)}" ${u.id===context.assigneeId?'selected':''}>${esc(u.display_name)}${u.title?' · '+esc(u.title):''}</option>`).join('')}</optgroup>`).join('');
    modal('Assign Task · '+tr('下达任务','assign a task'), `<form id="live-assign-task"><div class="assign-warn"><i class="ph ph-warning-circle" aria-hidden="true"></i><div><strong>${tr('下达任务是严肃的事','Assigning a task is a serious commitment')}</strong><p>${tr('任务会进入对方的个人任务，对方必须按时完成，AI 会全程跟踪催办并同步给你。请不要随意给任何人下达任务。','It lands in their task center, they are expected to deliver on time, and AI follows up and copies you. Do not assign tasks to anyone casually.')}</p><p>${tr('描述必须非常清楚：做什么、什么时候做完、交付标准是什么。','Be very clear: what to do, by when, and what the deliverable standard is.')}</p></div></div><div class="form-grid">
      ${field('assigneeId',tr('指派给','Assign to'),`<select name="assigneeId" required><option value="">${tr('选择同事…','Choose a colleague…')}</option>${options}</select>`)}
      ${field('dueAt',tr('截止时间（本地时区）','Due (local time)'),'<input name="dueAt" type="datetime-local" required>')}
      ${field('title',tr('任务名称','Task name'),'<input name="title" minlength="3" maxlength="200" required placeholder="'+tr('例如：整理 11 月竞品价格表','e.g. Compile November competitor pricing')+'">',true)}
      ${field('priority',tr('优先级','Priority'),`<select name="priority" required><option value="">${tr('请选择','Choose')}</option><option value="urgent">${tr('紧急','Urgent')}</option><option value="high">${tr('高','High')}</option><option value="medium">${tr('中','Medium')}</option><option value="low">${tr('低','Low')}</option></select>`)}
      ${field('reviewer',tr('验收人','Reviewer'),`<input value="${esc(state.actor.display_name)}（${tr('你','you')}）" readonly>`)}
      ${field('description',tr('详细描述（至少 10 个字）：做什么、什么时候做完','Details (at least 10 characters): what to do and by when'),'<textarea name="description" required minlength="10" maxlength="10000" placeholder="'+tr('例如：整理 Hydra / Cobra 两条产品线 11 月的竞品价格，覆盖 xTool、Glowforge、OMTech，11 月 15 日前完成。','e.g. Compile November competitor prices for Hydra and Cobra (xTool, Glowforge, OMTech) by Nov 15.')+'"></textarea>',true)}
      ${field('criteria',tr('交付标准（每行一项，做到什么才算完成）','Deliverable standard (one per line: what counts as done)'),'<textarea name="criteria" required maxlength="20000" placeholder="'+tr('例如：\n价格表上传到共享盘\n每款标注来源链接和日期','e.g.\nSheet uploaded to the shared drive\nSource link and date for each model')+'"></textarea>',true)}
      <div class="field full assign-files"><span>${tr('附件（截图、文件，选填）','Attachments (screenshots, files, optional)')}</span><div class="assign-drop" data-assign-drop>${icon('file')}<span>${tr('把文件拖到这里，或直接粘贴截图（⌘/Ctrl+V），或','Drop files here, paste a screenshot (⌘/Ctrl+V), or')}</span><button type="button" class="btn" data-live-action="assign-pick">＋ ${tr('上传','Upload')}</button><input type="file" multiple hidden data-assign-file accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,.docx,.xlsx,.pptx,video/mp4,application/zip"></div><ul class="assign-list" data-assign-list></ul><small class="fine">${tr('每个文件不超过 8 MB，最多 10 个；下达后会出现在这项任务的附件和更新里。','Up to 10 files, 8 MB each; they appear in the task’s attachments and updates.')}</small></div>
    </div><p class="req-note"><b>*</b> ${tr('为必填项','required')}</p></form>`, submitButton('live-assign-task',tr('下达任务','Assign task')));
    document.querySelector('#overlay-root .modal')?.classList.add('modal-wide'); fitTextareas();
  }
  // New tasks are always added inline on the task board (a blank row), never in a dialog.
  function newTask(context={}) { if (window.WorkOSTaskBoard?.startDraft) { if (state.page !== 'tasks') { location.hash = 'tasks'; } window.WorkOSTaskBoard.startDraft(context); return; } return newTaskDialog(context); }
  function newTaskDialog(context={}) { const owners = [state.actor], first = state.actor; /* new tasks are for yourself; Assign Task gives work to others */ modal(tr('创建任务','Create task'), `<form id="live-new-task"><div class="form-grid">${field('title',tr('任务名称','Task name'),'<input name="title" minlength="3" maxlength="200" required>',true)}${field('ownerId',tr('负责人','Owner'),`<select name="ownerId" id="live-owner">${owners.map(user => `<option value="${esc(user.id)}" ${user.id === first?.id ? 'selected' : ''}>${esc(user.display_name)}</option>`).join('')}</select>`)}${field('reviewerId',tr('验收人','Reviewer'),'<select name="reviewerId" id="live-reviewer" required></select>')}${field('dueAt',tr('截止时间（本地时区）','Due date (local time zone)'),'<input name="dueAt" type="datetime-local" required>')}${field('krId',tr('关联 KR','Linked KR'),'<select name="krId" id="live-linked-kr"></select>')}${window.WorkOSTaskBoard?.newTaskFields(context)||''}${field('description',tr('期望成果','Expected outcome'),'<textarea name="description" required maxlength="10000"></textarea>',true)}${field('criteria',tr('验收标准（每行一项）','Acceptance criteria (one per line)'),'<textarea name="criteria" required maxlength="20000"></textarea>',true)}</div></form>`,submitButton('live-new-task',tr('创建任务','Create task'))); updateTaskOptions(); }
  function updateTaskOptions() { const owner = document.getElementById('live-owner')?.value; if (!owner) return; const ownerRow = state.directory.find(user => user.id === owner); const reviewers = state.directory.filter(user => user.role === 'manager' && user.id !== owner); const boss = ownerRow?.manager_id && ownerRow.manager_id !== owner && !reviewers.some(u => u.id === ownerRow.manager_id) ? [...state.directory, ...(state.reviewers || [])].find(u => u.id === ownerRow.manager_id) : null; if (boss) reviewers.push(boss); const error = document.getElementById('live-form-error'); if (error) error.textContent = reviewers.length ? '' : tr('当前没有可用验收人，请管理员先配置另一位有权限的负责人。','No eligible reviewer is available. Ask an administrator to configure another authorized manager first.'); document.querySelector('[form="live-new-task"]')?.toggleAttribute('disabled',!reviewers.length); document.getElementById('live-reviewer').innerHTML = reviewers.map(user => `<option value="${esc(user.id)}" ${user.id === state.actor.id ? 'selected' : ''}>${esc(user.display_name)}</option>`).join(''); document.getElementById('live-linked-kr').innerHTML = `<option value="">${tr('暂不关联','No linked KR')}</option>` + state.krs.filter(kr => { const objective = state.objectives.find(item => item.id === kr.objective_id); return objective?.level !== 'personal' || objective.owner_id === owner; }).map(kr => `<option value="${esc(kr.id)}">${esc(txt(kr.title))}</option>`).join(''); }
  function newObjective() { modal(tr('创建目标','Create objective'), `<form id="live-new-objective"><div class="form-grid">${field('title',tr('目标描述','Objective'),'<input name="title" required minlength="3" maxlength="300">',true)}${field('level',tr('层级','Level'),`<select name="level"><option value="personal">${tr('个人目标','Individual objective')}</option>${manager() ? `<option value="department">${tr('部门目标','Department objective')}</option>` : ''}</select>`)}${field('ownerId',tr('负责人','Owner'),`<select name="ownerId">${(manager() ? state.directory : [state.actor]).map(user => `<option value="${esc(user.id)}" ${user.id === state.actor.id ? 'selected' : ''}>${esc(user.display_name)}</option>`).join('')}</select>`)}${window.WorkOSOkr.planningFields(i18n.lang,false)}</div></form>`,submitButton('live-new-objective',tr('创建目标','Create objective'))); }
  function newKr(objectiveId) { modal(tr('添加关键结果','Add a key result'), `<form id="live-new-kr" data-objective-id="${esc(objectiveId)}"><div class="form-grid">${field('title',tr('关键结果','Key result'),'<input name="title" required minlength="3" maxlength="300">',true)}${field('baseline',tr('基准值','Baseline'),'<input name="baseline" type="number" step="any" value="0" required>')}${field('target',tr('目标值','Target'),'<input name="target" type="number" step="any" required>')}${field('direction',tr('方向','Direction'),`<select name="direction"><option value="increase">${tr('越高越好','Increase')}</option><option value="decrease">${tr('越低越好','Decrease')}</option></select>`)}${field('unit',tr('单位','Unit'),'<input name="unit" required maxlength="40">')}${window.WorkOSOkr.planningFields(i18n.lang,true)}</div></form>`,submitButton('live-new-kr',tr('添加 KR','Add KR'))); }
  function measurement(id) { const kr = state.krs.find(item => item.id === id); if(!kr||!window.WorkOSOkr.metric(kr).quantified){toast(tr('未设量化指标，请先核对 KR 指标定义。','No quantitative metric is set. Confirm the KR metric definition first.'));return;} modal(tr('记录 KR 实际值','Record a KR measurement'), `<form id="live-measure" data-kr-id="${esc(id)}"><p class="fine live-space-bottom">${tx(kr.title)} · v${kr.version}</p><div class="form-grid">${field('actual',tr('实际值','Actual value'),`<input name="actual" type="number" step="any" value="${esc(kr.actual)}" required>`,true)}${field('source',tr('数据来源','Data source'),'<input name="source" required minlength="3" maxlength="2000">',true)}${field('note',tr('核验说明','Verification note'),'<textarea name="note" required minlength="5" maxlength="4000"></textarea>',true)}</div></form>`,submitButton('live-measure',tr('保存核验记录','Save measurement'))); }
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-live-action="task-edit"][role="button"]')) { e.preventDefault(); e.target.click(); } });
  async function openTask(id) {
    window.WorkOSInbox?.taskOpened(id);
    if (openTaskId !== id) subFiles = [];
    closeOverlay(); if (editingTask !== id) editingTask = null; openTaskId = id; const generation = overlayGeneration;
    drawerController = new AbortController(); const signal = drawerController.signal;
    overlay(`<div class="drawer-top"><span>${tr('读取成果记录','Loading evidence')}</span><button class="icon-btn" data-live-action="close" aria-label="${tr('关闭','Close')}">${icon('close')}</button></div><div class="drawer-body"><h2 id="live-dialog-title">${tr('正在加载…','Loading…')}</h2></div>`,true);
    try { const task = await readTask(id,signal); if (generation !== overlayGeneration || openTaskId !== id) return; state.details.set(id,task); taskDrawer(task); startAnalysisWatch(task); }
    catch (error) { if (error.code === 'CANCELLED' || generation !== overlayGeneration) return; if (handleAuthError(error)) return; overlay(`<div class="drawer-top"><span>${tr('无法读取','Unable to load')}</span><button class="icon-btn" data-live-action="close" aria-label="${tr('关闭','Close')}">${icon('close')}</button></div><div class="drawer-body"><h2 id="live-dialog-title">${tr('任务记录暂不可用','Task record unavailable')}</h2><p class="form-error">${esc(explainError(error))}</p></div>`,true); }
  }
  async function readTask(id,signal) {
    const path = '/tasks/' + encodeURIComponent(id);
    const [task,evaluations,jobs] = await Promise.all([api.get(path,{signal}),api.get(path + '/evaluations',{signal}).catch(error => { if (error.status === 404 || error.status === 501) return {items:[]}; throw error; }),botMode() ? api.get(path + '/analysis-jobs',{signal}) : Promise.resolve({items:[]})]);
    task.evaluations = evaluations.items || []; task.analysisJobs = jobs.items || []; return task;
  }
  function jobLabel(status) {
    const labels = {dispatching:['正在提交 Bot','Dispatching to Bot'],pending:['等待 Bot 领取','Waiting for Bot'],leased:['Bot 正在分析','Bot is assessing'],completed:['分析已完成','Assessment completed'],dispatch_unknown:['提交状态待核实','Dispatch uncertain'],failed:['分析未完成','Assessment failed'],expired:['任务或租约已过期','Job or lease expired'],superseded:['已被新任务替代','Replaced by a newer job'],cancelled:['已取消','Cancelled'],queued:['已排队','Queued'],dispatched:['已提交 Bot','Dispatched to Bot'],running:['Bot 正在分析','Bot is assessing']};
    return labels[status] ? tr(...labels[status]) : tr('状态待核实','Status needs verification');
  }
  function jobError(code) {
    const errors = {BOT_DISPATCH_REJECTED:['Bot 未受理提交，请检查集成后重试。','Bot rejected the dispatch. Check the integration before retrying.'],BOT_DISPATCH_UNKNOWN:['无法确认 Bot 是否已受理；原分析可能仍会运行。','Bot dispatch could not be confirmed; the original assessment may still run.'],BOT_JOB_EXPIRED:['分析任务已过期。','The assessment job expired.'],BOT_LEASE_EXPIRED:['Bot 领取后的处理租约已过期。','The Bot processing lease expired.'],BOT_JOB_SUPERSEDED:['此分析任务已被替代，不再用于当前成果。','This job was replaced and no longer applies to the current submission.'],BOT_JOB_STALE:['成果版本已变化，请刷新后分析当前版本。','The submission changed. Refresh and assess its current version.']};
    return errors[code] ? tr(...errors[code]) : code ? tr('Bot 分析未完成，请核对集成状态。','The Bot assessment did not finish. Check the integration status.') : '';
  }
  function analysisView(task) {
    const evaluation = task.evaluations?.find(item => Number(item.submission_version) === Number(task.submission_version));
    const job = botMode() ? currentJob(task) : null, pending = activeJobStates.has(job?.status);
    const history = botMode() ? (task.analysisJobs || []).filter(item => jobVersion(item) !== Number(task.submission_version)).slice(0,3) : [];
    const status = job ? `<div class="live-bot-job" role="status"><div class="inline-actions"><strong>${esc(jobLabel(job.status))}</strong><span class="badge ${job.status === 'completed' ? 'green' : 'amber'}">v${esc(job.submissionVersion)}</span></div><p>${pending ? tr('提交或排队成功尚不代表分析完成。结果通过校验后才会显示在当前版本下。','Dispatch or queue acceptance does not mean assessment is complete. Results appear for this version only after server validation.') : job.status === 'completed' ? tr('Bot 已提交经过服务端校验的分析；验收仍由负责人确认。','Bot submitted a server-validated assessment. A manager must still confirm acceptance.') : job.status === 'superseded' ? tr('此任务已被替代。刷新可查看新的分析任务。','This job was replaced. Refresh to inspect the newer job.') : jobError(job.errorCode) || tr('尚无可用于验收的完整分析。','No complete assessment is available for acceptance yet.')}</p><small>${tr('创建','Created')}: ${date(job.createdAt)} · ${tr('过期','Expires')}: ${date(job.expiresAt)}</small>${retryJobStates.has(job.status) ? `${job.status === 'dispatch_unknown' ? `<label class="form-check live-space-top"><input type="checkbox" id="live-bot-duplicate-ack"><span>${tr('我理解原分析可能仍会运行，重试可能重复消耗 Bot 额度。','I understand the original job may still run and retrying may consume Bot allowance again.')}</span></label>` : ''}<button class="btn small live-space-top" data-live-action="retry-analysis" data-live-job-id="${esc(job.id)}" ${busy ? 'disabled' : ''}>${tr('确认重新提交 Bot','Confirm Bot retry')}</button>` : ''}</div>` : '';
    return `<div class="inline-actions live-space-top"><button class="btn soft small" data-live-action="analyze" ${pending || busy ? 'disabled' : ''}>${botMode() ? tr('提交 Bot 成果检查','Request Bot evidence assessment') : tr('运行 Grok API 成果检查','Run Grok API evidence assessment')}</button>${botMode() ? `<button class="btn small" data-live-action="refresh-analysis" ${busy ? 'disabled' : ''}>${icon('refresh')}${tr('刷新分析状态','Refresh assessment')}</button>` : ''}</div><p class="fine live-space-top">${tr('只分析当前授权成果；链接与附件是否被读取，请以结果明确列出的来源为准。','Only the authorized submission is analyzed. Linked resources or attachments are read only if the result explicitly identifies them as sources.')}</p>${status}${task.analysisPaused ? `<p class="notice amber live-space-top">${task.analysisPaused === 'limit' ? tr('本页已停止自动刷新；Bot 任务可能仍在运行。可手动刷新查看结果。','Automatic refresh has stopped. The Bot job may still be running; refresh manually to check it.') : task.analysisPaused === 'unconfirmed' ? tr('服务未确认此次提交结果。请先刷新分析状态核对，避免重复提交。','The service did not confirm this request. Refresh its state before submitting again to avoid duplicates.') : tr('状态刷新暂时中断。请手动刷新；不会自动重提分析任务。','State refresh was interrupted. Refresh manually; assessment jobs are never resubmitted automatically.')}</p>` : ''}${history.length ? `<p class="fine live-space-top">${tr('旧成果版本的分析不会用于当前版本。','Assessments of older submissions do not apply to the current version.')}</p><ul class="live-bot-history">${history.map(item => `<li>v${esc(item.submissionVersion)} · ${esc(jobLabel(item.status))}</li>`).join('')}</ul>` : ''}${evaluationView(evaluation)}`;
  }
  function patchAnalysis(task) { if (openTaskId !== task.id || !state.actor) return; const region = document.getElementById('live-ai-region'); if (region) region.innerHTML = analysisView(task); }
  function startAnalysisWatch(task) {
    stopAnalysisWatch(); const job = currentJob(task);
    if (!botMode() || !job || !activeJobStates.has(job.status) || openTaskId !== task.id) return;
    const watch = {taskId:task.id,jobId:job.id,version:task.submission_version,actorId:state.actor.id,generation:overlayGeneration,startedAt:Date.now(),attempt:0,timer:null,controller:null};
    analysisWatch = watch; scheduleAnalysisPoll(watch);
  }
  function watchIsCurrent(watch) { return analysisWatch === watch && openTaskId === watch.taskId && overlayGeneration === watch.generation && state.actor?.id === watch.actorId; }
  function scheduleAnalysisPoll(watch) {
    if (!watchIsCurrent(watch)) return;
    const remaining = 120000 - (Date.now() - watch.startedAt);
    if (remaining <= 0) { const task = state.details.get(watch.taskId); if (task) { task.analysisPaused = 'limit'; patchAnalysis(task); } stopAnalysisWatch(); return; }
    const delay = Math.min([2000,4000,8000,15000][Math.min(watch.attempt++,3)],remaining);
    watch.timer = setTimeout(() => pollAnalysis(watch),delay);
  }
  async function pollAnalysis(watch) {
    if (!watchIsCurrent(watch)) return;
    if (Date.now() - watch.startedAt >= 120000) { scheduleAnalysisPoll(watch); return; }
    watch.controller = new AbortController();
    try {
      const result = await api.get('/tasks/' + encodeURIComponent(watch.taskId) + '/analysis-jobs/' + encodeURIComponent(watch.jobId),{signal:watch.controller.signal,timeout:Math.max(1,Math.min(20000,120000 - (Date.now() - watch.startedAt)))});
      if (!watchIsCurrent(watch)) return;
      const task = state.details.get(watch.taskId); if (!task || Number(task.submission_version) !== Number(watch.version)) { stopAnalysisWatch(); return; }
      task.analysisJobs = [result.job,...(task.analysisJobs || []).filter(item => item.id !== result.job.id)]; delete task.analysisPaused; patchAnalysis(task);
      if (result.job.status === 'completed') { await refreshAnalysis(false,watch); return; }
      if (activeJobStates.has(result.job.status)) scheduleAnalysisPoll(watch); else stopAnalysisWatch();
    } catch (error) { if (error.code === 'CANCELLED' || !watchIsCurrent(watch)) return; if (handleAuthError(error)) return; const task = state.details.get(watch.taskId); if (task) { task.analysisPaused = 'error'; patchAnalysis(task); } stopAnalysisWatch(); }
  }
  async function refreshAnalysis(restart = true,watch = null) {
    const id = openTaskId, generation = overlayGeneration, actorId = state.actor?.id;
    if (!id || !actorId) return;
    const controller = watch?.controller || drawerController || new AbortController();
    const task = await readTask(id,controller.signal);
    if (generation !== overlayGeneration || openTaskId !== id || state.actor?.id !== actorId || (watch && !watchIsCurrent(watch))) return;
    const previous = state.details.get(id); state.details.set(id,task);
    if (previous?.version !== task.version || previous?.submission_version !== task.submission_version) { taskDrawer(task); toast(tr('任务版本已更新，详情已重新加载。','The task version changed; its details have been reloaded.')); } else patchAnalysis(task);
    if (restart) startAnalysisWatch(task); else stopAnalysisWatch();
  }
  function evaluationView(evaluation) {
    if (!evaluation) return '';
    const result = evaluation.result || {}, criteria = Array.isArray(result.criteria) ? result.criteria : [];
    return `<div class="review-result"><h4>${tr('AI 成果检查','AI evidence assessment')} · v${esc(evaluation.submission_version)}</h4><p>${esc(result.summary || evaluation.status)}</p>${criteria.map(item => `<div class="live-ai-criterion"><strong>${esc(item.criterionId || item.criterion_id || '')}</strong><p>${esc(item.reason || item.finding || '')}</p>${(item.quotes || []).map(quote => `<blockquote class="live-evidence-quote">${esc(quote)}</blockquote>`).join('')}<small>${tr('证据引用','Evidence references')}: ${esc((item.evidenceRefs || item.evidence_refs || []).join(', ') || '—')}</small></div>`).join('')}${(result.missingEvidence || result.missing_evidence || []).length ? `<p><strong>${tr('待补充材料','Missing evidence')}</strong></p><ul>${(result.missingEvidence || result.missing_evidence).map(value => `<li>${esc(value)}</li>`).join('')}</ul>` : ''}${(result.uncertainties || []).length ? `<p><strong>${tr('待核实事项','Uncertainties')}</strong></p><ul>${result.uncertainties.map(value => `<li>${esc(value)}</li>`).join('')}</ul>` : ''}<p class="live-space-top">${tr('AI 结果是辅助建议，不能替代实际交付物检查与人工验收。','AI findings are advisory and do not replace inspection of actual deliverables and human acceptance.')}</p></div>`;
  }
  /* Edit a task from its detail drawer; changes go through the task board API, so the Task hub shows them at once. */
  let editingTask = null;
  const TASK_STATUSES = [['not_started','未开始','Not started'],['working','进行中','Working'],['hold','被暂停','Paused'],['review','待审批','In review'],['overdue','延期','Overdue'],['abandoned','放弃','Abandoned']];
  const TASK_PRIORITIES = [['','未设置','Unassigned'],['urgent','紧急','Urgent'],['high','高','High'],['medium','中','Medium'],['low','低','Low']];
  const localInput = iso => { const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ''; const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  function taskEditRights(task) {
    const me = state.actor.id, source = task.source || (task.kr_id ? 'okr' : task.created_by !== task.owner_id ? 'direct' : 'self'), definer = task.assigned_by || task.created_by;
    const def = source === 'self' ? (task.owner_id === me || task.reviewer_id === me || manager()) : (task.reviewer_id === me || definer === me || (manager() && task.owner_id !== me));
    return { def, status: def || task.owner_id === me, owner: manager() && task.submission_version === 0, criteria: def && task.submission_version === 0 };
  }
  function taskEditForm(task) {
    const r = taskEditRights(task), dis = ok => ok ? '' : 'disabled', status = task.board_status || 'not_started';
    const people = (state.directory || []).filter(u => u.active !== false && (!u.department_id || u.department_id === state.actor.department_id || u.id === task.owner_id));
    return `<form id="live-task-edit" class="task-edit-form" data-version="${task.version}">
      ${field('title',tr('任务名称','Task name'),`<input name="title" required minlength="3" maxlength="200" value="${esc(task.title)}" ${dis(r.def)}>`,true)}
      <div class="form-grid">
        ${field('status',tr('状态','Status'),status === 'done' ? `<input value="${tr('完成','Done')}" disabled>` : `<select name="status" ${dis(r.status)}>${TASK_STATUSES.map(([v,zh,en]) => `<option value="${v}" ${v === status ? 'selected' : ''}>${tr(zh,en)}</option>`).join('')}</select>`)}
        ${field('priority',tr('优先级','Priority'),`<select name="priority" ${dis(r.def)}>${TASK_PRIORITIES.map(([v,zh,en]) => `<option value="${v}" ${v === (task.board_priority || '') ? 'selected' : ''}>${tr(zh,en)}</option>`).join('')}</select>`)}
        ${field('dueAt',tr('截止时间','Due'),`<input name="dueAt" type="datetime-local" required value="${localInput(task.due_at)}" ${dis(r.def)}>`)}
        ${field('ownerId',tr('负责人','Owner'),r.owner ? `<select name="ownerId">${people.map(u => `<option value="${esc(u.id)}" ${u.id === task.owner_id ? 'selected' : ''}>${esc(displayName(u.id))}</option>`).join('')}</select>` : `<input value="${esc(displayName(task.owner_id))}" disabled>`)}
      </div>
      ${field('description',tr('期望成果','Expected outcome'),`<textarea name="description" required maxlength="10000" rows="3" ${dis(r.def)}>${esc(task.description)}</textarea>`,true)}
      ${field('criteria',tr('验收标准（每行一项）','Acceptance criteria (one per line)'),`<textarea name="criteria" required rows="3" maxlength="20000" ${dis(r.criteria)}>${esc((task.criteria || []).join('\n'))}</textarea>${task.submission_version > 0 ? `<small class="hint">${tr('已经提交过成果，验收标准不能再改。','Evidence has been submitted, so the criteria are fixed.')}</small>` : ''}`,true)}
      ${!r.def ? `<p class="hint">${tr('这是别人下达给你的任务：你可以改状态；名称、截止时间和标准由下达人修改。','This task was assigned to you: you can change its status; the assigner changes the name, due date and criteria.')}</p>` : ''}
      <p class="hint">${tr('保存后个人任务会同步更新。要标记“完成”，请在个人任务写完成结果。','Saved changes appear in the Task hub at once. To mark it Done, write the result in the Task hub.')}</p>
      <div class="inline-actions"><button class="btn primary small" type="submit">${tr('保存修改','Save changes')}</button><button class="btn small" type="button" data-live-action="task-edit-cancel">${tr('取消','Cancel')}</button></div>
      <div class="form-error" role="alert"></div></form>`;
  }
  function taskDrawer(task) {
    const latest = task.submissions?.at(-1), currentReview = task.currentReview, canSubmit = task.owner_id === state.actor.id, canReview = manager() && task.reviewer_id === state.actor.id && task.owner_id !== state.actor.id && task.status === 'submitted';
    const evidenceUrl = safeEvidenceUrl(latest?.evidence_url);
    const body = `<div class="drawer-top"><span>${tr('任务详情','Task details')} · v${task.version}</span><button class="icon-btn" data-live-action="close" aria-label="${tr('关闭任务详情','Close task details')}">${icon('close')}</button></div><div class="drawer-body">${editingTask === task.id ? `<h2 class="drawer-title" id="live-dialog-title">${tr('编辑任务','Edit task')}</h2>${taskEditForm(task)}` : `<div class="drawer-title-row"><h2 class="drawer-title ${taskEditRights(task).def ? 'is-editable' : ''}" id="live-dialog-title" ${taskEditRights(task).def ? `data-live-action="task-edit" role="button" tabindex="0" title="${tr('点击修改','Click to edit')}"` : ''}>${tx(task.title)}</h2><span class="drawer-title-actions">${task.owner_id !== state.actor.id && (task.reviewer_id === state.actor.id || (task.assigned_by || task.created_by) === state.actor.id) && task.status !== 'accepted' && !['done','abandoned'].includes(task.board_status) ? `<button class="btn small nudge-btn" data-live-action="task-nudge">${icon('bell')} ${tr('催办','Remind')}</button>` : ''}${taskEditRights(task).status ? `<button class="btn small primary" data-live-action="task-edit">${icon('edit')} ${tr('编辑详情','Edit details')}</button>` : ''}</span></div><div class="drawer-tags">${badge(task.status)}<span class="badge">${tr('成果版本','Submission')} ${task.submission_version}</span></div><div class="detail-grid"><div class="detail-field"><span>${tr('负责人','Owner')}</span><strong>${esc(displayName(task.owner_id))}</strong></div><div class="detail-field"><span>${tr('验收人','Reviewer')}</span><strong>${esc(displayName(task.reviewer_id))}</strong></div><div class="detail-field"><span>${tr('当前截止','Current due date')}</span><strong>${date(task.due_at)}</strong></div><div class="detail-field"><span>${tr('原始计划','Original due date')}</span><strong>${date(task.baseline_due_at)}</strong></div></div><div class="drawer-section ${taskEditRights(task).def ? 'is-editable' : ''}" ${taskEditRights(task).def ? `data-live-action="task-edit" role="button" tabindex="0" title="${tr('点击修改','Click to edit')}"` : ''}><h3>${tr('期望成果','Expected outcome')}${taskEditRights(task).def ? `<span class="drawer-edit-hint">${icon('edit')} ${tr('点击修改','Click to edit')}</span>` : ''}</h3><p class="drawer-description">${task.description ? tx(task.description) : `<span class="fine">${tr('还没有写期望成果。','No expected outcome yet.')}</span>`}</p></div><div class="drawer-section ${taskEditRights(task).criteria ? 'is-editable' : ''}" ${taskEditRights(task).criteria ? `data-live-action="task-edit" role="button" tabindex="0" title="${tr('点击修改','Click to edit')}"` : ''}><h3>${tr('验收标准','Acceptance criteria')}${taskEditRights(task).criteria ? `<span class="drawer-edit-hint">${icon('edit')} ${tr('点击修改','Click to edit')}</span>` : ''}</h3>${(task.criteria || []).length ? '' : `<p class="fine">${tr('还没有验收标准。','No acceptance criteria yet.')}</p>`}${(task.criteria || []).map((criterion,index) => `<div class="criterion"><span class="criterion-number">${index+1}</span><span>${tx(criterion)}</span></div>`).join('')}</div>`}<div class="drawer-section"><h3>${tr('当前成果','Current deliverable')}</h3>${latest ? `<article class="artifact"><h4>${icon('file')}${tx(latest.title)}</h4><p>${tx(latest.attachments?.length ? String(latest.description).replace(ATTACHMENT_LINE, '') : latest.description)}</p>${attachmentsView(task.id, latest.attachments)}${evidenceUrl ? `<a href="${esc(evidenceUrl)}" target="_blank" rel="noopener noreferrer">${esc(evidenceUrl)}</a>` : ''}<div class="artifact-meta">v${latest.version} · ${date(latest.created_at)}</div></article><div id="live-ai-region">${analysisView(task)}</div>` : `<p class="fine">${tr('尚未提交成果。','No deliverable submitted yet.')}</p>`}${canSubmit ? `<details class="live-space-top" ${latest ? '' : 'open'}><summary>${tr('提交新成果版本','Submit a deliverable version')}</summary><form class="submit-form" id="live-submission"><input type="hidden" name="expectedVersion" value="${task.version}">${field('description',tr('进展说明与成果证据','Progress and evidence'),'<textarea name="description" required minlength="2" maxlength="30000" rows="4" placeholder="'+tr('做了什么、结果如何；链接可以直接贴在这里','What you did and the result; paste links here too')+'"></textarea>')}<div class="field full assign-files"><span>${tr('附件（截图、文件，选填）','Attachments (optional)')}</span><div class="assign-drop" data-sub-drop>${icon('file')}<span>${tr('把文件拖到这里，或直接粘贴截图（⌘/Ctrl+V），或','Drop files, paste a screenshot (⌘/Ctrl+V), or')}</span><button type="button" class="btn" data-live-action="sub-pick">＋ ${tr('上传','Upload')}</button><input type="file" multiple hidden data-sub-file></div><ul class="assign-list" data-sub-list></ul></div><p class="hint">${tr('新版本将使旧验收退出当前结果，历史记录保留。','A new version invalidates the current acceptance while preserving its history.')}</p><button class="btn primary small" type="submit">${tr('提交成果','Submit deliverable')}</button><div class="form-error" id="live-form-error" role="alert"></div></form></details>` : ''}</div>${canReview ? `<div class="drawer-section"><h3>${tr('负责人验收','Manager acceptance')}</h3><form class="review-form" id="live-review"><input type="hidden" name="expectedVersion" value="${task.version}"><input type="hidden" name="submissionVersion" value="${task.submission_version}">${field('quality',tr('人工质量评分（0–10）','Human quality score (0–10)'),`<select name="quality"><option value="">${tr('请选择','Choose')}</option>${Array.from({length:11},(_,n)=>10-n).map(n=>`<option value="${n}">${n}</option>`).join('')}</select>`)}${field('note',tr('核验依据或退回原因','Verification evidence or revision reason'),'<textarea name="note" required minlength="5" maxlength="4000"></textarea>')}<label class="form-check"><input name="verified" type="checkbox"><span>${tr('我已实际核对当前版本的交付物和验收标准。','I inspected the actual current-version deliverable against the acceptance criteria.')}</span></label><div class="inline-actions"><button class="btn primary small" type="submit" name="decision" value="accept">${tr('确认验收通过','Confirm acceptance')}</button><button class="btn small" type="submit" name="decision" value="return">${tr('退回补充','Request more evidence')}</button></div><div class="form-error" id="live-review-error" role="alert"></div></form></div>` : ''}${currentReview ? `<div class="drawer-section"><h3>${tr('当前人工验收记录','Current human acceptance')} <span class="badge green">${currentReview.quality}/10</span></h3><div class="artifact"><p>${tx(currentReview.note)}</p><div class="artifact-meta">${esc(displayName(currentReview.reviewer_id))} · ${date(currentReview.created_at)}</div></div></div>` : ''}<div class="drawer-section ${(task.submissions || []).length || (task.reviews || []).length ? '' : 'is-empty'}"><h3>${tr('提交与验收历史','Submission and review history')}</h3><ul class="timeline">${(task.submissions || []).map(submission => `<li>${tr('提交成果','Submission')} v${submission.version} · ${tx(submission.title)}<small>${date(submission.created_at)}</small></li>`).join('')}${(task.reviews || []).map(review => `<li>${tr('人工验收','Human review')} v${review.submission_version} · ${esc(review.decision)} · ${tx(review.note)}<small>${esc(displayName(review.reviewer_id))} · ${date(review.created_at)}</small></li>`).join('')}</ul></div></div><div class="drawer-footer"><span>${tr('记录与版本由服务端校验保存','Records and versions are authorized and stored on the server')}</span><button class="btn small" data-live-action="close">${tr('关闭详情','Close details')}</button></div>`;
    overlay(body,true); openTaskId = task.id; drawSubFiles();
  }
  async function notificationPreview() { const result = await api.get('/notifications/preview'); notificationKey = crypto.randomUUID(); modal(tr('提醒预览','Reminder preview'), `<p class="fine">${tr('当前尚未发送。选定任务后，由负责人确认发送。','Nothing has been sent. A manager must confirm the selected tasks.')}</p><form id="live-send-notifications">${(result.items || []).map(task => `<label class="form-check"><input name="taskId" type="checkbox" value="${esc(task.id)}"><span>${tx(task.title)}<br><small>${esc(displayName(task.owner_id))} · ${date(task.due_at)}</small></span></label>`).join('') || empty(tr('暂无待提醒任务','No tasks need a reminder'))}</form>`,manager() ? submitButton('live-send-notifications',tr('确认发送选定提醒','Send selected reminders')) : ''); }
  async function refreshOkr() {
    const [objectives, krs] = await Promise.all([api.get('/objectives'),api.get('/key-results')]);
    state.objectives = objectives.items || []; state.krs = krs.items || [];
    const reviewable=state.krs.filter(k=>k.department_id===state.actor.department_id&&(manager()||k.owner_id===state.actor.id));
    const appraisals=await Promise.allSettled(reviewable.map(k=>api.get('/key-results/'+encodeURIComponent(k.id)+'/appraisal')));
    state.appraisals={};appraisals.forEach((result,i)=>{if(result.status==='fulfilled')state.appraisals[reviewable[i].id]=result.value;});
    window.WorkOSOkrBoard?.refreshed();
  }
  async function refreshData() {
    if (factoryOnly()) { state.tasks = []; state.objectives = []; state.krs = []; state.directory = [state.actor]; state.reviewers = []; state.former = []; state.appraisals = {}; state.executive = null; return; }
    const [tasks, objectives, krs, directory] = await Promise.all([api.get('/tasks'),api.get('/objectives'),api.get('/key-results'),api.get('/directory')]);
    state.tasks = tasks.items || []; state.objectives = objectives.items || []; state.krs = krs.items || []; state.directory = directory.items || []; state.reviewers = directory.reviewers || []; state.former = directory.former || [];
    const reviewable=state.krs.filter(k=>k.department_id===state.actor.department_id&&(manager()||k.owner_id===state.actor.id));
    const appraisals=await Promise.allSettled(reviewable.map(k=>api.get('/key-results/'+encodeURIComponent(k.id)+'/appraisal')));
    state.appraisals={};appraisals.forEach((result,i)=>{if(result.status==='fulfilled')state.appraisals[reviewable[i].id]=result.value;});
    if (!state.directory.some(user => user.id === state.actor.id)) state.directory.push(state.actor);
    window.WorkOSTaskBoard?.configure({api,actor:state.actor,directory:state.directory,former:state.former,language:i18n.lang,toast,newTask,assignTask:state.capabilities?.assignTasks?assignTask:null,openTask,onTasksChanged:items=>{state.tasks=items;}});
    await window.WorkOSTaskBoard?.refresh();
    state.details.clear();
    state.executive = null;
    if(state.actor.executiveAccess) state.executive = await api.get('/executive/summary');
    window.CompanySupport?.configure({api,actor:state.actor,language:i18n.lang,changed:render,showModal:modal,active:state.page==='knowledge',view:state.page});
    await window.CompanySupport?.refresh().catch(()=>{});
  }
  async function bootstrap() {
    closeOverlay(); state.loading = true; state.error = ''; render();
    if (/[?&]login_error=disabled\b/.test(window.location.search||'')) { window.history.replaceState(null,'',window.location.pathname+window.location.hash); loginUi.error=tr('您的账号已被管理员停用。如有疑问请联系公司管理员。','Your account has been disabled by an administrator.'); }
    try { state.capabilities = await api.get('/capabilities'); try { state.actor = await api.get('/me'); } catch (error) { if (error.status !== 401) throw error; clearPrivateData(); } if (state.actor) { if(state.page==='executive'&&!state.actor.executiveAccess)state.page='overview'; if(factoryOnly()){state.page='quality';if(routePage()!=='quality')window.history.replaceState(null,'','#quality');} await refreshData(); } }
    catch (error) { if (!handleAuthError(error)) state.error = explainError(error); }
    finally { state.loading = false; render(); }
  }
  async function perform(action, jobId) {
    if (busy) return;
    const retryAcknowledged = document.getElementById('live-bot-duplicate-ack')?.checked === true;
    busy = true; const analysisAction = ['analyze','retry-analysis','refresh-analysis'].includes(action), originId = openTaskId, generation = overlayGeneration, actorId = state.actor?.id;
    if (analysisAction && state.details.has(originId)) patchAnalysis(state.details.get(originId));
    try {
      if (action === 'refresh') await bootstrap();
      if (action === 'logout') { await api.delete('/auth/session'); clearPrivateData(); state.error = ''; render(); }
      if (action === 'sync-directory') {
        if (!manager()) return;
        const result = await api.request('/integrations/dingtalk/sync',{method:'POST',body:{}});
        await refreshData(); render();
        toast(tr('已同步成员：','Members synchronized: ') + result.synchronized);
      }
      if (action === 'notifications') await notificationPreview();
      if (action === 'load-performance') { for (const task of state.tasks.filter(task => task.status === 'accepted')) state.details.set(task.id,await api.get('/tasks/' + encodeURIComponent(task.id))); render(); }
      if (action === 'refresh-analysis') { stopAnalysisWatch(); await refreshAnalysis(true); }
      if (action === 'analyze' || action === 'retry-analysis') {
        const task = state.details.get(originId); if (!task || !actorId) return;
        if (action === 'retry-analysis') {
          const job = currentJob(task);
          if (!job || job.id !== jobId || !retryJobStates.has(job.status)) throw new Error(tr('请刷新后核对当前版本的可重试任务。','Refresh and check the retryable job for the current version.'));
          if (job.status === 'dispatch_unknown' && !retryAcknowledged) throw new Error(tr('请先确认原分析可能继续运行、重试可能重复消耗 Bot 额度。','First acknowledge that the original job may still run and retrying may consume Bot allowance again.'));
        }
        toast(botMode() ? tr('正在提交 Bot 分析请求…','Submitting the Bot assessment request…') : tr('正在分析当前成果，请稍候…','Assessing the current submission. Please wait…'));
        const path = '/tasks/' + encodeURIComponent(originId) + (action === 'retry-analysis' ? '/analysis-jobs/' + encodeURIComponent(jobId) + '/retry' : '/analyze');
        const result = await api.request(path,{method:'POST',body:{},timeout:70000});
        if (generation !== overlayGeneration || openTaskId !== originId || state.actor?.id !== actorId) return;
        if (result.mode === 'bot' && result.job) {
          task.analysisJobs = [result.job,...(task.analysisJobs || []).filter(job => job.id !== result.job.id)]; delete task.analysisPaused; patchAnalysis(task); startAnalysisWatch(task);
          toast(tr('Bot 请求已记录；提交受理不代表分析完成。','The Bot request was recorded. Dispatch acceptance is not assessment completion.'));
        } else { await refreshAnalysis(false); toast(tr('分析结果已记录，请核对证据与缺口。','Assessment recorded. Review its evidence and gaps.')); }
      }
    } catch (error) { if (error.code === 'CANCELLED') return; if (!handleAuthError(error)) { if (analysisAction && generation === overlayGeneration && openTaskId === originId) { const task = state.details.get(originId); if (task && error.status === 0 && action !== 'refresh-analysis') { stopAnalysisWatch(); task.analysisPaused = 'unconfirmed'; patchAnalysis(task); } toast(explainError(error)); } else { const target = document.getElementById('live-form-error') || document.getElementById('live-review-error'); if (target) target.textContent = explainError(error); else toast(explainError(error)); } } }
    finally { busy = false; if (analysisAction && openTaskId === originId && state.details.has(originId)) patchAnalysis(state.details.get(originId)); }
  }
  document.addEventListener('click',event => {
    const target = event.target.closest('button,[data-live-task],[data-live-action="task-edit"]'); if (target && target.tagName !== 'BUTTON' && target.dataset?.liveAction === 'task-edit' && (window.getSelection?.()?.toString() || event.target.closest?.('a'))) return; if (!target) { if (event.target.matches('[data-live-overlay]')) closeOverlay(); return; }
    if (target.dataset.liveLang) { const id = openTaskId; i18n.set(target.dataset.liveLang); if(!document.querySelector('[data-company-review]'))closeOverlay(); render(); if (id) openTask(id); return; }
    if (target.dataset.livePtab) { const wmsSide = ['wms', 'supply-chain'].includes(state.page); state[wmsSide ? 'wmsTab' : 'productTab'] = target.dataset.livePtab; if (state.page === 'product-cost') { window.location.hash = 'products'; return; } if (state.page === 'supply-chain') { window.location.hash = 'wms'; return; } render(); return; }
    if (target.dataset.livePage) { const page=target.dataset.livePage; if(!navs.some(item=>item[0]===page))return; if(page==='tasks'&&window.WorkOSTaskBoard?.viewing?.())window.WorkOSTaskBoard.viewAs('');if(page===state.page){state.menu=false;closeOverlay();if(!updateShellChrome())render();return;} window.location.hash=page==='knowledge'?'knowledge/':page; applyRoute(); return; }
    if (target.dataset.liveTask) { openTask(target.dataset.liveTask); return; }
    if (target.dataset.liveAppraisal) { openAppraisal(target.dataset.liveAppraisal); return; }
    if (target.dataset.liveObjectiveSource) { openObjectiveSource(target.dataset.liveObjectiveSource); return; }
    if (target.dataset.liveNewKr) { newKr(target.dataset.liveNewKr); return; }
    if (target.dataset.liveMeasure) { measurement(target.dataset.liveMeasure); return; }
    const action = target.dataset.liveAction; if (!action) return;
    if (action === 'close') { closeOverlay(); return; }
    if (action === 'task-nudge') { const id = openTaskId; if (!id) return; target.disabled = true; api.post('/tasks/' + encodeURIComponent(id) + '/nudge', {}).then(r => toast(r.sent ? tr('已催办，负责人会收到提醒','Reminder sent to the owner') : tr('今天已经催办过这个任务了','Already reminded today'))).catch(error => toast(explainError(error))).finally(() => { target.disabled = false; }); return; }
    if (action === 'task-edit' || action === 'task-edit-cancel') { const t = state.details.get(openTaskId); if (!t) return; editingTask = action === 'task-edit' ? t.id : null; taskDrawer(t); if (editingTask) requestAnimationFrame(() => document.querySelector('#live-task-edit [name="title"]:not([disabled]), #live-task-edit [name="status"]')?.focus()); return; }
    if (action === 'login') { window.location.assign(api.url('/auth/dingtalk/start')); return; }
    if (action === 'theme') { theme = theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('onelaser-workos-theme',theme); } catch {} if(!updateShellChrome())render(); return; }
    if (action === 'menu') { state.menu = !state.menu; if(!updateShellChrome())render(); return; }
    if (action === 'new-task') { newTask(); return; }
    if (action === 'sub-pick') { document.querySelector('[data-sub-file]')?.click(); return; }
    if (action === 'att-view') { viewAttachment(target.dataset.src, target.dataset.name || ''); return; }
    if (action === 'sub-rm') { subFiles.splice(Number(target.dataset.i), 1); drawSubFiles(); return; }
    if (action === 'assign-pick') { document.querySelector('[data-assign-file]')?.click(); return; }
    if (action === 'assign-rm') { assignFiles.splice(Number(target.dataset.i), 1); drawAssignFiles(); return; }
    if (action === 'assign-task') { if (state.capabilities?.assignTasks) assignTask(); return; }
    if (action === 'new-objective') { newObjective(); return; }
    if (action === 'list' || action === 'board') { state.board = action === 'board'; render(); return; }
    perform(action,target.dataset.liveJobId);
  });
  document.addEventListener('change', e => { if (e.target.matches?.('[data-assign-file]')) { addAssignFiles(e.target.files); e.target.value = ''; } if (e.target.matches?.('[data-sub-file]')) { addSubFiles(e.target.files); e.target.value = ''; } });
  document.addEventListener('dragover', e => { const f = e.target.closest?.('#live-submission'); if (!f || !e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; f.querySelector('[data-sub-drop]')?.classList.add('over'); });
  document.addEventListener('drop', e => { const f = e.target.closest?.('#live-submission'); if (!f || !e.dataTransfer?.files?.length) return; e.preventDefault(); f.querySelector('[data-sub-drop]')?.classList.remove('over'); addSubFiles(e.dataTransfer.files); });
  document.addEventListener('paste', e => { if (!e.target.closest?.('#live-submission')) return; const files = [...(e.clipboardData?.files || [])]; if (!files.length) return; e.preventDefault(); addSubFiles(files); });
  document.addEventListener('dragover', e => { const f = e.target.closest?.('#live-assign-task'); if (!f || !e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; f.querySelector('[data-assign-drop]')?.classList.add('over'); });
  document.addEventListener('dragleave', e => { const z = e.target.closest?.('#live-assign-task'); if (z && !z.contains(e.relatedTarget)) z.querySelector('[data-assign-drop]')?.classList.remove('over'); });
  document.addEventListener('drop', e => { const f = e.target.closest?.('#live-assign-task'); if (!f || !e.dataTransfer?.files?.length) return; e.preventDefault(); f.querySelector('[data-assign-drop]')?.classList.remove('over'); addAssignFiles(e.dataTransfer.files); });
  document.addEventListener('paste', e => { if (!e.target.closest?.('#live-assign-task') && !document.querySelector('#overlay-root #live-assign-task')) return; const files = [...(e.clipboardData?.files || [])]; if (!files.length) return; e.preventDefault(); addAssignFiles(files); });
  document.addEventListener('input',event => { if (event.target.tagName === 'TEXTAREA' && event.target.closest?.('#overlay-root .modal')) fitTextarea(event.target); if (event.target.id === 'live-search') { state.search = event.target.value; const results = document.getElementById('live-task-results'); results.innerHTML = state.board ? board(filteredTasks()) : `<div class="table-wrap"><table class="task-table live-task-table"><thead><tr><th>${tr('任务 / 关键结果','Task / key result')}</th><th>${tr('负责人','Owner')}</th><th>${tr('状态','Status')}</th><th>${tr('截止时间','Due date')}</th><th>${tr('成果版本','Submission')}</th></tr></thead><tbody>${taskRows(filteredTasks())}</tbody></table></div>`; document.querySelector('.filter-total').textContent = filteredTasks().length + ' ' + tr('项','tasks'); } });
  document.addEventListener('change',event => { if (event.target.id === 'live-status') { state.status = event.target.value; render(); } if (event.target.id === 'live-owner') updateTaskOptions(); if(event.target.id==='live-okr-owner'){state.okrOwner=event.target.value;render();} });
  document.addEventListener('submit',async event => {
    const form = event.target; if (!form.id?.startsWith('live-')) return; event.preventDefault(); if (busy) return;
    const data = new FormData(form), values = Object.fromEntries(data), id = openTaskId, errorTarget = form.querySelector('[role="alert"]') || document.getElementById('live-form-error');
    const buttons = Array.from(document.querySelectorAll('[type="submit"]')); buttons.forEach(button => button.disabled = true); busy = true;
    try {
      if (form.id === 'live-email') { const r = await api.request('/me/profile',{method:'PATCH',body:{email:String(values.email||'').trim()}}); state.actor.email = r.email; const self=state.directory.find(u=>u.id===state.actor.id); if(self)self.email=r.email; }
      if (form.id === 'live-names') { const r = await api.request('/me/profile',{method:'PATCH',body:{nameZh:String(values.nameZh||'').trim(),nameEn:String(values.nameEn||'').trim()}}); Object.assign(state.actor,{name_zh:r.name_zh,name_en:r.name_en}); const self=state.directory.find(u=>u.id===state.actor.id); if(self)Object.assign(self,{name_zh:r.name_zh,name_en:r.name_en}); }
      if (form.id === 'live-assign-task') { const created = await api.post('/tasks/assign',{assigneeId:values.assigneeId,title:values.title.trim(),dueAt:new Date(values.dueAt).toISOString(),description:values.description.trim()+(String(values.support||'').trim()?'\n\n'+tr('我会提供的支持：','Support I will give: ')+String(values.support).trim():''),criteria:values.criteria.split('\n').map(v=>v.trim()).filter(Boolean),...(values.priority?{priority:values.priority}:{})}); await uploadAssignFiles(created?.id||created?.task?.id); }
      if (form.id === 'live-new-task') await api.post('/tasks',{title:values.title.trim(),description:values.description.trim(),ownerId:values.ownerId,reviewerId:values.reviewerId,dueAt:new Date(values.dueAt).toISOString(),criteria:values.criteria.split('\n').map(value=>value.trim()).filter(Boolean),...(values.krId ? {krId:values.krId} : {}),...(values.boardGroupId?{boardGroupId:values.boardGroupId}:{}),...(values.boardPriority?{boardPriority:values.boardPriority}:{}),...(values.boardCategory?{boardCategory:values.boardCategory}:{}),...(values.parentTaskId?{parentTaskId:values.parentTaskId}:{})});
      if (form.id === 'live-new-objective') await api.post('/objectives',{title:values.title.trim(),level:values.level,ownerId:values.ownerId,planning:window.WorkOSOkr.readPlanning(values)});
      if (form.id === 'live-new-kr') await api.post('/objectives/' + encodeURIComponent(form.dataset.objectiveId) + '/key-results',{title:values.title.trim(),baseline:Number(values.baseline),target:Number(values.target),direction:values.direction,unit:values.unit.trim(),planning:window.WorkOSOkr.readPlanning(values,true)});
      if (form.id === 'live-appraisal') { const kind=form.dataset.kind; state.appraisals[form.dataset.krId]=await api.post('/key-results/'+encodeURIComponent(form.dataset.krId)+'/'+kind+'-evaluation',{expectedVersion:Number(form.dataset.version),score:Number(values.score),note:values.note.trim(),...(kind==='self'?{evidence:values.evidence.trim()}:{selfAppraisalId:form.dataset.selfId,verifiedEvidence:data.has('verified')})}); }
      if (form.id === 'live-measure') { const kr = state.krs.find(item => item.id === form.dataset.krId),actual=typeof values.actual==='string'?values.actual.trim():''; if(!kr||!window.WorkOSOkr.metric(kr).quantified)throw new Error(tr('未设量化指标，不能记录实际值。','No quantitative metric is set; an actual value cannot be recorded.')); if(actual===''||!Number.isFinite(Number(actual)))throw new Error(tr('请填写有效的实际值；空白不会记录为零。','Enter a valid actual value. A blank is not recorded as zero.')); await api.post('/key-results/' + encodeURIComponent(kr.id) + '/measurements',{expectedVersion:kr.version,actual:Number(actual),source:values.source.trim(),note:values.note.trim()}); }
      if (form.id === 'live-task-edit') { const t = state.details.get(id), body = { expectedVersion:Number(form.dataset.version) };
        const crit = String(values.criteria ?? '').split('\n').map(v => v.trim()).filter(Boolean), due = values.dueAt ? new Date(values.dueAt).toISOString() : null;
        if (values.title !== undefined && values.title.trim() !== t.title) body.title = values.title.trim();
        if (values.status !== undefined && values.status !== (t.board_status || 'not_started')) body.status = values.status;
        if (values.priority !== undefined && values.priority !== (t.board_priority || '')) body.priority = values.priority;
        if (due && localInput(due) !== localInput(t.due_at)) body.dueAt = due;
        if (values.ownerId && values.ownerId !== t.owner_id) body.ownerId = values.ownerId;
        if (values.description !== undefined && values.description.trim() !== t.description) body.description = values.description.trim();
        if (values.criteria !== undefined && JSON.stringify(crit) !== JSON.stringify(t.criteria || [])) { if (!crit.length) throw new Error(tr('请至少写一条验收标准。','Write at least one acceptance criterion.')); body.criteria = crit; }
        if (Object.keys(body).length > 1) await api.post('/tasks/' + encodeURIComponent(id) + '/board', body);
        editingTask = null; }
      if (form.id === 'live-submission') { const attachmentIds = await uploadSubFiles(id); await api.post('/tasks/' + encodeURIComponent(id) + '/submissions',{expectedVersion:Number(values.expectedVersion),description:values.description.trim(),...(attachmentIds.length ? {attachmentIds} : {})}); subFiles = []; }
      if (form.id === 'live-review') { const decision = event.submitter?.value || 'accept'; if (decision === 'accept' && (!data.has('verified') || values.quality === '' || !Number.isInteger(Number(values.quality)))) throw new Error(tr('请选择质量评分并确认已实际核对当前成果。','Choose a quality score and confirm you inspected the current deliverable.')); if (event.submitter) { event.submitter.dataset.label = event.submitter.textContent; event.submitter.textContent = tr('提交中…','Saving…'); } await api.post('/tasks/' + encodeURIComponent(id) + '/reviews',{expectedVersion:Number(values.expectedVersion),submissionVersion:Number(values.submissionVersion),decision,...(decision === 'accept' ? {quality:Number(values.quality),verifiedCurrentSubmission:true} : {}),note:values.note.trim()}); reviewDone = decision === 'accept' ? [tr('谢谢评分！已验收通过','Thanks for scoring! Accepted'), tr(`评分 ${values.quality}/10`,`Score ${values.quality}/10`)] : [tr('已退回补充','Sent back for more evidence'), tr('已通知负责人','The owner was notified')]; }
      if (form.id === 'live-send-notifications') { const taskIds = data.getAll('taskId'); if (!taskIds.length) throw new Error(tr('请先选择需要提醒的任务。','Select at least one task to remind.')); const result = await api.post('/notifications/send',{taskIds,idempotencyKey:notificationKey}); if (result.accepted && result.status === 'queued') { closeOverlay(); render(); toast(tr('已提交钉钉发送队列，尚不能确认送达。','Submitted to DingTalk. Delivery has not been confirmed.')); return; } throw new Error(result.status === 'unknown' ? tr('发送受理状态待核实，请勿重复发送；保留同一次请求以便核对。','The sending status is uncertain. Do not resend; retain this request for verification.') : tr('服务未确认受理，提醒尚未发送。','The service did not confirm acceptance. No delivery has been confirmed.')); }
      await refreshData(); closeOverlay(); render(); if (id && ['live-submission','live-review','live-task-edit'].includes(form.id)) await openTask(id); if (reviewDone) celebrate(...reviewDone); else toast(tr('服务端已确认保存。','The server confirmed your changes.'));
    } catch (error) { if (!handleAuthError(error)) {
        if (form.id === 'live-review' && error?.code === 'VERSION_CONFLICT' && id) { await openTask(id).catch(() => {}); const again = document.getElementById('live-review'); if (again) { for (const [name, value] of [['quality', values.quality], ['note', values.note]]) if (again.elements[name] && value !== undefined) again.elements[name].value = value; if (again.elements.verified) again.elements.verified.checked = data.has('verified'); } const target = again?.querySelector('[role="alert"]'); if (target) target.textContent = explainError(error); else toast(explainError(error)); }
        else if (errorTarget) errorTarget.textContent = explainError(error); else toast(explainError(error)); } }
    finally { busy = false; reviewDone = null; buttons.forEach(button => { button.disabled = false; if (button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label; } }); const task = state.details.get(openTaskId); if (task) patchAnalysis(task); }
  });
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape') { closeOverlay(); if (state.menu) { state.menu = false; if(!updateShellChrome())render(); } }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-live-task]')) { event.preventDefault(); openTask(event.target.dataset.liveTask); }
    if (event.key === 'Tab') { const dialog = document.querySelector('#overlay-root [role="dialog"]'); if (!dialog) return; const focusable = Array.from(dialog.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex="0"]')).filter(element=>!element.disabled&&element.getClientRects().length); const first = focusable[0], last = focusable.at(-1); if (!first) { event.preventDefault(); return; } if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  });
  try { api = new window.WorkOSApi.Client({base:window.WORKOS_CONFIG.apiBase || '/api',language:()=>i18n.lang}); bootstrap(); }
  catch (error) { state.loading = false; state.error = explainError(error); render(); }
})();
