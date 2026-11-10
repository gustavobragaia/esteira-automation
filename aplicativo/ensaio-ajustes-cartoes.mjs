// Ajustes em cartões + gavetas (0.1.19), na janela de verdade.
//
//   npm run ensaio:cartoes
//
// Confere o que a pessoa vê e faz: cada cartão diz o estado PROVADO (nada de
// "Conectado" de exemplo), "Resolver" abre a gaveta certa com o foco no campo
// que falta, Esc e o fundo fecham, e o que é salvo numa gaveta muda o cartão.
import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";

const ads = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  res.setHeader("content-type", "application/json");
  if (u.pathname === "/status") return res.end('{"code":0,"msg":"ok"}');
  if (u.pathname === "/api/v1/user/list") {
    const pg = Number(u.searchParams.get("page") ?? 1);
    return res.end(JSON.stringify({ code: 0, data: { list: pg === 1
      ? [{ user_id: "a", serial_number: "28", name: "S21" }, { user_id: "b", serial_number: "16", name: "S13" }] : [] } }));
  }
  res.end('{"code":-1,"msg":"nao simulado"}');
});
await new Promise((r) => ads.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${ads.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "esteira-cartoes-"));
mkdirSync(join(dir, "estado"), { recursive: true });
process.env.ESTADO_DIR = join(dir, "estado"); process.env.TRABALHO_DIR = dir;
process.env.RECURSOS_DIR = join(import.meta.dirname, "..");
process.env.ADSPOWER_BASE = base; delete process.env.NOME_PERFIL;
// falta a senha de propósito: o cartão da Shopee tem que dizer
writeFileSync(join(dir, "estado", "ajustes.json"), JSON.stringify({ guiaConcluido: true, adspowerBase: base,
  adspowerChave: "k", emailPrefixo: "loja", emailDominio: "ex.com", codigoChave: "y" }));
app.setPath("userData", join(dir, "dados-electron"));
await import("./principal.mjs");

const ok = (c, m) => { console.log(c ? `  \x1b[32m✓\x1b[0m ${m}` : `  \x1b[31m✗ ${m}\x1b[0m`); return c; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let tudo = true;

app.whenReady().then(async () => {
  await espera(4500);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => w.webContents.executeJavaScript(c);
  const cartao = (id) => js(`({ classe: document.getElementById("${id}").className,
    est: document.getElementById("${id}Est").textContent.trim(),
    det: document.getElementById("${id}Det").textContent.trim(),
    botao: document.querySelector("#${id} [data-gaveta]").textContent.trim() })`);
  const aberta = () => js(`[...document.querySelectorAll(".aj-gaveta")].filter((g) => !g.hidden).map((g) => g.id).join(",")`);
  await js(`document.querySelector('[data-tela="ajustes"]').click()`); await espera(400);

  let a = await cartao("cAds");
  tudo &= ok(/Falta o nome dos perfis/.test(a.est) && /at/.test(a.classe) && a.botao === "Resolver",
    `AdsPower: perfis S21/S13 não reconhecidos → "${a.est}" e "Resolver"`);
  let s = await cartao("cShopee");
  tudo &= ok(/Falta preencher/.test(s.est) && /senha/i.test(s.det), `Shopee: sem senha → "${s.est}: ${s.det}"`);
  let f = await cartao("cShopify");
  tudo &= ok(/Não conectada/.test(f.est) && !/Esparta|exemplo/i.test(f.det), `Shopify: sem loja → "${f.est}", nada de loja de exemplo`);

  await js(`document.getElementById("bGavAds").click()`); await espera(300);
  tudo &= ok(await aberta() === "gAds", "Resolver do AdsPower abre a gaveta do AdsPower");
  tudo &= ok(await js(`document.activeElement.id`) === "shNomePerfil", "com o foco no campo do nome dos perfis");
  tudo &= ok(!(await js(`document.getElementById("ajVeu").hidden`)), "e o fundo escurece");

  await js(`(() => { const e = document.getElementById("shNomePerfil"); e.value = "S";
    e.dispatchEvent(new Event("input", {bubbles:true})); e.dispatchEvent(new Event("change", {bubbles:true})); })()`);
  await espera(4000);
  a = await cartao("cAds");
  tudo &= ok(a.est === "Conectado" && !/at|er/.test(a.classe.replace("aj-cartao", "")), `salvar "S" testa de novo sozinho e o cartão vira "${a.est}"`);

  await js(`document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))`); await espera(200);
  tudo &= ok(await aberta() === "" && await js(`document.getElementById("ajVeu").hidden`), "Esc fecha a gaveta");
  tudo &= ok(await js(`document.activeElement.id`) === "bGavAds", "e o foco volta ao botão que abriu");

  await js(`document.getElementById("bGavShopee").click()`); await espera(200);
  tudo &= ok(await aberta() === "gShopee", "a gaveta da Shopee abre");
  await js(`(() => { const cx = document.querySelector('.segredo[data-segredo="shopeeSenha"]');
    cx.querySelector("input").value = "senha-de-teste"; cx.querySelector("[data-salvar]").click(); })()`);
  await espera(800);
  s = await cartao("cShopee");
  tudo &= ok(s.est === "Tudo preenchido" && /loja124@ex\.com/.test(s.det), `salvar a senha na gaveta muda o cartão: "${s.est} · ${s.det}"`);
  await js(`document.getElementById("ajVeu").click()`); await espera(200);
  tudo &= ok(await aberta() === "", "clicar no fundo fecha");

  await js(`document.getElementById("bGavShopify").click()`); await espera(200);
  tudo &= ok(await js(`!!document.querySelector("#gShopify #bConectarShop")`), "a gaveta da Shopify tem o Conectar Shopify");
  await js(`document.getElementById("bGavAvancado").click()`); await espera(200);
  tudo &= ok(await aberta() === "gAvancado", "abrir outra gaveta troca a aberta (uma por vez)");
  tudo &= ok(await js(`!!document.querySelector("#gAvancado #bConferirLinks") && !!document.querySelector("#gAvancado #maqRam")`),
    "Avançado tem corrigir links e esta máquina");
  await js(`document.querySelector('[data-tela="historico"]').click()`); await espera(200);
  tudo &= ok(await aberta() === "", "sair de Ajustes fecha a gaveta");

  console.log(tudo ? "\n\x1b[32m\x1b[1m  ajustes em cartões: ok\x1b[0m\n" : "\n\x1b[31m\x1b[1m  ajustes em cartões: FALHOU\x1b[0m\n");
  ads.close(); app.exit(tudo ? 0 : 1);
});
