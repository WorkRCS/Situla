import PlayerExperience from "./player";
import { connectDatabase } from "../../../src/db.js";
import { Movie } from "../../../src/models.js";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { imdbId: rawId } = await params;
  const imdbId = String(rawId || "").toLowerCase();
  const fallback = {
    title: "Movie on Situla",
    robots: { index: false, follow: false },
    alternates: { canonical: "/watch/" + encodeURIComponent(imdbId) }
  };
  if (!/^tt\d{5,12}$/.test(imdbId)) return fallback;
  try {
    await connectDatabase();
    const movie = await Movie.findOne({ imdbId, adult: { $ne: true } }).select("title overview posterUrl").lean();
    if (!movie) return fallback;
    const title = movie.title || "Movie";
    const description = String(movie.overview || ("Watch " + title + " on Situla.")).slice(0, 300);
    const images = movie.posterUrl ? [{ url: movie.posterUrl, alt: title + " poster" }] : [];
    return {
      title,
      description,
      robots: { index: false, follow: false },
      alternates: { canonical: "/watch/" + encodeURIComponent(imdbId) },
      openGraph: { type: "video.movie", title, description, url: "/watch/" + encodeURIComponent(imdbId), images },
      twitter: { card: images.length ? "summary_large_image" : "summary", title, description, images: images.map((image) => image.url) }
    };
  } catch {
    return fallback;
  }
}

export default async function WatchPage({ params }) {
  const { imdbId } = await params;
  return <PlayerExperience imdbId={imdbId} />;
}
