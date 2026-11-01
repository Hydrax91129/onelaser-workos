import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
function loadPeople(state, responses = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  class FD { constructor(form) { this.m = new Map(); form.querySelectorAll('input,select,textarea').forEach(el => { const n = el.getAttribute('name'); if (!n) return;
    if (el.tagName === 'SELECT') { const o = el.querySelector('option[selected]') || el.querySelector('option'); this.m.set(n, o ? o.getAttribute('value') : ''); }
    else if (el.getAttribute('type') === 'checkbox') { if (el.checked) this.m.set(n, 'on'); } else this.m.set(n, el.value ?? ''); }); }
    get(k) { return this.m.has(k) ? this.m.get(k) : null; } }
  const context = { window, document, requestAnimationFrame:fn => fn(), Intl, Date, console, URL, Image:class {}, FormData:FD };
  vm.runInNewContext(read('people.js'), context);
  const calls = [], toasts = [];
  const answer = (m, p, b) => { calls.push([m, p, b]); const r = responses[m + ' ' + p]; return typeof r === 'function' ? r(b) : r ?? { items:[] }; };
  const api = { get:async p => answer('GET', p), delete:async p => answer('DELETE', p), request:async (p, o) => answer(o.method, p, o.body) };
  const ctx = { api, state:() => state, lang:() => 'zh', rerender:() => {}, toast:t => toasts.push(t), explainError:e => e.message, refreshMe:async () => {}, reloadDirectory:async () => {}, apiBase:'/api' };
  window.WorkOSPeople.configure(ctx);
  return { window, document, calls, toasts };
}
const admin = { id:'kc', display_name:'KC', isAdmin:true, department_id:'d1' };
const state = (extra = {}) => ({ actor:admin, capabilities:{ orgProfiles:true, memberInvites:true, memberDisable:true }, directory:[admin], page:'org', ...extra });
const members = [
  { id:'kc', display_name:'KC', role:'manager', active:true, executive:true, admin:true, adminSource:'deployment', department_id:'d1', grants:[] },
  { id:'u2', display_name:'Lin', role:'manager', active:true, department_id:'d1', manager_id:'kc', grants:[], dingtalk:true },
  { id:'u3', display_name:'Xu', role:'employee', active:true, department_id:'d1', manager_id:'u2', grants:[] },
  { id:'u9', display_name:'Gone', role:'employee', active:false, disabled_at:'2026-10-30T00:00:00Z', department_id:'d1', grants:[], login_email:'gone@example.com' },
];

test('org page shows a status switch per member, locks self/executives, and lists disabled members with restore', () => {
  const { window } = loadPeople(state());
  window.WorkOSPeople._ui.org = { items:members };
  const html = window.WorkOSPeople.org();
  assert.match(html, /data-pp-status data-id="u2"/);
  assert.match(html, /data-pp-field="location" data-id="u3"/, 'admins edit work location inline');
  assert.doesNotMatch(html, /data-pp-status data-id="kc"/, 'cannot disable yourself or an executive');
  assert.match(html, /已停用成员[\s\S]*Gone[\s\S]*data-pp="enable" data-id="u9"/);
  assert.match(html, /data-pp="invite-open"/);
  assert.doesNotMatch(html, /老板看板/, 'executive column removed');
  assert.match(html, /钉钉/); assert.match(html, /gone@example\.com|邮箱/);
});

test('turning a member off asks who takes over open tasks, then disables with the chosen heir', async () => {
  const st = state();
  const { window, document, calls } = loadPeople(st, { 'GET /org/members/u3/open-tasks':{ owned:3, reviewing:0, reports:0 }, 'POST /org/members/u3/status':{ active:false, reassigned:{ owned:3, reviewing:0, reports:0 } } });
  window.WorkOSPeople._ui.org = { items:members };
  document.body.innerHTML = window.WorkOSPeople.org();
  const sw = document.querySelector('[data-pp-status][data-id="u3"]'); sw.checked = false;
  sw.dispatchEvent(new window.Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  const html = window.WorkOSPeople.org();
  assert.match(html, /停用 Xu？/); assert.match(html, /未完成任务 3 项/);
  assert.match(html, /<option value="u2" selected>Lin<\/option>/, 'defaults to the member\'s manager');
  document.body.innerHTML = html;
  document.getElementById('pp-disable').dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 0));
  const post = calls.find(c => c[0] === 'POST' && c[1] === '/org/members/u3/status');
  assert.equal(JSON.stringify(post[2]), JSON.stringify({ active:false, reassignTo:'u2' }));
});

test('inviting a member posts the form and shows the one-time link', async () => {
  const { window, document, calls } = loadPeople(state(), { 'POST /org/invites':b => ({ id:'i1', email:b.email, displayName:b.displayName, status:'pending', url:'https://craftos.app/#invite/' + 'a'.repeat(43), emailed:false }) });
  window.WorkOSPeople._ui.org = { items:members }; window.WorkOSPeople._ui.invites = { items:[], emailDelivery:false }; window.WorkOSPeople._ui.inviteOpen = true;
  document.body.innerHTML = window.WorkOSPeople.org();
  const f = document.getElementById('pp-invite');
  f.querySelector('[name=displayName]').value = 'Mike'; f.querySelector('[name=location]').value = 'Lake Forest, CA'; f.querySelector('[name=email]').value = 'mike@example.com';
  f.querySelectorAll('[name=managerId] option').forEach(o => o.removeAttribute('selected')); f.querySelector('[name=managerId] option[value="u2"]').setAttribute('selected', ''); f.querySelector('[name=products]').checked = true;
  f.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 0));
  const post = calls.find(c => c[1] === '/org/invites');
  assert.equal(post[2].email, 'mike@example.com'); assert.equal(post[2].location, 'Lake Forest, CA'); assert.equal(post[2].managerId, 'u2'); assert.equal(JSON.stringify(post[2].grants), '["products"]');
  const html = window.WorkOSPeople.org();
  assert.match(html, /邀请已生成/); assert.match(html, /#invite\/a{43}/); assert.match(html, /待接受的邀请[\s\S]*Mike/);
});

test('live app wires email sign-in, invite acceptance, disabled-account notice and no-access pages', () => {
  const live = read('live-app.js');
  assert.match(live, /'\/auth\/password'/); assert.match(live, /'\/auth\/email-code'/); assert.match(live, /'\/auth\/email-code\/verify'/);
  assert.match(live, /\/auth\/invite\/'\+inviteUi\.token\+'\/accept'/);
  assert.match(live, /login_error=disabled/);
  assert.match(live, /if\(!state\.capabilities\?\.passwordLogin\)return '';/, 'email login only when the backend supports it');
  assert.match(live, /noAccess\(tr\('产品管理区'/);
  assert.match(live, /ownerRow\.manager_id/, 'reviewer list includes the owner\'s manager');
});
