'use client';

import { useEffect } from 'react';

const LOGO_SRC = '/brand/klyvero-sidebar-logo.png';

export function SidebarRuntimeFix() {
  useEffect(() => {
    function ensureLogo() {
      document.querySelectorAll<HTMLElement>('.side-brand').forEach((brand) => {
        if (brand.querySelector(':scope > img.klyvero-sidebar-logo')) return;
        const image = document.createElement('img');
        image.src = LOGO_SRC;
        image.alt = 'Klyvero';
        image.width = 34;
        image.height = 34;
        image.decoding = 'async';
        image.className = 'klyvero-sidebar-logo';
        brand.prepend(image);
      });
    }

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

    ensureLogo();
    const observer = new MutationObserver(ensureLogo);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', handleMenuClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleMenuClick, true);
    };
  }, []);

  return null;
}
