import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const tick = () => new Promise(r => setTimeout(r, 0));
const GOOGLE = { id:'a1', service:'Google Workspace', category:'email', login:'sales@onelaser.test', url:'https://admin.google.com', mailboxType:'shared', status:'active',
  owner:{ id:'m2', name:'陈一', active:true, leaving:true }, mfaMethod:'app', mfaHolder:{ id:'m2', name:'陈一', active:true, leaving:true }, mfaNote:'', shared:true, notes:'',
  vaultRef:'https://start.1password.com/open/i?i=1', users:[{ id:'m3', name:'许夏', active:true }], version:2, relation:['owner'], canEdit:true,
  subscription:{ plan:'Starter', seats:5, cost:72, currency:'USD', cycle:'yearly', nextRenewal:'2026-11-20', storedRenewal:'2026-11-20', daysToRenewal:18, paymentLabel:'招行公司卡', cardLast4:'1234', autoRenew:true, invoiceContact:'', monthlyCost:6 },
  flags:[], history:[{ action:'it.account.update', byName:'周明', fields:['notes'], createdAt:'2026-11-02T10:00:00Z' }] };
const SHOP = { ...GOOGLE, id:'a2', service:'<b>Shopify</b>', category:'marketplace', mailboxType:'', mfaMethod:'none', mfaHolder:null, vaultRef:'', relation:['user'], canEdit:false, subscription:undefined, users:[] };

function setup({ isIt = true, check = { quarter:'2026-Q4', status:'pending' }, myAccounts = [GOOGLE] } = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><main id="app"></main><div id="overlay-root"></div></body></html>');
  const context = { window, document, console, Date, URL, setTimeout, clearTimeout, TextDecoder, CSS:{ escape:s => s }, FileReader:class {}, FormData:FormDataShim, fetch:async () => ({ ok:false }) };
  vm.runInNewContext(readFileSync(new URL('../dist/it.js', import.meta.url), 'utf8'), context);
  const calls = [];
  const access = { isIt, isExecutive:false, canSeeCost:isIt, seesAll:isIt, hasReports:false, configured:true, quarter:'2026-Q4', check:null };
  const api = {
    get:async p => { calls.push(['GET', p]);
      if (p === '/it/access') return access;
      if (p === '/it/my') return { accounts:myAccounts, check, openFlags:[{ id:'f9', service:'Shopify', kind:'needs_change', note:'换邮箱', createdAt:'2026-11-01T00:00:00Z' }] };
      if (p === '/it/accounts') return { items:[GOOGLE, SHOP] };
      if (p === '/it/summary') return { costs:{ USD:{ monthly:6, yearly:72 } }, byCategory:[{ category:'email', currency:'USD', monthly:6, yearly:72, count:1 }],
        renewals:[{ id:'a1', service:'Google Workspace', date:'2026-11-20', days:18, cost:72, currency:'USD', autoRenew:true, status:'active' }],
        noOwner:[], noVault:[{ id:'a2', service:'Shopify', login:'' }], leaving:[{ id:'a1', service:'Google Workspace', login:'', role:'owner', name:'陈一' }],
        counts:{ total:2, active:2, toCancel:0, noOwner:0, noVault:1, leaving:1, openFlags:1 } };
      if (p === '/it/flags') return { items:[{ id:'f1', accountId:'a1', service:'Google Workspace', login:'', kind:'stopped_using', note:'已转岗', byName:'许夏', createdAt:'2026-11-02T00:00:00Z' }] };
      if (p === '/it/checks') return { quarter:'2026-Q4', started:true, total:6, done:1, percent:17, people:[{ userId:'m3', name:'许夏', status:'pending', overdueDays:8 }] };
      if (p === '/it/people') return { items:[{ id:'m2', name:'陈一' }, { id:'m3', name:'许夏' }] };
      return structuredClone(GOOGLE); },
    post:async (p, b) => { calls.push(['POST', p, b]); if (p === '/it/accounts/import') { const e = new Error('有些行需要修改，本次没有导入任何数据。'); e.code = 'IT_IMPORT_INVALID'; e.fields = [{ path:'3', message:'找不到在职员工“王五”' }]; throw e; } return { id:'new', flagged:0 }; },
    request:async (p, o) => { calls.push([o.method, p, o.body]); return {}; },
    delete:async p => { calls.push(['DELETE', p]); return {}; },
  };
  let lang = 'zh';
  const ctx = { api, state:() => ({ actor:{ id:'m4' } }), lang:() => lang, rerender:() => { document.getElementById('app').innerHTML = window.WorkOSIt.render(); },
    toast:() => {}, closeOverlay:() => {}, modal:(title, body, actions) => { document.getElementById('overlay-root').innerHTML = `<div class="modal"><h2>${title}</h2>${body}${actions}</div>`; } };
  window.WorkOSIt.configure(ctx);
  return { window, document, calls, ctx, context, setLang:l => { lang = l; } };
}
// linkedom has no FormData; enough of one for these forms (unchecked boxes and radios are left out, multi-selects give every pick).
class FormDataShim {
  constructor(form) { this.entries = [...form.querySelectorAll('[name]')].filter(el => el.type !== 'file' && el.tagName !== 'BUTTON' && !((el.type === 'checkbox' || el.type === 'radio') && !(el.checked || el.hasAttribute('checked'))))
    .flatMap(el => el.tagName === 'SELECT' ? (el.hasAttribute('multiple') ? [...el.querySelectorAll('option[selected]')].map(o => [el.getAttribute('name'), o.getAttribute('value')])
      : [[el.getAttribute('name'), (el.querySelector('option[selected]') || el.querySelector('option'))?.getAttribute('value') ?? '']])
      : [[el.getAttribute('name'), el.tagName === 'TEXTAREA' ? (el.value ?? el.textContent) : (el.value ?? el.getAttribute('value') ?? '')]]); }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
}
const plain = v => JSON.parse(JSON.stringify(v));
const click = (window, el) => el.dispatchEvent(new window.Event('click', { bubbles:true }));
const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true }));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

