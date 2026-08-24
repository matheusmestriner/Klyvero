'use client';

import { useEffect } from 'react';

export function SidebarRuntimeFix() {
  useEffect(() => {
    function handleMenuClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const button = target?.closest('.mobile-menu-btn');
      if (!button) return;
      if (!window.matchMedia('(min-width: 901px)').matches) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      document.querySelector<HTMLButtonElement>('.desktop-side .side-collapse')?.click();
    }

    document.addEventListener('click', handleMenuClick, true);
    return () => document.removeEventListener('click', handleMenuClick, true);
  }, []);

  return null;
}
