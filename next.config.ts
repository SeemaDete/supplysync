import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs and nodemailer are Node-only; keep them out of the client bundle
  serverExternalPackages: ["exceljs", "nodemailer", "bcryptjs"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  eslint: { ignoreDuringBuilds: true },
  // Type errors are reported by `npm run typecheck` (and the GitHub Action) instead of blocking a deploy.
  // Set this to false once your CI is green if you prefer strict builds.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
