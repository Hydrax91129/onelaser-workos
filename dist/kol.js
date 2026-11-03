/*
 * KOL management (KOL 管理), phase 1.
 *
 * Every KOL in one list: the UpPromote affiliates (synced by the server every 30 minutes, or on "Sync now") plus KOLs
 * added by hand before they join UpPromote. UpPromote supplies contact details, social accounts, coupons, commission
 * totals and attributed orders; we keep the cooperation stage, tier, platform, followers, owner, products, fee, notes
 * and a log of samples, published content and payments. Access: admins and people granted KOL in ERP permissions.
 *
 * Data comes from /kol/* (server).
 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = n => `<i class="ph ph-${n}" aria-hidden="true"></i>`;
  let ctx = null, data = null, loading = false, error = '', detail = null, busy = false;
  const ui = { q:'', stage:'all', tier:'', owner:'', sort:'sales30' };
  const lang = () => ctx?.lang() === 'en' ? 'en' : 'zh';
  const tr = (zh, en) => lang() === 'en' ? en : zh;
  const w = pair => pair ? tr(pair[0], pair[1]) : '';
  const STAGE = { prospect:['待联系', 'Prospect', ''], contacted:['已联系', 'Contacted', ''], negotiating:['洽谈中', 'Negotiating', 'amber'], partner:['已加入联盟', 'Partner', 'blue'],
    sample_sent:['已寄样', 'Sample sent', 'amber'], content_live:['内容已发布', 'Content live', 'green'], long_term:['长期合作', 'Long-term', 'green'], paused:['暂停合作', 'Paused', 'done'] };
  const PLATFORM = { '':['—', '—'], youtube:['YouTube', 'YouTube'], instagram:['Instagram', 'Instagram'], tiktok:['TikTok', 'TikTok'], facebook:['Facebook', 'Facebook'], blog:['博客 / 网站', 'Blog / site'], other:['其他', 'Other'] };
  const COLLAB = { sample:['寄样', 'Sample sent', 'package'], content:['内容发布', 'Content published', 'video-camera'], payment:['付款', 'Payment', 'currency-dollar'], contact:['沟通记录', 'Contact', 'chat-circle-text'], note:['备注', 'Note', 'note'] };
  const UPSTATUS = { active:['联盟正常', 'Active', 'green'], inactive:['联盟停用', 'Inactive', 'done'], pending:['待审核', 'Pending', 'amber'], denied:['已拒绝', 'Denied', 'red'], removed:['已从 UpPromote 删除', 'Removed from UpPromote', 'red'] };
  const REF = { pending:['待审核', 'Pending', 'amber'], approved:['已批准', 'Approved', 'blue'], paid:['已付佣金', 'Paid', 'green'], denied:['已拒绝', 'Denied', 'red'] };
  const SOCIAL = { youtube:['youtube-logo', 'https://www.youtube.com/'], instagram:['instagram-logo', 'https://www.instagram.com/'], tiktok:['tiktok-logo', 'https://www.tiktok.com/@'], facebook:['facebook-logo', 'https://www.facebook.com/'], twitter:['x-logo', 'https://x.com/'], website:['globe', 'https://'] };
  const TIERS = ['', 'S', 'A', 'B', 'C'];
  const badge = (map, k) => map[k] ? `<span class="rma-badge ${map[k][2] || ''}">${esc(w(map[k]))}</span>` : '';
  const money = v => '$' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits:0 });
  const money2 = v => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const count = v => v == null ? '—' : Number(v) >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : Number(v) >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(v);
  const day = v => v ? String(v).slice(0, 10) : '—';
  const ago = v => { if (!v) return tr('从未', 'never'); const m = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000));
    return m < 1 ? tr('刚刚', 'just now') : m < 60 ? tr(`${m} 分钟前`, `${m} min ago`) : m < 1440 ? tr(`${Math.round(m / 60)} 小时前`, `${Math.round(m / 60)} h ago`) : tr(`${Math.round(m / 1440)} 天前`, `${Math.round(m / 1440)} d ago`); };
  /** UpPromote stores a handle or a full link; turn either into a safe https link. */
  const socialUrl = (kind, v) => { const s = String(v || '').trim(); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return 'https://' + s; return SOCIAL[kind][1] + encodeURIComponent(s.replace(/^@/, '')); };
  const socialLinks = s => Object.keys(SOCIAL).filter(k => s?.[k]).map(k => { const u = socialUrl(k, s[k]); return /^https?:\/\//i.test(u) ? `<a class="kol-social" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(s[k])}">${icon(SOCIAL[k][0])}</a>` : ''; }).join('');

  function configure(next) { ctx = next; }
  function reset() { data = null; detail = null; loading = false; error = ''; Object.assign(ui, { q:'', stage:'all', tier:'', owner:'', sort:'sales30' }); }
  async function load() {
    if (loading) return; loading = true;
    try { data = await ctx.api.get('/kol/kols'); error = ''; }
    catch (e) { error = e.message || tr('KOL 数据读取失败', 'Could not load KOLs'); }
    finally { loading = false; ctx.rerender(); }
  }

  function filtered() {
    const q = ui.q.trim().toLowerCase();
    const rows = data.items.filter(k => (ui.stage === 'all' || k.stage === ui.stage) && (!ui.tier || k.tier === ui.tier) && (!ui.owner || (ui.owner === '-' ? !k.ownerId : k.ownerId === ui.owner))
      && (!q || [k.name, k.email, k.company, k.niche, k.program, ...(k.coupons || []), ...Object.values(k.socials || {})].some(x => String(x || '').toLowerCase().includes(q))));
    const by = { sales30:k => k.sales30, sales:k => k.sales, orders:k => k.orders, followers:k => k.followers || 0, joined:k => k.joinedAt || '', last:k => k.lastOrderAt || '' }[ui.sort];
    return by ? rows.sort((a, b) => by(b) > by(a) ? 1 : by(b) < by(a) ? -1 : a.name.localeCompare(b.name)) : rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  function syncBar() {
    const s = data.lastSync, can = data.canManage;
    if (data.uppromote !== 'configured') return `<div class="wms-alert">${icon('plug')} ${tr('还没有连接 UpPromote：请管理员在服务器环境变量里设置 UPPROMOTE_API_KEY（UpPromote 后台 Settings → Integrations → API Key）。手动添加的 KOL 可以正常使用。', 'UpPromote is not connected: ask the administrator to set UPPROMOTE_API_KEY on the server (UpPromote → Settings → Integrations → API key). KOLs added by hand work as usual.')}</div>`;
    const status = !s ? tr('还没有同步过 UpPromote 数据', 'UpPromote has not been synced yet')
      : s.ok === false ? `<span class="late">${tr('上次同步失败', 'Last sync failed')}（${esc(s.error)}）</span> · ${esc(ago(s.finishedAt))}`
      : tr(`UpPromote 已同步 · ${ago(s.finishedAt)} · ${s.counts?.affiliates ?? 0} 位 KOL，${s.counts?.referrals ?? 0} 笔推荐订单 · 每 30 分钟自动更新`, `UpPromote synced ${ago(s.finishedAt)} · ${s.counts?.affiliates ?? 0} KOLs, ${s.counts?.referrals ?? 0} referral orders · updates every 30 minutes`);
    return `<div class="kol-sync">${icon('arrows-clockwise')}<span>${status}</span>${can ? `<button class="btn" data-kol="sync" ${busy ? 'disabled' : ''}>${busy ? tr('同步中…', 'Syncing…') : tr('立即同步', 'Sync now')}</button>` : ''}</div>`;
  }

  function chart() {
    const m = data.months.slice(-12); if (!m.length) return '';
    const max = Math.max(...m.map(x => x.sales), 1);
    return `<section class="kol-chart"><h3>${icon('chart-bar')} ${tr('KOL 带来的销售额（按月）', 'Sales from KOLs by month')}</h3><div class="kol-bars">${m.map(x => `<div class="kol-bar" title="${esc(x.month)} · ${esc(money(x.sales))} · ${x.orders} ${tr('单', 'orders')}"><b style="height:${Math.max(2, Math.round(x.sales / max * 100))}%"></b><span>${esc(x.month.slice(2).replace('-', '/'))}</span></div>`).join('')}</div></section>`;
  }

  function render() {
    if (!data && !error) { load(); return `<div class="rma kol"><p class="wms-hint">${tr('正在读取 KOL…', 'Loading KOLs…')}</p></div>`; }
    if (error && !data) return `<div class="rma kol"><div class="wms-alert">${esc(error)}</div></div>`;
    const t = data.totals, rows = filtered(), active = data.items.filter(k => k.upStatus === 'active').length;
    const stages = [['all', tr('全部', 'All'), data.items.length], ...Object.keys(STAGE).map(s => [s, w(STAGE[s]), data.items.filter(k => k.stage === s).length]).filter(([s, , n]) => n || ui.stage === s)];
    return `<div class="rma kol">
      <div class="page-heading"><div><div class="eyebrow">WORK OS · KOL</div><h1>${tr('KOL 管理', 'KOL management')}</h1><p>${tr('所有合作 KOL 的资料、合作进度和带货业绩。联系方式、优惠码、佣金和订单从 UpPromote 自动同步；合作阶段、等级、负责人、寄样和发布记录在这里维护。', 'Every KOL’s details, cooperation progress and sales. Contact details, coupons, commission and orders sync from UpPromote; stage, tier, owner, samples and published content are kept here.')}</p></div>
        <div class="kol-head-actions"><button class="btn" data-kol="export">${icon('download-simple')} ${tr('导出 CSV', 'Export CSV')}</button>${data.canManage ? `<button class="btn primary" data-kol="new">${icon('plus')} ${tr('新增 KOL', 'Add KOL')}</button>` : ''}</div></div>
      ${syncBar()}
      <div class="rma-kpis">
        <div class="rma-kpi"><span>${tr('KOL 总数', 'KOLs')}</span><b>${data.items.length}</b><em>${tr(`联盟正常 ${active} 位`, `${active} active in UpPromote`)}</em></div>
        <div class="rma-kpi"><span>${tr('近 30 天销售额', 'Sales, last 30 days')}</span><b>${esc(money(t.sales30))}</b><em>${tr(`${t.orders30} 笔订单`, `${t.orders30} orders`)}</em></div>
        <div class="rma-kpi"><span>${tr('累计销售额', 'Total sales')}</span><b>${esc(money(t.sales))}</b><em>${tr(`${t.orders} 笔订单 · 不含已拒绝`, `${t.orders} orders · excluding denied`)}</em></div>
        <div class="rma-kpi"><span>${tr('待付佣金', 'Commission owed')}</span><b>${esc(money(t.unpaidCommission))}</b><em>${tr(`累计佣金 ${money(t.commission)}`, `${money(t.commission)} total`)}</em></div>
      </div>
      ${chart()}
      <div class="rma-bar"><div class="rma-views" role="tablist">${stages.map(([id, label, n]) => `<button class="${ui.stage === id ? 'on' : ''}" data-kol="stage" data-v="${id}">${esc(label)} <b>${n}</b></button>`).join('')}</div></div>
      <div class="kol-filters">
        <label class="wms-search">${icon('magnifying-glass')}<input data-kol-search value="${esc(ui.q)}" placeholder="${tr('搜索姓名、邮箱、频道、优惠码、领域', 'Search name, email, channel, coupon, niche')}"></label>
        <select data-kol-filter="tier" aria-label="${tr('等级', 'Tier')}"><option value="">${tr('全部等级', 'All tiers')}</option>${TIERS.slice(1).map(x => `<option ${ui.tier === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <select data-kol-filter="owner" aria-label="${tr('负责人', 'Owner')}"><option value="">${tr('全部负责人', 'All owners')}</option><option value="-" ${ui.owner === '-' ? 'selected' : ''}>${tr('未分配', 'Unassigned')}</option>${data.owners.filter(p => data.items.some(k => k.ownerId === p.id)).map(p => `<option value="${esc(p.id)}" ${ui.owner === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <select data-kol-filter="sort" aria-label="${tr('排序', 'Sort')}">${[['sales30', tr('按近 30 天销售额', 'Sales, 30 days')], ['sales', tr('按累计销售额', 'Total sales')], ['orders', tr('按订单数', 'Orders')], ['followers', tr('按粉丝数', 'Followers')], ['last', tr('按最近出单', 'Latest order')], ['joined', tr('按加入时间', 'Newest')], ['name', tr('按姓名', 'Name')]].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      </div>
      <div class="wms-table-wrap"><table class="wms-table rma-table kol-table"><thead><tr><th>KOL</th><th>${tr('渠道', 'Channels')}</th><th>${tr('等级', 'Tier')}</th><th>${tr('阶段', 'Stage')}</th><th>${tr('负责人', 'Owner')}</th><th class="num">${tr('粉丝', 'Followers')}</th><th class="num">${tr('订单', 'Orders')}</th><th class="num">${tr('近 30 天', '30 days')}</th><th class="num">${tr('累计销售', 'Sales')}</th><th class="num">${tr('待付佣金', 'Owed')}</th><th>${tr('最近出单', 'Latest order')}</th></tr></thead><tbody>
        ${rows.map(k => `<tr class="rma-row" data-kol="open" data-id="${esc(k.id)}" tabindex="0">
          <td><b>${esc(k.name)}</b>${k.upId == null ? `<span class="kol-tag">${tr('手动添加', 'Manual')}</span>` : k.upStatus && k.upStatus !== 'active' ? ` ${badge(UPSTATUS, k.upStatus)}` : ''}<small>${esc([k.company, k.niche, (k.coupons || []).join(' / ')].filter(Boolean).join(' · ') || k.email)}</small></td>
          <td class="kol-socials">${socialLinks(k.socials) || '—'}</td><td>${k.tier ? `<span class="kol-tier t-${esc(k.tier)}">${esc(k.tier)}</span>` : '—'}</td><td>${badge(STAGE, k.stage)}</td><td>${esc(k.ownerName || '—')}</td>
          <td class="num">${esc(count(k.followers))}</td><td class="num">${k.orders || '—'}</td><td class="num">${k.sales30 ? esc(money(k.sales30)) : '—'}</td><td class="num">${k.sales ? esc(money(k.sales)) : '—'}</td>
          <td class="num">${k.approved + k.pending ? esc(money(k.approved + k.pending)) : '—'}</td><td>${esc(day(k.lastOrderAt))}</td></tr>`).join('') || `<tr><td colspan="11" class="wms-empty">${data.items.length ? tr('没有符合条件的 KOL。', 'No matching KOLs.') : tr('还没有 KOL。点“立即同步”从 UpPromote 导入，或点“新增 KOL”手动添加。', 'No KOLs yet. Sync from UpPromote or add one by hand.')}</td></tr>`}
      </tbody></table></div></div>`;
  }

  /* ---------- KOL detail ---------- */
  async function openKol(id) {
    try { detail = await ctx.api.get('/kol/kols/' + encodeURIComponent(id)); }
    catch (e) { ctx.toast?.(e.message || tr('读取失败', 'Could not load')); return; }
    drawDetail(true);
  }
  const fact = (label, value, full) => `<div${full ? ' class="full"' : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
  const link = u => u && /^https?:\/\//i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>` : esc(u || '—');
  const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(w(v))}</option>`).join('');
  const input = (name, label, v, attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(v ?? '')}" ${attrs}></label>`;

  function contactSection(k) {
    const manual = k.upId == null;
    if (manual && detail.canManage) return `<p class="wms-hint">${icon('info')} ${tr('这位 KOL 是手动添加的。加入 UpPromote 后，只要邮箱一致，下次同步会自动关联并带入订单数据。', 'Added by hand. Once they join UpPromote with the same email, the next sync links them and brings in their orders.')}</p>
      <div class="form-grid">${input('name', tr('姓名', 'Name'), k.name, 'maxlength="120" required form="kol-edit"')}${input('email', tr('邮箱', 'Email'), k.email, 'type="email" maxlength="200" form="kol-edit"')}
      ${input('phone', tr('电话', 'Phone'), k.phone, 'maxlength="60" form="kol-edit"')}${input('company', tr('公司 / 频道名', 'Company / channel'), k.company, 'maxlength="120" form="kol-edit"')}
      ${input('country', tr('国家', 'Country'), k.country, 'maxlength="60" form="kol-edit"')}${input('city', tr('城市', 'City'), k.city, 'maxlength="80" form="kol-edit"')}
      ${Object.keys(SOCIAL).map(s => input('social_' + s, s === 'website' ? tr('网站', 'Website') : s[0].toUpperCase() + s.slice(1), k.socials?.[s], 'maxlength="300" form="kol-edit" placeholder="' + tr('账号或链接', 'Handle or link') + '"')).join('')}</div>`;
    return `<dl class="rma-facts">
      ${fact(tr('邮箱', 'Email'), k.email ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : '—')}${fact(tr('电话', 'Phone'), esc(k.phone || '—'))}${fact(tr('公司 / 频道', 'Company'), esc(k.company || '—'))}
      ${fact(tr('地址', 'Address'), esc([k.address, k.city, k.region, k.country].filter(Boolean).join(', ') || '—'), true)}
      ${fact(tr('社媒', 'Social'), Object.keys(SOCIAL).filter(s => k.socials?.[s]).map(s => `<span class="kol-social-line">${icon(SOCIAL[s][0])} ${link(socialUrl(s, k.socials[s]))}</span>`).join('') || '—', true)}
      ${manual ? '' : `${fact(tr('联盟计划', 'Program'), esc(k.program || '—'))}${fact(tr('优惠码', 'Coupons'), esc((k.coupons || []).join(', ') || '—'))}${fact(tr('加入时间', 'Joined'), esc(day(k.joinedAt)))}
      ${fact(tr('推广链接', 'Affiliate link'), link(k.customLink || k.link), true)}`}
    </dl>${manual ? '' : `<p class="wms-hint">${tr(`以上信息来自 UpPromote（${ago(k.syncedAt)}同步），修改请在 UpPromote 后台进行。`, `From UpPromote (synced ${ago(k.syncedAt)}); change these in UpPromote.`)}</p>`}`;
  }

  function editSection(k) {
    if (!detail.canManage) return `<dl class="rma-facts">${fact(tr('阶段', 'Stage'), badge(STAGE, k.stage))}${fact(tr('等级', 'Tier'), esc(k.tier || '—'))}${fact(tr('主平台', 'Main platform'), esc(w(PLATFORM[k.platform])))}
      ${fact(tr('粉丝数', 'Followers'), esc(k.followers == null ? '—' : Number(k.followers).toLocaleString()))}${fact(tr('领域', 'Niche'), esc(k.niche || '—'))}${fact(tr('负责人', 'Owner'), esc(k.ownerName || '—'))}
      ${fact(tr('合作产品', 'Products'), esc(k.products || '—'), true)}${fact(tr('费用 / 报价', 'Fee'), esc(k.fee || '—'), true)}${fact(tr('备注', 'Notes'), esc(k.notes || '—'), true)}</dl>`;
    return `<form id="kol-edit" class="form-grid">
      <label class="field"><span>${tr('合作阶段', 'Stage')}</span><select name="stage">${opt(STAGE, k.stage)}</select></label>
      <label class="field"><span>${tr('等级', 'Tier')}</span><select name="tier">${TIERS.map(x => `<option value="${x}" ${x === k.tier ? 'selected' : ''}>${x || tr('未定', 'Not set')}</option>`).join('')}</select></label>
      <label class="field"><span>${tr('主平台', 'Main platform')}</span><select name="platform">${opt(PLATFORM, k.platform)}</select></label>
      ${input('followers', tr('粉丝数', 'Followers'), k.followers, 'type="number" min="0" step="1"')}
      ${input('niche', tr('领域 / 内容方向', 'Niche'), k.niche, `maxlength="120" placeholder="${tr('例如：木工、DIY、雕刻', 'e.g. woodworking, DIY, engraving')}"`)}
      <label class="field"><span>${tr('负责人', 'Owner')}</span><select name="ownerId"><option value="">${tr('未分配', 'Unassigned')}</option>${data?.owners?.map(p => `<option value="${esc(p.id)}" ${p.id === k.ownerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('') || ''}</select></label>
      <label class="field full"><span>${tr('合作产品', 'Products')}</span><input name="products" maxlength="500" value="${esc(k.products)}" placeholder="${tr('例如：LF-60、LX-2', 'e.g. LF-60, LX-2')}"></label>
      <label class="field full"><span>${tr('费用 / 报价', 'Fee')}</span><input name="fee" maxlength="500" value="${esc(k.fee)}" placeholder="${tr('例如：$500/条视频 + 6% 佣金', 'e.g. $500 per video + 6% commission')}"></label>
      <label class="field full"><span>${tr('备注', 'Notes')}</span><textarea name="notes" rows="3" maxlength="4000">${esc(k.notes)}</textarea></label>
      <div class="full rma-actions"><button class="btn primary" type="submit">${tr('保存', 'Save')}</button>${k.updatedByName ? `<span class="wms-hint">${tr(`${k.updatedByName} 最后修改于 ${day(k.updatedAt)}`, `Last changed by ${k.updatedByName} on ${day(k.updatedAt)}`)}</span>` : ''}
        ${k.upId == null ? `<button class="btn kol-danger" type="button" data-kol="delete">${icon('trash')} ${tr('删除', 'Delete')}</button>` : ''}</div>
      <p class="wms-error" role="alert"></p></form>`;
  }

  function collabSection() {
    const items = detail.collabs.map(c => `<li>${icon(COLLAB[c.kind]?.[2] || 'note')}<div><b>${esc(c.happenedOn)} · ${esc(w(COLLAB[c.kind]))}</b>${c.product ? ` · ${esc(c.product)}` : ''}${c.cost != null ? ` · ${esc(money2(c.cost))}` : ''}
      ${c.url ? `<div>${link(c.url)}</div>` : ''}${c.note ? `<div>${esc(c.note)}</div>` : ''}<time>${esc(c.byName)}</time></div>
      ${detail.canManage ? `<button class="btn" type="button" data-kol="collab-delete" data-id="${esc(c.id)}" aria-label="${tr('删除', 'Delete')}">${icon('trash')}</button>` : ''}</li>`).join('');
    const today = new Date().toISOString().slice(0, 10);
    return `<ul class="kol-log">${items || `<li class="wms-hint">${tr('还没有合作记录。', 'Nothing logged yet.')}</li>`}</ul>
      ${detail.canManage ? `<form id="kol-collab" class="form-grid">
        <label class="field"><span>${tr('类型', 'Type')}</span><select name="kind">${opt(COLLAB, 'sample')}</select></label>
        <label class="field"><span>${tr('日期', 'Date')}</span><input type="date" name="happenedOn" value="${today}" required></label>
        ${input('product', tr('产品', 'Product'), '', 'maxlength="200"')}${input('cost', tr('金额（美元，可选）', 'Amount (USD, optional)'), '', 'type="number" min="0" step="0.01"')}
        <label class="field full"><span>${tr('链接（视频 / 帖子 / 物流单）', 'Link (video, post, tracking)')}</span><input name="url" maxlength="500" placeholder="https://"></label>
        <label class="field full"><span>${tr('说明', 'Note')}</span><input name="note" maxlength="2000"></label>
        <div class="full rma-actions"><button class="btn" type="submit">${icon('plus')} ${tr('添加记录', 'Add entry')}</button><span class="wms-hint">${tr('记录寄样或内容发布时，合作阶段会自动往前推进。', 'Logging a sample or published content moves the stage forward.')}</span></div><p class="wms-error" role="alert"></p></form>` : ''}`;
  }

  function referralSection(k) {
    if (k.upId == null) return `<p class="wms-hint">${tr('关联 UpPromote 后才会有订单数据。', 'Orders appear once linked to UpPromote.')}</p>`;
    if (!detail.referrals.length) return `<p class="wms-hint">${tr('还没有推荐订单。', 'No referral orders yet.')}</p>`;
    return `<div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>${tr('日期', 'Date')}</th><th>${tr('订单号', 'Order')}</th><th class="num">${tr('销售额', 'Sales')}</th><th class="num">${tr('佣金', 'Commission')}</th><th>${tr('状态', 'Status')}</th><th>${tr('归因方式', 'Tracked by')}</th></tr></thead><tbody>
      ${detail.referrals.map(r => `<tr><td>${esc(day(r.createdAt))}</td><td class="mono">#${esc(r.orderNumber)}</td><td class="num">${esc(money2(r.sales))}</td><td class="num">${esc(money2(r.commission))}</td><td>${badge(REF, r.status)}</td><td>${esc(r.tracking)}</td></tr>`).join('')}</tbody></table></div>
      ${detail.referrals.length >= 200 ? `<p class="wms-hint">${tr('只显示最近 200 笔。', 'Showing the latest 200.')}</p>` : ''}`;
  }

  function drawDetail(first) {
    const k = detail.kol;
    const body = `<div class="rma-detail kol-detail" data-kol-id="${esc(k.id)}">
      <div class="rma-head">${badge(STAGE, k.stage)}${k.upId == null ? `<span class="kol-tag">${tr('手动添加', 'Manual')}</span>` : badge(UPSTATUS, k.upStatus)}<b>${esc(k.name)}</b>${k.tier ? `<span class="kol-tier t-${esc(k.tier)}">${esc(k.tier)}</span>` : ''}<span class="kol-socials">${socialLinks(k.socials)}</span></div>
      <div class="rma-kpis kol-mini">
        <div class="rma-kpi"><span>${tr('近 30 天', 'Last 30 days')}</span><b>${esc(money(k.sales30))}</b><em>${tr(`${k.orders30} 笔`, `${k.orders30} orders`)}</em></div>
        <div class="rma-kpi"><span>${tr('累计销售', 'Total sales')}</span><b>${esc(money(k.sales))}</b><em>${tr(`${k.orders} 笔 · 近 90 天 ${money(k.sales90)}`, `${k.orders} orders · 90 days ${money(k.sales90)}`)}</em></div>
        <div class="rma-kpi"><span>${tr('已付佣金', 'Commission paid')}</span><b>${esc(money(k.paid))}</b><em>${tr(`待付 ${money(k.approved + k.pending)}`, `${money(k.approved + k.pending)} owed`)}</em></div>
      </div>
      <section class="rma-sec"><h3>${icon('address-book')} ${tr('联系方式', 'Contact')}</h3>${contactSection(k)}</section>
      <section class="rma-sec"><h3>${icon('handshake')} ${tr('合作信息', 'Cooperation')}</h3>${editSection(k)}</section>
      <section class="rma-sec"><h3>${icon('clock-counter-clockwise')} ${tr('合作记录', 'Cooperation log')}</h3>${collabSection()}</section>
      <section class="rma-sec"><h3>${icon('shopping-cart')} ${tr('推荐订单（来自 UpPromote）', 'Referral orders (UpPromote)')}</h3>${referralSection(k)}</section>
    </div>`;
    if (first || !document.querySelector('[data-kol-id]')) { ctx.modal(`${esc(k.name)} · KOL`, body, `<button class="btn" data-live-action="close">${tr('关闭', 'Close')}</button>`); document.querySelector('#overlay-root .modal')?.classList.add('modal-wide'); }
    else document.querySelector('[data-kol-id]').outerHTML = body;
  }
  async function refresh(kol) { detail = kol || await ctx.api.get('/kol/kols/' + encodeURIComponent(detail.kol.id)); drawDetail(false); data = null; load(); }

  function newKol() {
    ctx.modal(tr('新增 KOL', 'Add KOL'), `<form id="kol-new" class="form-grid">
      <p class="full wms-hint">${tr('用于还没加入 UpPromote 的 KOL（比如正在洽谈）。已在 UpPromote 的 KOL 会自动同步，不用手动添加。', 'For KOLs not yet in UpPromote (e.g. still negotiating). KOLs already in UpPromote sync automatically.')}</p>
      ${input('name', tr('姓名 *', 'Name *'), '', 'maxlength="120" required')}${input('email', tr('邮箱', 'Email'), '', 'type="email" maxlength="200"')}
      <label class="field"><span>${tr('主平台', 'Main platform')}</span><select name="platform">${opt(PLATFORM, '')}</select></label>
      ${input('channel', tr('频道 / 账号链接', 'Channel link or handle'), '', 'maxlength="300"')}
      ${input('followers', tr('粉丝数', 'Followers'), '', 'type="number" min="0" step="1"')}${input('niche', tr('领域', 'Niche'), '', 'maxlength="120"')}
      <label class="field"><span>${tr('合作阶段', 'Stage')}</span><select name="stage">${opt(STAGE, 'prospect')}</select></label>
      <label class="field"><span>${tr('负责人', 'Owner')}</span><select name="ownerId"><option value="">${tr('未分配', 'Unassigned')}</option>${data.owners.map(p => `<option value="${esc(p.id)}" ${p.id === ctx.state().actor?.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field full"><span>${tr('备注', 'Notes')}</span><textarea name="notes" rows="2" maxlength="4000"></textarea></label>
      <div class="full rma-actions"><button class="btn primary" type="submit">${tr('添加', 'Add')}</button></div><p class="wms-error" role="alert"></p></form>`, `<button class="btn" data-live-action="close">${tr('取消', 'Cancel')}</button>`);
  }

  function exportCsv() {
    const cols = [['name', tr('姓名', 'Name')], ['email', tr('邮箱', 'Email')], ['company', tr('公司', 'Company')], ['country', tr('国家', 'Country')], ['stage', tr('阶段', 'Stage')], ['tier', tr('等级', 'Tier')],
      ['platform', tr('主平台', 'Platform')], ['followers', tr('粉丝', 'Followers')], ['niche', tr('领域', 'Niche')], ['ownerName', tr('负责人', 'Owner')], ['program', tr('联盟计划', 'Program')], ['coupons', tr('优惠码', 'Coupons')],
      ['orders', tr('订单', 'Orders')], ['sales30', tr('近30天销售', 'Sales 30d')], ['sales', tr('累计销售', 'Sales')], ['paid', tr('已付佣金', 'Paid')], ['owed', tr('待付佣金', 'Owed')], ['lastOrderAt', tr('最近出单', 'Latest order')],
      ...Object.keys(SOCIAL).map(s => ['social:' + s, s])];
    const val = (k, c) => c === 'stage' ? w(STAGE[k.stage]) : c === 'platform' ? (k.platform ? w(PLATFORM[k.platform]) : '') : c === 'coupons' ? (k.coupons || []).join(' ') : c === 'owed' ? k.approved + k.pending
      : c === 'lastOrderAt' ? (k.lastOrderAt || '').slice(0, 10) : c.startsWith('social:') ? k.socials?.[c.slice(7)] || '' : k[c] ?? '';
    // Leading =, +, - or @ would run as a formula in Excel; prefix them.
    const cell = v => { let s = String(v); if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + [cols.map(c => cell(c[1])), ...filtered().map(k => cols.map(([c]) => cell(val(k, c))))].map(r => r.join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = `kol-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function sync() {
    if (busy) return; busy = true; ctx.rerender();
    try { const r = await ctx.api.post('/kol/sync', {}); ctx.toast?.(tr(`同步完成：${r.counts.affiliates} 位 KOL，${r.counts.referrals} 笔订单，新增 ${r.counts.added} 位`, `Synced: ${r.counts.affiliates} KOLs, ${r.counts.referrals} orders, ${r.counts.added} new`)); data = null; }
    catch (e) { ctx.toast?.(e.message || tr('同步失败', 'Sync failed')); data = null; }
    finally { busy = false; load(); }
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest?.('[data-kol]'); if (!el || !ctx) return;
    const a = el.dataset.kol;
    if (a === 'stage') { ui.stage = el.dataset.v; ctx.rerender(); return; }
    if (a === 'open') { if (e.target.closest('a')) return; openKol(el.dataset.id); return; }
    if (a === 'sync') { sync(); return; }
    if (a === 'new') { newKol(); return; }
    if (a === 'export') { exportCsv(); return; }
    if (busy) return;
    if (a === 'delete') {
      if (!window.confirm(tr('删除这位 KOL 和所有合作记录？删除后无法恢复。', 'Delete this KOL and every logged entry? This cannot be undone.'))) return;
      busy = true;
      try { await ctx.api.delete('/kol/kols/' + encodeURIComponent(detail.kol.id)); ctx.closeOverlay?.(); detail = null; data = null; ctx.toast?.(tr('已删除', 'Deleted')); load(); }
      catch (x) { ctx.toast?.(x.message || tr('删除失败', 'Could not delete')); }
      finally { busy = false; }
    }
    if (a === 'collab-delete') {
      if (!window.confirm(tr('删除这条记录？', 'Delete this entry?'))) return;
      busy = true;
      try { const r = await ctx.api.delete(`/kol/kols/${encodeURIComponent(detail.kol.id)}/collabs/${encodeURIComponent(el.dataset.id)}`); busy = false; await refresh(r); }
      catch (x) { ctx.toast?.(x.message || tr('删除失败', 'Could not delete')); }
      finally { busy = false; }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-kol="open"]')) openKol(e.target.dataset.id); });
  document.addEventListener('input', e => {
    if (!e.target.matches?.('[data-kol-search]')) return;
    ui.q = e.target.value; const pos = e.target.selectionStart; ctx.rerender();
    const i = document.querySelector('[data-kol-search]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  });
  document.addEventListener('change', e => { const f = e.target.dataset?.kolFilter; if (!f || !ctx) return; ui[f] = e.target.value; ctx.rerender(); });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!ctx || !['kol-edit', 'kol-collab', 'kol-new'].includes(f.id)) return;
    e.preventDefault(); if (busy) return; busy = true;
    const err = f.querySelector('.wms-error'); if (err) err.textContent = '';
    const v = Object.fromEntries(new FormData(f)), s = x => String(x ?? '').trim(), n = x => s(x) === '' ? null : Number(x);
    try {
      if (f.id === 'kol-new') {
        const body = { name:s(v.name), email:s(v.email), platform:v.platform, followers:n(v.followers), niche:s(v.niche), stage:v.stage, ownerId:v.ownerId || null, notes:s(v.notes) };
        if (s(v.channel)) body.socials = { [['youtube', 'instagram', 'tiktok', 'facebook'].includes(v.platform) ? v.platform : 'website']:s(v.channel) };
        const r = await ctx.api.post('/kol/kols', body);
        ctx.closeOverlay?.(); ctx.toast?.(tr('已添加', 'Added')); detail = r; data = null; load(); drawDetail(true);
      }
      if (f.id === 'kol-edit') {
        const k = detail.kol, body = { expectedVersion:k.version };
        for (const key of ['stage', 'tier', 'platform', 'niche', 'products', 'fee', 'notes']) if (s(v[key]) !== s(k[key])) body[key] = s(v[key]);
        if (n(v.followers) !== (k.followers ?? null)) body.followers = n(v.followers);
        if ((v.ownerId || null) !== (k.ownerId || null)) body.ownerId = v.ownerId || null;
        if (k.upId == null) {
          for (const key of ['name', 'email', 'phone', 'company', 'country', 'city']) if (v[key] !== undefined && s(v[key]) !== s(k[key])) body[key] = s(v[key]);
          const socials = Object.fromEntries(Object.keys(SOCIAL).map(x => [x, s(v['social_' + x])]).filter(([, y]) => y));
          if (JSON.stringify(socials) !== JSON.stringify(Object.fromEntries(Object.keys(SOCIAL).filter(x => k.socials?.[x]).map(x => [x, k.socials[x]])))) body.socials = socials;
        }
        if (Object.keys(body).length === 1) { ctx.toast?.(tr('没有修改', 'No changes')); return; }
        const r = await ctx.api.request('/kol/kols/' + encodeURIComponent(k.id), { method:'PUT', body });
        ctx.toast?.(tr('已保存', 'Saved')); busy = false; await refresh(r);
      }
      if (f.id === 'kol-collab') {
        const r = await ctx.api.post(`/kol/kols/${encodeURIComponent(detail.kol.id)}/collabs`, { kind:v.kind, happenedOn:v.happenedOn, product:s(v.product), cost:n(v.cost), url:s(v.url), note:s(v.note) });
        ctx.toast?.(tr('已添加', 'Added')); busy = false; await refresh(r);
      }
    } catch (x) { if (err) err.textContent = x.status === 409 ? tr('这位 KOL 刚被别人改过，请关闭后重新打开再改。', 'Someone else just changed this KOL; close and reopen it.') : x.message || tr('保存失败', 'Could not save'); }
    finally { busy = false; }
  });

  window.WorkOSKol = { configure, reset, render };
})();
