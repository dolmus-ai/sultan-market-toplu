import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import ServisCalisani from "@/bilesenler/ServisCalisani";

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--yazi-tipi",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sultan Market · Kurye",
  description:
    "Sultan Market kurye uygulaması — abonelikler, sepetler ve toplu siparişler için harita odaklı teslimat ekranı.",
  applicationName: "Sultan Market Kurye",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/ikon/amblem.svg",
    apple: "/ikon/amblem.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sultan Kurye",
  },
};

export const viewport: Viewport = {
  themeColor: "#e30a17",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className={`${manrope.variable} antialiased`}>
        <ServisCalisani />
        {children}
      </body>
    </html>
  );
}
