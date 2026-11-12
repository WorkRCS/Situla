import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import SiteFooter from "./components/site-footer.jsx";
import PresenceTracker from "./components/presence-tracker.jsx";


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
    <html lang="en" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <PresenceTracker />
        <SiteFooter />
      </body>
    </html>
  );
}
