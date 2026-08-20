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

  if (brand.faviconUrl) {
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-white-label]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.dataset.whiteLabel = 'true';
      document.head.appendChild(favicon);
    }
    favicon.href = brand.faviconUrl;
  }
}
