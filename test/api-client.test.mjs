import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../dist/api-client.js', import.meta.url),'utf8');
const liveSource = await readFile(new URL('../dist/live-app.js', import.meta.url),'utf8');
const demoSource = await readFile(new URL('../dist/app.js', import.meta.url),'utf8');
function response(status, value) { return {status,ok:status>=200&&status<300,json:async()=>value}; }
function client(fetcher, language=()=> 'en') {
  const window={location:{origin:'https://work.example'},fetch:fetcher};
  vm.runInNewContext(source,{window,URL,AbortController,setTimeout,clearTimeout});
  return {Client:window.WorkOSApi.Client,api:new window.WorkOSApi.Client({fetcher,language})};
}

test('API configuration rejects a different origin',()=>{
  const {Client}=client(async()=>response(200,{}));
  assert.throws(()=>new Client({base:'https://another.example/api'}),error=>error.code==='INVALID_API_ORIGIN');
});
test('authenticated GET uses same-origin cookies and the selected language without a bearer token',async()=>{
  const calls=[];let language='zh';
  const {api}=client(async(url,options)=>{calls.push({url,options});return response(200,{items:[]});},()=>language);
  await api.get('/tasks');language='en';await api.get('/tasks');
  assert.equal(calls[0].url,'https://work.example/api/tasks');
  assert.equal(calls[0].options.credentials,'same-origin');
  assert.equal(calls[0].options.headers['Accept-Language'],'zh');
  assert.equal(calls[1].options.headers['Accept-Language'],'en');
  assert.equal(calls[0].options.headers.Authorization,undefined);
});
test('writes obtain CSRF first and send the original user input only once',async()=>{
  const calls=[];
  const {api}=client(async(url,options)=>{calls.push({url,options});return response(200,url.endsWith('/auth/csrf')?{csrfToken:'test-only-csrf'}:{saved:true});});
  const title='用户原文 <script> & outcome';
  await api.post('/tasks',{title});
  assert.equal(calls.length,2);assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[1].options.headers['X-CSRF-Token'],'test-only-csrf');
  assert.equal(JSON.parse(calls[1].options.body).title,title);
});
test('a missing CSRF value prevents a mutation',async()=>{
  let count=0;const {api}=client(async()=>{count++;return response(200,{});});
  await assert.rejects(api.post('/tasks',{}),error=>error.code==='CSRF_UNAVAILABLE');
  assert.equal(count,1);
});
test('unauthorized responses invalidate the in-memory CSRF value',async()=>{
  const {api}=client(async()=>response(401,{error:{code:'UNAUTHENTICATED',message:'Sign in again'}}));
  api.csrfToken='old';await assert.rejects(api.get('/me'),error=>error.status===401&&error.code==='UNAUTHENTICATED');
  assert.equal(api.csrfToken,null);
});
test('CSRF failures do not automatically repeat a mutation',async()=>{
  let count=0;const {api}=client(async()=>{count++;return response(403,{error:{code:'CSRF_INVALID',message:'Refresh the page'}});});
  api.csrfToken='old';await assert.rejects(api.post('/tasks',{}),error=>error.code==='CSRF_INVALID');
  assert.equal(count,1);assert.equal(api.csrfToken,null);
});
test('an invalid response never exposes an HTML error page',async()=>{
  const {api}=client(async()=>({status:502,ok:false,json:async()=>{throw new Error('<private-proxy-page>');}}));
  await assert.rejects(api.get('/tasks'),error=>error.code==='INVALID_RESPONSE'&&!error.message.includes('private-proxy'));
});
test('network failure reports an unconfirmed save rather than success',async()=>{
  const {api}=client(async()=>{throw Object.assign(new Error('aborted'),{name:'AbortError'});});
  await assert.rejects(api.get('/tasks'),error=>error.code==='TIMEOUT'&&error.message.includes('not been confirmed'));
});
test('a cancelled drawer read aborts the fetch and is distinct from a timeout',async()=>{
  const controller=new AbortController();let fetchSignal;
  const {api}=client(async(url,options)=>new Promise((resolve,reject)=>{fetchSignal=options.signal;options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});}));
  const request=api.get('/tasks/task-1',{signal:controller.signal});controller.abort();
  await assert.rejects(request,error=>error.code==='CANCELLED');assert.equal(fetchSignal.aborted,true);
});
test('an already cancelled read makes no HTTP request',async()=>{
  let calls=0;const {api}=client(async()=>{calls++;return response(200,{});});const controller=new AbortController();controller.abort();
  await assert.rejects(api.get('/tasks',{signal:controller.signal}),error=>error.code==='CANCELLED');assert.equal(calls,0);
});

