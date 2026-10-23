import { FiltroGlobal } from "@/components/filtro-global";
import { LinkAgenda } from "@/components/link-agenda";
import { Badge, Card, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, data, mesLongo } from "@/lib/formato";
import type { ItemAgenda } from "@/lib/motor";
import { filtroDaBusca, obterResultado, type ParametrosBusca } from "@/lib/resultado";

const TOM: Record<ItemAgenda["origem"], "azul" | "amarelo" | "roxo" | "cinza" | "verde"> = {
  "NF de representacao emitida": "azul",
  "Faturada - aguardando apuracao": "amarelo",
  "Autorizada - falta emitir sua NF": "roxo",
  "Pedido firme a faturar": "cinza",
  "Pedido em previsao": "verde",
};

export default async function AgendaPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);

  const grupos = new Map<string, ItemAgenda[]>();
  for (const i of r.agenda) {
    const chave = i.vencido ? "vencido" : (i.mes ?? "sem-data");
    grupos.set(chave, [...(grupos.get(chave) ?? []), i]);
  }
  const ordem = [...grupos.keys()].sort((a, b) => (a === "vencido" ? -1 : b === "vencido" ? 1 : a === "sem-data" ? 1 : b === "sem-data" ? -1 : a.localeCompare(b)));
  const totalFirme = r.agenda.filter((i) => i.confianca === "Firme").reduce((s, i) => s + i.valor, 0);

  return (
    <Pagina titulo="Agenda de recebimentos" descricao="Toda comissão em aberto com a data em que deve cair, em quatro origens: NFS-e emitida, NF faturada aguardando apuração, apuração autorizada sem NFS-e e pedido firme a faturar.">
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />
      <div className="flex flex-wrap gap-2 text-sm text-slate-600">
        <span>Total firme em aberto: <strong className="tabular-nums text-slate-900">{brl(totalFirme)}</strong></span>
        <span>·</span>
        <span>{r.agenda.length} itens</span>
      </div>
      {ordem.map((chave) => {
        const itens = grupos.get(chave)!;
        const titulo = chave === "vencido" ? "Vencido — já deveria ter caído" : chave === "sem-data" ? "Sem data definida" : mesLongo(chave);
        const soma = itens.filter((i) => i.confianca === "Firme").reduce((s, i) => s + i.valor, 0);
        return (
          <Card key={chave} titulo={<span className={chave === "vencido" ? "text-rose-700" : ""}>{titulo} <span className="ml-2 font-normal text-slate-500">firme {brl(soma)}</span></span>}>
            <Tabela className="border-0 shadow-none">
              <thead>
                <tr>
                  <Th>Data esperada</Th>
                  <Th>Origem</Th>
                  <Th>Representada</Th>
                  <Th>Cliente</Th>
                  <Th>Documento</Th>
                  <Th>Confiança</Th>
                  <Th num>Comissão</Th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i, idx) => (
                  <tr key={idx} className={i.confianca === "Previsao" ? "text-slate-500" : ""}>
                    <Td>{i.data_esperada ? data(i.data_esperada) : "Sem data"}</Td>
                    <Td><Badge tom={TOM[i.origem]}>{i.origem}</Badge></Td>
                    <Td>{i.representada}</Td>
                    <Td>{i.cliente}</Td>
                    <Td><LinkAgenda ref_={i.referencia} texto={i.descricao} /></Td>
                    <Td>{i.confianca === "Firme" ? <Badge tom="verde">Firme</Badge> : <Badge tom="roxo">Previsão</Badge>}</Td>
                    <Td num className="font-semibold">{brl(i.valor)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </Card>
        );
      })}
    </Pagina>
  );
}
