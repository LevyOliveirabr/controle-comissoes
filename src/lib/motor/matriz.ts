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

export function calcularMatriz(agenda: ItemAgenda[], representadas: Representada[], hoje: string): Matriz {
  const mesBase = inicioMes(hoje);
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mesBase, i));
  const ultimoDia = fimMes(meses[11]);

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
  const porMes = new Map(linhas.filter((l) => l.tipo === "mes").map((l) => [l.mes!, l]));

  for (const item of agenda) {
    let linha: LinhaMatriz;
    if (!item.data_esperada) linha = linhas[linhas.length - 1];
    else if (item.data_esperada < mesBase) linha = linhas[0];
    else if (item.data_esperada > ultimoDia) linha = linhas[linhas.length - 2];
    else linha = porMes.get(item.mes!)!;

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
