/**
 * Funil de 5 estágios da carteira firme + pipeline de previsão (Dashboard).
 * Estágio 4 é calculado nota a nota (RN-16) e a divergência vira alerta;
 * o valor residual da planilha é mantido só para conferência.
 */
import { arredondar, somarPor } from "./numeros";
import type { Calculado, NfCalculada } from "./calculo";

export interface EstagioFunil {
  numero: 1 | 2 | 3 | 4 | 5;
  nome: string;
  base: number;
  comissao: number;
  pct_do_total: number;
  proximo_passo: string;
}

export interface Funil {
  estagios: EstagioFunil[];
  total_firme: number;
  total_base_firme: number;
  ja_recebida: number;
  a_receber_firme: number;
  em_previsao: { valor_pedidos: number; comissao: number; pct_da_firme: number };
  divergencia: { total: number; nfs: NfCalculada[] };
  /** Estágio 4 como a planilha calcula (resíduo Σ previsto − Σ apurado). */
  estagio4_residual: number;
  /** Total a receber firme usando o estágio 4 residual (card da planilha). */
  a_receber_firme_planilha: number;
}

export function calcularFunil(c: Calculado): Funil {
  const aps = c.apuracoes.filter((a) => a.no_filtro);
  const nfs = c.nfs.filter((n) => n.no_filtro);
  const pedidosFirmes = c.pedidos.filter((p) => p.ativo && p.situacao_comercial === "firme");
  const pedidosPrevisao = c.pedidos.filter((p) => p.ativo && p.situacao_comercial === "previsao");

  const porSituacao = (s: (typeof aps)[number]["situacao"]) => {
    const lista = aps.filter((a) => a.situacao === s);
    return { base: somarPor(lista, (a) => a.base), comissao: somarPor(lista, (a) => a.valor_apurado) };
  };
  const e1 = porSituacao("Recebida");
  const e2 = porSituacao("Aguardando pagamento");
  const e3 = porSituacao("NF de comissao nao emitida");

  // Estágio 4 nota a nota: só o que ainda falta apurar em cada NF.
  const pendentes = nfs.filter((n) => n.pendente_apuracao > 0);
  const e4 = {
    base: somarPor(pendentes, (n) => (n.comissao_prevista ? n.base * (n.pendente_apuracao / n.comissao_prevista) : 0)),
    comissao: somarPor(pendentes, (n) => n.pendente_apuracao),
  };
  const e5 = {
    base: somarPor(pedidosFirmes, (p) => p.saldo_a_faturar),
    comissao: somarPor(pedidosFirmes, (p) => p.comissao_saldo),
  };

  const total = e1.comissao + e2.comissao + e3.comissao + e4.comissao + e5.comissao;
  const pct = (v: number) => (total === 0 ? 0 : v / total);

  const estagios: EstagioFunil[] = [
    { numero: 1, nome: "Já recebida em conta", ...e1, pct_do_total: pct(e1.comissao), proximo_passo: "Nada — já entrou." },
    { numero: 2, nome: "NF de representação emitida", ...e2, pct_do_total: pct(e2.comissao), proximo_passo: "Aguardar o crédito no prazo da representada." },
    { numero: 3, nome: "Autorizada, sem NF emitida", ...e3, pct_do_total: pct(e3.comissao), proximo_passo: "Emitir a NFS-e e lançá-la em NFS-e de comissão." },
    { numero: 4, nome: "Faturada, sem apuração", ...e4, pct_do_total: pct(e4.comissao), proximo_passo: "Aguardar o relatório de comissão da representada." },
    { numero: 5, nome: "Pedido firme a faturar", ...e5, pct_do_total: pct(e5.comissao), proximo_passo: "O cliente precisa liberar o faturamento." },
  ];

  const divergentes = nfs.filter((n) => n.divergencia > 0);
  const residual = Math.max(
    0,
    arredondar(somarPor(nfs, (n) => n.comissao_prevista) - somarPor(aps, (a) => a.valor_apurado)),
  );
  const emPrevisao = somarPor(pedidosPrevisao, (p) => p.comissao_saldo);

  return {
    estagios,
    total_firme: total,
    total_base_firme: e1.base + e2.base + e3.base + e4.base + e5.base,
    ja_recebida: e1.comissao,
    a_receber_firme: total - e1.comissao,
    em_previsao: {
      valor_pedidos: somarPor(pedidosPrevisao, (p) => p.saldo_a_faturar),
      comissao: emPrevisao,
      pct_da_firme: total === 0 ? 0 : emPrevisao / total,
    },
    divergencia: { total: somarPor(divergentes, (n) => n.divergencia), nfs: divergentes },
    estagio4_residual: residual,
    a_receber_firme_planilha: e2.comissao + e3.comissao + residual + e5.comissao,
  };
}
