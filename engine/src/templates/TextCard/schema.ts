import { z } from "zod";
import { label, toggle, withCommon } from "../fields";

/**
 * One template with animation and background as dropdowns, rather than five
 * near-identical templates. The editor browses a Library of *things*, not a
 * Library of variations — "Text Card / typewriter / bubble" is one decision in
 * two clicks instead of five cards to scroll past.
 */
export const textCardSchema = withCommon({
  text: z
    .string()
    .max(400)
    .describe("The text. Short lines hit harder; long text is sized down to fit"),

  animation: z
    .enum(["words", "typewriter", "lines", "rise", "pop"])
    .describe(
      "How the text arrives. Words = staggered, Typewriter = typed out, " +
        "Lines = revealed line by line, Rise = fades up as a block, Pop = scales in",
    ),

  background: z
    .enum([
      "native",
      "glass",
      "whiteGlass",
      "clay",
      "pill",
      "brutalist",
      "solid",
      "gradient",
      "scrim",
      "none",
    ])
    .describe(
      "Native = iMessage-style bubble, Glass = dark frosted glass with edge " +
        "light, White glass = bright frosted panel, Clay = soft 3D bubble, " +
        "Pill = minimal rounded tag, Brutalist = hard box with offset shadow, " +
        "Solid/Gradient = brand card, Scrim = darkened footage, None = text only",
    ),

  typing: toggle(
    "On the Native bubble, show a typing indicator before the text arrives",
  ),

  align: z.enum(["start", "center"]).describe("Text alignment"),

  emphasis: label(
    "One word to pick out in the accent colour. Leave empty for none",
  ),

  holdSeconds: z
    .number()
    .min(0.5)
    .max(8)
    .describe("How long the finished text stays on screen"),

  showTail: toggle("On the bubble background, show the speech-bubble tail"),
});

export type TextCardProps = z.infer<typeof textCardSchema>;

export const textCardDefaults: TextCardProps = {
  brand: "cashForChat",
  text: "Talk to someone who's actually done it.",
  animation: "words",
  background: "native",
  align: "start",
  emphasis: "actually",
  holdSeconds: 2,
  showTail: true,
  typing: true,
  scale: 1,
  direction: "ltr",
  speed: 1,
};

export const TIMING = {
  intro: 0.2,
  /** Per word, for the staggered modes. */
  perWord: 0.07,
  /** Per character, for the typewriter. */
  perChar: 0.035,
  outro: 0.45,
} as const;

export const wordsOf = (text: string) =>
  text.trim().split(/\s+/).filter(Boolean);

export const linesOf = (text: string) =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** The reveal takes different time per animation, so duration follows content. */
export const textCardSeconds = (
  text: string,
  animation: TextCardProps["animation"],
  holdSeconds: number,
  speed: number,
  /** The typing indicator adds time before the text starts revealing. */
  typing = false,
) => {
  const reveal =
    animation === "typewriter"
      ? text.trim().length * TIMING.perChar
      : animation === "words"
        ? wordsOf(text).length * TIMING.perWord
        : animation === "lines"
          ? Math.max(linesOf(text).length, 1) * 0.18
          : 0.35;

  return (
    (TIMING.intro + (typing ? 0.85 : 0) + reveal + holdSeconds + TIMING.outro) / speed
  );
};
