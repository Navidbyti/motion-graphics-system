/**
 * DESCRIBE A GRAPHIC → A VALID TEMPLATE.
 *
 * The model is not the interesting part. The same model with the same
 * instructions writes the same first draft whether it is called from here or
 * pasted into a browser tab — paying per call buys nothing on quality by
 * itself.
 *
 * What it buys is the LOOP. The validator already produces exact, machine-
 * readable errors; handing those straight back and asking again takes seconds
 * and usually works, because most rejected drafts are one missing field from
 * correct. A person gives up after one bad reply. This does not.
 *
 * Runs in the browser, calling Google directly. The key is the editor's own,
 * stays on their machine, and never passes through anything of ours — which is
 * what makes this safe in a public repo. A shared key would need distributing
 * with the .exe and a proxy to hide it, which is exactly why the first version
 * of this feature was deleted.
 *
 * ── Not burning money ──────────────────────────────────────────────────────
 *
 * The instruction sheet is ~5,600 tokens and dominates every call, so:
 *
 *   · it is sent ONCE, on the first attempt;
 *   · a repair gets the draft and the complaints — about 2,000 tokens — because
 *     the model that wrote it does not need re-teaching the format to fix a
 *     duplicate id;
 *   · the reference image goes on the first attempt only. It is the single most
 *     expensive part of the call and it cannot change between attempts.
 *
 * That makes a three-attempt generation cost roughly 1.6× a one-attempt one
 * rather than 3×.
 */

import { templateFileSchema, type TemplateFile } from "@engine/authoring/format";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Attempts in total, including the first.
 *
 * Three, because the failure curve is steep. A draft still invalid after two
 * repairs is usually wrong about what was ASKED rather than about the format,
 * and a fourth attempt pays again to re-decide the same thing. At that point
 * the errors belong in front of the person, who can see what the model cannot.
 */
export const MAX_ATTEMPTS = 3;

/**
 * Published rates per million tokens, rounded UP.
 *
 * An estimate that flatters the cost is worse than no estimate at all when the
 * entire reason it is on screen is to prevent a surprise. Verify against
 * Google's pricing page when it moves.
 */
export const MODELS = {
  "gemini-2.5-flash": {
    label: "Flash — fast and cheap",
    hint: "Right for almost everything. A template costs well under a cent.",
    in: 0.3,
    out: 2.5,
  },
  "gemini-2.5-pro": {
    label: "Pro — slower, better at intricate ones",
    hint: "Worth it for charts with indicators. Around 2¢ a template.",
    in: 1.25,
    out: 10,
  },
} as const;

export type ModelName = keyof typeof MODELS;

export const costOf = (model: ModelName, inTokens: number, outTokens: number) => {
  const rate = MODELS[model] ?? MODELS["gemini-2.5-flash"];
  return (inTokens / 1e6) * rate.in + (outTokens / 1e6) * rate.out;
};

export type Usage = {
  model: ModelName;
  attempts: number;
  inTokens: number;
  outTokens: number;
  cost: number;
};

export type Problem = { where: string; what: string };

/** Zod's path as something findable in the JSON someone is looking at. */
const describePath = (path: (string | number)[]): string =>
  path.length
    ? path
        .map((p, i) => (typeof p === "number" ? `#${p + 1}` : i === 0 ? p : `→ ${p}`))
        .join(" ")
    : "the template itself";

const validate = (
  value: unknown,
): { ok: true; template: TemplateFile } | { ok: false; problems: Problem[] } => {
  const result = templateFileSchema.safeParse(value);
  if (result.success) return { ok: true, template: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((i) => ({
      where: describePath(i.path),
      what: i.message,
    })),
  };
};

/* ------------------------------------------------------------------ */

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

