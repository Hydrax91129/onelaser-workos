import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');

test('names follow the interface language and fall back to the original name', () => {
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  let lang = 'zh';
  vm.runInNewContext(read('translate.js'), { window, document, setTimeout, clearTimeout, console });
  window.WorkOSTranslate.configure({ lang:() => lang, capabilities:() => ({}), api:{ post:async () => ({ items:[] }) }, rerender() {} });
  const people = [{ display_name:'陈一', name_zh:'陈一', name_en:'Yi Chen' }, { display_name:'Amy', name_zh:'', name_en:'' }];
  window.WorkOSNames.apply(people); assert.equal(people[0].display_name, '陈一');
  lang = 'en'; window.WorkOSNames.apply(people); assert.equal(people[0].display_name, 'Yi Chen'); assert.equal(people[1].display_name, 'Amy');
  assert.equal(window.WorkOSNames.missing(people[1]), true); assert.equal(window.WorkOSNames.missing(people[0]), false);
});

test('OKR is simple: title (+ optional done-definition), self score, leader score = final', () => {
  const okr = read('okr-board.js');
  assert.match(okr, /simpleOkrScores/); assert.match(okr, /function scoreBlock\(o\)/); assert.match(okr, /'\/objectives\/' \+ encodeURIComponent\(form\.dataset\.id\) \+ '\/scores'/);
  assert.match(okr, /更多设置（可不填）/, 'weight, owner, level and alignment move under optional settings');
  assert.match(okr, /placeholder="\$\{tr\('自动', 'Auto'\)\}"/, 'weight is optional and automatic');
  assert.match(okr, /totalScore\(objs\)/);
});

test('people must fill Chinese and English names; admins can complete them; sidebar can be resized', () => {
  const live = read('live-app.js'), people = read('people.js');
  assert.match(live, /function namePrompt\(\)/); assert.match(live, /nameZh:String\(values\.nameZh/);
  assert.match(people, /data-pp-field="nameZh"/); assert.match(people, /data-pp-field="nameEn"/); assert.match(people, /field\('nameZh'/);
  assert.match(live, /data-sidebar-resize/); assert.match(live, /'Work Center'/);
});

test('task board: drag rows between groups, right-click to move, one-field group names', () => {
  const b = read('task-board.js');
  assert.match(b, /data-mb-row-drag/); assert.match(b, /addEventListener\('contextmenu'/); assert.match(b, /m\.kind==='context'/);
  assert.match(b, /name="name" required maxlength="80"/); assert.doesNotMatch(b, /<input name="en" required/);
});
