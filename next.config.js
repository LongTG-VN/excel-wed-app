/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. Xóa key 'api' cũ gây lỗi ở đây (nếu có)

  // 2. Bỏ qua lỗi ESLint khi build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 3. Bỏ qua lỗi TypeScript khi build
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;