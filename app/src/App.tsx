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
import { Settings, loadCustomTheme } from "./Settings";

type Backdrop =
  | "checker"
  | "dark"
  | "light"
  | "bright"
  | "skin"
  | "centre"
  | "busy"
  | "custom";
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
const bridge = (window as unknown as { desktop?: { apiPort?: number } }).desktop;
const isDesktopApp = Boolean(bridge);
// The port is resolved at boot — 3131 may already be taken on this machine.
const API_BASE = `http://localhost:${bridge?.apiPort ?? 3131}`;
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

/**
 * Preview backdrops. These live on the stage container, OUTSIDE the <Player>,
 * so they can never reach a render — the exporter only ever sees the template.
 *
 * The generated ones aren't trying to look like photographs. What actually
 * breaks an overlay is luminance and busyness, not whether a person is in
 * shot: white text dies on a blown-out window, a centred subject swallows a
 * centred caption, and a busy scene destroys thin type. Each of these
 * reproduces one of those failure conditions on demand. For a genuine check
 * against real material, drop in an actual frame with Custom.
 */
const BACKDROPS: Record<Backdrop, React.CSSProperties> = {
  dark: { background: "#0B0F17" },
  light: { background: "#F2F5F9" },
  // Both extremes at once — the fastest way to catch an invisible overlay.
  checker: {
    background:
      "repeating-conic-gradient(#d6dbe3 0% 25%, #ffffff 0% 50%) 50% / 48px 48px",
  },
  // Blown-out window light behind a subject. Kills white text.
  bright: {
    background:
      "radial-gradient(circle at 50% 32%, #ffffff 0%, #f3ede2 42%, #d9cbb4 100%)",
  },
  // Warm mid-tone, the usual UGC selfie lighting.
  skin: {
    background:
      "radial-gradient(circle at 50% 38%, #d8a882 0%, #b07d5c 45%, #5c3b2a 100%)",
  },
  // Centred subject: bright middle, falling off to dark edges. Anything
  // centred competes with the face.
  centre: {
    background:
      "radial-gradient(ellipse at 50% 42%, #e8e2d8 0%, #8d857a 38%, #23201d 78%)",
  },
  // Busy, high-contrast scene. Thin type and low-opacity panels fail here.
  busy: {
    background:
      "repeating-linear-gradient(115deg, #1c3f5e 0 40px, #d94f2b 40px 80px, #f2c14e 80px 120px, #2f7a4f 120px 160px)",
  },
  custom: {},
};

const BACKDROP_LABELS: Record<Backdrop, string> = {
  checker: "Checkerboard",
  dark: "Dark footage",
  light: "Light footage",
  bright: "Blown-out light",
  skin: "UGC / warm skin",
  centre: "Centred subject",
  busy: "Busy scene",
  custom: "Custom image…",
};

const CUSTOM_BACKDROP_KEY = "mg.customBackdrop";

export const App: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        <button onClick={() => setSettingsOpen((o) => !o)}>
          {settingsOpen ? "Close" : "Theme"}
        </button>
        <SyncButton />
      </header>

      {settingsOpen ? (
        <Settings onClose={() => setSettingsOpen(false)} />
      ) : template ? (
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
  /**
   * "fit" scales the preview to the available space; a number is an explicit
   * zoom where the canvas scrolls. Vertical compositions are much taller than
   * the stage, and without a fit mode the player overflowed instead of
   * shrinking — flex children don't shrink below their content unless told to.
   */
  const [zoom, setZoom] = useState<"fit" | number>("fit");

  /**
   * A frame from the editor's own footage, kept between sessions. Stored as a
   * data URL like the custom theme — it's a preview aid, not project data, and
   * it never travels anywhere near a render.
   */
  const [customBackdrop, setCustomBackdrop] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CUSTOM_BACKDROP_KEY);
    } catch {
      return null;
    }
  });

  const onBackdropFile = async (file?: File) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const url = `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`;
    setCustomBackdrop(url);
    try {
      localStorage.setItem(CUSTOM_BACKDROP_KEY, url);
    } catch {
      // A large image can exceed the storage quota; it still works this
      // session, it just won't persist.
    }
  };

  const backdropStyle: React.CSSProperties =
    backdrop === "custom" && customBackdrop
      ? {
          backgroundImage: `url(${customBackdrop})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : backdrop === "custom"
        ? BACKDROPS.checker
        : BACKDROPS[backdrop];
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

  /**
   * The custom theme is attached at render time rather than edited in the props
   * panel — it's a per-person setting, not a per-video one. Attaching it to the
   * same object used by both <Player> and the export is what guarantees the
   * preview and the file agree.
   */
  const renderProps = useMemo(
    () => (props.brand === "custom" ? { ...props, theme: loadCustomTheme() } : props),
    [props],
  );

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
        inputProps: renderProps,
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

          <div className="btn-group backdrop-picker">
            <select
              value={backdrop}
              onChange={(e) => setBackdrop(e.target.value as Backdrop)}
              title="Preview only — never included in the export"
            >
              {(Object.keys(BACKDROP_LABELS) as Backdrop[]).map((b) => (
                <option key={b} value={b}>
                  {BACKDROP_LABELS[b]}
                </option>
              ))}
            </select>
            {backdrop === "custom" ? (
              <label className="upload-btn" title="Use a frame from your own footage">
                {customBackdrop ? "Change" : "Choose…"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onBackdropFile(e.target.files?.[0])}
                />
              </label>
            ) : null}
          </div>

          <div className="btn-group zoom">
            <button
              className={zoom === "fit" ? "active" : ""}
              onClick={() => setZoom("fit")}
              title="Scale the preview to fit the window"
            >
              Fit
            </button>
            <button
              onClick={() =>
                setZoom((z) => Math.max(0.25, (z === "fit" ? 1 : z) - 0.25))
              }
              title="Zoom out"
            >
              −
            </button>
            <span className="muted small zoom-level">
              {zoom === "fit" ? "fit" : `${Math.round(zoom * 100)}%`}
            </span>
            <button
              onClick={() =>
                setZoom((z) => Math.min(3, (z === "fit" ? 1 : z) + 0.25))
              }
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>

        <div
          className={`stage-canvas${zoom === "fit" ? "" : " zoomed"}`}
          style={backdropStyle}
        >
          {/*
            The wrapper owns the sizing, not the Player.
            In fit mode `aspect-ratio` plus max-width/height lets the browser
            shrink it to whatever space is left — which is what wasn't
            happening before, so a 1080×1920 composition simply overflowed the
            stage. When zoomed, an explicit pixel size makes the canvas scroll.
          */}
          <div
            className="player-frame"
            style={
              zoom === "fit"
                ? {
                    aspectRatio: `${formats[format].width} / ${formats[format].height}`,
                    maxWidth: "100%",
                    maxHeight: "100%",
                    width: "100%",
                    height: "100%",
                  }
                : {
                    width: formats[format].width * zoom * 0.5,
                    height: formats[format].height * zoom * 0.5,
                    flexShrink: 0,
                  }
            }
          >
            <Player
              component={template.component}
              inputProps={renderProps}
              durationInFrames={duration}
              fps={FPS}
              compositionWidth={formats[format].width}
              compositionHeight={formats[format].height}
              style={{ width: "100%", height: "100%" }}
              controls
              loop
            />
          </div>
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
