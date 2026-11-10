import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const tick = () => new Promise(r => setTimeout(r, 0));
function setup(connections) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const posts = [], toasts = [];
  let state = structuredClone(connections);
  const api = {
    get: async url => { assert.equal(url, '/mcp/connections'); return structuredClone(state); },
    post: async (url, body) => { posts.push([url, body]); if (url === '/mcp/tokens') { state.tokens.unshift({ id:'00000000-0000-4000-8000-000000000001', kind:'personal', name:body.name, createdAt:'2026-11-10T10:00:00Z', lastUsedAt:null, expiresAt:'2027-02-08T10:00:00Z' }); return { id:'00000000-0000-4000-8000-000000000001', name:body.name, token:'wos_pat_' + 'A'.repeat(43), expiresInDays:body.days }; } state.tokens = state.tokens.filter(t => !url.includes(t.id)); return { revoked:true }; }
  };
  window.confirm = () => true;
  vm.runInNewContext(readFileSync(new URL('../dist/mcp-connect.js', import.meta.url), 'utf8'), { window, document, console, navigator:{ clipboard:{ writeText:async () => {} } }, setTimeout });
  const M = window.WorkOSMcpConnect, app = document.getElementById('app');
  const draw = () => { app.innerHTML = M.render(); return app.innerHTML; };
  M.configure({ api, lang:() => 'zh', rerender:draw, toast:t => toasts.push(t) });
  return { window, document, M, draw, posts, toasts, app };
}
const base = { configured:true, userId:'m1', url:'https://craftos.app/api/mcp', redirects:[], tools:[{ name:'workos_list_tasks', title:'任务列表' }, { name:'workos_stock', title:'库存' }], tokens:[], calls:[] };

test('AI connections: switched off shows the Render setting with the owner ID, and no token form', async () => {
  const { draw } = setup({ ...base, enabled:false });
  draw(); await tick(); const html = draw();
  assert.match(html, /还没开通/); assert.match(html, /WORKOS_MCP_USER_IDS/); assert.match(html, /<code>m1<\/code>/);
  assert.match(html, /https:\/\/craftos\.app\/api\/mcp/);
  assert.doesNotMatch(html, /data-mcpc-form/, 'no tokens until the server allows this person');
  assert.match(html, /永远不会给 AI 的/); assert.match(html, /成本/);
});

test('AI connections: make a token (shown once), list it, disconnect it', async () => {
  const { window, document, draw, posts } = setup({ ...base, enabled:true, tokens:[{ id:'00000000-0000-4000-8000-0000000000aa', kind:'oauth', name:'Claude', createdAt:'2026-11-10T09:00:00Z', lastUsedAt:'2026-11-10T09:30:00Z', expiresAt:null }], calls:[{ tool:'workos_stock', ok:true, at:'2026-11-10T09:30:00Z' }] });
  draw(); await tick(); let html = draw();
  assert.match(html, /Claude 授权/); assert.match(html, /自动续期/); assert.match(html, /库存数量/, 'recent calls in plain words');
  const form = document.querySelector('[data-mcpc-form]'); assert.ok(form);
  form.querySelector('[name=name]').value = 'Composio';
  form.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true }));
  for (let i = 0; i < 5; i++) await tick();
  html = draw();
  assert.equal(JSON.stringify(posts[0]), JSON.stringify(['/mcp/tokens', { name:'Composio', days:90 }]));
  assert.match(html, /令牌只显示这一次/); assert.match(html, /wos_pat_A{43}/); assert.match(html, /个人令牌/);
  document.querySelector('[data-mcpc="hide"]').dispatchEvent(new window.Event('click', { bubbles:true, cancelable:true }));
  assert.doesNotMatch(draw(), /wos_pat_/, 'hidden once saved');
  document.querySelector('[data-mcpc="revoke"][data-name="Claude"]').dispatchEvent(new window.Event('click', { bubbles:true, cancelable:true }));
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(posts[1][0], '/mcp/tokens/00000000-0000-4000-8000-0000000000aa/revoke');
  draw(); await tick(); assert.doesNotMatch(draw(), /Claude 授权/);
});
