import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const sources = await Promise.all(['api-client.js', 'company-support.js', 'live-app.js'].map(name => readFile(new URL('../dist/' + name, import.meta.url), 'utf8')));
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
const response = value => ({ status: 200, ok: true, json: async () => value });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const articles = [
  { id: 'article-fixture', title: 'Public fixture guide', family: 'general', sourceVersion: 'fixture-v1', body: 'Original guide body stays unchanged.', sourceUrl: 'https://wiki.example/guide', contentHash: 'fixture-hash' },
  { id: 'article-fixture-2', title: 'Second public guide', family: 'general', sourceVersion: 'fixture-v2', body: 'Second original guide body.', sourceUrl: 'https://wiki.example/guide-2', contentHash: 'fixture-hash-2' },
];

async function harness({ hash = '', executive = false, fetchOverride = () => undefined } = {}) {
  const { window, document } = parseHTML('<!doctype html><html><head></head><body><div id="app"></div><div id="overlay-root"></div><div id="toast"></div></body></html>');
  const calls = [], wikiContexts = [], storage = new Map(), history = [hash];
  let currentHash = hash, wikiResets = 0;
  const normalize = value => value && !value.startsWith('#') ? '#' + value : value;
  const setHash = (value, push = true) => {
    const next = normalize(value); if (next === currentHash) return;
    currentHash = next; if (push) history.push(next);
    queueMicrotask(() => window.dispatchEvent(new window.Event('hashchange')));
  };
  window.location = { origin: 'https://work.example', get hash() { return currentHash; }, set hash(value) { setHash(value); }, get href() { return this.origin + '/' + currentHash; } };
  window.WORKOS_CONFIG = { mode: 'live', apiBase: '/api' };
  window.WorkI18n = { lang: 'en', set(value) { this.lang = value; } };
  window.WorkOSExecutive = { render: () => '<section data-test-executive>Executive fixture</section>' };
  // The module's own content/loading tests are separate. This stub exercises
  // the real host, DOM lifecycle, shared controls, and CompanySupport adapter.
  window.WorkOSWiki = {
    configure: value => wikiContexts.push(value),
    reset: () => { wikiResets++; },
    ensureLoaded() {},
    render: () => `<section class="wiki-root" data-test-route="${currentHash}"><input id="native-query"><p>Native Wiki fixture</p></section>`,
    renderNav: () => '<nav><a href="#knowledge/">Guides</a><a href="#knowledge/archive">Archive</a></nav>',
  };
  const actor = { id: 'reviewer-fixture', display_name: 'Reviewer', role: 'manager', department_id: 'company', executiveAccess: executive, supportAccess: { read: true, review: true } };
  window.fetch = async (url, options) => {
    const path = new URL(url).pathname; calls.push({ path, options });
    const override = fetchOverride(path, options); if (override !== undefined) return override;
    if (path === '/api/capabilities') return response({ auth: { loginEnabled: true } });
    if (path === '/api/me') return response(actor);
    if (path === '/api/directory') return response({ items: [actor] });
    if (path === '/api/support/library') return response({ items: articles });
    const article = articles.find(item => path === '/api/support/articles/' + item.id);
    if (article) return response(article);
    if (path === '/api/support/summary') return response({ connected: true, stale: false, counts: {} });
    if (path === '/api/executive/summary') return response({});
    if (path === '/api/auth/csrf') return response({ csrfToken: 'fixture-csrf' });
    return response({ items: [] });
  };
  const context = { window, document, URL, AbortController, Date, Intl, Map, Set, console, FormData,
    requestAnimationFrame: fn => fn(), setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  for (const source of sources) vm.runInNewContext(source, context);
  await flush();
  const click = async selector => {
    const element = document.querySelector(selector); assert.ok(element, 'Missing clickable control: ' + selector);
    element.dispatchEvent(new window.Event('click', { bubbles: true })); await flush();
  };
  const back = async () => { assert.ok(history.length > 1); history.pop(); setHash(history.at(-1), false); await flush(); };
  return { window, document, calls, wikiContexts, storage, click, back, get wikiResets() { return wikiResets; } };
}

test('browser Back to the empty initial hash restores the current role default page', async () => {
  for (const executive of [false, true]) {
    const h = await harness({ executive });
    assert.equal(h.document.querySelector('.breadcrumb strong').textContent, 'Work Center');
    await h.click('[data-live-page="knowledge"]');
    assert.equal(h.window.location.hash, '#knowledge/');
    assert.ok(h.document.querySelector('.wiki-root'));
    await h.back();
    assert.equal(h.window.location.hash, '');
    assert.equal(h.document.querySelector('.breadcrumb strong').textContent, 'Work Center');
    assert.equal(h.document.querySelector('.wiki-root'), null);
    assert.equal(h.wikiContexts.at(-1).active, false);
  }
});

test('an initial article deep link remains selected after authentication, including executive accounts', async () => {
  const hash = '#knowledge/article/en-36';
  const h = await harness({ hash, executive: true });
  assert.equal(h.window.location.hash, hash);
  assert.equal(h.document.querySelector('.breadcrumb strong').textContent, 'Knowledge center / Wiki');
  assert.equal(h.document.querySelector('.wiki-root').getAttribute('data-test-route'), hash);
  assert.equal(h.wikiContexts.at(-1).active, true);
  assert.equal(h.wikiContexts.at(-1).language, 'en');
  assert.equal(Object.hasOwn(h.wikiContexts.at(-1), 'actor'), false);
});

test('shared theme and mobile-menu controls preserve the native page DOM and unsaved input', async () => {
  const h = await harness({ hash: '#knowledge/search?q=firmware' });
  const page = h.document.querySelector('.wiki-root'), query = h.document.querySelector('#native-query');
  query.value = 'Unsubmitted search edits';
  await h.click('[data-live-action="theme"]');
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  assert.equal(h.storage.get('onelaser-workos-theme'), 'dark');
  assert.equal(h.document.querySelector('.wiki-root'), page);
  assert.equal(h.document.querySelector('#native-query'), query);
  assert.equal(query.value, 'Unsubmitted search edits');
  assert.match(h.document.querySelector('.brand-wordmark').getAttribute('src'), /logo-white/);
  await h.click('[data-live-action="menu"]');
  assert.ok(h.document.querySelector('.app-shell').classList.contains('menu-open'));
  assert.equal(h.document.querySelector('.wiki-root'), page);
  assert.equal(query.value, 'Unsubmitted search edits');
});

test('language and theme changes keep the same unsaved company review form and original content', async () => {
  const h = await harness({ hash: '#knowledge/archive' });
  assert.equal(h.wikiContexts.at(-1).active, false);
  await h.click('[data-company-article="article-fixture"]');
  const form = h.document.querySelector('[data-company-review]'); assert.ok(form);
  const note = form.querySelector('textarea[name="note"]'), confirm = form.querySelector('[name="confirm"]');
  note.value = 'Unsaved reviewer note: <keep this verbatim> 中文'; confirm.checked = true;
  form.querySelector('option[value="changes_requested"]').selected = true;
  const original = h.document.querySelector('.company-prose'), expectedHash = form.dataset.hash;
  await h.click('[data-live-lang="zh"]');
  assert.equal(h.document.documentElement.lang, 'zh-CN');
  assert.equal(h.document.querySelector('[data-company-review]'), form);
  assert.equal(note.value, 'Unsaved reviewer note: <keep this verbatim> 中文');
  assert.equal(confirm.checked, true);
  assert.equal(form.querySelector('select[name="decision"]').value, 'changes_requested');
  assert.equal(form.dataset.hash, expectedHash);
  assert.equal(h.document.querySelector('.company-prose'), original);
  assert.equal(original.textContent, 'Original guide body stays unchanged.');
  await h.click('[data-live-action="theme"]');
  assert.equal(h.document.querySelector('[data-company-review]'), form);
  assert.equal(note.value, 'Unsaved reviewer note: <keep this verbatim> 中文');
  assert.equal(h.calls.filter(call => call.path === '/api/support/reviews' && call.options.method === 'POST').length, 0);
});

test('leaving Wiki deactivates the module and signing out resets its lifecycle', async () => {
  const h = await harness({ hash: '#knowledge/' });
  await h.click('[data-live-page="tasks"]');
  assert.equal(h.wikiContexts.at(-1).active, false);
  await h.click('[data-live-action="logout"]');
  assert.equal(h.wikiResets, 1);
  assert.equal(h.document.querySelector('.wiki-root'), null);
  assert.match(h.document.getElementById('app').textContent, /Sign in with DingTalk/);
});

for (const stage of ['article', 'reviews']) {
  const pendingPath = stage === 'article' ? '/api/support/articles/article-fixture' : '/api/support/reviews/article/article-fixture';
  const pendingValue = stage === 'article' ? articles[0] : { items: [] };
  for (const outcome of ['success', 'failure']) {
    test(`a slow archive ${stage} ${outcome} cannot open a modal after navigating away`, async () => {
      const pending = deferred();
      const h = await harness({ hash: '#knowledge/archive', fetchOverride: path => path === pendingPath ? pending.promise : undefined });
      await h.click('[data-company-article="article-fixture"]');
      assert.ok(h.calls.some(call => call.path === pendingPath));
      await h.click('[data-live-page="tasks"]');
      assert.equal(h.window.location.hash, '#tasks');
      if (outcome === 'success') pending.resolve(response(pendingValue)); else pending.reject(new Error('Fixture network failure'));
      await flush();
      assert.equal(h.document.getElementById('overlay-root').innerHTML, '');
      assert.equal(h.document.querySelector('.breadcrumb strong').textContent, 'My tasks');
    });

    test(`a previous archive ${stage} ${outcome} cannot replace a newer open or its unsaved review`, async () => {
      const pending = deferred();
      const h = await harness({ hash: '#knowledge/archive', fetchOverride: path => path === pendingPath ? pending.promise : undefined });
      await h.click('[data-company-article="article-fixture"]');
      assert.ok(h.calls.some(call => call.path === pendingPath));
      await h.click('[data-company-article="article-fixture-2"]');
      const form = h.document.querySelector('[data-company-review]');
      assert.equal(form?.dataset.id, 'article-fixture-2');
      const note = form.querySelector('[name="note"]'); note.value = 'Keep the new review untouched.';
      if (outcome === 'success') pending.resolve(response(pendingValue)); else pending.reject(new Error('Fixture network failure'));
      await flush();
      assert.equal(h.document.querySelector('[data-company-review]'), form);
      assert.equal(note.value, 'Keep the new review untouched.');
      assert.equal(h.document.querySelector('.company-prose').textContent, articles[1].body);
      assert.equal(h.document.getElementById('overlay-root').textContent.includes('Temporarily unavailable'), false);
    });
  }
}

test('same-view language and theme changes do not discard an in-flight archive detail', async () => {
  const pending = deferred();
  const h = await harness({ hash: '#knowledge/archive', fetchOverride: path => path === '/api/support/articles/article-fixture' ? pending.promise : undefined });
  await h.click('[data-company-article="article-fixture"]');
  await h.click('[data-live-lang="zh"]');
  await h.click('[data-live-action="theme"]');
  assert.equal(h.window.location.hash, '#knowledge/archive');
  pending.resolve(response(articles[0])); await flush();
  assert.equal(h.document.querySelector('[data-company-review]')?.dataset.id, 'article-fixture');
  assert.equal(h.document.querySelector('.company-prose').textContent, articles[0].body);
  assert.match(h.document.getElementById('overlay-root').textContent, /人工核对记录/);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
});

for (const outcome of ['success', 'failure']) {
  test(`switching from archive to native Wiki invalidates an in-flight ${outcome} within the same host page`, async () => {
    const pending = deferred();
    const h = await harness({ hash: '#knowledge/archive', fetchOverride: path => path === '/api/support/articles/article-fixture' ? pending.promise : undefined });
    await h.click('[data-company-article="article-fixture"]');
    h.window.location.hash = '#knowledge/article/en-36'; await flush();
    assert.ok(h.document.querySelector('.wiki-root'));
    if (outcome === 'success') pending.resolve(response(articles[0])); else pending.reject(new Error('Fixture network failure'));
    await flush();
    assert.equal(h.document.getElementById('overlay-root').innerHTML, '');
    assert.equal(h.document.querySelector('.wiki-root').getAttribute('data-test-route'), '#knowledge/article/en-36');
  });

  test(`signing out invalidates an in-flight archive ${outcome}`, async () => {
    const pending = deferred();
    const h = await harness({ hash: '#knowledge/archive', fetchOverride: path => path === '/api/support/articles/article-fixture' ? pending.promise : undefined });
    await h.click('[data-company-article="article-fixture"]');
    await h.click('[data-live-action="logout"]');
    if (outcome === 'success') pending.resolve(response(articles[0])); else pending.reject(new Error('Fixture network failure'));
    await flush();
    assert.equal(h.document.getElementById('overlay-root').innerHTML, '');
    assert.match(h.document.getElementById('app').textContent, /Sign in with DingTalk/);
  });
}

const noSession=(path)=>path==='/api/me'?{status:401,ok:false,json:async()=>({error:{code:'UNAUTHENTICATED',message:'Sign in'}})}:undefined;
for(const hash of ['#knowledge/','#knowledge/search?q=firmware','#knowledge/downloads','#knowledge/family/hydra-series','#knowledge/article/en-38']){
  test('anonymous native Wiki route is public without requesting employee data: '+hash,async()=>{
    const h=await harness({hash,fetchOverride:noSession});
    assert.ok(h.document.querySelector('.public-wiki-shell'));
    assert.ok(h.document.querySelector('.wiki-root'));
    assert.match(h.document.querySelector('#app').textContent,/Employee sign in/);
    assert.equal(h.document.querySelector('[data-live-page="tasks"]'),null);
    assert.deepEqual(h.calls.map(c=>c.path),['/api/capabilities','/api/me']);
    assert.equal(h.wikiContexts.at(-1).canViewArchive,false);
    assert.equal(h.wikiContexts.at(-1).active,true);
  });
}
for(const hash of ['#tasks','#support','#performance','#knowledge/archive','#knowledge/article/en-38/private']){
  test('anonymous private and malformed routes keep the login gate: '+hash,async()=>{
    const h=await harness({hash,fetchOverride:noSession});
    assert.equal(h.document.querySelector('.public-wiki-shell'),null);
    assert.match(h.document.querySelector('#app').textContent,/Sign in with DingTalk/);
    assert.equal(h.document.querySelector('.wiki-root'),null);
    assert.equal(h.wikiContexts.at(-1).active,false);
    assert.deepEqual(h.calls.map(c=>c.path),['/api/capabilities','/api/me']);
  });
}
test('anonymous Wiki theme controls keep the same native page and unsubmitted search',async()=>{
  const h=await harness({hash:'#knowledge/search',fetchOverride:noSession});
  const page=h.document.querySelector('.wiki-root'),input=h.document.querySelector('#native-query');input.value='Keep unsubmitted search';
  await h.click('[data-live-action="theme"]');
  assert.equal(h.document.querySelector('.wiki-root'),page);assert.equal(input.value,'Keep unsubmitted search');
  assert.equal(h.document.documentElement.dataset.theme,'dark');
});
test('signing out on the native Wiki switches to visitor navigation and excludes the archive',async()=>{
  const h=await harness({hash:'#knowledge/article/en-38'});await h.click('[data-live-action="logout"]');
  assert.ok(h.document.querySelector('.public-wiki-shell'));
  assert.ok(h.document.querySelector('.wiki-root'));
  assert.equal(h.wikiContexts.at(-1).canViewArchive,false);
  assert.equal(h.document.querySelector('[data-live-page="support"]'),null);
});
