import { notFound } from "next/navigation";
import TvSeriesExperience from "./detail";

export const dynamic = "force-dynamic";

function normalizeTmdbId(value) {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]{1,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({ params }) {
  const { tmdbId } = await params;
  const id = normalizeTmdbId(tmdbId);
  if (!id) {
    return { title: "TV series unavailable", robots: { index: false, follow: false } };
  }
  return {
    title: "TV series",
    robots: { index: false, follow: false },
    alternates: { canonical: "/tv/" + id }
  };
}

export default async function TvSeriesPage({ params }) {
  const { tmdbId } = await params;
  const id = normalizeTmdbId(tmdbId);
  if (!id) notFound();
  return <TvSeriesExperience tmdbId={id} />;
}
