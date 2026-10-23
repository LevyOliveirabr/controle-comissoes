"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GRUPOS: { titulo: string; itens: { href: string; rotulo: string }[] }[] = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/", rotulo: "Dashboard" },
      { href: "/agenda", rotulo: "Agenda de recebimentos" },
      { href: "/consolidado", rotulo: "Consolidado por cliente" },
      { href: "/faturamento", rotulo: "Faturamento" },
    ],
  },
  {
    titulo: "Operação",
    itens: [
      { href: "/pedidos", rotulo: "Pedidos" },
      { href: "/notas-fiscais", rotulo: "Notas fiscais de venda" },
      { href: "/apuracoes", rotulo: "Apurações de comissão" },
      { href: "/nfse", rotulo: "NFS-e de comissão" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/representadas", rotulo: "Representadas" },
      { href: "/clientes", rotulo: "Clientes" },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/parametros", rotulo: "Parâmetros" },
      { href: "/auditoria", rotulo: "Auditoria" },
    ],
  },
  {
    titulo: "Ajuda",
    itens: [{ href: "/ajuda", rotulo: "Entenda os números" }],
  },
];

export function Navegacao() {
  const pathname = usePathname();
  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-slate-200">
      <div className="px-5 py-5">
        <div className="text-base font-semibold text-white">Vice Versa</div>
        <div className="text-xs text-slate-400">Controle de comissões</div>
      </div>
      <nav className="flex-1 space-y-5 px-3 pb-6">
        {GRUPOS.map((g) => (
          <div key={g.titulo}>
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.titulo}</div>
            <ul className="space-y-0.5">
              {g.itens.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className={`block rounded-md px-2 py-1.5 text-sm transition ${ativo(i.href) ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white"}`}
                  >
                    {i.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
