import Link from "next/link";
import { BadgeSituacaoApuracao } from "@/components/badges";
import { FiltroGlobal } from "@/components/filtro-global";
import { Mensagens } from "@/components/mensagens";
import { Badge, BotaoLink, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, data, diasRelativos } from "@/lib/formato";
import { diferencaDias } from "@/lib/motor";
import { filtroDaBusca, obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function NfsePage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const nfses = r.nfses.filter((n) => n.no_filtro).sort((a, b) => b.data_emissao.localeCompare(a.data_emissao));
  const emAberto = nfses.filter((n) => n.status !== "Recebida");
  const soma = (lista: typeof nfses) => lista.reduce((s, n) => s + n.valor, 0);
  const pendentes = r.apuracoes.filter((a) => a.no_filtro && a.situacao === "NF de comissao nao emitida");

  return (
    <Pagina titulo="NFS-e de comissão" descricao="Suas notas de serviço contra as representadas: previsão de crédito, status e checklist de envio." acoes={<BotaoLink href="/nfse/nova">Nova NFS-e</BotaoLink>}>
      <Mensagens sp={sp} />
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <span>Em aberto: <strong className="tabular-nums text-slate-900">{brl(soma(emAberto))}</strong> ({emAberto.length})</span>
        <span>Recebidas: <strong className="tabular-nums text-emerald-700">{brl(soma(nfses.filter((n) => n.status === "Recebida")))}</strong></span>
        {pendentes.length > 0 && (
          <span className="text-violet-700">
            Autorizadas sem NFS-e: <strong className="tabular-nums">{brl(pendentes.reduce((s, a) => s + a.valor_apurado, 0))}</strong> ({pendentes.length} apurações) — <Link href="/nfse/nova" className="underline">emitir</Link>
          </span>
        )}
      </div>
      <Tabela>
        <thead>
          <tr>
            <Th>Representada</Th>
            <Th>NFS-e</Th>
            <Th>Referência</Th>
            <Th>Emissão</Th>
            <Th>Enviada</Th>
            <Th num>Valor</Th>
            <Th num>Apurações</Th>
            <Th>Previsão de crédito</Th>
            <Th>Crédito</Th>
            <Th>Status</Th>
            <Th>Checklist</Th>
          </tr>
        </thead>
        <tbody>
          {nfses.map((n) => {
            const atraso = n.status !== "Recebida" ? diferencaDias(r.hoje, n.previsao_credito) : 0;
            return (
              <tr key={n.id}>
                <Td>{n.representada.nome}</Td>
                <Td className="font-medium"><Link href={`/nfse/${n.id}`} className="text-sky-700 hover:underline">{n.numero ?? <span className="italic text-slate-500">sem número</span>}</Link></Td>
                <Td>{n.referencia ?? "—"}<div className="text-xs text-slate-500">{n.clientes.map((c) => c.nome).join(", ")}</div></Td>
                <Td>{data(n.data_emissao)}</Td>
                <Td>{data(n.enviada_em)}</Td>
                <Td num className="font-semibold">{brl(n.valor)}</Td>
                <Td num className={n.alerta_valor ? "text-amber-700" : ""}>{brl(n.soma_apuracoes)}{n.alerta_valor && <span title="soma das apurações difere do valor da NFS-e"> ⚠</span>}</Td>
                <Td>
                  {data(n.previsao_credito)}
                  {n.status !== "Recebida" && <div className={`text-xs ${atraso > 0 ? "text-rose-700" : "text-slate-500"}`}>{atraso > 0 ? `atrasada ${atraso} dia${atraso === 1 ? "" : "s"}` : diasRelativos(-atraso)}</div>}
                </Td>
                <Td>{n.data_credito ? <>{data(n.data_credito)}{n.data_credito_aproximada && <span className="text-xs text-slate-500"> (aprox.)</span>}</> : "—"}</Td>
                <Td><BadgeSituacaoApuracao situacao={n.status} /></Td>
                <Td>{n.checklist.completo ? <Badge tom="verde">completo</Badge> : <Badge tom="amarelo">{[!n.checklist.po.ok && "PO", !n.checklist.descricao.ok && "descrição", !n.checklist.email.ok && "e-mail"].filter(Boolean).join(", ")}</Badge>}</Td>
              </tr>
            );
          })}
          {nfses.length === 0 && (
            <tr>
              <Td colSpan={11} className="text-center text-slate-500">Nenhuma NFS-e.</Td>
            </tr>
          )}
        </tbody>
      </Tabela>
    </Pagina>
  );
}
