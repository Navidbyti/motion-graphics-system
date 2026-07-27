/**
 * BACKGROUND WORK — tracked outside React, on purpose.
 *
 * Both long-running jobs used to be polled from inside the screen that started
 * them. Closing the Subtitles screen cleared its interval, and leaving the edit
 * screen cleared the export's — so the work carried on server-side while the UI
 * forgot it existed. Reopening the screen showed a blank form, which is
 * indistinguishable from "it stopped".
 *
 * The store therefore lives at module scope: navigating between screens cannot
 * unmount it, and a job started anywhere stays visible everywhere until it
 * finishes.
 */

import { useEffect, useState } from "react";
import { api } from "./api";

export type ActivityKind = "export" | "subtitles";

export type Activity = {
  id: string;
  kind: ActivityKind;
  /** Shown in the compact bar — keep it short. */
  label: string;
  state: "working" | "done" | "error";
  /** 0–100, or null when the stage has no measurable progress. */
  percent: number | null;
  /** A word or two about the current stage. */
  detail?: string;
  /** Where the finished work landed. */
  outputPath?: string;
  error?: string;
  /** Everything the server last returned, for screens that show more. */
  raw?: Record<string, unknown>;
};

const activities = new Map<string, Activity>();
const timers = new Map<string, number>();
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const getActivities = (): Activity[] => [...activities.values()];

export const getActivity = (id?: string | null): Activity | undefined =>
  id ? activities.get(id) : undefined;

export const dismissActivity = (id: string) => {
  const timer = timers.get(id);
  if (timer) {
    window.clearInterval(timer);
    timers.delete(id);
  }
  activities.delete(id);
  emit();
};

/**
 * Read one poll of a job into the shared shape.
 *
 * The two job types report progress differently — a render gives a 0–1 float,
 * transcription gives a stage and a percentage — so the translation happens
 * here rather than in either screen.
 */
const fromJob = (kind: ActivityKind, raw: Record<string, unknown>): Partial<Activity> => {
  if (kind === "export") {
    const status = String(raw.status ?? "");
    return {
      state: status === "done" ? "done" : status === "failed" ? "error" : "working",
      percent: typeof raw.progress === "number" ? Math.round(raw.progress * 100) : null,
      detail: status === "rendering" ? "Rendering" : undefined,
      outputPath: typeof raw.outputPath === "string" ? raw.outputPath : undefined,
      error: typeof raw.error === "string" ? raw.error : undefined,
      raw,
    };
  }

  const status = String(raw.status ?? "");
  const stage = String(raw.stage ?? "");
  const STAGES: Record<string, string> = {
    starting: "Starting",
    engine: "Downloading engine",
    model: "Downloading model",
    audio: "Extracting audio",
    transcribe: "Transcribing",
  };
  return {
    state: status === "done" ? "done" : status === "error" ? "error" : "working",
    percent: typeof raw.percent === "number" ? raw.percent : null,
    detail: STAGES[stage] ?? (status === "done" ? "Finished" : undefined),
    error: typeof raw.error === "string" ? raw.error : undefined,
    raw,
  };
};

/**
 * Start following a server job. Safe to call twice with the same id — the
 * second call is ignored rather than starting a competing poller.
 */
export const trackJob = (id: string, kind: ActivityKind, label: string) => {
  if (timers.has(id)) return;

  activities.set(id, { id, kind, label, state: "working", percent: null });
  emit();

  const timer = window.setInterval(async () => {
    try {
      const response = await fetch(api(`/api/job/${id}`));
      if (!response.ok) return;
      const raw = await response.json();

      const current = activities.get(id);
      if (!current) return;
      const next = { ...current, ...fromJob(kind, raw) };
      activities.set(id, next);
      emit();

      if (next.state !== "working") {
        window.clearInterval(timer);
        timers.delete(id);
      }
    } catch {
      // A dropped poll is not a failed job — the render server may simply be
      // busy. Keep polling; a genuinely dead job stops reporting anyway.
    }
  }, 700);

  timers.set(id, timer);
};

/** Subscribe a component to the store. */
export const useActivities = (): Activity[] => {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return getActivities();
};
