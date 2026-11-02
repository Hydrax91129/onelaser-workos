'use strict';
/* Contrast guard: keeps every piece of text readable in light and dark themes.
 * After each render it checks text against the colour actually behind it (WCAG 2.1:
 * 4.5:1 for body text, 3:1 for large or bold text). Text on a coloured chip or header
 * switches to dark or white ink, whichever reads better; coloured text on a panel is
 * darkened (light theme) or lightened (dark theme) just enough to pass.
 * Nothing changes when the original colours already pass. */
(() => {
  const DARK_INK = { r:29, g:31, b:38 }, WHITE = { r:255, g:255, b:255 };
  const parse = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r:p[0], g:p[1], b:p[2], a:p.length > 3 ? p[3] : 1 }; };
  const blend = (top, under) => ({ r:top.r * top.a + under.r * (1 - top.a), g:top.g * top.a + under.g * (1 - top.a), b:top.b * top.a + under.b * (1 - top.a), a:1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const css = c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  const dark = () => document.documentElement.dataset.theme === 'dark';
  const pageBg = () => parse(getComputedStyle(document.body).backgroundColor) || (dark() ? { r:20, g:20, b:20, a:1 } : WHITE);

  // Background actually behind an element, compositing translucent layers; also says whether
  // the nearest coloured layer is a chip (its own small box) rather than the page or a panel.
  function behind(el) {
    const layers = []; let chip = false, owner = null, depth = 0;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement, depth++) {
      const s = getComputedStyle(n), c = parse(s.backgroundColor);
      if (c && c.a > 0) { if (!layers.length && depth <= 2) { const r = n.getBoundingClientRect(); chip = r.height <= 64 && r.width <= 420; owner = n; } layers.push(c); if (c.a >= 1) break; }
    }
    let base = layers.length && layers[layers.length - 1].a >= 1 ? null : pageBg();
    for (let i = layers.length - 1; i >= 0; i--) base = base ? blend(layers[i], base) : layers[i];
    return { bg:base || pageBg(), chip, owner };
  }

  function fix(el) {
    if (el.dataset.cg) { el.style.removeProperty('color'); delete el.dataset.cg; }
    const tinted = el.closest('[data-cg-bg]'); if (tinted && tinted.dataset.cgBg === 'self' && tinted === el) { el.style.removeProperty('background-color'); delete el.dataset.cgBg; }
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return;
    const fg0 = parse(s.color); if (!fg0) return;
    const { bg, chip, owner } = behind(el), fg = fg0.a < 1 ? blend(fg0, bg) : fg0;
    const size = parseFloat(s.fontSize) || 14, bold = Number(s.fontWeight) >= 600, need = size >= 24 || (size >= 18.6 && bold) ? 3 : 4.5;
    if (ratio(fg, bg) >= need) return;
    let next;
    if (chip) {
      next = ratio(DARK_INK, bg) >= ratio(WHITE, bg) ? DARK_INK : WHITE;
      // Mid-tone chips (red, purple, grey) pass with neither ink: keep white text and deepen the chip slightly.
      if (ratio(next, bg) < need && owner) {
        let deeper = bg; for (let t = 0.05; t <= 0.6 && ratio(WHITE, deeper) < need; t += 0.05) deeper = { r:bg.r * (1 - t), g:bg.g * (1 - t), b:bg.b * (1 - t) };
        owner.style.setProperty('background-color', css(deeper), 'important'); if (owner.style.getPropertyValue('--cell-bg') !== undefined) owner.style.setProperty('--cell-bg', css(deeper));
        owner.dataset.cgBg = owner === el ? 'self' : 'owner'; next = WHITE;
      }
    }
    else {
      const target = lum(bg) > 0.4 ? { r:0, g:0, b:0 } : WHITE;
      next = fg;
      for (let t = 0.1; t <= 1.001 && ratio(next, bg) < need; t += 0.1) next = { r:fg.r + (target.r - fg.r) * t, g:fg.g + (target.g - fg.g) * t, b:fg.b + (target.b - fg.b) * t };
    }
    el.style.setProperty('color', css(next), 'important'); el.dataset.cg = '1';
  }

  const hasText = el => { for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; };
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    const all = [root, ...root.querySelectorAll('*')];
    for (const el of all) {
      if (el.nodeType !== 1 || el.closest('svg,script,style,[data-no-contrast]') || !hasText(el)) continue;
      try { fix(el); } catch { /* never break the page over a colour check */ }
    }
  }

  let queued = false; const pending = new Set();
  const flush = () => { queued = false; const roots = [...pending]; pending.clear(); roots.forEach(scan); };
  const queue = node => { if (node && node.nodeType === 1) pending.add(node); if (!queued) { queued = true; requestAnimationFrame(() => setTimeout(flush, 0)); } };

  const start = () => {
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(n => queue(n.nodeType === 1 ? n : n.parentElement));
        else if (m.target.nodeType === 1 && m.attributeName !== 'data-cg' && !(m.attributeName === 'style' && m.target.dataset.cg)) queue(m.target);
      }
    }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class', 'style'] });
    // Theme or language switches recolour everything.
    new MutationObserver(() => queue(document.body)).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
    queue(document.body);
  };
  window.WorkOSContrast = { check:() => scan(document.body), ratio:(a, b) => ratio(parse(a), parse(b)) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
