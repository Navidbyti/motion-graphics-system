/**
 * PER-ASSET COLOUR OVERRIDES
 *
 * The brand dropdown is a choice between four identities. This is the dial next
 * to it: keep the brand, change one colour for this graphic only.
 *
 * It edits the `theme` prop, which `resolveTheme` merges over the selected
 * brand. That matters more than it looks — the alternative would be to fork the
 * brand into a custom theme on first edit, which produces a second identity
 * that no longer tracks the real one. Change Cash for Chat's red next month and
 * every forked copy silently keeps the old value. An override layer stays
 * attached to the brand it came from.
 *
 * Untouched colours are simply absent from the object, so a graphic saved today
 * picks up a brand change tomorrow for every colour it did not pin.
 */

import { useState } from "react";
import {
  PALETTE_KEYS,
  type PaletteKey,
  type ThemeInput,
  resolveTheme,
} from "@engine/brand/theme";

const LABELS: Record<PaletteKey, string> = {
  primary: "Primary",
  accent: "Accent",
  ink: "Ink",
  surface: "Surface",
  paper: "Paper",
  textPrimary: "Text",
  textSecondary: "Text — secondary",
  positive: "Positive",
  negative: "Negative",
};

const HINTS: Record<PaletteKey, string> = {
  primary: "Main brand colour — bubble fills, chart lines",
  accent: "Highlights and the emphasised word",
  ink: "Darkest surface, and text on light fills",
  surface: "Raised panels behind content",
  paper: "Lightest surface — bubbles, cards",
  textPrimary: "Main text on dark surfaces",
  textSecondary: "Subtitles and captions",
  positive: "Up, gain, success",
  negative: "Down, loss, alert",
};

export const ColourTuner: React.FC<{
  brand: string;
  theme: ThemeInput | undefined;
  onChange: (theme: ThemeInput | undefined) => void;
  /** The saved custom theme, used as the base when brand is "custom". */
  customTheme: ThemeInput;
}> = ({ brand, theme, onChange, customTheme }) => {
  const [open, setOpen] = useState(false);

  /*
    The swatch shows the colour actually in force, which is the override when
    one exists and the brand's own value otherwise. Resolving through the same
    function the templates use means the picker cannot disagree with the render.
  */
  const base = resolveTheme(brand, brand === "custom" ? customTheme : undefined);
  const effective = (key: PaletteKey) => theme?.[key] ?? base.palette[key];

  const overridden = PALETTE_KEYS.filter((k) => Boolean(theme?.[k]));

  const set = (key: PaletteKey, value: string) =>
    onChange({ ...(theme ?? {}), [key]: value });

  const clear = (key: PaletteKey) => {
    const next = { ...(theme ?? {}) };
    delete next[key];
    // An empty object and no object must behave identically downstream.
    onChange(Object.keys(next).length ? next : undefined);
  };

  if (!open) {
    return (
      <button className="tuner-open" onClick={() => setOpen(true)}>
        Fine-tune colours
        {overridden.length ? (
          <span className="tuner-count">{overridden.length}</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="tuner">
      <div className="row-between">
        <strong className="small">Colours</strong>
        <div className="btn-group">
          {overridden.length ? (
            <button className="link" onClick={() => onChange(undefined)}>
              Reset all
            </button>
          ) : null}
          <button className="link" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>

      <p className="muted small tuner-note">
        {brand === "custom"
          ? "Overrides your custom theme, for this graphic only."
          : `Overrides ${base.name} for this graphic only. Anything left alone follows the brand.`}
      </p>

      {PALETTE_KEYS.map((key) => {
        const isSet = Boolean(theme?.[key]);
        return (
          <div className="tuner-row" key={key}>
            <input
              type="color"
              value={effective(key)}
              onChange={(e) => set(key, e.target.value)}
            />
            <div className="tuner-meta">
              <span className={isSet ? "tuner-name changed" : "tuner-name"}>
                {LABELS[key]}
                {isSet ? " •" : ""}
              </span>
              <span className="muted tuner-hint">{HINTS[key]}</span>
            </div>
            <input
              className="tuner-hex"
              type="text"
              value={effective(key)}
              onChange={(e) => set(key, e.target.value)}
            />
            <button
              className="link tuner-reset"
              disabled={!isSet}
              onClick={() => clear(key)}
              title={isSet ? "Back to the brand colour" : "Following the brand"}
            >
              ↺
            </button>
          </div>
        );
      })}
    </div>
  );
};
