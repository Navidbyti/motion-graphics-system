# Motion Graphics System — Action Plan

**Goal:** A desktop app that lets the editor produce top-tier, on-brand motion graphics
from a library of parameterized Remotion templates — prompt to fill data, GUI to fine-tune,
ProRes-with-alpha export straight onto his Premiere timeline. No terminal, no code,
no Claude access downstream.

**Division of labour**
- *Rumi + Claude Code:* author and sharpen templates. Batched, occasional.
- *Editor:* app only. Library → prompt/GUI → export. Daily.

---

## Tooling & skills

Installed for this build:

| Skill | Source | Why |
|---|---|---|
| `remotion-best-practices` | Remotion team (official, 444K installs) | Core idioms. Bundles captions, media probing, layout, interactivity references. |
| `remotion-render` | Remotion team (official) | Render pipeline, incl. `transparent-videos.md` — the Phase 1 alpha recipe. |
| `remotion-create` | Remotion team (official) | Project scaffolding and video layout conventions. |
| `animation-vocabulary` | Emil Kowalski (45K) | Reverse-lookup glossary for motion effects. Doubles as prompt vocabulary for the editor. |
| `review-animations` | Emil Kowalski (57K) | Critique standards — the Phase 2 iteration loop. |
| `improve-animations` | Emil Kowalski (29K) | Motion audit and roadmap across the library. |
| `dataviz` | Anthropic (already installed) | Chart design for the candle chart: palettes, axes, legends, stat tiles. |
| `artifact-design` | Anthropic (already installed) | UI fundamentals for the app shell. |

Deliberately skipped: Electron skills (all low-install, unknown authors — no quality signal)
and HeyGen's `hyperframes-*` (vendor-tied, pushes toward their platform).

**Transparent ProRes command** — the Phase 1 gate, straight from the official skill:

```bash
npx remotion render --image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444 MyComp out.mov
```

Better still, set it per-composition via `calculateMetadata` (`defaultCodec`,
`defaultPixelFormat`, `defaultProResProfile`) so the app's Overlay preset can't be
exported wrong.

Worth building later: a project-local skill encoding our own `TEMPLATE_SPEC.md`, so every
future template session starts from the same contract without re-explaining it.

---

## Where it runs

Everything on the editor's PC. No VPS, no server to maintain. Google Drive and the
Gemini API are the only external pieces.

| Piece | Where it lives |
|---|---|
| App (Electron) | Installed on his PC via `.exe`, taskbar icon |
| Templates | On his disk, synced from Google Drive |
| Rendering | His CPU, locally |
| Live preview | His machine, in the app window |
| Exports | Local watch folder → Premiere |
| Prompt → props | Gemini API — the only network call |
| Template delivery & requests | Google Drive shared folder |

**Google Drive layout** — one shared folder, mirrored (not streamed) so files exist as
real paths on disk:

```
Motion Graphics/
  templates/    ← Rumi writes, app reads.  New templates appear in his Library automatically.
  requests/     ← app writes, Rumi reads.  Spec file + reference clip per request.
  brand/        ← logo, fonts, palette. Single source of truth.
```

Direction of travel is one-way per folder, so Drive never produces sync conflicts.

**Gemini key.** Ships in the app's config, protected by two Google-side controls rather
than a proxy: an API key restricted to the Generative Language API, and a hard quota cap
in Cloud Console so spend cannot run away even if the key leaks. A Cloud Function proxy
stays available as a later upgrade if key rotation ever becomes a nuisance — not worth
building for one trusted user on day one.

**Offline behaviour.** Library, GUI editing and export all work without internet.
Only prompt → props needs a connection, and the manual table editor covers that path.

---

## Phase 0 — Decisions & assets

Nothing here is code, but three of these can invalidate later work, so they land first.

