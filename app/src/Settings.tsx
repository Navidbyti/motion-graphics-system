/**
 * SETTINGS — the custom theme editor.
 *
 * Anyone outside the three house brands defines their look here once, and every
 * template picks it up by selecting "Custom theme" in its brand dropdown.
 *
 * Stored in localStorage rather than a file: the theme is per-person, not
 * per-project, and it travels into each render as a prop — so what's previewed
 * is exactly what's exported.
 */

import { useEffect, useState } from "react";
import { BUNDLED_FONTS, defaultTheme, type ThemeInput } from "@engine/brand/theme";

const STORAGE_KEY = "mg.customTheme";

export const loadCustomTheme = (): ThemeInput => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Merged over the defaults so a theme saved before a field existed still
    // loads, rather than rendering with an undefined colour.
    return raw ? { ...defaultTheme, ...JSON.parse(raw) } : defaultTheme;
  } catch {
    return defaultTheme;
  }
};

export const saveCustomTheme = (theme: ThemeInput) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
};

const COLOUR_FIELDS: { key: keyof ThemeInput; label: string }[] = [
  { key: "primary", label: "Primary — your main brand colour" },
  { key: "accent", label: "Accent — highlights and emphasis" },
  { key: "ink", label: "Ink — darkest surface, backing panels" },
  { key: "surface", label: "Surface — raised panels" },
  { key: "paper", label: "Paper — lightest surface" },
  { key: "textPrimary", label: "Text — main" },
  { key: "textSecondary", label: "Text — secondary" },
  { key: "positive", label: "Positive — up, gain, success" },
  { key: "negative", label: "Negative — down, loss, alert" },
];

const MOTION_OPTIONS: { value: ThemeInput["motion"]; label: string }[] = [
  { value: "snappy", label: "Snappy — fast, no bounce" },
  { value: "settle", label: "Settle — arrives with a little life" },
  { value: "pop", label: "Pop — bouncy and playful" },
  { value: "heavy", label: "Heavy — weighted and premium" },
  { value: "exact", label: "Exact — no overshoot at all" },
];

export const Settings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [theme, setTheme] = useState<ThemeInput>(loadCustomTheme);
  const [saved, setSaved] = useState(false);

  // Persist as they type — nothing worse than tuning nine colours and losing it.
  useEffect(() => {
    saveCustomTheme(theme);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(timer);
  }, [theme]);

  const set = <K extends keyof ThemeInput>(key: K, value: ThemeInput[K]) =>
    setTheme((t) => ({ ...t, [key]: value }));

  return (
    <main className="settings">
      <div className="settings-head">
        <div>
          <h1>Custom theme</h1>
          <p className="muted">
            Used by any template with its brand set to “Custom theme”.
          </p>
        </div>
        <div className="btn-group">
          <span className="muted small">{saved ? "Saved" : ""}</span>
          <button onClick={() => setTheme(defaultTheme)}>Reset</button>
          <button className="active" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <label className="field">
          <span className="field-label">Theme name</span>
          <input
            type="text"
            value={theme.name}
            maxLength={30}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>

        {COLOUR_FIELDS.map(({ key, label }) => (
          <label className="field" key={key}>
            <span className="field-label">{label}</span>
            <div className="color-row">
              <input
                type="color"
                value={String(theme[key])}
                onChange={(e) => set(key, e.target.value as never)}
              />
              <input
                type="text"
                value={String(theme[key])}
                onChange={(e) => set(key, e.target.value as never)}
              />
            </div>
          </label>
        ))}

        <label className="field">
          <span className="field-label">Display font — headlines</span>
          <input
            type="text"
            list="bundled-fonts"
            value={theme.fontDisplay}
            onChange={(e) => set("fontDisplay", e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Body font — everything else</span>
          <input
            type="text"
            list="bundled-fonts"
            value={theme.fontBody}
            onChange={(e) => set("fontBody", e.target.value)}
          />
        </label>

        <datalist id="bundled-fonts">
          {BUNDLED_FONTS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>

        <label className="field">
          <span className="field-label">Motion personality</span>
          <select
            value={theme.motion}
            onChange={(e) => set("motion", e.target.value as ThemeInput["motion"])}
          >
            {MOTION_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Pace — under 1 is slower</span>
          <div className="number-row">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={theme.pace}
              onChange={(e) => set("pace", Number(e.target.value))}
            />
            <input
              type="number"
              min={0.5}
              max={2}
              step={0.05}
              value={theme.pace}
              onChange={(e) => set("pace", Number(e.target.value))}
            />
          </div>
        </label>

        <label className="field">
          <span className="field-label">Dark surfaces</span>
          <input
            type="checkbox"
            checked={theme.dark}
            onChange={(e) => set("dark", e.target.checked)}
          />
        </label>
      </div>

      <p className="muted small">
        Only {BUNDLED_FONTS.join(", ")} are bundled with the app and guaranteed to
        render. Any other font name relies on that font being installed on the
        machine doing the render.
      </p>
    </main>
  );
};