const callGemini = async (
  key: string,
  model: ModelName,
  parts: Part[],
  signal?: AbortSignal,
) => {
  const response = await fetch(
    `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          /*
            The reply is a JSON object and nothing else. Asking for that in the
            prompt works most of the time; asking for it here works always, and
            takes the fenced-code stripping off the happy path entirely.
          */
          responseMimeType: "application/json",
          // Near-zero. This is a format-following task, and temperature is
          // where "invented a property that does not exist" comes from.
          temperature: 0.2,
        },
      }),
    },
  );

  const text = await response.text();

  if (!response.ok) {
    /*
      Google's own message, passed through. An invalid key, an API that was
      never enabled and an exhausted quota need three different actions from
      the person reading this, and "generation failed" tells them none of them.
    */
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text)?.error?.message ?? detail;
    } catch {
      /* not JSON — the raw body is the best available */
    }
    throw new Error(detail);
  }

  const data = JSON.parse(text);
  const candidate = data.candidates?.[0];

  return {
    text:
      (candidate?.content?.parts as { text?: string }[] | undefined)
        ?.map((p) => p.text ?? "")
        .join("") ?? "",
    // Google reports real counts. The spend figure is only worth showing if it
    // matches the bill, so these are preferred over any estimate of ours.
    inTokens: (data.usageMetadata?.promptTokenCount as number) ?? 0,
    outTokens: (data.usageMetadata?.candidatesTokenCount as number) ?? 0,
    finish: candidate?.finishReason as string | undefined,
  };
};

export class GenerateError extends Error {
  problems: Problem[];
  /** The last thing the model produced — usually close, and worth keeping. */
  draft: string | null;
  usage: Usage | null;

  constructor(
    message: string,
    opts: { problems?: Problem[]; draft?: string | null; usage?: Usage | null } = {},
  ) {
    super(message);
    this.problems = opts.problems ?? [];
    this.draft = opts.draft ?? null;
    this.usage = opts.usage ?? null;
  }
}

export const generateTemplate = async ({
  key,
  model,
  spec,
  request,
  image,
  signal,
  onProgress = () => {},
}: {
  key: string;
  model: ModelName;
  /** The instruction sheet — the same one the manual flow copies. */
  spec: string;
  request: string;
  /** A reference image as a data URL. First attempt only. */
  image?: string | null;
  signal?: AbortSignal;
  onProgress?: (s: { stage: "writing" | "fixing"; attempt: number }) => void;
}): Promise<{ template: TemplateFile; usage: Usage }> => {
  if (!key.trim()) throw new GenerateError("No Gemini API key set — add one in Theme.");
  if (!request.trim()) throw new GenerateError("Describe the graphic you want first.");

  let inTokens = 0;
  let outTokens = 0;
  let draft: string | null = null;
  let problems: Problem[] = [];

  const usage = (attempts: number): Usage => ({
    model,
    attempts,
    inTokens,
    outTokens,
    cost: costOf(model, inTokens, outTokens),
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress({ stage: attempt === 1 ? "writing" : "fixing", attempt });

    const parts: Part[] = [];

    if (attempt === 1) {
      parts.push({ text: `${spec}\n\n${request.trim()}` });
      if (image?.startsWith("data:")) {
        const [meta, b64] = image.split(",");
        const mimeType = meta.slice(5).split(";")[0] || "image/png";
        if (b64) parts.push({ inlineData: { mimeType, data: b64 } });
      }
    } else {
      parts.push({
        text: [
          "This template was rejected by the validator. Fix ONLY these problems",
          "and return the complete corrected JSON object. Change nothing else.",
          "",
          ...problems.map((p) => `- ${p.where}: ${p.what}`),
          "",
          "The template:",
          draft ?? "",
        ].join("\n"),
      });
    }

    const result = await callGemini(key, model, parts, signal);
    inTokens += result.inTokens;
    outTokens += result.outTokens;

    if (result.finish === "SAFETY") {
      throw new GenerateError(
        "Gemini refused this request. Rephrase it and try again.",
        { usage: usage(attempt) },
      );
    }
    if (result.finish === "MAX_TOKENS") {
      throw new GenerateError(
        "The reply was cut off before it finished. Ask for something simpler.",
        { draft: result.text, usage: usage(attempt) },
      );
    }

    // responseMimeType makes fences unlikely, not impossible.
    const body = result.text.trim();
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    draft = start === -1 ? body : body.slice(start, end + 1);

    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      problems = [{ where: "the JSON", what: `could not be read — ${(e as Error).message}` }];
      continue;
    }

    const verdict = validate(parsed);
    if (verdict.ok) return { template: verdict.template, usage: usage(attempt) };
    problems = verdict.problems;
    // Re-serialised so the repair sees exactly what was parsed, not whatever
    // whitespace or stray prose came around it.
    draft = JSON.stringify(parsed);
  }

  /*
    Out of attempts, but the draft goes back regardless. It is usually close,
    the paste box is on the same screen, and discarding three calls' work
    because the last one had a typo is the expensive outcome.
  */
  throw new GenerateError(
    `Couldn't get a valid template in ${MAX_ATTEMPTS} tries. The closest attempt is below — fix it by hand or try a different description.`,
    { problems, draft, usage: usage(MAX_ATTEMPTS) },
  );
};

