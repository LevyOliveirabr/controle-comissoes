import { ROTULO_STATUS_NF, type SituacaoApuracao, type StatusComissaoNf, type StatusNfse } from "@/lib/motor";
import { Badge } from "./ui";

export function BadgeFaturamento({ situacao, comercial }: { situacao: string; comercial: string }) {
  if (comercial === "previsao") return <Badge tom="roxo">Previsão</Badge>;
  const tom = situacao === "Faturado integralmente" ? "verde" : situacao === "Faturado parcialmente" ? "amarelo" : situacao === "Cancelado" ? "vermelho" : "cinza";
  return <Badge tom={tom}>{situacao}</Badge>;
}

export const ROTULO_COMERCIAL: Record<string, string> = { firme: "Firme", previsao: "Previsão", convertido: "Convertido", cancelado: "Cancelado" };

export function BadgeComercial({ situacao }: { situacao: string }) {
  const tom = situacao === "firme" ? "verde" : situacao === "previsao" ? "roxo" : situacao === "cancelado" ? "vermelho" : "cinza";
  return <Badge tom={tom}>{ROTULO_COMERCIAL[situacao] ?? situacao}</Badge>;
}

export function BadgeStatusNf({ status }: { status: StatusComissaoNf }) {
  const tom = { nao_apurada: "amarelo", apurada_aguardando_nfse: "roxo", nfse_emitida: "azul", recebida: "verde" } as const;
  return <Badge tom={tom[status]}>{ROTULO_STATUS_NF[status]}</Badge>;
}

export function BadgeSituacaoApuracao({ situacao }: { situacao: SituacaoApuracao | StatusNfse }) {
  const tom = situacao === "Recebida" ? "verde" : situacao === "Aguardando pagamento" ? "azul" : "roxo";
  return <Badge tom={tom}>{situacao === "NF de comissao nao emitida" ? "Sem NFS-e" : situacao}</Badge>;
}
