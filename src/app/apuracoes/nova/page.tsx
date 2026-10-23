import { FormApuracao } from "@/components/formularios/apuracao";
import { Mensagens } from "@/components/mensagens";
import { Pagina } from "@/components/ui";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function NovaApuracaoPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const r = await obterResultado();
  const nfPadrao = typeof sp.nf === "string" ? sp.nf : null;
  const nf = nfPadrao ? r.nfs.find((n) => n.id === nfPadrao) : null;
  return (
    <Pagina titulo="Nova apuração" descricao={nf ? `NF ${nf.numero} · ${nf.representada.nome} · ${nf.cliente.nome}` : undefined}>
      <Mensagens sp={sp} />
      <FormApuracao r={r} nfPadrao={nfPadrao} voltarPara={nf ? `/notas-fiscais/${nf.id}` : undefined} />
    </Pagina>
  );
}
