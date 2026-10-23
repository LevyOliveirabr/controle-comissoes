import Link from "next/link";
import { Mensagens } from "@/components/mensagens";
import { Badge, BotaoLink, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, pct } from "@/lib/formato";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function RepresentadasPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const r = await obterResultado();
  const aReceber = (id: string) => r.matriz.totais.por_representada[id] ?? 0;

  return (
    <Pagina titulo="Representadas" descricao="Percentual padrão, base de cálculo, ciclo de apuração e pagamento e exigências da NFS-e de cada fábrica." acoes={<BotaoLink href="/representadas/nova">Nova representada</BotaoLink>}>
      <Mensagens sp={sp} />
      <Tabela>
        <thead>
          <tr>
            <Th>Representada</Th>
            <Th>CNPJ</Th>
            <Th num>% padrão</Th>
            <Th>Base</Th>
            <Th>Modo</Th>
            <Th num>Dias até apuração</Th>
            <Th num>Prazo pgto</Th>
            <Th>Regras</Th>
            <Th num>A receber</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {r.dados.representadas.map((x) => (
            <tr key={x.id} className={x.ativa ? "" : "text-slate-400"}>
              <Td className="font-medium">
                <Link href={`/representadas/${x.id}`} className="text-sky-700 hover:underline">{x.nome}</Link>
                {!x.ativa && <Badge>inativa</Badge>}
              </Td>
              <Td>{x.cnpj ?? "—"}</Td>
              <Td num>{pct(x.pct_padrao)}</Td>
              <Td>{x.base_calculo === "valor_produtos" ? "Produtos" : "Total da NF"}</Td>
              <Td>{x.modo_controle === "simplificado" ? <Badge tom="amarelo">Simplificado</Badge> : <Badge tom="azul">Completo</Badge>}</Td>
              <Td num>{x.dias_ate_apuracao}</Td>
              <Td num>{x.prazo_pagamento_dias}</Td>
              <Td className="space-x-1">
                {!x.envia_relatorio && <Badge>sem relatório</Badge>}
                {x.regra_liberacao === "por_parcela" && <Badge tom="roxo">por parcela</Badge>}
                {x.po_comissao && <Badge tom="verde">PO</Badge>}
              </Td>
              <Td num className="font-semibold">{brl(aReceber(x.id))}</Td>
              <Td><Link href={`/clientes?rep=${x.id}`} className="text-xs text-sky-700 hover:underline">clientes</Link></Td>
            </tr>
          ))}
        </tbody>
      </Tabela>
    </Pagina>
  );
}
