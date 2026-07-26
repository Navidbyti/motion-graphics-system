/**
 * PRICE ZONE — dense price history with a highlighted band and level callouts.
 *
 * The analysis chart, as distinct from the two data charts already in the
 * library: the candle chart tells the story of a dozen periods, the line chart
 * tells the shape of a trend, and this one shows hundreds of bars so a *zone*
 * can be pointed at.
 *
 * Two decisions carry the whole template:
 *
 * - All bars render as four SVG paths (up wicks, up bodies, down wicks, down
 *   bodies) rather than as elements per bar. At 400 bars, per-bar elements
 *   would mean 800 DOM nodes rebuilt every frame; four paths is four.
 * - The series wipes in as one motion rather than animating per bar. Hundreds
 *   of individual springs would be both expensive and illegible — at this
 *   density the eye reads the shape arriving, not each bar landing.
 *
 * The zone and the callouts arrive *after* the price action, because they're
 * the point being made about it. Showing them together reads as decoration;
 * showing them after reads as analysis.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../../brand/useTheme";
import { radius, safe, shadow, space, type, weight } from "../../brand/tokens";
import { useLayout } from "../../layout";
import { EASE, fadeUp, scaleIn, sec, tabular } from "../../motion";
import { TIMING, type PriceZoneProps } from "./schema";

export const PriceZone: React.FC<PriceZoneProps> = ({
  brand,
  theme,
  ticker,
  subtitle,
  bars,
  zones,
  markers,
  decimals,
  showAxis,
  showLast,
  scale,
  direction,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const { px, isVertical, dir, textStart } = useLayout({ scale, direction });

  const b = useTheme(brand, theme);
  const { palette, font } = b;

  /* ---------------- scale ---------------- */

  const lows = bars.map((x) => x.low);
  const highs = bars.map((x) => x.high);
  // Zones and markers must be inside the visible range or they'd point off-frame.
  const zoneValues = zones.flatMap((z) => [z.from, z.to]);
  const markerValues = markers.map((m) => m.value);
  const rawLo = Math.min(...lows, ...zoneValues, ...markerValues);
  const rawHi = Math.max(...highs, ...zoneValues, ...markerValues);
  const pad = (rawHi - rawLo) * 0.08 || 1;
  const lo = rawLo - pad;
  const hi = rawHi + pad;

  const pctY = (v: number) => ((v - lo) / (hi - lo)) * 100;
  /** SVG y grows downward, so paths use the inverse. */
  const svgY = (v: number) => 100 - pctY(v);
  const slot = 100 / bars.length;

  /* ---------------- timing ---------------- */

  const pace = speed * b.motion.pace;
  const introF = (TIMING.intro * fps) / pace;
  const wipeF = (TIMING.wipe * fps) / pace;

  const wipe = interpolate(frame, [introF, introF + wipeF], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.out,
  });

  const annotateAt = introF + wipeF;
  const zoneIn = interpolate(
    frame,
    [annotateAt, annotateAt + sec(TIMING.annotate, fps) / pace],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.out },
  );

  const card = scaleIn({ frame, fps, spring: b.motion.entrance, from: 0.97 });
  const header = fadeUp({ frame, fps, delay: sec(0.08, fps), distance: 24 });

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2] ?? last;
  const isUp = last.close >= prev.close;
  const lastTone = isUp ? palette.positive : palette.negative;

  /* ---------------- bar geometry ---------------- */

  // Four paths total. Bodies are filled rects, wicks are stroked lines; each is
  // split by direction so the two colours need no per-bar elements.
  const bodyW = Math.max(slot * 0.62, 0.02);
  const paths = { upBody: "", downBody: "", upWick: "", downWick: "" };

  bars.forEach((bar, i) => {
    const cx = i * slot + slot / 2;
    const x0 = cx - bodyW / 2;
    const x1 = cx + bodyW / 2;
    const top = svgY(Math.max(bar.open, bar.close));
    const bottom = svgY(Math.min(bar.open, bar.close));
    // A doji would be a zero-height rect and vanish; give it a hairline.
    const h = Math.max(bottom - top, 0.15);

    const body = `M ${x0} ${top} L ${x1} ${top} L ${x1} ${top + h} L ${x0} ${top + h} Z `;
    const wick = `M ${cx} ${svgY(bar.high)} L ${cx} ${svgY(bar.low)} `;

    if (bar.close >= bar.open) {
      paths.upBody += body;
      paths.upWick += wick;
    } else {
      paths.downBody += body;
      paths.downWick += wick;
    }
  });

  const format = (v: number) => v.toFixed(decimals);
  const axisW = showAxis ? px(190) : px(20);

  /* ---------------- axis ticks ---------------- */

  const ticks = [0, 20, 40, 60, 80, 100].map((p) => ({
    pct: p,
    value: lo + ((hi - lo) * p) / 100,
  }));

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        direction: dir,
        paddingLeft: px(safe.x),
        paddingRight: px(safe.x),
        paddingTop: px(safe.top),
        paddingBottom: px(isVertical ? safe.socialBottom : safe.bottom),
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          maxHeight: isVertical ? width * 1.3 : "100%",
          maxWidth: isVertical ? "100%" : height * 1.7,
          display: "flex",
          flexDirection: "column",
          gap: px(space.md),
          padding: px(space.xl),
          borderRadius: px(radius.lg),
          background: `${palette.ink}BF`,
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
                textAlign: textStart,
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
                textAlign: textStart,
              }}
            >
              {subtitle}
            </div>
          </div>

          <div
            style={{
              fontFamily: font.numeric,
              fontWeight: weight.black,
              fontSize: px(type.subhead),
              color: lastTone,
              lineHeight: 1,
              whiteSpace: "nowrap",
              ...tabular,
            }}
          >
            {format(last.close)}
          </div>
        </div>

        {/* ---------------- plot ---------------- */}
        <div style={{ position: "relative", flex: 1, width: "100%", display: "flex" }}>
          <div style={{ position: "relative", flex: 1 }}>
            {/* gridlines */}
            {ticks.map((t) => (
              <div
                key={t.pct}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: `${t.pct}%`,
                  height: px(1),
                  background: `${palette.textPrimary}0D`,
                }}
              />
            ))}

            {/*
              Zones sit behind the bars: they're context for the price action,
              not something laid over the top of it.
            */}
            {zones.map((z, i) => {
              const top = Math.min(pctY(z.from), pctY(z.to));
              const size = Math.abs(pctY(z.to) - pctY(z.from));
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: `${top}%`,
                    height: `${size}%`,
                    background: `${palette.positive}24`,
                    borderTop: `${px(2)}px solid ${palette.positive}66`,
                    borderBottom: `${px(2)}px solid ${palette.positive}66`,
                    // Grows out from its own centre, so it reads as a band being
                    // measured rather than a box sliding in.
                    transform: `scaleY(${zoneIn})`,
                    transformOrigin: "center",
                    opacity: zoneIn,
                  }}
                />
              );
            })}

            {/* Bars: four paths, whatever the bar count. */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            >
              <defs>
                <clipPath id="pz-wipe" clipPathUnits="objectBoundingBox">
                  <rect x="0" y="0" width={wipe} height="1" />
                </clipPath>
              </defs>
              <g clipPath="url(#pz-wipe)">
                <path
                  d={paths.upWick}
                  stroke={palette.positive}
                  strokeWidth={px(1.6)}
                  vectorEffect="non-scaling-stroke"
                  fill="none"
                />
                <path
                  d={paths.downWick}
                  stroke={palette.negative}
                  strokeWidth={px(1.6)}
                  vectorEffect="non-scaling-stroke"
                  fill="none"
                />
                <path d={paths.upBody} fill={palette.positive} />
                <path d={paths.downBody} fill={palette.negative} />
              </g>
            </svg>

            {/* Current price line, drawn across once the series has arrived. */}
            {showLast ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: `${pctY(last.close)}%`,
                  height: px(1.5),
                  background: `repeating-linear-gradient(to right, ${lastTone}77 0 ${px(10)}px, transparent ${px(10)}px ${px(20)}px)`,
                  transformOrigin: "left center",
                  transform: `scaleX(${wipe})`,
                }}
              />
            ) : null}

            {/*
              Level callouts. Each has a short leader line so the pill can sit
              clear of the bars while still pointing at an exact price — that's
              what makes it read as an annotation rather than a floating badge.
            */}
            {markers.map((m, i) => {
              const pop = interpolate(
                frame,
                [
                  annotateAt + sec(0.1 + i * 0.09, fps) / pace,
                  annotateAt + sec(0.45 + i * 0.09, fps) / pace,
                ],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.out },
              );
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    right: `${6 + i * 9}%`,
                    bottom: `${pctY(m.value)}%`,
                    display: "flex",
                    alignItems: "center",
                    gap: px(space.xs),
                    transform: `translateY(50%) scale(${0.9 + pop * 0.1})`,
                    opacity: pop,
                    transformOrigin: "right center",
                  }}
                >
                  <div
                    style={{
                      width: px(34),
                      height: px(2),
                      background: palette.positive,
                      transformOrigin: "right center",
                      transform: `scaleX(${pop})`,
                    }}
                  />
                  <div
                    style={{
                      padding: `${px(space.xs)}px ${px(space.md)}px`,
                      borderRadius: px(radius.sm),
                      background: palette.positive,
                      color: palette.ink,
                      fontFamily: font.numeric,
                      fontWeight: weight.bold,
                      fontSize: px(type.caption),
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      ...tabular,
                    }}
                  >
                    {m.text || format(m.value)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---------------- price axis ---------------- */}
          <div style={{ width: axisW, flexShrink: 0, position: "relative" }}>
            {showAxis
              ? ticks.map((t) => (
                  <div
                    key={t.pct}
                    style={{
                      position: "absolute",
                      left: px(space.sm),
                      bottom: `${t.pct}%`,
                      transform: "translateY(50%)",
                      fontFamily: font.numeric,
                      fontWeight: weight.medium,
                      fontSize: px(type.caption),
                      color: palette.textSecondary,
                      whiteSpace: "nowrap",
                      opacity: wipe,
                      ...tabular,
                    }}
                  >
                    {format(t.value)}
                  </div>
                ))
              : null}

            {showLast ? (
              <div
                style={{
                  position: "absolute",
                  left: px(space.xs),
                  bottom: `${pctY(last.close)}%`,
                  transform: "translateY(50%)",
                  padding: `${px(space.xs)}px ${px(space.sm)}px`,
                  borderRadius: px(radius.sm),
                  background: lastTone,
                  color: palette.ink,
                  fontFamily: font.numeric,
                  fontWeight: weight.bold,
                  fontSize: px(type.caption),
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  opacity: wipe,
                  ...tabular,
                }}
              >
                {format(last.close)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
