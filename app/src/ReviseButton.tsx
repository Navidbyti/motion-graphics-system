/**
 * "Not right" — fix a template from the frame on screen and a sentence.
 *
 * The generation loop gets a template from invalid to valid. Nothing in a
 * schema knows that a caption is sitting on top of a candle, so this is the
 * other half: the editor is looking at the thing, they can see what is wrong,
 * and their six words are worth more than any amount of self-assessment by the
 * model that produced it.
 *
 * The frame matters. A complaint is usually about a MOMENT — "the label flashes
 * past", "they overlap at the start" — so it renders whatever frame the Player
 * is paused on rather than a fixed one. Critiquing a different frame than the
 * one being objected to is worse than not critiquing at all.
 */

import { useState } from "react";
import type { TemplateFile } from "@engine/authoring/format";
import { customRenderProps } from "@engine/authoring/toEntry";
import { compositionId, type FormatName } from "@engine/registry";
import { GenerateError, reviseTemplate, type Usage } from "./generate";
import { loadAi, loadSpend, overBudget, recordSpend } from "./aiSettings";
import { saveTemplate } from "./customTemplates";
import { api } from "./api";

/**
 * A frame worth looking at.
 *
 * The Player reports 0 until something plays it, and at frame 0 every layer is
 * still at the start of its entrance — opacity zero. Sending that off for
 * critique means asking what is wrong with a blank white image, and the answer
 * comes back confident and useless.
 *
 * So a reported 0 means "they have not scrubbed", and the frame is computed
 * from the template instead: after the last layer has arrived and settled, and
 * before the exit starts eating it. Any other frame is the one they chose, and
 * is used as-is — a complaint about a moment needs that moment.
 */
const frameToCritique = (file: TemplateFile, reported: number, fps: number) => {
  const total = Math.max(1, Math.round(file.seconds * fps));
  if (reported > 0) return Math.min(reported, total - 1);

  const lastArrival = file.layers.reduce((latest, l) => Math.max(latest, l.motion.at), 0);
  const settled = Math.round((lastArrival + 1.2) * fps);
  // Half a second clear of the end, where everything is fading out together.
  const beforeExit = total - Math.round(0.5 * fps);
  return Math.max(1, Math.min(settled, beforeExit));
};

