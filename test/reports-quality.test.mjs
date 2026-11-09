import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
function load(files, state, pre = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  Object.assign(window, pre);
  const context = { window, document, requestAnimationFrame:fn => fn(), Intl, Date, console, URL };
  for (const f of files) vm.runInNewContext(read(f), context);
  const calls = [];
  const api = { get:async p => { calls.push(['GET', p]); return { items:[] }; }, request:async (p, o) => { calls.push([o.method, p, o.body]); return { sentences:['AI one.', 'AI two.', 'AI three.'], generatedAt:'2026-10-31T10:00:00Z' }; } };
  const ctx = { api, state:() => state, lang:() => 'zh', rerender:() => {}, toast:() => {}, explainError:e => e.message, overlay:() => {}, closeOverlay:() => {}, modal:() => {}, refreshMe:async () => {} };
  for (const k of ['WorkOSInsights', 'WorkOSReports', 'WorkOSPeople', 'WorkOSProducts', 'WorkOSQuality', 'WorkOSProjects']) window[k]?.configure(ctx);
  return { window, calls };
}
const actor = { id:'u1', display_name:'KC', isAdmin:true, grants:['products', 'product_cost_detail'] };
const base = (extra = {}) => ({ actor, capabilities:{ orgProfiles:true }, directory:[actor, { id:'u2', display_name:'Amy', manager_id:'u1', title:'Sales', location:'Irvine' }], tasks:[], objectives:[], krs:[], page:'overview', ...extra });

test('the home page has no review panel when nothing awaits review', () => {
  const { window } = load(['reports.js'], base({ tasks:[], toReview:[] }));
  assert.doesNotMatch(window.WorkOSReports.home(), /ri-review-now/);
});

test('workbench home greets, shows what is undone and a 3–4 sentence analysis', () => {
  const { window } = load(['reports.js'], base({ tasks:[
    { id:'a', title:'Late report', owner_id:'u1', reviewer_id:'u2', status:'planned', due_at:'2020-01-01T00:00:00Z' },
  ], toReview:[
    { id:'b', title:'Check this', owner_id:'u2', reviewer_id:'u1', status:'submitted', due_at:'2099-01-01T00:00:00Z', submitted_at:'2026-11-06T08:00:00Z', auto_accept_at:'2026-11-09T08:00:00Z' },
  ] }));
  const html = window.WorkOSReports.home();
  assert.ok(html.indexOf('ri-review-now') > 0 && html.indexOf('ri-review-now') < html.indexOf('还没做完的事'), 'awaiting review comes first');
  assert.match(html, /ri-review-now[\s\S]*data-live-task="b"[\s\S]*Amy/);
  assert.match(html, /KC/); assert.match(html, /还没做完的事/); assert.match(html, /Late report/); assert.match(html, /Check this/);
  const items = html.match(/<ol class="ri-list">([\s\S]*?)<\/ol>/)[1].match(/<li>/g);
  assert.ok(items.length >= 3 && items.length <= 4, 'analysis has 3–4 sentences');
  assert.match(html, /自动分析/, 'labeled rule-based when AI is not configured');
});

test('AI insights use aggregated facts only and replace the rule-based text when available', async () => {
  const st = base({ capabilities:{ orgProfiles:true, aiInsights:true } });
  const { window, calls } = load(['reports.js'], st);
  window.WorkOSReports.home();
  const call = calls.find(c => c[1] === '/insights');
  assert.ok(call, 'POST /insights is called');
  assert.equal(call[2].board, 'home');
  assert.ok(Object.values(call[2].facts).every(v => v === null || ['number', 'string'].includes(typeof v) || Array.isArray(v)), 'facts are plain aggregates');
  await new Promise(r => setTimeout(r, 0));
  assert.match(window.WorkOSReports.home(), /AI 分析[\s\S]*AI one\./);
});

test('OKR analysis compares my and team completion with time elapsed', () => {
  const { window } = load(['reports.js'], base({ objectives:[{ id:'o1', title:'Grow sales', owner_id:'u2', level:'personal' }, { id:'o2', title:'Mine', owner_id:'u1', level:'personal' }] }));
  const html = window.WorkOSReports.okr();
  assert.match(html, /我的 OKR 完成度/); assert.match(html, /团队 OKR 完成度/); assert.match(html, /目标周期进度/); assert.match(html, /Amy/);
});

