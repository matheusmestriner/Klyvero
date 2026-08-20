'use client';

import { useEffect } from 'react';

const LOGO_SRC = '/brand/klyvero-icon.png';
const WORDMARK = 'Klyvero';

export function SidebarRuntimeFix() {
  useEffect(() => {
    function ensureLogo() {
      document.querySelectorAll<HTMLElement>('.side-brand').forEach((brand) => {
        let image = brand.querySelector<HTMLImageElement>(':scope > img.klyvero-sidebar-logo');
        if (!image) {
          image = document.createElement('img');
          image.src = LOGO_SRC;
          image.alt = '';
          image.width = 34;
          image.height = 34;
          image.decoding = 'async';
          image.className = 'klyvero-sidebar-logo';
          brand.prepend(image);
        }

        let wordmark = brand.querySelector<HTMLElement>(':scope > .klyvero-sidebar-wordmark');
        if (!wordmark) {
          const existingSpan = Array.from(brand.children).find(
            (child) => child instanceof HTMLElement && child.tagName === 'SPAN',
          ) as HTMLElement | undefined;

          wordmark = existingSpan ?? document.createElement('span');
          wordmark.classList.add('klyvero-sidebar-wordmark');
          if (!existingSpan) brand.append(wordmark);
        }

        if (wordmark.textContent !== WORDMARK) wordmark.textContent = WORDMARK;
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
