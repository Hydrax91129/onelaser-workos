import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {randomUUID} from 'node:crypto';
// Bulk bar on the task board: fixed at the bottom while rows are ticked; batch edits go through one request;
// delete is undoable for 10 seconds and reports skipped rows instead of failing.
const code=readFileSync(new URL('../dist/task-board.js',import.meta.url),'utf8');
async function harness({role='manager',language='zh',archive=null}={}){
 const {document,window:dom}=parseHTML('<html><body><main></main></body></html>');const handlers={},calls=[],toasts=[],timers=[];document.addEventListener=(t,f)=>(handlers[t]??=[]).push(f);
 dom.HTMLElement.prototype.getBoundingClientRect=()=>({left:250,bottom:210,width:100,height:35});
 const config={groups:[{id:'todo',en:'To-Do',zh:'待办',color:'#579bfc'},{id:'ops',en:'Operations',zh:'运营',color:'#784bd1'},{id:'completed',en:'Completed',zh:'已完成',color:'#00c875'}],priority:[['urgent','#ff83d3'],['high','#6846a5'],['medium','#8581df'],['low','#8eb8f9'],['','#797e95']].map(([id,color])=>({id,en:id||'Unassigned',zh:id||'未设',color})),status:['working','hold','review','done','not_started'].map(id=>({id,en:id,zh:id,color:'#2dca92'})),category:[]};
 const base={version:1,created_at:'2026-10-29T00:00:00Z',updated_at:'2026-10-30T00:00:00Z',owner_id:'u1',created_by:'u1',due_at:'2026-11-20T10:00:00Z',board_group_id:'todo',effective_group_id:'todo',board_status:'working',board_priority:'low',board_category:'',board_notes:'',status:'planned'};
 const model={config,version:1,items:Array.from({length:15},(_,i)=>({...base,id:'t'+i,title:'Fictional bulk task '+i})),view:{sort:[],groupBy:'group',hidden:[],collapsed:[]}};
 const archived=new Map();
 const api={get:async()=>structuredClone({...model,items:model.items.filter(t=>!archived.has(t.id))}),post:async(path,payload)=>{calls.push({path,payload:structuredClone(payload)});
  if(path==='/tasks/batch-board'){const updated=[];for(const it of payload.items){const t=model.items.find(t=>t.id===it.id);for(const[k,v]of Object.entries(payload.changes))t[k==='status'?'board_status':k==='priority'?'board_priority':k==='groupId'?'board_group_id':k==='dueAt'?'due_at':k]=v;t.version++;updated.push(t.id);}return{updated,skipped:[]};}
  if(path==='/tasks/batch-archive'){const r=archive?archive(payload.ids):{archived:payload.ids,count:payload.ids.length,skipped:[]};for(const id of r.archived)archived.set(id,true);return r;}
  if(path==='/tasks/batch-restore'){for(const id of payload.ids)archived.delete(id);return{restored:payload.ids,count:payload.ids.length,skipped:[]};}
  if(path==='/task-board/view')return{saved:true};throw new Error('unexpected '+path);}};
 const options={capabilities:{},actor:{id:'u1',role,display_name:'Fixture manager'},directory:[{id:'u1',display_name:'Fixture manager',role:'manager'},{id:'u2',display_name:'Other fixture',role:'manager'}],language,api,toast:m=>toasts.push(m),openTask:()=>{}};
 const window={innerWidth:1408,innerHeight:1000};
 vm.runInNewContext(code,{window,document,URL,Date,Intl,FormData:class{constructor(form){this.v=[...form.querySelectorAll('[name]')].map(n=>[n.name,n.tagName==='SELECT'?(n.querySelector('option[selected]')||n.querySelector('option'))?.value:n.value]);}*[Symbol.iterator](){yield* this.v;}},crypto:{randomUUID},structuredClone,setInterval:()=>0,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;}});
 const ui=window.WorkOSTaskBoard;ui.configure(options);await ui.refresh();document.querySelector('main').innerHTML=ui.render();
 async function flush(){for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));}
 async function emit(type,target,extra={}){assert.ok(target,'expected control');for(const fn of handlers[type]||[])await fn({target,preventDefault(){},key:'',...extra});await flush();}
 const click=selector=>emit('click',document.querySelector(selector));
 const tick=async id=>{const box=document.querySelector(`[data-mb-select="${id}"]`);box.checked=true;await emit('change',box);};
 return {ui,document,calls,toasts,timers,click,emit,tick,flush,archived};
}

test('ticking a row shows a bulk bar fixed at the bottom with every batch action; clearing hides it',async()=>{
 const h=await harness();assert.equal(h.document.querySelector('[data-mb-bulkbar]'),null,'no bar without a selection');
 assert.equal(h.document.querySelector('.mb-toolbar .mb-selection'),null,'the old toolbar strip is gone');
 await h.tick('t13');await h.tick('t14');const bar=h.document.querySelector('[data-mb-bulkbar]');assert.ok(bar,'bar appears once rows are ticked');
 assert.ok(bar.closest('[data-task-board-root]'),'inside the board, rendered after the table');
 assert.match(bar.querySelector('[data-mb-bulk-count]').textContent,/已选 2 项/);
 for(const a of ['batch-status','batch-group','batch-priority','batch-owner','batch-due','batch-delete','clear-selection'])assert.ok(bar.querySelector(`[data-mb="${a}"]`),a);
 const css=readFileSync(new URL('../dist/task-board.css',import.meta.url),'utf8');assert.match(css,/\.mb-bulkbar\{position:fixed;[^}]*bottom:20px/,'the bar is fixed to the bottom of the screen');
 await h.click('[data-mb=clear-selection]');assert.equal(h.document.querySelector('[data-mb-bulkbar]'),null);
});

