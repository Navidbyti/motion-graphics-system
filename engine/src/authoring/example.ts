/**
 * The worked example — one template that is simultaneously three things:
 *
 *   - what the Custom compositions render before anyone has pasted anything,
 *   - the example printed in the spec the AI reads,
 *   - a test that the format actually describes something renderable.
 *
 * One copy, not three. An example living only inside a markdown file rots the
 * first time the format changes, and a rotted example is worse than none: every
 * template written from it is wrong in the same way, and the person pasting has
 * no reason to doubt it. This one is parsed through the real schema at load, so
 * a change that breaks it cannot ship quietly.
 */

import { templateFileSchema, type TemplateFile } from "./format";

const raw = {
  version: 1,
  id: "stat-callout",
  title: "Stat Callout",
  description: "One big number over a tinted card, with a label above and a note under it.",
  tags: ["stat", "number", "callout"],
  seconds: 5,

  fields: [
    { key: "label", type: "text", label: "Label", default: "OCCUPANCY", maxLength: 40 },
    { key: "value", type: "text", label: "The number", default: "94%" },
    {
      key: "note",
      type: "text",
      label: "Note underneath",
      help: "Leave empty to hide it",
      default: "Up 12 points year on year",
      maxLength: 90,
    },
    { key: "tint", type: "color", label: "Card colour" },
  ],

  layers: [
    {
      id: "card",
      type: "shape",
      shape: "rect",
      fill: "{{tint}}",
      fillOpacity: 0.9,
      radius: "lg",
      shadow: true,
      box: { x: 50, y: 50, w: 86, h: 42, anchor: "center" },
      motion: { in: "scaleIn", at: 0 },
    },
    {
      id: "label",
      type: "text",
      value: "{{label}}",
      style: {
        size: "label",
        font: "body",
        weight: "semibold",
        color: "textSecondary",
        letterSpacing: 0.14,
        transform: "uppercase",
      },
      box: { x: 50, y: 36, anchor: "center" },
      motion: { in: "fadeUp", at: 0.25 },
    },
    {
      id: "value",
      type: "text",
      value: "{{value}}",
      style: { size: "hero", font: "numeric", weight: "black", color: "accent" },
      box: { x: 50, y: 50, anchor: "center" },
      motion: { in: "scaleIn", at: 0.4 },
    },
    {
      id: "note",
      type: "text",
      value: "{{note}}",
      style: { size: "support", font: "body", weight: "medium", color: "textPrimary" },
      box: { x: 50, y: 64, w: 76, anchor: "center" },
      motion: { in: "typewriter", at: 0.8 },
    },
  ],
};

/** Throws at load if the example stops being valid — which is the point. */
export const exampleTemplate: TemplateFile = templateFileSchema.parse(raw);

/** The same thing as JSON, for printing into the spec the AI reads. */
export const exampleTemplateJson = JSON.stringify(raw, null, 2);

/*
  A second example, for charts.

  Kept separate and deliberately short. A chart layer is the one thing in the
  format that needs three pieces to line up — a `bars` field, a `chart` layer
  pointing at it, and an `annotations` field if the shapes are wanted — and a
  model shown only the stat card guesses at all three.

  The sample bars are eight candles, enough to be a real chart and short enough
  to read. The editor replaces them the moment they press Fetch.
*/
const chartRaw = {
  version: 1,
  id: "chart-callout",
  title: "Chart Callout",
  description: "A price chart with a title, drawn in, ready for zones and levels.",
  tags: ["chart", "finance", "data"],
  seconds: 8,

  fields: [
    { key: "symbol", type: "text", label: "Symbol", default: "EUR / USD" },
    { key: "note", type: "text", label: "Under the symbol", default: "Daily" },
    {
      key: "bars",
      type: "bars",
      label: "Price data",
      help: "Fetch it, or paste columns from a spreadsheet",
      default: [
        { open: 1.081, high: 1.0855, low: 1.0795, close: 1.0842 },
        { open: 1.0842, high: 1.0898, low: 1.0838, close: 1.0889 },
        { open: 1.0889, high: 1.0902, low: 1.0844, close: 1.0851 },
        { open: 1.0851, high: 1.0873, low: 1.0806, close: 1.0818 },
        { open: 1.0818, high: 1.0826, low: 1.0742, close: 1.0759 },
        { open: 1.0759, high: 1.0801, low: 1.0751, close: 1.0796 },
        { open: 1.0796, high: 1.0864, low: 1.0788, close: 1.0857 },
        { open: 1.0857, high: 1.0911, low: 1.0849, close: 1.0904 },
      ],
    },
    {
      key: "marks",
      type: "annotations",
      label: "Zones and lines",
      help: "Add them here, then drag them on the chart in Build mode",
    },
  ],

  layers: [
    {
      id: "symbol",
      type: "text",
      value: "{{symbol}}",
      style: { size: "subhead", font: "display", weight: "black", color: "accent", align: "left" },
      box: { x: 0, y: 2, anchor: "topLeft" },
      motion: { in: "fadeUp", at: 0 },
    },
    {
      id: "note",
      type: "text",
      value: "{{note}}",
      style: { size: "caption", font: "body", weight: "medium", color: "textSecondary", align: "left" },
      box: { x: 0, y: 10, anchor: "topLeft" },
      motion: { in: "fadeUp", at: 0.15 },
    },
    {
      id: "plot",
      type: "chart",
      kind: "candles",
      data: "{{bars}}",
      annotations: "{{marks}}",
      futureBars: 6,
      decimals: 4,
      drawSeconds: 1.8,
      box: { x: 50, y: 58, w: 100, h: 66, anchor: "center" },
      motion: { in: "none", at: 0.3 },
    },
  ],
};

