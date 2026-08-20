import type { MetadataRoute } from 'next';
export const dynamic='force-dynamic';
export default function robots():MetadataRoute.Robots{const siteUrl=(process.env.SITE_URL||'http://localhost:3000').replace(/\/+$/,'');return{rules:[{userAgent:'*',allow:['/','/robots.txt','/sitemap.xml','/llms.txt'],disallow:['/app/','/setup','/login','/api/','/tracking/','/unsubscribe/']}],sitemap:`${siteUrl}/sitemap.xml`,host:siteUrl}}
