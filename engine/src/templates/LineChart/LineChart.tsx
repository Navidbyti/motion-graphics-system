/**
 * LINE CHART — a value over time.
 *
 * The companion to the candle chart, for series where the story is the shape of
 * the line rather than each period's range: rates, prices, subscriber counts.
 *
 * Design notes:
 *
 * - The line DRAWS rather than fading in, via `pathLength="1"` and an animated
 *   dash offset. Normalising the path length to 1 means the dash maths is the
 *   same whatever the data does — no measuring the path at runtime.
 * - Dots pop as the draw reaches them, not on a clock of their own. The line
 *   arriving is what causes the dot, which is why it reads as drawing rather
 *   than as two animations that happen to overlap.
 * - The SVG is stretched with `preserveAspectRatio="none"` so the plot fills its
 *   box at any aspect. That would normally distort the stroke and turn dots into
 *   ellipses, so the stroke uses `vector-effect="non-scaling-stroke"` and the
 *   dots are HTML elements positioned in percentages rather than SVG circles.
 * - The plot itself stays left-to-right under RTL. Time runs forward in charts
 *   regardless of script direction; only the text flips.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../../brand/useTheme";
import { radius, safe, shadow, space, type, weight } from "../../brand/tokens";
import { useLayout } from "../../layout";
import { EASE, fadeUp, scaleIn, sec, tabular } from "../../motion";
import { TIMING, type LineChartProps } from "./schema";

export const LineChart: React.FC<LineChartProps> = ({
  brand,
  theme,
  title,
  subtitle,
  points,
  currency,
  suffix,
  decimals,
  showArea,
  showDots,
  showGrid,
  showDelta,
  colourByTrend,
  scale,
  direction,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const { px, isVertical, dir, textStart } = useLayout({
    scale,
    direction,
    text: `${title} ${subtitle}`,
  });

  const b = useTheme(brand, theme);
  const { palette, font } = b;

  /* ---------------- scale ---------------- */

  const values = points.map((p) => p.value);
  const rawLo = Math.min(...values);
  const rawHi = Math.max(...values);
  const span = rawHi - rawLo;
  // A flat series has zero span; without a floor every point would land on the
  // same row and the line would vanish into a gridline.
  const pad = (span || Math.abs(rawHi) * 0.1 || 1) * (isVertical ? 0.3 : 0.22);
  const lo = rawLo - pad;
  const hi = rawHi + pad;

  /** Value → percentage up from the bottom of the plot. */
  const pctY = (v: number) => ((v - lo) / (hi - lo)) * 100;
  /** Index → percentage across the plot. */
  const pctX = (i: number) =>
    points.length === 1 ? 50 : (i / (points.length - 1)) * 100;

  /* ---------------- timing ---------------- */

  const pace = speed * b.motion.pace;
  const introF = (TIMING.intro * fps) / pace;
  const drawF = (TIMING.draw * fps) / pace;

  /** 0 → 1 as the line draws. Everything on the plot keys off this. */
  const draw = interpolate(frame, [introF, introF + drawF], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.inOut,
  });

  const first = points[0];
  const last = points[points.length - 1];
  const isUp = last.value >= first.value;
  const deltaAbs = last.value - first.value;
  const deltaPct = first.value === 0 ? 0 : (deltaAbs / Math.abs(first.value)) * 100;

  const tone = colourByTrend
    ? isUp
      ? palette.positive
      : palette.negative
    : palette.primary;

  // The readout tracks the draw, so the number always agrees with the line.
  const shownValue = interpolate(frame, [introF, introF + drawF], [first.value, last.value], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.inOut,
  });

  const card = scaleIn({ frame, fps, spring: b.motion.entrance, from: 0.97 });
  const header = fadeUp({ frame, fps, delay: sec(0.08, fps), distance: 28 });
  const badge = scaleIn({
    frame,
    fps,
    delay: introF + drawF + sec(0.05, fps),
    spring: b.motion.emphasis,
    from: 0.8,
  });

  const gridIn = interpolate(frame, [0, sec(0.6, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.out,
  });

  /* ---------------- geometry ---------------- */

  // SVG y runs downward, so the path inverts the percentage.
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${pctX(i)} ${100 - pctY(p.value)}`)
    .join(" ");

  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  const format = (v: number) => `${currency}${v.toFixed(decimals)}${suffix}`;

  const gutter = px(150);

  /** Values for the horizontal gridlines, so each one is readable. */
  const gridLevels = [0, 25, 50, 75, 100].map((p) => ({
    pct: p,
    value: lo + ((hi - lo) * p) / 100,
  }));

  /**
   * Axis labels have to thin out, not shrink indefinitely.
   *
   * Every point got a label regardless of format, so fourteen months in a
   * vertical frame were crammed into a third of the width and overlapped into
   * mush. Showing every Nth label keeps the ones that remain legible — which is
   * the point of an axis. The type is also a notch smaller on the narrow
   * formats, where the label row has far less room to work with.
   */
  const isSquare = Math.abs(width - height) < 1;
  const maxLabels = isVertical ? 6 : isSquare ? 8 : 14;
  const labelStep = Math.max(1, Math.ceil(points.length / maxLabels));
  const axisFont = px(isVertical ? type.caption * 0.78 : type.caption * 0.9);

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
          // Capped in both directions for the same reason as the candle chart:
          // filling a very tall or very wide frame stretches the plot into
          // something that reads as a graph rather than a graphic.
          maxHeight: isVertical ? width * 1.25 : "100%",
          maxWidth: isVertical ? "100%" : height * 1.6,
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
                textAlign: textStart,
              }}
            >
              {title}
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
            <div
              style={{
                marginTop: px(space.xs),
                width: px(120),
                height: px(5),
                borderRadius: px(radius.pill),
                background: `linear-gradient(90deg, ${palette.primary}, ${palette.accent})`,
                transformOrigin: dir === "rtl" ? "right center" : "left center",
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
                whiteSpace: "nowrap",
                ...tabular,
              }}
            >
              {format(shownValue)}
            </div>

            {showDelta ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: px(space.xs),
                  padding: `${px(space.xs)}px ${px(space.md)}px`,
                  borderRadius: px(radius.pill),
                  background: `${tone}26`,
                  border: `${px(1.5)}px solid ${tone}59`,
                  fontFamily: font.numeric,
                  fontWeight: weight.bold,
                  fontSize: px(type.label),
                  color: tone,
                  whiteSpace: "nowrap",
                  ...tabular,
                  ...badge,
                }}
              >
                {isUp ? "▲" : "▼"} {Math.abs(deltaAbs).toFixed(decimals)}
                {suffix} ({Math.abs(deltaPct).toFixed(1)}%)
              </div>
            ) : null}
          </div>
        </div>

        {/* ---------------- plot ---------------- */}
        <div style={{ position: "relative", flex: 1, width: "100%", display: "flex" }}>
          <div style={{ position: "relative", flex: 1 }}>
            {showGrid
              ? gridLevels.map((g) => (
                  <div
                    key={g.pct}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: `${g.pct}%`,
                      height: px(1),
                      background: `${palette.textPrimary}0F`,
                      transformOrigin: "left center",
                      transform: `scaleX(${gridIn})`,
                    }}
                  />
                ))
              : null}

            {/*
              preserveAspectRatio="none" stretches the 0–100 box to fill the
              plot at any aspect. vector-effect keeps the stroke a true constant
              width despite that non-uniform scale.
            */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            >
              <defs>
                <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tone} stopOpacity="0.34" />
                  <stop offset="100%" stopColor={tone} stopOpacity="0" />
                </linearGradient>
                {/* Clipped to the drawn portion so the fill follows the line. */}
                <clipPath id="lc-reveal" clipPathUnits="objectBoundingBox">
                  <rect x="0" y="0" width={draw} height="1" />
                </clipPath>
              </defs>

              {showArea ? (
                <path d={areaPath} fill="url(#lc-area)" clipPath="url(#lc-reveal)" />
              ) : null}

              {/*
                Revealed by the same clip as the area, NOT by an animated dash
                offset.

                The dash approach is the usual way to draw a line, but it breaks
                here: `pathLength` normalisation is computed in user units,
                while `non-scaling-stroke` renders in device units under a
                non-uniform viewBox stretch. The two disagree and the line comes
                out visibly gapped. Clipping by x also matches how the axis
                labels appear, so the whole plot reveals as one motion.
              */}
              <path
                d={linePath}
                fill="none"
                stroke={tone}
                strokeWidth={px(5)}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                clipPath="url(#lc-reveal)"
              />
            </svg>

            {/* Dots are HTML, not SVG circles — the stretched viewBox would make
                circles into ellipses. */}
            {showDots
              ? points.map((p, i) => {
                  const at = pctX(i) / 100;
                  // Each dot appears as the draw passes its position.
                  const pop = interpolate(draw, [at - 0.015, at + 0.02], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  });
                  const isLast = i === points.length - 1;
                  const size = px(isLast ? 22 : 15);
                  return (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: `${pctX(i)}%`,
                        bottom: `${pctY(p.value)}%`,
                        width: size,
                        height: size,
                        marginLeft: -size / 2,
                        marginBottom: -size / 2,
                        borderRadius: "50%",
                        background: tone,
                        border: `${px(3)}px solid ${palette.ink}`,
                        transform: `scale(${pop})`,
                        boxShadow: isLast && pop > 0 ? `0 0 ${px(26)}px ${tone}` : undefined,
                      }}
                    />
                  );
                })
              : null}
          </div>

          {/*
            Reserved so the value pill never covers the final dot — and, when
            gridlines are on, it's where each line's value is printed. A
            gridline without a number is decoration; with one it's a scale.
          */}
          <div style={{ width: gutter, flexShrink: 0, position: "relative" }}>
            {showGrid
              ? gridLevels.map((g) => (
                  <div
                    key={g.pct}
                    style={{
                      position: "absolute",
                      left: px(space.sm),
                      bottom: `${g.pct}%`,
                      transform: "translateY(50%)",
                      fontFamily: font.numeric,
                      fontWeight: weight.medium,
                      fontSize: axisFont,
                      color: palette.textSecondary,
                      whiteSpace: "nowrap",
                      opacity: gridIn * 0.9,
                      ...tabular,
                    }}
                  >
                    {format(g.value)}
                  </div>
                ))
              : null}
          </div>

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: `${pctY(last.value)}%`,
              display: "flex",
              alignItems: "center",
              transform: "translateY(50%)",
              opacity: badge.opacity,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                flex: 1,
                height: px(2),
                background: `repeating-linear-gradient(to right, ${tone}88 0 ${px(12)}px, transparent ${px(12)}px ${px(24)}px)`,
                transformOrigin: "right center",
                transform: `scaleX(${badge.opacity})`,
              }}
            />
            <div
              style={{
                marginLeft: px(space.sm),
                padding: `${px(space.sm)}px ${px(space.md)}px`,
                borderRadius: px(radius.pill),
                background: tone,
                color: palette.ink,
                fontFamily: font.numeric,
                fontWeight: weight.bold,
                fontSize: px(type.caption),
                lineHeight: 1,
                whiteSpace: "nowrap",
                ...tabular,
              }}
            >
              {format(last.value)}
            </div>
          </div>
        </div>

        {/* ---------------- x axis ---------------- */}
        <div
          style={{
            display: "flex",
            paddingRight: gutter,
            // Axis labels belong to the plot, which stays left-to-right.
            direction: "ltr",
          }}
        >
          {points.map((p, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: font.body,
                fontWeight: weight.medium,
                fontSize: axisFont,
                color: palette.textSecondary,
                opacity: interpolate(
                  draw,
                  [pctX(i) / 100 - 0.02, pctX(i) / 100 + 0.03],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                ),
                whiteSpace: "nowrap",
                // Visible, not hidden: each label owns a narrow flex slot, and
                // clipping chopped longer ones ("2026" became "202"). Thinning
                // leaves the neighbouring slots empty, so overflow is free.
                overflow: "visible",
              }}
            >
              {/*
                Every Nth label, plus the last — but only if the last isn't
                already sitting next to one that's shown, or the two collide
                into an unreadable smudge at the end of the axis.
              */}
              {i % labelStep === 0 ||
              (i === points.length - 1 && (points.length - 1) % labelStep >= 2)
                ? p.label
                : ""}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
