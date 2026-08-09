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

import { useState } from "react";
import { templateFileSchema, type TemplateFile } from "@engine/authoring/format";
import { saveTemplate } from "./customTemplates";
import { specForAI } from "./spec";

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
}> = ({ onBack, onAdded }) => {
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  /** Everything the model needs to fix it, in one paste. */
  const repairPrompt = () =>
    [
      "The template you gave me was rejected. Fix these problems and return the",
      "complete corrected JSON, nothing else:",
      "",
      ...(problems ?? []).map((p) => `- ${p.where}: ${p.what}`),
      "",
      "Here is the template you gave me:",
      "",
      "```json",
      extractJson(text),
      "```",
    ].join("\n");

  return (
    <main className="docs">
      <div className="docs-bar">
        <button onClick={onBack}>‹ Library</button>
        <h2>Add a template</h2>
      </div>

      <div className="docs-body add-template">
        <section className="add-step">
          <h3>1 · Give the AI the instructions</h3>
          <p className="muted">
            Copy this and paste it into Gemini or ChatGPT, then describe the graphic you
            want underneath it. You can attach a reference image too.
          </p>
          <button onClick={() => copy(specForAI(), "spec")}>
            {copied === "spec" ? "Copied ✓" : "Copy the instructions"}
          </button>
        </section>

        <section className="add-step">
          <h3>2 · Paste what it gives you back</h3>
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
