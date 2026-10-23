import type { ParametrosBusca } from "@/lib/resultado";
import { Alerta } from "./ui";

/** Mostra ?ok= e ?erro= vindos dos redirects das server actions. */
export function Mensagens({ sp }: { sp: ParametrosBusca }) {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const ok = um(sp.ok);
  const erro = um(sp.erro);
  if (!ok && !erro) return null;
  return (
    <div className="space-y-2">
      {ok && <Alerta tom="ok">{ok}</Alerta>}
      {erro && (
        <Alerta tom="erro" titulo="Não foi possível salvar">
          {erro}
        </Alerta>
      )}
    </div>
  );
}
