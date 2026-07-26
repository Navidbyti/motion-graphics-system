/**
 * ALPHA PROOF — Phase 1 gate, not a production template.
 *
 * Deliberately exercises every kind of transparency Premiere could get wrong,
 * so a failure tells us *which* kind broke rather than just "alpha looks off":
 *
 *   1. Hard edges      — rounded card. Tests anti-aliased edge alpha.
 *   2. Partial alpha   — 40% ring. Tests constant sub-1 opacity.
 *   3. Gradient alpha  — radial glow fading to nothing. The usual failure case,
 *                        and where an incorrect pixel format shows banding or
 *                        a grey halo.
 *   4. Text AA         — headline over transparency. Tests sub-pixel edges.
 *   5. Motion          — everything animates, so a static-frame fluke can't
 *                        pass the gate by accident.
 *
 * If this drops onto a Premiere timeline over a bright background with no grey
 * fringing, no dark halo around the glow, and clean type edges, the export
 * strategy holds and Phase 3 can build on it.
 */

import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font, radius, safe, scaleToWidth, space, type, weight } from "../../brand/tokens";
import { EASE, fadeUp, scaleIn, sec, stagger, tabular, countUp, wipeUp } from "../../motion";

export const ALPHA_PROOF_DURATION = 90; // 3s @ 30fps

export const AlphaProof: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const px = (n: number) => scaleToWidth(n, width);

  // Glow breathes slightly so gradient alpha is tested in motion, not just once.
  const glow = scaleIn({ frame, fps, spring: "heavy" });
  const card = scaleIn({ frame, fps, delay: stagger(1, fps), spring: "settle" });
  const ring = scaleIn({ frame, fps, delay: stagger(2, fps), spring: "pop", from: 0.8 });
  const heading = wipeUp({ frame, fps, delay: stagger(3, fps) });
  const caption = fadeUp({ frame, fps, delay: stagger(4, fps) });

  const counter = countUp({ frame, fps, from: 0, to: 100, delay: sec(0.5, fps) });

  return (
    // No background colour anywhere — this must stay fully transparent.
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: px(safe.x),
        paddingRight: px(safe.x),
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // The ring overhangs the card by 60px on every side. The gap must
          // clear that overhang, or the headline collides with it — absolutely
          // positioned decoration doesn't participate in flex layout.
          gap: px(space.xxl + 60),
        }}
      >
        {/* 1. Hard edges + 2. partial alpha, layered. */}
        <div style={{ position: "relative", ...card }}>
          {/*
            3. Gradient alpha — the hardest case for a wrong pixel format.
            Nested here rather than as a frame-level layer so it centres on the
            card. A frame-centred glow drifts away from content that sits above
            centre, which is the kind of misalignment nobody notices until it's
            on a timeline next to real footage.
          */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: px(820),
                height: px(820),
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color.primary}2E 0%, ${color.primary}00 72%)`,
                ...glow,
              }}
            />
          </div>

          <div
            style={{
              // Positioned so it paints above the absolutely-positioned glow —
              // absolute elements otherwise paint over static siblings.
              position: "relative",
              width: px(420),
              height: px(420),
              borderRadius: px(radius.lg),
              background: color.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.numeric,
              fontWeight: weight.black,
              fontSize: px(type.hero),
              color: color.textPrimary,
              ...tabular,
            }}
          >
            {Math.round(counter)}
          </div>

          <div
            style={{
              position: "absolute",
              inset: px(-60),
              borderRadius: px(radius.lg + 60),
              border: `${px(6)}px solid ${color.accent}`,
              ...ring,
              // Spread first, then scale the entrance fade down to a constant
              // 40% — this element must hold sub-1 alpha after it settles,
              // which is the case a wrong pixel format renders as solid.
              opacity: ring.opacity * 0.4,
            }}
          />
        </div>

        {/* 4. Text anti-aliasing against transparency. */}
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              fontFamily: font.display,
              fontWeight: weight.black,
              fontSize: px(type.headline),
              color: color.textPrimary,
              letterSpacing: px(-2),
              textAlign: "center",
              ...heading,
            }}
          >
            ALPHA PROOF
          </div>
        </div>

        <div
          style={{
            fontFamily: font.body,
            fontWeight: weight.medium,
            fontSize: px(type.support),
            color: color.accent,
            textAlign: "center",
            ...caption,
          }}
        >
          No grey fringe = pass
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Kept exported so the render script can reference the easing in a smoke test. */
export const PROOF_EASING = EASE.out;
