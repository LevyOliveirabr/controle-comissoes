"use client";

import { useState } from "react";
import type { Cliente, Pedido, Representada } from "@/lib/motor/tipos";
import { inputCls } from "../ui";

/**
 * Selects dependentes: representada → cliente → (opcional) pedido.
 * Sem pedidos informados, mostra só os dois primeiros.
 */
export function SelecaoRepCliente({
  representadas,
  clientes,
  pedidos,
  representadaId,
  clienteId,
  pedidoId,
}: {
  representadas: Representada[];
  clientes: Cliente[];
  pedidos?: Pedido[];
  representadaId?: string | null;
  clienteId?: string | null;
  pedidoId?: string | null;
}) {
  const pedidoInicial = pedidos?.find((p) => p.id === pedidoId);
  const clienteInicial = clienteId ?? pedidoInicial?.cliente_id ?? "";
  const [rep, setRep] = useState(representadaId ?? pedidoInicial?.representada_id ?? clientes.find((c) => c.id === clienteInicial)?.representada_id ?? "");
  const [cli, setCli] = useState(clienteInicial);
  const [ped, setPed] = useState(pedidoId ?? "");
  const clientesVisiveis = rep ? clientes.filter((c) => c.representada_id === rep) : [];
  const pedidosVisiveis = pedidos && cli ? pedidos.filter((p) => p.cliente_id === cli && p.situacao_comercial !== "cancelado") : [];
  const representada = representadas.find((r) => r.id === rep);
  return (
    <>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Representada</span>
        <select
          name="representada_id"
          required
          value={rep}
          onChange={(e) => {
            setRep(e.target.value);
            setCli("");
            setPed("");
          }}
          className={inputCls}
        >
          <option value="" disabled>Selecione…</option>
          {representadas.map((r) => (
            <option key={r.id} value={r.id}>{r.nome}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Cliente</span>
        <select
          name="cliente_id"
          required
          value={cli}
          onChange={(e) => {
            setCli(e.target.value);
            setPed("");
          }}
          className={inputCls}
          disabled={!rep}
        >
          <option value="" disabled>{rep ? "Selecione…" : "Escolha a representada primeiro"}</option>
          {clientesVisiveis.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </label>
      {pedidos && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Pedido</span>
          <select name="pedido_id" value={ped} onChange={(e) => setPed(e.target.value)} className={inputCls} disabled={!cli}>
            <option value="">{representada?.modo_controle === "simplificado" ? "Sem pedido (controle simplificado)" : "Sem pedido — venda direta"}</option>
            {pedidosVisiveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero} — {p.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            {representada?.modo_controle === "simplificado"
              ? "Representada em modo simplificado: a NF pode ficar sem pedido."
              : "Fora do modo simplificado, NF sem pedido exige marcar 'venda direta' abaixo."}
          </span>
        </label>
      )}
    </>
  );
}
