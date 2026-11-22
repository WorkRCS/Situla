"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function wrapIndex(index, length) {
  return ((index % length) + length) % length;
}

function extractPosterPalette(image) {
  try {
    const width = image?.naturalWidth || image?.width || 0;
    const height = image?.naturalHeight || image?.height || 0;
    if (!image || !width || !height) return [];
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(image, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const buckets = new Map();
    let allR = 0;
    let allG = 0;
    let allB = 0;
    let allCount = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 180) continue;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const high = Math.max(red, green, blue);
      const low = Math.min(red, green, blue);
      const saturation = high === 0 ? 0 : (high - low) / high;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      allR += red;
      allG += green;
      allB += blue;
      allCount += 1;

      // Ignore near-black and near-white poster borders, but retain muted
      // colors too: the ambient effect should reflect the whole artwork.
      if (luminance < 18 || luminance > 248) continue;
      const key = (red >> 4) + ":" + (green >> 4) + ":" + (blue >> 4);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { red: 0, green: 0, blue: 0, count: 0, score: 0 };
        buckets.set(key, bucket);
      }
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      bucket.count += 1;
      bucket.score += 1 + saturation * 1.7;
    }

    const candidates = [...buckets.values()]
      .filter((bucket) => bucket.count > 0)
      .map((bucket) => ({
        red: bucket.red / bucket.count,
        green: bucket.green / bucket.count,
        blue: bucket.blue / bucket.count,
        score: bucket.score
      }))
      .sort((left, right) => right.score - left.score);

    if (!candidates.length) {
      if (!allCount) return [];
      return [[allR, allG, allB]
        .map((value) => Math.max(0, Math.min(255, Math.round(value / allCount))))
        .join(", ")];
    }

    // Pick several genuinely different color clusters rather than letting
    // neighboring shades of one hue dominate the ambient palette.
    const selected = [];
    for (const minimumDistance of [64, 42, 24]) {
      for (const candidate of candidates) {
        if (selected.length >= 4) break;
        const distinct = selected.every((color) => {
          const red = candidate.red - color.red;
          const green = candidate.green - color.green;
          const blue = candidate.blue - color.blue;
          return Math.sqrt(red * red + green * green + blue * blue) >= minimumDistance;
        });
        if (distinct) selected.push(candidate);
      }
      if (selected.length >= 4) break;
    }

    return selected.slice(0, 4).map((color) =>
      [color.red, color.green, color.blue]
        .map((value) => Math.max(0, Math.min(255, Math.round(value))))
        .join(", ")
    );
  } catch {
    // Palette sampling is decorative; unsupported canvas access must never
    // interrupt the poster, hero navigation, or the rest of the page.
    return [];
  }
}
async function samplePosterPalette(imageUrl, signal) {
  const endpoint = "/api/share-poster?url=" + encodeURIComponent(imageUrl);
  const response = await fetch(endpoint, {
    credentials: "same-origin",
    cache: "force-cache",
    signal
  });
  if (!response.ok) throw new Error("Poster palette source is unavailable.");

  const blob = await response.blob();
  if (!blob.size) throw new Error("Poster palette source is empty.");

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      return extractPosterPalette(bitmap);
    } finally {
      bitmap.close?.();
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Poster palette image could not be decoded."));
      element.src = objectUrl;
    });
    return extractPosterPalette(image);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ThreeCardHero({
  items = [],
  index = 0,
  onIndexChange,
  getImage,
  getTitle,
  renderCenter,
  onPaletteChange,
  ariaLabel = "Featured content"
}) {
  const [direction, setDirection] = useState(0);
  const [rebasing, setRebasing] = useState(false);

  useEffect(() => {
    if (!rebasing) return undefined;
    const frame = window.requestAnimationFrame(() => setRebasing(false));
    return () => window.cancelAnimationFrame(frame);
  }, [rebasing]);

  const hasItems = Array.isArray(items) && items.length > 0;
  const safeIndex = hasItems ? wrapIndex(index, items.length) : 0;
  const activeItem = hasItems ? items[safeIndex] : null;
  const activeIdentity = String(activeItem?.heroId || activeItem?.tmdbId || activeItem?.imdbId || activeItem?.malId || (activeItem ? getTitle?.(activeItem) : "") || "");
  const activeIdentityRef = useRef(activeIdentity);
  const paletteRequestRef = useRef(null);
  activeIdentityRef.current = activeIdentity;
  const canNavigate = hasItems && items.length > 1 && direction === 0;

  useEffect(() => {
    paletteRequestRef.current?.abort();
    paletteRequestRef.current = null;
    onPaletteChange?.(null);
    return () => {
      paletteRequestRef.current?.abort();
      paletteRequestRef.current = null;
    };
  }, [activeIdentity, onPaletteChange]);

  const onCenterImageLoad = useCallback((event) => {
    if (activeIdentityRef.current !== activeIdentity) return;
    const imageUrl = event.currentTarget.currentSrc || event.currentTarget.src;
    if (!imageUrl) return;

    paletteRequestRef.current?.abort();
    const controller = new AbortController();
    paletteRequestRef.current = controller;
    const sampleWhenIdle = () => {
      if (controller.signal.aborted) return;
      void samplePosterPalette(imageUrl, controller.signal)
        .then((palette) => {
          if (!controller.signal.aborted && activeIdentityRef.current === activeIdentity) {
            onPaletteChange?.(palette);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted && activeIdentityRef.current === activeIdentity) {
            onPaletteChange?.(null);
          }
        });
    };

    // Palette sampling is decorative; let the slide animation and image decode finish first.
    if (typeof window.requestIdleCallback === "function") {
      const idleHandle = window.requestIdleCallback(sampleWhenIdle, { timeout: 1400 });
      controller.signal.addEventListener("abort", () => {
        window.cancelIdleCallback?.(idleHandle);
      }, { once: true });
    } else {
      const timerHandle = window.setTimeout(sampleWhenIdle, 460);
      controller.signal.addEventListener("abort", () => {
        window.clearTimeout(timerHandle);
      }, { once: true });
    }
  }, [activeIdentity, onPaletteChange]);

  if (!hasItems) return null;
  const visibleItems = [-2, -1, 0, 1, 2].map((offset) => {
    const item = items[wrapIndex(safeIndex + offset, items.length)];
    const title = getTitle?.(item) || "Featured title";
    const identity = String(item?.heroId || item?.tmdbId || item?.imdbId || item?.malId || title);
    return { offset, item, title, identity };
  });

  function move(nextDirection) {
    if (!canNavigate) return;
    setDirection(nextDirection);
  }

  function finishTransition(event) {
    if (event.target !== event.currentTarget || direction === 0) return;
    setRebasing(true);
    onIndexChange?.(wrapIndex(safeIndex + direction, items.length));
    setDirection(0);
  }

  return (
    <section
      className="home-hero-deck"
      aria-label={ariaLabel}
      aria-roledescription="carousel"
      data-slide-direction={direction}
    >
      <div
        className={"home-hero-deck-track" + (direction > 0 ? " is-next" : direction < 0 ? " is-previous" : "") + (rebasing ? " is-rebasing" : "")}
        onTransitionEnd={finishTransition}
      >
        {visibleItems.map(({ offset, item, title, identity }) => {
          const image = getImage?.(item) || "";
          const isCenter = offset === 0;
          const isAdjacent = Math.abs(offset) === 1;
          return (
            <div
              key={items.length < 5 ? identity + ":" + offset : identity}
              className={
                "home-hero-deck-slide" +
                (isCenter ? " is-center" : isAdjacent ? " is-adjacent" : " is-outer")
              }
              aria-hidden={!isCenter}
            >
              {isCenter ? renderCenter?.(item, onCenterImageLoad) : (
                <div className="home-hero-deck-side" aria-hidden="true">
                  {image && <img src={image} alt="" loading={Math.abs(offset) === 1 ? "eager" : "lazy"} decoding="async" />}
                  <span className="home-hero-deck-side-copy">
                    <small>{offset < 0 ? "UP NEXT" : "COMING UP"}</small>
                    <strong>{title}</strong>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="home-hero-deck-arrow home-hero-deck-arrow-left"
        onClick={() => move(-1)}
        disabled={!canNavigate}
        aria-label="Previous featured title"
      >
        <ChevronLeft size={30} strokeWidth={2.1} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="home-hero-deck-arrow home-hero-deck-arrow-right"
        onClick={() => move(1)}
        disabled={!canNavigate}
        aria-label="Next featured title"
      >
        <ChevronRight size={30} strokeWidth={2.1} aria-hidden="true" />
      </button>
      <span className="sr-only" aria-live="polite">
        {getTitle?.(items[safeIndex]) || "Featured title"} · {safeIndex + 1} of {items.length}
      </span>
    </section>
  );
}
