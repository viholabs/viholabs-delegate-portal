import type { Metadata } from "next";
import "./globals.css";
import AuthInterceptorProvider from "@/components/portal/AuthInterceptorProvider";

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
      <body>
        <AuthInterceptorProvider>{children}</AuthInterceptorProvider>
      </body>
    </html>
  );
}