import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gov Food Contracts Explorer",
  description: "Explore federal food contract opportunities and spending data",
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
