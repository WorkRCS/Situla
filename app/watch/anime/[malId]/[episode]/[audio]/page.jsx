import { notFound } from "next/navigation";
import SeriesMediaPlayer from "../../../../../components/media-player";
import { normalizeAnimePlayerRoute } from "../../../../../../src/player-urls.js";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { malId, episode, audio } = await params;
  return {
    title: "Anime episode",
    robots: { index: false, follow: false },
    alternates: { canonical: "/watch/anime/" + malId + "/" + episode + "/" + audio }
  };
}

export default async function AnimeEpisodePage({ params }) {
  const { malId, episode, audio } = await params;
  const route = normalizeAnimePlayerRoute(malId, episode, audio);
  if (!route) notFound();
  return <SeriesMediaPlayer kind="anime" malId={route.malId} episode={route.episode} audio={route.audio} />;
}
