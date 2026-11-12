import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
const user = "12345678-1234-4234-8234-123456789012";
const requestId = () => crypto.randomUUID();
test("migration, permissões, transação, idempotência e ciclo da fila em PostgreSQL", async (t) => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${user}');`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611120001_x_studio.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    "update public.x_accounts set verified_at=now() where id between 1 and 6",
  );
  async function create(
    options: {
      id?: string;
      draft?: boolean;
      account?: number;
      date?: string;
    } = {},
  ) {
    return (
      await db.query<{ id: string }>(
        "select public.x_create_campaign($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as id",
        [
          options.id ?? requestId(),
          "Título",
          "Texto",
          options.date ?? "2020-01-01T00:00:00Z",
          "America/Sao_Paulo",
          options.draft ?? false,
          user,
          JSON.stringify([
            { account_id: options.account ?? 1, body: "Um conteúdo de teste." },
          ]),
        ],
      )
    ).rows[0].id;
  }
  await t.test(
    "cria 10 slots e bloqueia acesso por anon/authenticated",
    async () => {
      assert.equal(
        (await db.query("select id from public.x_accounts")).rows.length,
        10,
      );
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(
          db.query("select * from public.x_accounts"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from public.x_claim_delivery()"),
          /permission denied/,
        );
        await db.exec("reset role");
      }
    },
  );
  await t.test(
    "reenvio da mesma requisição não duplica campanha nem entrega",
    async () => {
      const id = requestId();
      const a = await create({ id });
      const b = await create({ id });
      assert.equal(a, b);
      assert.equal(
        (
          await db.query(
            "select id from public.x_deliveries where campaign_id=$1",
            [a],
          )
        ).rows.length,
        1,
      );
    },
  );
  await t.test(
    "uma entrega só pode receber um claim; cancelamento preserva envio em andamento",
    async () => {
      const first = (
        await db.query<{ id: string; lock_token: string; campaign_id: string }>(
          "select * from public.x_claim_delivery()",
        )
      ).rows[0];
      assert.ok(first.lock_token);
      assert.equal(
        (await db.query("select * from public.x_claim_delivery()")).rows.length,
        0,
      );
      await db.query("select public.x_cancel_campaign($1)", [
        first.campaign_id,
      ]);
      assert.equal(
        (
          await db.query<{ status: string }>(
            "select status from public.x_deliveries where id=$1",
            [first.id],
          )
        ).rows[0].status,
        "processing",
      );
    },
  );
  await t.test(
    "claim vencido torna-se incerto e não volta à fila",
    async () => {
      await db.exec(
        "update public.x_deliveries set locked_at=now()-interval '10 minutes' where status='processing'",
      );
      assert.equal(
        (await db.query("select * from public.x_claim_delivery()")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query<{ status: string }>(
            "select status from public.x_deliveries limit 1",
          )
        ).rows[0].status,
        "uncertain",
      );
    },
  );
  await t.test(
    "rascunhos, contas pausadas e horários futuros não são enviados",
    async () => {
      await create({ draft: true });
      await create({ date: "2099-01-01T00:00:00Z" });
      await create({ account: 2 });
      await db.exec("update public.x_accounts set active=false where id=2");
      assert.equal(
        (await db.query("select * from public.x_claim_delivery()")).rows.length,
        0,
      );
    },
  );
  await t.test("conta inválida reverte campanha inteira", async () => {
    const id = requestId();
    await assert.rejects(create({ id, account: 7 }), /não foi conectada/);
    assert.equal(
      (
        await db.query(
          "select id from public.x_campaigns where request_id=$1",
          [id],
        )
      ).rows.length,
      0,
    );
  });
  await t.test("cancelar pendentes e excluir só rascunhos", async () => {
    const c = await create({ account: 3 });
    await db.query("select public.x_cancel_campaign($1)", [c]);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.x_deliveries where campaign_id=$1",
          [c],
        )
      ).rows[0].status,
      "canceled",
    );
    const draft = await create({ draft: true });
    await db.query("select public.x_delete_draft($1)", [draft]);
    assert.equal(
      (await db.query("select id from public.x_campaigns where id=$1", [draft]))
        .rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select public.x_delete_draft($1) as ok",
          [c],
        )
      ).rows[0].ok,
      false,
    );
  });
  await db.close();
});
