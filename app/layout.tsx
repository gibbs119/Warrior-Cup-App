import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Warrior Cup - Golf Tournament Scoring",
  description: "Whitesboro Warriors Golf Tournament Scoring App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts - Bebas Neue and Inter */}
        <link 
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700;800;900&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
