import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const source = readFileSync(new URL('../dist/help-tips.js', import.meta.url), 'utf8');
const liveSource = readFileSync(new URL('../dist/live-app.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

function load(body, { stored = null, lang = 'zh' } = {}) {
  const { window, document } = parseHTML(`<!doctype html><html><body>${body}<div id="toast"></div></body></html>`);
  const store = new Map(stored ? [['onelaser-workos-help', stored]] : []);
  const context = {
    window, document, Node: window.Node, HTMLElement: window.HTMLElement,
    MutationObserver: class { observe() {} },
    requestAnimationFrame: fn => fn(), setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    addEventListener: () => {}, innerWidth: 1440, innerHeight: 900, console,
  };
  window.WorkI18n = { lang };
  context.window = window;
  vm.runInNewContext(source, context);
  return { window, document, help: window.WorkOSHelp, store };
}

const sidebar = '<nav><button class="nav-item" data-live-page="tasks" aria-current="page">任务中心</button></nav>';
const topbar = '<div class="topbar-right"><button data-live-lang="zh">中</button><button class="theme-toggle" data-live-action="theme"></button></div>';

test('index.html loads the help layer after the app scripts', () => {
  assert.match(indexHtml, /help-tips\.css/);
  assert.match(indexHtml, /help-tips\.js[^"]*" defer/);
  assert.ok(indexHtml.indexOf('help-tips.js') > indexHtml.indexOf('task-board.js'));
});

test('every hint and page guide has complete Chinese and English text', () => {
  const { help } = load(`<div id="app"></div>`);
  assert.ok(help.RULES.length >= 90, 'covers the main controls');
  for (const { sel, data } of help.RULES) {
    for (const l of ['zh', 'en']) {
      assert.ok(data[l].t && data[l].p, `${sel} has ${l} title and purpose`);
    }
  }
  for (const [id, data] of Object.entries(help.PAGES)) {
    for (const l of ['zh', 'en']) assert.ok(data[l].t && data[l].p && data[l].h, `page ${id} has full ${l} guide`);
  }
});

test('every sidebar page has a page guide', () => {
  const { help } = load(`<div id="app"></div>`);
  const navBlock = liveSource.match(/const navs = \[([\s\S]*?)\];/)[1];
  const navs = [...navBlock.matchAll(/\['([a-z-]+)','[a-z]+','[^']+','[^']+','[a-z]+'\]/g)].map(m => m[1]);
  assert.ok(navs.length >= 13);
  for (const id of navs) assert.ok(help.PAGES[id], `guide for ${id}`);
});

test('all selectors are valid CSS', () => {
  const { help, document } = load(`<div id="app"></div>`);
  for (const { sel } of help.RULES) assert.doesNotThrow(() => document.querySelector(sel), sel);
});

test('buttons resolve to the matching hint, including clicks on inner icons', () => {
  const { help, document } = load(`<div id="app">${sidebar}
    <button data-mb="edit-cell" data-field="status"><span id="inner">进行中</span></button>
    <button data-mb="new" data-group="todo">添加任务</button>
    <button data-mb="new">新建任务</button>
    <button class="btn small" data-live-page="tasks">全部任务</button>
    <button data-company-tab="shopify">订单与物流</button></div>`);
  const title = el => help.ruleFor(el)?.data.zh.t;
  assert.equal(title(document.getElementById('inner')), '执行状态');
  assert.equal(title(document.querySelector('[data-group="todo"]')), '添加任务');
  assert.equal(title(document.querySelector('[data-mb="new"]:not([data-group])')), '新建任务');
  assert.equal(title(document.querySelector('.btn[data-live-page]')), '全部任务');
  assert.equal(title(document.querySelector('.nav-item')), '个人任务');
  assert.equal(title(document.querySelector('[data-company-tab]')), '订单与物流');
});

test('page title gets one (?) icon and the top bar gets a hint toggle', () => {
  const { document } = load(`<div id="app">${sidebar}${topbar}<div class="mb-heading"><h1>团队任务看板</h1></div></div>`);
  assert.equal(document.querySelectorAll('h1 .help-page-icon').length, 1);
  const toggle = document.querySelector('.topbar-right .help-toggle');
  assert.ok(toggle);
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
});

test('hints can be turned off and the choice is remembered', () => {
  const { document, help } = load(`<div id="app">${sidebar}${topbar}</div>`, { stored: 'off' });
  assert.equal(help.enabled(), false);
  assert.equal(document.querySelector('.help-toggle').getAttribute('aria-pressed'), 'false');
  help.setEnabled(true);
  assert.equal(help.enabled(), true);
});

test('no icon is added on the sign-in screen (no active page)', () => {
  const { document } = load(`<div id="app"><div class="page-heading"><h1>Work with direction.</h1></div></div>`);
  assert.equal(document.querySelectorAll('.help-page-icon').length, 0);
});

test('the help layer is read-only: no network calls or app state writes', () => {
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|\bapi\.(get|post|request)\b/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^;]*#app/);
});
