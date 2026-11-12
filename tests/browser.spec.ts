import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { publishWithBrowser, resultTweetId } from "../worker/browser.ts";

const base = "http://127.0.0.1:4175";
async function startServer(port = 4175, env: Record<string, string> = {}) {
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { stdio: "ignore", windowsHide: true, env: { ...process.env, ...env } },
  );
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) return server;
    } catch {
      /* Aguardando Vite. */
    }
    await delay(250);
  }
  server.kill();
  throw new Error("O servidor de teste não iniciou.");
}
test("painel no navegador: agenda, versões por conta, rascunho, cancelamento e celular", async (t) => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("artifacts", { recursive: true });
  try {
    await page.goto(base);
    await page.getByRole("heading", { name: "Tudo no seu ritmo." }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "artifacts/dashboard-desktop.png",
      fullPage: true,
    });
    await t.test(
      "agendamento em duas contas exige textos próprios e salva após personalizar",
      async () => {
        await page.getByRole("button", { name: "Nova publicação" }).click();
        const modal = page.getByRole("dialog");
        await modal
          .locator("#post-title")
          .fill("Teste de agendamento no navegador");
        await modal
          .locator("#post-body")
          .fill("Uma ideia original para nossa comunidade de design.");
        await modal
          .locator(".account-chip")
          .filter({ hasText: "Forma & Função" })
          .click();
        const tomorrow = new Date(Date.now() + 86400000);
        const date = tomorrow.toISOString().slice(0, 10) + "T18:30";
        await modal.getByLabel("Data e horário", { exact: true }).fill(date);
        await modal.getByRole("button", { name: "Agendar publicação" }).click();
        await modal
          .getByRole("alert")
          .filter({ hasText: "Personalize" })
          .waitFor();
        await modal.getByLabel("Personalizar o texto por conta").check();
        await modal
          .locator(".variant-list textarea")
          .nth(1)
          .fill(
            "A forma segue a conversa: veja o processo por trás do nosso projeto de identidade visual.",
          );
        await page.screenshot({
          path: "artifacts/composer-desktop.png",
          fullPage: true,
        });
        await modal.getByRole("button", { name: "Agendar publicação" }).click();
        await modal.waitFor({ state: "hidden" });
        await page
          .locator(".sidebar")
          .getByRole("button", { name: "Publicações", exact: false })
          .click();
        await page
          .getByRole("button", { name: /Teste de agendamento no navegador/ })
          .click();
        await page
          .getByRole("dialog")
          .getByText("A forma segue a conversa:", { exact: false })
          .waitFor();
        await page.getByRole("button", { name: "Cancelar pendentes" }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        const row = page.getByRole("button", {
          name: /Teste de agendamento no navegador/,
        });
        await row.getByText("Cancelada", { exact: true }).waitFor();
      },
    );
    await t.test(
      "rascunho pode ser encontrado, reutilizado e excluído",
      async () => {
        await page.getByRole("button", { name: "Nova publicação" }).click();
        const modal = page.getByRole("dialog");
        await modal.locator("#post-title").fill("Rascunho do navegador");
        await modal
          .locator("#post-body")
          .fill("Uma ideia que ainda vai amadurecer.");
        await modal.getByRole("button", { name: "Salvar rascunho" }).click();
        await modal.waitFor({ state: "hidden" });
        await page
          .locator(".sidebar")
          .getByRole("button", { name: "Rascunhos" })
          .click();
        await page
          .getByPlaceholder("Buscar uma publicação...")
          .fill("Rascunho do navegador");
        await page
          .getByRole("button", { name: /Rascunho do navegador/ })
          .click();
        await page.getByRole("button", { name: "Excluir rascunho" }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.locator(".post-row").count(), 0);
        await page.getByRole("button", { name: "Limpar busca" }).click();
      },
    );
    await t.test(
      "pausa de conta, troca de perfil e calendário funcionam",
      async () => {
        await page
          .locator(".sidebar")
          .getByRole("button", { name: "Contas conectadas" })
          .click();
        await page
          .locator(".account-card")
          .first()
          .getByRole("button", { name: "Pausar conta" })
          .click();
        await page
          .locator(".account-card")
          .first()
          .getByText("Pausada", { exact: true })
          .waitFor();
        await page
          .locator(".account-card")
          .first()
          .getByRole("button", { name: "Reativar conta" })
          .click();
        await page.locator(".account-switcher").click();
        await page
          .locator(".account-popover")
          .getByRole("button")
          .filter({ hasText: "Café com Design" })
          .click();
        assert.match(
          await page.locator(".account-switcher").innerText(),
          /Café com Design/,
        );
        await page
          .locator(".sidebar")
          .getByRole("button", { name: "Calendário" })
          .click();
        assert.equal(await page.locator(".calendar-cell").count(), 42);
        await page.getByRole("button", { name: "Próximo mês" }).click();
        await page.getByRole("button", { name: "Hoje", exact: true }).click();
      },
    );
    await t.test(
      "layout no celular, menu e editor sem transbordamento horizontal",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole("button", { name: "Abrir menu" }).click();
        await page
          .locator(".sidebar")
          .getByRole("button", { name: "Visão geral" })
          .click();
        await page.waitForFunction(
          () =>
            Number(
              new DOMMatrix(
                getComputedStyle(document.querySelector(".sidebar")!).transform,
              ).m41,
            ) <= -236,
        );
        await page.screenshot({
          path: "artifacts/dashboard-mobile.png",
          fullPage: true,
        });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "A página não deve transbordar horizontalmente.",
        );
        await page.getByRole("button", { name: "Nova publicação" }).click();
        const modal = page.getByRole("dialog");
        await modal.waitFor();
        await page.screenshot({
          path: "artifacts/composer-mobile.png",
          fullPage: true,
        });
        await modal
          .getByRole("button", { name: "Fechar", exact: true })
          .click();
      },
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});

