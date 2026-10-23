import type { Cliente, Filtro, Representada } from "@/lib/motor";
import { inputCls } from "./ui";

/**
 * Filtro global (RN-26): representada + cliente, via query string (GET), para
 * valer em todas as visões sem estado no cliente.
 */
export function FiltroGlobal({ filtro, representadas, clientes, extras = {} }: { filtro: Filtro; representadas: Representada[]; clientes: Cliente[]; extras?: Record<string, string | undefined> }) {
  const clientesVisiveis = filtro.representada_id ? clientes.filter((c) => c.representada_id === filtro.representada_id) : clientes;
  const porRep = new Map(representadas.map((r) => [r.id, r.nome]));
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      {Object.entries(extras).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Representada</span>
        <select name="rep" defaultValue={filtro.representada_id ?? ""} className={`${inputCls} w-56`}>
          <option value="">Todas</option>
          {representadas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Cliente</span>
        <select name="cli" defaultValue={filtro.cliente_id ?? ""} className={`${inputCls} w-72`}>
          <option value="">Todos</option>
          {clientesVisiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
              {filtro.representada_id ? "" : ` (${porRep.get(c.representada_id)})`}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
        Filtrar
      </button>
      {(filtro.representada_id || filtro.cliente_id) && (
        <a href="?" className="text-sm text-sky-700 hover:underline">
          Limpar
        </a>
      )}
    </form>
  );
}
