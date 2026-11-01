import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
function boot(files) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const context = { window, document, requestAnimationFrame:fn => fn(), setTimeout, clearTimeout, Intl, Date, console, URL, MutationObserver:class { observe() {} }, localStorage:{ getItem:() => null, setItem() {} }, addEventListener() {} };
  context.window.MutationObserver = context.MutationObserver;
  for (const f of files) vm.runInNewContext(read(f), context);
  return { window, document };
}

test('OKR text is shown in the interface language with a badge; clicking flips to the original', async () => {
  const { window, document } = boot(['translate.js']);
  let renders = 0; const posts = [];
  window.WorkOSTranslate.configure({ lang:() => 'zh', capabilities:() => ({ autoTranslate:true }), rerender:() => { renders++; },
    api:{ post:async (p, b) => { posts.push(b); return { items:b.texts.map(t => ({ translated:'译:' + t })) }; } } });
  const T = window.WorkOSTranslate;
  assert.equal(T.html('Grow dealer sales 20%'), 'Grow dealer sales 20%', 'original first, translation requested');
  assert.equal(T.html('完成 5 门入职课程'), '完成 5 门入职课程', 'already in the interface language');
  await new Promise(r => setTimeout(r, 120));
  assert.equal(posts.length, 1); assert.equal(posts[0].target, 'zh'); assert.equal(JSON.stringify(posts[0].texts), '["Grow dealer sales 20%"]');
  assert.ok(renders >= 1);
  const html = T.html('Grow dealer sales 20%');
  assert.match(html, /译:Grow dealer sales 20%/); assert.match(html, /data-tx-toggle/); assert.match(html, />译</);
  assert.equal(T.text('Grow dealer sales 20%'), '译:Grow dealer sales 20%', 'plain text for <option>');
  document.body.innerHTML = html;
  document.querySelector('[data-tx-toggle]').dispatchEvent(new window.Event('click', { bubbles:true }));
  assert.match(T.html('Grow dealer sales 20%'), /Grow dealer sales 20%<span[^>]*>原</, 'shows the original after clicking');
  assert.equal(T.html('<b>x</b> sales'), '&lt;b&gt;x&lt;/b&gt; sales', 'escapes user text');
});

test('without the backend capability nothing is translated or requested', async () => {
  const { window } = boot(['translate.js']);
  const posts = [];
  window.WorkOSTranslate.configure({ lang:() => 'zh', capabilities:() => ({}), rerender() {}, api:{ post:async (p, b) => { posts.push(b); return { items:[] }; } } });
  assert.equal(window.WorkOSTranslate.html('Grow sales'), 'Grow sales');
  await new Promise(r => setTimeout(r, 120)); assert.equal(posts.length, 0);
});

test('OKR board renders user text through the translator', () => {
  const okr = read('okr-board.js');
  assert.match(okr, /const tx = v => window\.WorkOSTranslate/);
  assert.ok((okr.match(/\$\{tx\(/g) || []).length >= 10, 'titles, descriptions and updates use tx()');
  assert.doesNotMatch(okr, /\$\{esc\(o\.title\)\}/);
});

test('every new form field, column header and member control has a hover hint', () => {
  const { window, document } = boot(['help-tips.js']);
  const H = window.WorkOSHelp;
  document.getElementById('app').innerHTML = `
    <form id="okr-new-o"><input name="title"><input name="weight"><select name="ownerId"></select><select name="level"></select><select name="parentObjectiveId"></select></form>
    <form id="live-new-task"><input name="title"><textarea name="description"></textarea><textarea name="criteria"></textarea></form>
    <table data-help-table="pp-org"><thead><tr><th>a</th><th>b</th><th>c</th><th>d</th><th>e</th><th>f</th><th>g</th><th>h</th><th>i</th></tr></thead></table>
    <table data-help-table="pd-supply"><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead></table>
    <input data-pp-status><input data-pp-field="location"><button data-nav-toggle="work"></button><input data-pd-ov="opex.ads">`;
  for (const el of document.querySelectorAll('#app input, #app select, #app textarea, #app th, #app button')) assert.ok(H.ruleFor(el), 'hint for ' + el.outerHTML);
  const loc = H.ruleFor(document.querySelector('[data-help-table="pp-org"] th:nth-child(3)'));
  assert.match(loc.data.zh.t, /工作地点/);
});
