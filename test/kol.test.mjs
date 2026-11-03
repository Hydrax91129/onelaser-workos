import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const tick = () => new Promise(r => setTimeout(r, 0));
const kol = (o) => ({ upId:null, email:'', company:'', country:'US', socials:{}, upStatus:null, program:'', coupons:[], paid:0, approved:0, pending:0, stage:'partner', tier:'', platform:'', followers:null,
  niche:'', ownerId:null, ownerName:'', joinedAt:'2025-01-01T00:00:00Z', version:1, orders:0, sales:0, commission:0, orders30:0, sales30:0, sales90:0, lastOrderAt:null, ...o });
const LIST = {
  canManage:true, uppromote:'configured', lastSync:{ startedAt:'2026-11-02T09:59:00Z', finishedAt:'2026-11-02T10:00:00Z', ok:true, error:null, counts:{ affiliates:2, referrals:4 }, running:false },
  totals:{ orders:3, sales:1700, commission:85, orders30:2, sales30:1200, unpaidCommission:35 },
  months:[{ month:'2026-09', orders:1, sales:500, commission:25 }, { month:'2026-10', orders:2, sales:1200, commission:60 }],
  owners:[{ id:'m2', name:'陈一' }, { id:'m3', name:'许夏' }],
  items:[
    kol({ id:'up-11', upId:11, name:'Making At Home', email:'steve@example.com', upStatus:'active', coupons:['makingathome'], socials:{ instagram:'makingathome', youtube:'https://youtube.com/@mah', website:'javascript:alert(1)' },
      tier:'S', stage:'content_live', followers:52000, ownerId:'m2', ownerName:'陈一', orders:2, sales:1500, sales30:1000, orders30:1, paid:100, approved:20, lastOrderAt:'2026-10-20T00:00:00Z' }),
    kol({ id:'k-hand', name:'<img src=x onerror=alert(1)>', stage:'negotiating', tier:'A', sales30:0 }),
  ],
};
const DETAIL = {
  canManage:true,
  kol:{ ...LIST.items[0], phone:'555', region:'IA', city:'Waukee', address:'1 Main St', link:'https://www.1laser.com?sca_ref=11', customLink:'', products:'LF-60', fee:'$500 / video', notes:'Great fit', syncedAt:'2026-11-02T10:00:00Z', updatedAt:'2026-11-01T00:00:00Z', updatedByName:'林楠' },
  referrals:[{ id:1, orderNumber:'1006', quantity:1, sales:1000, commission:50, status:'paid', tracking:'Tracked by coupon', coupon:'', createdAt:'2026-10-20T00:00:00Z' }],
  collabs:[{ id:'c1', kind:'sample', happenedOn:'2026-10-01', product:'LF-60', cost:1899, url:'', note:'UPS', byName:'陈一', createdAt:'2026-10-01T00:00:00Z' }],
};

function setup(list = LIST, detail = DETAIL) {
  const { window, document } = parseHTML('<!doctype html><html><body><main id="app"></main><div id="overlay-root"></div></body></html>');
  const context = { window, document, console, Date, URL, Blob, setTimeout, clearTimeout, FormData:FormDataShim };
  vm.runInNewContext(readFileSync(new URL('../dist/kol.js', import.meta.url), 'utf8'), context);
  const calls = [];
  const api = {
    get:async p => { calls.push(['GET', p]); return structuredClone(p === '/kol/kols' ? list : detail); },
    post:async (p, b) => { calls.push(['POST', p, b]); return p === '/kol/sync' ? { counts:{ affiliates:2, referrals:4, added:1 } } : structuredClone(detail); },
    request:async (p, o) => { calls.push([o.method, p, o.body]); return structuredClone(detail); },
    delete:async p => { calls.push(['DELETE', p]); return structuredClone(detail); },
  };
  let lang = 'zh';
  const toasts = [];
  const ctx = { api, state:() => ({ actor:{ id:'m2' } }), lang:() => lang, rerender:() => { document.getElementById('app').innerHTML = window.WorkOSKol.render(); },
    toast:t => toasts.push(t), closeOverlay:() => { document.getElementById('overlay-root').innerHTML = ''; }, modal:(title, body, actions) => { document.getElementById('overlay-root').innerHTML = `<div class="modal"><h2>${title}</h2>${body}${actions}</div>`; } };
  window.WorkOSKol.configure(ctx);
  return { window, document, calls, ctx, toasts, setLang:l => { lang = l; } };
}
// linkedom has no FormData; enough of one for these forms.
class FormDataShim {
  constructor(form) { this.entries = [...form.querySelectorAll('[name]')].map(el => [el.getAttribute('name'),
    el.tagName === 'SELECT' ? (el.querySelector('option[selected]') || el.querySelector('option'))?.getAttribute('value') ?? '' : el.tagName === 'TEXTAREA' ? (el.value ?? el.textContent) : (el.value ?? el.getAttribute('value') ?? '')]); }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
}
const plain = v => JSON.parse(JSON.stringify(v));
const click = (window, el) => el.dispatchEvent(new window.Event('click', { bubbles:true }));

