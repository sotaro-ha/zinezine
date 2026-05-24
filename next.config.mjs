/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Supabase Storage の公開画像を next/image で最適化する場合に許可。
    // <SUPABASE_PROJECT>.supabase.co を環境に合わせて使う。
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
