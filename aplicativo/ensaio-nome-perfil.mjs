// "Como os perfis se chamam no AdsPower", de ponta a ponta, na janela de verdade.
//
//   npm run ensaio:perfil
//
// O caso real (09/11/2026): os 591 perfis do segundo cliente se chamam
// "S21", "S13"… e o Esteira só reconhecia "shopee 21" — não achava nenhum.
// Aqui um AdsPower de mentira devolve perfis "S…", e o ensaio confere:
//   · o teste de conexão AVISA que nenhum nome é reconhecido;
//   · o aviso de "novo" aparece em Ajustes enquanto o campo está vazio;
//   · "S21" (com número) é recusado, "S" é guardado;
//   · com "S", a planilha com S21/S13 e os perfis S21/S13 se encontram;
//   · fecha e abre de novo (reload + processo novo só com o disco): continua;
//   · o guia mostra e salva o mesmo campo;
//   · apagar volta ao "shopee 21".
import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";

const raiz = join(import.meta.dirname, "..");
const PERFIS = [
  { user_id: "k16vc3ic", serial_number: "28", name: "S21" },
  { user_id: "k16orfqc", serial_number: "16", name: "S13" },
  { user_id: "k16or1oy", serial_number: "15", name: "S12" },
];
const ads = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  res.setHeader("content-type", "application/json");
  if (u.pathname === "/status") return res.end(JSON.stringify({ code: 0, msg: "success" }));
  if (u.pathname === "/api/v1/user/list") {
    const pg = Number(u.searchParams.get("page") ?? 1), n = Number(u.searchParams.get("page_size") ?? 100);
    return res.end(JSON.stringify({ code: 0, data: { list: pg === 1 ? PERFIS.slice(0, n) : [], page: pg, page_size: n } }));
  }
  res.end(JSON.stringify({ code: -1, msg: "nao simulado" }));
});
await new Promise((r) => ads.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${ads.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "esteira-perfil-"));
mkdirSync(join(dir, "estado"), { recursive: true });
process.env.ESTADO_DIR = join(dir, "estado"); process.env.TRABALHO_DIR = dir; process.env.RECURSOS_DIR = raiz;
delete process.env.NOME_PERFIL;
// src/adspower.mjs lê o endereço ao carregar (no cliente é sempre o padrão)
process.env.ADSPOWER_BASE = base; process.env.ADSPOWER_API_KEY = "chave-de-teste";
writeFileSync(join(dir, "estado", "ajustes.json"),
  JSON.stringify({ guiaConcluido: true, adspowerBase: base, adspowerChave: "chave-de-teste" }));
app.setPath("userData", join(dir, "dados-electron"));
await import("./principal.mjs");

