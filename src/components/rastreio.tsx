import Link from "next/link";
import type { ReactNode } from "react";
import { explicacao } from "@/lib/explicacoes";
import type { Filtro } from "@/lib/motor";

/** URL da página Composição para uma chave, preservando o filtro global. */
export function hrefComposicao(chave: string, filtro: Filtro = {}, voltar?: string) {
  const q = new URLSearchParams({ o: chave });
  if (filtro.representada_id) q.set("rep", filtro.representada_id);
  if (filtro.cliente_id) q.set("cli", filtro.cliente_id);
  if (voltar) q.set("v", voltar);
  return `/composicao?${q.toString()}`;
}

/**
 * Ícone "?" com explicação curta. Só CSS: abre ao passar o mouse ou ao
 * focar (Tab / toque), sem JavaScript no navegador.
 */
export function Dica({ chave, texto, alinhar = "esquerda" }: { chave?: string; texto?: ReactNode; alinhar?: "esquerda" | "direita" }) {
  const e = chave ? explicacao(chave) : null;
  const conteudo = texto ?? e?.curta;
  if (!conteudo) return null;
  const pos = alinhar === "direita" ? "right-0" : "left-0";
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`Como é calculado: ${e?.titulo ?? ""}`.trim()}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold leading-none text-slate-500 hover:border-sky-500 hover:text-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`invisible absolute top-full z-30 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case tracking-normal text-slate-700 shadow-lg group-hover:visible group-focus-within:visible ${pos}`}
      >
        {e?.titulo && <span className="mb-1 block font-semibold text-slate-900">{e.titulo}</span>}
        {conteudo}
      </span>
    </span>
  );
}

/**
 * Número clicável: abre a Composição (lista dos registros que somam o valor).
 * `chave` identifica o número; o filtro global é mantido na URL.
 */
export function NumeroLink({ chave, filtro, voltar, children, className = "", title }: { chave: string; filtro?: Filtro; voltar?: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <Link
      href={hrefComposicao(chave, filtro, voltar)}
      title={title ?? "Ver de onde vem este valor"}
      className={`rounded-sm tabular-nums underline decoration-slate-300 decoration-dotted underline-offset-4 hover:bg-sky-50 hover:text-sky-800 hover:decoration-sky-500 ${className}`}
    >
      {children}
    </Link>
  );
}

export interface PassoCalculo {
  rotulo: string;
  /** Como chega no valor (ex.: "R$ 10.000,00 × 5%"). */
  conta?: ReactNode;
  valor: ReactNode;
  /** Origem ou observação (ex.: "% padrão da representada"). */
  nota?: ReactNode;
  destaque?: boolean;
}

/** Cadeia "Como este valor foi calculado": passos em ordem, com conta e origem. */
export function CadeiaCalculo({ passos, conclusao }: { passos: PassoCalculo[]; conclusao?: ReactNode }) {
  return (
    <div>
      <ol className="divide-y divide-slate-100">
        {passos.map((p, i) => (
          <li key={i} className={`grid grid-cols-[1.5rem_1fr_auto] items-start gap-3 py-2 text-sm ${p.destaque ? "font-semibold text-slate-900" : "text-slate-700"}`}>
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
            <span>
              <span>{p.rotulo}</span>
              {p.conta && <span className="ml-2 text-xs font-normal text-slate-500">{p.conta}</span>}
              {p.nota && <span className="block text-xs font-normal text-slate-500">{p.nota}</span>}
            </span>
            <span className="whitespace-nowrap text-right tabular-nums">{p.valor}</span>
          </li>
        ))}
      </ol>
      {conclusao && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{conclusao}</div>}
    </div>
  );
}
