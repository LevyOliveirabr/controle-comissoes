"use server";

import { campos, esquemas, ErroValidacao, mensagemDeErroDb, redirecionarComErro, redirecionarComOk, revalidarTudo, transacao, validar, z } from "./util";

const esquemaNf = z.object({
  representada_id: esquemas.uuid,
  cliente_id: esquemas.uuid,
  pedido_id: esquemas.uuidOpcional,
  numero: esquemas.texto,
  serie: esquemas.texto,
  chave_acesso: z.string().regex(/^\d{44}$/, "a chave de acesso tem 44 dígitos").nullable(),
  data_emissao: esquemas.dataIso,
  valor_produtos: esquemas.dinheiro,
  valor_total: esquemas.dinheiro,
  pct_override: esquemas.pctOpcional,
  simulada: z.boolean(),
  venda_direta: z.boolean(),
  observacoes: esquemas.textoOpcional,
});

export async function salvarNf(fd: FormData) {
  const id = campos.texto(fd, "id");
  const voltar = id ? `/notas-fiscais/${id}` : "/notas-fiscais/nova";
  const ajustarPedido = campos.bool(fd, "ajustar_pedido");
  const gerarParcela = campos.bool(fd, "gerar_parcela_unica");
  let destino = "/notas-fiscais";
  try {
    const chave = campos.texto(fd, "chave_acesso")?.replace(/\D/g, "") ?? null;
    const d = validar(esquemaNf, {
      representada_id: campos.texto(fd, "representada_id"),
      cliente_id: campos.texto(fd, "cliente_id"),
      pedido_id: campos.texto(fd, "pedido_id"),
      numero: campos.texto(fd, "numero"),
      serie: campos.texto(fd, "serie") ?? "1",
      chave_acesso: chave,
      data_emissao: campos.data(fd, "data_emissao"),
      valor_produtos: campos.numero(fd, "valor_produtos") ?? campos.numero(fd, "valor_total"),
      valor_total: campos.numero(fd, "valor_total"),
      pct_override: campos.pct(fd, "pct_override"),
      simulada: campos.bool(fd, "simulada"),
      venda_direta: campos.bool(fd, "venda_direta"),
      observacoes: campos.texto(fd, "observacoes"),
    });
    destino = await transacao(async (tx) => {
      let nfId = id;
      if (nfId) {
        await tx`update nf_venda set ${tx(d)} where id = ${nfId}`;
      } else {
        const [{ id: novo }] = await tx`insert into nf_venda ${tx(d)} returning id`;
        nfId = novo as string;
      }
      // RN-04: pedido sem itens cujo valor difere da NF — ajusta o pedido guardando o original.
      if (ajustarPedido && d.pedido_id) {
        await tx`update pedido set valor_original = coalesce(valor_original, valor_total), valor_total = ${d.valor_total}
                 where id = ${d.pedido_id} and usa_itens = false and valor_total <> ${d.valor_total}`;
      }
      if (gerarParcela) {
        const [{ n }] = await tx`select count(*)::int as n from parcela where nf_venda_id = ${nfId}`;
        if (n === 0) {
          const prazo = campos.numero(fd, "prazo_parcela_dias") ?? 30;
          await tx`insert into parcela (nf_venda_id, numero, vencimento_documento, valor)
                   values (${nfId}, 1, (${d.data_emissao}::date + ${prazo}::int), ${d.valor_total})`;
        }
      }
      return `/notas-fiscais/${nfId}`;
    });
  } catch (e) {
    redirecionarComErro(voltar, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(destino);
}

export async function excluirNf(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  try {
    await transacao((tx) => tx`delete from nf_venda where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/notas-fiscais/${id}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk("/notas-fiscais", "Nota fiscal excluída.");
}

// --- Itens faturados -------------------------------------------------------

const esquemaItem = z.object({
  nf_venda_id: esquemas.uuid,
  familia: esquemas.texto,
  codigo: esquemas.textoOpcional,
  qtd: esquemas.dinheiro,
  valor_total: esquemas.dinheiro,
  observacoes: esquemas.textoOpcional,
});

export async function adicionarItemNf(fd: FormData) {
  const nfId = campos.texto(fd, "nf_venda_id")!;
  try {
    const d = validar(esquemaItem, {
      nf_venda_id: nfId,
      familia: campos.texto(fd, "familia"),
      codigo: campos.texto(fd, "codigo"),
      qtd: campos.numero(fd, "qtd"),
      valor_total: campos.numero(fd, "valor_total"),
      observacoes: campos.texto(fd, "observacoes"),
    });
    await transacao((tx) => tx`insert into nf_item ${tx(d)}`);
  } catch (e) {
    redirecionarComErro(`/notas-fiscais/${nfId}`, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/notas-fiscais/${nfId}`, "Item adicionado.");
}

export async function excluirItemNf(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  const nfId = campos.texto(fd, "voltar")!;
  try {
    await transacao((tx) => tx`delete from nf_item where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/notas-fiscais/${nfId}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/notas-fiscais/${nfId}`, "Item removido.");
}

// --- Parcelas --------------------------------------------------------------

const esquemaParcela = z.object({
  nf_venda_id: esquemas.uuid,
  numero: z.number().int().min(1),
  vencimento_documento: esquemas.dataIso,
  vencimento_boleto: esquemas.dataIsoOpcional,
  valor: esquemas.dinheiro,
  cliente_pagou: z.boolean(),
  data_pagamento: esquemas.dataIsoOpcional,
  observacoes: esquemas.textoOpcional,
});

export async function salvarParcela(fd: FormData) {
  const id = campos.texto(fd, "id");
  const nfId = campos.texto(fd, "nf_venda_id")!;
  try {
    const d = validar(esquemaParcela, {
      nf_venda_id: nfId,
      numero: campos.numero(fd, "numero"),
      vencimento_documento: campos.data(fd, "vencimento_documento"),
      vencimento_boleto: campos.data(fd, "vencimento_boleto"),
      valor: campos.numero(fd, "valor"),
      cliente_pagou: campos.bool(fd, "cliente_pagou"),
      data_pagamento: campos.data(fd, "data_pagamento"),
      observacoes: campos.texto(fd, "observacoes"),
    });
    await transacao(async (tx) => {
      if (id) await tx`update parcela set ${tx(d)} where id = ${id}`;
      else await tx`insert into parcela ${tx(d)}`;
    });
  } catch (e) {
    redirecionarComErro(`/notas-fiscais/${nfId}`, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/notas-fiscais/${nfId}`, "Parcela salva.");
}

export async function marcarParcelaPaga(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  const nfId = campos.texto(fd, "nf_venda_id")!;
  const paga = campos.bool(fd, "paga");
  try {
    await transacao(
      (tx) => tx`update parcela set cliente_pagou = ${paga}, data_pagamento = ${paga ? (campos.data(fd, "data_pagamento") ?? new Date().toISOString().slice(0, 10)) : null} where id = ${id}`,
    );
  } catch (e) {
    redirecionarComErro(`/notas-fiscais/${nfId}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/notas-fiscais/${nfId}`, paga ? "Parcela marcada como paga." : "Pagamento desfeito.");
}

export async function excluirParcela(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  const nfId = campos.texto(fd, "voltar")!;
  try {
    await transacao((tx) => tx`delete from parcela where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/notas-fiscais/${nfId}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/notas-fiscais/${nfId}`, "Parcela removida.");
}
