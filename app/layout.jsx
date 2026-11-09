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
    apple: "/icon.svg"
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
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
