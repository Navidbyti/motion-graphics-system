/**
 * CANDLE CHART — the flagship template.
 *
 * Design notes worth keeping, because they're the difference between this and a
 * generated chart:
 *
 * - Candles grow *from their open price* outward to close, which is how a candle
 *   actually forms. Growing from the axis, or fading in, reads as a chart drawing
 *   itself rather than a market moving.
 * - The wick trails the body by a few frames. That secondary motion is most of
 *   why the sequence feels physical rather than mechanical.
 * - Geometry is percentage-based, so the whole chart is format-independent — no
 *   pixel math to re-tune for square or landscape.
 * - Everything sits on a translucent dark card. That's not decoration: it's what
 *   satisfies the overlay rule, since white type on bare transparency vanishes
 *   over bright footage.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  radius,
  safe,
  shadow,
  space,
  type,
  weight,
} from "../../brand/tokens";
import { useTheme } from "../../brand/useTheme";
import { EASE, SPRING, fadeUp, scaleIn, sec, tabular } from "../../motion";
import { spring } from "remotion";
import { TIMING, type CandleChartProps } from "./schema";

export const CandleChart: React.FC<CandleChartProps> = ({
  brand,
  theme,
  ticker,
  subtitle,
  candles,
  currency,
  decimals,
  showGrid,
  showDelta,
  highlightLast,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const isVertical = height > width;

  /**
   * Scale against the SHORTER side, not the width.
   *
   * The video-layout guidance says to scale type with composition width, which
   * is right when comparing two frames of the same aspect. Across aspects it
   * fails badly: a 1920×1080 landscape frame is no physically bigger than a
   * 1080×1920 vertical one, so width-scaling made landscape type 1.8× too large
   * and swallowed the chart. The short side is what actually bounds legibility.
   */
  const px = (n: number) => (n * Math.min(width, height)) / 1080;

  /**
   * Brand identity: palette, typeface and motion personality all come from the
   * selected brand rather than from static tokens, so one template renders
   * correctly as Cash for Chat, Billionaire Signal or Free Hotel Card.
   */
  const b = useTheme(brand, theme);
  const { palette, font } = b;
  const bullColor = palette.positive;
  const bearColor = palette.negative;

  /* ---------------- price scale ---------------- */

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const rawLo = Math.min(...lows);
  const rawHi = Math.max(...highs);
  /**
   * Headroom so the extremes never touch the chart edge — but proportional to
   * how much vertical room there actually is. A fixed 14% is fine in a tall
   * frame and wasteful in a wide one, where the plot is already short: the
   * candles end up squashed into a thin band with dead space above and below.
   */
  const pad = (rawHi - rawLo) * (height > width ? 0.14 : 0.07) || 1;
  const lo = rawLo - pad;
  const hi = rawHi + pad;

  /** Price → percentage up from the bottom of the chart box. */
  const pct = (price: number) => ((price - lo) / (hi - lo)) * 100;

  /* ---------------- timing ---------------- */

  const introF = (TIMING.intro * fps) / (speed * b.motion.pace);
  const perF = (TIMING.perCandle * fps) / (speed * b.motion.pace);
  const lastLanded = introF + candles.length * perF;

  const first = candles[0];
  const last = candles[candles.length - 1];
  const deltaPct = ((last.close - first.open) / first.open) * 100;
  const isUp = last.close >= first.open;

  // The readout tracks the candles rather than running on its own clock, so the
  // number always agrees with what's on screen.
  const shownPrice = interpolate(
    frame,
    [introF, lastLanded],
    [first.open, last.close],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.out },
  );

  const card = scaleIn({ frame, fps, spring: b.motion.entrance, from: 0.97 });
  const header = fadeUp({ frame, fps, delay: sec(0.08, fps), distance: 28 });
  const badge = scaleIn({
    frame,
    fps,
    delay: lastLanded + sec(0.1, fps),
    spring: b.motion.emphasis,
    from: 0.8,
  });

  const gridIn = interpolate(frame, [0, sec(0.6, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.out,
  });

  /* ---------------- candle geometry ---------------- */

  const slot = 100 / candles.length;

  /**
   * Corner radius has to be relative to the candle, not to the frame.
   * The global radius token is wider than a candle body in landscape, which
   * rounds bodies into pills and turns thin wicks into horizontal blobs — the
   * chart stops reading as candles at all.
   */
  // Must follow the card's actual width, not the frame's — the card is capped
  // in landscape, so deriving from the frame overestimates and the radii come
  // out too large for the candles they're applied to.
  const cardW = Math.min(width - 2 * px(safe.x), isVertical ? Infinity : height * 1.55);
  const plotW = cardW - 2 * px(space.xl) - px(170);

  /**
   * Cap the body width in pixels, not just as a share of its slot.
   *
   * With few candles across a wide plot, 58% of the slot is a very fat bar —
   * and because the price range is compressed into a short plot, the body ends
   * up wider than it is tall. It stops reading as a candle and starts reading
   * as a pill. A real candle is taller than it is wide, so cap the width and
   * let the spacing grow instead.
   */
  const maxBodyPx = px(46);
  const bodyW = Math.min(slot * 0.58, (maxBodyPx / plotW) * 100);

  /**
   * The wick is sized from the BODY, not from the slot.
   *
   * Slot-relative made it scale with the gap between candles, so at low counts
   * the wick came out nearly as wide as the body and the candle read as a bar
   * with knobs on it. A wick is a fixed fraction of its own candle.
   */
  const wickW = Math.max(bodyW * 0.16, 0.2);

  const bodyRadius = Math.min(px(radius.sm), ((bodyW / 100) * plotW) / 4);
  const wickRadius = ((wickW / 100) * plotW) / 2;

  /**
   * Closing-price callout: a dashed rule that draws right-to-left back from the
   * final candle, with the price pill landing in the gutter. Drawing it toward
   * the candle rather than away from it keeps the eye where the story ends.
   */
  const lastTone = last.close >= last.open ? bullColor : bearColor;
  const labelP = spring({
    frame,
    fps,
    delay: lastLanded + sec(0.15, fps),
    config: SPRING.settle,
  });

  const ClosingPriceLabel: React.FC = () => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: `${pct(last.close)}%`,
        display: "flex",
        alignItems: "center",
        transform: "translateY(50%)",
        opacity: labelP,
      }}
    >
      <div
        style={{
          flex: 1,
          height: px(2),
          background: `repeating-linear-gradient(to right, ${lastTone}99 0 ${px(12)}px, transparent ${px(12)}px ${px(24)}px)`,
          transformOrigin: "right center",
          transform: `scaleX(${labelP})`,
        }}
      />
      <div
        style={{
          marginLeft: px(space.sm),
          padding: `${px(space.sm)}px ${px(space.md)}px`,
          borderRadius: px(radius.pill),
          background: lastTone,
          color: palette.ink,
          fontFamily: font.numeric,
          fontWeight: weight.bold,
          fontSize: px(type.caption),
          lineHeight: 1,
          whiteSpace: "nowrap",
          ...tabular,
          transform: `translateX(${(1 - labelP) * px(24)}px)`,
        }}
      >
        {currency}
        {last.close.toFixed(decimals)}
      </div>
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: px(safe.x),
        paddingRight: px(safe.x),
        paddingTop: px(safe.top),
        paddingBottom: px(isVertical ? safe.socialBottom : safe.bottom),
      }}
    >
      {/* Translucent card — satisfies the overlay legibility rule. */}
      <div
        style={{
          width: "100%",
          height: "100%",
          /**
           * Cap the card's aspect in BOTH directions and let it centre in the
           * leftover space.
           *
           * Vertical frames leave a very tall slot and wide frames leave a very
           * wide one; filling either stretches the plot into something that
           * reads as a graph rather than a graphic. Landscape was the worse of
           * the two — a 2:1 card makes the candles short and stubby relative to
           * their width, so they stop reading as candles.
           */
          maxHeight: isVertical ? width * 1.3 : "100%",
          maxWidth: isVertical ? "100%" : height * 1.55,
          display: "flex",
          flexDirection: "column",
          gap: px(space.lg),
          padding: px(space.xl),
          borderRadius: px(radius.lg),
          background: `${palette.ink}B8`,
          border: `${px(1.5)}px solid ${palette.primary}3D`,
          boxShadow: shadow.soft,
          ...card,
        }}
      >
        {/* ---------------- header ---------------- */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: px(space.lg),
            ...header,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: px(space.xs) }}>
            <div
              style={{
                fontFamily: font.display,
                fontWeight: weight.bold,
                fontSize: px(type.subhead),
                color: palette.primary,
                letterSpacing: px(-1),
                lineHeight: 1,
              }}
            >
              {ticker}
            </div>
            <div
              style={{
                fontFamily: font.body,
                fontWeight: weight.medium,
                fontSize: px(type.label),
                color: palette.textSecondary,
                lineHeight: 1,
              }}
            >
              {subtitle}
            </div>

            {/*
              Brand rule. Small, but it's what makes the three identities
              readable at a glance — the chart's own colours are semantic
              (up/down), so without this the brand only shows in the ticker.
              Wipes in from the left with the header.
            */}
            <div
              style={{
                marginTop: px(space.xs),
                width: px(120),
                height: px(5),
                borderRadius: px(radius.pill),
                background: `linear-gradient(90deg, ${palette.primary}, ${palette.accent})`,
                transformOrigin: "left center",
                transform: `scaleX(${gridIn})`,
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: px(space.sm),
            }}
          >
            <div
              style={{
                fontFamily: font.numeric,
                fontWeight: weight.black,
                fontSize: px(type.headline),
                color: palette.textPrimary,
                lineHeight: 1,
                letterSpacing: px(-2),
                ...tabular,
              }}
            >
              {currency}
              {shownPrice.toFixed(decimals)}
            </div>

            {showDelta ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: px(space.xs),
                  padding: `${px(space.xs)}px ${px(space.md)}px`,
                  borderRadius: px(radius.pill),
                  background: `${isUp ? bullColor : bearColor}26`,
                  border: `${px(1.5)}px solid ${isUp ? bullColor : bearColor}59`,
                  fontFamily: font.numeric,
                  fontWeight: weight.bold,
                  fontSize: px(type.label),
                  color: isUp ? bullColor : bearColor,
                  ...tabular,
                  ...badge,
                }}
              >
                {isUp ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
              </div>
            ) : null}
          </div>
        </div>

        {/* ---------------- chart ---------------- *
         * Two boxes side by side: the plot, and a gutter reserved for the axis
         * label. Without the gutter the closing-price pill lands on top of the
         * final candle, which is the one thing it's meant to call out.
         */}
        <div style={{ position: "relative", flex: 1, width: "100%", display: "flex" }}>
          <div style={{ position: "relative", flex: 1 }}>
          {showGrid
            ? [0, 25, 50, 75, 100].map((g) => (
                <div
                  key={g}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: `${g}%`,
                    height: px(1),
                    background: `${palette.textPrimary}0F`,
                    transformOrigin: "left center",
                    transform: `scaleX(${gridIn})`,
                  }}
                />
              ))
            : null}

          {candles.map((c, i) => {
            const up = c.close >= c.open;
            const tone = up ? bullColor : bearColor;

            // Body springs out from the open price; the wick trails it slightly.
            const bodyP = spring({
              frame,
              fps,
              delay: introF + i * perF,
              config: SPRING.heavy,
            });
            const wickP = spring({
              frame,
              fps,
              delay: introF + i * perF + sec(0.05, fps),
              config: SPRING.settle,
            });

            const openPct = pct(c.open);
            const bodyLo = interpolate(bodyP, [0, 1], [openPct, pct(Math.min(c.open, c.close))]);
            const bodyHi = interpolate(bodyP, [0, 1], [openPct, pct(Math.max(c.open, c.close))]);
            const wickLo = interpolate(wickP, [0, 1], [openPct, pct(c.low)]);
            const wickHi = interpolate(wickP, [0, 1], [openPct, pct(c.high)]);

            const isLast = i === candles.length - 1;
            // Final candle keeps a soft glow once everything has landed.
            const glow = highlightLast && isLast
              ? interpolate(frame, [lastLanded, lastLanded + sec(0.4, fps)], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: EASE.out,
                })
              : 0;

            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${i * slot + (slot - bodyW) / 2}%`,
                  width: `${bodyW}%`,
                  top: 0,
                  bottom: 0,
                }}
              >
                {/* wick */}
                <div
                  style={{
                    position: "absolute",
                    left: `${(bodyW - wickW) / (2 * bodyW) * 100}%`,
                    width: `${(wickW / bodyW) * 100}%`,
                    bottom: `${wickLo}%`,
                    height: `${Math.max(wickHi - wickLo, 0)}%`,
                    background: tone,
                    opacity: 0.85,
                    borderRadius: wickRadius,
                  }}
                />
                {/*
                  Body. The minimum height keeps a doji (open == close) readable
                  as a candle rather than vanishing — but it must be scaled by
                  progress, or every candle sits on screen as a small visible box
                  before it animates in, and the chart never starts empty.
                */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: `${bodyLo}%`,
                    height: `${Math.max(bodyHi - bodyLo, 0.5 * bodyP)}%`,
                    background: tone,
                    borderRadius: bodyRadius,
                    boxShadow: glow > 0 ? `0 0 ${px(40) * glow}px ${tone}` : undefined,
                  }}
                />
              </div>
            );
          })}
          </div>

          {/* Axis gutter — reserved space so the label never covers a candle. */}
          <div style={{ width: px(170), flexShrink: 0 }} />

          {highlightLast ? <ClosingPriceLabel /> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
