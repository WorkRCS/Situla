import TvSeriesExperience from "./detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { imdbId } = await params;
  return {
    title: "TV series",
    robots: { index: false, follow: false },
    alternates: { canonical: "/tv/" + encodeURIComponent(imdbId) }
  };
}

export default async function TvSeriesPage({ params }) {
  const { imdbId } = await params;
  return <TvSeriesExperience imdbId={imdbId} />;
}