test('supply chain uses injected inventory: aged stock is purple, factory stock is transferred before a new PO', () => {
  const INV = { source:'test', items:[
    { sku:'A', name:'Slow machine', type:'Hydra 整机', factory:'东莞工厂', unitUsd:5000, wh:10, dg:0, jn:0, transit:0, transitEta:[], velocity:0.01, out90:1, oldestAge:300, avgAge:250, aged90:10, repair:0 },
    { sku:'B', name:'Fast machine', type:'X 整机', factory:'东莞工厂', unitUsd:2000, wh:3, dg:30, jn:0, transit:0, transitEta:[], velocity:1, out90:90, oldestAge:20, avgAge:10, aged90:0, repair:0 },
  ], monthly:{ '2026-09':{ 'X 整机':30 } } };
  const { window } = load(['reports.js', 'products.js'], base(), { WORKOS_INVENTORY_DATA:INV });
  const html = window.WorkOSProducts.render('supply');
  assert.match(html, /库存超期/); assert.match(html, /清库存策略[\s\S]*Slow machine/);
  assert.match(html, /补货策略[\s\S]*Fast machine[\s\S]*先从工厂仓调/);
  assert.match(html, /超 90 天库存占比/);
  assert.match(html, /ri-list/, 'AI/auto analysis card on the supply board');
});

