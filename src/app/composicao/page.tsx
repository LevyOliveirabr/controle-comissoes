import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Pagina, Tabela, Td, Th } from "@/components/ui";
import { explicacao } from "@/lib/explicacoes";
import { brl, data } from "@/lib/formato";
import { composicao, type TipoItemComposicao } from "@/lib/motor";
import { filtroDaBusca, obterResultado, queryDoFiltro, type ParametrosBusca } from "@/lib/resultado";

const ROTULO_TIPO: Record<TipoItemComposicao, { texto: string; tom: "cinza" | "verde" | "amarelo" | "vermelho" | "azul" | "roxo" }> = {
  nf: { texto: "NF de venda", tom: "amarelo" },
  pedido: { texto: "Pedido", tom: "cinza" },
  nfse: { texto: "NFS-e", tom: "azul" },
  apuracao: { texto: "Apuração", tom: "roxo" },
  parcela: { texto: "Parcela", tom: "cinza" },
  ajuste: { texto: "Ajuste", tom: "vermelho" },
};

/** Só aceita caminhos internos como destino do "voltar". */
function voltarSeguro(v: string | string[] | undefined, padrao: string) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") ? s : padrao;
}

export default async function ComposicaoPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const chave = Array.isArray(sp.o) ? sp.o[0] : sp.o;
  if (!chave) notFound();
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const c = composicao(r, chave);
  if (!c) notFound();
  const e = explicacao(c.explicacao);
  const q = queryDoFiltro(filtro);
  const voltar = voltarSeguro(sp.v, chave.startsWith("consolidado") ? `/consolidado${q}` : chave.startsWith("faturamento") ? `/faturamento${q}` : `/${q}`);
  const filtroTexto = [
    filtro.representada_id ? r.representadas.get(filtro.representada_id)?.nome : null,
    filtro.cliente_id ? r.clientes.get(filtro.cliente_id)?.nome : null,
  ].filter(Boolean);
  const tipos = [...new Set(c.itens.map((i) => i.tipo))];

  return (
    <Pagina
      titulo={c.titulo}
      descricao={`Composição do valor: ${c.itens.length} ${c.itens.length === 1 ? "registro" : "registros"}${filtroTexto.length ? ` · filtro: ${filtroTexto.join(" / ")}` : ""} · posição em ${data(r.hoje)}`}
      acoes={
        <Link href={voltar} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          ← Voltar
        </Link>
      }
    >
      {e && (
        <Card titulo="Como este número é calculado">
          <p className="text-sm text-slate-800">{e.curta}</p>
          {e.longa && <p className="mt-2 text-sm text-slate-600">{e.longa}</p>}
          <p className="mt-3 text-xs text-slate-500">
            Em dúvida com algum termo? Veja <Link href="/ajuda" className="text-sky-700 hover:underline">Entenda os números</Link>.
          </p>
        </Card>
      )}

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
        <div className="text-xs font-medium uppercase tracking-wide text-sky-800">Total destes registros</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums text-sky-900">{brl(c.total)}</div>
        <div className="mt-1 text-xs text-sky-800">
          É exatamente o valor que você clicou. Cada linha abaixo leva ao registro de origem.
          {tipos.length > 0 && <> Tipos: {tipos.map((t) => ROTULO_TIPO[t].texto.toLowerCase()).join(", ")}.</>}
        </div>
      </div>

      <Tabela>
        <thead>
          <tr>
            <Th>Tipo</Th>
            <Th>Documento</Th>
            <Th>Representada</Th>
            <Th>Cliente</Th>
            <Th>{c.rotulo_data}</Th>
            <Th>Como chegou no valor</Th>
            <Th num>Valor</Th>
          </tr>
        </thead>
        <tbody>
          {c.itens.map((i, idx) => (
            <tr key={`${i.tipo}-${i.id ?? idx}-${idx}`} className={i.valor < 0 ? "bg-rose-50/40" : ""}>
              <Td><Badge tom={ROTULO_TIPO[i.tipo].tom}>{ROTULO_TIPO[i.tipo].texto}</Badge></Td>
              <Td className="font-medium">{i.href ? <Link href={i.href} className="text-sky-700 hover:underline">{i.documento}</Link> : i.documento}</Td>
              <Td>{i.representada}</Td>
              <Td>{i.cliente}</Td>
              <Td className="whitespace-nowrap">{data(i.data)}</Td>
              <Td className="text-xs text-slate-500">{i.detalhe ?? "—"}</Td>
              <Td num className={`font-semibold ${i.valor < 0 ? "text-rose-700" : ""}`}>{brl(i.valor)}</Td>
            </tr>
          ))}
          {c.itens.length === 0 && (
            <tr>
              <Td colSpan={7} className="text-center text-slate-500">Nenhum registro compõe este valor{filtroTexto.length ? " no filtro atual" : ""}.</Td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <Td colSpan={6}>Total ({c.itens.length} {c.itens.length === 1 ? "registro" : "registros"})</Td>
            <Td num>{brl(c.total)}</Td>
          </tr>
        </tfoot>
      </Tabela>
    </Pagina>
  );
}
