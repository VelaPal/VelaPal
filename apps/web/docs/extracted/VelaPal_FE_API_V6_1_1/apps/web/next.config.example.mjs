// Merge rewrites() into your existing next.config.mjs instead of replacing it.
// The browser calls only /api/v1/*; change one destination when switching BE.
const target = process.env.VELAPAL_API_TARGET || 'http://localhost:4010';
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` }];
  },
};
export default nextConfig;
