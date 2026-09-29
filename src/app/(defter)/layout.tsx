import type { Metadata, Viewport } from "next";
import { Great_Vibes } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/defter/components/AuthProvider";
import { GecisKarsilama } from "@/bilesenler/ModGecisi";

// Besmele şeridi için el yazısı (kaligrafi) yazı tipi
const elYazisi = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-el-yazisi",
  fallback: ["cursive"],
});

export const metadata: Metadata = {
  title: "Sultan Market — Bakkal Defteri",
  description: "Cari hesap, tahsilat ve ödeme takibi — kağıt defterden daha hızlı.",
  manifest: "/defter.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bakkal Defteri" },
};

export const viewport: Viewport = {
  themeColor: "#15803d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: mod geçişi perdesi <html>e data-gecis ekliyor.
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${elYazisi.variable} min-h-dvh bg-stone-100 text-stone-900 antialiased`}
      >
        <GecisKarsilama mod="defter" />
        {/* Uygulamanın en üstünde, akışı bozmayan ince besmele şeridi */}
        <div className="besmele-serit flex items-center justify-center bg-stone-100">
          <span
            className="besmele-yazi text-green-800/70"
            aria-label="Bismillâhirrahmânirrahîm"
          >
            Bismillâhirrahmânirrahîm
          </span>
        </div>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
