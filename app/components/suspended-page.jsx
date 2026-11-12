"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Clock3 } from "lucide-react";

export default function SuspendedPage() {
  const [details, setDetails] = useState(null);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.user) {
          window.location.replace("/");
          return;
        }
        setDetails(payload);
      })
      .catch(() => setDetails({ error: "Your account is currently restricted." }));
  }, []);
  const until = details?.suspendedUntil ? new Date(details.suspendedUntil).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" }) : null;
  return <main className="suspended-page"><section><span className="suspended-icon"><ShieldAlert size={30}/></span><span className="admin-kicker">SITULA ACCOUNT SECURITY</span><h1>Account suspended</h1><p>This account has temporarily lost access to Situla. Contact support if you believe this is a mistake.</p>{until ? <div className="suspended-expiry"><Clock3 size={17}/> Access is scheduled to return: <strong>{until}</strong></div> : <div className="suspended-expiry"><ShieldAlert size={17}/> This suspension has no automatic end date.</div>}{details?.reason && <p className="suspended-reason">Reason: {details.reason}</p>}<a href="/login">Return to sign in</a></section></main>;
}
