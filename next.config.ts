import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    trailingSlash: false,
    eslint: {
        // Allow builds to pass even when eslint reports warnings.
        ignoreDuringBuilds: true,
    },
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/**' },
            { protocol: 'https', hostname: 'api.navumi.com', pathname: '/**' },
            { protocol: 'https', hostname: 'www.navumi.com', pathname: '/**' },
            { protocol: 'https', hostname: 'navumi.com', pathname: '/**' },
        ],
        formats: ['image/avif', 'image/webp'],
        minimumCacheTTL: 60 * 60 * 24, // кэш оптимизатора на 1 сутки
        // Временная страховка: возможность отключить оптимизацию картинок
        // на превью/разработке или при исчерпании квоты Vercel.
        // Установите переменную окружения NEXT_PUBLIC_IMG_UNOPT=1
        // (в среде Preview/Development), чтобы Next отдавал изображения напрямую
        // без через оптимизатор.
        unoptimized: process.env.NEXT_PUBLIC_IMG_UNOPT === '1',
    },
};


export default nextConfig;
//
