export type ResolvedBranding = {
  tenantId?: string;
  tenant?: { id: string; name: string; slug: string; type: string };
  branding?: {
    productName?: string;
    companyName?: string;
    logoUrl?: string;
    compactLogoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    fontFamily?: string;
    themeMode?: 'SYSTEM' | 'LIGHT' | 'DARK';
    loginBackgroundUrl?: string;
    loginTitle?: string;
    loginSubtitle?: string;
    supportUrl?: string;
    supportEmail?: string;
    privacyUrl?: string;
    termsUrl?: string;
    senderName?: string;
  };
  features?: Record<string, { enabled: boolean; config?: unknown }>;
};

export const DEFAULT_LOGO_URL = '/brand/klyvero-logo.png';
export const DEFAULT_COMPACT_LOGO_URL = '/brand/klyvero-sidebar-logo.png';
export const DEFAULT_FAVICON_URL = '/brand/klyvero-icon.png';

export function isFeatureEnabled(
  resolved: ResolvedBranding | null | undefined,
  feature?: string,
) {
  if (!feature) return true;
  const setting = resolved?.features?.[feature];
  return setting ? setting.enabled !== false : true;
}

export function applyBranding(resolved: ResolvedBranding | null | undefined) {
  if (typeof document === 'undefined') return;
  const brand = resolved?.branding;
  if (!brand) return;

  // Klyvero is the platform fallback. White-label tenants override these URLs
  // whenever their own assets are configured.
  brand.logoUrl ||= DEFAULT_LOGO_URL;
  brand.compactLogoUrl ||= DEFAULT_COMPACT_LOGO_URL;
  brand.faviconUrl ||= DEFAULT_FAVICON_URL;

  const root = document.documentElement;
  root.style.setProperty('--p', brand.primaryColor || '#5865f2');
  root.style.setProperty('--s', brand.secondaryColor || '#111827');
  root.style.setProperty('--a', brand.accentColor || '#22c55e');
  root.style.setProperty('--bg', brand.backgroundColor || '#f5f7fb');
  if (brand.fontFamily) root.style.fontFamily = brand.fontFamily;
  else root.style.removeProperty('font-family');

  const mode = brand.themeMode || 'SYSTEM';
  root.dataset.theme = mode.toLowerCase();

  const productName = brand.productName || resolved?.tenant?.name || 'Klyvero';
  document.title = productName;

  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-white-label]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.dataset.whiteLabel = 'true';
    document.head.appendChild(favicon);
  }
  favicon.href = brand.faviconUrl;
}
