# MiniChart plan

**Goal:** an open-source, ≤12 KB gzipped, zero-dependency chart library that fixes the common pain points of Chart.js-style libraries.

## Pain points → fixes
| Pain point | Fix |
|---|---|
| Chart.js full bundle ~67 KB gz; ApexCharts called "bloated" | ≤12 KB, enforced by CI size check |
| Zoom needs a plugin | Built in: drag-pan, pinch / Ctrl-⌘+scroll zoom, double-click reset |
| Wheel zoom hijacks page scroll | Zoom only with Ctrl/⌘ or once the chart has focus |
| Slow on big data | Min/max decimation per pixel column (100k+ points) |
| All-series tooltip needs config | Default |
| Responsive resize quirks | ResizeObserver, no wrapper needed |
| Canvas is silent to screen readers | Auto summary, hidden data table, arrow-key navigation + live region |
| Dark mode is manual | Colours follow the element's CSS `color` |
| Customising gets messy | Small option set, style with CSS |

Extras: Shift+drag measure (Δ and %), ♪ sonify with playhead, springy y-axis, animated updates, PNG export, legend toggle + highlight, RTL/Arabic text.

## Repo layout
```
src/minichart.js   dist/   index.d.ts   test/   demo/index.html
README.md  LICENSE (MIT)  CHANGELOG.md  CONTRIBUTING.md  .github/workflows/ci.yml
```

## Phases
1. Core library: line, area, bar + interactions, verified in a browser.
2. Demo page (GitHub Pages): 4 examples incl. 100k points and Arabic RTL, light + dark.
3. Packaging: esbuild (ESM + IIFE), types, node:test + browser smoke test, CI with size limit, README.
4. Publish: maintainer pushes to GitHub and npm.

## Decisions
Name `minichart` · MIT · v1 types line/area/bar · esbuild (dev only).
