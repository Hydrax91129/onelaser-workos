import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

/* Fictional people only (SSN 000-00-0000 is never valid). */
const tick = () => new Promise(r => setTimeout(r, 0));
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
const click = (window, el) => el.dispatchEvent(new window.Event('click', { bubbles:true }));
const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true }));

const PEOPLE = {
  isHr:true, global:false, canAssignRegion:false, sensitive:'configured', regions:{ us:'manage', cn:'view', intl:null },
  items:[
    { id:'u1', name:'Test Person', region:'us', departmentName:'Sales', status:'active', employmentType:'full_time', hasProfile:true, accountActive:true, access:'hr' },
    { id:'c1', name:'示例员工', region:'cn', departmentName:'市场', status:'active', employmentType:'full_time', hasProfile:true, accountActive:true, access:'view' },
  ],
};
const US = {
  person:{ id:'u1', name:'Test Person', title:'Sales rep', managerName:'', email:'', accountActive:true }, region:'us',
  profile:{ status:'active', employmentType:'full_time', version:4 }, access:'hr', canManage:true, canSetRegion:false, canRevealBank:true, sensitive:'configured', tenureDays:10, events:[],
  details:{ legal:{ firstName:'Test', lastName:'Person' }, contact:{ address:{ city:'Sampletown', state:'CA' } }, workAuth:{ i9Status:'citizen' } },
  secrets:{ ssn:{ set:true, hint:'****0000' }, bankRouting:{ set:true, hint:'****0000' }, bankAccount:{ set:true, hint:'****1234' }, emergencyPhone:{ set:false }, idNumber:{ set:false }, localTaxId:{ set:false } },
  payroll:{ set:true }, salary:{ set:false, records:0 }, documents:[{ id:'d1', kind:'w4', name:'w4-signed.pdf', mime:'application/pdf', size:2048 }],
};
const PAY = { payroll:{ comp:{ payType:'hourly', flsa:'non_exempt' }, w4:{ filingStatus:'mfj_or_qss', multipleJobs:true }, de4:{ allowances:2 }, family:{ maritalStatus:'married' } }, version:'2026-11-01T00:00:00.000Z' };

function setup(detail = US, people = PEOPLE) {
  const { window, document } = parseHTML('<!doctype html><html><body><main id="app"></main><div id="overlay-root"></div></body></html>');
  const files = [];
  class FileReader { readAsDataURL(f) { this.result = 'data:' + f.type + ';base64,' + Buffer.from(f.name).toString('base64'); setTimeout(() => this.onload(), 0); } }
  const context = { window, document, console, Date, URL, File, Buffer, setTimeout, clearTimeout, FileReader, FormData:FormDataShim, fetch:async () => ({ ok:false }) };
  vm.runInNewContext(read('upload-zone.js'), context);
  vm.runInNewContext(read('hr.js'), context);
  const calls = [];
  const api = {
    get:async p => { calls.push(['GET', p]); if (p === '/hr/people') return people; if (p === '/hr/reminders') return { items:[] }; if (p.endsWith('/payroll')) return structuredClone(PAY); return structuredClone(detail); },
    post:async (p, b) => { calls.push(['POST', p, b]); return p.endsWith('/reveal') ? { field:b.field, value:'000-00-0000' } : {}; },
    request:async (p, o) => { calls.push([o.method, p, o.body]); return o.body?.payroll ? { payroll:o.body.payroll, version:'2026-11-02T00:00:00.000Z' } : {}; },
    delete:async p => { calls.push(['DELETE', p]); return {}; },
  };
  const ctx = { api, state:() => ({ actor:{ id:'hr1' } }), lang:() => 'zh', rerender:() => { document.getElementById('app').innerHTML = window.WorkOSHr.render(); },
    toast:() => {}, closeOverlay:() => {}, modal:(title, body, actions) => { document.getElementById('overlay-root').innerHTML = `<div class="modal"><h2>${title}</h2>${body}${actions}</div>`; } };
  window.WorkOSHr.configure(ctx);
  return { window, document, calls, ctx, files };
}
class FormDataShim {
  constructor(form) { this.entries = [...form.querySelectorAll('[name]')].filter(el => el.type !== 'file' && el.type !== 'checkbox').map(el => [el.getAttribute('name'),
    el.tagName === 'SELECT' ? (el.querySelector('option[selected]') || el.querySelector('option'))?.getAttribute('value') ?? '' : el.tagName === 'TEXTAREA' ? (el.value ?? el.textContent) : (el.value ?? el.getAttribute('value') ?? '')]); }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
}
const open = async (env, id = 'u1', tab = null) => { env.ctx.rerender(); await tick(); if (tab) click(env.window, env.document.querySelector(`[data-hr="region-tab"][data-r="${tab}"]`)); click(env.window, env.document.querySelector(`[data-hr="open"][data-id="${id}"]`)); await tick(); return env.document.getElementById('overlay-root'); };

