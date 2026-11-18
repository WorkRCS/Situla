"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function wrapIndex(index, length) {
  return ((index % length) + length) % length;
}

function extractPosterDominantRgb(image) {
  try {
    const width = image?.naturalWidth || image?.width || 0;
    const height = image?.naturalHeight || image?.height || 0;
    if (!image || !width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 20;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 20, 20);
    const pixels = context.getImageData(0, 0, 20, 20).data;
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

      // Ignore near-black and near-white pixels so the palette follows the
      // artwork rather than letterboxing, poster text, or the page frame.
      if (luminance < 22 || luminance > 246 || saturation < 0.12) continue;
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
      bucket.score += 1 + saturation * 1.6;
    }

    let dominant = null;
    for (const bucket of buckets.values()) {
      if (!dominant || bucket.score > dominant.score) dominant = bucket;
    }
    const selected = dominant || (allCount ? {
      red: allR, green: allG, blue: allB, count: allCount
    } : null);
    if (!selected || !selected.count) return null;
    return [selected.red, selected.green, selected.blue]
      .map((value) => Math.max(0, Math.min(255, Math.round(value / selected.count)))
      )
      .join(", ");
  } catch {
    // A browser or image host that blocks canvas sampling still gets the
    // normal poster-driven hero artwork; never interrupt navigation for it.
    return null;
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
      return extractPosterDominantRgb(bitmap);
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
    return extractPosterDominantRgb(image);
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
    void samplePosterPalette(imageUrl, controller.signal)
      .then((dominantRgb) => {
        if (!controller.signal.aborted && activeIdentityRef.current === activeIdentity) {
          onPaletteChange?.(dominantRgb);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && activeIdentityRef.current === activeIdentity) {
          onPaletteChange?.(null);
        }
      });
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
                  {image && <img src={image} alt="" loading="lazy" decoding="async" />}
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
