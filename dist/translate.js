'use strict';
/* Automatic Chinese <-> English display of user-written text (OKRs first).
 * Text is shown in the interface language; a small 译/Tr badge marks a
 * translation and clicking it shows the original. Translations come from the
 * server (/translate), which asks the AI once per distinct text and caches it.
 * When translation is unavailable the original text is shown unchanged. */
(() => {
  let ctx = null;
  const cache = new Map();          // `${lang}|${text}` -> string | null (null = keep original)
  const queue = new Map();          // lang -> Set(text)
  const showOriginal = new Set();   // keys the reader flipped back to the original
  let timer = null, inflight = 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const lang = () => (ctx?.lang?.() || window.WorkI18n?.lang) === 'en' ? 'en' : 'zh';
  const cjk = s => (s.match(/[㐀-鿿豈-﫿]/g) || []).length, latin = s => (s.match(/[A-Za-z]/g) || []).length;
  // Text already written in both languages (e.g. "销售经理 Sales Manager") is shown as is.
  const mainLang = s => { const c = cjk(s), l = latin(s); if (!c && l < 2) return null; if (c >= 2 && /[A-Za-z]{3,}/.test(s) && /[\u3400-\u9fff]{2,}/.test(s) && l >= 4) return null; return c * 3 >= l ? 'zh' : 'en'; };
  const enabled = () => ctx?.capabilities?.()?.autoTranslate === true;
  function want(text, target) {
    const key = target + '|' + text;
    if (cache.has(key)) return cache.get(key);
    if (!queue.has(target)) queue.set(target, new Set());
    queue.get(target).add(text);
    if (!timer) timer = setTimeout(flush, 60);
    return undefined;
  }
  async function flush() {
    timer = null;
    for (const [target, set] of queue) {
      const texts = [...set]; queue.delete(target);
      for (let i = 0; i < texts.length; i += 60) {
        const batch = texts.slice(i, i + 60);
        batch.forEach(t => cache.set(target + '|' + t, null)); // never request the same text twice
        inflight++;
        try {
          const r = await ctx.api.post('/translate', { target, texts:batch });
          (r.items || []).forEach((it, j) => { if (it.translated) cache.set(target + '|' + batch[j], it.translated); });
        } catch { /* keep originals */ }
        finally { inflight--; }
      }
    }
    if (!inflight) ctx?.rerender?.();
  }
  /** Translated plain text (for <option>, titles and attributes). */
  function text(s) {
    const src = String(s ?? '').trim(); if (!src || !ctx || !enabled()) return String(s ?? '');
    const target = lang(); if (mainLang(src) !== target && mainLang(src)) { const t = want(src, target); if (t && !showOriginal.has(target + '|' + src)) return t; }
    return String(s ?? '');
  }
  /** Escaped HTML with a 译 badge when a translation is shown; click flips to the original. */
  function html(s) {
    const src = String(s ?? '').trim(); if (!src || !ctx || !enabled()) return esc(s);
    const target = lang(), from = mainLang(src); if (!from || from === target) return esc(s);
    const t = want(src, target); if (!t) return esc(s);
    const key = target + '|' + src, orig = showOriginal.has(key);
    const label = target === 'zh' ? (orig ? '显示译文' : '自动翻译，点击查看原文') : (orig ? 'Show translation' : 'Auto-translated; click for the original');
    return `<span class="tx${orig ? ' tx-orig' : ''}">${esc(orig ? s : t)}<span class="tx-badge" role="button" tabindex="0" data-tx-toggle="${esc(key)}" title="${label}" aria-label="${label}">${orig ? (target === 'zh' ? '原' : 'Orig') : (target === 'zh' ? '译' : 'Tr')}</span></span>`;
  }
  const toggle = el => { const k = el.dataset.txToggle; showOriginal.has(k) ? showOriginal.delete(k) : showOriginal.add(k); ctx?.rerender?.(); };
  document.addEventListener('click', e => { const b = e.target.closest?.('[data-tx-toggle]'); if (!b) return; e.preventDefault(); e.stopPropagation(); toggle(b); }, true);
  document.addEventListener('keydown', e => { const b = e.target.closest?.('[data-tx-toggle]'); if (!b || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); e.stopPropagation(); toggle(b); }, true);
  /* People's names follow the interface language: name_zh / name_en, falling back to the original display name. */
  const names = {
    name(u) { if (!u) return ''; const base = u._dn ?? u.display_name ?? ''; return lang() === 'en' ? (u.name_en || u.name_zh || base) : (u.name_zh || u.name_en || base); },
    apply(list) { for (const u of list || []) { if (!u || typeof u !== 'object') continue; if (u._dn === undefined) u._dn = u.display_name; u.display_name = names.name(u); } return list; },
    missing(u) { return !!u && (!u.name_zh || !u.name_en); },
  };
  window.WorkOSNames = names;
  window.WorkOSTranslate = { configure(next) { ctx = next; }, html, text, _cache:cache, _mainLang:mainLang };
})();
