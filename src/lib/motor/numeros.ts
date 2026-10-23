export function arredondar(valor: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

export function somar(valores: Iterable<number>): number {
  let total = 0;
  for (const v of valores) total += v;
  return total;
}

export function somarPor<T>(itens: Iterable<T>, f: (item: T) => number): number {
  let total = 0;
  for (const item of itens) total += f(item);
  return total;
}

export function agruparPor<T, K>(itens: Iterable<T>, chave: (item: T) => K): Map<K, T[]> {
  const mapa = new Map<K, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const lista = mapa.get(k);
    if (lista) lista.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

export function indexarPor<T, K>(itens: Iterable<T>, chave: (item: T) => K): Map<K, T> {
  const mapa = new Map<K, T>();
  for (const item of itens) mapa.set(chave(item), item);
  return mapa;
}
