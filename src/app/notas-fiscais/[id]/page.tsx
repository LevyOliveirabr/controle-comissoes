import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeSituacaoApuracao, BadgeStatusNf } from "@/components/badges";
import { FormNotaFiscal } from "@/components/formularios/nota-fiscal";
import { Mensagens } from "@/components/mensagens";
import { Alerta, Badge, Botao, Campo, Card, Descricao, FormExcluir, Input, Pagina, Tabela, Td, Th } from "@/components/ui";
import { excluirApuracao } from "@/lib/acoes/comissoes";
import { adicionarItemNf, excluirItemNf, excluirNf, excluirParcela, marcarParcelaPaga, salvarParcela } from "@/lib/acoes/notas";
import { brl, data, mesCurto, num, pct } from "@/lib/formato";
import { somarDias } from "@/lib/motor";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function NfPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParametrosBusca> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await obterResultado();
  const nf = r.nfs.find((x) => x.id === id);
  if (!nf) notFound();
  const rep = nf.representada;
  const agendaItens = r.agenda.filter((i) => i.referencia.tipo === "nf" && i.referencia.id === id);
  const somaParcelas = nf.parcelas.reduce((s, p) => s + p.valor, 0);
  const voltar = `/notas-fiscais/${id}`;

  return (
    <Pagina
      titulo={`NF ${nf.numero}${nf.serie !== "1" ? ` / série ${nf.serie}` : ""}`}
      descricao={`${rep.nome} · ${nf.cliente.nome}${nf.pedido ? ` · pedido ${nf.pedido.numero}` : ""}`}
      acoes={
        <>
          <Link href={`/apuracoes/nova?nf=${id}`} className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Lançar apuração</Link>
          <FormExcluir acao={excluirNf} id={id} />
        </>
      }
    >
      <Mensagens sp={sp} />

      <Card titulo="Comissão desta nota">
        <Descricao
          itens={[
            ["Status", <BadgeStatusNf key="s" status={nf.status} />],
            ["Base de cálculo", `${brl(nf.base)} (${rep.base_calculo === "valor_produtos" ? "produtos" : "total da NF"})`],
            ["% aplicado", <span key="p">{pct(nf.pct)} <span className="text-xs text-slate-500">({nf.pct_override != null ? "manual nesta NF" : nf.pedido?.pct_override != null ? "do pedido" : "padrão da representada"})</span></span>],
            ["Comissão prevista", brl(nf.comissao_prevista)],
            ["Comissão apurada", brl(nf.comissao_apurada)],
            ["Comissão recebida", <span key="r" className="text-emerald-700">{brl(nf.comissao_recebida)}</span>],
            ["Saldo de comissão", <strong key="sc">{brl(nf.saldo_comissao)}</strong>],
            ["Pendente de apuração", brl(nf.pendente_apuracao)],
            ["Confere com os itens?", nf.confere_itens],
          ]}
        />
        {nf.divergencia > 0 && (
          <div className="mt-4">
            <Alerta tom="atencao" titulo={`Apurado ${brl(nf.divergencia)} acima do previsto`}>
              A representada apurou {brl(nf.comissao_apurada)} sobre uma previsão de {brl(nf.comissao_prevista)} ({pct(nf.pct)}). Confirme o percentual; o funil usa o valor apurado.
            </Alerta>
          </div>
        )}
        {agendaItens.length > 0 && (
          <div className="mt-4 text-sm text-slate-600">
            Comissão esperada {agendaItens.length > 1 ? "por parcela" : ""}: {agendaItens.map((i) => `${brl(i.valor)} em ${data(i.data_esperada)}`).join("; ")}
            <span className="text-xs text-slate-500"> ({rep.regra_liberacao === "por_parcela" ? "mês seguinte ao vencimento de cada parcela" : `emissão + ${rep.dias_ate_apuracao} dias até apuração + ${rep.prazo_pagamento_dias} de prazo`})</span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <Card titulo={`Parcelas / duplicatas (${nf.parcelas.length})`} rodape={Math.abs(somaParcelas - nf.valor_total) > 0.01 && nf.parcelas.length > 0 ? <span className="text-amber-700">Soma das parcelas ({brl(somaParcelas)}) difere do valor da NF ({brl(nf.valor_total)}).</span> : "Prazo de pagamento do cliente. Em representadas 'por parcela', define quando a comissão é liberada."}>
          {nf.parcelas.length > 0 && (
            <Tabela className="mb-4 border-0 shadow-none">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Venc. documento</Th>
                  <Th>Venc. boleto</Th>
                  <Th num>Valor</Th>
                  <Th>Pago?</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {nf.parcelas.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.numero}</Td>
                    <Td>{data(p.vencimento_documento)}</Td>
                    <Td>{data(p.vencimento_boleto)}</Td>
                    <Td num>{brl(p.valor)}</Td>
                    <Td>
                      {p.cliente_pagou ? <Badge tom="verde">Pago {data(p.data_pagamento)}</Badge> : <Badge>Em aberto</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap space-x-1">
                      <form action={marcarParcelaPaga} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="nf_venda_id" value={id} />
                        <input type="hidden" name="paga" value={p.cliente_pagou ? "false" : "true"} />
                        <Botao variante="secundario">{p.cliente_pagou ? "Desfazer pgto" : "Marcar paga"}</Botao>
                      </form>
                      <FormExcluir acao={excluirParcela} id={p.id} voltarPara={id} rotulo="Remover" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
          <form action={salvarParcela} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="hidden" name="nf_venda_id" value={id} />
            <Campo rotulo="#"><Input name="numero" type="number" min="1" step="1" required defaultValue={nf.parcelas.length + 1} /></Campo>
            <Campo rotulo="Venc. documento"><Input name="vencimento_documento" type="date" required defaultValue={somarDias(nf.data_emissao, 30 * (nf.parcelas.length + 1))} /></Campo>
            <Campo rotulo="Venc. boleto"><Input name="vencimento_boleto" type="date" /></Campo>
            <Campo rotulo="Valor (R$)"><Input name="valor" type="number" step="0.01" min="0" required defaultValue={Math.max(0, +(nf.valor_total - somaParcelas).toFixed(2))} /></Campo>
            <div className="col-span-2 md:col-span-4">
              <Botao variante="secundario">Adicionar parcela</Botao>
            </div>
          </form>
        </Card>

        <Card titulo={`Itens faturados (${nf.itens.length})`} rodape="Opcional. Usados para baixar as quantidades do pedido por família e conferir o valor dos produtos.">
          {nf.itens.length > 0 && (
            <Tabela className="mb-4 border-0 shadow-none">
              <thead>
                <tr>
                  <Th>Família</Th>
                  <Th>Código</Th>
                  <Th num>Qtd</Th>
                  <Th num>Valor</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {nf.itens.map((i) => (
                  <tr key={i.id}>
                    <Td className="font-medium">{i.familia}</Td>
                    <Td>{i.codigo ?? "—"}</Td>
                    <Td num>{num(i.qtd)}</Td>
                    <Td num>{brl(i.valor_total)}</Td>
                    <Td><FormExcluir acao={excluirItemNf} id={i.id} voltarPara={id} rotulo="Remover" /></Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
          <form action={adicionarItemNf} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="hidden" name="nf_venda_id" value={id} />
            <Campo rotulo="Família"><Input name="familia" required placeholder="65W" /></Campo>
            <Campo rotulo="Código"><Input name="codigo" /></Campo>
            <Campo rotulo="Qtd"><Input name="qtd" type="number" step="0.01" min="0" required /></Campo>
            <Campo rotulo="Valor (R$)"><Input name="valor_total" type="number" step="0.01" min="0" required /></Campo>
            <div className="col-span-2 md:col-span-4">
              <Botao variante="secundario">Adicionar item</Botao>
            </div>
          </form>
        </Card>
      </div>

      <Card titulo={`Apurações de comissão (${nf.apuracoes.length})`} rodape={<Link href={`/apuracoes/nova?nf=${id}`} className="text-sky-700 hover:underline">Lançar apuração desta NF →</Link>}>
        {nf.apuracoes.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma apuração ainda. {rep.envia_relatorio ? `Aguarde o relatório da ${rep.nome} (≈ ${rep.dias_ate_apuracao} dias após o faturamento).` : `${rep.nome} não envia relatório: lance a apuração ao emitir sua NFS-e.`}</p>
        ) : (
          <Tabela className="border-0 shadow-none">
            <thead>
              <tr>
                <Th>Mês ref.</Th>
                <Th>Parcela</Th>
                <Th>Pgto representada</Th>
                <Th num>Base</Th>
                <Th num>%</Th>
                <Th num>Apurado</Th>
                <Th>NFS-e</Th>
                <Th>Situação</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {nf.apuracoes.map((a) => (
                <tr key={a.id}>
                  <Td><Link href={`/apuracoes/${a.id}`} className="text-sky-700 hover:underline">{a.referencia ?? mesCurto(a.mes_referencia)}</Link></Td>
                  <Td>{a.parcela ? `${a.parcela.numero} (${data(a.parcela.vencimento_documento)})` : "—"}</Td>
                  <Td>{data(a.data_pgto_representada)}{a.nr_pgto ? <span className="block text-xs text-slate-500">nº {a.nr_pgto}</span> : null}</Td>
                  <Td num>{brl(a.base)}</Td>
                  <Td num>{pct(a.pct)}</Td>
                  <Td num className="font-semibold">{brl(a.valor_apurado)}</Td>
                  <Td>{a.nfse ? <Link href={`/nfse/${a.nfse.id}`} className="text-sky-700 hover:underline">{a.nfse.numero ?? a.nfse.referencia ?? "NFS-e"}</Link> : <span className="text-slate-400">—</span>}</Td>
                  <Td><BadgeSituacaoApuracao situacao={a.situacao} /></Td>
                  <Td><FormExcluir acao={excluirApuracao} id={a.id} voltarPara={voltar} rotulo="Excluir" /></Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>

      <FormNotaFiscal nf={nf} representadas={r.dados.representadas} clientes={r.dados.clientes} pedidos={r.dados.pedidos} />
    </Pagina>
  );
}
