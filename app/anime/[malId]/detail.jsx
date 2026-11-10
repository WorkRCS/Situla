"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function episodeRouteNumber(item) {
  return Number(item?.episodeNumber) || 1;
}

function formatEpisodeMeta(item) {
  return [item.airDate, item.runtime ? item.runtime + " min" : ""].filter(Boolean).join(" · ");
}

export default function AnimeSeriesExperience({ malId }) {
  const router = useRouter();
  const [anime, setAnime] = useState(null);
  const [posterSource, setPosterSource] = useState("");
  const [posterFailed, setPosterFailed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("1");
  const [audio, setAudio] = useState("sub");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/anime/" + encodeURIComponent(malId), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Anime series not found.");
        const item = payload.item;
        setAnime(item);
        setPosterSource(item.posterUrl || "");
        setPosterFailed(false);
        setBannerFailed(false);

        const guide = Array.isArray(item.episodeGuide) ? item.episodeGuide : [];
        const first = [...guide].sort((a, b) =>
          Number(a.seasonNumber) - Number(b.seasonNumber) ||
          Number(a.episodeNumber) - Number(b.episodeNumber)
        )[0];
        const fallbackEpisode = (() => {
          try {
            const saved = JSON.parse(localStorage.getItem("situla:anime-last-episode:v1") || "{}");
            return Number(saved.malId) === Number(malId) && Number.isSafeInteger(Number(saved.episode))
              ? Number(saved.episode)
              : 0;
          } catch { return 0; }
        })();
        const resumeEntry = guide.find((entry) => episodeRouteNumber(entry) === fallbackEpisode);
        if (resumeEntry) {
          setSeasonNumber(String(resumeEntry.seasonNumber));
          setEpisodeNumber(String(resumeEntry.episodeNumber));
        } else if (first) {
          setSeasonNumber(String(first.seasonNumber));
          setEpisodeNumber(String(first.episodeNumber));
        } else {
          setSeasonNumber("1");
          setEpisodeNumber(fallbackEpisode > 0 ? String(fallbackEpisode) : "1");
        }

        try {
          const saved = JSON.parse(localStorage.getItem("situla:anime-last-episode:v1") || "{}");
          if (Number(saved.malId) === Number(malId) && (saved.audio === "sub" || saved.audio === "dub")) {
            setAudio(saved.audio);
          }
        } catch {}
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [malId]);

  const episodeGuide = useMemo(() => (
    Array.isArray(anime?.episodeGuide)
      ? [...anime.episodeGuide].sort((a, b) =>
          Number(a.seasonNumber) - Number(b.seasonNumber) ||
          Number(a.episodeNumber) - Number(b.episodeNumber)
        )
      : []
  ), [anime]);
  const seasons = useMemo(() => [...new Set(episodeGuide.map((item) => Number(item.seasonNumber) || 1))].sort((a, b) => a - b), [episodeGuide]);
  const seasonEpisodes = episodeGuide.filter((item) => String(item.seasonNumber || 1) === String(seasonNumber));
  const selectedEpisode = seasonEpisodes.find((item) => Number(item.episodeNumber) === Number(episodeNumber)) || null;
  const sortedGuide = episodeGuide;
  const selectedIndex = selectedEpisode
    ? sortedGuide.findIndex((item) => Number(item.seasonNumber) === Number(selectedEpisode.seasonNumber) && Number(item.episodeNumber) === Number(selectedEpisode.episodeNumber))
    : -1;
  const nextEpisode = selectedIndex >= 0 ? sortedGuide[selectedIndex + 1] || null : null;
  const relatedAnime = Array.isArray(anime?.relatedAnime) ? anime.relatedAnime : [];

  function playAnime(entry = selectedEpisode) {
    const number = entry ? episodeRouteNumber(entry) : Number(episodeNumber);
    if (!Number.isSafeInteger(number) || number < 1 || (anime?.episodes && number > Number(anime.episodes))) return;
    try {
      localStorage.setItem("situla:anime-last-episode:v1", JSON.stringify({
        malId: Number(malId),
        episode: number,
        audio
      }));
    } catch {}
    router.push("/watch/anime/" + encodeURIComponent(malId) + "/" + number + "/" + audio);
  }

  function selectEpisode(item) {
    setSeasonNumber(String(item.seasonNumber || 1));
    setEpisodeNumber(String(item.episodeNumber));
  }

  return (
    <main className="app-shell min-h-screen">
      <div className="mx-auto max-w-[1120px] px-4 py-6 md:px-8 md:py-10">
        <button className="watch-control mb-5" onClick={() => router.back()} aria-label="Go back">
          <i className="bi bi-arrow-left" aria-hidden="true" />
        </button>

        {loading ? (
          <div className="empty-panel">Loading anime details and episode guide…</div>
        ) : error ? (
          <div className="empty-panel">
            <h1 className="font-bold text-white">Anime unavailable</h1>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : anime ? (
          <>
            <section className="relative mb-6 min-h-[230px] overflow-hidden rounded-3xl border border-white/10 bg-[#11131b] md:min-h-[320px]">
              {!bannerFailed && (anime.bannerUrl || anime.backdropUrl || anime.posterUrl) ? (
                <img
                  src={anime.bannerUrl || anime.backdropUrl || anime.posterUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover opacity-45"
                  onError={(event) => {
                    const fallback = anime.posterUrl || anime.posterFallbackUrl;
                    if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                    else setBannerFailed(true);
                  }}
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-[#08090de8] to-[#08090d70]" />
              <div className="relative z-10 flex min-h-[230px] items-end p-5 md:min-h-[320px] md:p-8">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-black tracking-[.2em] text-[#f0c471]">SITULA ANIME · MAL {anime.malId}</p>
                  <h1 className="mt-2 text-3xl font-black text-white md:text-5xl">{anime.titleEnglish || anime.title}</h1>
                  {anime.titleJapanese && <p className="mt-2 text-sm text-[#d0d3dc]">{anime.titleJapanese}</p>}
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#c0c4ce]">
                    {anime.releaseYear && <span className="rounded-full border border-white/20 px-3 py-1">{anime.releaseYear}</span>}
                    {anime.score > 0 && <span className="rounded-full border border-white/20 px-3 py-1">★ {Number(anime.score).toFixed(2)} MAL</span>}
                    {anime.status && <span className="rounded-full border border-white/20 px-3 py-1">{anime.status}</span>}
                    {anime.episodes > 0 && <span className="rounded-full border border-white/20 px-3 py-1">{anime.episodes} episodes</span>}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 md:grid-cols-[260px_1fr]">
              <aside className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131b]">
                  {!posterFailed && (posterSource || anime.posterUrl) ? (
                    <img
                      src={posterSource || anime.posterUrl}
                      alt={anime.titleEnglish || anime.title}
                      className="w-full object-cover"
                      loading="eager"
                      onError={() => {
                        if (anime.posterFallbackUrl && posterSource !== anime.posterFallbackUrl) {
                          setPosterSource(anime.posterFallbackUrl);
                        } else {
                          setPosterFailed(true);
                        }
                      }}
                    />
                  ) : (
                    <div className="flex min-h-[340px] flex-col items-center justify-center gap-3 text-[#777e8e]">
                      <i className="bi bi-image text-3xl" aria-hidden="true" />
                      <span className="text-xs">Poster unavailable</span>
                    </div>
                  )}
                </div>

                {anime.nextAiringEpisode?.episode && (
                  <div className="rounded-2xl border border-[#e8b65b]/30 bg-[#171a23] p-4">
                    <p className="text-[10px] font-black tracking-[.16em] text-[#e8b65b]">UPCOMING EPISODE</p>
                    <p className="mt-2 font-bold text-white">Episode {anime.nextAiringEpisode.episode}</p>
                    {anime.nextAiringEpisode.airDate && <p className="mt-1 text-xs text-[#a4a9b7]">{anime.nextAiringEpisode.airDate}</p>}
                  </div>
                )}
                <a
                  href={anime.malUrl || ("https://myanimelist.net/anime/" + anime.malId)}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-[#e8b65b] underline underline-offset-4"
                >
                  Open this exact title on MyAnimeList ↗
                </a>
              </aside>

              <section className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  {(anime.genres || []).map((genre) => <span key={genre} className="genre-chip">{genre}</span>)}
                </div>
                <p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-7 text-[#b5bac7]">
                  {anime.synopsis || "No synopsis available."}
                </p>
                {(anime.studios?.length > 0 || anime.producers?.length > 0) && (
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#9297a7]">
                    {anime.studios?.length > 0 && <span>Studio: {anime.studios.join(", ")}</span>}
                    {anime.producers?.length > 0 && <span>Produced by: {anime.producers.join(", ")}</span>}
                  </div>
                )}

                <div className="mt-8 rounded-2xl border border-white/10 bg-[#11131b] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black tracking-[.18em] text-[#e8b65b]">WATCH AN EPISODE</p>
                      <h2 className="mt-1 text-lg font-black text-white">Choose season, episode and audio</h2>
                    </div>
                    <span className="text-xs text-[#9297a7]">{episodeGuide.length ? episodeGuide.length + " guide entries" : "Manual episode selection"}</span>
                  </div>

                  {episodeGuide.length > 0 ? (
                    <>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="block text-xs text-[#9297a7]">Season
                          <select
                            className="series-control mt-2"
                            value={seasonNumber}
                            onChange={(event) => {
                              const nextSeason = event.target.value;
                              setSeasonNumber(nextSeason);
                              const first = episodeGuide.find((item) => String(item.seasonNumber || 1) === nextSeason);
                              if (first) setEpisodeNumber(String(first.episodeNumber));
                            }}
                          >
                            {seasons.map((season) => <option key={season} value={season}>Season {season}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-[#9297a7]">Episode
                          <select className="series-control mt-2" value={episodeNumber} onChange={(event) => setEpisodeNumber(event.target.value)}>
                            {seasonEpisodes.map((item) => (
                              <option key={item.episodeNumber} value={item.episodeNumber}>
                                E{item.episodeNumber} · {item.title || "Episode " + item.episodeNumber}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </>
                  ) : (
                    <label className="mt-4 block text-xs text-[#9297a7]">Episode number
                      <input
                        className="series-control series-input mt-2"
                        type="number"
                        min="1"
                        max={anime.episodes || 9999}
                        value={episodeNumber}
                        onChange={(event) => setEpisodeNumber(event.target.value)}
                      />
                    </label>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" className={audio === "sub" ? "gold-button" : "ghost-button"} onClick={() => setAudio("sub")}>Japanese · Sub</button>
                    <button type="button" className={audio === "dub" ? "gold-button" : "ghost-button"} onClick={() => setAudio("dub")}>English · Dub</button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="gold-button" disabled={!episodeNumber || Number(episodeNumber) < 1 || (episodeGuide.length === 0 && anime.episodes && Number(episodeNumber) > anime.episodes)} onClick={() => playAnime()}>
                      <i className="bi bi-play-fill" aria-hidden="true" /> Play episode
                    </button>
                    {nextEpisode && (
                      <button className="ghost-button" onClick={() => playAnime(nextEpisode)}>
                        <i className="bi bi-skip-forward-fill" aria-hidden="true" /> Next episode · {nextEpisode.title}
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#858b9b]">Playback uses this exact MyAnimeList ID and the selected numbered episode. Sub/Dub fallback stays enabled.</p>
                </div>

                {episodeGuide.length > 0 && (
                  <div className="mt-8">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black tracking-[.18em] text-[#e8b65b]">EPISODE BY EPISODE</p>
                        <h2 className="mt-1 text-xl font-black text-white">Season {seasonNumber} episode guide</h2>
                      </div>
                      <span className="text-xs text-[#9297a7]">{seasonEpisodes.length} episodes</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {seasonEpisodes.map((item) => (
                        <article
                          key={item.seasonNumber + "-" + item.episodeNumber}
                          className={"overflow-hidden rounded-2xl border bg-[#11131b] transition " + (
                            Number(episodeNumber) === Number(item.episodeNumber) ? "border-[#e8b65b]/70" : "border-white/10"
                          )}
                        >
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.title} loading="lazy" className="aspect-video w-full object-cover" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                          ) : (
                            <div className="flex aspect-video items-center justify-center bg-[#1a1d27] text-3xl text-[#626a7b]"><i className="bi bi-play-circle" aria-hidden="true" /></div>
                          )}
                          <div className="p-3">
                            <p className="text-[9px] font-black tracking-[.15em] text-[#e8b65b]">S{item.seasonNumber} · E{item.episodeNumber}</p>
                            <h3 className="mt-1 line-clamp-2 text-sm font-bold text-white">{item.title}</h3>
                            {item.titleJapanese && <p className="mt-1 text-[10px] text-[#9297a7]">{item.titleJapanese}</p>}
                            <p className="mt-2 text-[10px] text-[#9297a7]">{formatEpisodeMeta(item) || "Episode details verified by source"}</p>
                            <div className="mt-3 flex gap-2">
                              <button className="ghost-button flex-1" onClick={() => selectEpisode(item)}>
                                {Number(episodeNumber) === Number(item.episodeNumber) ? "Selected" : "Select episode"}
                              </button>
                              <button className="gold-button" onClick={() => playAnime(item)} aria-label={"Play " + item.title}>
                                <i className="bi bi-play-fill" aria-hidden="true" /> Play
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {relatedAnime.length > 0 && (
                  <div className="mt-9">
                    <p className="text-[9px] font-black tracking-[.18em] text-[#e8b65b]">FRANCHISE / SEASON ORDER</p>
                    <h2 className="mt-1 text-xl font-black text-white">Related seasons and entries</h2>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {relatedAnime.map((item) => (
                        <a key={item.malId} href={"/anime/" + item.malId} className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131b] transition hover:border-[#e8b65b]/60">
                          {item.posterUrl ? (
                            <img src={item.posterUrl} alt={item.title} loading="lazy" className="aspect-[2/3] w-full object-cover" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                          ) : (
                            <div className="flex aspect-[2/3] items-center justify-center bg-[#1a1d27] text-3xl text-[#626a7b]"><i className="bi bi-film" aria-hidden="true" /></div>
                          )}
                          <div className="p-3">
                            <p className="text-[9px] font-black tracking-[.12em] text-[#e8b65b]">{String(item.relationType || "RELATED").replaceAll("_", " ")}</p>
                            <h3 className="mt-1 line-clamp-2 text-xs font-bold text-white">{item.title}</h3>
                            {item.seasonYear && <p className="mt-1 text-[10px] text-[#9297a7]">{item.seasonYear}</p>}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {anime.sourceUrl && (
                  <p className="mt-6 text-[10px] text-[#727989]">
                    Metadata source: <a href={anime.sourceUrl} target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">Open verified MAL-matched record ↗</a>
                  </p>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
