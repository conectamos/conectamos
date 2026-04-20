import type { Metadata } from "next";
import FinancialAccessReset from "./_components/financial-access-reset";
import "./globals.css";

export const metadata: Metadata = {
  title: "CONECTAMOS",
  description: "Sistema de inventario, ventas y control financiero",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <FinancialAccessReset />
        {children}
      </body>
    </html>
  );
}