test('HR regions: tabs show only the regions the viewer was given, read-only is marked', async () => {
  const { window, document, ctx } = setup();
  ctx.rerender(); await tick();
  const page = document.getElementById('app');
  const tabs = [...page.querySelectorAll('[data-hr="region-tab"]')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
  assert.deepEqual(tabs, ['美国 1', '中国 1只读', '全部 2'], 'no "other countries" tab without a grant, no "not assigned" tab without owner rights');
  assert.deepEqual([...page.querySelectorAll('tbody tr.rma-row')].map(r => r.dataset.id), ['u1'], 'first tab = US');
  click(window, page.querySelector('[data-hr="region-tab"][data-r="cn"]'));
  assert.deepEqual([...page.querySelectorAll('tbody tr.rma-row')].map(r => r.dataset.id), ['c1']);
  click(window, page.querySelector('[data-hr="region-tab"][data-r="all"]'));
  assert.equal(page.querySelectorAll('tbody tr.rma-row').length, 2);
});

test('HR regions: the owner also gets the "not assigned" tab and a region picker', async () => {
  const people = { ...PEOPLE, global:true, canAssignRegion:true, regions:{ us:'manage', cn:'manage', intl:'manage' }, items:[...PEOPLE.items, { id:'n1', name:'New Hire', region:'', status:'active', hasProfile:false, accountActive:true, access:'hr' }] };
  const env = setup({ ...US, canSetRegion:true }, people);
  env.ctx.rerender(); await tick();
  assert.match(env.document.getElementById('app').textContent, /未分配 1/);
  const modal = await open(env);
  assert.ok(modal.querySelector('[data-hr-region]'), 'owner can change the region');
});

test('HR regions: read-only sees the US profile and pay & tax, but cannot edit or reveal bank details', async () => {
  const ro = { ...US, access:'view', canManage:false, canRevealBank:false, secrets:{ ...US.secrets, bankAccount:{ set:true, hint:'****' }, bankRouting:{ set:true, hint:'****' } } };
  const env = setup(ro);
  const modal = await open(env);
  assert.equal(modal.querySelector('#hr-details'), null); assert.equal(modal.querySelector('#hr-profile'), null); assert.equal(modal.querySelector('#hr-secrets'), null);
  assert.equal(modal.querySelector('[data-upload-zone]'), null, 'no upload for read-only');
  assert.match(modal.textContent, /Sampletown/); assert.match(modal.textContent, /只读/);
  assert.ok(modal.querySelector('[data-hr="reveal"][data-field="ssn"]'), 'SSN can be revealed with a reason');
  assert.equal(modal.querySelector('[data-hr="reveal"][data-field="bankAccount"]'), null);
  assert.match(modal.textContent, /需要可管理权限才能查看/);
  assert.ok(!modal.textContent.includes('1234'));
  assert.ok(!env.calls.some(c => c[1].endsWith('/payroll')), 'pay & tax is fetched only when opened');
  click(env.window, modal.querySelector('[data-hr="payroll-load"]')); await tick();
  assert.ok(env.calls.some(c => c[0] === 'GET' && c[1] === '/hr/people/u1/payroll'));
  assert.equal(modal.querySelector('#hr-payroll'), null);
  assert.match(modal.textContent, /Step 1\(c\) 申报身份[\s\S]*已婚合并申报/);
  assert.match(modal.textContent, /只用于 payroll 和福利/, 'compliance note next to family status');
  click(env.window, modal.querySelector('[data-live-action="close"]'));
});

test('HR regions: manage saves the US profile and the W-4 / commission block with versions', async () => {
  const env = setup();
  const modal = await open(env);
  const form = modal.querySelector('#hr-details');
  form.querySelector('[name="legal.middleName"]').value = 'Q';
  form.querySelector('[name="workAuth.taxState"]').value = 'ca';
  submit(env.window, form); await tick(); await tick();
  const put = env.calls.find(c => c[0] === 'PUT' && c[1] === '/hr/people/u1/details');
  assert.equal(put[2].expectedVersion, 4);
  assert.equal(put[2].details.legal.middleName, 'Q'); assert.equal(put[2].details.legal.firstName, 'Test');
  assert.equal(put[2].details.workAuth.taxState, 'CA', 'state codes are upper-cased');
  assert.equal(put[2].details.workAuth.i9Status, 'citizen');

  click(env.window, modal.querySelector('[data-hr="payroll-load"]')); await tick();
  const pay = modal.querySelector('#hr-payroll');
  assert.ok(pay, 'manage gets the form');
  assert.ok(pay.querySelector('[name="w4.multipleJobs"]').hasAttribute('checked'), 'saved checkboxes come back checked');
  pay.querySelector('[name="commission.tiers.0.from"]').value = '0';
  pay.querySelector('[name="commission.tiers.0.rate"]').value = '2';
  pay.querySelector('[name="commission.tiers.1.from"]').value = '10000';
  pay.querySelector('[name="w4.extraWithholding"]').value = '25';
  submit(env.window, pay); await tick(); await tick();
  const p = plain(env.calls.find(c => c[0] === 'PUT' && c[1] === '/hr/people/u1/payroll')[2]);
  assert.equal(p.expectedVersion, '2026-11-01T00:00:00.000Z');
  assert.deepEqual(p.payroll.commission.tiers, [{ from:0, to:null, rate:2 }], 'tiers without a rate are dropped');
  assert.equal(p.payroll.w4.extraWithholding, 25); assert.equal(p.payroll.w4.multipleJobs, true); assert.equal(p.payroll.w4.filingStatus, 'mfj_or_qss');
  assert.equal(p.payroll.de4.allowances, 2);
});

test('HR regions: China region shows hukou, social insurance and special deductions', async () => {
  const cn = { ...US, person:{ ...US.person, id:'c1', name:'示例员工' }, region:'cn', details:{ cn:{ hukouType:'urban' } }, secrets:{ ...US.secrets, idNumber:{ set:true, hint:'****0000' } } };
  const env = setup(cn);
  const modal = await open(env, 'c1', 'cn');
  assert.match(modal.textContent, /户口性质/); assert.match(modal.textContent, /身份证 \/ 护照号/);
  assert.ok(!/SSN/.test(modal.querySelector('.hr-detail').textContent.replace(/SSN \/ 身份证号/g, '')), 'no SSN field for China');
  click(env.window, modal.querySelector('[data-hr="payroll-load"]')); await tick();
  for (const label of ['养老：个人 %', '住房公积金', '子女教育', '3 岁以下婴幼儿照护', '继续教育', '大病医疗', '住房贷款利息', '住房租金', '赡养老人']) assert.match(modal.textContent, new RegExp(label.replace(/[()%]/g, '.')), label);
  const docKinds = [...modal.querySelectorAll('#hr-doc [name="kind"] option')].map(o => o.getAttribute('value'));
  assert.ok(!docKinds.includes('w4') && docKinds.includes('resume') && docKinds.includes('contract'));
});

test('HR uploads: drop, paste and the picker all go through one box with the chosen type', async () => {
  const env = setup();
  const modal = await open(env);
  const zone = modal.querySelector('[data-upload-zone="hr-doc"]');
  assert.ok(zone && zone.querySelector('[data-upload-pick]'), 'box with an Upload button');
  const kind = modal.querySelector('#hr-doc [name="kind"]');
  kind.querySelectorAll('option').forEach(o => o.removeAttribute('selected')); kind.querySelector('option[value="w4"]').setAttribute('selected', '');
  const drop = new env.window.Event('drop', { bubbles:true, cancelable:true });
  Object.defineProperty(drop, 'dataTransfer', { value:{ files:[new File(['%PDF-1.4'], 'signed-w4.pdf', { type:'application/pdf' })], types:['Files'] } });
  zone.dispatchEvent(drop); await tick(); await tick(); await tick();
  const up = env.calls.filter(c => c[0] === 'POST' && c[1] === '/hr/people/u1/documents');
  assert.equal(up.length, 1); assert.equal(up[0][2].kind, 'w4'); assert.equal(up[0][2].name, 'signed-w4.pdf'); assert.equal(up[0][2].mime, 'application/pdf');

  const z2 = env.document.querySelector('[data-upload-zone="hr-doc"]');
  const paste = new env.window.Event('paste', { bubbles:true, cancelable:true });
  Object.defineProperty(paste, 'clipboardData', { value:{ files:[new File(['img'], 'image.png', { type:'image/png' })] } });
  env.document.querySelector('#hr-doc [name="expiresOn"]').dispatchEvent(paste); await tick(); await tick(); await tick();
  const pasted = env.calls.filter(c => c[1] === '/hr/people/u1/documents')[1];
  assert.ok(pasted, 'paste inside the attachment area uploads');
  assert.match(pasted[2].name, /^截图-\d{8}-\d{6}\.png$/, 'pasted screenshots get a readable name');
  assert.ok(z2);

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

test('Organization & permissions: the owner assigns HR access per region; others cannot', async () => {
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
  const sel = owner.document.querySelector('[data-pp-hr="cn"][data-id="u1"]');
  assert.equal(sel.querySelector('option[selected]').getAttribute('value'), 'view');
  assert.ok(owner.document.querySelector('[data-pp-hr="us"][data-id="f1"]').hasAttribute('disabled'), 'factory contacts cannot get HR access');
  assert.match(owner.document.querySelector('[data-id="own"]').closest('tr').textContent, /全部地区/);
  const us = owner.document.querySelector('[data-pp-hr="us"][data-id="u1"]');
  const choose = (el, v) => el.querySelectorAll('option').forEach(o => o.getAttribute('value') === v ? o.setAttribute('selected', '') : o.removeAttribute('selected'));
  choose(us, 'manage'); us.dispatchEvent(new owner.window.Event('change', { bubbles:true })); await tick();
  assert.deepEqual(plain(owner.calls.find(c => c[0] === 'PATCH')[2].grants).sort(), ['hr_cn_view', 'hr_us_manage', 'products']);
  const cn = owner.document.querySelector('[data-pp-hr="cn"][data-id="u1"]');
  choose(cn, ''); cn.dispatchEvent(new owner.window.Event('change', { bubbles:true })); await tick();
  assert.ok(!owner.calls.filter(c => c[0] === 'PATCH')[1][2].grants.includes('hr_cn_view'), 'choosing None removes the grant');
  const admin = await run({ id:'a1', isAdmin:true, executiveAccess:false });
  assert.ok(admin.document.querySelector('[data-pp-hr="us"][data-id="u1"]').hasAttribute('disabled'), 'in-app admins see but cannot change HR access');
});