test('KOL list: KPIs, sync status, escaped names, safe social links and filters', async () => {
  const { window, document, ctx, setLang } = setup();
  ctx.rerender(); await tick();
  const page = document.getElementById('app');
  assert.match(page.textContent, /KOL 管理[\s\S]*UpPromote 已同步[\s\S]*2 位 KOL，4 笔推荐订单/);
  assert.match(page.querySelector('.rma-kpis').textContent, /\$1,200[\s\S]*\$1,700[\s\S]*\$35/);
  assert.equal(page.querySelectorAll('.kol-bar').length, 2);
  assert.equal(page.querySelectorAll('tbody tr.rma-row').length, 2);
  assert.ok(page.innerHTML.includes('&lt;img src=x'), 'names are escaped');
  const hrefs = [...page.querySelectorAll('.kol-social')].map(a => a.getAttribute('href'));
  assert.ok(hrefs.includes('https://www.instagram.com/makingathome') && hrefs.includes('https://youtube.com/@mah'));
  assert.ok(!hrefs.some(h => /^javascript:/i.test(h)), 'only http(s) links');
  assert.match(page.querySelector('tbody tr').textContent, /Making At Home/, 'sorted by 30-day sales');
  click(window, page.querySelector('[data-kol="stage"][data-v="negotiating"]'));
  assert.equal(page.querySelectorAll('tbody tr.rma-row').length, 1);
  assert.match(page.querySelector('tbody tr').textContent, /手动添加/);
  setLang('en'); ctx.rerender();
  assert.match(page.textContent, /KOL management[\s\S]*Sync now/);
});

test('KOL list explains a missing UpPromote key and hides manager actions from viewers', async () => {
  const { document, ctx } = setup({ ...LIST, canManage:false, uppromote:'not_configured', lastSync:null });
  ctx.rerender(); await tick();
  const page = document.getElementById('app');
  assert.match(page.textContent, /UPPROMOTE_API_KEY/);
  assert.equal(page.querySelector('[data-kol="sync"]'), null);
  assert.equal(page.querySelector('[data-kol="new"]'), null);
});

test('KOL detail: synced contact details are read-only, our fields save with the version, log entries post', async () => {
  const { window, document, ctx, calls } = setup();
  ctx.rerender(); await tick();
  click(window, document.querySelector('[data-kol="open"][data-id="up-11"]')); await tick();
  const modal = document.getElementById('overlay-root');
  assert.match(modal.textContent, /steve@example.com[\s\S]*makingathome[\s\S]*来自 UpPromote/);
  assert.equal(modal.querySelector('#kol-edit [name="email"]'), null, 'no email field for UpPromote KOLs');
  assert.match(modal.textContent, /#1006[\s\S]*已付佣金/);
  assert.match(modal.querySelector('.kol-log').textContent, /2026-10-01 · 寄样[\s\S]*\$1,899\.00/);
  assert.equal(modal.querySelector('[data-kol="delete"]'), null, 'UpPromote KOLs cannot be deleted here');

  const form = modal.querySelector('#kol-edit');
  form.querySelector('[name="niche"]').value = 'Woodworking';
  form.querySelector('[name="followers"]').value = '60000';
  form.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true })); await tick(); await tick();
  const put = calls.find(c => c[0] === 'PUT');
  assert.deepEqual(plain(put), ['PUT', '/kol/kols/up-11', { expectedVersion:1, niche:'Woodworking', followers:60000 }]);

  const log = document.querySelector('#kol-collab');
  log.querySelector('[name="url"]').value = 'https://youtu.be/abc';
  log.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true })); await tick(); await tick();
  const post = calls.find(c => c[0] === 'POST' && c[1].endsWith('/collabs'));
  assert.equal(post[2].kind, 'sample'); assert.equal(post[2].url, 'https://youtu.be/abc'); assert.equal(post[2].cost, null);
});

test('Sync now calls the server and reports the counts', async () => {
  const { window, document, ctx, calls, toasts } = setup();
  ctx.rerender(); await tick();
  click(window, document.querySelector('[data-kol="sync"]')); await tick(); await tick();
  assert.ok(calls.some(c => c[0] === 'POST' && c[1] === '/kol/sync'));
  assert.match(toasts.join(' '), /同步完成：2 位 KOL，4 笔订单，新增 1 位/);
});