function documentStub() {
  const elements=new Map(['app','overlay-root','toast'].map(id=>[id,{innerHTML:'',textContent:'',classList:{add(){},remove(){}}}]));
  return {elements,documentElement:{dataset:{theme:'light'},lang:'zh-CN'},body:{style:{}},title:'',activeElement:null,addEventListener(){},getElementById:id=>elements.get(id),querySelector:()=>null,contains:()=>false};
}
async function loadLive({authenticated=false,mode='live',taskTitle='Server-backed deliverable',loginEnabled}={}) {
  const document=documentStub(),calls=[];
  const window={WORKOS_CONFIG:{mode,apiBase:'/api'},WorkI18n:{lang:'en',set(){}},location:{origin:'https://work.example'}};
  window.fetch=async(url,options)=>{
    calls.push({url,options});const path=new URL(url).pathname;
    if(path==='/api/capabilities')return response(200,{dingtalk:'configured',...(loginEnabled===undefined?{}:{auth:{loginEnabled}})});
    if(path==='/api/me')return authenticated?response(200,{id:'actual-user',display_name:'Actual company user',department_id:'dept-live',role:'employee'}):response(401,{error:{code:'UNAUTHENTICATED',message:'Sign in'}});
    if(path==='/api/tasks')return response(200,{items:[{id:'actual-task',title:taskTitle,owner_id:'actual-user',status:'planned',due_at:'2026-11-01T10:00:00Z'}]});
    if(path==='/api/directory')return response(200,{items:[{id:'actual-user',display_name:'Actual company user'}]});
    return response(200,{items:[]});
  };
  const context={window,document,URL,AbortController,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),Intl,Date,Map,console};
  vm.runInNewContext(source,context);vm.runInNewContext(liveSource,context);
  await new Promise(resolve=>setTimeout(resolve,10));
  return {html:document.elements.get('app').innerHTML,calls};
}
test('live mode without a session offers DingTalk sign-in and renders no employee seed data',async()=>{
  const {html,calls}=await loadLive();
  assert.match(html,/Sign in with DingTalk/);// The sign-in page shows OneLaser's product line (Hydra is a real machine); seed data must not appear anywhere else.
  assert.match(html,/login-showcase/);assert.doesNotMatch(html.replace(/<div class="login-showcase"[\s\S]*?<div class="login-values-head">/,''),/Hydra|Lin Nan|陈一|m1/);assert.doesNotMatch(html,/Lin Nan|陈一/);
  assert.deepEqual(calls.map(call=>new URL(call.url).pathname),['/api/capabilities','/api/me']);
});
test('authenticated live mode renders authorized server records and has no identity selector',async()=>{
  const {html,calls}=await loadLive({authenticated:true});
  assert.match(html,/Server-backed deliverable/);assert.match(html,/Actual company user/);
  assert.doesNotMatch(html,/data-identity|sidebar-identity|gateway-identity|Hydra/);
  assert.ok(calls.some(call=>call.url.endsWith('/directory')));
});
test('demo mode does not start any live API request',async()=>{
  const result=await loadLive({mode:'demo'});assert.equal(result.calls.length,0);
});
test('the demo application exits before touching browser storage in live mode',()=>{
  let touched=false;
  const window={WORKOS_CONFIG:{mode:'live'}};
  vm.runInNewContext(demoSource,{window,get localStorage(){touched=true;throw new Error('Must not read business storage');}});
  assert.equal(touched,false);
});

test('a configured provider with login disabled cannot offer an active sign-in button',async()=>{
  const {html}=await loadLive({loginEnabled:false});
  assert.match(html,/data-live-action="login" disabled/);
});
test('server-originated task text is escaped before rendering',async()=>{
  const {html}=await loadLive({authenticated:true,taskTitle:'<img src=x onerror=alert(1)> & user text'});
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt; &amp; user text/);
  assert.doesNotMatch(html,/<img src=x/);
});
test('the bootstrap contains no inline script and keeps preferences ahead of styles',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/);
  assert.ok(html.indexOf('preferences.js')<html.indexOf('styles.css'));
});
