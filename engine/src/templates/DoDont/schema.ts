import { z } from "zod";
import { headline, withCommon } from "../fields";

/**
 * The recurring "do this, not that" card.
 *
 * Built as a *series* format rather than a one-off: the whole point is that
 * episode 4 looks identical to episode 1 so viewers recognise it in the feed.
 * That means the layout is fixed and only the pairs change — which is why the
 * pairs are an array rather than six flat fields. Duration follows the number
 * of pairs, so a three-pair episode isn't padded to the length of a five.
 */
export const doDontSchema = withCommon({
  headline: headline("Series title, e.g. 'Patio heating'"),

  pairs: z
    .array(
      z.object({
        dont: z
          .string()
          .max(90)
          .describe("The mistake — keep it to one short line"),
        do: z
          .string()
          .max(90)
          .describe("The fix — keep it to one short line"),
      }),
    )
    .min(1)
    .max(6)
    .describe("Each pair is shown in turn: the mistake, then the fix"),

  secondsPerPair: z
    .number()
    .min(1.2)
    .max(4)
    .describe("How long each pair holds on screen"),

  episode: z
    .string()
    .max(24)
    .describe("Episode marker shown small, e.g. 'No. 1' — leave empty to hide"),
});

export type DoDontProps = z.infer<typeof doDontSchema>;

export const doDontDefaults: DoDontProps = {
  headline: "Patio heating",
  episode: "No. 1",
  secondsPerPair: 2.2,
  pairs: [
    { dont: "Heater in the middle of an open deck", do: "Heat a sheltered corner" },
    { dont: "Anything under 3,000W in Canada", do: "3,000W and up" },
    { dont: "Gas under a fully enclosed patio", do: "Electric if it's covered" },
    { dont: "Propane at $3.00/hr", do: "Natural gas at $0.50/hr" },
  ],
  brand: "nestie",
  speed: 1,
  scale: 1,
  direction: "auto",
};

/** Intro beat, then each pair, then a short hold on the last one. */
export const doDontSeconds = (props: DoDontProps) =>
  1.1 + props.pairs.length * props.secondsPerPair + 0.8;
