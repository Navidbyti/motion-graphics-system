# Adding a template

A template is one animated graphic — a chart, a title, a lower third. Adding one
means writing three things and registering them. The app builds the entire
editing panel from your schema, so there is no UI to write.

If you are handing this to an AI: press **Copy for AI** at the top, paste the
whole thing into the chat, and ask for the template you want. The contract at the
end is what keeps the result consistent with the rest of the library.

---

## Where things live

```
engine/src/templates/<Name>/
  schema.ts      the fields the editor sees, and the defaults
  <Name>.tsx     the React component that draws it
engine/src/registry.ts    one entry that makes it appear in the Library
```

Nothing else needs touching. No routing, no form code, no thumbnail generation.

---

## The three exports

**1. A Zod schema.** This *is* the editing UI. Every field becomes a control, and
its `.describe()` becomes the label the editor reads — so write descriptions for
a person who has never seen the code.

```ts
// engine/src/templates/StatCard/schema.ts
import { z } from "zod";
import { headline, subline, withCommon } from "../fields";

export const statCardSchema = withCommon({
  value: z.string().max(12).describe("The number, e.g. 4.2M"),
  caption: subline("Line under the number"),
  holdSeconds: z
    .number()
    .min(0.5)
    .max(8)
    .describe("How long it stays on screen"),
});

export type StatCardProps = z.infer<typeof statCardSchema>;

export const statCardDefaults: StatCardProps = {
  brand: "cashForChat",
  value: "4.2M",
  caption: "nights booked",
  holdSeconds: 2,
  scale: 1,
  direction: "auto",
  speed: 1,
};

/** Duration follows the content, so the composition is never too short. */
export const statCardSeconds = (holdSeconds: number, speed: number) =>
  (0.4 + holdSeconds + 0.5) / speed;
```

`withCommon()` adds brand, theme, scale, direction and speed — the fields every
template carries. Never redeclare them.

**2. The component.** It receives exactly the schema's type.

```tsx
// engine/src/templates/StatCard/StatCard.tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../../brand/useTheme";
import { type, weight } from "../../brand/tokens";
import { useLayout } from "../../layout";
import { exit, fadeUp } from "../../motion";
import type { StatCardProps } from "./schema";

export const StatCard: React.FC<StatCardProps> = ({
  brand, theme, value, caption, holdSeconds, scale, direction, speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // px() scales by the SHORTER side. Never write the scaling maths yourself.
  // Passing `text` lets direction: "auto" detect Persian and Arabic.
  const { px, dir, textStart } = useLayout({ scale, direction, text: caption });

  const b = useTheme(brand, theme);
  const { palette, font } = b;

  const out = exit({ frame, fps, durationInFrames });

  return (
    <AbsoluteFill style={{ opacity: out, direction: dir, justifyContent: "center", padding: px(110) }}>
      <div style={{ textAlign: textStart, ...fadeUp({ frame, fps, spring: b.motion.entrance }) }}>
        <div style={{ fontFamily: font.display, fontSize: px(type.hero), fontWeight: weight.black, color: palette.primary }}>
          {value}
        </div>
        <div style={{ fontFamily: font.body, fontSize: px(type.support), color: palette.textSecondary }}>
          {caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

**3. A registry entry.**

```ts
// engine/src/registry.ts
{
  id: "statCard",
  title: "Stat Card",
  blurb: "A single number with a caption. Fades up and holds.",
  tags: ["data", "text"],
  component: StatCard,
  schema: statCardSchema,
  defaults: statCardDefaults,
  durationInFrames: (props, fps) =>
    Math.round(statCardSeconds(props.holdSeconds, props.speed) * fps),
}
```

That is the whole job. The Library card, the props panel, the preview, the
thumbnail and the export all follow.

---

## Testing it

```bash
npm run dev -w app
```

The template appears in the Library immediately. Check it in all three formats
(vertical, square, landscape) and with each brand — a template that only works
in one is not finished.

To check it as a real frame rather than in the browser preview:

```bash
cd engine && npx remotion still src/index.ts StatCard-Vertical out.png --frame=40
```

Overlays export with a transparent background, so view exports over real footage
before trusting them. Use the backdrop picker above the preview for this.

---

## Getting it to the editor

Templates are compiled into the app, so shipping a template means shipping a
release. Bump the version, publish, and **promote the release out of draft** —
`electron-builder` publishes drafts by default and the updater cannot see them.
See `RELEASING.md`.

---

## Things that will bite you

These are not style preferences. Each one shipped a visible bug.

- **Scale by the shorter side, not the width.** Scaling type by composition width
  is correct within one aspect ratio and 1.8× too large in landscape. `useLayout`
  already does this; just use its `px()`.
- **A radius token is not a radius.** `radius.sm` on a 6px-wide candle turns it
  into a pill. Cap corner radius relative to the element's own width.
- **`.describe()` on `zColor()` destroys the colour picker.** Label those fields
  from the registry's `labels` map instead.
- **`interpolate` throws on a zero-length range.** Any duration derived from text
  becomes zero when the text is empty. Clamp it.
- **Flex runs left-to-right regardless of the text inside it.** Set
  `direction: dir` on any container that splits text into per-word elements, or
  Persian renders in reverse word order.
- **`backdrop-filter` does nothing in a transparent export.** There is no footage
  behind the graphic at render time. Build the look from fills, borders and
  shadows; treat the blur as a bonus for the preview.
- **Export settings belong to the preset, not the template.** Putting a codec in
  `calculateMetadata` makes every other output format impossible.

---

The full contract follows. It is the checklist a template must satisfy to enter
the registry.
