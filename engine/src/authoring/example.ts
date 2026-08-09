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