test('IT page: password warning, my accounts, quarterly check with a "needs change" note', async () => {
  const { window, document, ctx, calls, setLang } = setup();
  ctx.rerender(); await settle();
  const page = document.getElementById('app');
  assert.match(page.textContent, /IT 账号与订阅/);
  assert.match(page.querySelector('.it-vault-note').textContent, /密码管理器/);
  assert.deepEqual([...page.querySelectorAll('[data-it="tab"]')].map(b => b.dataset.v), ['mine', 'all', 'summary', 'flags', 'checks', 'import'], 'IT sees every tab');
  assert.match(page.querySelector('.it-check h3').textContent, /2026-Q4/);
  assert.match(page.textContent, /我提交的反馈[\s\S]*换邮箱/);

  const form = page.querySelector('#it-check');
  form.querySelector('[name="ok-a1"][value="1"]').removeAttribute('checked'); form.querySelector('[name="ok-a1"][value="0"]').checked = true;
  submit(window, form); await settle();
  assert.match(page.querySelector('#it-check .wms-error').textContent, /哪里要改/, 'a "needs change" answer needs a note');
  page.querySelector('[name="note-a1"]').value = '共用人要加上赵然';
  page.querySelector('[name="missing"]').value = 'Canva';
  submit(window, page.querySelector('#it-check')); await settle();
  const sent = plain(calls.find(c => c[1] === '/it/checks/confirm')[2]);
  assert.deepEqual(sent, { items:[{ accountId:'a1', ok:false, note:'共用人要加上赵然' }], missing:'Canva' });

  setLang('en'); ctx.rerender();
  assert.match(page.textContent, /IT accounts & subscriptions[\s\S]*Never type passwords/);
});

test('IT page: all accounts table, escaping, filters, cost columns only when sent', async () => {
  const { window, document, ctx } = setup();
  ctx.rerender(); await settle();
  const page = document.getElementById('app');
  click(window, page.querySelector('[data-it="tab"][data-v="all"]'));
  assert.equal(page.querySelectorAll('tbody tr.rma-row').length, 2);
  assert.ok(page.innerHTML.includes('&lt;b&gt;Shopify&lt;/b&gt;'), 'service names are escaped');
  assert.match(page.querySelector('thead').textContent, /费用[\s\S]*续费/);
  assert.match(page.textContent, /USD 72[\s\S]*2026-11-20/);
  assert.match(page.textContent, /未开启/, '2FA off is called out');
  assert.match(page.textContent, /未链接/, 'missing vault link is called out');
  const sel = page.querySelector('[data-it-filter="category"]'); sel.querySelector('option[value="email"]').setAttribute('selected', '');
  sel.dispatchEvent(new window.Event('change', { bubbles:true }));
  assert.equal(page.querySelectorAll('tbody tr.rma-row').length, 1);

  const emp = setup({ isIt:false, check:{ quarter:'2026-Q4', status:'done', confirmedAt:'2026-11-03T00:00:00Z' }, myAccounts:[SHOP] });
  emp.ctx.rerender(); await settle();
  const p2 = emp.document.getElementById('app');
  assert.deepEqual([...p2.querySelectorAll('[data-it="tab"]')].map(b => b.dataset.v), ['mine'], 'employees only see their own tab');
  assert.ok(!/费用/.test(p2.querySelector('thead').textContent), 'no cost columns without cost data');
  assert.match(p2.querySelector('.it-check.done').textContent, /已确认/);
});