/* ------------------------------------------------------------------ *
 * Revision
 * ------------------------------------------------------------------ */

/**
 * Fix a template that is valid but wrong, from a rendered frame and a
 * complaint.
 *
 * The generation loop closes the gap between "invalid" and "valid". This closes
 * the one between "valid" and "good", and it is a different problem: nothing in
 * the schema knows that a caption is sitting on top of a candle.
 *
 * The complaint comes from the PERSON, deliberately. Asking a model to look at
 * its own output and say whether it is good produces either "yes, this
 * effectively communicates the concept" or an invented flaw that breaks
 * something which worked — self-assessment is the weakest thing a model does.
 * The editor knows what they wanted and can say it in six words, and an exact
 * complaint is precisely the shape the repair loop already succeeds on.
 *
 * Cheaper than generating, too: no instruction sheet. The model is editing a
 * template it can see rather than learning a format, so it gets the frame, the
 * current JSON, and the sentence — about 2,800 tokens against 6,200.
 */
export const reviseTemplate = async ({
  key,
  model,
  template,
  complaint,
  frame,
  signal,
}: {
  key: string;
  model: ModelName;
  /** The template as it stands, including whatever the editor has changed. */
  template: TemplateFile;
  /** What is wrong, in the editor's words. May be empty — then it just looks. */
  complaint: string;
  /** A still of the moment being complained about, as a data URL. */
  frame: string;
  signal?: AbortSignal;
}): Promise<{ template: TemplateFile; usage: Usage }> => {
  if (!key.trim()) throw new GenerateError("No Gemini API key set — add one in Theme.");

  const [meta, b64] = frame.split(",");
  const mimeType = meta.slice(5).split(";")[0] || "image/png";
  if (!b64) throw new GenerateError("Couldn't render the frame to look at.");

  const parts: Part[] = [
    {
      text: [
        "The image is a frame rendered from the template below. Something is",
        "wrong with how it looks.",
        "",
        complaint.trim()
          ? `What the person who made it says is wrong:\n${complaint.trim()}`
          : "They have not said what is wrong. Find the most obvious visual problem.",
        "",
        "Fix it by changing this template. Rules:",
        "- Return the complete JSON object, same shape, nothing else.",
        "- Change as little as possible. Do not restyle things that are fine.",
        "- Do not change the `fields` array or any `default` value — those are",
        "  the editor's content, not yours.",
        "- Layout problems are almost always `box` (x, y, w, anchor) or overlapping",
        "  `motion.at` timings. Prefer moving something to inventing a layer.",
        "",
        "The template:",
        JSON.stringify(template),
      ].join("\n"),
    },
    { inlineData: { mimeType, data: b64 } },
  ];

  const result = await callGemini(key, model, parts, signal);
  const usage: Usage = {
    model,
    attempts: 1,
    inTokens: result.inTokens,
    outTokens: result.outTokens,
    cost: costOf(model, result.inTokens, result.outTokens),
  };

  if (result.finish === "SAFETY") {
    throw new GenerateError("Gemini refused to answer. Rephrase what's wrong.", { usage });
  }

  const body = result.text.trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const json = start === -1 ? body : body.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new GenerateError(`The reply wasn't readable — ${(e as Error).message}`, {
      draft: json,
      usage,
    });
  }

  const verdict = validate(parsed);
  if (!verdict.ok) {
    /*
      No repair loop here. A revision that comes back invalid means the model
      misunderstood the request rather than fumbled a field, and spending
      another call to re-fix a fix is how a cheap feature becomes an expensive
      one. The editor tries again with clearer words, which is also faster.
    */
    throw new GenerateError(
      "The fix came back invalid. Try describing the problem differently.",
      { problems: verdict.problems, draft: json, usage },
    );
  }

  return { template: verdict.template, usage };
};
