import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Warrior Cup",
  description: "Golf Tournament Scoring",
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
