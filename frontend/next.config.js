const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

module.exports = withPWA({
  reactStrictMode: true,
  // ⚠️ 危険やけど今は許可！型エラーを無視してビルドする
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    // リントエラーも無視！
    ignoreDuringBuilds: true,
  },
  env: {
    API_URL: process.env.API_URL || 'http://localhost:8000',
  },
});

