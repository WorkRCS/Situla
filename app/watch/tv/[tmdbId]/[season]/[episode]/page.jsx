import { notFound } from "next/navigation";
import SeriesMediaPlayer from "../../../../../components/media-player";
import { normalizeTvPlayerRoute } from "../../../../../../src/player-urls.js";

export const dynamic = "force-dynamic";

async function getRoute(params) {
  const values = await params;
  return normalizeTvPlayerRoute(values?.tmdbId, values?.season, values?.episode);
}

export async function generateMetadata({ params }) {
  const route = await getRoute(params);
  if (!route) {
    return {
      title: "TV episode unavailable",
      robots: { index: false, follow: false }
    };
  }

  return {
    title: "TV episode",
    robots: { index: false, follow: false },
    alternates: {
      canonical: "/watch/tv/" + route.tmdbId + "/" + route.season + "/" + route.episode
    }
  };
}

export default async function TvEpisodePage({ params }) {
  const route = await getRoute(params);
  if (!route) notFound();

  return (
    <SeriesMediaPlayer
      kind="tv"
      tmdbId={route.tmdbId}
      season={route.season}
      episode={route.episode}
    />
  );
}
