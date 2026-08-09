import { z } from "zod";
import { headline, toggle, withCommon } from "../fields";

/**
 * A single editorial line over footage, set low in the frame.
 *
 * Distinct from TextCard, which centres its text: centred type lands on the
 * middle of the frame, which in product footage is exactly where the product
 * is. A caption belongs under the subject, in the dead space most compositions
 * leave at the bottom -- so the line and the thing it describes can both be
 * seen at once.
 */
export const captionSchema = withCommon({
  text: headline("The line. One sentence — long copy defeats the format"),

  position: z
    .enum(["lower", "upper"])
    .describe(
      "Lower = under the subject, the default. Upper = for shots where the " +
        "subject sits low in frame",
    ),

  scrim: toggle(
    "Fade the footage behind the text so it stays readable over a bright plate",
  ),

  rule: toggle("Show a short brand-coloured rule above the line"),

  verdict: z
    .enum(["none", "dont", "do"])
    .describe(
      "Show a ✕/✓ badge before the line. Don't = red ✕, Do = green ✓. " +
        "Used by the do/don't series; 'none' is a plain caption",
    ),

  holdSeconds: z
    .number()
    .min(0.6)
    .max(6)
    .describe("How long the line stays after it has finished arriving"),
});

export type CaptionProps = z.infer<typeof captionSchema>;

export const captionDefaults: CaptionProps = {
  text: "Your patio has a curfew.",
  verdict: "none",
  position: "lower",
  scrim: true,
  rule: true,
  holdSeconds: 1.8,
  brand: "nestie",
  speed: 1,
  scale: 1,
  direction: "auto",
};

/** Words stagger in, the line holds, then it leaves faster than it arrived. */
export const captionSeconds = (props: CaptionProps) => {
  const words = props.text.trim().split(/\s+/).length;
  const inTime = 0.35 + Math.min(words * 0.07, 0.8);
  return (inTime + props.holdSeconds + 0.45) / (props.speed || 1);
};