test('IT page: summary, flags, checks and import errors', async () => {
  const { window, document, ctx, calls, context } = setup();
  ctx.rerender(); await settle();
  const page = document.getElementById('app');
  click(window, page.querySelector('[data-it="tab"][data-v="summary"]'));
  assert.match(page.textContent, /USD 6[\s\S]*每月/);
  assert.match(page.textContent, /60 天内续费[\s\S]*Google Workspace[\s\S]*18 天后/);
  assert.match(page.textContent, /离职人员名下的账号[\s\S]*陈一/);
  click(window, page.querySelector('[data-it="tab"][data-v="flags"]'));
  assert.match(page.textContent, /已不再使用[\s\S]*已转岗[\s\S]*许夏/);
  click(window, page.querySelector('[data-it="tab"][data-v="checks"]'));
  assert.match(page.textContent, /17%[\s\S]*1 \/ 6/);
  click(window, page.querySelector('[data-it="tab"][data-v="import"]'));
  const form = page.querySelector('#it-import'), file = form.querySelector('input[type=file]');
  const bytes = new TextEncoder().encode('服务名称\nCanva\n');
  Object.defineProperty(file, 'files', { value:[{ name:'a.csv', size:bytes.length }] });
  context.FileReader = class { readAsArrayBuffer() { this.result = bytes.buffer; setTimeout(() => this.onload(), 0); } };
  submit(window, form); await settle();
  assert.equal(plain(calls.find(c => c[1] === '/it/accounts/import')[2]).dryRun, true, 'the default action only checks');
  assert.match(page.querySelector('.it-import-result.bad').textContent, /第 3 行：找不到在职员工“王五”/);
});

test('IT account dialog: vault button, subscription, edit sends only changes, flag to IT', async () => {
  const { window, document, ctx, calls } = setup();
  ctx.rerender(); await settle();
  click(window, document.querySelector('[data-it="tab"][data-v="all"]'));
  click(window, document.querySelector('tr[data-it="open"][data-id="a1"]')); await settle();
  const modal = document.getElementById('overlay-root');
  const vault = modal.querySelector('.it-vault a');
  assert.equal(vault.getAttribute('href'), 'https://start.1password.com/open/i?i=1');assert.equal(vault.getAttribute('rel'), 'noopener noreferrer');
  assert.match(modal.textContent, /订阅与付款[\s\S]*USD 72[\s\S]*招行公司卡 \*\*\*\*1234/);
  assert.match(modal.textContent, /离职中/, 'leaving owners are marked');
  assert.match(modal.querySelector('#it-account').textContent, /不要填在这里/);

  modal.querySelector('#it-account [name="notes"]').value = '销售共用';
  submit(window, modal.querySelector('#it-account')); await settle();
  const put = calls.find(c => c[0] === 'PUT');
  assert.deepEqual(plain(put), ['PUT', '/it/accounts/a1', { expectedVersion:2, notes:'销售共用' }]);

  modal.querySelector('#it-flag [name="note"]').value = '登录邮箱改了';
  submit(window, modal.querySelector('#it-flag')); await settle();
  assert.deepEqual(plain(calls.find(c => c[1] === '/it/accounts/a1/flags')[2]), { kind:'needs_change', note:'登录邮箱改了' });
});

test('index.html loads the IT module and the inbox knows IT reminders', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /it\.css\?v=/); assert.match(html, /it\.js\?v=/);
  assert.match(readFileSync(new URL('../dist/inbox.js', import.meta.url), 'utf8'), /it_reminder/);
  assert.match(readFileSync(new URL('../dist/live-app.js', import.meta.url), 'utf8'), /\['it','key','IT 账号与订阅'/);
});
