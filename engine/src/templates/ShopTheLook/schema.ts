import { z } from "zod";
import { currency, headline, withCommon } from "../fields";

/**
 * The item list behind a room-makeover episode: what's in the shot, what it
 * costs, and where it came from.
 *
 * One template with a mode rather than two, because both views read the same
 * item array. A makeover reel uses `sequence` over the footage while the camera
 * moves, then `summary` at the end for the full list — same data, entered once,
 * so a price corrected in one place is corrected in both.
 *
 * `source` is deliberately free text rather than an enum. Naming the shops we
 * don't own is what makes the list credible, and that set is open-ended.
 */
const item = z.object({
  name: z
    .string()
    .max(60)
    .describe("What the item is, e.g. 'Linear electric fireplace'"),
  price: z
    .number()
    .min(0)
    .max(1_000_000)
    .describe("Price as a number only — the symbol comes from the Currency field"),
  source: z
    .string()
    .max(28)
    .describe("Where it's from, e.g. 'Nestie' or 'IKEA'"),
  ours: z
    .boolean()
    .describe("Tick for items we sell — these are highlighted in brand colour"),
});

export const shopTheLookSchema = withCommon({
  headline: headline("Episode title, e.g. 'Toronto condo living room'"),

  episode: z
    .string()
    .max(24)
    .describe("Episode marker shown small, e.g. 'Ep. 01' — leave empty to hide"),

  mode: z
    .enum(["sequence", "summary"])
    .describe(
      "Sequence = items appear one at a time over footage. " +
        "Summary = the full list with a total, for the end of the video",
    ),

  items: z
    .array(item)
    .min(1)
    .max(10)
    .describe("Everything in the room, in the order the camera reaches it"),

  currencySymbol: currency(),

  secondsPerItem: z
    .number()
    .min(0.8)
    .max(4)
    .describe("Sequence mode: how long each item holds on screen"),

  showTotal: z
    .boolean()
    .describe("Summary mode: show the combined total under the list"),

  totalLabel: z
    .string()
    .max(30)
    .describe("Wording above the total, e.g. 'The whole room'"),
});

export type ShopTheLookProps = z.infer<typeof shopTheLookSchema>;

export const shopTheLookDefaults: ShopTheLookProps = {
  headline: "Toronto condo living room",
  episode: "Ep. 01",
  mode: "summary",
  currencySymbol: "$",
  secondsPerItem: 1.6,
  showTotal: true,
  totalLabel: "The whole room",
  items: [
    { name: "Linear electric fireplace", price: 3200, source: "Nestie", ours: true },
    { name: "Brass pendant pair", price: 890, source: "Nestie", ours: true },
    { name: "Floor lamp", price: 240, source: "Nestie", ours: true },
    { name: "Sofa", price: 1100, source: "Elsewhere", ours: false },
    { name: "Rug 200×300", price: 350, source: "Elsewhere", ours: false },
    { name: "Coffee table", price: 180, source: "Elsewhere", ours: false },
  ],
  brand: "nestie",
  speed: 1,
  scale: 1,
  direction: "auto",
};

/**
 * Summary holds long enough to be read and screenshotted — that pause is the
 * point of the format, so it is not trimmed to feel brisk.
 */
export const shopTheLookSeconds = (props: ShopTheLookProps) =>
  props.mode === "sequence"
    ? 0.6 + props.items.length * props.secondsPerItem + 0.6
    : 0.8 + props.items.length * 0.22 + (props.showTotal ? 1.0 : 0) + 2.6;
