import type { Metadata } from 'next';
import { AppShell } from '../../components/app-shell';

export const metadata: Metadata = {
  title: 'Workspace',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
