"use server";

import { campos, esquemas, ErroValidacao, mensagemDeErroDb, redirecionarComErro, redirecionarComOk, revalidarTudo, transacao, validar, z } from "./util";

const esquemaPedido = z.object({
  representada_id: esquemas.uuid,
  cliente_id: esquemas.uuid,
  numero: esquemas.texto,
  referencia: esquemas.textoOpcional,
  data_pedido: esquemas.dataIsoOpcional,
  entrega_prevista: esquemas.textoOpcional,
  data_prevista_faturamento: esquemas.dataIsoOpcional,
  valor_total: esquemas.dinheiro,
  valor_original: esquemas.dinheiroOpcional,
  pct_override: esquemas.pctOpcional,
  situacao_comercial: z.enum(["firme", "previsao", "convertido", "cancelado"]),
  usa_itens: z.boolean(),
  observacoes: esquemas.textoOpcional,
});

export async function salvarPedido(fd: FormData) {
  const id = campos.texto(fd, "id");
  const voltar = id ? `/pedidos/${id}` : "/pedidos/novo";
  let destino = "/pedidos";
  try {
    const d = validar(esquemaPedido, {
      representada_id: campos.texto(fd, "representada_id"),
      cliente_id: campos.texto(fd, "cliente_id"),
      numero: campos.texto(fd, "numero"),
      referencia: campos.texto(fd, "referencia"),
      data_pedido: campos.data(fd, "data_pedido"),
      entrega_prevista: campos.texto(fd, "entrega_prevista"),
      data_prevista_faturamento: campos.data(fd, "data_prevista_faturamento"),
      valor_total: campos.numero(fd, "valor_total"),
      valor_original: campos.numero(fd, "valor_original"),
      pct_override: campos.pct(fd, "pct_override"),
      situacao_comercial: campos.texto(fd, "situacao_comercial"),
      usa_itens: campos.bool(fd, "usa_itens"),
      observacoes: campos.texto(fd, "observacoes"),
    });
    destino = await transacao(async (tx) => {
      if (id) {
        await tx`update pedido set ${tx(d)} where id = ${id}`;
        return `/pedidos/${id}`;
      }
      const [{ id: novo }] = await tx`insert into pedido ${tx(d)} returning id`;
      return `/pedidos/${novo}`;
    });
  } catch (e) {
    redirecionarComErro(voltar, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(destino);
}

export async function excluirPedido(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  try {
    await transacao((tx) => tx`delete from pedido where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/pedidos/${id}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk("/pedidos", "Pedido excluído.");
}

/** Converte um pedido de previsão em firme (RN-05) — mantém o histórico no campo observações. */
export async function converterPrevisao(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  try {
    await transacao(
      (tx) => tx`update pedido set situacao_comercial = 'firme',
        observacoes = concat_ws(E'\n', observacoes, 'Convertido de previsão em firme em ' || to_char(now(), 'DD/MM/YYYY'))
        where id = ${id} and situacao_comercial = 'previsao'`,
    );
  } catch (e) {
    redirecionarComErro(`/pedidos/${id}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/pedidos/${id}`, "Pedido convertido em firme.");
}

const esquemaItem = z.object({
  pedido_id: esquemas.uuid,
  item: z.number().int().nullable(),
  familia: esquemas.texto,
  codigo: esquemas.textoOpcional,
  descricao: esquemas.textoOpcional,
  qtd: esquemas.dinheiro,
  valor_unit: esquemas.dinheiro,
});

export async function adicionarItemPedido(fd: FormData) {
  const pedidoId = campos.texto(fd, "pedido_id")!;
  try {
    const d = validar(esquemaItem, {
      pedido_id: pedidoId,
      item: campos.numero(fd, "item"),
      familia: campos.texto(fd, "familia"),
      codigo: campos.texto(fd, "codigo"),
      descricao: campos.texto(fd, "descricao"),
      qtd: campos.numero(fd, "qtd"),
      valor_unit: campos.numero(fd, "valor_unit"),
    });
    await transacao(async (tx) => {
      await tx`insert into pedido_item ${tx(d)}`;
      await tx`update pedido set usa_itens = true where id = ${pedidoId}`;
    });
  } catch (e) {
    redirecionarComErro(`/pedidos/${pedidoId}`, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/pedidos/${pedidoId}`, "Item adicionado.");
}

export async function excluirItemPedido(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  const pedidoId = campos.texto(fd, "voltar")!;
  try {
    await transacao(async (tx) => {
      await tx`delete from pedido_item where id = ${id}`;
      await tx`update pedido set usa_itens = exists(select 1 from pedido_item where pedido_id = ${pedidoId}) where id = ${pedidoId}`;
    });
  } catch (e) {
    redirecionarComErro(`/pedidos/${pedidoId}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/pedidos/${pedidoId}`, "Item removido.");
}
