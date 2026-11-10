"use client";

import { useEffect, useState } from "react";
import {
  BRAVE_ACCESS_COOKIE_NAME,
  BRAVE_ACCESS_COOKIE_VALUE
} from "../../src/browser-access.js";

function safeReturnPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }
  return value;
}

export default function BrowserCheckPage() {
  const [message, setMessage] = useState("Checking browser support…");

  useEffect(() => {
    let active = true;

    async function verifyBrave() {
      let isBrave = false;

      try {
        const braveApi = window.navigator.brave;
        isBrave =
          Boolean(braveApi) &&
          typeof braveApi.isBrave === "function" &&
          (await braveApi.isBrave()) === true;
      } catch {
        isBrave = false;
      }

      if (!active) return;

      if (!isBrave) {
        setMessage(
          "Situla is available only in Brave Browser or the existing Situla Android app."
        );
        return;
      }

      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        BRAVE_ACCESS_COOKIE_NAME + "=" + BRAVE_ACCESS_COOKIE_VALUE +
        "; Path=/; Max-Age=34560000; SameSite=Lax" + secure;

      const requestedPath = new URLSearchParams(window.location.search).get("next");
      window.location.replace(safeReturnPath(requestedPath));
    }

    verifyBrave();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
        background: "#08090e",
        color: "#f5f6fa",
        textAlign: "center",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <section style={{ width: "100%", maxWidth: 460 }}>
        <div
          aria-hidden="true"
          style={{
            width: 64,
            height: 64,
            margin: "0 auto 24px",
            display: "grid",
            placeItems: "center",
            borderRadius: 18,
            background: "#e8b65b",
            color: "#08090e",
            fontSize: 30,
            fontWeight: 800
          }}
        >
          S
        </div>
        <h1 style={{ margin: "0 0 14px", fontSize: 28 }}>Brave Browser required</h1>
        <p style={{ margin: 0, color: "#aab3c2", lineHeight: 1.6 }}>{message}</p>
      </section>
    </main>
  );
}
