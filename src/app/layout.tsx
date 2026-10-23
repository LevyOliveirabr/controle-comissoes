import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Navegacao } from "@/components/navegacao";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle de Comissões — Vice Versa",
  description: "Controle de pedidos, notas fiscais e comissões de representação comercial",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full bg-slate-50 text-slate-900">
        <Navegacao />
        <main className="min-w-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
