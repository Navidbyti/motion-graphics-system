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
import { AnnotationLayer } from "../../charting/AnnotationLayer";
import { annotationPrices } from "../../charting/annotations";
import { priceScale, priceToPct, priceToSvgY, slotWidth } from "../../charting/geometry";

export const PriceZone: React.FC<PriceZoneProps> = ({
  brand,
  theme,
  ticker,
  subtitle,
  bars,
  annotations,
  beats,
  backgroundAlpha,
  decimals,
  showAxis,
  showLast,
  scale,
  direction,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const { px, isVertical, dir, textStart } = useLayout({
    scale,
    direction,
    text: `${ticker} ${subtitle}`,
  });

  const b = useTheme(brand, theme);
  const { palette, font } = b;

  /* ---------------- scale ---------------- */

  /*
    The scale comes from the shared geometry module, which the editor also uses
    to turn mouse positions into prices. Computing it twice would let the two
    drift, and drift means a line renders somewhere other than where it was
    drawn.
  */
  const scaleInfo = priceScale(bars, annotationPrices(annotations));
  const { lo, hi } = scaleInfo;

  const pctY = (v: number) => priceToPct(v, scaleInfo);
  const svgY = (v: number) => priceToSvgY(v, scaleInfo);
  const slot = slotWidth(scaleInfo);

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
          /*
            Alpha as two hex digits appended to the colour. Rounded and padded
            because "F" and "0F" are different values, and an unpadded one digit
            silently produces a nearly transparent card.
          */
          background: `${palette.ink}${Math.round(backgroundAlpha * 255)
            .toString(16)
            .padStart(2, "0")}`,
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
              The analysis: zones, levels, trendlines, arrows and the rest,
              revealed by the beat sheet. Drawn after the bars so it sits over
              the price action, in the order the list gives.
            */}
            <AnnotationLayer
              annotations={annotations}
              beats={beats}
              scale={scaleInfo}
              palette={palette}
              frame={frame}
              fps={fps}
              chartReadyFrame={annotateAt}
              px={px}
              decimals={decimals}
            />
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
