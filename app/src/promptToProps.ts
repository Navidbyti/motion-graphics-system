/**
 * PROMPT → PROPS
 *
 * The model fills in *data*, never code. Its output is a partial props object
 * validated against the template's own Zod schema, so the worst case is a
 * rejected patch and a retry — there is nothing it can return that breaks a
 * render or produces an invalid frame.
 *
 * Two deliberate choices:
 *
 *  - It returns a PATCH, not a full props object. A prompt about the price
 *    can't silently blank the ticker, and the editor's existing tweaks survive.
 *  - Validation failures are fed back and retried. A cheap model doesn't have to
 *    be right first time; it only has to converge.
 */

import type { z } from "zod";
import { fieldEntries, toGeminiSchema } from "./schemaIntrospect";

export type ModelCall = (args: {
  instruction: string;
  responseSchema: unknown;
}) => Promise<unknown>;

export type PromptResult =
  | { ok: true; props: Record<string, unknown>; attempts: number }
  | { ok: false; attempts: number; message: string };

type Template = {
  title: string;
  schema: z.ZodTypeAny;
  labels?: Record<string, string>;
};

/** Compact, readable summary of what went wrong, for the retry. */
const formatIssues = (error: z.ZodError) =>
  error.issues
    .slice(0, 8)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");

export const buildInstruction = ({
  template,
  currentProps,
  userPrompt,
  feedback,
}: {
  template: Template;
  currentProps: Record<string, unknown>;
  userPrompt: string;
  feedback?: string;
}) => {
  const fields = fieldEntries(template.schema, template.labels)
    .filter((f) => f.kind.kind !== "unsupported")
    .map((f) => `- ${f.key}: ${f.label}`)
    .join("\n");

  return [
    `You are filling in the settings for a motion graphics template called "${template.title}".`,
    "",
    "Fields you may set:",
    fields,
    "",
    "Current settings:",
    JSON.stringify(currentProps, null, 2),
    "",
    `The user asked: "${userPrompt}"`,
    "",
    "Rules:",
    "- Return ONLY the fields that need to change. Omit everything else.",
    "- Never invent a field that is not listed above.",
    "- Keep any numeric data internally consistent and realistic.",
    "- If the request mentions data, prices, counts or a series, you MUST return",
    "  the complete data array — every item, regenerated from scratch. Do not",
    "  return only the text fields and leave the data untouched.",
    "- For price data: `high` must be the highest of the four values and `low`",
    "  the lowest, on every single item.",
    "- If the request is unrelated to these fields, return an empty object.",
    feedback
      ? `\nYour previous answer was rejected. Fix these problems:\n${feedback}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
};

/**
 * Runs the generate → validate → retry loop.
 *
 * `call` is injected so the loop can be exercised without a network or an API
 * key — the retry behaviour is the part most worth testing, and it's the part
 * hardest to trigger on demand against a real model.
 */
export const applyPrompt = async ({
  template,
  currentProps,
  userPrompt,
  call,
  maxAttempts = 3,
}: {
  template: Template;
  currentProps: Record<string, unknown>;
  userPrompt: string;
  call: ModelCall;
  maxAttempts?: number;
}): Promise<PromptResult> => {
  const responseSchema = toGeminiSchema(template.schema, template.labels);
  let feedback: string | undefined;
  let lastMessage = "The model did not return usable settings.";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let patch: unknown;
    try {
      patch = await call({
        instruction: buildInstruction({ template, currentProps, userPrompt, feedback }),
        responseSchema,
      });
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
      // A transport failure won't be fixed by rephrasing — stop immediately
      // rather than burning the remaining attempts on the same error.
      return { ok: false, attempts: attempt, message: lastMessage };
    }

    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      feedback = "- (root): expected a JSON object of settings";
      lastMessage = "The model returned something that wasn't a settings object.";
      continue;
    }

    /**
     * Completeness check — catches the worst failure mode, which validation
     * cannot see.
     *
     * Asked for "10 candles from 61200 to 68400", the model would reliably
     * return only `ticker` and `subtitle` and leave the data alone. That patch
     * validates perfectly — the *existing* candles are still valid — so the
     * editor gets a cheerful "Done" and an unchanged chart. A silent no-op is
     * far worse than a visible rejection.
     *
     * Heuristic, deliberately: if the request contains numbers and the template
     * has a data array the model didn't touch, assume it skipped the real work
     * and say so explicitly.
     */
    const arrayFields = fieldEntries(template.schema, template.labels)
      .filter((f) => f.kind.kind === "objectArray")
      .map((f) => f.key);
    const asksForData = /\d/.test(userPrompt);
    const patchKeys = Object.keys(patch as Record<string, unknown>);

    if (asksForData && arrayFields.length > 0 && !arrayFields.some((k) => patchKeys.includes(k))) {
      feedback = arrayFields
        .map(
          (k) =>
            `- ${k}: the request describes data, so you must return the complete ` +
            `${k} array with every item regenerated. You returned only ` +
            `[${patchKeys.join(", ") || "nothing"}].`,
        )
        .join("\n");
      lastMessage = "The model didn't fill in the data.";
      continue;
    }

    const merged = { ...currentProps, ...(patch as Record<string, unknown>) };
    const parsed = template.schema.safeParse(merged);

    if (parsed.success) {
      return {
        ok: true,
        props: parsed.data as Record<string, unknown>,
        attempts: attempt,
      };
    }

    feedback = formatIssues(parsed.error);
    lastMessage = "Couldn't build settings that fit this template.";
  }

  return { ok: false, attempts: maxAttempts, message: lastMessage };
};

/** Talks to the render server, which holds the API key. */
export const serverModelCall: ModelCall = async ({ instruction, responseSchema }) => {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, responseSchema }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body.data;
};
