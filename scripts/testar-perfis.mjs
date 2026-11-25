// Perfil errado é o pior erro que este sistema pode cometer: os cookies de
// uma conta sobrescrevem os da outra, o robô entra como quem não devia e
// escreve o rastreio no pedido de outro cliente — sem nenhum erro na tela.
import { agruparPerfis, perfisCompartilhados } from "../src/perfis.mjs";
import { parseConta } from "../src/tracking.mjs";

const ok = (c, m) => console.log(c ? `  \x1b[32m✓\x1b[0m ${m}` : `  \x1b[31m✗ ${m}\x1b[0m`) || c;
const sec = (x) => console.log(`\n\x1b[1m${x}\x1b[0m`);
let tudo = true;

const perfil = (n, id, serial) => ({ name: n, user_id: id, serial_number: serial });

sec("lista limpa do AdsPower");
const limpo = agruparPerfis([
  perfil("Shopee 124", "k1boua9d", 267),
  perfil("Shopee 128", "k1cexbyh", 347),
  perfil("Shopee 152", "k1c92sna", 344),
]);
tudo &= ok(limpo.mapa.size === 3, "três perfis, três contas");
tudo &= ok(limpo.duplicadas.size === 0, "nenhuma duplicada");
tudo &= ok(limpo.mapa.get(124).userId === "k1boua9d", "cada conta recebe o perfil dela");

sec("duas abas do AdsPower com o mesmo número de conta");
const dup = agruparPerfis([
  perfil("Shopee 124", "k1boua9d", 267),
  perfil("Shopee 225", "aaa111", 10),
  perfil("Shopee 225", "bbb222", 11),     // o perigoso
]);
tudo &= ok(dup.duplicadas.has(225), "a conta repetida é detectada");
tudo &= ok(!dup.mapa.has(225), "e NÃO entra no mapa — o robô não escolhe por conta própria");
tudo &= ok(dup.mapa.has(124), "as outras contas seguem normais");
tudo &= ok(dup.duplicadas.get(225).length === 2, "os dois perfis em conflito ficam registrados");
tudo &= ok(dup.duplicadas.get(225).map((p) => p.userId).join() === "aaa111,bbb222",
           "com os dois user_id, para alguém saber qual apagar");

sec("perfil sem número de conta no nome");
const semN = agruparPerfis([perfil("Perfil de teste", "zzz", 1), perfil("Shopee 7", "s7", 2)]);
tudo &= ok(semN.semNumero === 1 && semN.mapa.size === 1, "é ignorado, não vira conta");

sec("contas acima de 999: \"Shopee 999 (1000)\" é a conta 1000 (Chomps, 11/2026)");
const mil = agruparPerfis([
  perfil("Shopee 998", "p998", 1), perfil("Shopee 999", "p999", 2),
  perfil("Shopee 999 (1000)", "p1000", 3), perfil("Shopee 999 (1001)", "p1001", 4),
  perfil("Shopee 999 (1002)", "p1002", 5),
]);
tudo &= ok(mil.duplicadas.size === 0, "nenhum perfil vira repetido da 999");
tudo &= ok(mil.mapa.get(999)?.userId === "p999", "a 999 continua sendo a 999");
tudo &= ok(mil.mapa.get(1000)?.userId === "p1000" && mil.mapa.get(1002)?.userId === "p1002",
           "o número entre parênteses é a conta");
tudo &= ok(parseConta("Shopee 1000").numeros[0] === 1000, "na planilha, \"Shopee 1000\" casa com esse perfil");
tudo &= ok(parseConta("Shopee 12 (2)").numeros[0] === 12, "parêntese MENOR que o número de fora não troca a conta");
tudo &= ok(parseConta("Shopee 12 (2 pedidos)").numeros[0] === 12, "texto entre parênteses não é conta");
const antes = process.env.NOME_PERFIL; process.env.NOME_PERFIL = "S";
tudo &= ok(parseConta("S999 (1001)").numeros[0] === 1001, "vale também para nome próprio de perfil (S999 (1001))");
if (antes === undefined) delete process.env.NOME_PERFIL; else process.env.NOME_PERFIL = antes;

sec("duas contas apontando para o MESMO perfil");
const c1 = perfisCompartilhados([
  { conta: 207, userId: "k1cexbyh" },
  { conta: 270, userId: "k1cexbyh" },
  { conta: 124, userId: "k1boua9d" },
]);
tudo &= ok(c1.size === 1 && c1.has("k1cexbyh"), "o perfil compartilhado é encontrado");
tudo &= ok(c1.get("k1cexbyh").join() === "207,270", "com as duas contas que brigam por ele");
tudo &= ok(perfisCompartilhados([{ conta: 1, userId: "a" }, { conta: 2, userId: "b" }]).size === 0,
           "lista sadia não acusa nada");
tudo &= ok(perfisCompartilhados([{ conta: 5, userId: "a" }, { conta: 5, userId: "a" }]).size === 0,
           "a mesma conta duas vezes não é conflito, é repetição");
tudo &= ok(perfisCompartilhados([{ conta: 1 }, { conta: 2 }]).size === 0,
           "sem user_id não dá para acusar nada");

console.log(tudo ? "\n\x1b[32m\x1b[1m  nenhum perfil ambíguo passa\x1b[0m\n" : "\n\x1b[31m  FALHOU\x1b[0m\n");
process.exit(tudo ? 0 : 1);
