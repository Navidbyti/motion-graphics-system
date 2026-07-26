/**
 * The editor's entire world: Library → Edit → Export.
 *
 * Deliberately three screens and nothing else. Every extra control is another
 * thing to explain, and the whole premise is that he never opens a terminal.
 */

import { Player } from "@remotion/player";
import { useEffect, useMemo, useState } from "react";
import { formats } from "@engine/brand/tokens";
import { FPS } from "@engine/Root";
import { compositionId, registry, type FormatName } from "@engine/registry";
import { SchemaForm } from "./SchemaForm";

type Backdrop = "dark" | "light" | "checker";
type Health = {
  ok: boolean;
  browser: string | null;
  watchFolder: string;
  presets: { id: string; label: string; extension: string }[];
  problem: string | null;
};

/**
 * Where the render server lives.
 *
 * In dev the UI is served by Vite, which proxies /api to the server. In the
 * packaged app the UI loads from a file:// URL, where a relative "/api/…"
 * resolves against the filesystem root and every request fails. The Library
 * still renders — templates are bundled — so the app looks completely fine
 * right up until someone tries to export.
 */
const API_BASE = "http://localhost:3131";
const isDesktopApp = Boolean(
  (window as unknown as { desktop?: unknown }).desktop,
);
const api = (path: string) => (isDesktopApp ? API_BASE + path : path);

/** Bridge exposed by electron/preload.cjs. Absent when running in a browser. */
type DesktopBridge = {
  isDesktop: true;
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ state: string; message?: string }>;
  installUpdate: () => Promise<void>;
  openFolder: (folder: string) => Promise<string>;
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => () => void;
};

type UpdateStatus = {
  state: "checking" | "downloading" | "ready" | "current" | "error" | "dev";
  version?: string;
  percent?: number;
  message?: string;
};

const desktop: DesktopBridge | undefined = (
  window as unknown as { desktop?: DesktopBridge }
).desktop;

/**
 * Sync = check for a new build of the app, which is how new templates arrive.
 *
 * Templates are compiled into the app rather than fetched, so "get the latest
 * templates" and "update the app" are the same operation. The button says Sync
 * because that's what it means to the editor — he doesn't care that a new
 * lower-third arrives as an installer.
 */
const SyncButton: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    if (!desktop) return;
    desktop.getVersion().then(setVersion);
    return desktop.onUpdateStatus(setStatus);
  }, []);

  if (!desktop) return null;

  const label = () => {
    switch (status?.state) {
      case "checking":
        return "Checking…";
      case "downloading":
        return status.percent ? `Downloading ${status.percent}%` : "Downloading…";
      case "ready":
        return `Restart to update`;
      case "current":
        return "Up to date";
      case "error":
        return "Sync failed";
      default:
        return "Sync";
    }
  };

  const onClick = () => {
    if (status?.state === "ready") return void desktop.installUpdate();
    setStatus({ state: "checking" });
    desktop.checkForUpdates().then((r) => {
      if (r.state === "error" || r.state === "dev") {
        setStatus({ state: r.state as UpdateStatus["state"], message: r.message });
      }
    });
  };

  return (
    <div className="sync">
      <button
        className={status?.state === "ready" ? "active" : ""}
        onClick={onClick}
        disabled={status?.state === "checking" || status?.state === "downloading"}
        title={status?.message ?? "Check for new templates"}
      >
        {label()}
      </button>
      {version ? <span className="muted small">v{version}</span> : null}
    </div>
  );
};

const BACKDROPS: Record<Backdrop, React.CSSProperties> = {
  dark: { background: "#0B0F17" },
  light: { background: "#F2F5F9" },
  // The honest test: an overlay has to survive both extremes at once.
  checker: {
    background:
      "repeating-conic-gradient(#d6dbe3 0% 25%, #ffffff 0% 50%) 50% / 48px 48px",
  },
};

