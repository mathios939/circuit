import type { Metadata, Viewport } from "next";
import { COLORS } from "@/lib/ui/colors";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Circuit — Choisissez la distance. Circuit trouve la route.", template: "%s · Circuit" },
  description:
    "Boucles et itinéraires sur mesure pour le vélo de route, le gravel, le VTT, la course à pied, le trail, la randonnée et la marche. Choisissez la distance, comparez trois propositions, exportez en GPX.",
  applicationName: "Circuit",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Circuit" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: COLORS.brand,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
