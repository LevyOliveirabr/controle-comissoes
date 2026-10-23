/**
 * Motor de cálculo de comissões — ponto de entrada.
 *
 * `calcular(dados, { hoje, filtro })` devolve tudo que a planilha calcula:
 * registros derivados (pedidos, NFs, apurações, NFS-e), funil, pipeline,
 * agenda, matriz de 12 meses, consolidado e faturamento.
 */
import { calcularAgenda } from "./agenda";
import { calcularRegistros } from "./calculo";
import { calcularConsolidado } from "./consolidado";
import { hojeISO } from "./datas";
import { calcularFaturamento } from "./faturamento";
import { calcularFunil } from "./funil";
import { calcularMatriz } from "./matriz";
import type { Dados, Filtro } from "./tipos";

export * from "./agenda";
export * from "./calculo";
export * from "./consolidado";
export * from "./datas";
export * from "./faturamento";
export * from "./funil";
export * from "./matriz";
export * from "./numeros";
export * from "./tipos";

export interface OpcoesCalculo {
  hoje?: string;
  filtro?: Filtro;
}

export function calcular(dados: Dados, opcoes: OpcoesCalculo = {}) {
  const hoje = opcoes.hoje ?? hojeISO();
  const filtro = opcoes.filtro ?? {};
  const registros = calcularRegistros(dados, hoje, filtro);
  const funil = calcularFunil(registros);
  const agenda = calcularAgenda(registros);
  const matriz = calcularMatriz(agenda, dados.representadas, hoje);
  const consolidado = calcularConsolidado(registros);
  const faturamento = calcularFaturamento(registros);
  return { ...registros, funil, agenda, matriz, consolidado, faturamento };
}

export type Resultado = ReturnType<typeof calcular>;
