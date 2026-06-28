import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Federal Food Services Contract Explorer",
  description: "Explore DLA and federal food services contract data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
