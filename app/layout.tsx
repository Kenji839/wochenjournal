import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wochenjournal-Generator",
  description: "Arbeitsjournal-Generator – Appbakery / SBB, Lehrjahr 3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
