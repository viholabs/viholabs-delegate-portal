import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIHOLABS Portal",
  description: "Portal Operativo VIHOLABS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}