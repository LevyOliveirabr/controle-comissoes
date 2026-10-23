import Link from "next/link";
import { BadgeComercial, BadgeFaturamento } from "@/components/badges";
import { FiltroGlobal } from "@/components/filtro-global";
import { Mensagens } from "@/components/mensagens";
import { BotaoLink, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, data, pct } from "@/lib/formato";
import { filtroDaBusca, obterResultado, type ParametrosBusca } from "@/lib/resultado";

const SITUACOES = [
  ["", "Todos"],
  ["ativos", "Ativos (firme + previsão)"],
  ["firme", "Firme"],
  ["previsao", "Previsão"],
  ["a_faturar", "Com saldo a faturar"],
  ["cancelado", "Cancelado"],
  ["convertido", "Convertido"],
] as const;

export default async function PedidosPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const sit = typeof sp.sit === "string" ? sp.sit : "ativos";
  const r = await obterResultado(filtro);
  const pedidos = r.pedidos
    .filter((p) => p.no_filtro)
    .filter((p) => {
      if (sit === "ativos") return p.ativo;
      if (sit === "a_faturar") return p.ativo && p.saldo_a_faturar > 0;
      if (sit) return p.situacao_comercial === sit;
      return true;
    })
    .sort((a, b) => (b.data_pedido ?? "").localeCompare(a.data_pedido ?? ""));
  const soma = (f: (p: (typeof pedidos)[number]) => number) => pedidos.reduce((s, p) => s + f(p), 0);

  return (
    <Pagina titulo="Pedidos" descricao="Carteira e saldo a faturar. O saldo usa os itens quando o pedido é controlado por item; senão, valor total − faturado (tolerância de R$ 100)." acoes={<BotaoLink href="/pedidos/novo">Novo pedido</BotaoLink>}>
      <Mensagens sp={sp} />
      <div className="flex flex-wrap items-end gap-3">
        <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} extras={{ sit }} />
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {SITUACOES.map(([valor, rotulo]) => {
            const q = new URLSearchParams();
            if (filtro.representada_id) q.set("rep", filtro.representada_id);
            if (filtro.cliente_id) q.set("cli", filtro.cliente_id);
            if (valor) q.set("sit", valor);
            const ativo = (valor || "") === (sit === "ativos" && !sp.sit ? "ativos" : sit);
            return (
              <Link key={valor} href={`/pedidos?${q}`} className={`rounded-lg px-3 py-1.5 text-sm ${ativo ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {rotulo}
              </Link>
            );
          })}
        </div>
      </div>

      <Tabela>
        <thead>
          <tr>
            <Th>Representada</Th>
            <Th>Cliente</Th>
            <Th>Pedido</Th>
            <Th>Data</Th>
            <Th>Comercial</Th>
            <Th>Faturamento</Th>
            <Th num>Valor</Th>
            <Th num>%</Th>
            <Th num>Já faturado</Th>
            <Th num>Saldo a faturar</Th>
            <Th num>Comissão total</Th>
            <Th num>Comissão s/ saldo</Th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id} className={p.ativo ? "" : "text-slate-400"}>
              <Td>{p.representada.nome}</Td>
              <Td>{p.cliente.nome}</Td>
              <Td className="font-medium">
                <Link href={`/pedidos/${p.id}`} className="text-sky-700 hover:underline">{p.numero}</Link>
                {p.usa_itens && <span className="ml-1 text-xs text-slate-400">({p.itens.length} itens)</span>}
              </Td>
              <Td>{data(p.data_pedido)}</Td>
              <Td><BadgeComercial situacao={p.situacao_comercial} /></Td>
              <Td><BadgeFaturamento situacao={p.situacao_faturamento} comercial={p.situacao_comercial} /></Td>
              <Td num>{brl(p.valor_total)}</Td>
              <Td num>{pct(p.pct_efetivo)}{p.pct_override != null && <span title="percentual específico deste pedido" className="ml-0.5 text-amber-600">*</span>}</Td>
              <Td num>{brl(p.ja_faturado)}</Td>
              <Td num className={p.saldo_a_faturar > 0 ? "font-semibold" : ""}>{brl(p.saldo_a_faturar)}</Td>
              <Td num>{brl(p.comissao_total)}</Td>
              <Td num>{brl(p.comissao_saldo)}</Td>
            </tr>
          ))}
          {pedidos.length === 0 && (
            <tr>
              <Td colSpan={12} className="text-center text-slate-500">Nenhum pedido neste filtro.</Td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <Td colSpan={6}>Total ({pedidos.length})</Td>
            <Td num>{brl(soma((p) => p.valor_total))}</Td>
            <Td />
            <Td num>{brl(soma((p) => p.ja_faturado))}</Td>
            <Td num>{brl(soma((p) => p.saldo_a_faturar))}</Td>
            <Td num>{brl(soma((p) => p.comissao_total))}</Td>
            <Td num>{brl(soma((p) => p.comissao_saldo))}</Td>
          </tr>
        </tfoot>
      </Tabela>
    </Pagina>
  );
}
