import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sultan Market — Bakkal Defteri",
    short_name: "Bakkal Defteri",
    description: "Cari hesap, tahsilat ve ödeme takibi",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f4",
    theme_color: "#15803d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
