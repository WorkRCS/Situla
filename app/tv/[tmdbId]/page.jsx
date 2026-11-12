import { notFound } from "next/navigation";
import TvSeriesExperience from "./detail";
import { connectDatabase } from "../../../src/db.js";
import { TvSeries } from "../../../src/models.js";

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
  if (!id) return { title: "TV series unavailable", robots: { index: false, follow: false } };
  const canonical = "/tv/" + id;
  const fallback = { title: "TV series on Situla", robots: { index: false, follow: false }, alternates: { canonical } };
  try {
    await connectDatabase();
    const series = await TvSeries.findOne({ tmdbId: id, adult: { $ne: true } }).select("title overview posterUrl").lean();
    if (!series) return fallback;
    const title = series.title || "TV series";
    const description = String(series.overview || ("Watch " + title + " on Situla.")).slice(0, 300);
    const images = series.posterUrl ? [{ url: series.posterUrl, alt: title + " poster" }] : [];
    return {
      title,
      description,
      robots: { index: false, follow: false },
      alternates: { canonical },
      openGraph: { type: "video.tv_show", title, description, url: canonical, images },
      twitter: { card: images.length ? "summary_large_image" : "summary", title, description, images: images.map((image) => image.url) }
    };
  } catch {
    return fallback;
  }
}

export default async function TvSeriesPage({ params }) {
  const { tmdbId } = await params;
  const id = normalizeTmdbId(tmdbId);
  if (!id) notFound();
  return <TvSeriesExperience tmdbId={id} />;
}
