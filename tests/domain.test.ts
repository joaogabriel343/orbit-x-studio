import test from "node:test";
import assert from "node:assert/strict";
import {
  countText,
  validateCampaign,
  campaignStatus,
  type CampaignInput,
  type Account,
  type Campaign,
} from "../supabase/functions/_shared/domain.ts";
import { zonedToIso, dateTimeInput } from "../src/lib/dates.ts";
const accounts: Account[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: `Conta ${i + 1}`,
  username: `account${i + 1}`,
  color: "#aaa",
  avatar_url: null,
  active: true,
  verified_at: new Date().toISOString(),
  followers: null,
  last_error: null,
  configured: true,
}));
const input = (): CampaignInput => ({
  requestId: crypto.randomUUID(),
  title: "Minha ideia",
  body: "Uma publicação de teste.",
  accountIds: [1],
  variants: {},
  scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  timezone: "America/Sao_Paulo",
  draft: false,
});
test("links longos e emojis usam a contagem ponderada do X", () => {
  assert.equal(countText("https://example.com/" + "a".repeat(300)), 23);
  assert.equal(countText("👨‍👩‍👧‍👦"), 2);
  assert.equal(
    validateCampaign(
      { ...input(), body: "https://example.com/" + "a".repeat(300) },
      accounts,
    ).length,
    1,
  );
  assert.throws(
    () => validateCampaign({ ...input(), body: "á".repeat(281) }, accounts),
    /280/,
  );
});
test("permite as dez contas com textos próprios, impede contas repetidas e pausadas", () => {
  const ids = accounts.map((a) => a.id);
  const result = validateCampaign(
    {
      ...input(),
      accountIds: ids,
      variants: Object.fromEntries(
        ids.map((id) => [id, `Conteúdo específico da conta ${id}.`]),
      ),
    },
    accounts,
  );
  assert.equal(result.length, 10);
  assert.throws(
    () => validateCampaign({ ...input(), accountIds: [1, 1] }, accounts),
    /diferentes/,
  );
  assert.throws(
    () =>
      validateCampaign(
        input(),
        accounts.map((a) => ({ ...a, active: false })),
      ),
    /pausada/,
  );
});
test("impede agendar com sessão vencida, mas deixa guardar rascunhos", () => {
  const expired = accounts.map((a) => ({
    ...a,
    verified_at: null,
    configured: false,
  }));
  assert.throws(() => validateCampaign(input(), expired), /conexão/);
  assert.equal(
    validateCampaign({ ...input(), draft: true }, expired).length,
    1,
  );
});
test("valida duplicação entre contas, horário passado e fuso inválido", () => {
  assert.throws(
    () =>
      validateCampaign(
        {
          ...input(),
          accountIds: [1, 2],
          variants: { "2": " UMA   PUBLICAÇÃO de TESTE. " },
        },
        accounts,
      ),
    /duplicadas/,
  );
  assert.throws(
    () =>
      validateCampaign(
        { ...input(), scheduledAt: "2020-01-01T12:00:00Z" },
        accounts,
      ),
    /passou/,
  );
  assert.throws(
    () => validateCampaign({ ...input(), timezone: "invalid" }, accounts),
    /Fuso/,
  );
});
test("converte São Paulo, Manaus e Lisboa para UTC e rejeita horário inexistente no DST", () => {
  assert.equal(
    zonedToIso("2026-11-12T10:30", "America/Sao_Paulo"),
    "2026-11-12T13:30:00.000Z",
  );
  assert.equal(
    zonedToIso("2026-11-12T10:30", "America/Manaus"),
    "2026-11-12T14:30:00.000Z",
  );
  assert.equal(
    dateTimeInput(
      zonedToIso("2026-07-12T10:30", "Europe/Lisbon"),
      "Europe/Lisbon",
    ),
    "2026-07-12T10:30",
  );
  assert.throws(
    () => zonedToIso("2026-03-08T02:30", "America/New_York"),
    /não existe/,
  );
});
test("relata envio parcial, incerto e cancelamento com uma entrega já publicada", () => {
  const c = {
    state: "scheduled",
    deliveries: [{ status: "published" }, { status: "failed" }],
  } as Campaign;
  assert.equal(campaignStatus(c), "partial");
  assert.equal(
    campaignStatus({ ...c, deliveries: [{ status: "uncertain" }] } as Campaign),
    "uncertain",
  );
  assert.equal(
    campaignStatus({
      ...c,
      state: "canceled",
      deliveries: [{ status: "published" }, { status: "canceled" }],
    } as Campaign),
    "partial",
  );
});
