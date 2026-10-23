import Link from "next/link";

export function LinkAgenda({ ref_, texto }: { ref_: { tipo: string; id: string }; texto: string }) {
  const href = { nfse: `/nfse/${ref_.id}`, nf: `/notas-fiscais/${ref_.id}`, apuracao: `/apuracoes/${ref_.id}`, pedido: `/pedidos/${ref_.id}` }[ref_.tipo] ?? "#";
  return (
    <Link href={href} className="text-sky-700 hover:underline">
      {texto}
    </Link>
  );
}
