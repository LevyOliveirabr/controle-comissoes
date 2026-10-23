import Link from "next/link";
import { BadgeFaturamento } from "@/components/badges";
import { FiltroGlobal } from "@/components/filtro-global";
import { Card, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, data, mesCurto, num, pct } from "@/lib/formato";
import { filtroDaBusca, obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function FaturamentoPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const f = r.faturamento;
  const pedidos = f.pedidos.filter((p) => p.no_filtro);
  const itens = f.itens_a_faturar.filter((i) => i.pedido.no_filtro);

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

        <Card titulo="Vencimentos das duplicatas do cliente" rodape="Visão do fluxo do cliente com a representada. Em representadas 'por parcela' (F-Led) é o que libera a comissão.">
          <Tabela className="border-0 shadow-none">
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th num>Parcelas</Th>
                <Th num>Valor</Th>
                <Th num>Pago pelo cliente</Th>
              </tr>
            </thead>
            <tbody>
              {f.vencimentos.map((v) => (
                <tr key={v.mes}>
                  <Td>{mesCurto(v.mes)}</Td>
                  <Td num>{v.parcelas || <span className="text-slate-300">–</span>}</Td>
                  <Td num>{v.valor ? brl(v.valor) : <span className="text-slate-300">–</span>}</Td>
                  <Td num className="text-emerald-700">{v.valor_pago ? brl(v.valor_pago) : <span className="text-slate-300">–</span>}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td>Total</Td>
                <Td num>{f.vencimentos.reduce((s, v) => s + v.parcelas, 0)}</Td>
                <Td num>{brl(f.total_vencimentos)}</Td>
                <Td num className="text-emerald-700">{brl(f.vencimentos.reduce((s, v) => s + v.valor_pago, 0))}</Td>
              </tr>
            </tfoot>
          </Tabela>
        </Card>
      </div>
    </Pagina>
  );
}
