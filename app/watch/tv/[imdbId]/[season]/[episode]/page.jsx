import SeriesMediaPlayer from "../../../../../components/media-player";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { imdbId, season, episode } = await params;
  return {
    title: "TV episode",
    robots: { index: false, follow: false },
    alternates: { canonical: "/watch/tv/" + imdbId + "/" + season + "/" + episode }
  };
}

export default async function TvEpisodePage({ params }) {
  const { imdbId, season, episode } = await params;
  return <SeriesMediaPlayer kind="tv" imdbId={imdbId} season={season} episode={episode} />;
}
