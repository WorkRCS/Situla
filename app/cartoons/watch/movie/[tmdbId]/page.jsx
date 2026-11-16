import { notFound } from "next/navigation";
import SitulaApp from "../../../../components/situla-app";

function normalizeTmdbId(value) {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]{1,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const metadata = {
  title: "Cartoon Movie Player",
  robots: { index: false, follow: false }
};

export default async function CartoonMovieWatchPage({ params }) {
  const { tmdbId } = await params;
  const id = normalizeTmdbId(tmdbId);
  if (!id) notFound();
  return <SitulaApp key={"cartoon-movie-player-" + id} view="cartoonWatch" cartoonType="movie" tmdbId={id} />;
}
