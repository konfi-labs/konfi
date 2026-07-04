"use client";

import { Box, Center } from "@chakra-ui/react";
import React, { useEffect, useMemo, useRef, useState } from "react";

type KonfiSwitchLoaderProps = {
  src?: string; // Path to full switch logo SVG (will be used as static background image)
  width?: number; // Outer width in px
  height?: number; // Outer height in px
  padding?: number; // Horizontal inner padding for knob travel limits
  durationMs?: number; // Animation duration
  label?: string; // Accessible label
  knobColor?: string; // Color of animated knob (default currentColor)
  bounceEasing?: string; // Custom easing (default ease-in-out)
  bounceDelayMs?: number; // Optional delay per cycle
};

export default function KonfiSwitchLoader({
  src = "/assets/konfi_loader.svg",
  width = 240,
  height = 136,
  padding = 8,
  durationMs = 1200,
  label = "Loading…",
  knobColor,
  bounceEasing = "linear",
  bounceDelayMs = 0,
}: KonfiSwitchLoaderProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Fallback heuristic when parsing fails
  const knobDiameterFallback = useMemo(
    () => Math.round(height * 0.805),
    [height],
  );
  const travelDistanceFallback = useMemo(
    () => Math.max(0, width - knobDiameterFallback - 2 * padding),
    [width, knobDiameterFallback, padding],
  );
  // Minimum visible fallback: ensure we at least move a significant portion on small svgs
  const minVisibleFallback = useMemo(
    () =>
      Math.round(Math.max(travelDistanceFallback, Math.round(width * 0.45))),
    [travelDistanceFallback, width],
  );
  const leftStartFallback = padding;
  const leftEndFallback = padding + travelDistanceFallback;

  const [leftStartPx, setLeftStartPx] = useState<number | null>(
    leftStartFallback,
  );
  const [leftEndPx, setLeftEndPx] = useState<number | null>(leftEndFallback);
  const [dxPx, setDxPx] = useState<number | null>(travelDistanceFallback);
  const [knobPx, setKnobPx] = useState<number | null>(knobDiameterFallback);

  // (moved up) Fallback heuristic when parsing fails

  // Fetch and parse the SVG to compute accurate positions for the pill and the knob
  useEffect(() => {
    let cancelled = false;
    let hiddenContainer: HTMLDivElement | null = null;
    const compute = async () => {
      try {
        const res = await fetch(src, { cache: "force-cache" });
        if (!res.ok) throw new Error(`Failed to load ${src}: ${res.status}`);
        const svgText = await res.text();
        if (cancelled) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const svgEl = doc.querySelector("svg") as SVGSVGElement | null;
        if (!svgEl) throw new Error("Invalid SVG");

        // Read viewBox
        let viewBox = svgEl.getAttribute("viewBox");
        let vbw = svgEl.getAttribute("width")
          ? parseFloat(svgEl.getAttribute("width") as string)
          : 0;
        let vbh = svgEl.getAttribute("height")
          ? parseFloat(svgEl.getAttribute("height") as string)
          : 0;
        if (viewBox) {
          const parts = viewBox.split(/[\s,]+/);
          if (parts.length >= 4) {
            vbw = parseFloat(parts[2]);
            vbh = parseFloat(parts[3]);
          }
        }

        // Measure the rendering container size (where the image will be scaled to using objectFit contain)
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) {
          setLeftStartPx(leftStartFallback);
          setLeftEndPx(leftEndFallback);
          setKnobPx(knobDiameterFallback);
          return;
        }

        const containerW = rect.width;
        const containerH = rect.height;
        if (!containerW || !containerH) {
          setLeftStartPx(leftStartFallback);
          setLeftEndPx(leftEndFallback);
          setKnobPx(knobDiameterFallback);
          return;
        }

        // Compute displayed image size given object-fit: contain
        const svgAspect = vbw / vbh;
        let displayedW = containerW;
        let displayedH = containerH;
        if (containerW / containerH > svgAspect) {
          // Fit by height
          displayedH = containerH;
          displayedW = displayedH * svgAspect;
        } else {
          // Fit by width
          displayedW = containerW;
          displayedH = displayedW / svgAspect;
        }

        // Append to hidden container so getBoundingClientRect computes pixel sizes reliably
        hiddenContainer = document.createElement("div");
        hiddenContainer.style.position = "absolute";
        hiddenContainer.style.left = "-9999px";
        hiddenContainer.style.top = "0px";
        hiddenContainer.style.width = `${displayedW}px`;
        hiddenContainer.style.height = `${displayedH}px`;
        hiddenContainer.style.overflow = "hidden";
        hiddenContainer.style.opacity = "0"; // invisible but rendered
        document.body.appendChild(hiddenContainer);
        // Force the svg to render at the computed display size
        svgEl.setAttribute("width", `${displayedW}`);
        svgEl.setAttribute("height", `${displayedH}`);
        hiddenContainer.appendChild(svgEl);

        // Query the pill and knob
        const pill = svgEl.querySelector("#pill") as Element | null;
        const knob = svgEl.querySelector("#knob") as Element | null;
        if (!pill || !knob) {
          // Can't compute precise values; bail to fallback
          setLeftStartPx(leftStartFallback);
          setLeftEndPx(leftEndFallback);
          setKnobPx(knobDiameterFallback);
          return;
        }

        // Defensive: clear any unexpected animation styles inside the SVG (some tools/extensions or global CSS may apply animation to elements such as <circle>)
        try {
          const all = svgEl.querySelectorAll("*");
          all.forEach((el) => {
            try {
              (el as HTMLElement).style.animation = "none";
              (el as HTMLElement).style.transition = "none";
            } catch {}
          });
          (svgEl as unknown as HTMLElement).style.animation = "none";
        } catch {}

        const svgRect = (svgEl as SVGSVGElement).getBoundingClientRect();
        const pillRectPx = pill.getBoundingClientRect();
        const knobRectPx = knob.getBoundingClientRect();
        if (process.env.NODE_ENV === "development") {
          try {
            console.debug(
              "KonfiSwitchLoader: knob inline style attribute",
              knob.getAttribute("style"),
            );
            console.debug(
              "KonfiSwitchLoader: knob computed animation",
              window.getComputedStyle(knob as Element).animation,
            );
            console.debug(
              "KonfiSwitchLoader: svg computed animation",
              window.getComputedStyle(svgEl as Element).animation,
            );
          } catch (e) {
            // ignore
          }
        }

        // Image offset within container due to contain centering
        const imgOffsetX = (containerW - displayedW) / 2;

        // Compute left start and end as px inside the container using pixel measurements
        const pillLeftInsideImage = pillRectPx.left - svgRect.left; // px
        const pillWidthPx = pillRectPx.width;
        const knobWidthPx = knobRectPx.width;
        const startPx = imgOffsetX + pillLeftInsideImage + padding; // add some padding inside pill
        const endPx =
          imgOffsetX +
          pillLeftInsideImage +
          (pillWidthPx - knobWidthPx) -
          padding;
        const clampedStart = Math.max(padding, startPx);
        const clampedEnd = Math.max(clampedStart, endPx);

        setLeftStartPx(clampedStart);
        setLeftEndPx(clampedEnd);
        setKnobPx(Math.round(knobWidthPx));
        const computedDx = Math.round(clampedEnd - clampedStart);
        // If computed dx is very small in px, fall back to container fallback
        const finalDx = computedDx < 8 ? minVisibleFallback : computedDx;
        setDxPx(finalDx);
        console.debug("KonfiSwitchLoader: computed", {
          src,
          containerW,
          containerH,
          displayedW,
          displayedH,
          svgAspect,
          vbw,
          vbh,
          imgOffsetX,
          pillLeftInsideImage,
          pillWidthPx,
          knobWidthPx,
          clampedStart,
          clampedEnd,
          dx: finalDx,
        });
      } catch (err) {
        // fallback
        setLeftStartPx(leftStartFallback);
        setLeftEndPx(leftEndFallback);
        setKnobPx(knobDiameterFallback);
      } finally {
        if (hiddenContainer) {
          try {
            hiddenContainer.remove();
          } catch {}
        }
      }
    };
    compute();

    // Recompute on resize
    const ro = new ResizeObserver(() => compute());
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    const media =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)");
    // Recompute on reduced motion change (optional)
    const onMediaChange = () => compute();
    if (media && media.addEventListener)
      media.addEventListener("change", onMediaChange);

    return () => {
      cancelled = true;
      if (hiddenContainer) {
        try {
          hiddenContainer.remove();
        } catch {}
      }
      ro.disconnect();
      if (media && media.removeEventListener)
        media.removeEventListener("change", onMediaChange);
    };
  }, [
    src,
    width,
    height,
    padding,
    knobDiameterFallback,
    leftStartFallback,
    leftEndFallback,
  ]);

  // Sync a CSS custom property with the knob's transform so the mask "hole" follows it
  useEffect(() => {
    const host = wrapperRef.current;
    if (!host) return;
    const knobEl = host.querySelector(
      ".konfi-switch-knob",
    ) as HTMLElement | null;
    if (!knobEl) return;
    // ensure initial values
    host.style.setProperty("--konfi-k", "0px");
    const baseRadius = (knobPx !== null ? knobPx : knobDiameterFallback) / 2;
    host.style.setProperty("--konfi-r", `${Math.round(baseRadius)}px`);
    // RAF loop to read the knob's computed translateX and mirror it to --konfi-k on the host
    let raf = 0;
    const readTranslateX = () => {
      try {
        const t = window.getComputedStyle(knobEl).transform;
        let tx = 0;
        let sy = 1;
        if (t && t !== "none") {
          // matrix(a, b, c, d, tx, ty) or matrix3d(...)
          if (t.startsWith("matrix3d")) {
            const vals = t
              .slice(9, -1)
              .split(",")
              .map((v) => parseFloat(v.trim()));
            if (vals.length === 16) {
              tx = vals[12];
              sy = vals[5];
            }
          } else if (t.startsWith("matrix")) {
            const vals = t
              .slice(7, -1)
              .split(",")
              .map((v) => parseFloat(v.trim()));
            if (vals.length === 6) {
              tx = vals[4];
              // a=vals[0], d=vals[3]; we only scaled Y so d is scaleY
              sy = vals[3];
            }
          }
        }
        host.style.setProperty("--konfi-k", `${Math.round(tx)}px`);
        // update mask radius following scaleY (sy)
        const scaledRadius = Math.round(baseRadius * sy);
        host.style.setProperty("--konfi-r", `${scaledRadius}px`);
      } catch {
        // ignore
      }
      raf = window.requestAnimationFrame(readTranslateX);
    };
    raf = window.requestAnimationFrame(readTranslateX);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [dxPx, travelDistanceFallback, durationMs, bounceEasing, bounceDelayMs]);

  return (
    <Center
      role="img"
      aria-busy="true"
      aria-label={label}
      color="primary.solid"
    >
      <style>{`
        /* Typed custom properties for travel and dynamic radius */
        @property --konfi-k { syntax: "<length>"; inherits: true; initial-value: 0px; }
        @property --konfi-r { syntax: "<length>"; inherits: true; initial-value: 0px; }
        /* Natural motion with slight anticipation, follow-through and micro-hold at ends. */
        /* Keep animation-timing-function: linear; the keyframe spacing shapes the velocity. */
        @keyframes konfi-switch-bounce-transform {
          /* Anticipation (tiny), then accelerate */
          0% { transform: translateX(0) scaleY(1); }
          8% { transform: translateX(calc(var(--dx) * 0.00)) scaleY(1.02); }
          18% { transform: translateX(calc(var(--dx) * 0.12)) scaleY(1.06); }
          28% { transform: translateX(calc(var(--dx) * 0.26)) scaleY(1.10); }
          40% { transform: translateX(calc(var(--dx) * 0.43)) scaleY(1.12); }
          /* Peak speed zone with subtle squash */
          50% { transform: translateX(calc(var(--dx) * 0.55)) scaleY(1.12); }
          62% { transform: translateX(calc(var(--dx) * 0.70)) scaleY(1.09); }
          74% { transform: translateX(calc(var(--dx) * 0.83)) scaleY(1.06); }
          86% { transform: translateX(calc(var(--dx) * 0.94)) scaleY(1.03); }
          100% { transform: translateX(calc(var(--dx) * 1.0000)) scaleY(1.00); }
        }
        }
      `}</style>
      <Box
        ref={wrapperRef}
        position="relative"
        w={`${width}px`}
        h={`${height}px`}
        style={{
          ["--left-start" as any]: `${leftStartPx !== null ? leftStartPx : leftStartFallback}px`,
          ["--knob-d" as any]: `${knobPx !== null ? knobPx : knobDiameterFallback}px`,
          ["--knob-r" as any]: `${Math.round((knobPx !== null ? knobPx : knobDiameterFallback) / 2)}px`,
          ["--dx" as any]: `${dxPx !== null ? dxPx : 0}px`,
          ["--konfi-k" as any]: `0px`,
          ["--konfi-r" as any]: `${Math.round((knobPx !== null ? knobPx : knobDiameterFallback) / 2)}px`,
        }}
      >
        {/* Static optimized SVG logo as background using Next Image */}
        <Box
          position="absolute"
          inset={0}
          bgColor={"gray/20"}
          style={{
            // Combine the logo mask with a radial mask for the moving knob using exclusion (hole)
            maskImage: `url(${src}), radial-gradient(circle at calc(var(--left-start) + var(--konfi-k) + var(--konfi-r)) 50%, white 0, white var(--konfi-r), transparent calc(var(--konfi-r) + 1px))`,
            WebkitMaskImage: `url(${src}), radial-gradient(circle at calc(var(--left-start) + var(--konfi-k) + var(--konfi-r)) 50%, white 0, white var(--konfi-r), transparent calc(var(--konfi-r) + 1px))`,
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            maskSize: "contain, auto",
            WebkitMaskSize: "contain, auto",
            maskRepeat: "no-repeat, no-repeat",
            WebkitMaskRepeat: "no-repeat, no-repeat",
            maskPosition: "center, 0 0",
            WebkitMaskPosition: "center, 0 0",
          }}
        />
        {/* Animated knob overlay */}
        <Box
          className="konfi-switch-knob"
          position="absolute"
          top={`calc(50% - ${(knobPx !== null ? knobPx : knobDiameterFallback) / 2}px)`}
          left={
            leftStartPx !== null ? `${leftStartPx}px` : `${leftStartFallback}px`
          }
          w={knobPx !== null ? `${knobPx}px` : `${knobDiameterFallback}px`}
          h={knobPx !== null ? `${knobPx}px` : `${knobDiameterFallback}px`}
          borderRadius="full"
          bgColor="transparent"
          zIndex={2}
          pointerEvents="none"
          style={{
            willChange: "transform",
          }}
          animation={`konfi-switch-bounce-transform ${durationMs}ms ${bounceEasing} ${bounceDelayMs}ms infinite alternate`}
        />
      </Box>
    </Center>
  );
}
