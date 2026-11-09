export default function manifest() {
  return {
    id: "/",
    name: "Situla — Movies & Streaming",
    short_name: "Situla",
    description: "Discover movies and watch in a native-style web app.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#08090e",
    theme_color: "#08090e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ]
  };
}
