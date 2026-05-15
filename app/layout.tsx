import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lunch Split",
  description: "Track lunch tickets for #secure-lunch-internal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
