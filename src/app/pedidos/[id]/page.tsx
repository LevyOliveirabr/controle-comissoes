import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeComercial, BadgeFaturamento, BadgeStatusNf } from "@/components/badges";
import { FormPedido } from "@/components/formularios/pedido";
import { Mensagens } from "@/components/mensagens";
import { CadeiaCalculo, Dica } from "@/components/rastreio";
import { Alerta, Botao, Campo, Card, Descricao, FormExcluir, Input, Pagina, Tabela, Td, Th } from "@/components/ui";
import { adicionarItemPedido, converterPrevisao, excluirItemPedido, excluirPedido } from "@/lib/acoes/pedidos";
import { motivoSituacaoPedido } from "@/lib/explicacoes";
import { brl, data, num, pct } from "@/lib/formato";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function PedidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParametrosBusca> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await obterResultado();
  const p = r.pedidos.find((x) => x.id === id);
  if (!p) notFound();
  const nfs = r.nfs.filter((n) => n.pedido_id === id);
  const inativo = p.situacao_comercial === "cancelado" || p.situacao_comercial === "convertido";

  return (
    <Pagina
      titulo={p.numero}
      descricao={`${p.representada.nome} · ${p.cliente.nome}`}
      acoes={
        <>
          {p.situacao_comercial === "previsao" && (
            <form action={converterPrevisao}>
              <input type="hidden" name="id" value={id} />
              <Botao variante="secundario">Converter em firme</Botao>
            </form>
          )}
          <Link href={`/notas-fiscais/nova?pedido=${id}`} className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Lançar NF deste pedido</Link>
          <FormExcluir acao={excluirPedido} id={id} />
        </>
      }
    >
      <Mensagens sp={sp} />

      <Card titulo="Situação">
        <Descricao
          itens={[
            ["Comercial", <BadgeComercial key="c" situacao={p.situacao_comercial} />],
            ["Faturamento", <BadgeFaturamento key="f" situacao={p.situacao_faturamento} comercial={p.situacao_comercial} />],
            ["% efetivo", <span key="p">{pct(p.pct_efetivo)} {p.pct_override != null ? <span className="text-xs text-amber-700">(específico do pedido)</span> : <span className="text-xs text-slate-500">(padrão da representada)</span>} <Dica chave="pedido:pct" /></span>],
            ["Valor do pedido", brl(p.valor_total) + (p.valor_original != null ? ` (original ${brl(p.valor_original)})` : "")],
            ["Já faturado", `${brl(p.ja_faturado)} (${pct(p.pct_faturado, 0)})`],
            ["Saldo a faturar", <span key="s"><strong>{brl(p.saldo_a_faturar)}</strong> <Dica chave="pedido:saldo" /></span>],
            ["Variação de preço", brl(p.variacao_preco)],
            ["Comissão total", <span key="ct">{brl(p.comissao_total)} <Dica chave="pedido:comissao_total" /></span>],
            ["Comissão sobre o saldo", <span key="cs">{brl(p.comissao_saldo)} <Dica chave="pedido:comissao_saldo" /></span>],
          ]}
        />
        {Math.abs(p.variacao_preco) > 0.005 && p.ativo && p.saldo_a_faturar === 0 && (
          <div className="mt-4">
            <Alerta tom="info">Faturado com diferença de {brl(p.variacao_preco)} em relação ao pedido (dentro da tolerância de {brl(r.dados.parametros.tolerancia_saldo)}). A comissão é calculada sobre as NFs.</Alerta>
          </div>
        )}
      </Card>

      <Card titulo="Como este valor foi calculado" rodape={<Link href="/ajuda" className="text-sky-700 hover:underline">Entenda os números →</Link>}>
        <CadeiaCalculo
          passos={[
            { rotulo: "Valor do pedido", valor: brl(p.valor_total), nota: p.valor_original != null ? `Valor original ${brl(p.valor_original)}; o valor atual é o que vale para a comissão.` : undefined },
            {
              rotulo: "Percentual efetivo",
              valor: pct(p.pct_efetivo),
              nota: p.pct_override != null ? "Informado neste pedido (vale acima do % padrão da representada)." : `% padrão cadastrado na ${p.representada.nome} (${pct(p.representada.pct_padrao)}).`,
            },
            {
              rotulo: "Comissão total do pedido",
              conta: inativo ? "pedido cancelado/convertido" : `${brl(p.valor_total)} × ${pct(p.pct_efetivo)}`,
              valor: brl(p.comissao_total),
              nota: inativo ? "Zero: pedidos cancelados ou convertidos não geram comissão." : undefined,
            },
            {
              rotulo: "Já faturado",
              conta: nfs.length ? `soma de ${nfs.length} ${nfs.length === 1 ? "NF" : "NFs"}` : "nenhuma NF ligada",
              valor: brl(p.ja_faturado),
              nota:
                nfs.length > 0 ? (
                  <span>
                    {nfs.map((n, i) => (
                      <span key={n.id}>
                        {i > 0 && " + "}
                        <Link href={`/notas-fiscais/${n.id}`} className="text-sky-700 hover:underline">NF {n.numero}</Link> {brl(n.valor_total)}
                      </span>
                    ))}
                  </span>
                ) : undefined,
            },
            {
              rotulo: "Saldo a faturar",
              conta: inativo ? "pedido inativo" : p.usa_itens && p.itens.length > 0 ? "soma do saldo de cada item (qtd a faturar × valor unitário)" : `${brl(p.valor_total)} − ${brl(p.ja_faturado)}`,
              valor: brl(p.saldo_a_faturar),
              destaque: true,
              nota: Math.abs(p.variacao_preco) > 0.005 ? `A diferença de ${brl(p.variacao_preco)} entre pedido, NFs e saldo é variação de preço.` : undefined,
            },
            {
              rotulo: p.situacao_comercial === "previsao" ? "Comissão sobre o saldo (pipeline de previsão)" : "Comissão sobre o saldo (estágio 5 do funil)",
              conta: `${brl(p.saldo_a_faturar)} × ${pct(p.pct_efetivo)}`,
              valor: brl(p.comissao_saldo),
              destaque: true,
              nota: p.situacao_comercial === "previsao" ? "Fica fora do total firme até o pedido ser convertido." : p.ativo ? "É a parte deste pedido em 'Pedido firme a faturar'. O que já foi faturado passa a ser acompanhado nota a nota, nas NFs acima." : undefined,
            },
            {
              rotulo: "Comissão já apurada nas NFs deste pedido",
              valor: brl(p.comissao_apurada),
              nota: "Soma das apurações lançadas para as NFs ligadas a este pedido.",
            },
          ]}
          conclusao={
            <>
              <span className="font-semibold">Situação: <BadgeFaturamento situacao={p.situacao_faturamento} comercial={p.situacao_comercial} /></span> — {motivoSituacaoPedido(p, r.dados.parametros.tolerancia_saldo)}
            </>
          }
        />
      </Card>

      <Card titulo={`Notas fiscais deste pedido (${nfs.length})`}>
        {nfs.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma NF lançada.</p>
        ) : (
          <Tabela className="border-0 shadow-none">
            <thead>
              <tr>
                <Th>NF</Th>
                <Th>Emissão</Th>
                <Th num>Valor total</Th>
                <Th num>%</Th>
                <Th num>Comissão prevista</Th>
                <Th num>Apurada</Th>
                <Th num>Recebida</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {nfs.map((n) => (
                <tr key={n.id}>
                  <Td><Link href={`/notas-fiscais/${n.id}`} className="text-sky-700 hover:underline">{n.numero}</Link></Td>
                  <Td>{data(n.data_emissao)}</Td>
                  <Td num>{brl(n.valor_total)}</Td>
                  <Td num>{pct(n.pct)}</Td>
                  <Td num>{brl(n.comissao_prevista)}</Td>
                  <Td num>{brl(n.comissao_apurada)}</Td>
                  <Td num>{brl(n.comissao_recebida)}</Td>
                  <Td><BadgeStatusNf status={n.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>

      <Card titulo={`Itens do pedido (${p.itens.length})`} rodape="Opcional. Com itens, o saldo a faturar é calculado por família: quantidade pedida − quantidade faturada nas NFs do pedido.">
        {p.itens.length > 0 && (
          <Tabela className="mb-4 border-0 shadow-none">
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Família</Th>
                <Th>Código</Th>
                <Th>Descrição</Th>
                <Th num>Qtd</Th>
                <Th num>Valor unit.</Th>
                <Th num>Total</Th>
                <Th num>Faturada</Th>
                <Th num>A faturar</Th>
                <Th num>Saldo R$</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {p.itens.map((i) => (
                <tr key={i.id}>
                  <Td>{i.item ?? "—"}</Td>
                  <Td className="font-medium">{i.familia}</Td>
                  <Td>{i.codigo ?? "—"}</Td>
                  <Td className="max-w-md truncate" >{i.descricao ?? "—"}</Td>
                  <Td num>{num(i.qtd)}</Td>
                  <Td num>{brl(i.valor_unit)}</Td>
                  <Td num>{brl(i.valor_total)}</Td>
                  <Td num>{num(i.qtd_faturada)}</Td>
                  <Td num className={i.qtd_a_faturar > 0 ? "font-semibold" : ""}>{num(i.qtd_a_faturar)}</Td>
                  <Td num>{brl(i.saldo_a_faturar)}</Td>
                  <Td><FormExcluir acao={excluirItemPedido} id={i.id} voltarPara={id} rotulo="Remover" /></Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        <form action={adicionarItemPedido} className="grid grid-cols-2 gap-3 md:grid-cols-7">
          <input type="hidden" name="pedido_id" value={id} />
          <Campo rotulo="#"><Input name="item" type="number" step="1" min="1" defaultValue={p.itens.length + 1} /></Campo>
          <Campo rotulo="Família"><Input name="familia" required placeholder="65W" /></Campo>
          <Campo rotulo="Código"><Input name="codigo" /></Campo>
          <Campo rotulo="Descrição" className="md:col-span-2"><Input name="descricao" /></Campo>
          <Campo rotulo="Qtd"><Input name="qtd" type="number" step="0.01" min="0" required /></Campo>
          <Campo rotulo="Valor unit. (R$)"><Input name="valor_unit" type="number" step="0.0001" min="0" required /></Campo>
          <div className="col-span-2 md:col-span-7">
            <Botao variante="secundario">Adicionar item</Botao>
          </div>
        </form>
      </Card>

      <FormPedido p={p} representadas={r.dados.representadas} clientes={r.dados.clientes} />
    </Pagina>
  );
}
