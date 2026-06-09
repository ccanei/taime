/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/pt',          destination: '/', permanent: true },
      { source: '/en',          destination: '/', permanent: true },
      { source: '/pt/:path*',   destination: '/', permanent: true },
      { source: '/en/:path*',   destination: '/', permanent: true },
    ]
  },
}

export default nextConfig