| Item | Why it matters | Owner |
|---|---|---|
| Remotion company licence | Free for ≤3 employees; larger companies need a paid licence. Confirm where Hoteldebit sits. | Rumi |
| Brand assets — logo (SVG), fonts (+ licence for embedding), hex palette | Every template imports these. Retrofitting later touches all of them. | Rumi |
| 3–5 reference clips | Defines the quality bar and the shared motion language. Reference beats description. | Rumi |
| Gemini API key + hard quota cap in Google Cloud Console | Powers prompt → props. Already in use for graphify. Quota cap makes spend impossible to run away. | Rumi |
| Google Drive folder shared with the editor, mirrored locally | Template delivery down, template requests up. | Rumi |
| Editor's machine specs (CPU/RAM/GPU) | Determines render times and concurrency defaults. | Rumi |
| Premiere version + watch-folder path | Export target. | Editor |

**Gate:** assets in the repo, licence question answered.

---

## Phase 1 — Foundation & render proof

Prove the riskiest assumption before building anything on top of it.

- Remotion + TypeScript project, folder structure, registry.
- `brand.ts` — colours, fonts, logo, safe margins.
- `motion.ts` — the shared motion language: spring configs, easing curves, stagger
  helpers, overshoot/settle presets. Every template pulls from here; this is what makes
  the library feel like one system.
- One throwaway composition to exercise the pipeline.
- Render path: ProRes 4444, transparent background, `.mov`.

**Gate (critical):** the exported `.mov` drops onto a Premiere timeline on the editor's
machine with alpha intact and correct colour. If this fails, the whole export strategy
changes — which is exactly why it's tested in week one rather than week six.

---

## Phase 2 — Template contract + flagship template

- `TEMPLATE_SPEC.md` — the contract: exported Zod schema, standalone-renderable
  `defaultProps`, supports 1080×1920 / 1080×1080 / 1920×1080, duration derived from
  content, no network calls at render time.
- Build the **candle chart** template against the reference clip.
- Iteration loop: build → render → inspect → Rumi watches preview → adjust timing.
  Expect 3–5 rounds.

**Gate (go/no-go):** Rumi approves the quality bar. If the flagship doesn't feel top tier,
we fix the approach here — before eight templates are built on it.

---

## Phase 3 — The app shell

Electron desktop app, Windows installer, taskbar icon.

- **Library** — thumbnail grid, hover-autoplay previews.
- **Edit** — live `@remotion/player` preview + props form auto-generated from the
  template's Zod schema. New templates get their editing UI for free.
- **Export** — three presets only: *Overlay (transparent)*, *Full-frame MP4*,
  *Social vertical*. Progress bar. Watch folder.
- Table editor for data-driven templates, with **paste from Excel / TradingView**.

**Gate:** Rumi drives it end to end — pick, edit, export, land in Premiere — without a terminal.

---

## Phase 4 — Prompt → props

The prompt fills *data*, never generates code. Output is schema-validated JSON, so a bad
response is rejected harmlessly rather than shipping a broken template.

- Gemini call constrained to the active template's schema.
- Validation + retry with the error fed back.
- Plain-language failure message; the GUI table is always available as the manual path.

**Gate:** 10 realistic prompts; measure how many produce usable props first try.
Target ≥7. Below that, tighten the schema descriptions rather than the prompt.

---

## Phase 5 — Library build-out

5–7 more templates, each iterated to approval. Starting set:

1. Candle / market chart *(Phase 2)*
2. Price-drop / offer card
3. Lower-third
4. Image reveal
5. End-card / CTA
6. Stat or counter callout
7. Room / listing showcase
8. Countdown or urgency sticker

**Gate:** every template renders clean at all three aspect ratios and passes the smoke check.

---

## Phase 6 — Variant system

The main lever for reducing Rumi's involvement — clone a working template and re-skin
colours, typography, timing and layout entirely through the GUI. Every good template
becomes five without a code session.

**Gate:** the editor creates and saves a usable variant unassisted.

---

## Phase 7 — Request queue

