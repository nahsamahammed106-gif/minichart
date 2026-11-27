declare function MiniChart(el: string | HTMLElement, options?: MiniChart.Options): MiniChart.Chart;

declare namespace MiniChart {
  interface Series {
    /** Shown in the legend and tooltip. Defaults to "Series 1", "Series 2", … */
    name?: string;
    /** Values to plot. null/undefined leave a gap; non-numeric values are dropped. */
    data: ArrayLike<number | null | undefined>;
    /** Any CSS colour. Invalid colours fall back to the built-in palette. */
    color?: string;
  }
  interface Options {
    type?: 'line' | 'area' | 'bar';
    /** Used for the screen-reader summary, data table caption and PNG file name. */
    title?: string;
    /** One label per point along the x-axis. Defaults to the point index. */
    labels?: ArrayLike<string | number>;
    series?: Series[];
    /** Formats values on the y-axis and in tooltips. Its output is escaped. */
    format?: (value: number | null) => string;
    /** Include zero on the y-axis. Default: true for bar and area, false for line. */
    zero?: boolean;
    /** Show the ♪ button that plays the data as sound. Default: false. */
    sound?: boolean;
    /** Animate the first draw and updates. Default: true (always off with prefers-reduced-motion). */
    animate?: boolean;
  }
  interface Chart {
    /** Merge new options (for example new series) and redraw, animating from the old values. */
    update(options: Options): void;
    /** Reset zoom and clear any measurement. */
    reset(): void;
    /** Remove the chart and all its listeners. */
    destroy(): void;
  }
}

export = MiniChart;
export as namespace MiniChart;
