"use client";

import { useEffect, useRef, type CSSProperties } from "react";

type BurstStyle = CSSProperties & {
  "--image-burst-x": string;
  "--image-burst-y": string;
  "--image-burst-a": string;
  "--image-burst-b": string;
  "--image-burst-c": string;
  "--image-burst-d": string;
};

type RGB = { r: number; g: number; b: number };

const fallbackPalette = [
  "rgba(24,93,216,.58)",
  "rgba(255,159,28,.54)",
  "rgba(20,168,160,.5)",
  "rgba(168,144,232,.5)",
];

const paletteCache = new WeakMap<HTMLImageElement, string[]>();

function tuneColor({ r, g, b }: RGB) {
  const average = (r + g + b) / 3;
  const saturationBoost = 1.16;
  const lift = average < 72 ? 28 : 0;
  const channel = (value: number) =>
    Math.round(Math.max(18, Math.min(238, average + (value - average) * saturationBoost + lift)));

  return `rgba(${channel(r)},${channel(g)},${channel(b)},.56)`;
}

function averageEdge(
  pixels: Uint8ClampedArray,
  size: number,
  edge: "top" | "right" | "bottom" | "left",
) {
  const total: RGB & { count: number } = { r: 0, g: 0, b: 0, count: 0 };
  const depth = 3;

  for (let offset = 0; offset < depth; offset += 1) {
    for (let step = 0; step < size; step += 1) {
      const x = edge === "left" ? offset : edge === "right" ? size - 1 - offset : step;
      const y = edge === "top" ? offset : edge === "bottom" ? size - 1 - offset : step;
      const index = (y * size + x) * 4;
      if (pixels[index + 3] < 96) continue;

      total.r += pixels[index];
      total.g += pixels[index + 1];
      total.b += pixels[index + 2];
      total.count += 1;
    }
  }

  if (!total.count) return null;
  return tuneColor({
    r: total.r / total.count,
    g: total.g / total.count,
    b: total.b / total.count,
  });
}

function detectEdgePalette(image: HTMLImageElement) {
  const cached = paletteCache.get(image);
  if (cached) return cached;
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return fallbackPalette;

  try {
    const size = 40;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallbackPalette;

    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const palette = (["top", "right", "bottom", "left"] as const).map(
      (edge, index) => averageEdge(pixels, size, edge) ?? fallbackPalette[index],
    );
    paletteCache.set(image, palette);
    return palette;
  } catch {
    return fallbackPalette;
  }
}

export function ImageEdgeBursts() {
  const burstRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const burst = burstRef.current;
    if (!burst) return;

    let activeImage: HTMLImageElement | null = null;
    let touchTimer: number | undefined;

    const moveBurst = (clientX: number, clientY: number) => {
      burst.style.setProperty("--image-burst-x", `${clientX}px`);
      burst.style.setProperty("--image-burst-y", `${clientY}px`);
    };

    const activate = (image: HTMLImageElement, clientX: number, clientY: number) => {
      activeImage = image;
      moveBurst(clientX, clientY);
      const palette = detectEdgePalette(image);
      palette.forEach((color, index) => {
        burst.style.setProperty(`--image-burst-${String.fromCharCode(97 + index)}`, color);
      });
      burst.dataset.active = "true";
    };

    const deactivate = () => {
      activeImage = null;
      burst.dataset.active = "false";
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      activate(event.target, event.clientX, event.clientY);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (activeImage) moveBurst(event.clientX, event.clientY);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.target !== activeImage) return;
      if (event.relatedTarget === activeImage) return;
      deactivate();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      if (touchTimer) window.clearTimeout(touchTimer);
      activate(event.target, event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || !activeImage) return;
      if (touchTimer) window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(deactivate, 1200);
    };

    document.addEventListener("pointerover", handlePointerOver, { passive: true });
    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerout", handlePointerOut, { passive: true });
    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    document.addEventListener("pointerup", handlePointerUp, { passive: true });
    document.addEventListener("pointercancel", handlePointerUp, { passive: true });

    return () => {
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      if (touchTimer) window.clearTimeout(touchTimer);
    };
  }, []);

  const initialStyle = {
    "--image-burst-x": "50vw",
    "--image-burst-y": "50vh",
    "--image-burst-a": fallbackPalette[0],
    "--image-burst-b": fallbackPalette[1],
    "--image-burst-c": fallbackPalette[2],
    "--image-burst-d": fallbackPalette[3],
  } as BurstStyle;

  return (
    <div
      ref={burstRef}
      className="image-edge-burst"
      data-active="false"
      style={initialStyle}
      aria-hidden="true"
    />
  );
}
