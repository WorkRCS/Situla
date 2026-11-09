import PlayerExperience from "./player";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { imdbId } = await params;
  return {
    title: "Now Playing",
    robots: { index: false, follow: false },
    alternates: { canonical: "/watch/" + encodeURIComponent(imdbId) }
  };
}

export default async function WatchPage({ params }) {
  const { imdbId } = await params;
  return <PlayerExperience imdbId={imdbId} />;
}
