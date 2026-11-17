import { notFound } from "next/navigation";
import { SiteWorkspace } from "../../../../../components/site-sidebar.jsx";
import SeriesMediaPlayer from "../../../../../components/media-player";
import { normalizeAnimePlayerRoute } from "../../../../../../src/anime-player-route.js";

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
  return <SiteWorkspace><SeriesMediaPlayer kind="anime" malId={route.malId} episode={route.episode} audio={route.audio} /></SiteWorkspace>;
}