const fixture = `<!doctype html><html><body>
<a data-testid="AppTabBar_Profile_Link" href="/authorized_user">Perfil</a>
<button data-testid="SideNav_AccountSwitcher_Button">Conta autorizada\n@authorized_user</button>
<div contenteditable="true" data-testid="tweetTextarea_0"></div>
<button data-testid="tweetButton" onclick="fetch('/i/api/graphql/fixture/CreateTweet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:document.querySelector('[contenteditable]').innerText})})">Publicar</button>
</body></html>`;
test("integração sem login: rejeita mensagens de outro frame e limpa os dados no logout", async () => {
  const parentOrigin = "http://127.0.0.1:4177";
  const panel = "http://127.0.0.1:4176";
  const server = await startServer(4176, {
    VITE_DEMO_MODE: "false",
    VITE_SUPABASE_URL: "https://supabase.example.invalid",
    VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
    VITE_PARENT_ORIGIN: parentOrigin,
  });
  const browser = await chromium.launch({ headless: true });
  const parentServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      `<!doctype html><iframe name="orbit-panel" src="${panel}"></iframe>`,
    );
  });
  await new Promise<void>((resolve) =>
    parentServer.listen(4177, "127.0.0.1", resolve),
  );
  try {
    const page = await browser.newPage();
    let requests = 0;
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("requestfailed", (request) =>
      browserErrors.push(`${request.url()}: ${request.failure()?.errorText}`),
    );
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    const token = `test.${Buffer.from(JSON.stringify({ sub: "integration-user" })).toString("base64url")}.test`;
    await page.route(
      "https://supabase.example.invalid/functions/v1/x-studio/bootstrap",
      async (route) => {
        if (route.request().method() === "OPTIONS")
          return route.fulfill({
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": panel,
              "Access-Control-Allow-Headers":
                "authorization,apikey,content-type",
            },
          });
        requests++;
        assert.equal(
          route.request().headers().authorization,
          `Bearer ${token}`,
        );
        await route.fulfill({
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": panel },
          body: JSON.stringify({
            accounts: [],
            campaigns: [],
            worker: { last_run_at: null, last_error: null, last_processed: 0 },
            user: { name: "Operador autenticado" },
          }),
        });
      },
    );
    await page.goto(parentOrigin);
    const child = page.frameLocator('iframe[name="orbit-panel"]');
    await child
      .getByText("Aguardando a sessão do sistema principal.", { exact: false })
      .waitFor({ timeout: 7000 })
      .catch(async (error) => {
        await page.screenshot({
          path: "artifacts/integration-debug.png",
          fullPage: true,
        });
        console.error(
          "Integration diagnostics",
          browserErrors,
          await Promise.all(
            page.frames().map(async (f) => ({
              url: f.url(),
              body: await f
                .locator("body")
                .innerText()
                .catch(() => "(unavailable)"),
            })),
          ),
        );
        throw error;
      });
    // Mesmo origin autorizado, mas source é um irmão do painel: precisa ser rejeitado.
    await page.evaluate(
      ({ panel, token }) => {
        const sibling = document.createElement("iframe");
        sibling.srcdoc = `<script>parent.frames[0].postMessage({type:'orbit:session',accessToken:${JSON.stringify(token)}},${JSON.stringify(panel)})<\/script>`;
        document.body.append(sibling);
      },
      { panel, token },
    );
    await delay(200);
    assert.equal(requests, 0);
    await page.evaluate(
      ({ panel, token }) => {
        window.frames[0].postMessage(
          { type: "orbit:session", accessToken: token },
          panel,
        );
      },
      { panel, token },
    );
    await child.getByText("Operador autenticado", { exact: true }).waitFor();
    assert.ok(requests >= 1);
    await page.evaluate(
      (panel) =>
        window.frames[0].postMessage(
          { type: "orbit:session", accessToken: null },
          panel,
        ),
      panel,
    );
    await child
      .getByText(
        "Abra o painel pelo sistema principal para receber sua sessão.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await child.getByText("Operador autenticado", { exact: true }).count(),
      0,
    );
  } finally {
    await browser.close();
    server.kill();
    await new Promise<void>((resolve, reject) =>
      parentServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test("Playwright worker: envio único, confirmação, identidade e resultado incerto em páginas simuladas", async (t) => {
  const browser = await chromium.launch({ headless: true });
  try {
    let calls = 0;
    let payload = "";
    let response: unknown = {
      data: {
        create_tweet: {
          tweet_results: { result: { rest_id: "1234567890123456789" } },
        },
      },
    };
    const page = await browser.newPage();
    await page.route("https://x.com/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/CreateTweet")) {
        calls++;
        payload = JSON.parse(route.request().postData() ?? "{}").text;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(response),
        });
      } else
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: fixture,
        });
    });
    await t.test(
      "só confirma ao receber o ID do post e faz um único envio",
      async () => {
        const result = await publishWithBrowser(
          page,
          "Conteúdo de teste, sem publicação real.",
          "authorized_user",
          async () => {},
        );
        assert.deepEqual(result, {
          status: "published",
          tweetId: "1234567890123456789",
        });
        assert.equal(calls, 1);
        assert.equal(payload, "Conteúdo de teste, sem publicação real.");
      },
    );
    await t.test(
      "HTTP 200 com erro não é sucesso e não dispara retry",
      async () => {
        response = { errors: [{ message: "Não autorizado" }] };
        calls = 0;
        const result = await publishWithBrowser(
          page,
          "Outro conteúdo.",
          "authorized_user",
          async () => {},
        );
        assert.equal(result.status, "uncertain");
        assert.equal(calls, 1);
      },
    );
    await t.test(
      "impede envio na conta errada e após cancelamento da fila",
      async () => {
        calls = 0;
        let result = await publishWithBrowser(
          page,
          "Teste.",
          "wrong_account",
          async () => {},
        );
        assert.equal(result.status, "failed");
        assert.equal(calls, 0);
        result = await publishWithBrowser(
          page,
          "Teste.",
          "authorized_user",
          async () => {
            throw new Error("Cancelado");
          },
        );
        assert.equal(result.status, "failed");
        assert.equal(calls, 0);
      },
    );
    assert.equal(
      resultTweetId({
        data: {
          create_tweet: { tweet_results: { result: { rest_id: "invalid" } } },
        },
      }),
      null,
    );
  } finally {
    await browser.close();
  }
});
