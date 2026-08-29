import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nordestrip", template: "%s | Nordestrip" },
  description: "Central compartilhada da viagem",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nordestrip" },
};

export const viewport: Viewport = {
  themeColor: "#123844",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
