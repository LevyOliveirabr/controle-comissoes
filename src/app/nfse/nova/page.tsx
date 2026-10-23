import { FormNfse } from "@/components/formularios/nfse";
import { Mensagens } from "@/components/mensagens";
import { Alerta, Pagina } from "@/components/ui";
import { brl } from "@/lib/formato";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function NovaNfsePage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const r = await obterResultado();
  const repPadrao = typeof sp.rep === "string" ? sp.rep : null;
  const pendentes = r.apuracoes.filter((a) => a.situacao === "NF de comissao nao emitida" && (!repPadrao || a.representada_id === repPadrao));
  return (
    <Pagina titulo="Nova NFS-e de comissão" descricao="Cadastre a nota e, depois de salvar, marque as apurações que ela cobre.">
      <Mensagens sp={sp} />
      {pendentes.length > 0 && (
        <Alerta tom="info" titulo={`${pendentes.length} apuração(ões) autorizada(s) sem NFS-e: ${brl(pendentes.reduce((s, a) => s + a.valor_apurado, 0))}`}>
          {Object.entries(Object.groupBy(pendentes, (a) => a.representada.nome)).map(([rep, lista]) => (
            <div key={rep}>{rep}: {brl(lista!.reduce((s, a) => s + a.valor_apurado, 0))} ({lista!.map((a) => `NF ${a.nf.numero}`).join(", ")})</div>
          ))}
        </Alerta>
      )}
      <FormNfse representadas={r.dados.representadas.filter((x) => x.ativa)} representadaPadrao={repPadrao} />
    </Pagina>
  );
}
