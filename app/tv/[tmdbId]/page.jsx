import TvSeriesExperience from "./detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { tmdbId } = await params;
  return {
    title: "TV series",
    robots: { index: false, follow: false },
    alternates: { canonical: "/tv/" + encodeURIComponent(tmdbId) }
  };
}

export default async function TvSeriesPage({ params }) {
  const { tmdbId } = await params;
  return <TvSeriesExperience tmdbId={tmdbId} />;
}
