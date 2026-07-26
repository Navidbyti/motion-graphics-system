import { z } from "zod";
import { cta, headline, label, subline, toggle, withCommon } from "../fields";

export const endCardSchema = withCommon({
  text: headline("The closing line — the one thing to remember"),

  subline: subline("Supporting line under it. Leave empty to hide"),

  action: cta("Call to action, e.g. Book now or Start free"),

  handle: label("Site or handle shown at the bottom, e.g. freehotelcard.com"),

  showMark: toggle("Show the brand mark above the text"),

  scrim: toggle("Darken the background so the text stays readable over footage"),
});

export type EndCardProps = z.infer<typeof endCardSchema>;

export const endCardDefaults: EndCardProps = {
  brand: "freeHotelCard",
  text: "Lock today's rates for 20 years",
  subline: "One card. Every hotel. No inflation.",
  action: "Get your card",
  handle: "freehotelcard.com",
  showMark: true,
  scrim: true,
  scale: 1,
  direction: "auto",
  speed: 1,
};

export const TIMING = {
  intro: 0.25,
  /** Each element enters after the one above it. */
  stagger: 0.12,
  hold: 1.8,
  outro: 0.45,
} as const;

export const endCardSeconds = (speed: number) =>
  (TIMING.intro + TIMING.stagger * 4 + TIMING.hold + TIMING.outro) / speed;
