# Motion Graphics System

Reusable [Remotion](https://remotion.dev) motion graphics templates with a GUI, so a
video editor can produce on-brand animated overlays without touching code.

Built for three brands — **Cash for Chat**, **Billionaire Signal**, **Free Hotel
Card** — from one template library. Brand is a dropdown, not a fork.

## What it does

- **Library** of parameterised templates, each with a live preview
- **Props form generated from the template's schema** — a new template gets its
  entire editing UI for free
- **Export to ProRes 4444 with alpha**, straight onto a Premiere timeline

## Layout

```
engine/          Remotion project — templates, brand system, motion language
  src/brand/       tokens (structure) + brands (identity)
  src/motion/      shared springs, easings, stagger — the house feel
  src/templates/   one folder per template
  src/registry.ts  the single index; one entry per template
app/             Vite + React UI and the render server
```

## Running it

```bash
npm install
cp .env.example .env    # optional
npm run app             # UI on :5188, render server on :3131
```

`npm run studio` opens Remotion Studio instead, for template development.

## Adding a template

Two files and one line:

```
engine/src/templates/YourTemplate/
  schema.ts        fields, defaults, duration
  YourTemplate.tsx the component
engine/src/registry.ts   one entry
```

The Library card, props form, brand dropdown, format switcher, thumbnail and
export presets all derive from the schema. No app changes needed.

See [`engine/TEMPLATE_SPEC.md`](engine/TEMPLATE_SPEC.md) for the contract every
template must satisfy.

## Notes

- Rendering runs locally on the editor's machine. No server, no cloud costs.
- Remotion downloads its own Chrome on first render; where that's geo-blocked the
  app falls back to an installed Chrome or Edge automatically.
- Remotion is free for teams of up to 3; larger companies need a licence.
