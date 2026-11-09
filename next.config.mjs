/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["mongoose"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), picture-in-picture=()"
          }
        ]
      },
      {
        source: "/watch/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: 'fullscreen=(self "https://vidlink.pro"), autoplay=(self "https://vidlink.pro"), picture-in-picture=()'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
