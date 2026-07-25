/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // playwright-core + @sparticuz/chromium (AFC Home Club automation, lib/afc-browser.ts)
  // ship native binaries — exclude them from webpack bundling so Next traces
  // them as external packages instead of trying to tree-shake/bundle them.
  experimental: {
    serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  },
  images: {
    remotePatterns: [
      // Supabase Storage public/signed URLs (avatars, documents)
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  webpack: (config) => {
    // Escape hatch for very low-memory local machines: NO_MINIFY=1 skips the
    // memory-heavy minification pass (used only for local build verification).
    // Inert in normal/CI builds where the env var is unset.
    if (process.env.NO_MINIFY) {
      config.optimization.minimize = false;
    }
    return config;
  },
};

module.exports = nextConfig;
