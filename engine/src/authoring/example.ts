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
