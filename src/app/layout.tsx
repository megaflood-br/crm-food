import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "Brasa", template: "%s · Brasa" },
  description: "CRM de delivery no WhatsApp: cardápio, pedidos, caixa, fidelidade e Evolution API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${outfit.variable} ${fraunces.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
