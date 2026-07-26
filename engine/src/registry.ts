/**
 * TEMPLATE REGISTRY — the single index of the library.
 *
 * One entry per template. Everything downstream reads from here:
 *   - Root.tsx generates a <Composition> per entry × format
 *   - the app's Library grid renders a card per entry
 *   - the props form is generated from the entry's schema
 *   - prompt→props is constrained by that same schema
 *
 * Adding a template means adding one entry. If a template is not in this file,
 * it does not exist as far as the editor is concerned.
 */

import type { z } from "zod";
import { CandleChart } from "./templates/CandleChart/CandleChart";
import { EndCard } from "./templates/EndCard/EndCard";
import { endCardDefaults, endCardSchema, endCardSeconds } from "./templates/EndCard/schema";
import { TextCard } from "./templates/TextCard/TextCard";
import { textCardDefaults, textCardSchema, textCardSeconds } from "./templates/TextCard/schema";
import { PriceZone } from "./templates/PriceZone/PriceZone";
import { priceZoneDefaults, priceZoneSchema, priceZoneSeconds } from "./templates/PriceZone/schema";
import { LineChart } from "./templates/LineChart/LineChart";
import { lineChartDefaults, lineChartSchema, lineChartSeconds } from "./templates/LineChart/schema";
import { HookTitle } from "./templates/HookTitle/HookTitle";
import {
  hookTitleDefaults,
  hookTitleSchema,
  hookTitleSeconds,
} from "./templates/HookTitle/schema";
import { LowerThird } from "./templates/LowerThird/LowerThird";
import {
  lowerThirdDefaults,
  lowerThirdSchema,
  lowerThirdSeconds,
} from "./templates/LowerThird/schema";
import {
  candleChartDefaults,
  candleChartSchema,
  candleChartSeconds,
} from "./templates/CandleChart/schema";

export const FORMATS = ["vertical", "square", "landscape"] as const;
export type FormatName = (typeof FORMATS)[number];

export type TemplateEntry<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  /** PascalCase. Forms the composition id, e.g. "CandleChart-Vertical". */
  id: string;
  /** Shown on the Library card. Written for the editor, not for a developer. */
  title: string;
  blurb: string;
  tags: string[];
  component: React.FC<z.infer<S>>;
  schema: S;
  defaults: z.infer<S>;
  formats: readonly FormatName[];
  /**
   * True if the template is designed to sit over footage. Overlay templates
   * default to the transparent ProRes preset and must stay legible on light and
   * dark backgrounds.
   */
  overlay: boolean;
  /** Duration derived from content, per the template contract. */
  durationInFrames: (props: z.infer<S>, fps: number) => number;
  /**
   * Human labels for fields whose schema can't carry one.
   *
   * Colour fields are the case that forces this: `zColor()` stores its own
   * marker in the description slot, so calling `.describe()` on one destroys the
   * marker and downgrades the picker to a text box. Anything not listed here
   * falls back to its `.describe()` text, then to a humanised field name.
   */
  labels?: Record<string, string>;
};

/** Preserves each template's own prop types at the definition site. */
export const defineTemplate = <S extends z.ZodTypeAny>(
  entry: TemplateEntry<S>,
): TemplateEntry<S> => entry;

/**
 * Erased entry type for the heterogeneous registry array.
 *
 * `TemplateEntry<S>` is invariant in S — the schema appears both covariantly
 * (`schema`, `defaults`) and contravariantly (`component`'s props), so entries
 * with different schemas can't share an array type. Templates stay fully typed
 * at their `defineTemplate` call; only the collection is loosened, and the app
 * consumes it dynamically anyway.
 */
export type AnyTemplateEntry = Omit<
  TemplateEntry,
  "component" | "schema" | "defaults" | "durationInFrames"