test('employees do not get the owner action; batch status hides Done and sends one request for all rows',async()=>{
 const e=await harness({role:'employee'});await e.tick('t1');assert.equal(e.document.querySelector('[data-mb=batch-owner]'),null,'only managers may reassign');
 const h=await harness();for(const id of ['t1','t2','t3'])await h.tick(id);
 await h.click('[data-mb=batch-status]');assert.equal(h.document.querySelector('[data-mb=pick-batch-status][data-value=done]'),null,'Done needs a result per task');
 await h.click('[data-mb=pick-batch-status][data-value=hold]');
 const batch=h.calls.filter(c=>c.path==='/tasks/batch-board');assert.equal(batch.length,1,'one request, not one per row');
 assert.deepEqual(batch[0].payload,{items:['t1','t2','t3'].map(id=>({id,expectedVersion:1})),changes:{status:'hold'}});
 assert.ok(h.ui.items().filter(t=>['t1','t2','t3'].includes(t.id)).every(t=>t.board_status==='hold'));
 assert.match(h.toasts.at(-1),/已更新 3 项/);assert.ok(h.document.querySelector('[data-mb-bulkbar]'),'selection stays for the next action');
 await h.click('[data-mb=batch-priority]');await h.click('[data-mb=pick-batch-priority][data-value=urgent]');assert.deepEqual(h.calls.at(-1).payload.changes,{priority:'urgent'});
 await h.click('[data-mb=batch-group]');await h.click('[data-mb=pick-move][data-value=ops]');assert.deepEqual(h.calls.at(-1).payload.changes,{groupId:'ops'});
 await h.click('[data-mb=batch-due]');const form=h.document.querySelector('[data-mb-cell-form]');form.querySelector('[name=value]').value='2026-12-01T10:00';await h.emit('submit',form);
 assert.equal(h.calls.at(-1).path,'/tasks/batch-board');assert.ok(h.calls.at(-1).payload.changes.dueAt);
});

test('a group header can select every task in the group',async()=>{
 const h=await harness();await h.click('[data-mb=select-group]');assert.match(h.document.querySelector('[data-mb-bulk-count]').textContent,/已选 15 项/);
 assert.ok(h.document.querySelector('[data-mb-select-group]').hasAttribute('checked'),'the header checkbox shows the whole group is ticked');
 await h.click('[data-mb=select-group]');assert.equal(h.document.querySelector('[data-mb-bulkbar]'),null,'clicking again unselects the group');
});

test('delete archives in one request, shows 「已删除 N 项 · 撤销」 for 10 seconds, and undo restores',async()=>{
 const h=await harness();for(const id of ['t1','t2'])await h.tick(id);await h.click('[data-mb=batch-delete]');
 assert.deepEqual(h.calls.at(-1),{path:'/tasks/batch-archive',payload:{ids:['t1','t2']}});
 assert.equal(h.document.querySelector('[data-task-id=t1]'),null,'deleted rows leave the board');
 const toast=h.document.querySelector('.mb-undo');assert.ok(toast);assert.match(toast.textContent,/已删除 2 项/);assert.match(toast.textContent,/撤销/);
 assert.equal(h.document.querySelector('[data-mb-bulkbar]'),null,'deleted rows are no longer selected');
 assert.equal(h.timers.at(-1).ms,10000,'the undo offer lasts about 10 seconds');
 await h.click('[data-mb=undo-delete]');assert.deepEqual(h.calls.at(-1),{path:'/tasks/batch-restore',payload:{ids:['t1','t2']}});
 assert.ok(h.document.querySelector('[data-task-id=t1]'),'undo brings the rows back');assert.equal(h.document.querySelector('.mb-undo'),null);assert.match(h.toasts.at(-1),/已恢复 2 项/);
 // Without undo the toast goes away by itself.
 await h.tick('t3');await h.click('[data-mb=batch-delete]');assert.ok(h.document.querySelector('.mb-undo'));h.timers.at(-1).fn();assert.equal(h.document.querySelector('.mb-undo'),null);
});

test('rows the person may not delete are reported, not fatal: 「3 项无权删除，已跳过」 and the OKR reason',async()=>{
 const archive=ids=>({archived:[ids[0]],count:1,skipped:[{id:ids[1],code:'TASK_ARCHIVE_FORBIDDEN',message:'x'},{id:ids[2],code:'NOT_FOUND',message:'y'},{id:ids[3],code:'TASK_ARCHIVE_FORBIDDEN',message:'x'},{id:ids[4],code:'TASK_FROM_OKR',message:'来自 OKR 的任务请在 OKR 里删除对应 KR'}]});
 const h=await harness({archive});for(const id of ['t1','t2','t3','t4','t5'])await h.tick(id);await h.click('[data-mb=batch-delete]');
 const toast=h.document.querySelector('.mb-undo').textContent;assert.match(toast,/已删除 1 项/);assert.match(toast,/3 项无权删除，已跳过/);assert.match(toast,/1 项已跳过：来自 OKR 的任务请在 OKR 里删除对应 KR/);
 assert.equal(h.document.querySelector('[data-mb-bulk-count]').textContent.trim(),'已选 4 项','skipped rows stay selected');
 const none=await harness({archive:ids=>({archived:[],count:0,skipped:ids.map(id=>({id,code:'TASK_ARCHIVE_FORBIDDEN',message:'x'}))})});await none.tick('t1');await none.click('[data-mb=batch-delete]');
 assert.equal(none.document.querySelector('.mb-undo'),null,'nothing to undo');assert.match(none.toasts.at(-1),/1 项无权删除，已跳过/);
});
