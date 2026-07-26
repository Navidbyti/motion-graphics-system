# Template Contract

Every template in this library must satisfy this document. It has two audiences:

1. **Anyone authoring a template** (Rumi + Claude Code) — this is the checklist.
2. **The prompt→props model** — this file is fed to Gemini as context so it fills
   props correctly instead of inventing them.

A template that violates any **MUST** does not enter the registry. The `check`
gate enforces the mechanical ones; the rest are review items.

---

## 1. Structure

A template lives in `src/templates/<Name>/` and exports exactly three things:

```ts
export const <name>Schema = z.object({ ... });        // Zod schema — drives the GUI
export const <Name>: React.FC<z.infer<typeof <name>Schema>>;
export const <name>Defaults: z.infer<typeof <name>Schema>;  // renders standalone
```

- **MUST** export a Zod schema. The app generates its entire editing UI from it —
  no schema means no GUI, and the template is unusable by the editor.
- **MUST** export defaults that render a complete, presentable result with no
  other input. A new template's thumbnail is generated from its defaults, and the
  editor's first impression is that frame.
- **MUST NOT** read from the network at render time. All assets come from props or
  `public/`. A render that depends on a live URL will fail silently in a batch.

## 2. Schema rules

The schema *is* the editing UI, so it must be written for a non-technical reader.

- **MUST** compose from `templates/fields.ts` wherever a shared field exists —
  `headline()`, `subline()`, `label()`, `color()`, `currency()`, `toggle()`,
  `speed()` — and build the object with `withCommon()`. Only genuinely unique
  data (a candle array, an amenity list) gets a bespoke field.
  This is not about saving typing. Without a shared vocabulary, one template
  calls it `title`, another `headline`, another `heading` — each with a
  different length cap and a differently-worded label — and the editor has to
  relearn the panel for every template. Retrofitting that across eight
  templates is far more expensive than composing correctly now.

- **MUST** give every field a `.describe()` — **except colour fields**. That text
  becomes the GUI label and the model's only clue about intent. Write
  `"Headline shown at the top"`, not `"title"`.
- **MUST** use `zColor()` from `@remotion/zod-types` for colours, so the GUI shows
  a colour picker rather than a text box expecting a hex string.
- **MUST NOT** call `.describe()` on a `zColor()` field. `zColor()` stores its own
  marker (`__remotion-color`) in the description slot, so describing it
  overwrites the marker and silently downgrades the picker to a text box — in our
  app *and* in Remotion Studio. Label colours via the registry entry's `labels`
  map instead. *(These two rules conflicted in the first draft of this spec;
  caught in Phase 3.)*
- **MUST** constrain numbers with `.min()` / `.max()`. This is what makes
  prompt→props safe: an out-of-range value is rejected by validation rather than
  producing a broken frame.
- **SHOULD** default every field. A field the editor never touches should still
  look right.
- **SHOULD** prefer enums over free text for anything with fixed options
  (`z.enum(["bull", "bear"])`), so the GUI renders a dropdown and the model cannot
  invent a value.

## 3. Layout

Follows the official Remotion video-layout guidance. The rules that bite most:

- **MUST** keep key content inside the safe area from `brand/tokens.ts`. For
  vertical social, respect `safe.socialBottom` — the lower third is covered by
  platform UI.
- **MUST** lay out readable content with flex/grid and `gap`. Absolute positioning
  is for backgrounds, glows and decoration only.
- **MUST** size type from the `type` scale, scaled against the **shorter side** of
  the frame: `n * Math.min(width, height) / 1080`. Never hardcode a font size.
  *Not* `scaleToWidth()` — that scales by width, which is right when comparing
  frames of the same aspect but fails badly across aspects. A 1920×1080 landscape
  frame is no physically larger than a 1080×1920 vertical one, so width-scaling
  made landscape type 1.8× too big and swallowed the chart. *(Caught in Phase 2.)*
- **MUST** size an element's corner radius relative to **that element**, not the
  frame. `radius.sm` is wider than a candle body in landscape, which rounds the
  bodies into pills and turns wicks into horizontal blobs — the chart stops
  reading as candles at all. Cap it: `Math.min(px(radius.sm), elementWidth / 3)`.
