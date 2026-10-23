/**
 * Gera tests/fixtures/planilha.json a partir da planilha original, para que os
 * testes do motor rodem sem o arquivo .xlsx.
 *
 * Uso: npx tsx scripts/gerar-fixture.ts <caminho-da-planilha.xlsx>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { lerPlanilha } from "../src/lib/importador/ler-planilha";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Uso: npx tsx scripts/gerar-fixture.ts <planilha.xlsx>");
  process.exit(1);
}

const destino = join(process.cwd(), "tests", "fixtures", "planilha.json");
lerPlanilha(arquivo).then((lida) => {
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, JSON.stringify(lida, null, 2) + "\n");
  console.log(`Fixture gravada em ${destino}`);
  if (lida.avisos.length) console.log("Avisos:\n - " + lida.avisos.join("\n - "));
});
