/**
 * MOTION LANGUAGE — the shared feel of every template.
 *
 * This is where "top tier" actually lives. Individual templates compose these
 * primitives; they should almost never define a raw spring or bezier inline.
 * Change a curve here and the whole library shifts together.
 *
 * Adapted from Emil Kowalski's animation standards. His duration rules target
 * interactive UI (<300ms, because the user is waiting on it); video motion is
 * watched rather than operated, so entrances here run longer and more
 * expressively. What transfers directly, and is applied below:
 *   - strong custom curves, never the weak built-in ease-*
 *   - ease-out to enter, ease-in-out to move on screen, never ease-in
 *   - never scale from 0 — nothing in the real world appears from nothing
 *   - subtle spring bounce; overshoot is seasoning, not the meal
 *   - stagger group entrances rather than firing them together
 */

import { Easing, interpolate, spring } from "remotion";

/* ------------------------------------------------------------------ *
 * Springs
 * ------------------------------------------------------------------ */

/**
 * Critical damping = 2 * sqrt(stiffness * mass).
 * Below it → overshoot. Above it → none. Each preset notes where it sits, so
 * tuning is a decision rather than a guess.
 */
export const SPRING = {
  /** Overdamped. Fast, no bounce. Titles, labels, anything text-heavy. */
  snappy: { damping: 26, mass: 0.5, stiffness: 200 },

  /** Slightly underdamped (crit ≈ 17). The house default — arrives with life. */
  settle: { damping: 14, mass: 0.6, stiffness: 120 },

  /** Clearly underdamped (crit ≈ 22). Badges, stamps, accents. Use sparingly. */
  pop: { damping: 12, mass: 0.7, stiffness: 180 },

  /** Weighty, barely overshoots (crit ≈ 22). Big objects landing — candles, cards. */
  heavy: { damping: 20, mass: 1.4, stiffness: 90 },

  /** No overshoot at all. For anything that must land exactly on a value. */
  exact: { damping: 200, mass: 1, stiffness: 200 },
} as const;

export type SpringName = keyof typeof SPRING;

/* ------------------------------------------------------------------ *
 * Easing curves
 * ------------------------------------------------------------------ */

/**
 * Built-in CSS easings are too weak to read on video. These are the strong
 * curves. Never use an ease-in for an entrance: it starts slow and wastes the
 * exact moment the viewer is looking.
 */
export const EASE = {
  /** Strong ease-out. Default for anything entering or exiting. */
  out: Easing.bezier(0.23, 1, 0.32, 1),
  /** Strong ease-in-out. For things moving or morphing on screen. */
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  /** iOS-like. Sliding panels, wipes, reveals. */
  glide: Easing.bezier(0.32, 0.72, 0, 1),
  /** Constant. Marquees, tickers, progress. Nothing else. */
  linear: Easing.linear,
} as const;

/* ------------------------------------------------------------------ *
 * Time helpers
 * ------------------------------------------------------------------ */

/** Seconds → frames. Templates should express timing in seconds, not frames. */
export const sec = (seconds: number, fps: number) => Math.round(seconds * fps);

/**
 * Stagger delay for item `index`, in frames.
 * 40–90ms per item reads well on video: enough to perceive sequence, not so
 * much that the group feels sluggish. Caps so long lists don't crawl.
 */
export const stagger = (
  index: number,
  fps: number,
  { per = 0.06, max = 0.6 }: { per?: number; max?: number } = {},
) => Math.min(sec(index * per, fps), sec(max, fps));

/* ------------------------------------------------------------------ *
 * Entrance primitives
 * ------------------------------------------------------------------ */

export type EnterOptions = {
  frame: number;
  fps: number;
  /** Frames to wait before starting. Pair with `stagger()` for groups. */
  delay?: number;
  spring?: SpringName;
};

/** Spring progress from 0 → 1. The basis of every entrance in the library. */
export const enter = ({ frame, fps, delay = 0, spring: name = "settle" }: EnterOptions) =>
  spring({ frame, fps, delay, config: SPRING[name] });

/**
 * Fade up — the workhorse entrance.
 * Travels a short distance; long slides read as cheap. Returns a style object
 * ready to spread onto an element.
 */
export const fadeUp = (opts: EnterOptions & { distance?: number }) => {
  const p = enter(opts);
  const distance = opts.distance ?? 48;
  return {
    opacity: interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" as const }),
    transform: `translateY(${interpolate(p, [0, 1], [distance, 0])}px)`,
  };
};

/**
 * Scale in. Never from 0 — starts at 0.94 so the element has presence from the
 * first frame it exists, the way real objects do.
 */
export const scaleIn = (opts: EnterOptions & { from?: number }) => {
  const p = enter(opts);
  const from = opts.from ?? 0.94;
  return {
    opacity: interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" as const }),
    transform: `scale(${interpolate(p, [0, 1], [from, 1])})`,
  };
};

/**
 * Mask reveal via clip-path — each value eats in from that side.
 * Reads as far more considered than a plain fade for headlines and images.
 */
export const wipeUp = (opts: EnterOptions) => {
  const p = enter({ ...opts, spring: opts.spring ?? "snappy" });
  return {
    clipPath: `inset(${interpolate(p, [0, 1], [100, 0], {
      extrapolateRight: "clamp" as const,
    })}% 0 0 0)`,
  };
};

/* ------------------------------------------------------------------ *
 * Exit
 * ------------------------------------------------------------------ */

/**
 * Exit progress 1 → 0, timed backwards from the end of a sequence.
 * Exits should be quicker than entrances — the viewer has already read it.
 */
export const exit = ({
  frame,
  fps,
  durationInFrames,
  duration = 0.35,
}: {
  frame: number;
  fps: number;
  durationInFrames: number;
  duration?: number;
}) => {
  const exitFrames = sec(duration, fps);
  const start = durationInFrames - exitFrames;
  return interpolate(frame, [start, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.out,
  });
};

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

/**
 * Count a number up. Always render the result with `fontVariantNumeric:
 * "tabular-nums"` — proportional digits jitter horizontally as they change,
 * which is the single most common tell of an amateur price counter.
 */
export const countUp = ({
  frame,
  fps,
  from,
  to,
  delay = 0,
  duration = 1.2,
}: {
  frame: number;
  fps: number;
  from: number;
  to: number;
  delay?: number;
  duration?: number;
}) =>
  interpolate(frame, [delay, delay + sec(duration, fps)], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.out,
  });

/** Style fragment for any element displaying changing digits. */
export const tabular = { fontVariantNumeric: "tabular-nums" } as const;
