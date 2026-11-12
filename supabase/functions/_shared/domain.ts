import twitterText from "twitter-text";

export type DeliveryStatus =
  "pending" | "processing" | "published" | "failed" | "uncertain" | "canceled";
export interface Account {
  id: number;
  name: string;
  username: string;
  avatar_url: string | null;
  color: string;
  active: boolean;
  verified_at: string | null;
  followers: number | null;
  last_error: string | null;
  configured?: boolean;
}
export interface Delivery {
  id: string;
  account_id: number;
  body: string;
  status: DeliveryStatus;
  attempts: number;
  error: string | null;
  tweet_id: string | null;
  published_at: string | null;
  next_attempt_at: string;
}
export interface Campaign {
  id: string;
  request_id: string;
  title: string;
  body: string;
  scheduled_at: string;
  timezone: string;
  state: "draft" | "scheduled" | "canceled";
  created_at: string;
  deliveries: Delivery[];
}
export interface CampaignInput {
  requestId: string;
  title: string;
  body: string;
  accountIds: number[];
  variants: Record<string, string>;
  scheduledAt: string;
  timezone: string;
  draft: boolean;
}
export const COLORS = [
  "#c8ed89",
  "#c8b8fb",
  "#9fcef0",
  "#efc396",
  "#eea6b0",
  "#83d4bd",
  "#d9cf92",
  "#b6c1f4",
  "#e1b1df",
  "#b6d5a4",
];
export function countText(text: string) {
  return twitterText.parseTweet(text).weightedLength;
}
export function campaignStatus(campaign: Campaign): string {
  if (campaign.state === "draft") return "draft";
  const jobs = campaign.deliveries;
  if (jobs.some((job) => job.status === "processing")) return "processing";
  if (jobs.some((job) => job.status === "pending")) return "scheduled";
  if (jobs.some((job) => job.status === "uncertain")) return "uncertain";
  if (jobs.length && jobs.every((job) => job.status === "published"))
    return "published";
  if (jobs.some((job) => job.status === "published")) return "partial";
  if (jobs.some((job) => job.status === "failed")) return "failed";
  return "canceled";
}
export function validateCampaign(
  input: CampaignInput,
  accounts: Account[],
  now = Date.now(),
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.requestId,
    )
  )
    throw new Error("Identificador da publicação inválido.");
  if (input.title.trim().length > 100)
    throw new Error("O título deve ter até 100 caracteres.");
  if (
    !input.accountIds.length ||
    input.accountIds.length > 10 ||
    new Set(input.accountIds).size !== input.accountIds.length
  )
    throw new Error("Selecione entre 1 e 10 contas diferentes.");
  if (!Number.isFinite(Date.parse(input.scheduledAt)))
    throw new Error("Escolha uma data e um horário válidos.");
  if (!input.draft && Date.parse(input.scheduledAt) < now - 120_000)
    throw new Error("O horário escolhido já passou.");
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: input.timezone });
  } catch {
    throw new Error("Fuso horário inválido.");
  }
  const contents = input.accountIds.map((id) => {
    const account = accounts.find((a) => a.id === id);
    if (!account || !account.active)
      throw new Error(
        "Uma das contas selecionadas está pausada ou não existe.",
      );
    if (!input.draft && (!account.configured || !account.verified_at))
      throw new Error(
        `Verifique a conexão de ${account.name} antes de agendar.`,
      );
    const text = (input.variants[String(id)] ?? input.body).trim();
    const parsed = twitterText.parseTweet(text);
    if (!text || !parsed.valid)
      throw new Error(
        `O texto de ${account.name} deve ter entre 1 e 280 caracteres válidos para o X.`,
      );
    return { account_id: id, body: text };
  });
  const normalized = contents.map((c) =>
    c.body.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim(),
  );
  if (!input.draft && new Set(normalized).size !== normalized.length)
    throw new Error(
      "Personalize o conteúdo de cada conta. O X restringe publicações duplicadas entre perfis.",
    );
  return contents;
}
