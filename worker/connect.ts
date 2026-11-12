import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { accountId, database } from "./config.ts";
import { openAccount, identity } from "./browser.ts";
async function main() {
  const id = accountId(process.argv[2]);
  const db = database();
  const browser = await openAccount(id, false, false);
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    await browser.page.goto("https://x.com/home", {
      waitUntil: "domcontentloaded",
    });
    console.log(
      `\nConta ${id}: entre na conta desejada no navegador. Complete a autenticação no próprio X.`,
    );
    await prompt.question(
      "Quando a página inicial estiver aberta e autenticada, pressione Enter aqui. ",
    );
    const profile = await identity(browser.page);
    const { data: current, error: readError } = await db
      .from("x_accounts")
      .select("username")
      .eq("id", id)
      .single();
    if (readError)
      throw new Error("Conta não encontrada. Confira a instalação do SQL.");
    if (
      current.username &&
      current.username.toLowerCase() !== profile.username.toLowerCase()
    ) {
      const { count, error: queueError } = await db
        .from("x_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("account_id", id)
        .in("status", ["pending", "processing"]);
      if (queueError || count)
        throw new Error(
          "Este slot pertence a outro perfil e tem publicações pendentes. Cancele os envios e exclua os rascunhos antes de trocar a conta.",
        );
    }
    const { error } = await db
      .from("x_accounts")
      .update({
        ...profile,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error)
      throw new Error(
        "Não foi possível registrar a conta. Confira o SQL, o Supabase e se o perfil já está cadastrado em outro slot.",
      );
    console.log(
      `Conta ${id} conectada: @${profile.username}. A sessão foi salva somente neste computador.`,
    );
  } finally {
    prompt.close();
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Falha ao conectar conta.");
  process.exitCode = 1;
});
