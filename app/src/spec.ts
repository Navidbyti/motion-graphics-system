/**
 * The instructions the AI reads.
 *
 * Assembled from the real schema rather than written out by hand. A spec that
 * is maintained separately from the code it describes is wrong the first time
 * either changes, and a wrong spec is worse than none: every template written
 * from it fails the same way, and the person pasting has no reason to suspect
 * the instructions rather than themselves.
 *
 * So the vocabularies below — colours, sizes, entrances, anchors — are imported
 * from the format, and the worked example is the same object the app renders as
 * its default. If a name is removed from the format, it disappears from here
 * with it. If the example stops being valid, the build fails.
 *
 * Written as instructions to a model, in short declarative sentences. Prose it
 * has to interpret is prose it can interpret wrongly.
 */

import {
  ANCHORS,
  COLOR_TOKENS,
  ENTRANCES,
  FONT_ROLES,
  RADIUS_STEPS,
  TEMPLATE_FORMAT_VERSION,
  TYPE_SIZES,
  WEIGHTS,
} from "@engine/authoring/format";
import {
  exampleChartJson,
  exampleMacdJson,
  exampleTemplateJson,
} from "@engine/authoring/example";

const list = (values: readonly string[]) => values.map((v) => `\`${v}\``).join(", ");

export const specForAI = () => `
# Build a motion-graphics template

You are writing a template for a video overlay tool. Reply with **one JSON
object and nothing else** — no explanation, no notes after it. Code fences are
fine.

This is data, not code. There is no JavaScript, no expressions, no maths. You
describe what appears and when; the app decides how it moves.

## What you cannot do — read this before you plan anything

**You cannot calculate.** There is no way to write an average, a sum, a
percentage, a difference, or anything derived from the data. If a graphic needs
a computed value, it can only come from a feature listed in this document.

This matters most for charts. A moving average, a MACD, an RSI — you cannot
build these out of text and shapes. **Use the \`overlays\` feature on a chart
layer** (documented below); it computes them properly.

**You cannot animate one layer in response to another.** Timings are absolute
seconds, not "after the blue line finishes". Stagger the \`at\` values to get
that reading.

**You CAN move things along a path** — see \`keyframes\` and \`repeat\` below.
Falling objects, containers filling, things flying in and landing are all
possible. Do not refuse those.

**You cannot invent a data source.** Data comes from a field the user fills,
fetches or pastes.

If what the user asked for genuinely needs something not in this document,
reply with **exactly this and nothing else** — no version, no id, no layers:

\`\`\`json
{ "unsupported": "One sentence saying what it cannot do." }
\`\`\`

Do not approximate it with text layers. A stack of labels where a graphic was
asked for is worse than an honest "this format cannot do that yet."

## The object

\`\`\`
{
  "version": ${TEMPLATE_FORMAT_VERSION},
  "id": "lowercase-hyphenated",      // 3-40 chars, letters digits hyphens
  "title": "Short Name",             // shown on the library card
  "description": "One line about what it is for.",
  "tags": ["up to", "six"],
  "seconds": 5,                      // how long the graphic runs, 0.5-120
  "fields": [ ... ],                 // what the user can change
  "layers": [ ... ]                  // what is drawn, back to front
}
\`\`\`

## fields — the form the user gets

Every field has \`key\`, \`label\`, an optional \`help\`, and a \`type\`:

- \`text\` — \`default\`, optional \`maxLength\`, optional \`multiline\`
- \`number\` — \`default\`, optional \`min\` \`max\` \`step\` \`int\`
- \`toggle\` — \`default\` true/false
- \`color\` — optional \`default\`; **omit it so the colour follows the brand**
- \`choice\` — \`options\`: [{ "value", "label" }], and a \`default\` that is one of them
- \`image\` — the user supplies the picture; you cannot ship one
- \`bars\` — candles (open/high/low/close). Ship 8–12 rows as a sample, or **40+
  if anything uses a \`macd\` layer or a long \`overlays\` period**; the user
  fetches real prices or pastes them from a spreadsheet
- \`series\` — labelled values for a line chart: [{ "label", "value" }]
- \`annotations\` — zones, levels and trendlines the user draws. No \`default\`;
  it always starts empty

\`key\` must be a plain identifier: letters, digits, underscores.

Put every piece of text a user might reasonably want to change in a field. A
template with the words baked into the layers is one nobody can reuse.

## layers — what is drawn

Drawn in array order. **Later layers sit on top**, so backgrounds come first.

Every layer has \`id\`, \`type\`, and optionally \`box\`, \`motion\`, \`opacity\`.

### box — where it sits
\`\`\`
"box": { "x": 50, "y": 40, "w": 80, "anchor": "center", "safe": true }
\`\`\`
- \`x\` \`y\` are percentages of the frame. 0,0 is top-left. 50,50 is the middle.
- \`w\` \`h\` are percentages too. **Leave them out to size to the content** —
  do that for text unless you need it to wrap at a specific width.
- \`anchor\` is which part of the layer sits at (x, y): ${list(ANCHORS)}
- \`safe\` keeps it clear of the platform's own buttons and captions. Leave it
  true unless the layer is a full-bleed background.
- \`rotate\` in degrees, -45 to 45. Small angles only.

### motion — when it arrives
\`\`\`
"motion": { "in": "fadeUp", "at": 0.4, "out": true }
\`\`\`
- \`in\`: ${list(ENTRANCES)}
- \`at\`: seconds from the start. **Must be less than \`seconds\`.**
- \`out\`: fade away at the end. Usually true.
- \`until\`: seconds, if the layer should leave early.
- \`stagger\`: seconds between words, for \`typewriter\`.

Stagger the \`at\` values. Everything arriving at once looks like a slide, not
a graphic. 0.15–0.3s between related items is a good default.

### keyframes — moving a layer over time

Any layer can carry \`keyframes\` instead of an entrance. Two or more, in order.

\`\`\`
"keyframes": [
  { "at": 0,    "y": -40, "scale": 0.7, "opacity": 0, "ease": "out" },
  { "at": 0.15, "y": -34, "scale": 1,   "opacity": 1, "ease": "out" },
  { "at": 0.8,  "y": 10,  "rotate": 15, "ease": "in" },
  { "at": 1,    "y": 14,  "scale": 0.5, "opacity": 0 }
]
\`\`\`
- \`at\` is seconds from **this layer's own start** (its \`motion.at\`), not from
  the start of the graphic.
- \`x\` \`y\` are percentages of the frame, **added to** where \`box\` put it.
- \`scale\`, \`rotate\` (degrees), \`opacity\`.
- \`fill\` is 0–1 and reveals the layer from the **bottom up** — this is how a
  bucket fills, a bar loads, a glass pours. It clips rather than stretches.
- \`ease\`: \`linear\`, \`in\`, \`out\`, \`inOut\` — how THIS keyframe is approached.
- Set \`"motion": { "in": "none", "at": <when it starts> }\` on a keyframed layer.

### repeat — many copies of one layer

\`\`\`
"repeat": { "count": 10, "every": 0.28, "spreadX": 14, "spreadY": 0 }
\`\`\`
Ten coins falling is ONE layer repeated, never ten layers. Each copy starts
\`every\` seconds after the last and runs its own keyframes from its own start.
\`spreadX\`/\`spreadY\` scatter the copies by that many percent of the frame,
deterministically.

### type: "text"
\`\`\`
{ "id": "headline", "type": "text", "value": "{{headline}}",
  "style": { "size": "headline", "font": "display", "weight": "bold",
             "color": "textPrimary", "align": "center" } }
\`\`\`
- \`value\` is literal text with \`{{fieldKey}}\` substituted in. You may mix:
  \`"{{currency}}{{price}}"\`. **Every \`{{name}}\` must match a field you declared.**
- \`size\`: ${list(TYPE_SIZES)} — or a number if you must
- \`font\`: ${list(FONT_ROLES)} — use \`numeric\` for anything with digits that change
- \`weight\`: ${list(WEIGHTS)}
- \`align\`, \`lineHeight\` (multiplier), \`letterSpacing\` (em), \`transform\`
  (\`none\`/\`uppercase\`/\`lowercase\`)
- Leave \`direction\` alone. It is detected from the text, which is what makes
  Persian and Arabic render the right way round.

### type: "shape"
\`\`\`
{ "id": "card", "type": "shape", "shape": "rect", "fill": "surface",
  "radius": "lg", "shadow": true, "box": { "w": 86, "h": 40 } }
\`\`\`
- \`shape\`: \`rect\`, \`ellipse\`, \`line\`
- \`fill\`, \`stroke\`, \`strokeWidth\`, \`fillOpacity\`
- \`radius\`: ${list(RADIUS_STEPS)}

### type: "image"
\`\`\`
{ "id": "photo", "type": "image", "src": "{{photo}}", "fit": "cover" }
\`\`\`

### type: "logo"
Draws the brand's logo. Nothing to configure.

### type: "chart"
\`\`\`
{ "id": "plot", "type": "chart", "kind": "candles",
  "data": "{{bars}}", "annotations": "{{marks}}",
  "futureBars": 6, "decimals": 4, "drawSeconds": 1.8,
  "box": { "x": 50, "y": 58, "w": 100, "h": 66, "anchor": "center" },
  "motion": { "in": "none", "at": 0.3 } }
\`\`\`
- \`kind\`: \`candles\` needs a \`bars\` field; \`line\` needs a \`series\` field.
- \`data\` points at that field. **The prices are never in the template** — a
  chart with data baked in is a picture of one moment.
- \`annotations\` points at an \`annotations\` field. Include one on any chart
  someone might want to mark up: it is what gives the user zones, levels,
  trendlines and the drag handles to place them.
- \`futureBars\` keeps empty slots clear at the right. Use 4–8 so the last
  candle is not jammed against the edge.
- \`decimals\` is how many places any printed price shows. Four for forex, two
  for most things.
- **A chart must have both \`w\` and \`h\`** — it cannot size to its contents.
- Use \`"in": "none"\` or \`"in": "draw"\` — the chart has its own draw-in, and a
  layer entrance on top of it fights the reveal.
- \`"reveal": "grow"\` builds it **candle by candle** — each candle grows in as
  the sweep reaches it. \`"wipe"\` (the default) uncovers finished candles behind
  a moving edge. Use \`grow\` whenever someone asks for a smooth or
  candle-by-candle build. The \`macd\` layer takes the same option, where it
  raises each histogram bar out of the zero line left to right.

### type: "macd"
The lower panel every charting app has: the MACD line, the signal line, and the
histogram between them.
\`\`\`
{ "id": "macd", "type": "macd", "data": "{{bars}}",
  "fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9,
  "showHistogram": true, "drawSeconds": 1.6,
  "box": { "x": 50, "y": 82, "w": 100, "h": 26, "anchor": "center" },
  "motion": { "in": "none", "at": 2.5 } }
\`\`\`
- Point \`data\` at the **same** \`bars\` field the chart above uses.
- **Ship at least 40 sample bars on that field.** A 26-period slow EMA needs
  26 candles before it means anything, so a 15-row sample draws a flat,
  useless panel. The user replaces the data, but your sample is what they
  judge the template by.
- Needs \`w\` and \`h\`, like any chart.
- The panel is scaled around zero and draws its own zero line.
- **Use this whenever someone says "MACD", "histogram" or "indicator panel".**
  Two averages shaded on the price chart is a different graphic, not a
  substitute — if they ask for both, use both.

#### Overlays — moving averages, computed for you

This is how you get a MACD, an EMA crossover, or any average. **You never
calculate the values**; you name the indicator and the app computes it.

\`\`\`
"candleStyle": "grayscale",
"dimPriceTo": 0.35,
"overlays": [
  { "kind": "ema", "period": 12, "color": "#388BFD", "at": 0.5, "drawSeconds": 1.6 },
  { "kind": "ema", "period": 26, "color": "#DB6D28", "at": 2.2, "drawSeconds": 1.6 }
],
"shadeBetween": { "a": 0, "b": 1, "above": "#388BFD", "below": "#DB6D28",
                  "opacity": 0.34, "at": 4.0 }
\`\`\`

- \`kind\`: \`ema\` or \`sma\`. \`period\` is candles — 12 and 26 are the MACD pair.
- \`at\` and \`drawSeconds\` are per overlay, so one line can finish before the
  next starts. That sequencing is the explainer.
- \`shadeBetween\` fills the gap between two overlays **by index into the
  \`overlays\` array**, and flips colour wherever they cross. The band is the
  indicator — this is what a MACD histogram is showing, drawn where it happened.
- \`candleStyle: "grayscale"\` and \`dimPriceTo\` push the price back so the lines
  are the subject. Use both on any chart that is about an indicator rather than
  about the price.

## Colours

Name a role, never a hex code:

${list(COLOR_TOKENS)}

The app resolves these per brand, which is what lets the same template work for
every brand the user has. A hardcoded colour looks wrong the moment the brand
changes. You may write \`"{{someColorField}}"\` to let the user pick.

Only \`accent\` and \`primary\` are identity colours — use them for the one thing
that matters most in the graphic, not for everything.

## Rules that will get your template rejected

1. Every \`{{reference}}\` must match a declared field key.
2. No layer may start at or after \`seconds\`.
3. \`id\` values must be unique — both field keys and layer ids.
4. A \`choice\` field's \`default\` must be one of its own options.
5. No colours outside the list above, except a user field or a literal hex.

## Making it good, not just valid

- **One thing should be biggest.** A graphic with three items at \`headline\`
  size has no subject.
- **Give text room.** Long copy at \`hero\` size overflows. \`hero\` is for two or
  three words.
- **Backgrounds first.** A card behind text is a shape layer earlier in the array.
- **It must work in three shapes** — 9:16, 1:1 and 16:9. Percentages and anchors
  do that for you; fixed pixel sizes do not.
- **Assume the words change.** The user will type something longer than your
  example.

## A complete example

\`\`\`json
${exampleTemplateJson}
\`\`\`

## Which feature does what they asked for?

Find the request in the left column before you start writing. Most bad
templates come from reaching for text layers when a real feature exists.

| They asked for | Use |
| --- | --- |
| A moving average, EMA, SMA | \`overlays\` on a chart layer |
| A MACD panel, histogram, signal line | a \`macd\` layer below the chart |
| "The gap between the two averages", shaded | two \`overlays\` + \`shadeBetween\` |
| Support, resistance, a zone, a trendline | an \`annotations\` field on the chart |
| A price chart at all | a \`bars\` field + a \`chart\` layer |
| A line/trend of plain values | a \`series\` field + \`"kind": "line"\` |
| A number that counts up | a \`text\` layer — the user types the final value |
| Anything computed that is not in this table | say it is not supported. Do not fake it. |

## A chart example

Three pieces have to line up: a \`bars\` field, a \`chart\` layer pointing at it,
and an \`annotations\` field if the user should be able to mark it up.

\`\`\`json
${exampleChartJson}
\`\`\`

## An indicator example — MACD

This is the pattern for **any** chart whose subject is a computed line rather
than the price. Note four things and reuse all of them:

1. \`overlays\` compute the averages. You never write the maths.
2. Each overlay has its own \`at\`, so the fast line finishes before the slow one
   starts. That sequencing is the explanation.
3. \`shadeBetween\` indexes into \`overlays\` by position — \`0\` is the first.
4. \`candleStyle: "grayscale"\` with \`dimPriceTo\` pushes the price back, and each
   legend arrives with the line it names.

Swap the periods, colours and copy for what the user asked for. Keep the shape.

\`\`\`json
${exampleMacdJson}
\`\`\`

---

Now write a template for what the user describes below. Reply with the JSON
object only.
`.trim();
