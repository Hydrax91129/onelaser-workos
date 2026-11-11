import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const tick = () => new Promise(r => setTimeout(r, 0));
const sample = level => ({ level, people:[{ id:'m2', name:'陈一' }], responsible:[{ id:'m2', name:'陈一' }], methods:[], terms:[],
  summary:{ count:2, total:15000, received:4000, outstanding:11000, deposited:6000, paidPct:26.67, overdue:6000, overdueCount:1, shippedUnpaid:6000, shippedUnpaidCount:1, aging:{ current:5000, d1_30:6000, d31_60:0, d61_90:0, d90:0 } },
  items:[
    { id:'r1', number:'AR-2026-0001', responsibleId:'m2', responsibleName:'陈一', invoiceDate:'2026-09-01', dueDate:'2026-10-01', paymentTerm:'net30', customer:'示例客户 A', contact:'示例联系人', kind:'PO', orderRef:'9001', amount:10000, dispatched:true, payMethod:'check', status:'deposit', received:4000, deposited:6000, outstanding:6000, paidPct:40, overdue:true, daysOverdue:40, fileCount:1 },
    { id:'r2', number:'AR-2026-0002', responsibleId:'m2', responsibleName:'陈一', invoiceDate:'2026-11-08', dueDate:'2026-12-08', paymentTerm:'net30', customer:'示例客户 B', contact:'', kind:'KOL', orderRef:'', amount:5000, dispatched:false, payMethod:'ach', status:'unpaid', received:0, deposited:0, outstanding:5000, paidPct:0, overdue:false, daysOverdue:0, fileCount:0 }] });
function setup(level, admin = false) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const calls = [];
  const api = { get:async url => { calls.push(['GET', url]); return url === '/finance/access' ? { people:[{ id:'m1', name:'林楠', admin:true, level:'manage' }, { id:'m3', name:'许夏', admin:false, level:'none' }] } : sample(level); }, post:async (url, b) => { calls.push(['POST', url, b]); return {}; }, patch:async () => ({}) };
  vm.runInNewContext(readFileSync(new URL('../dist/finance.js', import.meta.url), 'utf8'), { window, document, console, setTimeout, FormData:window.FormData, FileReader:class {} });
  const F = window.WorkOSFinance, app = document.getElementById('app');
  const draw = () => { app.innerHTML = F.render(); return app.innerHTML; };
  F.configure({ api, lang:() => 'zh', actor:() => ({ executiveAccess:admin }), rerender:draw, toast:() => {}, modal:() => {} });
  return { window, document, F, draw, calls };
}

test('finance receivables: totals, shipped-not-paid, overdue, paid % and filters; managers can add', async () => {
  const { window, document, draw } = setup('manage');
  draw(); await tick(); let html = draw();
  for (const t of ['应收总额', '\\$15,000.00', '待收', '\\$11,000.00', '逾期未收', '已发货未收款', '支票待到账', '待收账龄', 'AR-2026-0001', '示例客户 A', '支票已存待到账', '逾期 40 天', '40%', '新建应收']) assert.match(html, new RegExp(t), t);
  document.querySelector('[data-fin="status"][data-v="shipped"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  html = draw(); assert.match(html, /AR-2026-0001/); assert.doesNotMatch(html, /AR-2026-0002/, 'shipped-not-paid filter');
  document.querySelector('[data-fin="status"][data-v="unpaid"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  html = draw(); assert.match(html, /AR-2026-0002/); assert.doesNotMatch(html, /AR-2026-0001/);
  assert.doesNotMatch(html, /data-v="access"/, 'only main admins see the access tab');
});

test('finance: the responsible person sees a note and no add button; main admins set access per person', async () => {
  const own = setup('own'); own.draw(); await tick(); const h = own.draw();
  assert.match(h, /这里只显示你负责的单子/); assert.doesNotMatch(h, /新建应收/);
  const adm = setup('manage', true); adm.draw(); await tick();
  adm.document.querySelector('[data-fin="tab"][data-v="access"]').dispatchEvent(new adm.window.Event('click', { bubbles:true }));
  adm.draw(); await tick(); let html = adm.draw();
  assert.match(html, /主管理员（全部权限）/); assert.match(html, /许夏/);
  adm.document.querySelector('[data-fin="access"][data-user="m3"][data-v="view"]').dispatchEvent(new adm.window.Event('click', { bubbles:true }));
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(adm.calls.find(c => c[1] === '/finance/access' && c[0] === 'POST'))), ['POST', '/finance/access', { userId:'m3', level:'view' }]);
});
