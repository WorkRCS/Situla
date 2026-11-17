"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function wrapIndex(index, length) {
  return ((index % length) + length) % length;
}

export default function ThreeCardHero({
  items = [],
  index = 0,
  onIndexChange,
  getImage,
  getTitle,
  renderCenter,
  ariaLabel = "Featured content"
}) {
  const [direction, setDirection] = useState(0);
  const [rebasing, setRebasing] = useState(false);

  useEffect(() => {
    if (!rebasing) return undefined;
    const frame = window.requestAnimationFrame(() => setRebasing(false));
    return () => window.cancelAnimationFrame(frame);
  }, [rebasing]);

  if (!Array.isArray(items) || !items.length) return null;

  const safeIndex = wrapIndex(index, items.length);
  const canNavigate = items.length > 1 && direction === 0;
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
              {isCenter ? renderCenter?.(item) : (
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
