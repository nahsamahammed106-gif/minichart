// Runs under: style-src 'self'; script-src 'self' (no 'unsafe-inline').
const violations = [];
document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective + ' ' + (e.sample || '')));
const el = document.getElementById('c');
const chart = MiniChart(el, { labels: ['a', 'b', 'c'], series: [{ name: 'A', data: [1, 3, 2] }, { name: 'B', data: [2, 1, 3] }] });
setTimeout(() => {
  const styled = getComputedStyle(el).display === 'flex';
  const rendered = !!el.querySelector('.mc-leg [data-i]') && !!el.querySelector('[data-t=png]') && !!el.querySelector('table tr'); // innerHTML went through Trusted Types
  const sw = el.querySelector('.mc-leg [data-i] i').style.background;
  // the page's own inline style attribute on #c is a known violation of this test page, not of the library
  const lib = violations.filter(v => !v.includes('width:600px'));
  let destroyed = false;
  try { chart.destroy(); destroyed = el.childElementCount === 0; } catch (e) { destroyed = String(e); } // must not throw under Trusted Types
  window.csp = { styled, rendered, destroyed, swatch: sw, violations: lib };
  document.getElementById('sum').textContent = JSON.stringify(window.csp);
}, 800);