> & {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  component: React.FC<any>;
  schema: z.ZodTypeAny;
  defaults: any;
  durationInFrames: (props: any, fps: number) => number;
  /* eslint-enable @typescript-eslint/no-explicit-any */
};

export const compositionId = (id: string, format: FormatName) =>
  `${id}-${format.charAt(0).toUpperCase()}${format.slice(1)}`;

/* ------------------------------------------------------------------ */

const candleChart = defineTemplate({
  id: "CandleChart",
  title: "Market Chart",
  blurb: "Animated candlesticks with a live price readout and closing callout.",
  tags: ["data", "finance", "chart"],
  component: CandleChart,
  schema: candleChartSchema,
  defaults: candleChartDefaults,
  formats: FORMATS,
  overlay: true,
  durationInFrames: (props, fps) =>
    Math.round(candleChartSeconds(props.candles.length, props.speed) * fps),
});

const hookTitle = defineTemplate({
  id: "HookTitle",
  title: "Hook Title",
  blurb: "Opening statement card with word-by-word reveal and an accent word.",
  tags: ["title", "opening", "text"],
  component: HookTitle,
  schema: hookTitleSchema,
  defaults: hookTitleDefaults,
  formats: FORMATS,
  overlay: true,
  durationInFrames: (props, fps) =>
    Math.round(hookTitleSeconds(props.text, props.speed) * fps),
});

const lowerThird = defineTemplate({
  id: "LowerThird",
  title: "Lower Third",
  blurb: "Name and role tag with the brand rule. Slides in, holds, exits.",
  tags: ["title", "speaker", "text"],
  component: LowerThird,
  schema: lowerThirdSchema,
  defaults: lowerThirdDefaults,
  formats: FORMATS,
  overlay: true,
  durationInFrames: (props, fps) =>
    Math.round(lowerThirdSeconds(props.seconds, props.speed) * fps),
});

const endCard = defineTemplate({
  id: "EndCard",
  title: "End Card",
  blurb: "Closing frame with a call to action. Sizing and RTL aware.",
  tags: ["closing", "cta", "text"],
  component: EndCard,
  schema: endCardSchema,
  defaults: endCardDefaults,
  formats: FORMATS,
  overlay: true,
  durationInFrames: (props, fps) => Math.round(endCardSeconds(props.speed) * fps),
});

const lineChart = defineTemplate({
  id: "LineChart",
  title: "Line Chart",
  blurb: "A value over time. The line draws in and the dots land as it passes.",
  tags: ["data", "chart", "trend"],
  component: LineChart,
  schema: lineChartSchema,
  defaults: lineChartDefaults,
  formats: FORMATS,
  overlay: true,
  durationInFrames: (props, fps) => Math.round(lineChartSeconds(props.speed) * fps),
});

const priceZone = defineTemplate({
  id: "PriceZone",
  title: "Price Zone",
  blurb: "Dense price history with a highlighted band and labelled levels.",
  tags: ["data", "finance", "analysis"],
  component: PriceZone,
  schema: priceZoneSchema,
  defaults: priceZoneDefaults,
  formats: FORMATS,
  overlay: true,
  durationInFrames: (props, fps) => Math.round(priceZoneSeconds(props.speed) * fps),
});

const textCard = defineTemplate({
  id: "TextCard",
  title: "Text Card",
  blurb: "Any text, five ways in. Bubble, card, gradient or bare over footage.",
  tags: ["text", "title", "quote"],
  component: TextCard,
  schema: textCardSchema,
  defaults: textCardDefaults,
  formats: FORMATS,
  overlay: true,
  durationInFrames: (props, fps) =>
    Math.round(textCardSeconds(props.text, props.animation, props.holdSeconds, props.speed) * fps),
});

export const registry: AnyTemplateEntry[] = [
  hookTitle,
  textCard,
  lowerThird,
  endCard,
  lineChart,
  candleChart,
  priceZone,
];

export const findTemplate = (id: string) => registry.find((t) => t.id === id);
