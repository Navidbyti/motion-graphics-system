/**
 * Paste a template.
 *
 * The screen is trivial; the value is entirely in what happens when the paste
 * is wrong, because it usually is on the first try. The model is not going to
 * be right every time and pretending otherwise is how this ends up unusable.
 * What makes it work is that every wrong answer comes back as an exact path and
 * a sentence, packaged to hand straight back to the model.
 *
 * So the editor never has to understand JSON. They paste, and if it complains
 * they press one button, paste that into the chat, and paste the reply back.
 */

import { useEffect, useRef, useState } from "react";
import { templateFileSchema, type TemplateFile } from "@engine/authoring/format";
import { saveTemplate } from "./customTemplates";
import { specForAI } from "./spec";
import {
  GenerateError,
  UnsupportedRequest,
  costOf,
  rateFor,
  generateTemplate,
  type Usage,
} from "./generate";
import { loadAi, loadSpend, overBudget, recordSpend, subscribeAi } from "./aiSettings";

/**
 * Get to the JSON inside whatever was pasted.
 *
 * Chat models wrap code in ``` fences and add a sentence before and after it,
 * and asking people to trim that by hand is asking them to fail. The braces are
 * found rather than the prose stripped, because there is no end to the shapes
 * the prose can take and exactly one shape the object can.
 */
const extractJson = (input: string): string => {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : input).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start === -1 || end === -1 ? body : body.slice(start, end + 1);
};

type Problem = { where: string; what: string };

