import { chromium, type Page } from "playwright";
import { mkdir, open, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "./config.ts";
export async function openAccount(
  id: number,
  headless: boolean,
  requireExisting = true,
) {
  const profile = join(dataDir, "profiles", `account-${id}`);
  if (requireExisting) {
    try {
      await access(profile);
    } catch {
      throw new Error(
        `Conta ${id} sem sessão local. Execute npm run account:connect -- ${id}.`,
      );
    }
  }
  const locks = join(dataDir, "locks");
  await mkdir(locks, { recursive: true });
  const lock = join(locks, `account-${id}.lock`);
  let handle;
  try {
    handle = await open(lock, "wx", 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, account: id }));
  } catch {
    throw new Error(
      `Perfil ${id} em uso. Feche o outro navegador/worker. Se houve interrupção, consulte o README sobre locks.`,
    );
  }
  const release = async () => {
    await handle!.close();
    await unlink(lock).catch(() => {});
  };
  try {
    const context = await chromium.launchPersistentContext(profile, {
      headless,
      viewport: { width: 1360, height: 900 },
      locale: "pt-BR",
      ...(process.env.PLAYWRIGHT_CHANNEL
        ? { channel: process.env.PLAYWRIGHT_CHANNEL }
        : {}),
    });
    context.setDefaultTimeout(20000);
    context.setDefaultNavigationTimeout(45000);
    let closed = false;
    return {
      context,
      page: context.pages()[0] ?? (await context.newPage()),
      close: async () => {
        if (closed) return;
        closed = true;
        await context.close().finally(release);
      },
    };
  } catch (e) {
    await release();
    throw e;
  }
}
export async function identity(page: Page) {
  const link = page.getByTestId("AppTabBar_Profile_Link");
  await link.waitFor({ state: "visible", timeout: 20000 });
  const href = await link.getAttribute("href");
  const username = href?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  if (!username)
    throw new Error(
      "Não foi possível identificar a conta. Confirme o login no X e reconecte a sessão.",
    );
  const switcher = page.getByTestId("SideNav_AccountSwitcher_Button");
  const text = await switcher.innerText().catch(() => username);
  const name =
    text
      .split("\n")
      .map((v) => v.trim())
      .find((v) => v && !v.startsWith("@")) ?? username;
  const images = switcher.locator("img");
  const avatar = (await images.count())
    ? await images
        .first()
        .getAttribute("src")
        .catch(() => null)
    : null;
  return { username, name, avatar_url: avatar };
}
export type PublishResult =
  | { status: "published"; tweetId: string }
  | { status: "failed" | "uncertain"; error: string; sessionExpired?: boolean };
export function resultTweetId(value: unknown): string | null {
  const obj = value as {
    data?: {
      create_tweet?: {
        tweet_results?: {
          result?: { rest_id?: string; tweet?: { rest_id?: string } };
        };
      };
    };
  };
  const result = obj?.data?.create_tweet?.tweet_results?.result;
  const id = result?.rest_id ?? result?.tweet?.rest_id;
  return typeof id === "string" && /^\d+$/.test(id) ? id : null;
}
export async function publishWithBrowser(
  page: Page,
  text: string,
  username: string,
  beforePublish: () => Promise<void>,
): Promise<PublishResult> {
  let submitted = false;
  try {
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
    let actual;
    try {
      actual = await identity(page);
    } catch {
      return {
        status: "failed",
        error:
          "Sessão expirada ou verificação do X pendente. Reconecte a conta.",
        sessionExpired: true,
      };
    }
    if (actual.username.toLowerCase() !== username.toLowerCase())
      return {
        status: "failed",
        error:
          "O perfil aberto difere da conta cadastrada. Reconecte a conta correta.",
        sessionExpired: true,
      };
    await page.goto("https://x.com/compose/post", {
      waitUntil: "domcontentloaded",
    });
    const editor = page.getByTestId("tweetTextarea_0").first();
    await editor.fill(text);
    await beforePublish();
    const responsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith("/CreateTweet"),
        { timeout: 45000 },
      )
      .catch(() => null);
    submitted = true;
    // Uma única tentativa de clique. Sem replay de endpoints privados ou bypass.
    await page.getByTestId("tweetButton").click({ timeout: 20000 });
    const response = await responsePromise;
    if (response) {
      const data = await response.json().catch(() => null);
      const tweetId = resultTweetId(data);
      if (response.ok() && tweetId) return { status: "published", tweetId };
      // Um erro após o clique exige conferência, mesmo com HTTP 200.
      return {
        status: "uncertain",
        error: `O X não confirmou a publicação (HTTP ${response.status()}). Confira o perfil antes de reenviar.`,
      };
    }
    const toast = page
      .getByTestId("toast")
      .locator(`a[href*="/${username}/status/"]`)
      .first();
    const href = await toast
      .getAttribute("href", { timeout: 2000 })
      .catch(() => null);
    const tweetId = href?.match(/\/status\/(\d+)/)?.[1];
    return tweetId
      ? { status: "published", tweetId }
      : {
          status: "uncertain",
          error:
            "Sem confirmação do X após o envio. Confira o perfil antes de reenviar.",
        };
  } catch {
    return {
      status: submitted ? "uncertain" : "failed",
      error: submitted
        ? "O navegador foi interrompido após o envio. Confira o perfil antes de reenviar."
        : "Não foi possível preparar a publicação. Confira a sessão e a interface do X.",
    };
  }
}
