/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server Actions already allow the page's own origin, including
  // https://lobasters.vercel.app and Vercel preview deployments. Keep that
  // default CSRF protection instead of maintaining a stale allow-list.
  allowedDevOrigins: ['localhost', '127.0.0.1'],
};

export default nextConfig;