- "Request a template" form in the app: purpose, reference link or dropped clip,
  example data, urgency.
- **Triage first** — if an existing template plus a variant covers it, suggest that
  instead. Intercepts roughly half of requests.
- Genuine requests write a spec file + assets into a synced folder; Rumi gets a notification.
- Completed templates sync back into the Library automatically. No zips, no installs.

**Gate:** editor files a request, Rumi builds it, it appears in the editor's Library
without manual handoff.

---

## Phase 8 — Packaging & handover

- `electron-builder` Windows installer (`.exe`), bundled Node + Remotion headless shell.
- API key behind a small proxy Rumi owns — usage visible, revocable without reinstalling.
- "Send to Rumi" button on any template for quick fixes.
- Editor training: ~1 hour + a one-page cheat sheet.

**Gate:** the editor produces three real videos solo, start to finish, unassisted.

---

## Phase 9 — Pilot & harden

Two weeks of real production use.

- Error reporting so failures surface as one plain sentence, logged for Rumi.
- Fix the top five friction points from real usage.
- Decide whether batch rendering (spreadsheet of offers → N videos) is worth building next.
  Given hotel inventory content, it probably is.

---

## Phase 1 findings (built & measured)

**1. Google Cloud Storage is geo-blocked here — this is the big one.**
Remotion downloads its own Chrome Headless Shell on first render. That download
403s from this location with *"this service is not available in your location"*.
It presents as a crash, not as a restriction, so it would have read as a bug.

Worked around by rendering with an already-installed Chromium; `remotion.config.ts`
now auto-detects Chrome then Edge, overridable via `REMOTION_BROWSER_EXECUTABLE`.
**Consequence for Phase 3:** the Electron app must ship or locate a browser itself
and pass `browserExecutable` explicitly — `remotion.config.ts` does *not* apply to
the Node rendering APIs the app will use. The editor's machine will hit the same
block. This moves the packaging spike from "should do early" to "must do first".

**2. Render baseline on this machine:** 3s at 1080×1920, ProRes 4444 → ~16s wall
clock, 42 MB. Roughly 5× realtime. Extrapolating, a 30s template lands near 3
minutes and ~400 MB. ProRes 4444 is deliberately fat; fine as a timeline
intermediate, but the watch folder needs regular clearing and the editor's disk
headroom is worth checking.

**3. Overlays must read on light *and* dark footage.** The proof's white headline
vanished entirely when composited over white. Obvious in hindsight, invisible in
a preview on a dark Studio background. Going into `TEMPLATE_SPEC.md`: every
overlay template needs a backing shape, shadow, or brand colour that survives both
— and the app's preview should offer a light/dark/checkerboard backdrop toggle so
the editor can't ship an invisible caption.

**4. Verified at file level:** output is `prores (ap4h)` — the ProRes 4444 fourcc —
at `yuva444p12le`. The `a` confirms a real alpha channel. ProRes 4444 stores 12-bit
internally, so ffprobe reporting `12le` where we requested `10le` is expected.
Per-composition `calculateMetadata` defaults work: no CLI flags were needed.

---

## Phase 2 findings

**1. Scaling type by width is wrong across aspect ratios.** The official guidance
says scale with composition width — correct within one aspect, badly wrong across
them. Landscape type came out 1.8× too large and swallowed the chart. Fixed by
scaling against the shorter side. `TEMPLATE_SPEC.md` §3 updated; `scaleToWidth()`
in tokens is now only safe for same-aspect work.

**2. Radius tokens must be relative to the element, not the frame.** `radius.sm`
is wider than a candle body in landscape, which rounded bodies into pills and
turned wicks into horizontal blobs — it stopped reading as a candle chart at all.
Any small repeated element needs its radius capped against its own width.

