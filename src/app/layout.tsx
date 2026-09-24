import type { Metadata } from "next";
import "./globals.css";
import "./readability.css";
export const metadata: Metadata = {
  title: "IMMO 360 — Une adresse. Toutes les perspectives.",
  description:
    "Explorez votre future adresse à Paris : cadre de vie, terrasses, espaces verts, DPE, transactions et checklist de visite. Des sources publiques, en toute transparence.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
