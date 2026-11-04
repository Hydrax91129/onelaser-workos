import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

/* Fictional people only (SSN 000-00-0000 and routing 000000000 are never valid). */
const tick = () => new Promise(r => setTimeout(r, 0));
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
const click = (window, el) => el.dispatchEvent(new window.Event('click', { bubbles:true }));
const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true }));
const choose = (el, v) => el.querySelectorAll('option').forEach(o => o.getAttribute('value') === v ? o.setAttribute('selected', '') : o.removeAttribute('selected'));

const OWNER_PEOPLE = {
  isHr:true, global:true, canAssignRegion:true, canExportUs:true, sensitive:'configured', regions:{ us:'manage', cn:'manage', intl:'manage' }, lastUsExport:null,
  items:[
    { id:'u1', name:'Test Person', region:'us', departmentName:'Sales', status:'active', employmentType:'full_time', hasProfile:true, accountActive:true, access:'hr' },
    { id:'c1', name:'示例员工', region:'cn', departmentName:'市场', status:'active', employmentType:'full_time', hasProfile:true, accountActive:true, access:'hr' },
    { id:'n1', name:'New Hire', region:'', status:'active', hasProfile:false, accountActive:true, access:'hr' },
  ],
};
const CN_VIEWER = { ...OWNER_PEOPLE, global:false, canAssignRegion:false, canExportUs:false, regions:{ us:null, cn:'view', intl:'manage' }, items:[OWNER_PEOPLE.items[1]] };
const US = {
  person:{ id:'u1', name:'Test Person', title:'Sales rep', managerName:'', email:'', accountActive:true }, region:'us',
  profile:{ status:'active', employmentType:'full_time', version:4 }, access:'hr', canManage:true, canSetRegion:true, sensitive:'configured', tenureDays:10, events:[],
  details:{ legal:{ firstName:'Test', lastName:'Person', dateOfBirth:'1990-01-01' }, contact:{ address:{ city:'Sampletown', state:'CA' } }, workAuth:{ i9Status:'citizen' } },
  secrets:{ ssn:{ set:true, value:'000-00-0000' }, emergencyPhone:{ set:false } },
  payroll:{ set:true, version:'2026-11-01T00:00:00.000Z', data:{ comp:{ payType:'hourly', flsa:'non_exempt' }, w4:{ filingStatus:'mfj_or_qss', multipleJobs:true }, de4:{ allowances:2 }, family:{ maritalStatus:'married' },
    directDeposit:[{ bankName:'Example Bank', routing:'000000000', account:'000012345', accountType:'checking', split:'remainder' }], dependents:[{ name:'Sample Child', relation:'child', ssn:'000-00-0002' }] } },
  eeo:{ veteran:'not_protected' },
  salary:{ set:true, records:1, latestEffective:'2026-01-01', list:[{ id:'s1', effectiveDate:'2026-01-01', base:20, allowance:0, currency:'USD', period:'hour', byName:'Owner' }] },
  documents:[{ id:'d1', kind:'w4', name:'w4-signed.pdf', mime:'application/pdf', size:2048 }],
};
const CN = {
  ...US, person:{ ...US.person, id:'c1', name:'示例员工' }, region:'cn', access:'view', canManage:false, canSetRegion:false, eeo:undefined,
  details:{ cn:{ hukouType:'urban', hukouLocation:'示例市' } }, secrets:{ idNumber:{ set:true, value:'000000000000000000' }, bankAccount:{ set:true, value:'0000 0000 0000 0000' }, emergencyPhone:{ set:false } },
  payroll:{ set:true, version:'v', data:{ socialInsurance:{ pension:{ personal:8, employer:16 } } } },
  salary:{ set:true, records:1, list:[{ id:'s2', effectiveDate:'2026-01-01', base:10000, allowance:0, currency:'CNY', period:'month', byName:'Owner' }] },
};

