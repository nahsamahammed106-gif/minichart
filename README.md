# MiniChart

Interactive line, area and bar charts in under 9 KB, with no dependencies.

Zoom, pan, pinch, tooltips, a measure tool, keyboard and screen-reader support, dark mode, Arabic right-to-left layouts and 100,000-point datasets work out of the box.

**[Live demo](https://nahsamahammed106-gif.github.io/minichart/demo/)**

## Quick start

```html
<div id="chart"></div>
<script src="minichart.js"></script>
<script>
  const chart = MiniChart('#chart', {
    type: 'line',
    title: 'Visitors',
    labels: ['Jan', 'Feb', 'Mar'],
    series: [{ name: 'Visits', data: [120, 340, 280] }],
  });
</script>
```

It isn't on npm yet. From a CDN, pinned to a release:

```html
<script src="https://cdn.jsdelivr.net/gh/nahsamahammed106-gif/minichart@v0.2.0/src/minichart.js"
        integrity="sha384-zOjthgkOQNWIQu2FVYA8zdN5NU0vqza9bof99g1lxsscWopJSp25BysqYdhCfBma"
        crossorigin="anonymous"></script>
```

Or copy [`src/minichart.js`](src/minichart.js) into your project. It's a single file.

## Options

| Option | Type | Default | What it does |
|---|---|---|---|
| `type` | `'line'`, `'area'` or `'bar'` | `'line'` | Chart type |
| `title` | string | | Used in the screen-reader summary, the data table caption and the PNG file name |
| `labels` | array | point index | One label per point along the x-axis |
| `series` | array of `{ name, data, color, colors }` | | The data. `null` leaves a gap; values that aren't numbers are dropped. Invalid colours fall back to the palette. `colors` sets one colour per bar (bar charts only) |
| `format` | `value => string` | compact number (1.2k) | Formats the y-axis and tooltip values |
| `zero` | boolean | `true` for bar and area | Always include zero on the y-axis |
| `animate` | boolean | `true` | Animate the first draw and updates. Always off when the visitor prefers reduced motion |

## Methods

| Method | What it does |
|---|---|
| `chart.update(options)` | Merges new options and redraws, animating from the old values. Zoom and hidden series are kept when the number of points is the same |
| `chart.reset()` | Resets the zoom and clears any measurement |
| `chart.destroy()` | Removes the chart and its listeners |

## Interactions

| Action | Mouse and keyboard | Touch |
|---|---|---|
| Show values | Hover | Tap |
| Zoom | <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + scroll, trackpad pinch, or <kbd>+</kbd> / <kbd>−</kbd> | Pinch |
| Pan | Drag | Drag sideways |
| Measure the change between two points | <kbd>Shift</kbd> + drag | Long-press, then drag |
| Reset | Double-click or <kbd>0</kbd> | |
| Move between points | <kbd>←</kbd> / <kbd>→</kbd> (<kbd>Shift</kbd> for 10 at a time) | |
| Hide a series | Click it in the legend | Tap it in the legend |

Scrolling over a chart scrolls the page. The wheel only zooms with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> held, or after the chart has been clicked.

## Styling

The chart uses the CSS `color` of its element for text and grid lines, so it follows your page's light and dark themes automatically. When that text colour is light, the chart switches to a darker version of its default palette that stays readable on dark backgrounds. Both palettes pass a colour-blindness check.

```css
#chart {
  color: #1a2740;               /* text and grid colour */
  --mc-height: 320px;           /* chart height (default 300px) */
  --mc-tip-bg: #fff;            /* tooltip background */
  --mc-tip-color: #1a2740;      /* tooltip text */
}
```

Text in the chart uses your page's font. A chart with one series has no legend, because its title already names it.

On a page with `dir="rtl"`, the time axis runs right to left and the value axis moves to the right.

## Accessibility

- The chart is a focusable `figure` with a spoken summary (range, lowest and highest value for each series).
- A hidden data table lists the values for screen readers (the first 500 rows).
- Arrow keys move between points and the values are announced.
- Legend buttons have a 28 px touch target and announce whether a series is shown.
- Animations are turned off for visitors who prefer reduced motion.

## Security

- Every name, label and `format()` result is escaped before it reaches the page.
- Colours are checked by the browser before use, so they can't inject CSS.
- It works under a strict Content Security Policy with no `unsafe-inline`.
- On pages that enforce Trusted Types, allow the policy name `minichart`:

```
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types minichart
```

Don't add `'allow-duplicates'`. The policy only passes through HTML the chart has already escaped, and duplicates would let other scripts register a policy with the same name.

## Size and speed

Measured on 27 Nov 2026 in Chrome (60 Hz) on an M1 MacBook Air: a 700 × 300 line chart, animations off, time until the chart is on screen, median of 5 runs. Your numbers will vary.

| Library | Download (gzip) | 100,000 points |
|---|---|---|
| **MiniChart 0.2.0** | **8.3 KB** | **71 ms** |
| uPlot 1.6.30 | 21 KB | 31 ms |
| Chart.js 4.4.1 | 68 KB | 1,891 ms |
| ApexCharts 3.54.1 | 137 KB | not re-tested (28.7 s for 10,000 points in an earlier single run) |

uPlot is faster at raw drawing; MiniChart trades some speed for built-in tooltips, legend, zoom and pan, accessibility and right-to-left support.

## Browser support

Tested in Chrome. It should work in current Edge, Firefox and Safari 16.4 or newer, but those haven't been tested yet. Touch gestures (pinch, long-press to measure) are tested with simulated touch only, not yet on a real phone.

## Development

```bash
npm test
```

This runs the browser tests in headless Chrome. It needs Node 22 or newer and Chrome. Set `CHROME=/path/to/chrome` if Chrome isn't found. There's nothing to install.

To check the size:

```bash
npm run size
```

CI fails if the library goes over 12 KB gzipped.

## License

MIT
