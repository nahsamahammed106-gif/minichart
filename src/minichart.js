/*! MiniChart · tiny interactive canvas charts · MIT
 *  const c = MiniChart('#el', { type: 'line'|'area'|'bar', title, labels: [...], series: [{ name, data: [...], color? }], format?, zero?, sound? })
 *  c.update({ series }) · c.reset() · c.destroy()
 */
(function (root) {
  'use strict';
  // Same 8 hues in fixed order; the dark set is stepped down to stay readable on dark backgrounds (both pass a colour-blindness validator).
  const PAL = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  const PAL_DARK = ['#3b82f6', '#d97706', '#0f9d6e', '#ef4444', '#8b5cf6', '#0891b2', '#ec4899', '#65a30d'];
  const CSS = `.mc{position:relative;display:flex;flex-direction:column;gap:8px;height:var(--mc-height,300px);font-size:12px;line-height:1.4;outline:0}
.mc:focus-visible{outline:2px solid #3b82f6;outline-offset:4px;border-radius:4px}
.mc-plot{position:relative;flex:1;min-height:0;touch-action:pan-y;cursor:crosshair}
.mc canvas{position:absolute;inset:0;width:100%;height:100%}
.mc-tip{position:absolute;top:8px;left:0;pointer-events:none;background:var(--mc-tip-bg,Canvas);color:var(--mc-tip-color,CanvasText);border:1px solid #8885;border-radius:8px;padding:6px 10px;box-shadow:0 6px 20px #0002;white-space:nowrap;opacity:0;transition:opacity .15s;z-index:1}
.mc-tip div{display:flex;align-items:center;gap:6px}
.mc-tip div b{margin-inline-start:auto;padding-inline-start:14px;font-variant-numeric:tabular-nums}
.mc i{display:inline-block;width:9px;height:9px;border-radius:3px;flex:none}
.mc-leg{display:flex;flex-wrap:wrap;gap:2px 6px;align-items:center}
.mc-leg button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:28px;min-width:28px;justify-content:center;padding:3px 8px;border-radius:6px}
.mc-leg button:hover{background:#8882}
.mc-leg button:focus-visible{outline:2px solid #3b82f6}
.mc-leg button[aria-pressed=false]{opacity:.45;text-decoration:line-through}
.mc-tools{margin-inline-start:auto}
.mc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const nf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = v => v == null || v !== v ? '–' : nf.format(v);

  let sheet, tt;
  // Trusted Types: all HTML below is built from escaped values, so pass-through is safe. Host CSP must allow policy "minichart".
  try { tt = root.trustedTypes && root.trustedTypes.createPolicy('minichart', { createHTML: s => s }); } catch (_) { /* policy name not allowed */ }
  const html = (node, s) => { node.innerHTML = tt ? tt.createHTML(s) : s; };
  // Number() handles BigInt (unary + throws on it); Symbol still throws, so catch → null.
  const num = v => { try { v = v == null || v === '' ? NaN : Number(v); } catch (_) { return null; } return isFinite(v) ? v : null; };

  function nice(lo, hi, n) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
    const step = mag * (r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1);
    return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
  }

  function MiniChart(el, opts) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) throw new Error('MiniChart: element not found');
    if (!sheet) { // constructable stylesheet: allowed under strict CSP; <style> fallback for Safari < 16.4
      if (document.adoptedStyleSheets) { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }
      else sheet = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
    }
    el.classList.add('mc');
    el.tabIndex = 0;
    el.setAttribute('role', 'figure');
    html(el, '<div class="mc-leg"></div><div class="mc-plot"><canvas aria-hidden="true"></canvas><div class="mc-tip" aria-hidden="true"></div></div><div class="mc-sr" aria-live="polite"></div><div class="mc-sr"><table></table></div>'); // a table ignores height:1px, so the div clips it
    const [leg, plot, live, tbox] = el.children, table = tbox.firstChild, cv = plot.firstChild, tip = plot.lastChild, ctx = cv.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const R = 12, T = 10, B = 24, ptr = new Map(), hide = new Set();
    let o = {}, S = [], N = 0, i0 = 0, i1 = 0, W = 0, H = 0, L = 40, rtl = false;
    let hov = -1, hl = -1, from = null, t0 = 0, raf = 0, ys = null, drag = null, meas = null, pinch = 0, press = 0, dead = false, dark = false;

    const bar = () => o.type === 'bar';
    const half = () => bar() || N === 1 ? 0.5 : 0;
    const pw = () => W - L - R, ph = () => H - T - B;
    const span = () => i1 - i0 + 2 * half();
    // RTL mirrors the time axis and moves the value axis to the right, as Arabic readers expect.
    const PL = () => rtl ? R : L, dir = () => rtl ? -1 : 1;
    const X = i => { const f = (i - i0 + half()) / span(); return PL() + (rtl ? 1 - f : f) * pw(); };
    const idxAt = px => { const f = (px - PL()) / pw(); return (rtl ? 1 - f : f) * span() + i0 - half(); };
    const Y = v => T + (1 - (v - ys.lo) / (ys.hi - ys.lo)) * ph();
    const lab = i => String(o.labels && o.labels[i] != null ? o.labels[i] : fmt(i));
    const clampI = i => Math.max(Math.ceil(i0), Math.min(Math.floor(i1), i));
    // Canvas normalises any CSS colour to '#rrggbb' or 'rgba(…)'; invalid input leaves fillStyle unchanged, so two different probes disagree.
    const norm = c => { ctx.fillStyle = '#000'; ctx.fillStyle = c; const a = ctx.fillStyle; ctx.fillStyle = '#fff'; ctx.fillStyle = c; return a === ctx.fillStyle ? a : undefined; };
    const alpha = (c, a) => c[0] === '#' ? c + Math.round(a * 255).toString(16).padStart(2, '0') : c.replace(/[\d.]+\)$/, a + ')');
    const tick = () => { if (!dead) raf = raf || requestAnimationFrame(draw); };
    const px = e => e.clientX - plot.getBoundingClientRect().left;
    const vis = () => S.map((_, si) => si).filter(si => !hide.has(si));
    const recolor = () => S.forEach((s, i) => { s.color = s.own || (dark ? PAL_DARK : PAL)[i % PAL.length]; });
    const trace = seg => { ctx.beginPath(); seg.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };

    function val(si, i, e) {
      const v = S[si].data[i];
      if (v == null || e === 1) return v;
      const f = from[si] && from[si][i];
      return f == null ? v : f + (v - f) * e;
    }

    // Line points, min/max-decimated to one column per pixel when dense (keeps 100k+ points smooth).
    function path(si, a, b, e) {
      const out = [], dense = b - a > pw();
      let seg = [], cx = NaN, mn, mx;
      const flush = () => { if (cx === cx) seg.push([cx, mn], [cx, mx]); cx = NaN; };
      for (let i = a; i <= b; i++) {
        const v = val(si, i, e);
        if (v == null) { flush(); if (seg.length) out.push(seg); seg = []; continue; }
        const x = X(i), y = Y(v);
        if (!dense) { seg.push([x, y]); continue; }
        const c = Math.round(x);
        if (c !== cx) { flush(); cx = c; mn = mx = y; } else { mn = Math.min(mn, y); mx = Math.max(mx, y); }
      }
      flush();
      if (seg.length) out.push(seg);
      return out;
    }

    function draw() {
      raf = 0;
      if (!W || !N) return;
      const e = from ? 1 - (1 - Math.min(1, (performance.now() - t0) / 600)) ** 3 : 1;
      if (e === 1) from = null;
      const cs = getComputedStyle(el), color = cs.color;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, W, H);
      rtl = cs.direction === 'rtl';
      ctx.direction = cs.direction;
      const [cr, cg, cb] = color.match(/[\d.]+/g).map(Number), isDark = cr * 0.299 + cg * 0.587 + cb * 0.114 > 140; // light text = dark page
      if (isDark !== dark) { dark = isDark; recolor(); swatch(leg, S); }
      ctx.font = '11px ' + cs.fontFamily; // canvas text uses the page's font, Arabic included
      const a = Math.max(0, Math.floor(i0)), b = Math.min(N - 1, Math.ceil(i1)), V = vis();

      // y-axis auto-fits the visible, un-hidden data and springs toward it
      let lo = Infinity, hi = -Infinity;
      for (const si of V) for (let i = a; i <= b; i++) { const v = S[si].data[i]; if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (lo > hi) { lo = 0; hi = 1; }
      if (o.zero ?? o.type !== 'line') { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      const yt = nice(lo, hi, Math.max(2, ph() / 45 | 0));
      if (!ys || reduce || Math.abs(yt.lo - ys.lo) + Math.abs(yt.hi - ys.hi) < (yt.hi - yt.lo) * 1e-3) ys = { lo: yt.lo, hi: yt.hi };
      else { ys.lo += (yt.lo - ys.lo) * 0.2; ys.hi += (yt.hi - ys.hi) * 0.2; }
      const moving = ys.lo !== yt.lo || ys.hi !== yt.hi;

      const ticks = [];
      for (let v = yt.lo, k = 0; v <= yt.hi + yt.step / 2 && k < 50; v += yt.step, k++) ticks.push(+v.toPrecision(12)); // k cap: float precision can stall v
      L = Math.max(...ticks.map(v => ctx.measureText(o.format(v)).width)) + 14;

      ctx.fillStyle = color;
      ctx.textAlign = rtl ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      for (const v of ticks) {
        const y = Math.round(Y(v));
        if (y < T - 1 || y > H - B + 1) continue;
        ctx.globalAlpha = v === 0 ? 0.35 : 0.12;
        ctx.fillRect(PL(), y, pw(), 1);
        ctx.globalAlpha = 0.7;
        ctx.fillText(o.format(v), rtl ? W - L + 8 : L - 8, y);
      }

      const per = pw() / span();
      let wmax = 0;
      for (let i = a; i <= b; i += Math.max(1, (b - a) / 20 | 0)) wmax = Math.max(wmax, ctx.measureText(lab(i)).width);
      const step = Math.max(1, Math.ceil((wmax + 6) / per));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = Math.ceil(a / step) * step; i <= b; i += step) {
        const x = X(i), t = lab(i), hw = ctx.measureText(t).width / 2;
        if (x >= PL() - 1 && x <= PL() + pw() + 1 && x - hw >= 0 && x + hw <= W) ctx.fillText(t, x, H - B + 6); // skip labels that would be cut off
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(PL(), T, pw(), ph());
      ctx.clip();
      if (meas) { ctx.globalAlpha = 0.1; ctx.fillRect(Math.min(X(meas.a), X(meas.b)), T, Math.abs(X(meas.b) - X(meas.a)), ph()); }
      if (hov >= 0 && bar()) { ctx.globalAlpha = 0.07; ctx.fillRect(X(hov) - per / 2, T, per, ph()); }
      V.forEach((si, k) => {
        const s = S[si];
        ctx.globalAlpha = hl < 0 || hl === si ? 1 : 0.15;
        ctx.fillStyle = ctx.strokeStyle = s.color;
        if (bar()) {
          const bw = per * 0.8 / V.length, y0 = Y(0), r = Math.min(4, bw / 3);
          if (bw < 2) { // too dense for separate bars: one min/max column per pixel
            for (const seg of path(si, a, b, e)) for (const [x, y] of seg) ctx.fillRect(x, Math.min(y, y0), 1, Math.abs(y0 - y));
            return;
          }
          for (let i = a; i <= b; i++) {
            const v = val(si, i, e);
            if (v == null) continue;
            const y = Y(v);
            ctx.beginPath();
            ctx.fillStyle = (s.colors && s.colors[i]) || s.color;
            ctx.roundRect(X(i) - per * 0.4 + (rtl ? V.length - 1 - k : k) * bw + 1, Math.min(y, y0), Math.max(1, bw - 2), Math.abs(y0 - y), v >= 0 ? [r, r, 0, 0] : [0, 0, r, r]);
            ctx.fill();
          }
          return;
        }
        const segs = path(si, a, b, e);
        if (o.type === 'area') {
          const base = Y(Math.max(ys.lo, Math.min(0, ys.hi))), g = ctx.createLinearGradient(0, base < T + ph() / 2 ? H - B : T, 0, base); // fade toward the zero line, up or down
          g.addColorStop(0, alpha(s.color, 0.35));
          g.addColorStop(1, alpha(s.color, 0));
          ctx.fillStyle = g;
          for (const seg of segs) {
            trace(seg);
            ctx.lineTo(seg[seg.length - 1][0], base);
            ctx.lineTo(seg[0][0], base);
            ctx.fill();
          }
          ctx.fillStyle = s.color;
        }
        ctx.lineWidth = 2;
        ctx.lineJoin = ctx.lineCap = 'round';
        for (const seg of segs) {
          trace(seg);
          ctx.stroke();
          if (per > 14) for (const [x, y] of seg) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); }
        }
      });
      ctx.restore();

      if (hov >= 0 && !bar()) {
        const x = X(hov);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(Math.round(x), T, 1, ph());
        ctx.globalAlpha = 1;
        for (const si of V) {
          const v = val(si, hov, e);
          if (v == null) continue;
          ctx.fillStyle = S[si].color;
          ctx.beginPath();
          ctx.arc(x, Y(v), 4.5, 0, 7);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      show();
      if (e < 1 || moving) tick();
    }

    const row = (s, v) => `<div><i></i>${esc(s.name)}<b>${esc(v)}</b></div>`;
    const swatch = (box, list) => box.querySelectorAll('i').forEach((i, k) => { i.style.background = list[k].color; }); // CSSOM, not style="": works under strict CSP
    function show() {
      const V = vis().map(si => S[si]);
      let out = '', x = 0;
      if (meas && meas.a !== meas.b) {
        const p = Math.min(meas.a, meas.b), q = Math.max(meas.a, meas.b);
        out = `<b>${esc(lab(p))} → ${esc(lab(q))}</b>` + V.map(s => {
          const u = s.data[p], w = s.data[q];
          if (u == null || w == null) return row(s, '–');
          const d = w - u;
          return row(s, `${d >= 0 ? '▲' : '▼'} ${o.format(Math.abs(d))}${u ? ` (${(d / Math.abs(u) * 100).toFixed(1)}%)` : ''}`);
        }).join('');
        x = X(q);
      } else if (hov >= 0) {
        out = `<b>${esc(lab(hov))}</b>` + V.map(s => row(s, o.format(s.data[hov]))).join('');
        x = X(hov);
      }
      tip.style.opacity = out ? 1 : 0;
      if (!out) return;
      html(tip, out);
      swatch(tip, V);
      const w = tip.offsetWidth;
      tip.style.left = Math.max(0, x + 14 + w > W ? x - 14 - w : x + 14) + 'px';
    }

    function view(a, b) {
      const s = Math.min(N - 1, Math.max(Math.min(N - 1, 4), b - a));
      i0 = Math.max(0, Math.min(a, N - 1 - s));
      i1 = i0 + s;
      tick();
    }
    const zoom = (c, k) => view(c - (c - i0) * k, c + (i1 - c) * k);
    const reset = () => { meas = null; view(0, N - 1); };

    plot.onpointerdown = e => {
      if (e.button > 0) return;
      try { plot.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
      ptr.set(e.pointerId, px(e));
      clearTimeout(press);
      if (ptr.size === 2) { drag = meas = null; pinch = 0; return; }
      const i = clampI(Math.round(idxAt(px(e))));
      if (e.shiftKey) meas = { a: i, b: i };
      else {
        meas = null;
        const d = drag = { x: px(e), i0, i1 };
        // Long-press (no Shift key on phones) switches the drag into measure mode.
        press = setTimeout(() => {
          if (drag !== d || Math.abs(ptr.get(e.pointerId) - d.x) > 8) return;
          drag = null; meas = { a: i, b: i };
          tick();
        }, 450);
      }
      hov = i; // tap shows the tooltip on touch
      tick();
    };
    plot.onpointermove = e => {
      const x = px(e);
      if (ptr.has(e.pointerId)) ptr.set(e.pointerId, x);
      if (ptr.size === 2) {
        const [p, q] = [...ptr.values()], d = Math.abs(p - q);
        if (pinch && d > 10) zoom(idxAt((p + q) / 2), pinch / d);
        pinch = d;
        return;
      }
      if (meas && ptr.size) meas.b = clampI(Math.round(idxAt(x)));
      else if (drag) { const di = dir() * (drag.x - x) / pw() * (drag.i1 - drag.i0 + 2 * half()); view(drag.i0 + di, drag.i1 + di); }
      hov = clampI(Math.round(idxAt(x)));
      tick();
    };
    plot.onpointerup = plot.onpointercancel = e => { clearTimeout(press); ptr.delete(e.pointerId); drag = null; pinch = 0; };
    plot.onpointerleave = () => { if (!ptr.size) { hov = -1; tick(); } };
    plot.ondblclick = reset;
    // Zoom only on ctrl/⌘ (incl. trackpad pinch) or once the chart has focus — no scroll-jacking the page.
    plot.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey || document.activeElement === el)) return;
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const di = dir() * e.deltaX / pw() * span(); view(i0 + di, i1 + di); }
      else zoom(idxAt(px(e)), Math.exp(Math.max(-50, Math.min(50, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.003)));
    }, { passive: false });

    const onKey = e => {
      const k = e.key, c = hov >= 0 ? hov : (i0 + i1) / 2;
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        const d = (k === 'ArrowRight' ? 1 : -1) * dir() * (e.shiftKey ? 10 : 1);
        hov = Math.max(0, Math.min(N - 1, hov < 0 ? Math.round(c) : hov + d));
        if (hov < i0) view(hov, hov + i1 - i0); else if (hov > i1) view(hov - (i1 - i0), hov);
      } else if (k === '+' || k === '=') zoom(c, 0.7);
      else if (k === '-') zoom(c, 1 / 0.7);
      else if (k === '0') reset();
      else if (k === 'Escape') { hov = -1; meas = null; }
      else return;
      e.preventDefault();
      tick();
      show(); // update tooltip now, not on the next frame, so the announcement can't be stale
      live.textContent = tip.style.opacity === '1' ? tip.innerText.replace(/\n/g, ', ') : '';
    };
    el.addEventListener('keydown', onKey);

    function legend() {
      // A single series needs no legend: the chart's title names it.
      html(leg, (S.length > 1 ? S.map((s, si) => `<button type="button" aria-pressed="${!hide.has(si)}" data-i="${si}"><i></i>${esc(s.name)}</button>`).join('') : '') +
        '<span class="mc-tools">' + (o.sound ? '<button type="button" data-t="play" title="Play as sound" aria-label="Play the data as sound">♪</button>' : '') + '<button type="button" data-t="png" title="Download PNG" aria-label="Download chart as PNG">⤓</button></span>');
      swatch(leg, S);
    }
    leg.onclick = e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.t) return btn.dataset.t === 'play' ? play() : png();
      const i = +btn.dataset.i;
      hide.has(i) ? hide.delete(i) : hide.add(i);
      btn.setAttribute('aria-pressed', !hide.has(i));
      tick();
    };
    const hilite = e => { const b = e.target.closest && e.target.closest('[data-i]'); hl = b ? +b.dataset.i : -1; tick(); };
    leg.addEventListener('pointerover', hilite);
    leg.addEventListener('focusin', hilite);
    const unlit = () => { hl = -1; tick(); };
    leg.addEventListener('pointerleave', unlit);
    leg.addEventListener('focusout', unlit);

    // Sonify: pitch follows the first visible series, playhead sweeps the tooltip along.
    function play() {
      const si = vis()[0], AC = root.AudioContext;
      if (si == null || !AC) return;
      const A = new AC(), osc = A.createOscillator(), g = A.createGain();
      const a = Math.ceil(i0), b = Math.floor(i1), n = b - a + 1, d = Math.min(0.15, 6 / n), t = A.currentTime;
      osc.type = 'triangle';
      osc.connect(g).connect(A.destination);
      g.gain.setValueAtTime(0.12, t);
      g.gain.setValueAtTime(0, t + n * d);
      for (let k = 0; k < n; k++) {
        const v = S[si].data[a + k];
        if (v != null) osc.frequency.setValueAtTime(220 * 2 ** (2.5 * (v - ys.lo) / (ys.hi - ys.lo)), t + k * d);
      }
      osc.start(t);
      osc.stop(t + n * d + 0.05);
      osc.onended = () => A.close();
      const st = performance.now();
      (function sweep() {
        const k = (performance.now() - st) / 1000 / d | 0;
        hov = k < n ? a + k : -1;
        tick();
        if (k < n && !dead) requestAnimationFrame(sweep);
      })();
    }

    function png() {
      let n = el, bg;
      while (n && (bg = getComputedStyle(n).backgroundColor) === 'rgba(0, 0, 0, 0)') n = n.parentElement;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = n ? bg : '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
      const link = document.createElement('a');
      link.download = String(o.title || 'chart').replace(/[\0-\x1f\x7f/\\:*?"<>|]/g, '').slice(0, 100) + '.png';
      link.href = cv.toDataURL();
      link.click();
      tick();
    }

    // Canvas is silent to screen readers: give it a spoken summary and a real data table.
    function a11y() {
      const sum = S.map(s => {
        const d = s.data.filter(v => v != null);
        return d.length ? `${s.name}: from ${fmt(d[0])} to ${fmt(d[d.length - 1])}, low ${fmt(d.reduce((m, v) => v < m ? v : m))}, high ${fmt(d.reduce((m, v) => v > m ? v : m))}` : s.name;
      });
      el.setAttribute('aria-label', `${o.title ? o.title + '. ' : ''}${o.type} chart, ${N} points. ${sum.join('. ')}. Arrow keys explore, plus and minus zoom, 0 resets.`);
      const rows = Math.min(N, 500); // ponytail: table capped at 500 rows, paginate if screen-reader users need all of a huge series
      html(table, `<caption>${esc(o.title || 'Chart data')}${N > rows ? ` (first ${rows} of ${N})` : ''}</caption><tr><th>Label</th>${S.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr>` +
        Array.from({ length: rows }, (_, i) => `<tr><th>${esc(lab(i))}</th>${S.map(s => `<td>${esc(fmt(s.data[i]))}</td>`).join('')}</tr>`).join(''));
    }

    function update(next) {
      if (dead) return;
      const prev = S.length ? S.map(s => s.data) : null;
      o = { type: 'line', ...o, ...next };
      if (typeof o.format !== 'function') o.format = fmt;
      S = (o.series || []).filter(Boolean).map((s, i) => ({
        name: 'Series ' + (i + 1), ...s,
        own: norm(s.color),
        colors: s.colors && Array.from(s.colors, norm), // ponytail: per-point colours only apply to bars
        data: Array.from(s.data || [], num) // drop NaN/Infinity/junk: they break scales
      }));
      recolor();
      const n = o.labels ? o.labels.length : Math.max(0, ...S.map(s => s.data.length));
      if (n !== N || !prev) { N = n; i0 = 0; i1 = Math.max(0, N - 1); }
      if (!reduce && o.animate !== false) { from = prev || S.map(s => s.data.map(() => 0)); t0 = performance.now(); }
      legend();
      a11y();
      tick();
    }

    const ro = new ResizeObserver(() => {
      W = plot.clientWidth; H = plot.clientHeight;
      cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio;
      draw();
    });
    // Theme = the element's CSS `color`; redraw when the page theme or OS scheme flips.
    const mo = new MutationObserver(tick), mq = matchMedia('(prefers-color-scheme: dark)');
    ro.observe(plot);
    mo.observe(document.documentElement, { attributes: true });
    mq.addEventListener('change', tick);
    if (document.fonts) document.fonts.ready.then(tick); // redraw canvas text once web fonts arrive
    update(opts);

    return {
      update, reset,
      destroy() { dead = true; ro.disconnect(); mo.disconnect(); mq.removeEventListener('change', tick); cancelAnimationFrame(raf); clearTimeout(press); el.removeEventListener('keydown', onKey); el.classList.remove('mc'); el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-label'); el.replaceChildren(); } // replaceChildren: allowed under Trusted Types
    };
  }

  root.MiniChart = MiniChart;
  if (typeof module === 'object' && module.exports) module.exports = MiniChart; // require('minichart') / import MiniChart from 'minichart'
})(globalThis);
