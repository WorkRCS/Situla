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
            value: 'fullscreen=(self "https://vidlink.pro"), autoplay=(self "https://vidlink.pro"), picture-in-picture=(self "https://vidlink.pro")'
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
