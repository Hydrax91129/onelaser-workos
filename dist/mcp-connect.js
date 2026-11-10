/*
 * AI connections ("AI 连接"): the WorkOS MCP server for the company owner's own AI.
 *
 * Shown to main admins only. The server (onelaser-workos-api src/mcp.ts) lets only the people in
 * WORKOS_MCP_USER_IDS connect: Claude through OAuth (add a custom connector with the address below),
 * Composio and other clients with a personal token made here (shown once). Everything is read only,
 * and costs, channel prices, suppliers, HR and customer details are never sent to the AI.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '', fresh = null, busy = false;
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const when = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleString(lang() === 'en' ? 'en-US' : 'zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }); };
  const dayOf = v => v ? new Date(v).toLocaleDateString(lang() === 'en' ? 'en-US' : 'zh-CN') : '—';
  const TOOL_INFO = {
    workos_whoami: ['当前账号', 'Who am I'], workos_list_tasks: ['任务列表（我的 / 团队）', 'Task list (mine / team)'], workos_get_task: ['任务详情和进展', 'Task detail and updates'],
    workos_okrs: ['OKR 进度', 'OKR progress'], workos_projects: ['项目、阶段和动态', 'Projects, stages and updates'], workos_search_products: ['产品资料（全员字段）', 'Product library (company-wide fields)'],
    workos_stock: ['库存数量', 'Stock on hand'], workos_returns: ['退货维修进度', 'Returns and repairs'], workos_inbox: ['我的消息', 'My inbox'], workos_people: ['人员和汇报线', 'People and reporting lines']
  };

  function configure(next) { ctx = next; }
  function reset() { data = null; loading = false; error = ''; fresh = null; busy = false; }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/mcp/connections'); error = ''; }
    catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }
  const copyBtn = (value, label) => `<button class="mcpc-copy" data-mcpc="copy" data-v="${esc(value)}">${icon('copy')} ${esc(label || tr('复制', 'Copy'))}</button>`;

  function render() {
    if (!data && !error) { load(); return `<div class="mcpc"><p class="mcpc-hint">${tr('正在读取…', 'Loading…')}</p></div>`; }
    if (error && !data) return `<div class="mcpc"><div class="mcpc-alert">${esc(error)}</div></div>`;
    const off = !data.enabled;
    const tokens = data.tokens || [], calls = data.calls || [];
    return `<div class="mcpc">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · MCP</div><h1>${tr('AI 连接', 'AI connections')}</h1>
        <p>${tr('让你自己的 Claude 或 Composio 直接查 WorkOS 的数据：任务、OKR、项目、产品资料、库存、退货维修和消息。只读，只给你一个人用。', 'Let your own Claude or Composio read WorkOS: tasks, OKRs, projects, product data, stock, returns and your inbox. Read only, for you alone.')}</p></div></div>
      ${!data.configured ? `<div class="mcpc-alert">${tr('服务器还没有设置正式网址（APP_PUBLIC_URL），暂时不能连接。', 'The server has no public address (APP_PUBLIC_URL) yet, so nothing can connect.')}</div>` : ''}
      ${off ? `<section class="mcpc-card mcpc-setup">${icon('lock-key')}<div><h2>${tr('还没开通', 'Not switched on yet')}</h2>
        <p>${tr('为了安全，MCP 默认关闭，需要你本人在 Render 后台打开：', 'For safety the MCP server is off until you switch it on yourself in Render:')}</p>
        <ol><li>${tr('打开 Render 上的 WorkOS 正式服务 → Environment', 'Open the WorkOS service in Render → Environment')}</li>
        <li>${tr('新增环境变量', 'Add the variable')} <code>WORKOS_MCP_USER_IDS</code> = <code>${esc(data.userId)}</code> ${copyBtn(data.userId, tr('复制我的 ID', 'Copy my ID'))}</li>
        <li>${tr('保存后服务会自动重启，回到这个页面刷新即可。只填你自己的 ID，其他人填进去也不能用（必须同时是主管理员）。', 'Save; the service restarts. Come back and refresh. Only your own ID: anyone else would also need to be a main admin.')}</li></ol></div></section>` : ''}
      <section class="mcpc-card"><h2>${icon('link')} ${tr('服务器地址', 'Server address')}</h2>
        <div class="mcpc-url"><code>${esc(data.url)}</code>${copyBtn(data.url)}</div></section>
      <div class="mcpc-grid">
        <section class="mcpc-card"><h2>${icon('sparkle')} ${tr('连接 Claude', 'Connect Claude')}</h2>
          <ol><li>${tr('在 Claude 打开 设置 → 连接器（Connectors）→ 添加自定义连接器', 'In Claude open Settings → Connectors → Add custom connector')}</li>
          <li>${tr('名称填 WorkOS，地址填上面的服务器地址，不用填 Client ID', 'Name it WorkOS, paste the server address above; leave Client ID empty')}</li>
          <li>${tr('点“连接”，会打开 WorkOS 的授权页：确认是你本人账号后点“允许”', 'Click Connect; WorkOS opens an approval page: check it is your account and click Allow')}</li></ol>
          <p class="mcpc-hint">${icon('info')} ${tr('授权页要求这个浏览器已经登录 WorkOS。授权 30 天内自动续期，可以随时在下面断开。', 'The approval page needs you signed in to WorkOS in that browser. Access renews itself for 30 days; disconnect any time below.')}</p></section>
        <section class="mcpc-card"><h2>${icon('plugs-connected')} ${tr('连接 Composio 或其他工具', 'Connect Composio or another tool')}</h2>
          <ol><li>${tr('在下面生成一个个人令牌（只显示一次）', 'Make a personal token below (shown once)')}</li>
          <li>${tr('在 Composio 添加自定义 MCP 服务器：地址填上面的服务器地址', 'In Composio add a custom MCP server with the address above')}</li>
          <li>${tr('认证选 Bearer Token / API Key，请求头是', 'Choose Bearer token / API key auth; the header is')} <code>Authorization: Bearer ${tr('你的令牌', 'your-token')}</code></li></ol>
          ${off ? '' : `<form class="mcpc-form" data-mcpc-form><input name="name" maxlength="60" required placeholder="${tr('用途，比如 Composio', 'Name, e.g. Composio')}">
            <select name="days"><option value="30">${tr('30 天有效', '30 days')}</option><option value="90" selected>${tr('90 天有效', '90 days')}</option><option value="365">${tr('1 年有效', '1 year')}</option></select>
            <button class="btn primary" ${busy ? 'disabled' : ''}>${icon('key')} ${tr('生成令牌', 'Make token')}</button></form>`}
          ${fresh ? `<div class="mcpc-fresh"><b>${icon('warning')} ${tr('令牌只显示这一次，请马上复制保存到 Composio。关掉页面后就看不到了。', 'This token is shown only once. Copy it into Composio now.')}</b>
            <div class="mcpc-url"><code>${esc(fresh.token)}</code>${copyBtn(fresh.token)}</div>
            <button class="mcpc-link" data-mcpc="hide">${tr('我已保存，隐藏', 'Saved, hide it')}</button></div>` : ''}</section>
      </div>
      <section class="mcpc-card"><h2>${icon('plug')} ${tr('已连接', 'Connected')} <span class="mcpc-count">${tokens.length}</span></h2>
        ${tokens.length ? `<table class="mcpc-table"><thead><tr><th>${tr('名称', 'Name')}</th><th>${tr('方式', 'Type')}</th><th>${tr('创建', 'Created')}</th><th>${tr('最近使用', 'Last used')}</th><th>${tr('到期', 'Expires')}</th><th></th></tr></thead><tbody>
          ${tokens.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${t.kind === 'oauth' ? tr('Claude 授权', 'Claude sign-in') : tr('个人令牌', 'Personal token')}</td><td>${dayOf(t.createdAt)}</td><td>${when(t.lastUsedAt)}</td><td>${t.expiresAt ? dayOf(t.expiresAt) : tr('自动续期', 'Renews')}</td>
            <td><button class="mcpc-revoke" data-mcpc="revoke" data-id="${esc(t.id)}" data-name="${esc(t.name)}">${tr('断开', 'Disconnect')}</button></td></tr>`).join('')}
        </tbody></table>` : `<p class="mcpc-hint">${tr('还没有任何 AI 连接。', 'Nothing is connected yet.')}</p>`}</section>
      <div class="mcpc-grid">
        <section class="mcpc-card"><h2>${icon('eye')} ${tr('AI 能看到的', 'What the AI can read')}</h2>
          <ul class="mcpc-list">${(data.tools || []).map(t => `<li>${icon('check')} ${esc(TOOL_INFO[t.name] ? tr(...TOOL_INFO[t.name]) : t.title)} <code>${esc(t.name)}</code></li>`).join('')}</ul>
          <p class="mcpc-hint">${tr('全部只读：不能新建、修改或删除任何东西。按你本人的权限查，已删除的任务不会出现。', 'All read only: it cannot create, change or delete anything. It sees what you see; deleted tasks never appear.')}</p></section>
        <section class="mcpc-card mcpc-never"><h2>${icon('shield-check')} ${tr('永远不会给 AI 的', 'Never sent to the AI')}</h2>
          <ul class="mcpc-list">${[['成本、到岸价、尾程运费、利润', 'Costs, landed cost, last-mile freight, margins'], ['MAP、促销底价和各渠道价（经销商、Amazon 等）', 'MAP, promotion floor and channel prices (dealers, Amazon …)'], ['供应商、报关信息、采购参数', 'Suppliers, customs details, purchasing settings'], ['人事档案、薪资、证件和银行信息', 'HR records, salaries, ID and bank details'], ['客户资料：退货的客户和订单号、客服工单', 'Customer details: return customers and order numbers, support tickets'], ['员工的电话和邮箱', 'Staff phone numbers and emails']].map(([zh, en]) => `<li>${icon('x')} ${tr(zh, en)}</li>`).join('')}</ul>
          <p class="mcpc-hint">${tr('即使你本人有权限也不会给：AI 拿到的内容会离开 WorkOS，交给 Anthropic 或 Composio 处理。', 'Even though you can see them: whatever the AI reads leaves WorkOS for Anthropic or Composio.')}</p></section>
      </div>
      <section class="mcpc-card"><h2>${icon('clock-counter-clockwise')} ${tr('最近调用', 'Recent calls')}</h2>
        ${calls.length ? `<ul class="mcpc-calls">${calls.map(c => `<li><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? icon('check-circle') : icon('warning-circle')}</span> ${esc(TOOL_INFO[c.tool] ? tr(...TOOL_INFO[c.tool]) : c.tool)} <small>${when(c.at)}</small></li>`).join('')}</ul>` : `<p class="mcpc-hint">${tr('还没有调用记录。', 'No calls yet.')}</p>`}</section>
    </div>`;
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-mcpc]'); if (!b || !ctx) return;
    e.preventDefault();
    const act = b.dataset.mcpc;
    if (act === 'copy') { try { await navigator.clipboard.writeText(b.dataset.v); ctx.toast?.(tr('已复制', 'Copied')); } catch { ctx.toast?.(tr('复制失败，请手动选择复制', 'Could not copy; select it by hand')); } return; }
    if (act === 'hide') { fresh = null; return ctx.rerender(); }
    if (act === 'revoke') {
      if (!window.confirm(tr(`断开「${b.dataset.name}」？断开后它马上不能再读取 WorkOS。`, `Disconnect "${b.dataset.name}"? It stops reading WorkOS at once.`))) return;
      try { await ctx.api.post('/mcp/tokens/' + encodeURIComponent(b.dataset.id) + '/revoke', {}); ctx.toast?.(tr('已断开', 'Disconnected')); data = null; ctx.rerender(); }
      catch (x) { ctx.toast?.(x.message || tr('操作失败', 'Could not disconnect')); }
    }
  });
  document.addEventListener('submit', async e => {
    const form = e.target.closest?.('[data-mcpc-form]'); if (!form || !ctx) return;
    e.preventDefault(); if (busy) return;
    const name = form.querySelector('[name=name]').value.trim(), days = Number(form.querySelector('[name=days]').value);
    if (!name) return;
    busy = true; ctx.rerender();
    try { fresh = await ctx.api.post('/mcp/tokens', { name, days }); const keep = fresh; data = null; await load(); fresh = keep; }
    catch (x) { ctx.toast?.(x.message || tr('生成失败', 'Could not make a token')); }
    finally { busy = false; ctx.rerender(); }
  });

  window.WorkOSMcpConnect = { configure, render, reset };
})();
