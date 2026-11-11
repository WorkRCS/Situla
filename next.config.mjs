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
            value: "camera=(), microphone=(), geolocation=()"
          }
        ]
      },
      {
        source: "/watch/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: 'fullscreen=(self "https://vidbolt.pro"), autoplay=(self "https://vidbolt.pro"), picture-in-picture=(self "https://vidbolt.pro")'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
