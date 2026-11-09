// O "Salvar" do passo Contas da Shopee no guia, de ponta a ponta.
//
//   npm run ensaio:guia
//
// O caso que quebrou no cliente: senha + chave digitadas, Salvar, e a tela
// dizia "Não consegui guardar — Cannot read properties of null (reading
// 'querySelector')". O salvar tinha dado certo; quem caía era o código que
// põe o rótulo "· guardada" — ele procurava o <span> no pai do input, e o
// botão do olho já tinha embrulhado o input numa div sem <span>.
import { app, BrowserWindow } from "electron";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raiz = "/Users/gustavobragaia/Documents/shopee-tracking-bot";
const dir = mkdtempSync(join(tmpdir(), "esteira-guia-"));
process.env.ESTADO_DIR = join(dir, "estado");
process.env.TRABALHO_DIR = dir;
process.env.RECURSOS_DIR = raiz;
app.setPath("userData", join(dir, "dados-electron"));
await import("./principal.mjs");

const ok = (c, m) => { console.log(c ? `  \x1b[32m✓\x1b[0m ${m}` : `  \x1b[31m✗ ${m}\x1b[0m`); return c; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let tudo = true;

app.whenReady().then(async () => {
  await espera(3500);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (s) => w.webContents.executeJavaScript(s);

  // pasta nova = guia ainda não concluído = ele abre sozinho; anda até o passo 3
  for (let i = 0; i < 2; i++) { await js(`document.getElementById("gPular").click()`); await espera(300); }
  tudo &= ok(await js(`!!document.getElementById("gContasSalvar")`), "o guia chegou em Contas da Shopee");

  await js(`(() => {
    const p = (id, v) => { const e = document.getElementById(id); e.value = v;
      e.dispatchEvent(new Event("input", {bubbles:true})); };
    p("gPrefixo", "lojateste"); p("gDominio", "exemplo.com");
    p("gSenha", "senha-de-teste"); p("gCodigo", "chave-de-teste");
    document.getElementById("gContasSalvar").click();
  })()`);
  await espera(1200);

  const r = await js(`({
    res: document.getElementById("gContasRes").textContent,
    rotulos: [...document.querySelectorAll("#gSenha, #gCodigo")]
      .map((i) => !!i.closest("label").querySelector(".g-guardada")),
  })`);
  tudo &= ok(!/Não consegui guardar/.test(r.res), `Salvar não mostra erro (${r.res.trim() || "vazio"})`);
  tudo &= ok(/Guardado/.test(r.res), "Salvar diz que guardou");
  tudo &= ok(r.rotulos.every(Boolean), "senha e chave ganham o rótulo · guardada");

  const a = (await js(`window.esteira.pedir("ajustes:ler")`)).dado;
  tudo &= ok(a.shopeeSenha === "guardada" && a.codigoChave === "guardada" && a.emailPrefixo === "lojateste",
    "e está mesmo em disco");

  // salvar de novo com o rótulo já posto não pode duplicar nem quebrar
  await js(`document.getElementById("gContasSalvar").click()`);
  await espera(1000);
  const r2 = await js(`({ res: document.getElementById("gContasRes").textContent,
    n: document.querySelectorAll("#gSenha, #gCodigo").length &&
       [...document.querySelectorAll("#gSenha, #gCodigo")].map((i) => i.closest("label").querySelectorAll(".g-guardada").length) })`);
  tudo &= ok(/Guardado/.test(r2.res) && r2.n.every((x) => x === 1), "salvar de novo não duplica o rótulo");

  console.log(tudo ? "\n\x1b[32m\x1b[1m  o Salvar do guia funciona\x1b[0m\n" : "\n\x1b[31m\x1b[1m  o Salvar do guia QUEBRA\x1b[0m\n");
  app.exit(tudo ? 0 : 1);
});
