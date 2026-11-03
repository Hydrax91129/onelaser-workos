import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

test('inbox bell shows a red count and opens the task the item is about, marking it read', async () => {
  const { window, document } = parseHTML('<!doctype html><html><body><div class="topbar"></div></body></html>');
  const context = { window, document, setInterval:() => 1, clearInterval:() => {}, console, Date };
  vm.runInNewContext(readFileSync(new URL('../dist/inbox.js', import.meta.url), 'utf8'), context);
  const calls = [], opened = [];
  const items = [{ id:'a', source:'inbox', kind:'task_new', taskId:'t1', title:'Price check', body:'Due Nov 15', actorNames:{ zh:'林楠', en:'Nan' }, createdAt:new Date().toISOString(), read:false },
    { id:'b', source:'nudge', kind:'okr', taskId:null, title:'', body:'Score your KRs', createdAt:new Date().toISOString(), read:true }];
  const api = { get:async p => { calls.push(['GET', p]); return { items, unread:1 }; }, post:async (p, b) => { calls.push(['POST', p, b]); return {}; } };
  window.WorkOSInbox.configure({ api, state:() => ({ actor:{ id:'u1' } }), lang:() => 'zh', openTask:id => opened.push(id) });
  await new Promise(r => setTimeout(r, 0));
  document.querySelector('.topbar').innerHTML = window.WorkOSInbox.button();
  assert.equal(document.querySelector('.inbox-dot').textContent, '1');
  document.querySelector('[data-inbox-toggle]').dispatchEvent(new window.Event('click', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  assert.match(document.querySelector('.inbox-panel').textContent, /新任务[\s\S]*林楠[\s\S]*Price check/);
  document.querySelector('[data-inbox-open="a"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(opened[0], 't1');
  assert.ok(calls.some(c => c[0] === 'POST' && c[1] === '/inbox/read' && c[2].ids.includes('a')));
  assert.equal(document.querySelector('.inbox-dot'), null, 'no red dot once everything is read');
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
