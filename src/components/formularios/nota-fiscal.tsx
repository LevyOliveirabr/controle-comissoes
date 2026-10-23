import { salvarNf } from "@/lib/acoes/notas";
import type { Cliente, NfVenda, Pedido, Representada } from "@/lib/motor";
import { Botao, BotaoLink, Campo, Card, Checkbox, Grade, Input, TextArea } from "../ui";
import { SelecaoRepCliente } from "./selecao-rep-cliente";

export function FormNotaFiscal({
  nf,
  representadas,
  clientes,
  pedidos,
  pedidoPadrao,
}: {
  nf?: NfVenda;
  representadas: Representada[];
  clientes: Cliente[];
  pedidos: Pedido[];
  pedidoPadrao?: Pedido | null;
}) {
  const nova = !nf;
  return (
    <form action={salvarNf} className="space-y-6">
      {nf && <input type="hidden" name="id" value={nf.id} />}
      <Card titulo="Nota fiscal de venda" rodape="A base da comissão segue a configuração da representada (valor total da NF ou valor dos produtos). O % manual, se preenchido, vale só nesta nota.">
        <Grade colunas={3}>
          <SelecaoRepCliente
            representadas={representadas}
            clientes={clientes}
            pedidos={pedidos}
            representadaId={nf?.representada_id ?? pedidoPadrao?.representada_id}
            clienteId={nf?.cliente_id ?? pedidoPadrao?.cliente_id}
            pedidoId={nf?.pedido_id ?? pedidoPadrao?.id}
          />
          <Campo rotulo="Número da NF">
            <Input name="numero" required defaultValue={nf?.numero ?? ""} />
          </Campo>
          <Campo rotulo="Série">
            <Input name="serie" defaultValue={nf?.serie ?? "1"} />
          </Campo>
          <Campo rotulo="Data de emissão">
            <Input name="data_emissao" type="date" required defaultValue={nf?.data_emissao ?? ""} />
          </Campo>
          <Campo rotulo="Chave de acesso (44 dígitos)" className="md:col-span-2">
            <Input name="chave_acesso" inputMode="numeric" pattern="[0-9 ]*" defaultValue={nf?.chave_acesso ?? ""} placeholder="Opcional" />
          </Campo>
          <Campo rotulo="% de comissão manual" ajuda="Em percentual. Vazio = % do pedido ou da representada.">
            <Input name="pct_override" type="number" step="0.0001" min="0" max="100" defaultValue={nf?.pct_override != null ? +(nf.pct_override * 100).toFixed(6) : ""} />
          </Campo>
          <Campo rotulo="Valor dos produtos (R$)">
            <Input name="valor_produtos" type="number" step="0.01" min="0" defaultValue={nf?.valor_produtos ?? pedidoPadrao?.valor_total ?? ""} />
          </Campo>
          <Campo rotulo="Valor total da NF (R$)" ajuda="Com frete/impostos. É a base padrão da comissão.">
            <Input name="valor_total" type="number" step="0.01" min="0" required defaultValue={nf?.valor_total ?? pedidoPadrao?.valor_total ?? ""} />
          </Campo>
        </Grade>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Checkbox name="simulada" rotulo="Nota simulada" ajuda="Ainda não existe DANFE (ex.: Green SIM-0001). Substitua pelo número real quando emitida." defaultChecked={nf?.simulada ?? false} />
          <Checkbox name="venda_direta" rotulo="Venda direta (NF sem pedido)" ajuda="Confirma que esta NF não tem pedido, em representada de controle completo." defaultChecked={nf?.venda_direta ?? false} />
          <Checkbox name="ajustar_pedido" rotulo="Ajustar o valor do pedido ao valor desta NF (RN-04)" ajuda="Só para pedido sem itens. Guarda o valor original do pedido." />
          {nova && <Checkbox name="gerar_parcela_unica" rotulo="Gerar parcela única" ajuda="Cria 1 parcela com o valor total vencendo em N dias (abaixo)." defaultChecked />}
          {nova && (
            <Campo rotulo="Prazo da parcela única (dias)">
              <Input name="prazo_parcela_dias" type="number" min="0" step="1" defaultValue={30} />
            </Campo>
          )}
        </div>
        <div className="mt-4">
          <Campo rotulo="Observações">
            <TextArea name="observacoes" defaultValue={nf?.observacoes ?? ""} />
          </Campo>
        </div>
      </Card>
      <div className="flex items-center gap-2">
        <Botao>Salvar</Botao>
        <BotaoLink href={nf ? `/notas-fiscais/${nf.id}` : "/notas-fiscais"} variante="secundario">Cancelar</BotaoLink>
      </div>
    </form>
  );
}