/** The rendered still, as a data URL Gemini can be handed directly. */
const renderFrame = async (
  file: TemplateFile,
  values: Record<string, unknown>,
  format: FormatName,
  frame: number,
): Promise<string> => {
  const response = await fetch(api("/api/thumbnail"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      compositionId: compositionId("Custom", format),
      inputProps: customRenderProps(file, values),
      frame,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Couldn't render the frame — ${detail.slice(0, 160)}`);
  }

  const blob = await response.blob();

  /*
    Flattened onto a mid grey before it is sent, and this is load-bearing.

    These templates are transparent overlays — the render is white text on an
    alpha channel. A vision model does not composite alpha; it sees whatever the
    decoder fills with, which for white text is a white rectangle. The first
    version of this happily sent a blank image and asked what was wrong with it.

    Mid grey rather than black or white because the library contains both light
    text and dark: either extreme makes one of them vanish. And JPEG rather than
    PNG because the image is the most expensive part of the call and a flat
    photographic encode is a fraction of the tokens.
  */
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  // Downscaled. A 1080×1920 still costs far more tokens than it adds judgement —
  // layout problems are perfectly visible at this size.
  const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare the frame.");
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", 0.85);
};

export const ReviseButton: React.FC<{
  file: TemplateFile;
  values: Record<string, unknown>;
  format: FormatName;
  /** Whatever frame the preview is showing. */
  currentFrame: () => number;
  /** Frames per second, for turning the template's seconds into a frame. */
  fps: number;
  /** Replaces the stored template and reloads the screen around it. */
  onRevised: (next: TemplateFile) => void;
}> = ({ file, values, format, currentFrame, fps, onRevised }) => {
  const [open, setOpen] = useState(false);
  const [complaint, setComplaint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The validator's actual complaints, kept so they can be shown. */
  const [problems, setProblems] = useState<{ where: string; what: string }[]>([]);
  /** What the model produced when it failed — usually close, worth keeping. */
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);

  const ai = loadAi();
  if (!ai.apiKey) return null;

  const run = async () => {
    setError(null);
    setProblems([]);
    setDraft(null);
    setUsage(null);

    if (overBudget(ai)) {
      return setError(
        `You've reached this month's $${ai.monthlyCap.toFixed(2)} limit. Raise it in Theme.`,
      );
    }

    try {
      setBusy("Rendering the frame…");
      const frame = await renderFrame(
        file,
        values,
        format,
        frameToCritique(file, currentFrame(), fps),
      );

      setBusy("Looking at it…");
      const result = await reviseTemplate({
        key: ai.apiKey,
        model: ai.model,
        template: file,
        complaint,
        frame,
      });

      recordSpend(result.usage.cost);
      setUsage(result.usage);
      saveTemplate(result.template);
      onRevised(result.template);
      setComplaint("");
      setOpen(false);
    } catch (e) {
      const err = e as GenerateError;
      // Charged whether or not it helped — a counter that only counts successes
      // is not a counter.
      if (err.usage) {
        recordSpend(err.usage.cost);
        setUsage(err.usage);
      }
      setError(err.message);
      setProblems(err.problems ?? []);
      setDraft(err.draft ?? null);
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Have the AI fix how this looks">
        Not right…
      </button>
    );
  }

  return (
    <div className="revise">
      <div className="row-between">
        <strong className="small">What&apos;s wrong with it?</strong>
        <button className="link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      {/*
        A textarea, because the useful complaints are not one-liners. The first
        version was a single-line input and someone typed three separate
        requirements into it, unable to see what they had written.
      */}
      <textarea
        className="revise-input"
        value={complaint}
        autoFocus
        rows={4}
        placeholder={
          "The candles move too violently — make it a gentler trend.\nPut the MACD and histogram in the lower panel."
        }
        onChange={(e) => setComplaint(e.target.value)}
        onKeyDown={(e) => {
          // Enter alone inserts a newline; Ctrl/Cmd-Enter submits.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy) run();
        }}
        disabled={Boolean(busy)}
      />

      <p className="muted small">
        {/*
          Said out loud because it changes what people type. Knowing the model
          sees the actual frame is what gets "the label overlaps the price"
          instead of "make it look better".
        */}
        It sees the frame you&apos;re paused on. Say what you&apos;d tell a designer —
        or leave it blank and let it find the worst problem itself.
      </p>

      <div className="btn-group">
        <button className="active" onClick={run} disabled={Boolean(busy)}>
          {busy ?? "Fix it"}
        </button>
      </div>

      {error ? (
        <div className="revise-error">
          <p className="error small">{error}</p>

          {/*
            The exact complaints, not a summary of them.

            reviseTemplate returns the validator's issues with real field paths
            and the draft that failed, and the first version of this dropped
            both and printed one sentence. "Try describing the problem
            differently" is not something anyone can act on — it does not say
            whether the model misunderstood, produced something the format
            forbids, or broke a field that was fine.
          */}
          {problems.length ? (
            <ul className="small">
              {problems.map((p, i) => (
                <li key={i}>
                  <strong>{p.where}</strong> — {p.what}
                </li>
              ))}
            </ul>
          ) : null}

          {draft ? (
            <div className="btn-group">
              <button
                className="link"
                onClick={() => {
                  navigator.clipboard.writeText(draft);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? "Copied ✓" : "Copy what it produced"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {usage ? (
        <p className="muted small">
          {/*
            An unpriced model showed "$0.0000", which reads as free rather than
            as unknown. Silence about a number we do not have beats a confident
            wrong one.
          */}
          {usage.cost > 0
            ? `Cost $${usage.cost.toFixed(4)}.`
            : "Cost unknown for this model."}
        </p>
      ) : null}
    </div>
  );
};
