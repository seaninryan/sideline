import type { Metadata } from "next";
import { Oswald, Bebas_Neue } from "next/font/google";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-oswald" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas" });

export const metadata: Metadata = {
  metadataBase: new URL("https://herewego.ie"),
  title: "Here We Go",
  icons: { icon: "/icon-180.png", apple: "/icon-touch-180.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${bebas.variable}`}>
      <body>{children}</body>
    </html>
  );
}