function setup(detail = US, people = OWNER_PEOPLE) {
  const { window, document } = parseHTML('<!doctype html><html><body><main id="app"></main><div id="overlay-root"></div></body></html>');
  class FileReader { readAsDataURL(f) { this.result = 'data:' + f.type + ';base64,' + Buffer.from(f.name).toString('base64'); setTimeout(() => this.onload(), 0); } }
  const downloads = [];
  const context = { window, document, console, Date, URL:{ createObjectURL:b => { downloads.push(b); return 'blob:x'; }, revokeObjectURL:() => {} }, Blob, File, Buffer, setTimeout, clearTimeout, FileReader, FormData:FormDataShim, fetch:async () => ({ ok:false }) };
  vm.runInNewContext(read('upload-zone.js'), context);
  vm.runInNewContext(read('hr.js'), context);
  const calls = [];
  const api = {
    get:async p => { calls.push(['GET', p]); if (p === '/hr/people') return people; if (p === '/hr/reminders') return { items:[] }; return structuredClone(detail); },
    post:async (p, b) => { calls.push(['POST', p, b]); return p === '/hr/exports/us' ? { filename:'us-payroll-2026-11-02.csv', csv:'Employee\r\n', rows:1 } : {}; },
    request:async (p, o) => { calls.push([o.method, p, o.body]); return {}; },
    delete:async p => { calls.push(['DELETE', p]); return {}; },
  };
  const ctx = { api, state:() => ({ actor:{ id:'own' } }), lang:() => 'zh', rerender:() => { document.getElementById('app').innerHTML = window.WorkOSHr.render(); },
    toast:() => {}, closeOverlay:() => {}, modal:(title, body, actions) => { document.getElementById('overlay-root').innerHTML = `<div class="modal"><h2>${title}</h2>${body}${actions}</div>`; } };
  window.WorkOSHr.configure(ctx);
  return { window, document, calls, ctx, downloads };
}
class FormDataShim {
  constructor(form) { this.entries = [...form.querySelectorAll('[name]')].filter(el => el.type !== 'file' && el.type !== 'checkbox').map(el => [el.getAttribute('name'),
    el.tagName === 'SELECT' ? (el.querySelector('option[selected]') || el.querySelector('option'))?.getAttribute('value') ?? '' : el.tagName === 'TEXTAREA' ? (el.value ?? el.textContent) : (el.value ?? el.getAttribute('value') ?? '')]); }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
}
const open = async (env, id, tab = null) => { env.ctx.rerender(); await tick(); if (tab) click(env.window, env.document.querySelector(`[data-hr="region-tab"][data-r="${tab}"]`)); click(env.window, env.document.querySelector(`[data-hr="open"][data-id="${id}"]`)); await tick(); return env.document.getElementById('overlay-root'); };

