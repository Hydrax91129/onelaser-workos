import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

// AI超算 (owner, 2026-11-20): three desks, Markdown answers, previewable drawings and pages; no provider name on the page.
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
function load(chat) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  vm.runInNewContext(read('ai-lab.js'), { window, document, console, setTimeout, clearTimeout, URL, Blob:class {}, navigator:{} });
  const posts = [];
  const api = { get:async p => p === '/ai-lab/chats' ? { ready:true, chats: chat ? [{ id:chat.id, desk:chat.desk, title:chat.title }] : [] } : chat,
    post:async (p, b) => { posts.push([p, b]); return p === '/ai-lab/previews' ? { id:'p1', url:'/api/ai-lab/previews/p1' } : chat; } };
  window.WorkOSAiLab.configure({ api, lang:() => 'zh', rerender:() => {}, toast:() => {} });
  const render = page => { document.getElementById('app').innerHTML = window.WorkOSAiLab.render(page); return document.getElementById('app'); };
  return { window, document, render, posts };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('each desk opens with its own examples; nothing on the page names the AI provider', async () => {
  const w = load(); w.render('ai-elec'); await tick(); const app = w.render('ai-elec');
  assert.match(app.textContent, /电气设计/); assert.equal(app.querySelectorAll('[data-ail="example"]').length, 4);
  assert.doesNotMatch(read('ai-lab.js'), /claude|anthropic|openai|gpt/i);
});

test('answers render as Markdown with tables; svg and html blocks get a sandboxed preview frame', async () => {
  const text = '## 方案\n\n| 项 | 值 |\n| --- | --- |\n| 导轨 | HGR20 |\n\n```svg\n<svg viewBox="0 0 10 10"></svg>\n```\n\n```python\nprint(1)\n```';
  const chat = { id:'c1', desk:'mech', title:'t', busy:false, messages:[{ role:'user', text:'设计', at:'' }, { role:'assistant', text, status:'done', at:'' }] };
  const w = load(chat); w.render('ai-mech'); await tick();
  w.document.querySelector('#app').innerHTML = ''; // open the chat
  const app = w.render('ai-mech');
  app.querySelector('[data-ail="open"]').dispatchEvent(new w.window.Event('click', { bubbles:true })); await tick(); await tick();
  const page = w.render('ai-mech');
  assert.ok(page.querySelector('.ail-table table'), 'table'); assert.match(page.querySelector('h4').textContent, /方案/);
  await tick(); await tick();
  assert.deepEqual(w.posts.map(p => p[0]), ['/ai-lab/previews'], 'only the drawing gets a preview, not the python code');
  assert.equal(w.posts[0][1].kind, 'svg');
});

test('attach files: the upload box sends each file, chips show before sending, and the message carries the file ids', async () => {
  const chat = { id:'c2', desk:'mech', title:'', busy:false, messages:[] };
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  let onFiles = null;
  window.WorkOSUpload = { html:() => '<div class="up-zone"></div>', register:(id, o) => { if (id === 'ail-files') onFiles = o.onFiles; }, status:() => {} };
  class FR { readAsDataURL() { this.result = 'data:image/png;base64,QUJD'; this.onload(); } }
  vm.runInNewContext(read('ai-lab.js'), { window, document, console, setTimeout, clearTimeout, URL, Blob:class {}, navigator:{}, FileReader:FR });
  const posts = [];
  const api = { get:async p => p === '/ai-lab/chats' ? { ready:true, chats:[] } : chat,
    post:async (p, b) => { posts.push([p, b]); return p === '/ai-lab/files' ? { id:'f1', name:b.name, kind:'image' } : p === '/ai-lab/chats' ? chat : { ...chat, busy:true }; } };
  window.WorkOSAiLab.configure({ api, lang:() => 'zh', rerender:() => {}, toast:() => {} });
  const render = () => { document.getElementById('app').innerHTML = window.WorkOSAiLab.render('ai-mech'); return document.getElementById('app'); };
  render(); await tick(); render();
  assert.ok(onFiles, 'the upload box is registered');
  await onFiles([{ name:'sketch.png', type:'image/png' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(posts[0])), ['/ai-lab/files', { name:'sketch.png', mime:'image/png', dataBase64:'QUJD' }]);
  assert.match(render().querySelector('[data-ail-pending]').textContent, /sketch\.png/);
  document.querySelector('#ail-compose').dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true })); await tick(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(posts.at(-1))), ['/ai-lab/chats/c2/messages', { text:'', fileIds:['f1'] }], 'a file alone can be sent');
});
