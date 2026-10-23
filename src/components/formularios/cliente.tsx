import { salvarCliente } from "@/lib/acoes/cadastros";
import type { Cliente, Representada } from "@/lib/motor";
import { Botao, BotaoLink, Campo, Card, Grade, Input, Select, TextArea } from "../ui";

export function FormCliente({ c, representadas, representadaPadrao }: { c?: Cliente; representadas: Representada[]; representadaPadrao?: string | null }) {
  return (
    <form action={salvarCliente} className="space-y-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Card titulo="Dados do cliente" rodape="Um cliente pertence a uma representada. Se o mesmo CNPJ compra de duas fábricas, cadastre-o duas vezes (uma por representada), como na planilha.">
        <Grade colunas={3}>
          <Campo rotulo="Representada">
            <Select name="representada_id" required defaultValue={c?.representada_id ?? representadaPadrao ?? ""}>
              <option value="" disabled>Selecione…</option>
              {representadas.map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Nome" className="md:col-span-2">
            <Input name="nome" required defaultValue={c?.nome ?? ""} />
          </Campo>
          <Campo rotulo="CNPJ">
            <Input name="cnpj" defaultValue={c?.cnpj ?? ""} />
          </Campo>
          <Campo rotulo="Código na representada" ajuda="Ex.: código do cliente na Signify.">
            <Input name="codigo_externo" defaultValue={c?.codigo_externo ?? ""} />
          </Campo>
        </Grade>
        <div className="mt-4">
          <Campo rotulo="Observações">
            <TextArea name="observacoes" defaultValue={c?.observacoes ?? ""} />
          </Campo>
        </div>
      </Card>
      <div className="flex items-center gap-2">
        <Botao>Salvar</Botao>
        <BotaoLink href={c ? `/clientes/${c.id}` : "/clientes"} variante="secundario">Cancelar</BotaoLink>
      </div>
    </form>
  );
}