export const App: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch(api("/api/health"))
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const template = registry.find((t) => t.id === selectedId);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setSelectedId(null)}>
          Motion Graphics
        </button>
        {health && !health.ok ? (
          <span className="banner-error">{health.problem}</span>
        ) : null}
        <SyncButton />
      </header>

      {template ? (
        <EditScreen
          key={template.id}
          template={template}
          health={health}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <Library onOpen={setSelectedId} />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const Library: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => (
  <main className="library">
    <h1>Library</h1>
    <p className="muted">
      Pick a template, fill it in, export to your timeline.
    </p>

    <div className="grid">
      {registry.map((t) => (
        <button key={t.id} className="card" onClick={() => onOpen(t.id)}>
          <div className="card-preview">
            <Player
              component={t.component}
              inputProps={t.defaults}
              durationInFrames={t.durationInFrames(t.defaults, FPS)}
              fps={FPS}
              compositionWidth={formats.vertical.width}
              compositionHeight={formats.vertical.height}
              style={{ width: "100%", height: "100%" }}
              loop
              autoPlay
              controls={false}
            />
          </div>
          <div className="card-body">
            <strong>{t.title}</strong>
            <span className="muted">{t.blurb}</span>
            <div className="tags">
              {t.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </button>
      ))}
    </div>
  </main>
);

/* ------------------------------------------------------------------ */

const EditScreen: React.FC<{
  template: (typeof registry)[number];
  health: Health | null;
  onBack: () => void;
}> = ({ template, health, onBack }) => {
  const [props, setProps] = useState<Record<string, unknown>>(
    () => structuredClone(template.defaults),
  );
  const [format, setFormat] = useState<FormatName>("vertical");
  const [backdrop, setBackdrop] = useState<Backdrop>("checker");
  const [preset, setPreset] = useState("overlay");
  const [job, setJob] = useState<{
    id: string;
    status: string;
    progress: number;
    outputPath: string;
    error?: string;
  } | null>(null);

  const duration = useMemo(() => {
    try {
      return Math.max(1, template.durationInFrames(props, FPS));
    } catch {
      return 1;
    }
  }, [template, props]);

  // Poll while a render is in flight. One editor, one job — no websocket needed.
  useEffect(() => {
    if (!job || job.status !== "rendering") return;
    const timer = setInterval(async () => {
      const res = await fetch(api(`/api/job/${job.id}`));
      if (!res.ok) return;
      const next = await res.json();
      setJob((j) => (j ? { ...j, ...next } : j));
    }, 700);
    return () => clearInterval(timer);
  }, [job]);

  const exportNow = async () => {
    const res = await fetch(api("/api/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compositionId: compositionId(template.id, format),
        inputProps: props,
        preset,
        name: `${template.id}-${format}`,
      }),
    });
    const data = await res.json();
    setJob({ id: data.jobId, status: "rendering", progress: 0, outputPath: data.outputPath });
  };

  return (
    <main className="edit">
      <section className="stage">
        <div className="stage-bar">
          <button onClick={onBack}>‹ Library</button>

          <div className="btn-group">
            {(Object.keys(formats) as FormatName[]).map((f) => (
              <button
                key={f}
                className={f === format ? "active" : ""}
                onClick={() => setFormat(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="btn-group">
            {(["dark", "light", "checker"] as Backdrop[]).map((b) => (
              <button
                key={b}
                className={b === backdrop ? "active" : ""}
                onClick={() => setBackdrop(b)}
                title="Overlays must stay readable on light and dark footage"
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="stage-canvas" style={BACKDROPS[backdrop]}>
          <Player
            component={template.component}
            inputProps={props}
            durationInFrames={duration}
            fps={FPS}
            compositionWidth={formats[format].width}
            compositionHeight={formats[format].height}
            style={{ maxWidth: "100%", maxHeight: "100%" }}
            controls
            loop
          />
        </div>
      </section>

      <aside className="panel">
        <h2>{template.title}</h2>


        <SchemaForm
          schema={template.schema}
          value={props}
          labels={template.labels}
          onChange={setProps}
        />

        <div className="export">
          <label className="field">
            <span className="field-label">Export as</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {(health?.presets ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="primary"
            onClick={exportNow}
            disabled={job?.status === "rendering" || health?.ok === false}
          >
            {job?.status === "rendering"
              ? `Rendering ${Math.round(job.progress * 100)}%`
              : "Export"}
          </button>

          {job?.status === "done" ? (
            <p className="ok">Saved to {job.outputPath}</p>
          ) : null}
          {job?.status === "failed" ? (
            <p className="error">{job.error}</p>
          ) : null}
          {health?.watchFolder ? (
            <p className="muted small">Watch folder: {health.watchFolder}</p>
          ) : null}
        </div>
      </aside>
    </main>
  );
};
