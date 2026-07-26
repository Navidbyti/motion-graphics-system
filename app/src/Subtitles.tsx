/**
 * SUBTITLES — transcribe a clip to captions and markers.
 *
 * The whole point is that it runs on this machine. Footage is client material,
 * and a cloud transcription service would mean uploading every interview to a
 * third party to save a one-time download.
 *
 * The engine and the model are fetched on first use, which is why the progress
 * reporting distinguishes downloading from transcribing: a 1.6 GB model on a
 * slow line looks identical to a hung app unless the screen says which it is.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "./api";

type Model = { id: string; label: string; mb: number; note: string };
type Language = { id: string; label: string };

type Job = {
  status: "working" | "done" | "error";
  stage?: "engine" | "model" | "audio" | "transcribe" | "starting";
  percent?: number | null;
  message?: string;
  error?: string;
  cues?: number;
  duration?: number;
  preview?: string[];
  files?: Record<string, string>;
};

const STAGE_LABELS: Record<string, string> = {
  starting: "Starting…",
  engine: "Downloading the speech engine (19 MB, once)",
  model: "Downloading the language model (once)",
  audio: "Extracting audio",
  transcribe: "Transcribing",
};

const desktop = (
  window as unknown as { desktop?: { pickMedia?: () => Promise<string | null>; openFolder?: (f: string) => void } }
).desktop;

export const Subtitles: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [models, setModels] = useState<Model[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [installed, setInstalled] = useState<string[]>([]);

  const [source, setSource] = useState<string | null>(null);
  const [model, setModel] = useState("small");
  const [language, setLanguage] = useState("auto");
  const [fps, setFps] = useState(30);

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    fetch(api("/api/whisper/status"))
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models ?? []);
        setLanguages(d.languages ?? []);
        setInstalled(d.installed ?? []);
      })
      .catch(() => setError("Couldn't reach the render server."));
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const pick = async () => {
    if (!desktop?.pickMedia) {
      return setError("File picking needs the desktop app.");
    }
    const chosen = await desktop.pickMedia();
    if (chosen) {
      setSource(chosen);
      setJob(null);
      setError(null);
    }
  };

  const start = async () => {
    if (!source) return;
    setError(null);
    setJob({ status: "working", stage: "starting" });

    try {
      const response = await fetch(api("/api/whisper/transcribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, model, language, fps }),
      });
      const { id } = await response.json();

      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        const res = await fetch(api(`/api/job/${id}`));
        if (!res.ok) return;
        const next: Job = await res.json();
        setJob(next);
        if (next.status !== "working" && pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
          // Refresh which models are on disk — one more is now cached.
          fetch(api("/api/whisper/status"))
            .then((r) => r.json())
            .then((d) => setInstalled(d.installed ?? []));
        }
      }, 600);
    } catch (err) {
      setJob(null);
      setError(String((err as Error)?.message ?? err));
    }
  };

  const busy = job?.status === "working";
  const chosen = models.find((m) => m.id === model);
  const cached = chosen ? installed.includes(chosen.id) : false;

  return (
    <main className="settings subs">
      <div className="settings-head">
        <div>
          <h1>Subtitles</h1>
          <p className="muted">
            Transcribe a clip to captions and markers. Runs on this machine —
            nothing is uploaded.
          </p>
        </div>
        <button onClick={onClose}>Done</button>
      </div>

      <div className="subs-grid">
        <div className="field">
          <span className="field-label">Video or audio file</span>
          <div className="subs-file">
            <button onClick={pick} disabled={busy}>
              Choose file…
            </button>
            <span className="muted small subs-path" title={source ?? ""}>
              {source ?? "Nothing chosen"}
            </span>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Spoken language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={busy}
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Accuracy</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.mb} MB
              </option>
            ))}
          </select>
          {chosen ? (
            <span className="muted small">
              {chosen.note}{" "}
              {cached ? "Already downloaded." : `Downloads ${chosen.mb} MB the first time.`}
            </span>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">Timeline frame rate — for marker timecodes</span>
          <select
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            disabled={busy}
          >
            {[23.976, 24, 25, 29.97, 30, 50, 59.94, 60].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>
      </div>

      <button className="primary subs-go" onClick={start} disabled={!source || busy}>
        {busy ? "Working…" : "Transcribe"}
      </button>

      {busy ? (
        <div className="subs-progress">
          <div className="row-between">
            <span className="small">{STAGE_LABELS[job?.stage ?? "starting"]}</span>
            <span className="muted small">
              {job?.percent != null ? `${job.percent}%` : job?.message ?? ""}
            </span>
          </div>
          <div className="bar">
            <div
              className={job?.percent == null ? "bar-fill indeterminate" : "bar-fill"}
              style={job?.percent != null ? { width: `${job.percent}%` } : undefined}
            />
          </div>
          {job?.stage === "model" && job?.message ? (
            <span className="muted small">{job.message}</span>
          ) : null}
        </div>
      ) : null}

      {job?.status === "error" ? <p className="error">{job.error}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {job?.status === "done" ? (
        <div className="subs-done">
          <p className="ok">
            {job.cues} captions · {Math.round(job.duration ?? 0)}s
          </p>
          <p className="muted small">
            Written to the Subtitles folder inside your exports folder.
          </p>
          <ul className="small subs-files">
            <li>
              <strong>.srt</strong> — drag into Premiere; imports as captions.
            </li>
            <li>
              <strong>markers.xml</strong> — Premiere <em>File → Import</em>. Adds
              a sequence carrying every line as a marker. No extension needed.
            </li>
            <li>
              <strong>.vtt</strong> — for web players.
            </li>
            <li>
              <strong>.txt</strong> — the plain transcript.
            </li>
            <li>
              <strong>markers.csv</strong> — the same timings for a spreadsheet,
              or for a marker-import panel that expects CSV.
            </li>
          </ul>
          <p className="muted small">
            Markers land on their own sequence — copy them onto yours, or cut
            against it directly.
          </p>
          {job.preview?.length ? (
            <div className="subs-preview">
              {job.preview.map((line, i) => (
                <p key={i} className="small">
                  {line}
                </p>
              ))}
            </div>
          ) : null}
          {job.files?.srt && desktop?.openFolder ? (
            <button
              onClick={() =>
                desktop.openFolder?.(job.files!.srt.replace(/[\\/][^\\/]+$/, ""))
              }
            >
              Open folder
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
};
