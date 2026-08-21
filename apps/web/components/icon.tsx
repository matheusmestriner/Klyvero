import type { SVGProps } from 'react';

export type IconName =
  | 'dashboard' | 'prospecting' | 'leads' | 'companies' | 'contacts' | 'crm'
  | 'campaigns' | 'email' | 'whatsapp' | 'inbox' | 'ai' | 'calendar' | 'analytics'
  | 'integrations' | 'webhooks' | 'branding' | 'tenants' | 'team' | 'api' | 'billing'
  | 'audit' | 'search' | 'bell' | 'sun' | 'moon' | 'menu' | 'chevron-left'
  | 'chevron-right' | 'x' | 'plus' | 'arrow-up-right' | 'users' | 'target'
  | 'message' | 'calendar-check' | 'revenue' | 'sparkles' | 'filter' | 'more'
  | 'send' | 'check' | 'clock' | 'building' | 'mail' | 'phone' | 'palette'
  | 'shield' | 'activity' | 'refresh';

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 18, ...props }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {shape(name)}
    </svg>
  );
}

function shape(name: IconName) {
  switch (name) {
    case 'dashboard': return <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>;
    case 'prospecting': case 'target': return <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M14.5 9.5 20 4"/><path d="M16 4h4v4"/></>;
    case 'leads': case 'users': return <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>;
    case 'companies': case 'building': return <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h4M8 11h4M8 15h4M9 21v-2h2v2"/></>;
    case 'contacts': return <><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="3"/><path d="M7.5 18c1.1-2.1 2.6-3 4.5-3s3.4.9 4.5 3"/></>;
    case 'crm': return <><path d="M4 5h16M4 12h10M4 19h6"/><circle cx="18" cy="12" r="3"/><circle cx="14" cy="19" r="3"/></>;
    case 'campaigns': return <><path d="m3 11 18-5-5 18-4-8-9-5Z"/><path d="m12 16 4-4"/></>;
    case 'email': case 'mail': return <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>;
    case 'whatsapp': case 'phone': return <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.6-.8L3 21l1.8-5.2A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 8.5c.6 3 2.1 4.5 5 5"/></>;
    case 'inbox': case 'message': return <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></>;
    case 'ai': case 'sparkles': return <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z"/><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z"/><path d="m5 14 .7 1.8 1.8.7-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14Z"/></>;
    case 'calendar': case 'calendar-check': return <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8 15 2 2 4-4"/></>;
    case 'analytics': return <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>;
    case 'integrations': return <><circle cx="12" cy="12" r="3"/><path d="M19 12h3M2 12h3M12 2v3M12 19v3M17 7l2-2M5 19l2-2M17 17l2 2M5 5l2 2"/></>;
    case 'webhooks': return <><circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><circle cx="12" cy="17" r="3"/><path d="M9.5 9.5 11 14M14.5 9.5 13 14"/></>;
    case 'branding': case 'palette': return <><path d="M12 3a9 9 0 0 0 0 18h1.3a2 2 0 0 0 1.9-2.6l-.2-.7a2 2 0 0 1 1.9-2.7H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="10" cy="6.8" r=".7"/><circle cx="14" cy="6.8" r=".7"/><circle cx="16.5" cy="10" r=".7"/></>;
    case 'tenants': return <><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 10h6M9 14h6M9 18h6"/></>;
    case 'team': return <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20a6 6 0 0 1 12 0M14 16a5 5 0 0 1 7 4"/></>;
    case 'api': return <><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></>;
    case 'billing': case 'revenue': return <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></>;
    case 'audit': case 'clock': return <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>;
    case 'search': return <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>;
    case 'bell': return <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>;
    case 'sun': return <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></>;
    case 'moon': return <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>;
    case 'menu': return <path d="M4 7h16M4 12h16M4 17h16"/>;
    case 'chevron-left': return <path d="m15 18-6-6 6-6"/>;
    case 'chevron-right': return <path d="m9 18 6-6-6-6"/>;
    case 'x': return <path d="M18 6 6 18M6 6l12 12"/>;
    case 'plus': return <path d="M12 5v14M5 12h14"/>;
    case 'arrow-up-right': return <path d="M7 17 17 7M7 7h10v10"/>;
    case 'filter': return <path d="M4 6h16M7 12h10M10 18h4"/>;
    case 'more': return <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>;
    case 'send': return <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>;
    case 'check': return <path d="m5 12 4 4L19 6"/>;
    case 'shield': return <><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>;
    case 'activity': return <><path d="M3 12h4l2-6 4 12 2-6h6"/></>;
    case 'refresh': return <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/></>;
  }
}