**3. Export settings belong to the preset, not the template.** Putting ProRes
defaults in `calculateMetadata` (the Phase 1 approach) makes a composition
impossible to render as H.264 — it hard-errors. Since the app generates previews
and thumbnails constantly, that would have been crippling. Moved to
`OVERLAY_RENDER_SETTINGS`, read by both the npm scripts and (later) the app. The
Phase 1 intent still holds: nobody hand-types the pixel format.

Both output paths verified on the finished template: `render:overlay` produces
`prores (ap4h) / yuva444p12le` at 55 MB, `render:preview` produces H.264 at 340 kB
in 15s.

---

## Phase 3 findings

**1. The packaging risk was overstated — the browser risk was not.** The Node
render path (`@remotion/bundler` + `@remotion/renderer`) works with an explicit
`browserExecutable`, confirmed end to end. Bundling takes ~3s and is cached for
the session, so only the first export pays it. `remotion.config.ts` genuinely
does not apply to these APIs, exactly as feared — every setting is passed
explicitly in `engine/scripts/render-service.mjs`.

**2. `.describe()` on a `zColor()` field destroys the colour picker.** `zColor()`
stores its own marker (`__remotion-color`) in the description slot, so describing
it overwrites the marker and silently downgrades the control to a text box — in
our app *and* in Remotion Studio. The first draft of `TEMPLATE_SPEC.md` required
both, which was impossible. Colours are now labelled via the registry's `labels`
map, and the spec records the conflict.

**3. Tailwind was removed.** The scaffold installed it despite `--no-tailwind`,
nothing used it, and it forced a webpack override on every Node-side bundle.

**4. Architecture: UI and renderer are separate processes.** Rendering pins a CPU
for tens of seconds; doing it in the UI process would freeze the window. The UI
previews with `<Player>`, which runs the *same* React components the renderer
uses — so the preview cannot drift from the export.

**Built and verified working:** Library grid with live autoplaying previews;
Edit screen with `<Player>`, a fully schema-generated props form (text, number +
slider, colour picker, toggle, dropdown, and a table editor with paste-from-Excel),
format switcher, dark/light/checkerboard backdrop toggle, three export presets,
and a watch folder. End-to-end proven: UI → server → `prores (ap4h) /
yuva444p12le` landing in `exports/`.

**Deliberately deferred:** the Electron wrapper. The UI and renderer were built
and verified as a local web app first so that the shell is the only unknown left,
rather than debugging UI bugs through an Electron build.

---

## Phase 4 findings

**1. Rolled our own Zod → Gemini schema converter.** `zod-to-json-schema` requires
zod ≥3.22.4 and Remotion pins 3.22.3. Forcing the upgrade risked Studio's schema
editing for a library we'd half-use anyway: Gemini accepts only an OpenAPI-3.0
subset and rejects the `$ref` / `anyOf` / `additionalProperties` that generic
converters emit. `toGeminiSchema()` emits exactly that subset, from the same
introspector the props form uses — so the model can fill precisely what the form
can edit, by construction.

**2. The model returns a PATCH, not a full props object.** A prompt about the
price cannot silently blank the ticker, and the editor's own tweaks survive.
Verified.

**3. Per-field types are not enough — cross-field validation is what makes this
safe.** Nothing in the field types stops a candle whose `high` sits below its
`open`; it renders as an inverted wick. That is exactly the mistake a model makes
when inventing a price series, so `candleSchema` now carries a `.refine()`
enforcing `high ≥ open/close ≥ low`. **Every data-shaped template needs its own
cross-field refinement** — this belongs in the review checklist, not just here.

**4. Transport errors don't retry.** A 403 or a rate limit won't be fixed by
rephrasing, so those fail immediately instead of burning three attempts.

**Verified with an injected fake model** (no API key present): valid patch
succeeds first try; an impossible candle is rejected, fed back, and succeeds on
attempt 2; an always-invalid response gives up after 3 with a plain sentence; and
a candles-only patch leaves `ticker` untouched.

