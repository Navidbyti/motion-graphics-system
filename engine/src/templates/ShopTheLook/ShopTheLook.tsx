import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getBrand } from "../../brand/brands";
import { space, radius, type, weight, safe } from "../../brand/tokens";
import { enter, fadeUp, sec, stagger, tabular } from "../../motion";
import { useLayout } from "../../layout";
import type { ShopTheLookProps } from "./schema";

/**
 * Two views of one item list.
 *
 * `sequence` shows a single item at a time — used over footage while the camera
 * moves through the room, so the label arrives as the eye reaches the object.
 * `summary` shows all of them with a total, and holds: viewers screenshot this
 * frame, which is the whole reason the format works.
 *
 * Items we sell are drawn in the brand colour and everything else is muted.
 * That contrast is the argument the video is making — most of the room came
 * from one place — so it is carried by the design rather than narrated.
 */
export const ShopTheLook: React.FC<ShopTheLookProps> = (props) => {
  const {
    headline,
    episode,
    mode,
    items,
    currencySymbol,
    secondsPerItem,
    showTotal,
    totalLabel,
    brand: brandId,
    scale,
    direction,
  } = props;

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = getBrand(brandId);
  const { palette, font } = brand;

  const { px, textStart, dir } = useLayout({
    scale,
    direction,
    text: `${headline} ${items.map((i) => i.name).join(" ")}`,
  });

  const align = textStart as "left" | "right";
  const money = (n: number) => `${currencySymbol}${n.toLocaleString("en-CA")}`;
  const total = items.reduce((sum, i) => sum + i.price, 0);

  const titleIn = fadeUp({
    frame,
    fps,
    spring: brand.motion.entrance,
    distance: px(24),
  });

  /** One row: name on the left, price on the right, source underneath. */
  const Item: React.FC<{
    name: string;
    price: number;
    source: string;
    ours: boolean;
    progress: number;
  }> = ({ name, price, source, ours, progress }) => (
    <div
      style={{
        direction: dir,
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: px(space.md),
        width: "100%",
        padding: `${px(space.sm)}px ${px(space.md)}px`,
        borderRadius: px(radius.sm),
        // Ours reads in brand colour against a tinted panel; everything else
        // sits quiet. No labels needed — the contrast says it.
        // Muted rows still need a backing — over a daylight plate grey-on-
        // transparent vanishes (TEMPLATE_SPEC §4). Dimmer, not absent.
        background: ours
          ? palette.surface
          : `color-mix(in srgb, ${palette.surface} 72%, transparent)`,
        borderLeft: ours ? `${px(4)}px solid ${palette.primary}` : `${px(4)}px solid transparent`,
        opacity: progress,
        transform: `translateY(${(1 - progress) * px(14)}px)`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: px(2) }}>
        <div
          style={{
            fontFamily: font.body,
            fontSize: px(type.support),
            fontWeight: ours ? weight.semibold : weight.regular,
            color: ours ? palette.textPrimary : palette.textSecondary,
            lineHeight: 1.2,
            textAlign: align,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: font.body,
            fontSize: px(type.caption),
            fontWeight: weight.semibold,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: ours ? palette.primary : palette.textSecondary,
            textAlign: align,
          }}
        >
          {source}
        </div>
      </div>
      <div
        style={{
          flex: "none",
          fontFamily: font.numeric,
          fontSize: px(type.support),
          fontWeight: weight.semibold,
          color: ours ? palette.primary : palette.textSecondary,
          ...tabular,
        }}
      >
        {money(price)}
      </div>
    </div>
  );

  /* ---------------- sequence ---------------- */
  if (mode === "sequence") {
    const per = sec(secondsPerItem, fps);
    const idx = Math.min(items.length - 1, Math.max(0, Math.floor(frame / per)));
    const it = items[idx];
    const p = enter({
      frame: Math.max(0, frame - idx * per),
      fps,
      spring: brand.motion.entrance,
    });

    return (
      <div
        style={{
          direction: dir,
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          alignItems: align === "right" ? "flex-end" : "flex-start",
          paddingLeft: px(safe.x),
          paddingRight: px(safe.x),
          paddingBottom: px(safe.socialBottom),
        }}
      >
        <div
          style={{
            // Backing keeps the label readable over a bright or busy plate.
            background: palette.surface,
            borderRadius: px(radius.md),
            borderLeft: `${px(5)}px solid ${it.ours ? palette.primary : palette.textSecondary}`,
            padding: `${px(space.md)}px ${px(space.lg)}px`,
            opacity: p,
            transform: `translateY(${(1 - p) * px(20)}px)`,
            maxWidth: "86%",
          }}
        >
          <div
            style={{
              fontFamily: font.body,
              fontSize: px(type.caption),
              fontWeight: weight.semibold,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: it.ours ? palette.primary : palette.textSecondary,
              marginBottom: px(4),
              textAlign: align,
            }}
          >
            {it.source}
          </div>
          <div
            style={{
              fontFamily: font.display,
              fontSize: px(type.subhead),
              fontWeight: weight.bold,
              color: palette.textPrimary,
              lineHeight: 1.1,
              textAlign: align,
            }}
          >
            {it.name}
          </div>
          <div
            style={{
              fontFamily: font.numeric,
              fontSize: px(type.support),
              fontWeight: weight.semibold,
              color: it.ours ? palette.primary : palette.textSecondary,
              marginTop: px(6),
              textAlign: align,
              ...tabular,
            }}
          >
            {money(it.price)}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- summary ---------------- */
  const totalIn = enter({
    frame,
    fps,
    delay: sec(0.8 + items.length * 0.22, fps),
    spring: brand.motion.emphasis,
  });

  return (
    <div
      style={{
        direction: dir,
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: px(space.md),
        paddingLeft: px(safe.x),
        paddingRight: px(safe.x),
        paddingTop: px(safe.top),
        paddingBottom: px(safe.socialBottom),
      }}
    >
      <div
        style={{
          alignSelf: align === "right" ? "flex-end" : "flex-start",
          background: palette.surface,
          borderRadius: px(radius.md),
          padding: `${px(space.md)}px ${px(space.lg)}px`,
          opacity: titleIn.opacity,
          transform: titleIn.transform,
        }}
      >
        {episode ? (
          <div
            style={{
              fontFamily: font.body,
              fontSize: px(type.label),
              fontWeight: weight.semibold,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: palette.primary,
              textAlign: align,
              ...tabular,
            }}
          >
            {episode}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: font.display,
            fontSize: px(type.subhead),
            fontWeight: weight.bold,
            color: palette.textPrimary,
            lineHeight: 1.08,
            textAlign: align,
            textWrap: "balance",
          }}
        >
          {headline}
        </div>
      </div>

      <div
        style={{
          direction: dir,
          display: "flex",
          flexDirection: "column",
          gap: px(space.xs),
          width: "100%",
        }}
      >
        {items.map((it, i) => (
          <Item
            key={`${it.name}-${i}`}
            {...it}
            progress={enter({
              frame,
              fps,
              delay: sec(0.8, fps) + stagger(i, fps, { per: 0.22, max: 2.2 }),
              spring: brand.motion.entrance,
            })}
          />
        ))}
      </div>

      {showTotal ? (
        <div
          style={{
            direction: dir,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: px(space.md),
            width: "100%",
            marginTop: px(space.xs),
            padding: `${px(space.md)}px ${px(space.md)}px`,
            borderRadius: px(radius.md),
            background: palette.primary,
            opacity: totalIn,
            transform: `translateY(${(1 - totalIn) * px(16)}px)`,
          }}
        >
          <div
            style={{
              fontFamily: font.body,
              fontSize: px(type.caption),
              fontWeight: weight.bold,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: palette.ink,
              textAlign: align,
            }}
          >
            {totalLabel}
          </div>
          <div
            style={{
              fontFamily: font.numeric,
              fontSize: px(type.subhead),
              fontWeight: weight.bold,
              color: palette.ink,
              lineHeight: 1,
              ...tabular,
            }}
          >
            {money(total)}
          </div>
        </div>
      ) : null}
    </div>
  );
};
