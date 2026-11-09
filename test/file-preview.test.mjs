import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 0));

function setup() {
  const { window, document } = parseHTML('<!doctype html><html lang="zh-CN"><body><div id="app"></div></body></html>');
  const fetched = [];
  const context = { window, document, location:new URL('https://workos.test/'), URL, console, setTimeout,
    fetch:async (url, opt = {}) => { fetched.push([url, opt.method || 'GET']); return { ok:true, headers:{ get:() => /documents/.test(url) ? 'application/msword' : 'text/plain' }, text:async () => '示例文本（虚构）' }; } };
  window.location = context.location; window.open = () => {};
  vm.createContext(context);
  vm.runInContext(read('file-preview.js'), context);
  return { window, document, P:window.WorkOSPreview, fetched };
}

test('file preview: kinds and file links', () => {
  const { P } = setup();
  assert.equal(P.kindOf('application/pdf'), 'pdf');
  assert.equal(P.kindOf('image/png'), 'image');
  assert.equal(P.kindOf('text/csv; charset=utf-8'), 'text');
  assert.equal(P.kindOf('video/mp4'), 'video');
  assert.equal(P.kindOf('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), '', 'Word is downloaded, not shown');
  assert.equal(P.kindOf('image/svg+xml'), '', 'SVG is never shown inline');
  for (const u of ['/api/tasks/t1/attachments/a1', '/api/projects/files/f1', '/api/products/library/files/f1', '/api/rma/c1/photos/p1', '/api/hr/people/u1/documents/d1', '/api/feedback/x/images/0'])
    assert.ok(P.isFileUrl(u), u);
  for (const u of ['/api/tasks/t1', '/api/projects/files', '/api/tasks/t1/attachments']) assert.ok(!P.isFileUrl(u), u);
});

test('file preview: a PDF opens in the window with download and new-tab; Esc closes it', async () => {
  const { window, document, P } = setup();
  let deleted = 0;
  await P.open({ url:'/api/projects/files/f1', name:'示例方案.pdf', meta:'示例 · 12 KB', actions:[{ label:'删除', icon:'trash', onClick:close => { deleted++; close(); } }] });
  const box = document.getElementById('wo-preview');
  assert.ok(box, 'window is open');
  assert.equal(box.querySelector('iframe').getAttribute('src'), '/api/projects/files/f1');
  const dl = box.querySelector('a[download]');
  assert.equal(dl.getAttribute('href'), '/api/projects/files/f1');
  assert.equal(dl.getAttribute('download'), '示例方案.pdf');
  assert.ok(box.querySelector('[data-wo-preview="tab"]'));
  box.querySelector('[data-wo-preview-act="0"]').dispatchEvent(new window.Event('click', { bubbles:true }));
  assert.equal(deleted, 1); assert.equal(document.getElementById('wo-preview'), null, 'the action can close it');
  await P.open({ url:'/api/projects/files/f2', name:'图.png' });
  assert.ok(document.querySelector('#wo-preview img'));
  const esc = new window.Event('keydown', { bubbles:true }); esc.key = 'Escape'; document.dispatchEvent(esc);
  assert.equal(document.getElementById('wo-preview'), null);
});

test('file preview: Word shows a download note; text files show their text', async () => {
  const { document, P } = setup();
  await P.open({ url:'/api/hr/people/u1/documents/d1', name:'示例合同.docx' });
  assert.equal(document.querySelector('#wo-preview iframe'), null);
  assert.match(document.querySelector('.wo-preview-none').textContent, /下载/);
  await P.open({ url:'/api/hr/people/u1/documents/d2', name:'没有扩展名' });
  assert.ok(document.querySelector('.wo-preview-none'), 'unknown names ask the server for the type');
  await P.open({ url:'/api/tasks/t1/attachments/a1', name:'notes.txt' });
  await tick();
  assert.equal(document.querySelector('.wo-preview-text').textContent, '示例文本（虚构）');
});

test('file preview: clicking a file link opens the window instead of navigating', async () => {
  const { window, document } = setup();
  document.getElementById('app').innerHTML = `<a id="f" href="/api/tasks/t1/attachments/a1" target="_blank" data-preview-name="结果.pdf" data-preview-mime="application/pdf">结果.pdf <small>3 KB</small></a>
    <a id="other" href="/api/tasks/t1">任务</a><a id="opt" href="/api/tasks/t1/attachments/a2" data-no-preview>下载</a>`;
  const ev = new window.Event('click', { bubbles:true, cancelable:true }); ev.button = 0;
  document.getElementById('f').dispatchEvent(ev);
  assert.ok(ev.defaultPrevented, 'the browser does not open the file itself');
  await tick();
  const box = document.getElementById('wo-preview');
  assert.ok(box); assert.match(box.querySelector('h2').textContent, /结果\.pdf/);
  assert.equal(box.querySelector('iframe').getAttribute('src'), '/api/tasks/t1/attachments/a1');
  for (const id of ['other', 'opt']) {
    const e2 = new window.Event('click', { bubbles:true, cancelable:true }); e2.button = 0;
    document.getElementById(id).dispatchEvent(e2);
    assert.ok(!e2.defaultPrevented, id + ' is left alone');
  }
});
