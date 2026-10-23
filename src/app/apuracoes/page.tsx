import Link from "next/link";
import { BadgeSituacaoApuracao } from "@/components/badges";
import { FiltroGlobal } from "@/components/filtro-global";
import { Mensagens } from "@/components/mensagens";
import { BotaoLink, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, data, mesCurto, pct } from "@/lib/formato";
import { filtroDaBusca, obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function ApuracoesPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const aps = r.apuracoes.filter((a) => a.no_filtro).sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia) || a.nf.numero.localeCompare(b.nf.numero));
  const soma = (f: (a: (typeof aps)[number]) => number) => aps.reduce((s, a) => s + f(a), 0);

  return (
    <Pagina titulo="Apurações de comissão" descricao="Relatórios de comissão recebidos das representadas (ou suas NFS-e, quando a representada não manda relatório). A situação vem da NFS-e vinculada: sem NFS-e → aguardando pagamento → recebida." acoes={<BotaoLink href="/apuracoes/nova">Nova apuração</BotaoLink>}>
      <Mensagens sp={sp} />
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />
      <Tabela>
        <thead>
          <tr>
            <Th>Mês ref.</Th>
            <Th>Representada / cliente</Th>
            <Th>NF</Th>
            <Th>Parcela</Th>
            <Th>Pgto representada</Th>
            <Th num>Base</Th>
            <Th num>%</Th>
            <Th num>Apurado</Th>
            <Th>NFS-e</Th>
            <Th>Situação</Th>
            <Th num>Recebido</Th>
          </tr>
        </thead>
        <tbody>
          {aps.map((a) => (
            <tr key={a.id}>
              <Td><Link href={`/apuracoes/${a.id}`} className="text-sky-700 hover:underline">{a.referencia ?? mesCurto(a.mes_referencia)}</Link></Td>
              <Td>
                <div className="font-medium">{a.representada.nome}</div>
                <div className="max-w-56 truncate text-xs text-slate-500" title={a.cliente.nome}>{a.cliente.nome}</div>
              </Td>
              <Td><Link href={`/notas-fiscais/${a.nf.id}`} className="text-sky-700 hover:underline">{a.nf.numero}</Link></Td>
              <Td>{a.parcela ? a.parcela.numero : "—"}</Td>
              <Td>{data(a.data_pgto_representada)}</Td>
              <Td num>{brl(a.base)}</Td>
              <Td num>{pct(a.pct)}</Td>
              <Td num className="font-semibold">{brl(a.valor_apurado)}</Td>
              <Td>{a.nfse ? <Link href={`/nfse/${a.nfse.id}`} className="text-sky-700 hover:underline">{a.nfse.numero ?? a.nfse.referencia ?? "NFS-e"}</Link> : <span className="text-slate-400">—</span>}</Td>
              <Td><BadgeSituacaoApuracao situacao={a.situacao} /></Td>
              <Td num className="text-emerald-700">{a.comissao_recebida ? brl(a.comissao_recebida) : <span className="text-slate-300">–</span>}</Td>
            </tr>
          ))}
          {aps.length === 0 && (
            <tr>
              <Td colSpan={11} className="text-center text-slate-500">Nenhuma apuração.</Td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <Td colSpan={5}>Total ({aps.length})</Td>
            <Td num>{brl(soma((a) => a.base))}</Td>
            <Td />
            <Td num>{brl(soma((a) => a.valor_apurado))}</Td>
            <Td colSpan={2} />
            <Td num className="text-emerald-700">{brl(soma((a) => a.comissao_recebida))}</Td>
          </tr>
        </tfoot>
      </Tabela>
    </Pagina>
  );
}
