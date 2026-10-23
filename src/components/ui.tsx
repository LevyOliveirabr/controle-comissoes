import Link from "next/link";
import type { ReactNode } from "react";

export function Pagina({ titulo, descricao, acoes, children }: { titulo: string; descricao?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1680px] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
          {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function Card({ titulo, children, className = "", rodape }: { titulo?: ReactNode; children: ReactNode; className?: string; rodape?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {titulo && <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">{titulo}</header>}
      <div className="p-5">{children}</div>
      {rodape && <footer className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{rodape}</footer>}
    </section>
  );
}

export function Indicador({ rotulo, valor, detalhe, tom = "neutro" }: { rotulo: string; valor: string; detalhe?: ReactNode; tom?: "neutro" | "bom" | "atencao" | "ruim" | "info" }) {
  const cores = {
    neutro: "text-slate-900",
    bom: "text-emerald-700",
    atencao: "text-amber-700",
    ruim: "text-rose-700",
    info: "text-sky-700",
  }[tom];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${cores}`}>{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </div>
  );
}

type TomBadge = "cinza" | "verde" | "amarelo" | "vermelho" | "azul" | "roxo";
export function Badge({ children, tom = "cinza" }: { children: ReactNode; tom?: TomBadge }) {
  const cls = {
    cinza: "bg-slate-100 text-slate-700 ring-slate-200",
    verde: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amarelo: "bg-amber-50 text-amber-800 ring-amber-200",
    vermelho: "bg-rose-50 text-rose-700 ring-rose-200",
    azul: "bg-sky-50 text-sky-700 ring-sky-200",
    roxo: "bg-violet-50 text-violet-700 ring-violet-200",
  }[tom];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{children}</span>;
}

export function Alerta({ tom = "info", titulo, children }: { tom?: "info" | "atencao" | "erro" | "ok"; titulo?: string; children: ReactNode }) {
  const cls = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    atencao: "border-amber-200 bg-amber-50 text-amber-900",
    erro: "border-rose-200 bg-rose-50 text-rose-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tom];
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {titulo && <div className="font-semibold">{titulo}</div>}
      <div>{children}</div>
    </div>
  );
}

const botaoBase = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50";
const botaoVariantes = {
  primario: "bg-slate-900 text-white hover:bg-slate-700",
  secundario: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  perigo: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  link: "text-sky-700 hover:underline px-0 py-0",
};
type Variante = keyof typeof botaoVariantes;

export function Botao({ children, variante = "primario", type = "submit", ...rest }: { children: ReactNode; variante?: Variante } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`${botaoBase} ${botaoVariantes[variante]}`} {...rest}>
      {children}
    </button>
  );
}

export function BotaoLink({ href, children, variante = "primario" }: { href: string; children: ReactNode; variante?: Variante }) {
  return (
    <Link href={href} className={`${botaoBase} ${botaoVariantes[variante]}`}>
      {children}
    </Link>
  );
}

export function Tabela({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, num = false, className = "" }: { children?: ReactNode; num?: boolean; className?: string }) {
  return <th className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 ${num ? "text-right" : ""} ${className}`}>{children}</th>;
}

export function Td({ children, num = false, className = "", colSpan }: { children?: ReactNode; num?: boolean; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`border-b border-slate-100 px-2.5 py-2 align-top text-slate-700 ${num ? "whitespace-nowrap text-right tabular-nums" : ""} ${className}`}>{children}</td>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">{children}</div>;
}

// --- Formulários -----------------------------------------------------------

export function Campo({ rotulo, ajuda, children, className = "" }: { rotulo: string; ajuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-slate-700">{rotulo}</span>
      {children}
      {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </label>
  );
}

export const inputCls = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputCls} {...props} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={inputCls} {...props}>
      {children}
    </select>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputCls} min-h-20`} {...props} />;
}

export function Checkbox({ rotulo, ajuda, ...props }: { rotulo: string; ajuda?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" {...props} />
      <span>
        <span className="font-medium text-slate-700">{rotulo}</span>
        {ajuda && <span className="block text-xs text-slate-500">{ajuda}</span>}
      </span>
    </label>
  );
}

export function Grade({ children, colunas = 3 }: { children: ReactNode; colunas?: 2 | 3 | 4 }) {
  const cls = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" }[colunas];
  return <div className={`grid grid-cols-1 gap-4 ${cls}`}>{children}</div>;
}

/** Botão de exclusão com confirmação nativa do navegador (sem JS do cliente além do onsubmit inline). */
export function FormExcluir({ acao, id, rotulo = "Excluir", voltarPara }: { acao: (fd: FormData) => Promise<void>; id: string; rotulo?: string; voltarPara?: string }) {
  return (
    <form action={acao} className="inline">
      <input type="hidden" name="id" value={id} />
      {voltarPara && <input type="hidden" name="voltar" value={voltarPara} />}
      <ConfirmarBotao rotulo={rotulo} />
    </form>
  );
}

import { ConfirmarBotao } from "./confirmar-botao";

export function Descricao({ itens }: { itens: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {itens.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
