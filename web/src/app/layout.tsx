import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Federal Food Contracts Explorer",
  description: "Explore federal food contract opportunities and spending data",
  icons: {
    icon: [
      { url: `${basePath}/apple-favicon-v2-32.png`, sizes: "32x32", type: "image/png" },
      { url: `${basePath}/apple-favicon-v2-16.png`, sizes: "16x16", type: "image/png" },
      { url: `${basePath}/apple-favicon-v2.ico`, type: "image/x-icon" },
    ],
    apple: [{ url: `${basePath}/apple-touch-icon.png`, sizes: "180x180" }],
  },
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
