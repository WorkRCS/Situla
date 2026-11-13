import AnimeSeriesExperience from "./detail";
import { SiteWorkspace } from "../../components/site-sidebar.jsx";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { malId } = await params;
  return {
    title: "Anime series",
    robots: { index: false, follow: false },
    alternates: { canonical: "/anime/" + encodeURIComponent(malId) }
  };
}

export default async function AnimeSeriesPage({ params }) {
  const { malId } = await params;
  return <SiteWorkspace><AnimeSeriesExperience malId={malId} /></SiteWorkspace>;
}
