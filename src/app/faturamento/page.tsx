import Link from "next/link";
import { BadgeFaturamento } from "@/components/badges";
import { FiltroGlobal } from "@/components/filtro-global";
import { Dica, NumeroLink } from "@/components/rastreio";
import { Card, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, data, mesCurto, num, pct } from "@/lib/formato";
import { filtroDaBusca, obterResultado, queryDoFiltro, type ParametrosBusca } from "@/lib/resultado";

export default async function FaturamentoPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const f = r.faturamento;
  const pedidos = f.pedidos.filter((p) => p.no_filtro);
  const itens = f.itens_a_faturar.filter((i) => i.pedido.no_filtro);
  const voltar = `/faturamento${queryDoFiltro(filtro)}`;

  return (
    <Pagina titulo="Faturamento" descricao="Situação de faturamento dos pedidos ativos, itens que ainda faltam faturar e vencimentos das duplicatas do cliente por mês.">
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />

      <Card titulo="Pedidos ativos">
        <Tabela className="border-0 shadow-none">
          <thead>
            <tr>
              <Th>Representada</Th>
              <Th>Cliente</Th>
              <Th>Pedido</Th>
              <Th>Situação</Th>
              <Th num>Valor</Th>
              <Th num>Já faturado</Th>
              <Th num>Saldo</Th>
              <Th num>% faturado</Th>
              <Th num>Variação de preço</Th>
              <Th>Faturamento previsto</Th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <Td>{p.representada.nome}</Td>
                <Td>{p.cliente.nome}</Td>
                <Td><Link href={`/pedidos/${p.id}`} className="text-sky-700 hover:underline">{p.numero}</Link></Td>
                <Td><BadgeFaturamento situacao={p.situacao_faturamento} comercial={p.situacao_comercial} /></Td>
                <Td num>{brl(p.valor_total)}</Td>
                <Td num>{brl(p.ja_faturado)}</Td>
                <Td num className={p.saldo_a_faturar > 0 ? "font-semibold" : "text-slate-400"}>{brl(p.saldo_a_faturar)}</Td>
                <Td num>{pct(p.pct_faturado, 0)}</Td>
                <Td num className={Math.abs(p.variacao_preco) > 0.005 ? "text-amber-700" : "text-slate-400"}>{brl(p.variacao_preco)}</Td>
                <Td>{data(p.data_prevista_faturamento)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card titulo="Itens que faltam faturar" rodape="Só pedidos controlados por item. Matching por família (ex.: 65W, 100W, 140W).">
          {itens.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum item pendente.</p>
          ) : (
            <Tabela className="border-0 shadow-none">
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Família</Th>
                  <Th num>Qtd pedida</Th>
                  <Th num>Faturada</Th>
                  <Th num>A faturar</Th>
                  <Th num>Saldo R$</Th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id}>
                    <Td><Link href={`/pedidos/${i.pedido.id}`} className="text-sky-700 hover:underline">{i.pedido.numero}</Link><div className="text-xs text-slate-500">{i.pedido.cliente.nome}</div></Td>
                    <Td>{i.familia}</Td>
                    <Td num>{num(i.qtd)}</Td>
                    <Td num>{num(i.qtd_faturada)}</Td>
                    <Td num className="font-semibold">{num(i.qtd_a_faturar)}</Td>
                    <Td num>{brl(i.saldo_a_faturar)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>

        <Card titulo="Vencimentos das duplicatas do cliente" rodape="Visão do fluxo do cliente com a representada. Em representadas 'por parcela' (F-Led) é o que libera a comissão. Clique em um valor para ver as parcelas.">
          <Tabela className="border-0 shadow-none">
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th num><span className="inline-flex items-center gap-1">Parcelas <Dica chave="faturamento:parcelas" alinhar="direita" /></span></Th>
                <Th num><span className="inline-flex items-center gap-1">Valor <Dica chave="faturamento:valor" alinhar="direita" /></span></Th>
                <Th num><span className="inline-flex items-center gap-1">Pago pelo cliente <Dica chave="faturamento:pago" alinhar="direita" /></span></Th>
              </tr>
            </thead>
            <tbody>
              {f.vencimentos.map((v) => (
                <tr key={v.mes}>
                  <Td>{mesCurto(v.mes)}</Td>
                  <Td num>{v.parcelas || <span className="text-slate-300">–</span>}</Td>
                  <Td num>{v.valor ? <NumeroLink chave={`faturamento:${v.mes}:valor`} filtro={filtro} voltar={voltar}>{brl(v.valor)}</NumeroLink> : <span className="text-slate-300">–</span>}</Td>
                  <Td num className="text-emerald-700">{v.valor_pago ? <NumeroLink chave={`faturamento:${v.mes}:pago`} filtro={filtro} voltar={voltar}>{brl(v.valor_pago)}</NumeroLink> : <span className="text-slate-300">–</span>}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td>Total</Td>
                <Td num>{f.vencimentos.reduce((s, v) => s + v.parcelas, 0)}</Td>
                <Td num><NumeroLink chave="faturamento:total:valor" filtro={filtro} voltar={voltar}>{brl(f.total_vencimentos)}</NumeroLink></Td>
                <Td num className="text-emerald-700"><NumeroLink chave="faturamento:total:pago" filtro={filtro} voltar={voltar}>{brl(f.vencimentos.reduce((s, v) => s + v.valor_pago, 0))}</NumeroLink></Td>
              </tr>
            </tfoot>
          </Tabela>
        </Card>
      </div>
    </Pagina>
  );
}
