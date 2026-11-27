// Runs under: style-src 'self'; script-src 'self' (no 'unsafe-inline').
const violations = [];
document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective + ' ' + (e.sample || '')));
const el = document.getElementById('c');
MiniChart(el, { labels: ['a', 'b', 'c'], series: [{ name: 'A', data: [1, 3, 2] }] });
setTimeout(() => {
  const styled = getComputedStyle(el).display === 'flex';
  const sw = el.querySelector('.mc-leg [data-i] i').style.background;
  // the page's own inline style attribute on #c is a known violation of this test page, not of the library
  const lib = violations.filter(v => !v.includes('width:600px'));
  window.csp = { styled, swatch: sw, violations: lib };
  document.getElementById('sum').textContent = JSON.stringify(window.csp);
}, 800);
