import { mkdir, writeFile, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { database, dataDir, headless, pollMs } from "./config.ts";
import { openAccount, publishWithBrowser } from "./browser.ts";
type Job = {
  id: string;
  campaign_id: string;
  account_id: number;
  body: string;
  lock_token: string;
};
let db: ReturnType<typeof database>;
let stopping = false;
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});
const receipts = join(dataDir, "receipts");
function ensure(result: { error: unknown }) {
  if (result.error) throw new Error("Não foi possível atualizar o Supabase.");
}
async function reconcile() {
  await mkdir(receipts, { recursive: true });
  for (const name of await readdir(receipts)) {
    if (!/^[0-9a-f-]{36}\.json$/i.test(name)) continue;
    const file = join(receipts, name);
    const receipt = JSON.parse(await readFile(file, "utf8"));
    ensure(
      await db
        .from("x_deliveries")
        .update({
          status: "published",
          tweet_id: receipt.tweetId,
          published_at: receipt.publishedAt,
          error: null,
          lock_token: null,
        })
        .eq("id", receipt.id)
        .in("status", ["processing", "uncertain"]),
    );
    await unlink(file);
  }
}
async function runJob(job: Job) {
  const { data: account, error } = await db
    .from("x_accounts")
    .select("*")
    .eq("id", job.account_id)
    .single();
  if (error || !account) throw new Error("Conta não encontrada.");
  let browser: Awaited<ReturnType<typeof openAccount>> | null = null;
  const heartbeat = setInterval(() => {
    void db
      .from("x_deliveries")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("lock_token", job.lock_token)
      .then(() => {});
    void db
      .from("x_worker_state")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", true)
      .then(() => {});
  }, 30000);
  try {
    browser = await openAccount(job.account_id, headless);
    const result = await publishWithBrowser(
      browser.page,
      job.body,
      account.username,
      async () => {
        const { data, error: checkError } = await db
          .from("x_deliveries")
          .select(
            "status,lock_token,campaign:x_campaigns(state),account:x_accounts(active)",
          )
          .eq("id", job.id)
          .single();
        const c = data?.campaign as unknown as { state: string } | null;
        const a = data?.account as unknown as { active: boolean } | null;
        if (
          checkError ||
          data?.status !== "processing" ||
          data.lock_token !== job.lock_token ||
          c?.state !== "scheduled" ||
          !a?.active
        )
          throw new Error("Entrega cancelada, pausada ou sem lease.");
      },
    );
    if (result.status === "published") {
      const receipt = {
        id: job.id,
        tweetId: result.tweetId,
        publishedAt: new Date().toISOString(),
      };
      const file = join(receipts, `${job.id}.json`);
      await writeFile(file, JSON.stringify(receipt), { mode: 0o600 });
      ensure(
        await db
          .from("x_deliveries")
          .update({
            status: "published",
            tweet_id: receipt.tweetId,
            published_at: receipt.publishedAt,
            error: null,
            lock_token: null,
          })
          .eq("id", job.id)
          .eq("lock_token", job.lock_token)
          .select()
          .single(),
      );
      await unlink(file);
      console.log(`Entrega ${job.id} publicada na conta ${job.account_id}.`);
    } else {
      ensure(
        await db
          .from("x_deliveries")
          .update({
            status: result.status,
            error: result.error,
            lock_token: null,
          })
          .eq("id", job.id)
          .eq("lock_token", job.lock_token),
      );
      if (result.sessionExpired)
        ensure(
          await db
            .from("x_accounts")
            .update({ verified_at: null, last_error: result.error })
            .eq("id", job.account_id),
        );
      console.log(`Entrega ${job.id}: ${result.status}.`);
    }
  } catch {
    // Recibos de sucesso serão conciliados antes do próximo claim.
    ensure(
      await db
        .from("x_deliveries")
        .update({
          status: "uncertain",
          error:
            "Worker interrompido. Confira o perfil no X antes de reenviar.",
          lock_token: null,
        })
        .eq("id", job.id)
        .eq("lock_token", job.lock_token),
    );
    console.error(`Entrega ${job.id} precisa de conferência.`);
  } finally {
    clearInterval(heartbeat);
    await browser?.close();
  }
}
async function tick() {
  await reconcile();
  ensure(
    await db
      .from("x_worker_state")
      .update({ last_run_at: new Date().toISOString(), last_error: null })
      .eq("id", true),
  );
  const { data, error } = await db.rpc("x_claim_delivery");
  if (error)
    throw new Error(
      "Não foi possível consultar a fila. Aplique a migration SQL.",
    );
  const job = data?.[0] as Job | undefined;
  if (job) await runJob(job);
  ensure(
    await db
      .from("x_worker_state")
      .update({
        last_run_at: new Date().toISOString(),
        last_processed: job ? 1 : 0,
      })
      .eq("id", true),
  );
}
async function main() {
  db = database();
  console.log("Orbit worker iniciado. Aguardando agendamentos.");
  do {
    try {
      await tick();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha no worker.";
      console.error(message);
      await db
        .from("x_worker_state")
        .update({ last_error: message })
        .eq("id", true);
      if (process.argv.includes("--once")) throw e;
    }
    if (process.argv.includes("--once") || stopping) break;
    await delay(pollMs);
  } while (!stopping);
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "O worker não conseguiu iniciar.",
  );
  process.exitCode = 1;
});
