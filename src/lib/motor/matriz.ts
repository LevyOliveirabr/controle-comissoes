/**
 * Recebimentos previstos — próximos 12 meses, por representada (sem limite
 * de colunas), com linhas Vencido, Depois de 12 meses e Sem data.
 */
import { fimMes, inicioMes, somarMeses } from "./datas";
import type { ItemAgenda } from "./agenda";
import type { Representada } from "./tipos";

export interface LinhaMatriz {
  chave: string;
  rotulo: string;
  mes: string | null;
  tipo: "vencido" | "mes" | "depois" | "sem_data";
  por_representada: Record<string, number>;
  total_firme: number;
  em_previsao: number;
  acumulado_firme: number;
}

export interface Matriz {
  mes_base: string;
  representadas: Pick<Representada, "id" | "nome">[];
  linhas: LinhaMatriz[];
  totais: { por_representada: Record<string, number>; total_firme: number; em_previsao: number };
}

export interface LimitesMatriz {
  mes_base: string;
  meses: string[];
  ultimo_dia: string;
}

/** Mês base, os 12 meses da matriz e o último dia coberto por ela. */
export function limitesMatriz(hoje: string): LimitesMatriz {
  const mes_base = inicioMes(hoje);
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mes_base, i));
  return { mes_base, meses, ultimo_dia: fimMes(meses[11]) };
}

/**
 * Em qual linha da matriz um item da agenda cai: "vencido", "depois",
 * "sem_data" ou o primeiro dia do mês ('YYYY-MM-01'). Única regra usada
 * pela matriz e pela página Composição, para que as duas sempre batam.
 */
export function linhaDoItem(item: Pick<ItemAgenda, "data_esperada" | "mes">, limites: LimitesMatriz): string {
  if (!item.data_esperada) return "sem_data";
  if (item.data_esperada < limites.mes_base) return "vencido";
  if (item.data_esperada > limites.ultimo_dia) return "depois";
  return item.mes ?? inicioMes(item.data_esperada);
}

export function calcularMatriz(agenda: ItemAgenda[], representadas: Representada[], hoje: string): Matriz {
  const limites = limitesMatriz(hoje);
  const { mes_base: mesBase, meses } = limites;

  // Colunas: representadas ativas + qualquer outra que tenha valor na agenda.
  const comValor = new Set(agenda.map((a) => a.representada_id));
  const colunas = representadas.filter((r) => r.ativa || comValor.has(r.id)).map((r) => ({ id: r.id, nome: r.nome }));

  const novaLinha = (chave: string, rotulo: string, mes: string | null, tipo: LinhaMatriz["tipo"]): LinhaMatriz => ({
    chave,
    rotulo,
    mes,
    tipo,
    por_representada: Object.fromEntries(colunas.map((c) => [c.id, 0])),
    total_firme: 0,
    em_previsao: 0,
    acumulado_firme: 0,
  });

  const linhas: LinhaMatriz[] = [
    novaLinha("vencido", "Vencido / já deveria ter caído", null, "vencido"),
    ...meses.map((m) => novaLinha(m, m, m, "mes")),
    novaLinha("depois", "Depois desses 12 meses", null, "depois"),
    novaLinha("sem_data", "Sem data definida", null, "sem_data"),
  ];
  const porChave = new Map(linhas.map((l) => [l.chave, l]));

  for (const item of agenda) {
    const linha = porChave.get(linhaDoItem(item, limites))!;

    if (item.confianca === "Firme") {
      linha.total_firme += item.valor;
      if (item.representada_id in linha.por_representada) linha.por_representada[item.representada_id] += item.valor;
    } else {
      linha.em_previsao += item.valor;
    }
  }

  let acumulado = 0;
  const totais = { por_representada: Object.fromEntries(colunas.map((c) => [c.id, 0])), total_firme: 0, em_previsao: 0 };
  for (const linha of linhas) {
    acumulado += linha.total_firme;
    linha.acumulado_firme = acumulado;
    totais.total_firme += linha.total_firme;
    totais.em_previsao += linha.em_previsao;
    for (const c of colunas) totais.por_representada[c.id] += linha.por_representada[c.id];
  }

  return { mes_base: mesBase, representadas: colunas, linhas, totais };
}