test('HR regions: the owner gets US, China, other countries and not assigned; others only what they were given', async () => {
  const owner = setup();
  owner.ctx.rerender(); await tick();
  const tabs = d => [...d.querySelectorAll('[data-hr="region-tab"]')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
  assert.deepEqual(tabs(owner.document), ['美国 1', '中国 1', '海外其他地区 0', '未分配 1', '全部 3']);
  assert.deepEqual([...owner.document.querySelectorAll('tbody tr.rma-row')].map(r => r.dataset.id), ['u1'], 'first tab = US');
  const viewer = setup(CN, CN_VIEWER);
  viewer.ctx.rerender(); await tick();
  assert.deepEqual(tabs(viewer.document), ['中国 1只读', '海外其他地区 0', '全部 1'], 'no US tab without being the owner');
});

test('HR regions: the owner exports US payroll for the CPA, with the warning about SSNs', async () => {
  const env = setup();
  env.ctx.rerender(); await tick();
  const bar = env.document.querySelector('.hr-export');
  assert.ok(bar, 'export bar on the US tab'); assert.match(bar.textContent, /导出给 CPA/); assert.match(bar.textContent, /含 SSN[\s\S]*不要用普通邮件附件/);
  click(env.window, bar.querySelector('[data-hr="export-us"]')); await tick(); await tick();
  assert.ok(env.calls.some(c => c[0] === 'POST' && c[1] === '/hr/exports/us'));
  assert.equal(env.downloads.length, 1, 'the CSV is saved as a file');
  click(env.window, env.document.querySelector('[data-hr="region-tab"][data-r="cn"]'));
  assert.equal(env.document.querySelector('.hr-export'), null, 'only on the US tab');
  const viewer = setup(CN, CN_VIEWER); viewer.ctx.rerender(); await tick();
  assert.equal(viewer.document.querySelector('.hr-export'), null, 'only for the owner');
});

test('HR regions: values show in full with no reveal step; read-only gets no forms', async () => {
  const env = setup(CN, CN_VIEWER);
  const modal = await open(env, 'c1');
  assert.match(modal.textContent, /000000000000000000/); assert.match(modal.textContent, /0000 0000 0000 0000/, 'bank details too');
  assert.match(modal.textContent, /CNY 10,000/, 'salary records are listed');
  assert.match(modal.textContent, /养老：单位 %[\s\S]*16/, 'pay & tax shows without opening anything');
  assert.equal(modal.querySelector('[data-hr="reveal"]'), null); assert.equal(modal.querySelector('.hr-reason'), null);
  for (const id of ['hr-profile', 'hr-details', 'hr-payroll', 'hr-secrets', 'hr-salary', 'hr-event']) assert.equal(modal.querySelector('#' + id), null, id);
  assert.equal(modal.querySelector('[data-upload-zone]'), null, 'no upload for read-only');
  assert.match(modal.textContent, /只读/);
  assert.ok(!env.calls.some(c => c[1].endsWith('/payroll') || c[1].endsWith('/reveal')), 'everything comes with the record');
});

test('HR regions: the owner edits the US record: Rippling fields, direct deposit, dependents, EEO', async () => {
  const env = setup();
  const modal = await open(env, 'u1');
  assert.ok(modal.querySelector('[data-hr-region]'), 'owner can change the region');
  assert.equal(modal.querySelector('#hr-details [name="legal.dateOfBirth"]').getAttribute('value'), '1990-01-01');
  const form = modal.querySelector('#hr-details');
  form.querySelector('[name="legal.middleName"]').value = 'Q';
  form.querySelector('[name="workAuth.taxState"]').value = 'ca';
  submit(env.window, form); await tick(); await tick();
  const put = env.calls.find(c => c[0] === 'PUT' && c[1] === '/hr/people/u1/details');
  assert.equal(put[2].expectedVersion, 4); assert.equal(put[2].details.legal.middleName, 'Q'); assert.equal(put[2].details.workAuth.taxState, 'CA');

  const m2 = env.document.getElementById('overlay-root');
  const pay = m2.querySelector('#hr-payroll');
  assert.ok(pay.querySelector('[name="w4.multipleJobs"]').hasAttribute('checked'));
  assert.equal(pay.querySelector('[name="directDeposit.0.account"]').getAttribute('value'), '000012345');
  pay.querySelector('[name="directDeposit.1.bankName"]').value = 'Example Credit Union';
  pay.querySelector('[name="directDeposit.1.routing"]').value = '000000000';
  pay.querySelector('[name="directDeposit.1.account"]').value = '000067890';
  pay.querySelector('[name="commission.tiers.0.from"]').value = '0';
  pay.querySelector('[name="commission.tiers.0.rate"]').value = '2';
  pay.querySelector('[name="commission.tiers.1.from"]').value = '10000';
  submit(env.window, pay); await tick(); await tick();
  const p = plain(env.calls.find(c => c[0] === 'PUT' && c[1] === '/hr/people/u1/payroll')[2]);
  assert.equal(p.expectedVersion, '2026-11-01T00:00:00.000Z');
  assert.equal(p.payroll.directDeposit.length, 2, 'empty account rows are dropped');
  assert.equal(p.payroll.directDeposit[1].account, '000067890'); assert.equal(p.payroll.directDeposit[0].split, 'remainder');
  assert.equal(p.payroll.dependents.length, 1); assert.equal(p.payroll.dependents[0].ssn, '000-00-0002');
  assert.deepEqual(p.payroll.commission.tiers, [{ from:0, to:null, rate:2 }], 'tiers without a rate are dropped');
  assert.equal(p.payroll.w4.filingStatus, 'mfj_or_qss');

  const eeo = env.document.querySelector('#hr-eeo');
  assert.ok(eeo, 'EEO form for the owner'); assert.match(env.document.getElementById('overlay-root').textContent, /不能用于任何聘用决定/);
  choose(eeo.querySelector('[name="disability"]'), 'decline');
  submit(env.window, eeo); await tick();
  assert.deepEqual(plain(env.calls.find(c => c[1] === '/hr/people/u1/eeo')[2]), { ethnicity:'', gender:'', veteran:'not_protected', disability:'decline' });

  const sec = env.document.querySelector('#hr-secrets');
  assert.equal(sec.querySelector('[name="ssn"]').getAttribute('value'), '000-00-0000', 'the SSN form starts with the current value');
  const kinds = [...env.document.querySelectorAll('#hr-doc [name="kind"] option')].map(o => o.getAttribute('value'));
  assert.ok(['offer_letter', 'handbook_ack', 'w4', 'de4', 'i9', 'direct_deposit'].every(k => kinds.includes(k)));
});

test('HR regions: China region shows hukou, social insurance and special deductions; no US-only fields', async () => {
  const env = setup({ ...CN, access:'hr', canManage:true }, { ...OWNER_PEOPLE });
  const modal = await open(env, 'c1', 'cn');
  assert.match(modal.textContent, /户口性质/); assert.match(modal.textContent, /身份证 \/ 护照号/);
  for (const label of ['养老：个人 %', '住房公积金', '子女教育', '3 岁以下婴幼儿照护', '继续教育', '大病医疗', '住房贷款利息', '住房租金', '赡养老人']) assert.match(modal.textContent, new RegExp(label.replace(/[()%]/g, '.')), label);
  assert.equal(modal.querySelector('[name="w4.filingStatus"]'), null); assert.equal(modal.querySelector('#hr-eeo'), null);
  const kinds = [...modal.querySelectorAll('#hr-doc [name="kind"] option')].map(o => o.getAttribute('value'));
  assert.ok(!kinds.includes('w4') && kinds.includes('resume') && kinds.includes('contract'));
});

test('HR uploads: drop, paste and the picker all go through one box with the chosen type', async () => {
  const env = setup();
  const modal = await open(env, 'u1');
  const zone = modal.querySelector('[data-upload-zone="hr-doc"]');
  assert.ok(zone && zone.querySelector('[data-upload-pick]'), 'box with an Upload button');
  choose(modal.querySelector('#hr-doc [name="kind"]'), 'w4');
  const drop = new env.window.Event('drop', { bubbles:true, cancelable:true });
  Object.defineProperty(drop, 'dataTransfer', { value:{ files:[new File(['%PDF-1.4'], 'signed-w4.pdf', { type:'application/pdf' })], types:['Files'] } });
  zone.dispatchEvent(drop); await tick(); await tick(); await tick();
  const up = env.calls.filter(c => c[0] === 'POST' && c[1] === '/hr/people/u1/documents');
  assert.equal(up.length, 1); assert.equal(up[0][2].kind, 'w4'); assert.equal(up[0][2].name, 'signed-w4.pdf'); assert.equal(up[0][2].mime, 'application/pdf');

  const paste = new env.window.Event('paste', { bubbles:true, cancelable:true });
  Object.defineProperty(paste, 'clipboardData', { value:{ files:[new File(['img'], 'image.png', { type:'image/png' })] } });
  env.document.querySelector('#hr-doc [name="expiresOn"]').dispatchEvent(paste); await tick(); await tick(); await tick();
  const pasted = env.calls.filter(c => c[1] === '/hr/people/u1/documents')[1];
  assert.ok(pasted, 'paste inside the attachment area uploads');
  assert.match(pasted[2].name, /^截图-\d{8}-\d{6}\.png$/, 'pasted screenshots get a readable name');

  const bad = new env.window.Event('drop', { bubbles:true, cancelable:true });
  Object.defineProperty(bad, 'dataTransfer', { value:{ files:[new File(['x'], 'notes.txt', { type:'text/plain' })], types:['Files'] } });
  env.document.querySelector('[data-upload-zone="hr-doc"]').dispatchEvent(bad); await tick();
  assert.equal(env.calls.filter(c => c[1] === '/hr/people/u1/documents').length, 2, 'wrong type is refused before upload');
  assert.match(env.document.querySelector('[data-upload-msg="hr-doc"]').textContent, /不支持这种文件：notes\.txt/);

  let picked = 0; env.document.querySelector('[data-upload-input="hr-doc"]').click = () => { picked++; };
  click(env.window, env.document.querySelector('[data-upload-pick="hr-doc"]'));
  click(env.window, env.document.querySelector('[data-upload-zone="hr-doc"] .up-text'));
  assert.equal(picked, 2, 'the Upload button and a click on the box both open the file picker');
});

test('Organization & permissions: the owner assigns China / other-country access; there is no US choice', async () => {
  const run = async actor => {
    const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="overlay-root"></div></body></html>');
    const context = { window, document, requestAnimationFrame:fn => fn(), Intl, Date, console, URL, Image:class {} };
    vm.runInNewContext(read('people.js'), context);
    const calls = [];
    const members = { items:[{ id:'u1', display_name:'Test Person', active:true, grants:['products', 'hr_cn_view'] }, { id:'f1', display_name:'Factory Contact', active:true, grants:[], quality_factory:'dg' }, { id:'own', display_name:'Owner', active:true, executive:true, grants:[] }] };
    const api = { get:async p => { calls.push(['GET', p]); return p === '/org/members' ? structuredClone(members) : { items:[] }; }, request:async (p, o) => { calls.push([o.method, p, o.body]); return { id:'u1', grants:o.body.grants }; } };
    const state = { actor, capabilities:{ orgProfiles:true }, directory:[actor], page:'org' };
    const ctx = { api, state:() => state, lang:() => 'zh', rerender:() => { document.getElementById('app').innerHTML = window.WorkOSPeople.org(); }, toast:() => {}, explainError:e => e.message, refreshMe:async () => {} };
    window.WorkOSPeople.configure(ctx); ctx.rerender(); await tick(); await tick();
    return { window, document, calls };
  };
  const owner = await run({ id:'own', isAdmin:true, executiveAccess:true });
  assert.equal(owner.document.querySelector('[data-pp-hr="us"]'), null, 'the US region cannot be granted');
  assert.equal(owner.document.querySelector('[data-pp-hr="cn"][data-id="u1"] option[selected]').getAttribute('value'), 'view');
  assert.ok(owner.document.querySelector('[data-pp-hr="cn"][data-id="f1"]').hasAttribute('disabled'), 'factory contacts cannot get HR access');
  assert.match(owner.document.querySelector('[data-id="own"]').closest('tr').textContent, /全部地区/);
  const intl = owner.document.querySelector('[data-pp-hr="intl"][data-id="u1"]');
  choose(intl, 'manage'); intl.dispatchEvent(new owner.window.Event('change', { bubbles:true })); await tick();
  assert.deepEqual(plain(owner.calls.find(c => c[0] === 'PATCH')[2].grants).sort(), ['hr_cn_view', 'hr_intl_manage', 'products']);
  const cn = owner.document.querySelector('[data-pp-hr="cn"][data-id="u1"]');
  choose(cn, ''); cn.dispatchEvent(new owner.window.Event('change', { bubbles:true })); await tick();
  assert.ok(!owner.calls.filter(c => c[0] === 'PATCH')[1][2].grants.includes('hr_cn_view'), 'choosing None removes the grant');
  const admin = await run({ id:'a1', isAdmin:true, executiveAccess:false });
  assert.ok(admin.document.querySelector('[data-pp-hr="cn"][data-id="u1"]').hasAttribute('disabled'), 'in-app admins see but cannot change HR access');
});
