import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Warrior Cup',
  description: 'Ryder Cup Style Golf Tournament',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
