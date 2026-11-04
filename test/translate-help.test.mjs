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

test('tasks, task details, projects and the inbox show user text through the translator; edit boxes keep the original', () => {
  const board = read('task-board.js'), live = read('live-app.js'), proj = read('projects.js'), inbox = read('inbox.js');
  for (const [name, src] of [['task-board', board], ['live-app', live], ['projects', proj], ['inbox', inbox]])
    assert.match(src, /const tx ?= ?v[a-z]* ?=> ?window\.WorkOSTranslate ?\? ?window\.WorkOSTranslate\.html\(/, name + ' defines tx()');
  assert.doesNotMatch(board, /data-mb="detail" data-id="\$\{esc\(t\.id\)\}">\$\{esc\(t\.title\)\}/, 'board titles are translated');
  assert.match(board, /\$\{tx\(x\.body\)\}/, 'task updates are translated');
  assert.match(board, /\$\{tx\(c\.result\)\}/, 'completion results are translated');
  assert.match(live, /<p class="drawer-description">\$\{task\.description \? tx\(task\.description\)/, 'task description in the drawer');
  assert.match(live, /<span>\$\{tx\(criterion\)\}<\/span>/, 'acceptance criteria');
  assert.match(live, /value="\$\{esc\(task\.title\)\}"/, 'the edit form keeps the original title');
  assert.match(live, />\$\{esc\(task\.description\)\}<\/textarea>/, 'the edit form keeps the original description');
  assert.doesNotMatch(proj, /\$\{esc\(L\((t\.title|p\.name)\)\)\}/, 'project and task names are translated');
  assert.match(proj, /\$\{esc\(L\(p\.desc\)\)\}<\/textarea>/, 'the project description editor keeps the original');
  assert.match(inbox, /<strong>\$\{tx\(i\.title\)\}<\/strong>/);
});

test('text longer than the server limit is shown as written and never sent', async () => {
  const { window } = boot(['translate.js']);
  const posts = [];
  window.WorkOSTranslate.configure({ lang:() => 'en', capabilities:() => ({ autoTranslate:true }), rerender() {}, api:{ post:async (p, b) => { posts.push(b); return { items:[] }; } } });
  const long = '很长的任务描述'.repeat(700);
  assert.equal(window.WorkOSTranslate.html(long), long);
  window.WorkOSTranslate.html('完成黑五促销素材');
  await new Promise(r => setTimeout(r, 120));
  assert.equal(posts.length, 1); assert.equal(JSON.stringify(posts[0].texts), '["完成黑五促销素材"]');
});

test('a Chinese sentence with English abbreviations or product names is translated; only two-part bilingual text is kept', () => {
  const { window } = boot(['translate.js']);
  const main = window.WorkOSTranslate._mainLang;
  for (const s of ['销售经理 Sales Manager', 'Sales Manager 销售经理', '质量追踪 / Quality tracking'])
    assert.equal(main(s), null, 'already bilingual: ' + s);
  for (const s of ['GA搭建 包含 (HRM/ 财务AR/AP / 电子资产管理/ 企业数据中心)',
    'WMS+PIM+SCM+COST 四套供应链管理支撑系统搭建 解决产品管理与供应链管理的混乱',
    '12月产品发布GTM 准备完毕 (Mworks+GalvoFlex + XRF Gen2)',
    '市场部AI自动化推进 (KOL, Social Meida, Ads, SEO, GEO) AI监控与运行报告',
    '客服监督+控评+客诉反溯+工厂QA 系统的落地'])
    assert.equal(main(s), 'zh', 'Chinese with abbreviations: ' + s);
  assert.equal(main('Grow dealer sales 20% with KOL campaigns'), 'en');
});
