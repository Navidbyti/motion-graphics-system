import { z } from "zod";
import { headline, label, subline, toggle, withCommon } from "../fields";

/**
 * The Nestie sign-off, built to sit over live footage rather than a flat panel.
 *
 * Separate from the generic EndCard because that one shows a placeholder "N"
 * mark and renders its text in the brand's ink colour — which on Nestie, a
 * light brand, is near-black and vanishes over dusk footage. This one carries
 * the real logo and sets its type in white over a scrim, so it reads over the
 * looping fire it sits on.
 */
export const nestieEndCardSchema = withCommon({
  text: headline("The closing line, e.g. 'Everything for a home.'"),
  emphasis: label(
    "Word or phrase in the line to accent in orange (client's .oi-title em style). " +
      "e.g. 'home.' — leave empty for no accent",
  ),
  subline: subline("Supporting line under it. Leave empty to hide"),
  handle: label("Site / CTA shown at the bottom, e.g. nestie.com or 'Link in bio'"),
  showLogo: toggle("Show the Nestie logo above the line"),
});

export type NestieEndCardProps = z.infer<typeof nestieEndCardSchema>;

export const nestieEndCardDefaults: NestieEndCardProps = {
  text: "Everything for a home.",
  emphasis: "home.",
  subline: "Authorized dealer · full warranty · financing",
  handle: "nestie.com",
  showLogo: true,
  brand: "nestie",
  speed: 1,
  scale: 1,
  direction: "auto",
};

/** Logo and line stagger in, then the whole card holds. */
export const nestieEndCardSeconds = (props: NestieEndCardProps) =>
  (1.0 + 3.8) / (props.speed || 1);
