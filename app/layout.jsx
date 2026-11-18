import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import SiteFooter from "./components/site-footer.jsx";
import PresenceTracker from "./components/presence-tracker.jsx";
import RouteProgress from "./components/route-progress.jsx";
import PersistentSitulaApp from "./components/persistent-situla-app.jsx";
import { IFRAME_PLAYER_ORIGINS } from "../src/player-urls.js";


export const metadata = {
  metadataBase: new URL("https://situla.vercel.app"),
  title: {
    default: "Situla — Discover & Watch",
    template: "%s | Situla"
  },
  description: "Discover movies, TV series, and anime on Situla.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg"
  },
  formatDetection: { telephone: false }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090e"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {IFRAME_PLAYER_ORIGINS.map((origin) => (
          <link key={"iframe-dns-" + origin} rel="dns-prefetch" href={"//" + new URL(origin).hostname} />
        ))}
        {IFRAME_PLAYER_ORIGINS.map((origin) => (
          <link key={"iframe-preconnect-" + origin} rel="preconnect" href={origin} />
        ))}
      </head>
      <body suppressHydrationWarning>
        <RouteProgress />
        <PersistentSitulaApp>{children}</PersistentSitulaApp>
        <PresenceTracker />
        <SiteFooter />
      </body>
    </html>
  );
}
