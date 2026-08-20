import type { MetadataRoute } from 'next';
export const dynamic='force-dynamic';
export default function sitemap():MetadataRoute.Sitemap{const siteUrl=(process.env.SITE_URL||'http://localhost:3000').replace(/\/+$/,'');return[{url:siteUrl,lastModified:new Date(),changeFrequency:'weekly',priority:1}]}
