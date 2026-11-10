"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TvEpisodeError({ error, reset }) {
  const router = useRouter();

  useEffect(() => {
    console.error("TV episode player render failed:", error);
  }, [error]);

  return (
    <main className="app-shell min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[760px] items-center px-4 py-12">
        <section className="empty-panel w-full text-center" role="alert">
          <div className="player-message-mark mx-auto">S</div>
          <h1 className="mt-4 text-xl font-bold text-white">TV player needs to recover</h1>
          <p className="mt-2 text-sm leading-6 text-[#a4a9b7]">
            The episode could not be opened correctly. You can retry the player or return to Situla.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" className="gold-button" onClick={() => reset()}>
              Try again
            </button>
            <button type="button" className="watch-control" onClick={() => router.replace("/")}>
              Back to Situla
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
