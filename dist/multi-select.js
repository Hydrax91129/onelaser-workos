'use strict';
/* Multi-select filter dropdown for the supply chain pages (PIM / WMS / SCM), owner 2026-11-14:
 * one click on a name picks only that value and closes (as fast as a normal dropdown);
 * ticking the boxes picks several and keeps the list open; "All" clears.
 *
 *   WorkOSMulti.html({ scope, key, all, opts:[[value, text], …], sel:[…], lang })   → the control's HTML
 *   WorkOSMulti.on(scope, (key, values) => { …store values…; rerender(); })        → called on every change
 *   WorkOSMulti.pass(sel, value)                                                    → true when sel is empty or holds value
 *
 * The page keeps the selection (an array) and re-renders; the open list stays open across that re-render. */
window.WorkOSMulti = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const handlers = new Map();
  let open = null; // "scope:key" of the list that is open
  const tr = (lang, zh, en) => lang === 'en' ? en : zh;
  const asList = v => Array.isArray(v) ? v : v == null || v === '' ? [] : [v];

  function html({ scope, key, all, opts, sel, lang, label }) {
    const chosen = asList(sel).filter(v => opts.some(o => o[0] === v)), id = scope + ':' + key, isOpen = open === id;
    const textOf = v => (opts.find(o => o[0] === v) || [v, v])[1];
    const summary = !chosen.length ? all : chosen.length === 1 ? textOf(chosen[0]) : `${textOf(chosen[0])} +${chosen.length - 1}`;
    const tip = chosen.length > 1 ? chosen.map(textOf).join(lang === 'en' ? ', ' : '、') : (label || all);
    const rows = opts.map(([v, t]) => { const on = chosen.includes(v);
      return `<div class="mf-row${on ? ' on' : ''}" role="option" aria-selected="${on}"><input type="checkbox" data-mf-tog="${esc(v)}" ${on ? 'checked' : ''} aria-label="${esc(tr(lang, `加选 ${t}`, `Also include ${t}`))}"><button type="button" class="mf-one" data-mf-one="${esc(v)}" title="${esc(tr(lang, '只看这一项', 'Show only this'))}">${esc(t)}</button></div>`; }).join('');
    return `<div class="mf${chosen.length ? ' active' : ''}" data-mf-scope="${esc(scope)}" data-mf-key="${esc(key)}" data-mf-sel="${esc(JSON.stringify(chosen))}">`
      + `<button type="button" class="mf-btn" data-mf-btn aria-haspopup="listbox" aria-expanded="${isOpen}" aria-label="${esc(label || all)}" title="${esc(tip)}"><span class="mf-txt">${esc(summary)}</span>${chosen.length > 1 ? `<span class="mf-n">${chosen.length}</span>` : ''}<span class="mf-caret" aria-hidden="true">▾</span></button>`
      + `<div class="mf-pop" role="listbox" aria-multiselectable="true" ${isOpen ? '' : 'hidden'}>`
      + `<button type="button" class="mf-all${chosen.length ? '' : ' on'}" data-mf-all>${chosen.length ? '' : '✓ '}${esc(all)}</button>`
      + `<div class="mf-list">${rows || `<div class="mf-empty">${esc(tr(lang, '没有可选项', 'Nothing to choose'))}</div>`}</div>`
      + `<div class="mf-hint">${esc(tr(lang, '点名称只看这一项；勾选框可以多选', 'Click a name to show only it; tick boxes to pick several'))}</div></div></div>`;
  }

  const boxOf = el => el && el.closest ? el.closest('.mf') : null;
  const current = box => { try { return JSON.parse(box.getAttribute('data-mf-sel') || '[]'); } catch { return []; } };
  function closeAll(doc) { open = null; doc.querySelectorAll('.mf-pop').forEach(p => { p.hidden = true; p.setAttribute('hidden', ''); }); doc.querySelectorAll('.mf-btn').forEach(b => b.setAttribute('aria-expanded', 'false')); }
  function emit(box, values, keepOpen) {
    const scope = box.getAttribute('data-mf-scope'), key = box.getAttribute('data-mf-key');
    open = keepOpen ? scope + ':' + key : null;
    const fn = handlers.get(scope); if (fn) fn(key, values);
  }
  function onClick(e) {
    const t = e.target, box = boxOf(t), doc = t.ownerDocument || document;
    if (!box) { if (open) closeAll(doc); return; }
    if (t.closest('[data-mf-btn]')) {
      const id = box.getAttribute('data-mf-scope') + ':' + box.getAttribute('data-mf-key'), was = open === id;
      closeAll(doc);
      if (!was) { open = id; const pop = box.querySelector('.mf-pop'); pop.hidden = false; pop.removeAttribute('hidden'); box.querySelector('.mf-btn').setAttribute('aria-expanded', 'true'); }
      return;
    }
    const one = t.closest('[data-mf-one]');
    if (one) return emit(box, [one.getAttribute('data-mf-one')], false);
    if (t.closest('[data-mf-all]')) return emit(box, [], false);
    const tog = t.closest('[data-mf-tog]');
    if (tog) { const v = tog.getAttribute('data-mf-tog'), cur = current(box); return emit(box, cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v], true); }
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) closeAll(e.target.ownerDocument || document); });
  }
  return {
    html,
    on(scope, fn) { handlers.set(scope, fn); },
    pass: (sel, v) => { const s = asList(sel); return !s.length || s.includes(v); },
    list: asList,
    close() { open = null; },
  };
})();
