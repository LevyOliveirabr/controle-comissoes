import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeSituacaoApuracao } from "@/components/badges";
import { FormApuracao } from "@/components/formularios/apuracao";
import { Mensagens } from "@/components/mensagens";
import { Card, Descricao, FormExcluir, Pagina } from "@/components/ui";
import { excluirApuracao } from "@/lib/acoes/comissoes";
import { brl, data, mesCurto, pct } from "@/lib/formato";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function ApuracaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParametrosBusca> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await obterResultado();
  const a = r.apuracoes.find((x) => x.id === id);
  if (!a) notFound();

  return (
    <Pagina titulo={`Apuração ${a.referencia ?? mesCurto(a.mes_referencia)}`} descricao={`${a.representada.nome} · ${a.cliente.nome} · NF ${a.nf.numero}`} acoes={<FormExcluir acao={excluirApuracao} id={id} />}>
      <Mensagens sp={sp} />
      <Card titulo="Resumo">
        <Descricao
          itens={[
            ["Situação", <BadgeSituacaoApuracao key="s" situacao={a.situacao} />],
            ["NF de venda", <Link key="nf" href={`/notas-fiscais/${a.nf.id}`} className="text-sky-700 hover:underline">NF {a.nf.numero} · {data(a.nf.data_emissao)} · {brl(a.nf.valor_total)}</Link>],
            ["Parcela", a.parcela ? `${a.parcela.numero} · venc. ${data(a.parcela.vencimento_documento)} · ${brl(a.parcela.valor)}` : "NF inteira"],
            ["Comissão apurada", <strong key="v">{brl(a.valor_apurado)}</strong>],
            ["Base × %", `${brl(a.base)} × ${pct(a.pct)}`],
            ["NFS-e", a.nfse ? <Link key="x" href={`/nfse/${a.nfse.id}`} className="text-sky-700 hover:underline">{a.nfse.numero ? `NFS-e ${a.nfse.numero}` : "NFS-e sem número"} · {data(a.nfse.data_emissao)}{a.nfse.data_credito ? ` · crédito ${data(a.nfse.data_credito)}` : ""}</Link> : "Ainda não emitida"],
          ]}
        />
      </Card>
      <FormApuracao a={a} r={r} />
    </Pagina>
  );
}