export const exampleChartTemplate: TemplateFile = templateFileSchema.parse(chartRaw);
export const exampleChartJson = JSON.stringify(chartRaw, null, 2);

/*
  A third example: an indicator.

  This one exists because of a specific failure. `overlays` and `shadeBetween`
  were documented in prose with no example using them, and a MACD request came
  back as four text layers stacked on top of each other — the model had a
  paragraph describing a feature and not one instance of it to copy. A written
  description of a capability is not the same as a demonstration of it, and for
  anything with several interlocking parts the demonstration is what lands.

  Everything intricate about the format is here in one object: two computed
  overlays with staggered starts, a shaded band indexed into them, the price
  pushed back so the lines are the subject, and legends that arrive with the
  line they name.

  The bars are a token twelve. The point of the example is the WIRING, and a
  hundred rows of prices in a prompt buys nothing but tokens — the person using
  it fetches or pastes their own the moment it loads.
*/
const macdRaw = {
  version: 1,
  id: "macd-gap",
  title: "MACD Gap",
  description: "Two moving averages over grey price, with the gap between them shaded.",
  tags: ["macd", "indicator", "chart"],
  seconds: 10,

  fields: [
    { key: "fastLabel", type: "text", label: "Fast line label", default: "12 candles — turns fast" },
    { key: "slowLabel", type: "text", label: "Slow line label", default: "26 candles — turns late" },
    { key: "note", type: "text", label: "Caption", default: "THE SHADED GAP IS THE INDICATOR" },
    {
      key: "bars",
      type: "bars",
      label: "Price data",
      help: "Fetch it, or paste columns from a spreadsheet",
      default: [
        { open: 100, high: 102.5, low: 99, close: 101.5 },
        { open: 101.5, high: 104, low: 101, close: 103.8 },
        { open: 103.8, high: 105.2, low: 102.7, close: 104.5 },
        { open: 104.5, high: 104.8, low: 100.9, close: 101.2 },
        { open: 101.2, high: 101.9, low: 98.5, close: 99.1 },
        { open: 99.1, high: 100, low: 97.2, close: 98.3 },
        { open: 98.3, high: 99.5, low: 95, close: 96.2 },
        { open: 96.2, high: 100.8, low: 95.8, close: 100.1 },
        { open: 100.1, high: 103.4, low: 99.7, close: 102.9 },
        { open: 102.9, high: 104.1, low: 100.2, close: 100.8 },
        { open: 100.8, high: 101.3, low: 96.4, close: 97.1 },
        { open: 97.1, high: 102.2, low: 96.9, close: 101.8 },
      ],
    },
  ],

  layers: [
    {
      id: "plot",
      type: "chart",
      kind: "candles",
      data: "{{bars}}",
      futureBars: 2,
      decimals: 2,
      drawSeconds: 1.4,
      // Grey price and a hard dim, because this chart is about the lines.
      candleStyle: "grayscale",
      dimPriceTo: 0.32,
      overlays: [
        { kind: "ema", period: 12, color: "#388BFD", at: 1.5, drawSeconds: 1.8, width: 3 },
        { kind: "ema", period: 26, color: "#DB6D28", at: 3.5, drawSeconds: 1.8, width: 3 },
      ],
      // Indexes into `overlays` above — 0 is the fast line, 1 is the slow one.
      shadeBetween: { a: 0, b: 1, above: "#388BFD", below: "#DB6D28", opacity: 0.36, at: 5.6 },
      box: { x: 50, y: 46, w: 100, h: 62, anchor: "center" },
      motion: { in: "none", at: 0, out: false },
    },
    {
      id: "fast",
      type: "text",
      value: "{{fastLabel}}",
      style: { size: "caption", font: "body", weight: "semibold", color: "#388BFD", align: "right" },
      box: { x: 100, y: 6, anchor: "topRight" },
      // Arrives with the line it names, not before it.
      motion: { in: "fadeUp", at: 2.2, out: false },
    },
    {
      id: "slow",
      type: "text",
      value: "{{slowLabel}}",
      style: { size: "caption", font: "body", weight: "semibold", color: "#DB6D28", align: "right" },
      box: { x: 100, y: 13, anchor: "topRight" },
      motion: { in: "fadeUp", at: 4.2, out: false },
    },
    {
      id: "note",
      type: "text",
      value: "{{note}}",
      style: {
        size: "label",
        font: "body",
        weight: "bold",
        color: "#F0B72F",
        align: "right",
        letterSpacing: 0.04,
      },
      box: { x: 100, y: 84, anchor: "bottomRight" },
      motion: { in: "fadeUp", at: 6.4, out: false },
    },
  ],
};

export const exampleMacdTemplate: TemplateFile = templateFileSchema.parse(macdRaw);
export const exampleMacdJson = JSON.stringify(macdRaw, null, 2);
