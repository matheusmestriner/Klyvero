import type { Metadata, Viewport } from 'next';
import './globals.css';
import './responsive.css';
import './theme-system.css';
import './clean-ui.css';
import './brand-header.css';
import './sidebar-compact.css';
import './sidebar-logo.css';
import './sidebar-runtime.css';
import './login-theme.css';
import './auth-runtime.css';
import './route-state.css';
import './team-management.css';
import { SiteGovernance } from '../components/site-governance';
import { SidebarRuntimeFix } from '../components/sidebar-runtime-fix';
import { AuthRuntimeGuard } from '../components/auth-runtime-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const siteName = process.env.SITE_NAME || process.env.PLATFORM_DEFAULT_NAME || 'Klyvero';
  const siteDescription = process.env.SITE_DESCRIPTION || 'AI Sales OS para prospecção, CRM, campanhas, WhatsApp, IA e automação comercial.';
  const siteUrl = safeUrl(process.env.SITE_URL || 'http://localhost:3000');
  const keywords = (process.env.SITE_KEYWORDS || 'prospecção B2B, CRM, automação de vendas, cold email, WhatsApp, inteligência artificial, SaaS')
    .split(',').map((item) => item.trim()).filter(Boolean);
  return {metadataBase:siteUrl,title:{default:siteName,template:`%s | ${siteName}`},description:siteDescription,applicationName:siteName,keywords,category:'business',creator:siteName,publisher:siteName,alternates:{canonical:'/'},openGraph:{type:'website',locale:'pt_BR',url:'/',siteName,title:siteName,description:siteDescription},twitter:{card:'summary_large_image',title:siteName,description:siteDescription},robots:{index:true,follow:true,googleBot:{index:true,follow:true,'max-image-preview':'large','max-snippet':-1,'max-video-preview':-1}},verification:process.env.GOOGLE_SITE_VERIFICATION?{google:process.env.GOOGLE_SITE_VERIFICATION}:undefined};
}
export const viewport: Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:[{media:'(prefers-color-scheme: light)',color:'#ffffff'},{media:'(prefers-color-scheme: dark)',color:'#0a0f16'}]};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR" suppressHydrationWarning><body>{children}<AuthRuntimeGuard/><SidebarRuntimeFix/><SiteGovernance analyticsId={process.env.GOOGLE_ANALYTICS_ID||''} privacyUrl={process.env.PRIVACY_URL||''} cookiePolicyUrl={process.env.COOKIE_POLICY_URL||process.env.PRIVACY_URL||''} supportWhatsapp={process.env.SUPPORT_WHATSAPP_PHONE||''} supportMessage={process.env.SUPPORT_WHATSAPP_MESSAGE||'Olá! Preciso de ajuda com a plataforma.'}/></body></html>}
function safeUrl(value:string){try{return new URL(value)}catch{return new URL('http://localhost:3000')}}
