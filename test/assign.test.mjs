import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');

test('task center offers Assign Task to anyone and shows where each task came from', () => {
  const live = read('live-app.js'), board = read('task-board.js');
  assert.match(live, /async function assignTask\(/); assert.match(live, /api\.post\('\/tasks\/assign'/);
  assert.match(live, /api\.get\('\/org\/chart'\)/, 'all colleagues company-wide, not only the department');
  assert.match(live, /assignTask:state\.capabilities\?\.assignTasks\?assignTask:null/);
  assert.match(board, /btn\('Assign Task','assign'/); assert.match(board, /if\(a==='assign'\)\{menu=null;ctx\.assignTask\?\.\(\)/);
  assert.match(board, /mb-src-direct/); assert.match(board, /mb-src-okr/); assert.match(board, /mb-src-project/);
});

test('workbench shows tasks others assigned to me, tasks I assigned and AI follow-ups', () => {
  const r = read('reports.js');
  assert.match(r, /\/tasks\/assignments/); assert.match(r, /\/nudges/);
  assert.match(r, /别人给我下达的任务/); assert.match(r, /我下达的任务/); assert.match(r, /跟进与催办/); assert.match(r, /一键催办/);
  assert.match(r, /\$\{slot\('home'\)\}\n\s+\$\{assignPanel\(\)\}/);
});
