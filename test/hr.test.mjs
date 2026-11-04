import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const tick = () => new Promise(r => setTimeout(r, 0));
const PEOPLE = {
  isHr:true, sensitive:'configured',
  items:[
    { id:'m2', name:'陈一', title:'市场专员', departmentName:'市场', managerName:'林楠', status:'active', employmentType:'full_time', hireDate:'2025-03-01', tenureDays:611, probationEnd:null, contractEnd:'2026-11-20', jobLevel:'P3', hasProfile:true, accountActive:true, access:'hr' },
    { id:'m3', name:'<b>许夏</b>', title:'', departmentName:'市场', managerName:'', status:'left', employmentType:'intern', hireDate:null, tenureDays:null, probationEnd:null, contractEnd:null, jobLevel:'', hasProfile:false, accountActive:false, access:'hr' },
  ],
};
const DETAIL = {
  person:{ id:'m2', name:'陈一', title:'市场专员', managerName:'林楠', email:'chen@example.com', accountActive:true },
  profile:{ status:'active', employmentType:'full_time', hireDate:'2025-03-01', contractEnd:'2026-11-20', jobLevel:'P3', notes:'内部备注', version:3 },
  access:'hr', sensitive:'configured', tenureDays:611, events:[{ id:'e1', kind:'joined', happenedOn:'2025-03-01', note:'', byName:'周明' }],
  secrets:{ idNumber:{ set:true, hint:'****1234', value:'TEST-0000-0000-1234' }, bankAccount:{ set:false }, emergencyPhone:{ set:false } },
  salary:{ set:true, records:1, latestEffective:'2026-01-01', list:[{ id:'s1', effectiveDate:'2026-01-01', base:12000, allowance:800, currency:'CNY', period:'month', reason:'年度调薪', byName:'周明' }] }, documents:[],
};

function setup(people = PEOPLE, detail = DETAIL) {
  const { window, document } = parseHTML('<!doctype html><html><body><main id="app"></main><div id="overlay-root"></div></body></html>');
  const context = { window, document, console, Date, URL, setTimeout, clearTimeout, CSS:{ escape:s => s }, FileReader:class {}, FormData:FormDataShim, fetch:async () => ({ ok:false }) };
  vm.runInNewContext(readFileSync(new URL('../dist/hr.js', import.meta.url), 'utf8'), context);
  const calls = [];
  const api = {
    get:async p => { calls.push(['GET', p]); if (p === '/hr/people') return people; if (p === '/hr/reminders') return { items:[{ kind:'contract_end', userId:'m2', name:'陈一', date:'2026-11-20', days:18 }] }; return structuredClone(detail); },
    post:async (p, b) => { calls.push(['POST', p, b]); return p.endsWith('/reveal') ? { field:b.field, value:b.field === 'salary' ? [{ id:'s1', effectiveDate:'2026-01-01', base:12000, allowance:800, currency:'CNY', period:'month', reason:'年度调薪', byName:'周明' }] : 'TEST-0000-0000-1234' } : {}; },
    request:async (p, o) => { calls.push([o.method, p, o.body]); return {}; },
    delete:async p => { calls.push(['DELETE', p]); return {}; },
  };
  let lang = 'zh';
  const ctx = { api, state:() => ({ actor:{ id:'m4' } }), lang:() => lang, rerender:() => { document.getElementById('app').innerHTML = window.WorkOSHr.render(); },
    toast:() => {}, closeOverlay:() => {}, modal:(title, body, actions) => { document.getElementById('overlay-root').innerHTML = `<div class="modal"><h2>${title}</h2>${body}${actions}</div>`; } };
  window.WorkOSHr.configure(ctx);
  return { window, document, calls, ctx, setLang:l => { lang = l; } };
}
// linkedom has no FormData; enough of one for these forms.
class FormDataShim {
  constructor(form) { this.entries = [...form.querySelectorAll('[name]')].filter(el => el.type !== 'file').map(el => [el.getAttribute('name'),
    el.tagName === 'SELECT' ? (el.querySelector('option[selected]') || el.querySelector('option'))?.getAttribute('value') ?? '' : el.tagName === 'TEXTAREA' ? (el.value ?? el.textContent) : (el.value ?? el.getAttribute('value') ?? '')]); }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
}
const plain = v => JSON.parse(JSON.stringify(v)); // objects built inside the vm have another realm's prototypes
const click = (window, el) => el.dispatchEvent(new window.Event('click', { bubbles:true }));