**To switch on:** set `GEMINI_API_KEY` and restart. Without it the prompt box
simply doesn't appear and the app stays fully usable via the form — prompting is
a shortcut, never the only way in. Model is `MG_GEMINI_MODEL`-configurable.

### Live-API findings (after the key was added)

**5. Node's `fetch` ignores `HTTPS_PROXY`. This cost the most time.** Google's
APIs are geo-blocked here and reach the internet through a local proxy at
`127.0.0.1:10808`. curl, git and everything else honour the proxy env vars;
Node's built-in `fetch` does not, and neither does `NODE_USE_ENV_PROXY`. The
symptom was maximally misleading — a 403 HTML error page that reads as a rejected
API key, while the identical curl request returned 200. Fixed with an explicit
`undici` `ProxyAgent` in `server/http.mjs`; **all outbound server calls must go
through `httpFetch`**. Same root cause as the Phase 1 Chrome-download block.

**6. `process.loadEnvFile()` in the server body ran too late.** ES module imports
are fully evaluated before the importing module's body, so `http.mjs` read
`process.env` for the proxy *before* the env file loaded — the proxy stayed unset
and every call failed. Now loaded via `node --env-file-if-exists=../.env` in the
npm script, which is guaranteed to precede all imports.

**7. The pinned model was dead.** `gemini-2.0-flash` returns 404 "no longer
available" — while still being advertised by the models-list endpoint, so it
looks fine until called. Default is now the moving alias `gemini-flash-latest`,
plus automatic discovery of a live flash model on any 404. A pinned model in an
app running unattended on the editor's machine is a time bomb.

**8. The worst failure mode was silent success, not rejection.** Asked for "10
candles from 61200 to 68400", the model reliably returned only `ticker` and
`subtitle` and left the data alone. That patch *validates perfectly* — the
existing candles are still valid — so the editor gets a cheerful "Done" and an
unchanged chart. Added a completeness check: if the request contains numbers and
the template has a data array the model didn't touch, reject and say so
explicitly. Effect on the same prompt: **3 attempts → 1**, with correct data.

**9. Added a 45s hard timeout.** Without one a stalled proxy hangs forever and
the editor watches "Working…" with no way to tell thinking from dead.

**Live results:** "Nasdaq, 12 candles rising from 412 to 447 with a dip around
the fourth" → 12 candles, correct range, valid OHLC, 1 attempt, 8.3s. A later
call timed out at 45s through the proxy — **the proxy, not the code, is now the
reliability ceiling here.** Worth checking whether the editor's machine needs one
at all; if he's not behind the same geo-block, this path will be considerably
more reliable for him than it is on this machine.

---

## Risk register

| Risk | Mitigation |
|---|---|
| ProRes alpha misbehaves in Premiere | Tested in Phase 1, before anything depends on it |
| Render times too slow on editor's machine | Measured in Phase 1; fall back to lower preview res + background render queue |
| Font licence doesn't permit embedding | Checked in Phase 0; substitute early, not late |
| Remotion company licence required | Resolved in Phase 0 |
| Gemini props unreliable | Schema-constrained + retry; GUI table always available as manual path |
| **Electron packaging + browser availability** — *confirmed real, not theoretical* | Chrome download is geo-blocked (403). App must bundle or locate Chromium and pass `browserExecutable` to the Node API. **First task of Phase 3.** |
| ProRes 4444 file sizes fill the watch folder | ~14 MB per second of 1080×1920. Auto-prune the watch folder; check the editor's disk headroom in Phase 0 |
| Overlay invisible against light footage | Backing shape/shadow required by `TEMPLATE_SPEC.md`; light/dark/checkerboard preview toggle in the app |
| Quality bar not met | Phase 2 is an explicit go/no-go before the library is built out |

---

## Sequencing note

Phases 1–2 are the critical path and carry nearly all the risk. Phases 3–4 are
straightforward engineering. Phase 5 is volume work. Nothing after Phase 2 is worth
starting until the flagship template clears its quality gate.
