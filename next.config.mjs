/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@resvg/resvg-js"],
    outputFileTracingIncludes: {
      "/m/[id]/opengraph-image": ["./assets/**"],
    },
  },
};
export default nextConfig;
