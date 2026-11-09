import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

test('eye = things that need me (stay until handled), bell = updates (cleared when read); clicking opens the task', async () => {
  const { window, document } = parseHTML('<!doctype html><html><body><div class="topbar"></div></body></html>');
  const context = { window, document, setInterval:() => 1, clearInterval:() => {}, console, Date };
  vm.runInNewContext(readFileSync(new URL('../dist/inbox.js', import.meta.url), 'utf8'), context);
  const calls = [], opened = [], now = new Date().toISOString();
  const items = [{ id:'a', source:'inbox', kind:'submission', taskId:'t1', title:'Price check', body:'Delivered', actorNames:{ zh:'林楠', en:'Nan' }, createdAt:now, read:false, action:true, done:false },
    { id:'b', source:'inbox', kind:'task_update', taskId:'t2', title:'Banner', body:'First draft done', createdAt:now, read:false, action:false, done:true },
    { id:'c', source:'nudge', kind:'okr', taskId:null, title:'', body:'Score your KRs', createdAt:now, read:true, action:true, done:true }];
  const api = { get:async p => { calls.push(['GET', p]); return { items, unread:2 }; }, post:async (p, b) => { calls.push(['POST', p, b]); return {}; } };
  window.WorkOSInbox.configure({ api, state:() => ({ actor:{ id:'u1' } }), lang:() => 'zh', openTask:id => opened.push(id) });
  await new Promise(r => setTimeout(r, 0));
  const draw = () => { document.querySelector('.topbar').innerHTML = window.WorkOSInbox.button(); };
  draw();
  assert.equal(document.querySelector('[data-inbox-toggle="action"] .inbox-dot').textContent, '1', 'one thing needs me (the handled OKR reminder is gone)');
  assert.equal(document.querySelector('[data-inbox-toggle="update"] .inbox-dot').textContent, '1', 'one unread update');
  document.querySelector('[data-inbox-toggle="action"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  const panel = document.querySelector('.inbox-panel').textContent;
  assert.match(panel, /需要你处理[\s\S]*成果待验收[\s\S]*林楠[\s\S]*Price check[\s\S]*去验收/); assert.doesNotMatch(panel, /Banner|Score your KRs/);
  document.querySelector('[data-inbox-open="a"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(opened[0], 't1'); assert.ok(calls.some(c => c[0] === 'POST' && c[1] === '/inbox/read' && c[2].ids.includes('a')));
  draw(); assert.equal(document.querySelector('[data-inbox-toggle="action"] .inbox-dot').textContent, '1', 'reading does not close it: the result still needs a review');
  document.querySelector('[data-inbox-toggle="update"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  assert.match(document.querySelector('.inbox-panel').textContent, /动态[\s\S]*Banner/);
  document.querySelector('[data-inbox-readall]').dispatchEvent(new window.Event('click', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  draw(); assert.equal(document.querySelector('[data-inbox-toggle="update"] .inbox-dot'), null, 'updates cleared once read');
});

test('a quality reminder in the inbox opens the quality page and that issue', async () => {
  const { window, document } = parseHTML('<!doctype html><html><body><div class="topbar"></div></body></html>');
  const context = { window, document, setInterval:() => 1, clearInterval:() => {}, console, Date };
  vm.runInNewContext(readFileSync(new URL('../dist/inbox.js', import.meta.url), 'utf8'), context);
  const shown = [], items = [{ id:'q', source:'nudge', kind:'quality', taskId:null, issueId:'i1', title:'', body:'品质问题 Q-2026-0001「Hydra」的整改方案已逾期 1 天', createdAt:new Date().toISOString(), read:false }];
  window.WorkOSQuality = { open:id => shown.push(id) }; window.location = { hash:'' };
  window.WorkOSInbox.configure({ api:{ get:async () => ({ items, unread:1 }), post:async () => ({}) }, state:() => ({ actor:{ id:'u1' } }), lang:() => 'zh', openTask:() => assert.fail('not a task') });
  await new Promise(r => setTimeout(r, 0));
  document.querySelector('.topbar').innerHTML = window.WorkOSInbox.button();
  document.querySelector('[data-inbox-toggle]').dispatchEvent(new window.Event('click', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  assert.match(document.querySelector('.inbox-panel').textContent, /品质问题[\s\S]*已逾期 1 天/);
  document.querySelector('[data-inbox-open="q"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  assert.equal(window.location.hash, '#quality'); assert.deepEqual(shown, ['i1']);
});
