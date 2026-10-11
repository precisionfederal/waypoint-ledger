/** @type {import('next').NextConfig} */
// NEXT_DIST_DIR lets several local `next dev` servers run side by side (one .next per worker).
// cssChunking 'strict' (Next 15.5): each route links only the CSS its own modules import, in import
// order. The default loose mode merged the route-only stylesheets (/adopt, trust kit, devpages) into a
// chunk the home page linked (60,893 bytes, PAGES2 2026-09-30).
const nextConfig = {
  reactStrictMode: true,
  experimental: { cssChunking: 'strict' },
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};
export default nextConfig;
