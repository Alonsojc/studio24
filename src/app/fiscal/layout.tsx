import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Fiscal' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
