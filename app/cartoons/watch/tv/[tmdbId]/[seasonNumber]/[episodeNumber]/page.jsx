import { notFound } from "next/navigation";
import SitulaApp from "../../../../../../components/situla-app";

function positiveInteger(value, allowZero = false) {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]{1,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && (allowZero ? id >= 0 : id > 0) ? id : null;
}

export const metadata = {
  title: "Cartoon Episode Player",
  robots: { index: false, follow: false }
};

export default async function CartoonEpisodeWatchPage({ params }) {
  const { tmdbId, seasonNumber, episodeNumber } = await params;
  const id = positiveInteger(tmdbId);
  const season = positiveInteger(seasonNumber, true);
  const episode = positiveInteger(episodeNumber);
  if (!id || season === null || !episode) notFound();
  return (
    <SitulaApp
      key={"cartoon-tv-player-" + id + "-" + season + "-" + episode}
      view="cartoonWatch"
      cartoonType="tv"
      tmdbId={id}
      seasonNumber={season}
      episodeNumber={episode}
    />
  );
}
