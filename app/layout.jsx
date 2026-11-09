import "./globals.css";

export const metadata = {
  title: {
    default: "Situla — Discover & Watch",
    template: "%s | Situla"
  },
  description: "Discover movies and watch them in Situla.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
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
    // Browser extensions may inject attributes (for example bis_skin_checked
    // or __processed_*) before React hydrates. Limit suppression to the two
    // document roots; mismatches inside the Situla app remain visible.
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
