import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import 'galaxy-nodes/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Galaxy Nodes Next.js Example',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
