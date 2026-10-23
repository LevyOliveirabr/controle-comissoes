import type { Sql } from "postgres";
import { carregarDados } from "../../carga";
import { calcular, type Filtro, type Resultado } from "../../motor";
import { hojeDe, type Contexto } from "./contexto";

/** Carrega o banco (pela conexão/transação dada) e roda o motor de cálculo. */
export async function calcularBanco(db: Sql, ctx: Contexto, filtro: Filtro = {}): Promise<Resultado> {
  const dados = await carregarDados(db);
  return calcular(dados, { hoje: hojeDe(ctx), filtro });
}

/** Percentual humano (4 → 0.04) com validação. */
export function fracao(percentual: number | null | undefined): number | null {
  if (percentual == null) return null;
  return Math.round(percentual * 1e6) / 1e8;
}

export const MESES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** 'Dezembro/2026' a partir de '2026-12-xx'. */
export function rotuloMesLongo(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return `${MESES_LONGO[m - 1]}/${a}`;
}

/** 'AAAA-MM' ou 'AAAA-MM-DD' → primeiro dia do mês. */
export function primeiroDiaDoMes(valor: string): string {
  return `${valor.slice(0, 7)}-01`;
}

/** Formata em reais com exatamente duas casas (ex.: 'R$ 83.107,88'). */
export function brl(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
