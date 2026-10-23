import Link from "next/link";
import { BadgeStatusNf } from "@/components/badges";
import { FiltroGlobal } from "@/components/filtro-global";
import { Mensagens } from "@/components/mensagens";
import { Badge, BotaoLink, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, data, pct } from "@/lib/formato";
import { ROTULO_STATUS_NF, type StatusComissaoNf } from "@/lib/motor";
import { filtroDaBusca, obterResultado, type ParametrosBusca } from "@/lib/resultado";

const STATUS: StatusComissaoNf[] = ["nao_apurada", "apurada_aguardando_nfse", "nfse_emitida", "recebida"];

export default async function NotasFiscaisPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const status = typeof sp.status === "string" ? sp.status : "";
  const r = await obterResultado(filtro);
  const nfs = r.nfs
    .filter((n) => n.no_filtro)
    .filter((n) => !status || n.status === status)
    .sort((a, b) => b.data_emissao.localeCompare(a.data_emissao));
  const soma = (f: (n: (typeof nfs)[number]) => number) => nfs.reduce((s, n) => s + f(n), 0);
  const contagem = (s: StatusComissaoNf) => r.nfs.filter((n) => n.no_filtro && n.status === s).length;
  const linkStatus = (s: string) => {
    const q = new URLSearchParams();
    if (filtro.representada_id) q.set("rep", filtro.representada_id);
    if (filtro.cliente_id) q.set("cli", filtro.cliente_id);
    if (s) q.set("status", s);
    return `/notas-fiscais?${q}`;
  };

  return (
    <Pagina titulo="Notas fiscais de venda" descricao="Comissão prevista, apurada e recebida por nota. O status segue os 4 passos: não apurada → apurada aguardando NFS-e → NFS-e emitida → recebida." acoes={<BotaoLink href="/notas-fiscais/nova">Nova NF</BotaoLink>}>
      <Mensagens sp={sp} />
      <div className="flex flex-wrap items-end gap-3">
        <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} extras={{ status }} />
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <Link href={linkStatus("")} className={`rounded-lg px-3 py-1.5 text-sm ${!status ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Todas</Link>
          {STATUS.map((s) => (
            <Link key={s} href={linkStatus(s)} className={`rounded-lg px-3 py-1.5 text-sm ${status === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {ROTULO_STATUS_NF[s]} <span className="text-xs opacity-70">({contagem(s)})</span>
            </Link>
          ))}
        </div>
      </div>

      <Tabela>
        <thead>
          <tr>
            <Th>Representada</Th>
            <Th>Cliente</Th>
            <Th>Pedido</Th>
            <Th>NF</Th>
            <Th>Emissão</Th>
            <Th num>Valor total</Th>
            <Th num>Base</Th>
            <Th num>%</Th>
            <Th num>Prevista</Th>
            <Th num>Apurada</Th>
            <Th num>Recebida</Th>
            <Th num>Saldo</Th>
            <Th>Status</Th>
            <Th>Itens</Th>
            <Th num>Parc.</Th>
          </tr>
        </thead>
        <tbody>
          {nfs.map((n) => (
            <tr key={n.id}>
              <Td>{n.representada.nome}</Td>
              <Td>{n.cliente.nome}</Td>
              <Td>{n.pedido ? <Link href={`/pedidos/${n.pedido.id}`} className="text-sky-700 hover:underline">{n.pedido.numero}</Link> : <span className="text-slate-400">{n.venda_direta ? "venda direta" : "sem pedido"}</span>}</Td>
              <Td className="font-medium">
                <Link href={`/notas-fiscais/${n.id}`} className="text-sky-700 hover:underline">{n.numero}</Link>
                {n.simulada && <Badge tom="amarelo">simulada</Badge>}
              </Td>
              <Td>{data(n.data_emissao)}</Td>
              <Td num>{brl(n.valor_total)}</Td>
              <Td num>{brl(n.base)}</Td>
              <Td num>{pct(n.pct)}{n.pct_override != null && <span className="ml-0.5 text-amber-600">*</span>}</Td>
              <Td num>{brl(n.comissao_prevista)}</Td>
              <Td num className={n.divergencia > 0 ? "text-amber-700" : ""}>{brl(n.comissao_apurada)}</Td>
              <Td num className="text-emerald-700">{brl(n.comissao_recebida)}</Td>
              <Td num className={n.saldo_comissao > r.dados.parametros.tolerancia_comissao ? "font-semibold" : "text-slate-400"}>{brl(n.saldo_comissao)}</Td>
              <Td><BadgeStatusNf status={n.status} /></Td>
              <Td>{n.confere_itens === "OK" ? <Badge tom="verde">OK</Badge> : n.confere_itens === "Divergencia" ? <Badge tom="vermelho">Divergência</Badge> : <Badge>sem itens</Badge>}</Td>
              <Td num>{n.n_parcelas}</Td>
            </tr>
          ))}
          {nfs.length === 0 && (
            <tr>
              <Td colSpan={15} className="text-center text-slate-500">Nenhuma NF neste filtro.</Td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <Td colSpan={5}>Total ({nfs.length})</Td>
            <Td num>{brl(soma((n) => n.valor_total))}</Td>
            <Td num>{brl(soma((n) => n.base))}</Td>
            <Td />
            <Td num>{brl(soma((n) => n.comissao_prevista))}</Td>
            <Td num>{brl(soma((n) => n.comissao_apurada))}</Td>
            <Td num className="text-emerald-700">{brl(soma((n) => n.comissao_recebida))}</Td>
            <Td num>{brl(soma((n) => n.saldo_comissao))}</Td>
            <Td colSpan={3} />
          </tr>
        </tfoot>
      </Tabela>
    </Pagina>
  );
}
