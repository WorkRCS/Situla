import SeriesMediaPlayer from "../../../../../components/media-player";

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
  const subOrDub = audio === "dub" ? "dub" : "sub";
  return <SeriesMediaPlayer kind="anime" malId={malId} episode={episode} audio={subOrDub} />;
}
