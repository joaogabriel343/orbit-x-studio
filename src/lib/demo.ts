import {
  COLORS,
  type Account,
  type Campaign,
  type CampaignInput,
} from "../../supabase/functions/_shared/domain";
const STORE = "orbit-demo-v1";
export interface WorkerState {
  last_run_at: string | null;
  last_error: string | null;
  last_processed: number;
}
export interface Bootstrap {
  accounts: Account[];
  campaigns: Campaign[];
  worker: WorkerState;
  user: { name: string };
}
const at = (days: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
function seed(): Bootstrap {
  const names = [
    ["Orbit Studio", "orbitstudio"],
    ["Forma & Função", "formaefuncao"],
    ["Café com Design", "cafecomdesign"],
    ["Norte Digital", "nortedigital"],
    ["Clube Criativo", "clubecriativo"],
    ["Ponto de Vista", "pontodevista"],
  ];
  const accounts = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: names[i]?.[0] ?? `Conta ${i + 1}`,
    username: names[i]?.[1] ?? "",
    color: COLORS[i],
    avatar_url: null,
    active: true,
    verified_at: i < 6 ? new Date().toISOString() : null,
    followers: null,
    last_error: null,
    configured: i < 6,
  }));
  const rows: [
    string,
    string,
    number,
    number,
    number[],
    "draft" | "scheduled",
    boolean,
  ][] = [
    [
      "Pequenas ideias, grandes começos.",
      "Toda grande ideia começa com um primeiro passo. Qual projeto você vai tirar do papel nesta semana? ✳️",
      0,
      18,
      [1, 3, 5],
      "scheduled",
      false,
    ],
    [
      "Um olhar para o que vem por aí",
      "O futuro é feito das escolhas que fazemos hoje. Estamos preparando algo especial para compartilhar com você.",
      0,
      20,
      [2, 4],
      "scheduled",
      false,
    ],
    [
      "Mais espaço para criar",
      "Uma pausa também faz parte do processo. Respire, observe e dê espaço para a próxima boa ideia.",
      1,
      10,
      [1, 6],
      "scheduled",
      false,
    ],
    [
      "Design que aproxima",
      "Acreditamos no design que simplifica a vida e aproxima pessoas. Conheça nosso processo criativo.",
      2,
      14,
      [2],
      "scheduled",
      false,
    ],
    [
      "O melhor da semana",
      "Uma seleção de referências para inspirar seu próximo projeto. Salve para consultar depois.",
      3,
      9,
      [3, 5],
      "scheduled",
      false,
    ],
    [
      "Bastidores do estúdio",
      "Um pouco do que acontece por aqui: ideias, café e muita vontade de criar coisas boas.",
      -1,
      14,
      [1, 2, 4],
      "scheduled",
      true,
    ],
    [
      "Manifesto criativo",
      "Criar é conectar pontos que ninguém tinha conectado antes. Continue curioso.",
      -2,
      11,
      [5, 6],
      "scheduled",
      true,
    ],
    [
      "Ideias para o próximo mês",
      "Novos formatos, novas conversas. Um espaço para planejar o que vem depois.",
      1,
      15,
      [1],
      "draft",
      false,
    ],
  ];
  const campaigns = rows.map(
    ([title, body, days, hour, ids, state, published], i) => ({
      id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      title,
      body,
      scheduled_at: at(days, hour),
      timezone: "America/Sao_Paulo",
      state,
      created_at: at(-3, 12),
      deliveries: ids.map((id) => ({
        id: crypto.randomUUID(),
        account_id: id,
        body:
          ids.length > 1
            ? `${body}\n\nUma conversa com ${accounts[id - 1].name}.`
            : body,
        status: published ? ("published" as const) : ("pending" as const),
        attempts: published ? 1 : 0,
        error: null,
        tweet_id: null,
        published_at: published ? at(days, hour) : null,
        next_attempt_at: at(days, hour),
      })),
    }),
  );
  return {
    accounts,
    campaigns,
    worker: { last_run_at: null, last_error: null, last_processed: 0 },
    user: { name: "Seu espaço" },
  };
}
export function demoLoad(): Bootstrap {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch {
    /* Local storage pode estar desativado. */
  }
  return seed();
}
export function demoSave(data: Bootstrap) {
  try {
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch {
    /* Sessão de demonstração continua em memória. */
  }
}
export function demoCampaign(input: CampaignInput): Campaign {
  return {
    id: crypto.randomUUID(),
    request_id: input.requestId,
    title: input.title.trim() || input.body.slice(0, 80),
    body: input.body,
    scheduled_at: input.scheduledAt,
    timezone: input.timezone,
    state: input.draft ? "draft" : "scheduled",
    created_at: new Date().toISOString(),
    deliveries: input.accountIds.map((id) => ({
      id: crypto.randomUUID(),
      account_id: id,
      body: (input.variants[String(id)] ?? input.body).trim(),
      status: "pending",
      attempts: 0,
      error: null,
      tweet_id: null,
      published_at: null,
      next_attempt_at: input.scheduledAt,
    })),
  };
}
