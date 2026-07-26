import { z } from "zod";
import { headline, label, toggle, withCommon } from "../fields";

export const lowerThirdSchema = withCommon({
  name: headline("Person's name"),

  role: label("Their role or title"),

  handle: label("Optional handle or site, e.g. @cashforchat. Leave empty to hide"),

  panel: toggle(
    "Show a translucent panel behind the text so it stays readable over any footage",
  ),

  seconds: z
    .number()
    .min(2)
    .max(12)
    .describe("How long it stays on screen, in seconds"),
});

export type LowerThirdProps = z.infer<typeof lowerThirdSchema>;

export const lowerThirdDefaults: LowerThirdProps = {
  brand: "cashForChat",
  name: "Emma Johnson",
  role: "Life Coach",
  handle: "cashforchat.com",
  panel: true,
  seconds: 5,
  speed: 1,
};

export const TIMING = {
  intro: 0.15,
  outro: 0.4,
} as const;

/**
 * Duration is the editor's chosen on-screen time plus the exit — so "5 seconds"
 * means five seconds of it actually being readable, not five seconds including
 * the animation.
 */
export const lowerThirdSeconds = (seconds: number, speed: number) =>
  seconds + TIMING.outro / speed;
