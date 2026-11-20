/*
 * AI超算 (owner, 2026-11-20): a private AI workbench with three desks: mechanical / industrial design, electrical design
 * and software development. Only the owner sees it (server: onelaser-workos-api src/ai-lab.ts decides; everyone else
 * gets 404). Replies stream in the background; this page polls the conversation and draws Markdown, tables and code.
 * ```svg and ```html blocks open as live previews from /api/ai-lab/previews/:id, a sandboxed page with no access to WorkOS.
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let pending = []; // attached files waiting to be sent
  let ctx = null, chats = null, ready = true, loading = false, error = '', chat = null, desk = 'mech', sending = false, poll = null, draft = '';
  const previews = new Map(); // block text → preview url
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const DESKS = {
    mech: { zh:'机械 / 工业设计', en:'Mechanical & industrial design', icon:'gear-six', tag:['结构、传动、钣金与机加工、公差、强度计算、BOM 与成本，出三视图和可旋转 3D 模型', 'Structures, motion, sheet metal and machining, tolerances, strength checks, BOM and cost, with drawings and rotatable 3D models'],
      examples:[['设计一台 1300×900 mm 工作幅面的 CO2 激光切割机龙门结构：选导轨、同步带还是齿条，给出关键尺寸、BOM 和三视图', 'Design the gantry of a 1300×900 mm CO2 laser cutter: rails, belt or rack, key dimensions, BOM and a three-view drawing'],
        ['给桌面激光雕刻机设计一个可调高度的蜂窝工作台，给 3D 模型（可以拖动旋转）和零件清单', 'Design a height-adjustable honeycomb bed for a desktop laser engraver, with a rotatable 3D model and a parts list'],
        ['计算 Z 轴丝杆升降 15 kg 负载需要的电机扭矩，并推荐丝杆和电机型号', 'Size the Z-axis lead screw and motor torque to lift a 15 kg load and recommend parts'],
        ['为一款 20W 光纤激光打标机做工业设计外观方案：三个方向、材料与表面处理、成本', 'Three industrial-design directions for a 20W fiber marking machine: look, materials, finish and cost']] },
    elec: { zh:'电气设计', en:'Electrical design', icon:'lightning', tag:['电源与配电、步进 / 伺服驱动、激光电源与安全联锁、线径与保护计算，出原理图和接线图', 'Power and distribution, stepper / servo drives, laser power and interlocks, wire and fuse sizing, with schematics and wiring diagrams'],
      examples:[['给 100W CO2 激光切割机设计完整电气系统：配电、激光电源、三轴步进驱动、水冷与门盖安全联锁，画接线图', 'Design the full electrical system of a 100W CO2 laser cutter: power, laser PSU, three stepper drives, chiller and lid interlocks, with a wiring diagram'],
        ['设计一个 24V 转 5V / 3A 的降压电源电路，给原理图、器件型号和 BOM', 'Design a 24V to 5V / 3A buck converter: schematic, part numbers and BOM'],
        ['机器要卖到美国，列出 UL / FDA 激光安全需要做的电气设计和测试清单', 'The machine ships to the US: list the electrical design and test items for UL and FDA laser safety'],
        ['计算 220V 3kW 主机的线径、断路器和漏电保护选型', 'Size the wires, breaker and RCD for a 220V 3kW machine']] },
    soft: { zh:'软件开发', en:'Software development', icon:'code', tag:['网站、落地页、管理后台、小工具和自动化脚本，网页直接预览', 'Websites, landing pages, dashboards, tools and scripts; pages preview right here'],
      examples:[['给一款新激光雕刻机做一个高级感的产品落地页：首屏、卖点、参数表、客户评价、购买按钮', 'Build a premium landing page for a new laser engraver: hero, features, specs, reviews and a buy button'],
        ['做一个激光切割报价计算器网页：输入材料、厚度、切割长度，算出时间和价格', 'Make a laser cutting quote calculator: material, thickness and cut length in, time and price out'],
        ['做一个经销商申请表单页面，带表单校验，提交后显示感谢页', 'Build a dealer application form page with validation and a thank-you screen'],
        ['写一个 Python 脚本：把一个文件夹里的 DXF 文件批量统计切割总长度，导出 Excel', 'Write a Python script that totals the cut length of every DXF in a folder and exports Excel']] },
  };

  function configure(next) { ctx = next; }
  function reset() { pending = []; chats = null; chat = null; error = ''; loading = false; sending = false; draft = ''; stopPoll(); previews.clear(); }
  async function loadList() {
    if (loading) return; loading = true;
    try { const r = await ctx.api.get('/ai-lab/chats'); chats = r.chats || []; ready = r.ready !== false; error = ''; }
    catch (e) { error = e.message || tr('读取失败', 'Could not load'); }
    finally { loading = false; ctx.rerender(); }
  }
  async function openChat(id) {
    try { chat = await ctx.api.get('/ai-lab/chats/' + encodeURIComponent(id)); } catch (e) { ctx.toast?.(e.message); return; }
    ctx.rerender(); if (chat.busy) startPoll();
  }
  function stopPoll() { if (poll) { clearTimeout(poll); poll = null; } }
  function startPoll() {
    stopPoll();
    const tick = async () => {
      if (!chat) return;
      try {
        const next = await ctx.api.get('/ai-lab/chats/' + encodeURIComponent(chat.id));
        if (!chat || next.id !== chat.id) return;
        chat = next; paintMessages();
        if (chat.busy) poll = setTimeout(tick, 800);
        else { poll = null; const c = chats?.find(x => x.id === chat.id); if (c) { c.busy = false; c.title = chat.title; } ctx.rerender(); }
      } catch { poll = setTimeout(tick, 2000); }
    };
    poll = setTimeout(tick, 600);
  }

  /* ---------- Markdown (headings, lists, tables, bold, inline code, fenced code with previews) ---------- */
  function inline(t) {
    return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  }
  function table(lines) {
    const rows = lines.filter(l => !/^\s*\|?\s*:?-{2,}/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    const [head, ...body] = rows;
    return `<div class="ail-table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function prose(text) {
    const out = [], lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      let m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { out.push(`<h${Math.min(6, m[1].length + 2)}>${inline(m[2])}</h${Math.min(6, m[1].length + 2)}>`); continue; }
      if (/^\s*\|.*\|\s*$/.test(l)) { const t = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) t.push(lines[i++]); i--; out.push(table(t)); continue; }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '')); i--;
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(x => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
      }
      if (/^\s*>/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^\s*>\s?/, ''))}</blockquote>`); continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); continue; }
      out.push(`<p>${inline(l)}</p>`);
    }
    return out.join('');
  }
  function markdown(text, live) {
    const parts = [], re = /```([\w+-]*)[^\n]*\n([\s\S]*?)(```|$)/g; let last = 0, m, n = 0;
    while ((m = re.exec(text))) {
      parts.push(prose(text.slice(last, m.index)));
      const langId = (m[1] || '').toLowerCase(), code = m[2].replace(/\n$/, ''), closed = m[3] === '```';
      parts.push(codeBlock(langId, code, closed && !live, n++)); last = re.lastIndex;
      if (!m[3]) break;
    }
    parts.push(prose(text.slice(last)));
    return parts.join('');
  }
  const previewKind = l => l === 'html' ? 'html' : l === 'svg' || l === 'xml' ? 'svg' : '';
  function codeBlock(l, code, done, n) {
    const kind = previewKind(l) && (l !== 'xml' || /^\s*<svg/i.test(code)) ? previewKind(l) : '';
    const lines = code.split('\n').length;
    const label = kind === 'html' ? (/three(\.min)?\.js/.test(code) ? tr('3D 模型', '3D model') : tr('网页', 'Web page')) : kind === 'svg' ? tr('图纸', 'Drawing') : (l || tr('代码', 'Code'));
    const key = previews.get(code);
    return `<div class="ail-code ${kind ? 'has-preview' : ''}" data-ail-block="${esc(kind)}">
      <div class="ail-code-head"><span>${icon(kind === 'svg' ? 'ruler' : kind === 'html' ? 'browser' : 'code')} ${esc(label)} <small>${tr(`${lines} 行`, `${lines} lines`)}</small></span>
        ${done ? `<span class="ail-code-actions">${kind ? `<button type="button" class="ail-link" data-ail="toggle-code">${tr('看代码', 'Code')}</button>${key ? `<a class="ail-link" href="${esc(key)}" target="_blank" rel="noopener">${icon('arrow-square-out')} ${tr('新窗口打开', 'Open in new tab')}</a>` : ''}` : ''}<button type="button" class="ail-link" data-ail="copy">${icon('copy')} ${tr('复制', 'Copy')}</button><button type="button" class="ail-link" data-ail="download" data-ext="${esc(kind || l || 'txt')}">${icon('download-simple')} ${tr('下载', 'Download')}</button></span>` : `<span class="ail-gen">${tr('正在生成…', 'Generating…')}</span>`}</div>
      ${kind && done ? `<div class="ail-preview" data-ail-preview="${n}">${key ? `<iframe src="${esc(key)}" title="${esc(label)}" loading="lazy"></iframe>` : `<p class="ail-hint">${tr('正在准备预览…', 'Preparing the preview…')}</p>`}</div>` : ''}
      <pre class="${kind && done ? 'collapsed' : ''}"><code>${esc(code)}</code></pre></div>`;
  }
  // After the reply is complete, register each previewable block once and redraw with its frame.
  async function ensurePreviews() {
    if (!chat) return;
    const blocks = []; const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;
    for (const m of chat.messages.filter(x => x.role === 'assistant' && x.status === 'done')) { let b; while ((b = re.exec(m.text))) { const l = (b[1] || '').toLowerCase(), code = b[2].replace(/\n$/, ''); const k = previewKind(l); if (k && (l !== 'xml' || /^\s*<svg/i.test(code)) && !previews.has(code)) blocks.push([k, code]); } }
    if (!blocks.length) return;
    for (const [kind, body] of blocks) { try { const r = await ctx.api.post('/ai-lab/previews', { kind, body }); previews.set(body, r.url); } catch { /* keep the code view */ } }
    paintMessages();
  }

  /* ---------- page ---------- */
  // An attached file in a message: a thumbnail for images, a chip for PDFs and text files; both open in the file preview.
  const fileUrl = f => `/api/ai-lab/files/${encodeURIComponent(f.id)}`;
  const fileChip = f => f.kind === 'image'
    ? `<a class="ail-thumb" href="${esc(fileUrl(f))}" title="${esc(f.name)}"><img src="${esc(fileUrl(f))}" alt="${esc(f.name)}" loading="lazy"></a>`
    : `<a class="ail-file" href="${esc(fileUrl(f))}" title="${esc(f.name)}">${icon(f.kind === 'pdf' ? 'file-pdf' : f.kind === 'text' ? 'file-text' : 'file')}<span>${esc(f.name)}</span></a>`;
  const fileB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(f); });
  const pendingHtml = () => pending.length ? `<div class="ail-pending">${pending.map(f => `<span class="ail-pend">${icon(f.kind === 'image' ? 'image' : f.kind === 'pdf' ? 'file-pdf' : f.kind === 'text' ? 'file-text' : 'file')}${esc(f.name)}<button type="button" data-ail="unattach" data-id="${esc(f.id)}" aria-label="${tr('移除', 'Remove')}">${icon('x')}</button></span>`).join('')}</div>` : '';
  // Big photos are scaled down in the browser first (long edge 2400 px), so a phone photo of a drawing always fits.
  async function shrink(f) {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size <= 4.5 * 1024 * 1024 || typeof createImageBitmap !== 'function') return f;
    try {
      const img = await createImageBitmap(f), k = Math.min(1, 2400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      return blob ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type:'image/jpeg' }) : f;
    } catch { return f; }
  }
  async function attach(files) {
    for (const raw of files) { const f = await shrink(raw);
      window.WorkOSUpload?.status('ail-files', tr(`正在上传 ${f.name}…`, `Uploading ${f.name}…`));
      try { pending.push(await ctx.api.post('/ai-lab/files', { name:f.name || 'image.png', mime:f.type || '', dataBase64:await fileB64(f) })); window.WorkOSUpload?.status('ail-files', ''); }
      catch (e) { window.WorkOSUpload?.status('ail-files', `${f.name}：${e.message || tr('上传失败', 'Upload failed')}`, true); }
    }
    const box = document.querySelector('[data-ail-pending]'); if (box) box.innerHTML = pendingHtml();
  }

  function messagesHtml() {
    if (!chat || !chat.messages.length) {
      const d = DESKS[desk];
      return `<div class="ail-empty"><div class="ail-orb">${icon(d.icon)}</div><h2>${tr(d.zh, d.en)}</h2><p>${tr(d.tag[0], d.tag[1])}</p>
        <div class="ail-examples">${d.examples.map(([zh, en]) => `<button type="button" data-ail="example" data-text="${esc(tr(zh, en))}">${icon('sparkle')}<span>${esc(tr(zh, en))}</span></button>`).join('')}</div></div>`;
    }
    return chat.messages.map(m => m.role === 'user'
      ? `<div class="ail-msg user"><div class="ail-bubble">${m.files?.length ? `<div class="ail-files">${m.files.map(fileChip).join('')}</div>` : ''}${esc(m.text).replace(/\n/g, '<br>')}</div></div>`
      : `<div class="ail-msg ai"><div class="ail-avatar">${icon('cpu')}</div><div class="ail-answer">${m.text ? markdown(m.text, m.status === 'streaming') : ''}
          ${m.status === 'streaming' ? `<div class="ail-thinking"><i></i><i></i><i></i> ${m.text ? tr('正在输出', 'Writing') : tr('正在计算', 'Computing')}</div>` : ''}
          ${m.status === 'error' ? `<p class="ail-error">${tr('这次没有算完，请重试。', 'This one did not finish; please try again.')}</p>` : ''}
          ${m.status === 'stopped' ? `<p class="ail-hint">${tr('已停止', 'Stopped')}</p>` : ''}</div></div>`).join('');
  }
  function paintMessages() {
    const box = document.querySelector('.ail-msgs'); if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    box.innerHTML = messagesHtml();
    if (nearBottom) box.scrollTop = box.scrollHeight;
    const busy = !!chat?.busy, stop = document.querySelector('[data-ail="stop"]'), send = document.querySelector('.ail-send');
    if (stop) stop.hidden = !busy; if (send) send.hidden = busy;
    if (!busy) ensurePreviews();
  }
  function render(page) {
    // upload-zone.js loads after this file, so the box is registered on each render (re-registering is harmless).
    window.WorkOSUpload?.register('ail-files', { lang:lang(), accept:[], multiple:true, maxBytes:50 * 1024 * 1024, onFiles:files => attach(files) });
    desk = { 'ai-mech':'mech', 'ai-elec':'elec', 'ai-soft':'soft' }[page] || 'mech';
    if (!chats && !error) { loadList(); return `<div class="ail"><p class="ail-hint">${tr('正在连接 AI超算…', 'Connecting…')}</p></div>`; }
    if (error && !chats) return `<div class="ail"><div class="ail-alert">${esc(error)}</div></div>`;
    if (chat && chat.desk !== desk) { chat = null; stopPoll(); }
    const mine = chats.filter(c => c.desk === desk), d = DESKS[desk];
    setTimeout(() => { const box = document.querySelector('.ail-msgs'); if (box) box.scrollTop = box.scrollHeight; if (!chat?.busy) ensurePreviews(); }, 0);
    return `<div class="ail">
      <aside class="ail-side">
        <div class="ail-brand"><span class="ail-logo">${icon('cpu')}</span><div><b>${tr('AI超算', 'AI Compute')}</b><small>${tr(d.zh, d.en)}</small></div></div>
        <button type="button" class="btn primary ail-new" data-ail="new">${icon('plus')} ${tr('新对话', 'New chat')}</button>
        <div class="ail-list">${mine.map(c => `<button type="button" class="ail-item ${chat?.id === c.id ? 'on' : ''}" data-ail="open" data-id="${esc(c.id)}"><span>${esc(c.title || tr('新对话', 'New chat'))}</span>${c.busy ? '<i class="ail-dot"></i>' : ''}<i class="ail-del" data-ail="delete" data-id="${esc(c.id)}" title="${tr('删除', 'Delete')}">${icon('trash')}</i></button>`).join('') || `<p class="ail-hint">${tr('还没有对话', 'No chats yet')}</p>`}</div>
      </aside>
      <section class="ail-main">
        <header class="ail-top"><div>${icon(d.icon)} <b>${tr(d.zh, d.en)}</b></div><span class="ail-status ${ready ? 'on' : ''}">${ready ? tr('算力在线', 'Online') : tr('AI 引擎未接入', 'Engine not connected')}</span></header>
        <div class="ail-msgs">${messagesHtml()}</div>
        <form class="ail-compose" id="ail-compose" data-upload-scope="ail-files">
          ${window.WorkOSUpload ? window.WorkOSUpload.html({ id:'ail-files', lang:lang(), accept:[], multiple:true, maxBytes:50 * 1024 * 1024, label:tr('上传任何文件（图纸、照片、PDF、CAD、Excel…）：拖到这里、粘贴截图，或点击选择', 'Attach any file (drawings, photos, PDF, CAD, Excel…): drag here, paste a screenshot, or click'), hint:'' }) : ''}
          <div data-ail-pending>${pendingHtml()}</div>
          <textarea name="text" rows="3" maxlength="20000" placeholder="${tr('描述你的需求，越具体越好（尺寸、功率、用途、预算……）。Enter 发送，Shift + Enter 换行', 'Describe what you need: sizes, power, use, budget… Enter to send, Shift + Enter for a new line')}">${esc(draft)}</textarea>
          <div class="ail-compose-bar"><small>${tr('结果供参考，涉及安全和量产请由工程师复核', 'Review safety-critical and production designs with an engineer')}</small>
            <button type="button" class="btn" data-ail="stop" ${chat?.busy ? '' : 'hidden'}>${icon('stop')} ${tr('停止', 'Stop')}</button>
            <button type="submit" class="btn primary ail-send" ${chat?.busy ? 'hidden' : ''} ${sending ? 'disabled' : ''}>${icon('paper-plane-right')} ${tr('发送', 'Send')}</button></div>
        </form>
      </section></div>`;
  }

  async function send(text) {
    text = String(text || '').trim(); if ((!text && !pending.length) || sending) return;
    sending = true;
    try {
      if (!chat || chat.desk !== desk) { chat = await ctx.api.post('/ai-lab/chats', { desk }); chats = [{ id:chat.id, desk, title:'', busy:true }, ...(chats || [])]; }
      chat = await ctx.api.post(`/ai-lab/chats/${encodeURIComponent(chat.id)}/messages`, { text, fileIds:pending.map(f => f.id) });
      draft = ''; pending = []; const c = chats.find(x => x.id === chat.id); if (c) { c.title = chat.title; c.busy = true; }
      startPoll();
    } catch (e) { ctx.toast?.(e.message || tr('发送失败', 'Could not send')); }
    finally { sending = false; ctx.rerender(); }
  }
  const blockText = el => el.closest('.ail-code')?.querySelector('pre code')?.textContent || '';

  document.addEventListener('click', async e => {
    if (!ctx || !e.target.closest?.('.ail')) return;
    const b = e.target.closest('[data-ail]'); if (!b) return;
    const a = b.dataset.ail;
    if (a === 'delete') { e.stopPropagation(); if (!window.confirm(tr('删除这个对话？', 'Delete this chat?'))) return; try { await ctx.api.request('/ai-lab/chats/' + encodeURIComponent(b.dataset.id), { method:'DELETE' }); chats = chats.filter(c => c.id !== b.dataset.id); if (chat?.id === b.dataset.id) { chat = null; stopPoll(); } ctx.rerender(); } catch (x) { ctx.toast?.(x.message); } return; }
    if (a === 'open') { stopPoll(); return openChat(b.dataset.id); }
    if (a === 'new') { stopPoll(); chat = null; draft = ''; ctx.rerender(); setTimeout(() => document.querySelector('.ail-compose textarea')?.focus(), 0); return; }
    if (a === 'example') { draft = b.dataset.text; const t = document.querySelector('.ail-compose textarea'); if (t) { t.value = draft; t.focus(); } return; }
    if (a === 'stop' && chat) { try { await ctx.api.post(`/ai-lab/chats/${encodeURIComponent(chat.id)}/stop`, {}); } catch { /* the poll shows the state */ } return; }
    if (a === 'unattach') { pending = pending.filter(f => f.id !== b.dataset.id); const box = document.querySelector('[data-ail-pending]'); if (box) box.innerHTML = pendingHtml(); return; }
    if (a === 'toggle-code') { b.closest('.ail-code')?.querySelector('pre')?.classList.toggle('collapsed'); return; }
    if (a === 'copy') { try { await navigator.clipboard.writeText(blockText(b)); ctx.toast?.(tr('已复制', 'Copied')); } catch { ctx.toast?.(tr('复制失败', 'Could not copy')); } return; }
    if (a === 'download') {
      const ext = { html:'html', svg:'svg', python:'py', py:'py', javascript:'js', js:'js', typescript:'ts', ts:'ts', openscad:'scad', scad:'scad', c:'c', cpp:'cpp', json:'json', csv:'csv' }[b.dataset.ext] || 'txt';
      const url = URL.createObjectURL(new Blob([blockText(b)], { type: ext === 'html' ? 'text/html' : ext === 'svg' ? 'image/svg+xml' : 'text/plain' }));
      const link = document.createElement('a'); link.href = url; link.download = `ai-${desk}-${Date.now()}.${ext}`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  });
  document.addEventListener('input', e => { if (ctx && e.target.matches?.('.ail-compose textarea')) draft = e.target.value; });
  document.addEventListener('keydown', e => {
    if (!ctx || !e.target.matches?.('.ail-compose textarea')) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); if (!chat?.busy) send(e.target.value); }
  });
  document.addEventListener('submit', e => { if (ctx && e.target.id === 'ail-compose') { e.preventDefault(); if (!chat?.busy) send(e.target.querySelector('textarea').value); } });

  window.WorkOSAiLab = { configure, render, reset };
})();
