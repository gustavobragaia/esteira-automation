// A chave do AdsPower colada com o app JÁ ABERTO vale para a coleta.
//
//   npm run ensaio:chaveaovivo
//
// O caso real (09/11/2026): o cliente colou a chave em Ajustes, o teste de
// conexão ficou verde e a coleta disse "AdsPower: Require api-key (code -1)".
// src/adspower.mjs lia a chave uma vez, ao carregar; o teste de conexão
// recebe a chave direto, a coleta não. Aqui o AdsPower de mentira EXIGE a
// chave, o app abre sem nenhuma, e a chave chega só depois, pela tela.
import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";

const CHAVE = "chave-colada-depois";
let semChave = 0;
const ads = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  res.setHeader("content-type", "application/json");
  if (u.pathname === "/status") return res.end(JSON.stringify({ code: 0, msg: "success" }));
  if (req.headers.authorization !== `Bearer ${CHAVE}`) {
    semChave++;
    return res.end(JSON.stringify({ code: -1, msg: "Require api-key" }));
  }
  if (u.pathname === "/api/v1/user/list") {
    const pg = Number(u.searchParams.get("page") ?? 1);
    return res.end(JSON.stringify({ code: 0, data: { list: pg === 1
      ? [{ user_id: "k16or1oy", serial_number: "15", name: "S12" }] : [] } }));
  }
  if (u.pathname === "/api/v1/browser/active")
    return res.end(JSON.stringify({ code: 0, data: { status: "Inactive" } }));
  res.end(JSON.stringify({ code: -1, msg: "nao simulado" }));
});
await new Promise((r) => ads.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${ads.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "esteira-chave-vivo-"));
mkdirSync(join(dir, "estado"), { recursive: true });
process.env.ESTADO_DIR = join(dir, "estado"); process.env.TRABALHO_DIR = dir;
process.env.RECURSOS_DIR = join(import.meta.dirname, "..");
for (const v of ["ADSPOWER_API_KEY", "NOME_PERFIL"]) delete process.env[v];
// Como no cliente: o endereço do AdsPower já é o certo quando o app abre
// (no cliente é o padrão), e só a CHAVE chega depois, pela tela.
process.env.ADSPOWER_BASE = base;
writeFileSync(join(dir, "estado", "ajustes.json"), JSON.stringify({ guiaConcluido: true, adspowerBase: base }));
app.setPath("userData", join(dir, "dados-electron"));
await import("./principal.mjs");

const ok = (c, m) => { console.log(c ? `  \x1b[32m✓\x1b[0m ${m}` : `  \x1b[31m✗ ${m}\x1b[0m`); return c; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let tudo = true;

app.whenReady().then(async () => {
  await espera(3500);
  const w = BrowserWindow.getAllWindows()[0];
  // o que a tela faz quando ele cola a chave e o endereço
  await w.webContents.executeJavaScript(`window.esteira.pedir("ajustes:salvar",
    ${JSON.stringify({ adspowerChave: CHAVE, nomePerfil: "S" })})`);
  await espera(300);
  // o que veio antes (o teste automático da abertura, sem chave nenhuma) não conta
  semChave = 0;

  const { resolverContas, esquecerPerfis } = await import("../src/perfis.mjs");
  const { statusPerfil } = await import("../src/adspower.mjs");
  esquecerPerfis();
  let r = null, erro = null;
  try { r = await resolverContas([{ conta: 12 }]); } catch (e) { erro = e.message; }
  tudo &= ok(!erro, `a varredura de perfis usa a chave colada agora (${erro ?? "sem erro"})`);
  tudo &= ok(r?.resolvidas?.[0]?.nomePerfil === "S12", "e acha o perfil S12 da conta 12");
  let st = null;
  try { st = await statusPerfil({ userId: "k16or1oy" }); } catch (e) { st = e.message; }
  tudo &= ok(!/api-key/i.test(String(st)), "abrir/consultar perfil também leva a chave");
  tudo &= ok(semChave === 0, `nenhuma chamada chegou sem a chave (${semChave})`);

  console.log(tudo ? "\n\x1b[32m\x1b[1m  chave colada com o app aberto: ok\x1b[0m\n"
                   : "\n\x1b[31m\x1b[1m  chave colada com o app aberto: FALHOU\x1b[0m\n");
  ads.close();
  app.exit(tudo ? 0 : 1);
});
