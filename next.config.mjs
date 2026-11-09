/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mongoose"],
  async headers() {
    return [
      {
        source: "/watch/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: 'fullscreen=(self "https://vidlink.pro"), autoplay=(self "https://vidlink.pro"), picture-in-picture=()'
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
