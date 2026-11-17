import { notFound } from "next/navigation";
import CartoonSeriesDetail from "../../../components/cartoon-series-detail.jsx";

function normalizeTmdbId(value) {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]{1,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({ params }) {
  const { tmdbId } = await params;
  const id = normalizeTmdbId(tmdbId);
  return {
    title: id ? "Cartoon Series" : "Cartoon Series unavailable",
    robots: { index: false, follow: false },
    alternates: id ? { canonical: "/cartoons/tv/" + id } : undefined
  };
}

export default async function CartoonSeriesPage({ params }) {
  const { tmdbId } = await params;
  const id = normalizeTmdbId(tmdbId);
  if (!id) notFound();
  return <CartoonSeriesDetail tmdbId={id} />;
}
