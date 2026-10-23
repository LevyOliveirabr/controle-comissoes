"use client";

import { useState } from "react";
import { inputCls } from "../ui";

export interface NfOpcao {
  id: string;
  rotulo: string;
  representada_id: string;
  representada: string;
  base: number;
  pct: number;
  parcelas: { id: string; rotulo: string; valor: number }[];
}
export interface NfseOpcao {
  id: string;
  representada_id: string;
  rotulo: string;
}

/**
 * NF → parcela (opcional) → NFS-e (opcional, da mesma representada), com base
 * e % preenchidos automaticamente a partir da NF ou da parcela escolhida.
 */
export function SelecaoApuracao({
  nfs,
  nfses,
  nfId,
  parcelaId,
  nfseId,
  base,
  pct,
  valorApurado,
}: {
  nfs: NfOpcao[];
  nfses: NfseOpcao[];
  nfId?: string | null;
  parcelaId?: string | null;
  nfseId?: string | null;
  base?: number | null;
  pct?: number | null;
  valorApurado?: number | null;
}) {
  const [nf, setNf] = useState(nfId ?? "");
  const [parcela, setParcela] = useState(parcelaId ?? "");
  const [nfse, setNfse] = useState(nfseId ?? "");
  const nfSel = nfs.find((n) => n.id === nf);
  const [baseV, setBaseV] = useState<string>(base != null ? String(base) : nfSel ? String(nfSel.base) : "");
  const [pctV, setPctV] = useState<string>(pct != null ? String(+(pct * 100).toFixed(6)) : nfSel ? String(+(nfSel.pct * 100).toFixed(6)) : "");
  const nfsesVisiveis = nfSel ? nfses.filter((x) => x.representada_id === nfSel.representada_id) : [];
  const porRep = new Map<string, NfOpcao[]>();
  for (const n of nfs) porRep.set(n.representada, [...(porRep.get(n.representada) ?? []), n]);
  const apurado = baseV && pctV ? (Number(baseV) * Number(pctV)) / 100 : null;

  return (
    <>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block font-medium text-slate-700">NF de venda</span>
        <select
          name="nf_venda_id"
          required
          value={nf}
          onChange={(e) => {
            const n = nfs.find((x) => x.id === e.target.value);
            setNf(e.target.value);
            setParcela("");
            setNfse("");
            if (n) {
              setBaseV(String(n.base));
              setPctV(String(+(n.pct * 100).toFixed(6)));
            }
          }}
          className={inputCls}
        >
          <option value="" disabled>Selecione…</option>
          {[...porRep.entries()].map(([rep, lista]) => (
            <optgroup key={rep} label={rep}>
              {lista.map((n) => (
                <option key={n.id} value={n.id}>{n.rotulo}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {nfSel && <input type="hidden" name="representada_id" value={nfSel.representada_id} />}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Parcela (opcional)</span>
        <select
          name="parcela_id"
          value={parcela}
          disabled={!nfSel || nfSel.parcelas.length === 0}
          onChange={(e) => {
            setParcela(e.target.value);
            const p = nfSel?.parcelas.find((x) => x.id === e.target.value);
            setBaseV(String(p ? p.valor : (nfSel?.base ?? "")));
          }}
          className={inputCls}
        >
          <option value="">NF inteira</option>
          {nfSel?.parcelas.map((p) => (
            <option key={p.id} value={p.id}>{p.rotulo}</option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">Quando a representada apura por parcela (Signify), escolha a parcela: a base vira o valor dela.</span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Base de cálculo (R$)</span>
        <input name="base" type="number" step="0.01" min="0" required value={baseV} onChange={(e) => setBaseV(e.target.value)} className={inputCls} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">% apurado</span>
        <input name="pct" type="number" step="0.0001" min="0" max="100" required value={pctV} onChange={(e) => setPctV(e.target.value)} className={inputCls} />
        <span className="mt-1 block text-xs text-slate-500">Em percentual (4 = 4%).</span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Comissão apurada (R$)</span>
        <input name="valor_apurado" type="number" step="0.01" placeholder={apurado != null ? apurado.toFixed(2) : ""} defaultValue={valorApurado ?? ""} className={inputCls} />
        <span className="mt-1 block text-xs text-slate-500">Vazio = base × %. Preencha com o valor exato do relatório se diferir.</span>
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block font-medium text-slate-700">NFS-e de comissão que cobre esta apuração (opcional)</span>
        <select name="nfse_id" value={nfse} onChange={(e) => setNfse(e.target.value)} className={inputCls} disabled={!nfSel}>
          <option value="">Ainda sem NFS-e (autorizada, falta emitir)</option>
          {nfsesVisiveis.map((x) => (
            <option key={x.id} value={x.id}>{x.rotulo}</option>
          ))}
        </select>
      </label>
    </>
  );
}