- **MUST NOT** let decoration collide with content. Absolutely positioned
  decoration doesn't participate in flex layout, so its overhang must be added to
  the container's `gap` explicitly. *(This is a real bug caught in Phase 1.)*
- **MUST** assume user text wraps. Reserve vertical room rather than packing an
  element directly beneath a headline.

## 4. Transparency — the overlay rule

Templates are dropped over unknown footage on a Premiere timeline.

- **MUST** remain legible over both light and dark backgrounds. White text on
  transparency disappears over bright footage — this was found in Phase 1 and is
  invisible while previewing on a dark background.
- Satisfy it with a backing shape, a shadow, or a brand colour that reads on both.
  Check against the app's light/dark/checkerboard preview toggle before shipping.
- **MUST NOT** paint a full-frame opaque background unless the template is
  explicitly a full-frame format.

## 5. Motion

All motion comes from `src/motion/`. This is what makes the library feel like one
system rather than a pile of separate videos.

- **MUST** use `SPRING` presets and `EASE` curves. A raw spring config or inline
  bezier in a template is a review failure — if a new feel is genuinely needed, add
  it to the motion language so everything can use it.
- **MUST** express timing in seconds via `sec()`, never raw frame counts. Frame
  counts silently break at a different fps.
- **MUST NOT** scale from 0. Entrances start at 0.9–0.97; nothing in the real
  world appears from nothing.
- **MUST** use `tabular` on any element showing changing digits. Proportional
  figures jitter horizontally as they count — the most common tell of an amateur
  price counter.
- **SHOULD** stagger group entrances rather than firing them together.
- **SHOULD** give exits less time than entrances. The viewer has already read it.

## 6. Duration & formats

- **MUST** derive `durationInFrames` from content via `calculateMetadata`. A
  template with 4 candles and one with 40 cannot share a fixed length.
- **MUST** render correctly at all three formats in `brand/tokens.ts`
  (vertical / square / landscape). Test all three — a layout tuned only for
  vertical will break.
- **MUST NOT** put codec or ProRes settings in a production template's
  `calculateMetadata`. Baking in `defaultProResProfile` makes the composition
  impossible to render as anything else — `--codec=h264` hard-errors, which
  breaks the cheap previews and thumbnails the app generates constantly. Export
  settings belong to the **preset** (`OVERLAY_RENDER_SETTINGS` in `Root.tsx`),
  read by both the npm scripts and the app. *(Caught in Phase 2.)*

## 7. Brand

There are **three brands** — Cash for Chat, Billionaire Signal, Free Hotel Card —
and every template must render correctly as any of them.

- **MUST** take `brand` as a prop (it comes free via `withCommon`) and resolve it
  with `getBrand()`. Brand is data, not a composition variant: as a composition
  dimension it would mean 3 formats × 3 brands = 9 compositions per template.
- **MUST** draw colour and type from the resolved brand's `palette` and `font`,
  never from `tokens.ts`. `tokens.ts` now holds only *structure* — type scale,
  spacing, radius, safe areas — which is shared across brands deliberately: the
  brands differ in look, not in how a vertical video is laid out.
- **MUST** give the brand's `primary`/`accent` visible presence. A template that
  only uses semantic colours (up/down, positive/negative) renders almost
  identically in all three brands, which defeats the point. *(Caught in Phase 5:
  the candle chart initially looked the same in every brand.)*
- **SHOULD** take entrance and emphasis springs from `brand.motion` rather than
  naming a spring directly. Billionaire Signal must not bounce — springiness
  reads as cheap where authority is the product — while Cash for Chat should.
- **MUST NOT** contain a literal hex colour, font stack, or pixel margin.
- **MUST** use `space` and `radius` tokens rather than arbitrary numbers, so
  separate templates visually align.

---

## Author checklist

Before a template enters the registry:

- [ ] `npx tsc --noEmit` clean
- [ ] Renders standalone from its defaults
- [ ] Renders at vertical, square and landscape
- [ ] Inspected a settled frame: one clear focal point, nothing touching
- [ ] Checked over both a white and a dark backdrop
- [ ] No hardcoded colours, fonts, sizes, or frame counts
- [ ] Every schema field has a `.describe()`
- [ ] Duration responds to content length
