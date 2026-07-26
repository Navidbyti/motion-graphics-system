/**
 * GEMINI PROXY
 *
 * The UI owns the schema logic (that's where the Zod schemas live) and sends a
 * ready-made instruction plus response schema. This module's only jobs are to
 * hold the API key and to force structured output.
 *
 * The key never reaches the browser. In production it should additionally be
 * restricted to the Generative Language API and given a hard quota cap in Google
 * Cloud Console, so a leak has a ceiling rather than a bill.
 */

import { httpFetch } from "./http.mjs";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Default to the moving alias, not a pinned version.
 *
 * Learned the hard way: `gemini-2.0-flash` was pinned here and returns 404
 * "no longer available" — while still being advertised by the models list
 * endpoint, so it looks available right up until you call it. A pinned model in
 * an app running unattended on someone else's machine is a time bomb; a
 * behaviour shift in a data-filling task is a far smaller risk than the app
 * simply stopping one morning.
 */
export const MODEL = process.env.MG_GEMINI_MODEL ?? "gemini-flash-latest";

/** Discovered fallback, cached for the process once a 404 forces a lookup. */
let fallbackModel = null;

/**
 * If even the alias dies, find a live flash model rather than failing.
 * Excludes the specialised variants — image, tts, robotics, computer-use —
 * which take different inputs and would fail in confusing ways.
 */
const discoverModel = async (key) => {
  if (fallbackModel) return fallbackModel;

  const res = await httpFetch(`${ENDPOINT}?key=${key}&pageSize=200`);
  if (!res.ok) return null;
  const body = await res.json();

  const usable = (body.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => m.name.replace("models/", ""))
    .filter(
      (n) =>
        n.includes("flash") &&
        !/(tts|image|robotics|computer-use|lyria|omni|banana)/.test(n),
    );

  // Prefer a "-latest" alias; otherwise take the newest-looking entry.
  fallbackModel =
    usable.find((n) => n.endsWith("-latest")) ?? usable[usable.length - 1] ?? null;

  if (fallbackModel) {
    console.warn(`[gemini] "${MODEL}" unavailable — falling back to "${fallbackModel}"`);
  }
  return fallbackModel;
};

export const hasApiKey = () =>
  Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);

export const generateProps = async ({ instruction, responseSchema }) => {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      "No Gemini API key configured. Set GEMINI_API_KEY and restart the app.",
    );
  }

  const payload = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: instruction }] }],
    generationConfig: {
      // Structured output: the model cannot return prose, only an object
      // matching the template's own fields.
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.4,
    },
  });

  const post = (model) =>
    httpFetch(`${ENDPOINT}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

  let res = await post(fallbackModel ?? MODEL);

  // A 404 means the model was retired, not that the request was wrong. Find a
  // live one and retry once before surfacing anything to the editor.
  if (res.status === 404) {
    const alternative = await discoverModel(key);
    if (alternative) res = await post(alternative);
  }

  if (!res.ok) {
    const detail = await res.text();
    // Logged verbatim for us, summarised for the editor — a raw Google error
    // payload is not a useful thing to put in front of him.
    console.error(`[gemini] ${res.status} ${detail.slice(0, 300)}`);
    if (res.status === 400) throw new Error("The request didn't fit the template.");
    // A 403 here is usually NOT a bad key — it's Google's edge refusing the
    // connection, typically because the request bypassed the proxy. The key
    // being fine makes this maximally confusing, so say both.
    if (res.status === 403)
      throw new Error(
        "Google refused the request. Usually a proxy/network issue rather than " +
          "a bad key — check the server log.",
      );
    if (res.status === 404) throw new Error("No usable Gemini model is available.");
    if (res.status === 429) throw new Error("Rate limited — wait a moment and retry.");
    throw new Error(`Gemini request failed (${res.status}).`);
  }

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned malformed JSON.");
  }
};