test('quality tracking reads live issues; factory staff get the plan form, leads get approval', async () => {
  const today = '2026-11-10';
  const categories = { ELE:{ zh:'电气', en:'Electrical', defects:{ '01':['电源板故障', 'Power board failure'] } }, MEC:{ zh:'机械 / 运动', en:'Mechanics', defects:{ '03':['升降台卡滞', 'Z-table jam'] } } };
  const factories = [{ id:'dg', zh:'东莞工厂', en:'Dongguan factory' }, { id:'jn', zh:'济南工厂', en:'Jinan factory' }];
  const issue = (o = {}) => ({ id:'i1', number:'Q-2026-0001', title:'Hydra 电源板过热 <b>x</b>', description:'', category:'ELE', defect:'01', code:'ELE-01', model:'Hydra 13 Pro', sku:'', batch:'2026-09', severity:'S1', factory:'dg', status:'sent', resolution:null, affected:7, ownerId:'u1', ownerName:'KC', foundAt:'2026-11-01',
    dates:{ sentAt:'2026-11-02', planDue:'2026-11-09', planAt:null, approvedAt:null, implDue:null, implementedAt:null, verifiedAt:null, closedAt:null }, effectiveBatch:'', durations:{ toSend:1, factoryReply:8, implementation:null, verification:null, total:9 }, overdue:'plan', linkCount:0, ...o });
  const list = role => ({ items:[issue(), issue({ id:'i2', number:'Q-2026-0002', title:'Cobra 升降台', category:'MEC', defect:'03', code:'MEC-03', model:'Cobra', severity:'S3', factory:'jn', status:'closed', resolution:'fixed', overdue:null, affected:2, dates:{ ...issue().dates, planAt:'2026-11-03', approvedAt:'2026-11-03', implDue:'2026-11-06', implementedAt:'2026-11-05', verifiedAt:'2026-11-08', closedAt:'2026-11-08' }, durations:{ toSend:0, factoryReply:1, implementation:2, verification:3, total:7 } })],
    role, factory:role === 'factory' ? 'dg' : null, canCreate:role === 'lead', leads:[{ id:'u1', name:'KC' }], today, categories, factories, statuses:[], severities:['S1', 'S2', 'S3'], linkKinds:[] });
  const detail = (role, can) => ({ ...issue(), plans:[], links:[{ id:'l1', kind:'ticket', ref:'#8812', url:'javascript:alert(1)', note:'', byName:'KC', createdAt:'2026-11-02' }], events:[{ id:'e1', action:'sent', note:'', byName:'KC', at:'2026-11-02T08:00:00Z' }], role, can });
  const run = async role => {
    const { window } = load(['reports.js', 'quality.js'], base());
    const Q = window.WorkOSQuality, calls = [];
    Q.configure({ api:{ get:async p => { calls.push(p); return list(role); } }, state:() => base(), lang:() => 'zh', rerender:() => {}, toast:() => {}, overlay:() => {}, closeOverlay:() => {}, modal:() => {} });
    assert.match(Q.render(), /正在读取/); await new Promise(r => setTimeout(r, 0));
    return { Q, html:Q.render(), calls };
  };
  const lead = await run('lead');
  assert.deepEqual(lead.calls, ['/quality']);
  assert.match(lead.html, /新建问题/); assert.match(lead.html, /Q-2026-0001/); assert.match(lead.html, /逾期 1天/); assert.match(lead.html, /按问题分类/); assert.match(lead.html, /平均出方案天数/);
  assert.doesNotMatch(lead.html, /<b>x<\/b>/, 'titles are escaped');
  const factory = await run('factory');
  assert.doesNotMatch(factory.html, /新建问题/); assert.match(factory.html, /东莞工厂：这里是 OneLaser 提交给你们的产品问题/); assert.doesNotMatch(factory.html, /data-v="new"/, 'factories never see the unsent tab');
  const plan = factory.Q._detailHtml(detail('factory', { plan:true }));
  assert.match(plan, /id="qa-plan"/); assert.doesNotMatch(plan, /id="qa-decide"|id="qa-edit"|id="qa-link"/);
  assert.doesNotMatch(plan, /href="javascript:/, 'unsafe evidence links are not rendered as links');
  const review = lead.Q._detailHtml(detail('lead', { decide:true, edit:true, link:true }));
  assert.match(review, /id="qa-decide"/); assert.match(review, /批准方案/); assert.match(review, /退回修改/); assert.match(review, /id="qa-edit"/);
});

test('org chart shows name, title and location for everyone', () => {
  const { window } = load(['people.js'], base());
  window.WorkOSPeople._ui.chart = { items:[{ id:'u1', display_name:'KC', title:'President', location:'Irvine, CA' }, { id:'u2', display_name:'Amy', title:'Sales', location:'Irvine, CA', manager_id:'u1' }, { id:'u3', display_name:'<i>x</i>', title:'QA', location:'东莞', manager_id:'u1' }] };
  const html = window.WorkOSPeople.chart();
  assert.match(html, /President[\s\S]*Irvine, CA/); assert.match(html, /东莞/); assert.doesNotMatch(html, /<i>x<\/i>/);
});

test('team leaderboard counts every completion this month, scored or not, and labels where scores come from', async () => {
  const st = base();
  const { window } = load(['reports.js'], st);
  const r = window.WorkOSReports;
  // Replace the leaderboard API answer: u2 finished 3 tasks this month, only 1 scored (by a person).
  r.configure({ api:{ get:async p => p === '/reports/leaderboard' ? { items:[
      { id:'u1', display_name:'KC', total:2, done:2, scored_done:0, human_scored:0, ai_scored:0, avg_score:null, overdue:0 },
      { id:'u2', display_name:'Amy', total:4, done:3, scored_done:1, human_scored:1, ai_scored:0, avg_score:8, overdue:0 }] } : { items:[] }, request:async () => ({ sentences:['a', 'b', 'c'] }) },
    state:() => st, lang:() => 'zh', rerender:() => {}, toast:() => {} });
  r.home(); await new Promise(res => setTimeout(res, 0));
  const html = r.home();
  assert.match(html, /本月完成的任务数量/);
  assert.match(html, /别人下达的任务验收确认后上榜，按验收评分计（3 天没人验收自动通过、AI 评分）；自己的任务标记完成即上榜/);
  assert.doesNotMatch(html, /AI 评分通过|只统计 AI 已评分|还没有 AI 评分的完成任务/);
  assert.doesNotMatch(html, /还没有人完成/, 'completions count without a score');
  assert.match(html, /你本月已完成 2 项，2 项等待评分/);
  const champion = html.slice(html.indexOf('完成冠军'), html.indexOf('劳苦功高'));
  assert.match(champion, /Amy[\s\S]*3<small>项/); assert.match(champion, /KC[\s\S]*2<small>项/);
  const stars = html.slice(html.indexOf('质量之星'), html.indexOf('完成冠军'));
  assert.match(stars, /人工评分优先/); assert.match(stars, /Amy[\s\S]*8\.0/);
});

test('without the leaderboard API the fallback counts done tasks this month and uses final scores', async () => {
  const now = new Date().toISOString();
  const st = base({ tasks:[
    { id:'a', title:'Done unscored', owner_id:'u1', reviewer_id:'u2', status:'planned', board_status:'done', board_done_at:now, due_at:'2099-01-01T00:00:00Z', completion:{ ai_status:'pending' } },
    { id:'b', title:'Done human', owner_id:'u1', reviewer_id:'u2', status:'planned', board_status:'done', board_done_at:now, due_at:'2099-01-01T00:00:00Z', completion:{ ai_status:'pending', human_score:6, final_score:6, score_source:'human' } },
  ] });
  const { window } = load(['reports.js'], st);
  const r = window.WorkOSReports;
  r.configure({ api:{ get:async () => { throw new Error('offline'); }, request:async () => ({ sentences:['a', 'b', 'c'] }) }, state:() => st, lang:() => 'en', rerender:() => {}, toast:() => {} });
  r.home(); await new Promise(res => setTimeout(res, 0));
  const html = r.home();
  assert.match(html, /You have completed 2 this month, average score 6 \(1 by a person · 0 by AI\), 1 awaiting a score/);
  assert.match(html, /Tasks completed this month/);
});

test('work someone else gave you goes through review: the board sends "done" to the task details instead of the completion form', async () => {
  const { readFile } = await import('node:fs/promises');
  const board = await readFile(new URL('../dist/task-board.js', import.meta.url), 'utf8');
  const live = await readFile(new URL('../dist/live-app.js', import.meta.url), 'utf8');
  assert.match(board, /needsReview=t=>!!t&&t\.reviewer_id!==t\.owner_id&&\(t\.assigned_by_id\|\|t\.created_by\)!==t\.owner_id/);
  assert.equal((board.match(/needsReview\((target|task)\)\)\{reviewInstead/g) || []).length, 2, 'both the status menu and drag-to-done route to review');
  assert.match(live, /canReview = task\.reviewer_id === state\.actor\.id && task\.owner_id !== state\.actor\.id/, 'any designated reviewer, not only managers');
});
