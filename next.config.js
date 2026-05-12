/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tăng giới hạn body size cho upload file lớn
  api: {
    bodyParser: false,
  },
};

module.exports = nextConfig;
