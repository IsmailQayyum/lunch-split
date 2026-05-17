import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SessionBar } from "@/components/SessionBar";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  style: ["normal", "italic"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lunch Split — printed receipts for office lunches",
  description: "Split lunch bills like you split a receipt. No accounts, no fuss.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${mono.variable}`}>
      <body className="antialiased min-h-screen">
        <SessionBar />
        {children}
      </body>
    </html>
  );
}
