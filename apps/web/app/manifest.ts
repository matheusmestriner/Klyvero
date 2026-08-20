import type { MetadataRoute } from 'next';
export const dynamic='force-dynamic';
export default function manifest():MetadataRoute.Manifest{const name=process.env.SITE_NAME||process.env.PLATFORM_DEFAULT_NAME||'Klyvero';return{name,short_name:name.slice(0,24),description:process.env.SITE_DESCRIPTION||'AI Sales OS',start_url:'/login',display:'standalone',background_color:'#f5f7fb',theme_color:'#5865f2',lang:'pt-BR'}}