/** Zod's path array as something a person can find in the text they pasted. */
const describePath = (path: (string | number)[]): string => {
  if (!path.length) return "the template itself";
  return path
    .map((part, i) =>
      typeof part === "number"
        ? `#${part + 1}`
        : i === 0
          ? part
          : `→ ${part}`,
    )
    .join(" ")
    .replace(/(\w+) #(\d+)/g, "$1 #$2");
};

export const AddTemplate: React.FC<{
  onBack: () => void;
  onAdded: (file: TemplateFile) => void;
  /** Opens Theme, where the key lives. */
  onOpenSettings: () => void;
}> = ({ onBack, onAdded, onOpenSettings }) => {
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /* ------------------------- the automatic route ------------------------- */

  const [ai, setAi] = useState(loadAi);
  const [spend, setSpend] = useState(loadSpend);
  useEffect(
    () =>
      subscribeAi(() => {
        setAi(loadAi());
        setSpend(loadSpend());
      }),
    [],
  );

  const [request, setRequest] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  /** The model's own explanation of why this graphic is not buildable. */
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const blocked = overBudget(ai, spend);

  const attachReference = async (file?: File) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    setReference(`data:${file.type || "image/png"};base64,${btoa(binary)}`);
  };

  const generate = async () => {
    setProblems(null);
    setUnsupported(null);
    setUsage(null);
    abort.current = new AbortController();
    setBusy("Writing the template…");

    try {
      const result = await generateTemplate({
        key: ai.apiKey,
        model: ai.model,
        spec: specForAI(),
        request,
        image: reference,
        signal: abort.current.signal,
        onProgress: ({ stage, attempt }) =>
          setBusy(
            stage === "writing"
              ? "Writing the template…"
              : `Fixing it — attempt ${attempt} of 3…`,
          ),
      });

      recordSpend(result.usage.cost);
      setUsage(result.usage);
      saveTemplate(result.template);
      onAdded(result.template);
    } catch (e) {
      /*
        A refusal is an ANSWER, not a failure. It gets its own state and its own
        wording, because "this format cannot do falling objects with masking" is
        genuinely useful and burying it under a red error tells someone the app
        broke when in fact they got a clear reply.
      */
      if (e instanceof UnsupportedRequest) {
        if (e.usage) {
          recordSpend(e.usage.cost);
          setUsage(e.usage);
        }
        setUnsupported(e.message);
        setBusy(null);
        abort.current = null;
        return;
      }
      const err = e as GenerateError;
      if (err.usage) {
        // Charged whether or not it succeeded. A spend counter that only counts
        // successes is not a spend counter.
        recordSpend(err.usage.cost);
        setUsage(err.usage);
      }
      setProblems([
        { where: "Gemini", what: err.message },
        ...(err.problems ?? []),
      ]);
      // The closest draft goes into the paste box, so three calls' work is
      // still there to fix by hand rather than thrown away.
      if (err.draft) setText(err.draft);
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const flash = (what: string) => {
    setCopied(what);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const copy = async (value: string, what: string) => {
    await navigator.clipboard.writeText(value);
    flash(what);
  };

  const add = () => {
    const json = extractJson(text);
    if (!json) return setProblems([{ where: "the box above", what: "it is empty" }]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      /*
        A syntax error, not a schema one. Worth its own message: "unexpected
        token at position 412" means nothing, but "the JSON is incomplete" tells
        someone the likely cause, which is a reply that got cut off.
      */
      return setProblems([
        {
          where: "the JSON itself",
          what: `it could not be read — ${(e as Error).message}. Usually this means the reply was cut off before it finished. Ask for it again.`,
        },
      ]);
    }

    const result = templateFileSchema.safeParse(parsed);
    if (!result.success) {
      return setProblems(
        result.error.issues.map((issue) => ({
          where: describePath(issue.path),
          what: issue.message,
        })),
      );
    }

    saveTemplate(result.data);
    onAdded(result.data);
  };

  /**
   * Everything the model needs to fix it, in one paste.
   *
   * When there is no template — the request failed before producing one, which
   * is what a bad key or a retired model looks like — the code block is left
   * out entirely. A fix-it message wrapped around an empty ```json``` block
   * reads as if the app lost the work, and pasting it into a chat gets a
   * confused answer about nothing.
   */
  const repairPrompt = () => {
    const body = extractJson(text);
    if (!body) {
      return [
        "I asked for a template and got this instead:",
        "",
        ...(problems ?? []).map((p) => `- ${p.where}: ${p.what}`),
        "",
        "Nothing was produced, so there is nothing to fix yet.",
      ].join("\n");
    }
    return [
      "The template you gave me was rejected. Fix these problems and return the",
      "complete corrected JSON, nothing else:",
      "",
      ...(problems ?? []).map((p) => `- ${p.where}: ${p.what}`),
      "",
      "Here is the template you gave me:",
      "",
      "```json",
      body,
      "```",
    ].join("\n");
  };

  return (
    <main className="docs">
      <div className="docs-bar">
        <button onClick={onBack}>‹ Library</button>
        <h2>Add a template</h2>
      </div>

      <div className="docs-body add-template">
        {/*
          The automatic route first, and only when a key exists. Leading with a
          feature that cannot run is an advert; leading with the manual route
          when the automatic one is ready is a step nobody needs.
        */}
        {/*
          Without a key, the offer still has to be visible HERE.

          The panel below only renders once a key exists, which meant this
          screen gave no sign the feature existed at all — someone looking for
          it on the obvious page found nothing, and the key field lives on a
          different screen entirely. Hiding an unusable control is right;
          hiding the fact that it can be made usable is not.
        */}
        {!ai.apiKey ? (
          <section className="add-offer">
            <div>
              <strong>Want it written for you?</strong>
              <p className="muted small">
                With a Gemini API key, this page can write a template from a
                description and fix its own mistakes. Free tier covers it — a
                template costs well under a cent.
              </p>
            </div>
            <button className="active" onClick={onOpenSettings}>
              Add a key in Theme
            </button>
          </section>
        ) : null}

        {ai.apiKey ? (
          <section className="add-step add-auto">
            <div className="row-between">
              <h3>Describe it and let Gemini write it</h3>
              <span className="muted small">
                {ai.model}
                {/* No price for a model with no published rate — see rateFor. */}
                {rateFor(ai.model)
                  ? ` · ~$${costOf(ai.model, 6200, 1200).toFixed(3)} each`
                  : ""}
              </span>
            </div>

            <textarea
              className="add-request"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="A MACD explainer: grey candles, a blue 12-candle average that draws first, an orange 26 after it, and the gap between them shaded."
              disabled={Boolean(busy)}
            />

            <div className="row-between">
              <label className="upload-btn">
                {reference ? "Change reference image" : "Add a reference image (optional)"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => attachReference(e.target.files?.[0])}
                />
              </label>
              {reference ? (
                <button className="link" onClick={() => setReference(null)}>
                  Remove image
                </button>
              ) : null}
            </div>

            {unsupported ? (
              <div className="add-unsupported">
                <strong>That one can&apos;t be built yet</strong>
                <p className="small">{unsupported}</p>
                <p className="muted small">
                  Not a failure — it looked at what the format can do and said so
                  rather than faking it. Try describing a simpler version, or ask
                  for the parts it can do.
                </p>
              </div>
            ) : null}

            {blocked ? (
              <p className="error small">
                You&apos;ve reached this month&apos;s ${ai.monthlyCap.toFixed(2)} limit
                (${spend.cost.toFixed(3)} used). Raise it in Theme, or paste a template
                below instead.
              </p>
            ) : null}

            <div className="btn-group">
              <button
                className="primary"
                onClick={generate}
                disabled={Boolean(busy) || !request.trim() || blocked}
              >
                {busy ?? "Write it for me"}
              </button>
              {busy ? (
                <button onClick={() => abort.current?.abort()}>Stop</button>
              ) : null}
            </div>

            <p className="muted small">
              ${spend.cost.toFixed(3)} used this month over {spend.calls}{" "}
              {spend.calls === 1 ? "generation" : "generations"}
              {ai.monthlyCap > 0 ? ` · limit $${ai.monthlyCap.toFixed(2)}` : ""}
              {usage
                ? ` · last one took ${usage.attempts} ${
                    usage.attempts === 1 ? "try" : "tries"
                  } and cost $${usage.cost.toFixed(4)}`
                : ""}
            </p>
          </section>
        ) : null}

        <section className="add-step">
          <h3>{ai.apiKey ? "Or do it by hand" : "1 · Give the AI the instructions"}</h3>
          <p className="muted">
            Copy this and paste it into Gemini or ChatGPT, then describe the graphic you
            want underneath it. You can attach a reference image too.
          </p>
          <button onClick={() => copy(specForAI(), "spec")}>
            {copied === "spec" ? "Copied ✓" : "Copy the instructions"}
          </button>
        </section>

        <section className="add-step">
          {/* The numbering only means anything when the manual route is the
              only route. With the automatic panel above it, "2" refers to a
              step that is no longer on the page. */}
          <h3>{ai.apiKey ? "Paste a template" : "2 · Paste what it gives you back"}</h3>
          <p className="muted">
            Paste the whole reply — the code fences and any text around it are fine.
          </p>
          <textarea
            className="add-paste"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // Stale errors under a box you have already edited read as if the
              // new paste failed too.
              setProblems(null);
            }}
            placeholder="Paste here…"
            spellCheck={false}
          />
          <div className="btn-group">
            <button onClick={add} disabled={!text.trim()}>
              Add to my Library
            </button>
            {text.trim() ? (
              <button className="link" onClick={() => setText("")}>
                Clear
              </button>
            ) : null}
          </div>
        </section>

        {problems ? (
          <section className="add-problems">
            <h3>That didn&apos;t work</h3>
            <ul>
              {problems.map((p, i) => (
                <li key={i}>
                  <strong>{p.where}</strong> — {p.what}
                </li>
              ))}
            </ul>
            <p className="muted">
              You don&apos;t need to fix this yourself. Copy the message below, paste it
              back into the same chat, then paste the new reply above.
            </p>
            <button onClick={() => copy(repairPrompt(), "fix")}>
              {copied === "fix" ? "Copied ✓" : "Copy the fix-it message"}
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
};
