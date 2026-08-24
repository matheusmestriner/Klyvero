'use client';

import { useEffect } from 'react';

const KLYVERO_LOGO = '/brand/klyvero-sidebar-logo.png';

export function SidebarRuntimeFix() {
  useEffect(() => {
    function ensureOfficialLogo() {
      document.querySelectorAll<HTMLElement>('.side-brand').forEach((brand) => {
        const wordmark = brand.querySelector<HTMLElement>(':scope > span');
        const productName = wordmark?.textContent?.trim() || 'Klyvero';
        if (productName.toLowerCase() !== 'klyvero') return;

        let image = brand.querySelector<HTMLImageElement>(':scope > img.brand-logo.compact');
        if (!image) {
          image = document.createElement('img');
          image.className = 'brand-logo compact';
          image.alt = 'Klyvero';
          brand.prepend(image);
        }

        if (!image.getAttribute('src')?.endsWith(KLYVERO_LOGO)) {
          image.src = KLYVERO_LOGO;
        }
        image.width = 34;
        image.height = 34;
        image.decoding = 'async';
        image.loading = 'eager';
        image.style.filter = 'none';
        image.style.opacity = '1';
        image.style.visibility = 'visible';

        image.onerror = () => {
          image!.onerror = null;
          image!.src = KLYVERO_LOGO;
        };
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

    ensureOfficialLogo();
    const observer = new MutationObserver(ensureOfficialLogo);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('click', handleMenuClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleMenuClick, true);
    };
  }, []);

  return null;
}
