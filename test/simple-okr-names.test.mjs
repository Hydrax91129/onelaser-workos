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
  assert.match(okr, /simpleOkrScores/); assert.match(okr, /function scoreBlock\(kind, item, o\)/); for (const l of ['未开展','严重滞后','部分完成','接近完成','完成且卓越']) assert.match(okr, new RegExp(l)); assert.match(okr, /'\/key-results\/' : '\/objectives\/'/); assert.match(okr, /encodeURIComponent\(form\.dataset\.id\) \+ '\/scores'/);
  assert.match(okr, /更多设置（可不填）/, 'weight, owner, level and alignment move under optional settings');
  assert.match(okr, /分值（分）/, 'objectives are weighted in points'); assert.match(okr, /const krPoints/, 'KR weight is a share of its objective');
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

test('task status: six employee choices, Not started is system-only, overdue and abandoned are shown everywhere', () => {
  const board = read('task-board.js'), pj = read('projects.js');
  assert.match(board, /function statusChoices\(\)\{return data\.config\.status\.filter\(l=>l\.id!=='not_started'\);\}/);
  assert.match(board, /options\(m\.field==='status'\?statusChoices\(\)/); assert.match(board, /options\(statusChoices\(\),'pick-batch-status'\)/);
  assert.match(board, /15 天无更新视为放弃/);
  for (const k of ['overdue:\'overdue\'', 'abandoned:\'abandoned\'']) assert.ok(pj.includes(k), k);
  assert.match(pj, /stuck:\['被暂停'/); assert.match(pj, /filter\(k => field !== 'status' \|\| k !== 'todo'\)/);
});

test('user guide opens from the top bar, follows the page and covers every rule', async () => {
  const live = read('live-app.js'), guide = read('user-guide.js'), html = read('index.html');
  assert.match(live, /data-guide-open="\$\{esc\(state\.page\)\}"/); assert.match(html, /user-guide\.js/); assert.match(html, /user-guide\.css/);
  for (const id of ['start','tasks','assign','okr','projects','names','hints']) assert.match(guide, new RegExp(`\\['${id}'`));
  for (const t of ['15 天','被暂停','0 分自评','10 月 25 日起','完成且卓越','领导评分 × 50%','不能修改']) assert.ok(guide.includes(t), t);
});

test('self score needs a written explanation or a file; team OKR groups reports, peers and managers', () => {
  const okr = read('okr-board.js');
  assert.match(okr, /SELF_SCORE|至少 10 个字/); assert.match(okr, /uploadEvidence\(k\.task_id, f\)/); assert.match(okr, /body\.attachmentIds = ids/);
  for (const t of ['直属下属', '间接下属（下属的团队）', '团队 OKR（平级同事）', '我的上级', '其他同事']) assert.ok(okr.includes(t), t);
  assert.match(okr, /function relationOf\(id\)/);
});

test('task sources name the project and O/KR; updates button has a label; work center lists are translated', () => {
  const board = read('task-board.js'), rep = read('reports.js'), pj = read('projects.js');
  assert.match(board, /t\.project_name/); assert.match(board, /'O'\+r\.o/); assert.match(board, /<span>\$\{tr\('更新','Updates'\)\}<\/span>/);
  assert.match(board, /setTimeout\(\(\)=>ok\(null\),3000\)/, 'group save never waits long for translation');
  assert.match(rep, /tx\(t\.title\)/); assert.match(rep, /tx\(n\.message\)/);
  assert.match(pj, /function portfolioSummary/); assert.match(pj, /function projectCard/); assert.match(pj, /\$\{isLive\(\) \? '' : `<div class="pj-sample">/);
});

test('KR weights under an objective must add up to exactly 100%: no automatic shares, capped input, scoring waits', () => {
  const okr = read('okr-board.js');
  assert.match(okr, /const weightsOk = o =>/); assert.match(okr, /ready = kind !== 'kr' \|\| weightsOk\(o\)/);
  assert.doesNotMatch(okr, /平分剩余部分/); assert.doesNotMatch(okr, /Math\.max\(1, Math\.round\(\(100 - used\)/); assert.match(okr, /const companyMine = \(\) =>/); assert.match(okr, /function stageLegend/);
  assert.match(okr, /其他 KR 自动调整为/); assert.match(okr, /rebalance:true/); assert.match(okr, /补齐到正好 100% 后才能评分/);
});

test('final publish locks the OKR for its owner, leaders may still edit, team list shows three stages', () => {
  const okr = read('okr-board.js');
  assert.match(okr, /'\/okr\/publish'/); assert.match(okr, /const lockedFor = o =>/); assert.match(okr, /canEdit = o => !!o && !lockedFor\(o\)/);
  assert.match(okr, /function stageChips/); for (const t of ['建立', '自评', '领导']) assert.ok(okr.includes(`tr('${t}'`), t);
  assert.match(okr, /0 未开展、25 严重滞后、50 部分完成、75 接近完成、100 完成、125 完成且卓越/);
});
