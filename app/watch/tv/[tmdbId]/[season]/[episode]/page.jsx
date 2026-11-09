import SeriesMediaPlayer from "../../../../../components/media-player";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { tmdbId, season, episode } = await params;
  return {
    title: "TV episode",
    robots: { index: false, follow: false },
    alternates: { canonical: "/watch/tv/" + tmdbId + "/" + season + "/" + episode }
  };
}

export default async function TvEpisodePage({ params }) {
  const { tmdbId, season, episode } = await params;
  return <SeriesMediaPlayer kind="tv" tmdbId={tmdbId} season={season} episode={episode} />;
}
