import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cadastro',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  // The link carries a one-time credential: never leak it through the Referer header.
  referrer: 'no-referrer',
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
