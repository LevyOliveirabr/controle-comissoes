import { Badge, Pagina, Tabela, Td, Th } from "@/components/ui";
import { sql } from "@/lib/db";

const ROTULO_TABELA: Record<string, string> = {
  representada: "Representada",
  cliente: "Cliente",
  pedido: "Pedido",
  pedido_item: "Item do pedido",
  nf_venda: "NF de venda",
  nf_item: "Item faturado",
  parcela: "Parcela",
  nfse_comissao: "NFS-e",
  apuracao: "Apuração",
  parametro: "Parâmetro",
};

function resumo(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
  const ignorar = new Set(["id", "criado_em", "atualizado_em"]);
  const registro = depois ?? antes ?? {};
  const nome = (registro.numero ?? registro.nome ?? registro.referencia ?? registro.chave ?? "") as string;
  if (antes && depois) {
    const mudancas = Object.keys(depois)
      .filter((k) => !ignorar.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
      .map((k) => `${k}: ${fmt(antes[k])} → ${fmt(depois[k])}`);
    return { nome, detalhe: mudancas.join("; ") || "sem alterações" };
  }
  const campos = Object.entries(registro)
    .filter(([k, v]) => !ignorar.has(k) && v != null && !/_id$/.test(k))
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${fmt(v)}`);
  return { nome, detalhe: campos.join("; ") };
}
const fmt = (v: unknown) => (v == null ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default async function AuditoriaPage() {
  const linhas = (await sql()`select id, tabela, registro_id, acao, antes, depois, usuario, to_char(em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as quando from auditoria order by em desc, id desc limit 300`) as unknown as {
    id: number;
    tabela: string;
    registro_id: string | null;
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
    usuario: string | null;
    quando: string;
  }[];

  return (
    <Pagina titulo="Auditoria" descricao="Últimas 300 alterações registradas pelo banco (quem, quando, o quê).">
      <Tabela>
        <thead>
          <tr>
            <Th>Quando</Th>
            <Th>Ação</Th>
            <Th>Tabela</Th>
            <Th>Registro</Th>
            <Th>Detalhe</Th>
            <Th>Usuário</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const { nome, detalhe } = resumo(l.antes, l.depois);
            return (
              <tr key={l.id}>
                <Td className="whitespace-nowrap">{l.quando}</Td>
                <Td><Badge tom={l.acao === "insert" ? "verde" : l.acao === "delete" ? "vermelho" : "azul"}>{l.acao === "insert" ? "inclusão" : l.acao === "delete" ? "exclusão" : "alteração"}</Badge></Td>
                <Td>{ROTULO_TABELA[l.tabela] ?? l.tabela}</Td>
                <Td className="font-medium">{nome}</Td>
                <Td className="max-w-2xl text-xs text-slate-600">{detalhe}</Td>
                <Td>{l.usuario ?? "—"}</Td>
              </tr>
            );
          })}
          {linhas.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-center text-slate-500">Nenhum registro.</Td>
            </tr>
          )}
        </tbody>
      </Tabela>
    </Pagina>
  );
}