const ok = (c, m) => { console.log(c ? `  \x1b[32m✓\x1b[0m ${m}` : `  \x1b[31m✗ ${m}\x1b[0m`); return c; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let tudo = true;

// planilha do dia: duas contas no nome do perfil, uma no formato antigo
const ExcelJS = (await import("../src/excel.mjs")).default;
const planilha = join(dir, "pedidos.xlsx");
{
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("PEDIDOS");
  ws.addRow(["NÚMERO DO PEDIDO", "NOME DO CLIENTE", "CÓDIGO DE RASTREIO", "ONDE FOI FEITO O PEDIDO"]);
  ws.addRow(["#1001", "Ana Exemplo", "", "S21"]);
  ws.addRow(["#1002", "Bruno Exemplo", "", "S13"]);
  ws.addRow(["#1003", "Carla Exemplo", "", "shopee 12"]);
  await wb.xlsx.writeFile(planilha);
}

app.whenReady().then(async () => {
  await espera(3500);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => w.webContents.executeJavaScript(c);
  const pedir = async (acao, carga) => {
    let r = await js(`window.esteira.pedir(${JSON.stringify(acao)}, ${JSON.stringify(carga ?? {})})`);
    // a ponte embrulha em {ok, dado}, e o tentar() da ação embrulha de novo
    while (r && typeof r === "object" && "dado" in r && "ok" in r) {
      if (r.ok === false) throw new Error(r.erro ?? JSON.stringify(r));
      r = r.dado;
    }
    return r;
  };
  const tela = () => js(`({
    valor: document.getElementById("shNomePerfil").value,
    aviso: !document.getElementById("shNomeAviso").hidden,
    ex: document.getElementById("shNomeEx").textContent })`);
  const digitar = (v) => js(`(() => { const e = document.getElementById("shNomePerfil");
    e.focus(); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event("input", {bubbles:true}));
    e.dispatchEvent(new Event("change", {bubbles:true})); e.blur(); })()`);
  const contasDaPlanilha = async () => (await pedir("planilha:ler", { caminho: planilha })).contas.map((c) => c.conta).sort((a, b) => a - b);
  const { resolverContas, esquecerPerfis } = await import("../src/perfis.mjs");
  const casar = async () => { esquecerPerfis();
    const r = await resolverContas([21, 13, 12].map((conta) => ({ conta })));
    return Object.fromEntries(r.resolvidas.map((x) => [x.conta, x.nomePerfil])); };

  console.log("\n  antes de configurar");
  await js(`document.querySelector('[data-tela="ajustes"]').click()`);
  await espera(400);
  let t = await tela();
  tudo &= ok(t.valor === "" && t.aviso, "o aviso de novidade aparece com o campo vazio");
  tudo &= ok(/shopee 21/.test(t.ex), `o exemplo mostra o padrão (${t.ex})`);
  let d = await pedir("adspower:diagnosticar", {});
  tudo &= ok(d.ok && (d.comoResolver ?? []).some((x) => /S21/.test(x) && /Ajustes/.test(x)),
    "o teste de conexão avisa que nenhum perfil é reconhecido");
  tudo &= ok(JSON.stringify(await contasDaPlanilha()) === "[12]", "a planilha só reconhece a linha \"shopee 12\"");

  console.log("\n  digitando com número (errado)");
  await digitar("S21"); await espera(700);
  tudo &= ok((await pedir("ajustes:ler")).nomePerfil === "", "\"S21\" é recusado e nada é guardado");
  tudo &= ok(await js(`/Não guardei:.*sem o número/.test((document.querySelector("#shNomePerfil")?.closest("label")?.querySelector(".aj-erro") || {}).textContent || "")`),
    "e o motivo aparece embaixo do próprio campo");

  console.log("\n  digitando certo");
  await digitar("S"); await espera(700);
  tudo &= ok((await pedir("ajustes:ler")).nomePerfil === "S", "\"S\" é guardado");
  tudo &= ok(await js(`!document.querySelector("#shNomePerfil").closest("label").querySelector(".aj-erro")`), "e o aviso de erro some");
  t = await tela();
  tudo &= ok(!t.aviso, "o aviso some depois de guardado");
  tudo &= ok(/S21 é a conta 21/.test(t.ex), `o exemplo mostra o perfil S21 (${t.ex})`);
  d = await pedir("adspower:diagnosticar", {});
  tudo &= ok(d.ok && !(d.comoResolver ?? []).some((x) => /S21/.test(x)), "o teste de conexão para de avisar");
  tudo &= ok(JSON.stringify(await contasDaPlanilha()) === "[12,13,21]", "a planilha lê S21, S13 e shopee 12");
  const c = await casar();
  tudo &= ok(c[21] === "S21" && c[13] === "S13" && c[12] === "S12", `cada conta acha o seu perfil (${JSON.stringify(c)})`);

  console.log("\n  fechando e abrindo de novo");
  w.webContents.reload(); await espera(3000);
  await js(`document.querySelector('[data-tela="ajustes"]').click()`); await espera(400);
  t = await tela();
  tudo &= ok(t.valor === "S" && !t.aviso, "depois de recarregar, o campo continua \"S\" e sem aviso");
  const { execFileSync } = await import("node:child_process");
  const outro = execFileSync(process.execPath, ["--input-type=module", "-e", `
      const { aplicarNoAmbiente } = await import(${JSON.stringify(join(raiz, "src/ajustes.mjs"))});
      aplicarNoAmbiente();
      const { parseConta } = await import(${JSON.stringify(join(raiz, "src/tracking.mjs"))});
      console.log(parseConta("S21").numeros[0]);`],
    { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NOME_PERFIL: "" } }).trim();
  tudo &= ok(outro === "21", "um processo novo, só com o que está em disco, lê S21 como conta 21");

  console.log("\n  pelo guia");
  await js(`window.GUIA.abrir()`); await espera(500);
  for (let i = 0; i < 2; i++) { await js(`document.getElementById("gPular").click()`); await espera(300); }
  tudo &= ok(await js(`document.getElementById("gNomePerfil").value`) === "S", "o guia mostra o nome guardado");
  await js(`(() => { const e = document.getElementById("gNomePerfil"); e.value = "Conta";
    document.getElementById("gContasSalvar").click(); })()`);
  await espera(800);
  tudo &= ok((await pedir("ajustes:ler")).nomePerfil === "Conta", "e salvar no guia guarda o novo nome");
  tudo &= ok(!/Não consegui/.test(await js(`document.getElementById("gContasRes").textContent`)), "sem erro no guia");
  await js(`document.getElementById("gFechar").click()`); await espera(2500);

  console.log("\n  apagando");
  await js(`document.querySelector('[data-tela="ajustes"]').click()`); await espera(400);
  await digitar(""); await espera(700);
  tudo &= ok((await pedir("ajustes:ler")).nomePerfil === "", "apagar guarda vazio");
  tudo &= ok((await tela()).aviso, "e o aviso volta");
  tudo &= ok(JSON.stringify(await contasDaPlanilha()) === "[12]", "e volta a valer só \"shopee 21\"");

  console.log(tudo ? "\n\x1b[32m\x1b[1m  nome dos perfis: ok\x1b[0m\n" : "\n\x1b[31m\x1b[1m  nome dos perfis: FALHOU\x1b[0m\n");
  ads.close();
  app.exit(tudo ? 0 : 1);
});