test('HR records list: HR sees KPIs and reminders, names are escaped, status filters work', async () => {
  const { window, document, ctx, setLang } = setup();
  ctx.rerender(); await tick();
  const page = document.getElementById('app');
  assert.match(page.textContent, /人事档案/);
  assert.match(page.querySelector('.hr-reminders').textContent, /陈一[\s\S]*合同到期[\s\S]*18 天后/);
  assert.equal(page.querySelectorAll('tbody tr.rma-row').length, 1, 'active view hides people who left');
  click(window, page.querySelector('[data-hr="view"][data-v="all"]'));
  assert.equal(page.querySelectorAll('tbody tr.rma-row').length, 2);
  assert.ok(page.innerHTML.includes('&lt;b&gt;许夏&lt;/b&gt;'), 'names are escaped');
  setLang('en'); ctx.rerender();
  assert.match(page.textContent, /HR records[\s\S]*Coming up/);
});

test('HR records list: a key that is not set is explained to HR', async () => {
  const { document, ctx } = setup({ ...PEOPLE, sensitive:'not_configured' });
  ctx.rerender(); await tick();
  assert.match(document.getElementById('app').querySelector('.wms-alert').textContent, /HR_DATA_KEY/);
});

test('HR detail: whoever may open the record sees values in full, but never in the list', async () => {
  const { window, document, calls, ctx } = setup();
  ctx.rerender(); await tick();
  click(window, document.querySelector('[data-hr="open"][data-id="m2"]')); await tick();
  const modal = document.getElementById('overlay-root');
  assert.match(modal.textContent, /TEST-0000-0000-1234/);
  assert.match(modal.textContent, /CNY 12,000/, 'salary history is a table');
  assert.ok(!modal.textContent.includes('[object Object]'));
  assert.ok(!calls.some(c => c[1]?.endsWith('/reveal')), 'no reveal step');
  assert.ok(!document.getElementById('app').textContent.includes('TEST-0000'), 'never shown in the list');
});

test('HR detail: profile save sends only changed fields with the current version', async () => {
  const { window, document, calls, ctx } = setup();
  ctx.rerender(); await tick();
  click(window, document.querySelector('[data-hr="open"][data-id="m2"]')); await tick();
  const form = document.getElementById('hr-profile');
  form.querySelector('[name="jobLevel"]').value = 'P4';
  form.querySelector('[name="contractEnd"]').value = '2029-11-20';
  form.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true })); await tick();
  const put = calls.find(c => c[0] === 'PUT');
  assert.equal(put[1], '/hr/people/m2/profile');
  assert.deepEqual(plain(put[2]), { expectedVersion:3, contractEnd:'2029-11-20', jobLevel:'P4' });
});

test('HR detail: managers get no sensitive section', async () => {
  const { window, document, ctx } = setup({ ...PEOPLE, isHr:false }, { ...DETAIL, access:'manager', secrets:undefined, salary:undefined, documents:undefined, profile:{ status:'active', employmentType:'full_time', jobLevel:'P3', version:3 } });
  ctx.rerender(); await tick();
  assert.equal(document.querySelector('.hr-reminders'), null);
  click(window, document.querySelector('[data-hr="open"][data-id="m2"]')); await tick();
  const modal = document.getElementById('overlay-root');
  assert.equal(modal.querySelector('#hr-profile'), null, 'read-only for managers');
  assert.ok(!/敏感资料|合同与证件/.test(modal.textContent));
});
