import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Circuit — Générateur de parcours sportifs",
  description:
    "Créez en quelques secondes des boucles et itinéraires pour le vélo, le VTT, le gravel, la course à pied, le trail et la randonnée, puis exportez-les en GPX.",
  applicationName: "Circuit",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b8577",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
