import PlayerExperience from "./player";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { tmdbId } = await params;
  return {
    title: "Now Playing",
    robots: { index: false, follow: false },
    alternates: { canonical: "/watch/" + encodeURIComponent(tmdbId) }
  };
}

export default async function WatchPage({ params }) {
  const { tmdbId } = await params;
  return <PlayerExperience tmdbId={tmdbId} />;
}
