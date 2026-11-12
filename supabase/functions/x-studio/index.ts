import { createClient } from "@supabase/supabase-js";
import { validateCampaign, type CampaignInput } from "../_shared/domain.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const origins = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173")
  .split(",")
  .map((v) => v.trim());
const check = <T>(result: { data: T; error: unknown }) => {
  if (result.error)
    throw new Error(
      "Não foi possível acessar os dados. Confira a instalação do SQL.",
    );
  return result.data;
};

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (origin && origins.includes(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Headers"] =
    "authorization,apikey,content-type,x-client-info";
  headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.includes(origin))
    return json({ error: "Origem não autorizada." }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  try {
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!token)
      return json({ error: "Abra o painel pelo sistema principal." }, 401);
    const {
      data: { user },
      error,
    } = await db.auth.getUser(token);
    if (error || !user)
      return json(
        { error: "Sessão expirada. Reabra pelo sistema principal." },
        401,
      );
    const admin = check(
      await db
        .from("x_studio_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
    );
    if (!admin)
      return json({ error: "Seu usuário não tem acesso a este painel." }, 403);
    const path = new URL(request.url).pathname.split("/x-studio")[1] ?? "/";
    if (request.method === "GET" && path === "/bootstrap") {
      const accounts =
        check(await db.from("x_accounts").select("*").order("id")) ?? [];
      const campaigns = check(
        await db
          .from("x_campaigns")
          .select("*,deliveries:x_deliveries(*)")
          .order("created_at", { ascending: false })
          .limit(500),
      );
      const worker = check(
        await db.from("x_worker_state").select("*").eq("id", true).single(),
      );
      return json({
        accounts: accounts.map((a) => ({
          ...a,
          configured: Boolean(a.verified_at),
        })),
        campaigns,
        worker,
        user: {
          name:
            user.user_metadata?.full_name ??
            user.email?.split("@")[0] ??
            "Operador",
        },
      });
    }
    if (Number(request.headers.get("content-length") ?? 0) > 65536)
      return json({ error: "Conteúdo muito grande." }, 413);
    const accountMatch = path.match(/^\/accounts\/(\d+)$/);
    if (request.method === "PATCH" && accountMatch) {
      const body = await request.json();
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof body.active === "boolean") patch.active = body.active;
      if (
        typeof body.name === "string" &&
        body.name.trim() &&
        body.name.length <= 80
      )
        patch.name = body.name.trim();
      const data = check(
        await db
          .from("x_accounts")
          .update(patch)
          .eq("id", Number(accountMatch[1]))
          .select()
          .single(),
      );
      return json(data);
    }
    if (request.method === "POST" && path === "/campaigns") {
      const body = (await request.json()) as CampaignInput;
      if (
        typeof body.body !== "string" ||
        typeof body.title !== "string" ||
        !Array.isArray(body.accountIds) ||
        typeof body.variants !== "object" ||
        body.variants === null ||
        typeof body.draft !== "boolean"
      )
        return json({ error: "Dados da publicação inválidos." }, 400);
      const accounts = check(await db.from("x_accounts").select("*")) ?? [];
      let deliveries;
      try {
        deliveries = validateCampaign(
          body,
          accounts.map((a) => ({ ...a, configured: Boolean(a.verified_at) })),
        );
      } catch (e) {
        return json(
          { error: e instanceof Error ? e.message : "Publicação inválida." },
          400,
        );
      }
      const id = check(
        await db.rpc("x_create_campaign", {
          p_request_id: body.requestId,
          p_title: body.title.trim() || body.body.slice(0, 80),
          p_body: body.body,
          p_scheduled_at: body.scheduledAt,
          p_timezone: body.timezone,
          p_draft: body.draft,
          p_created_by: user.id,
          p_deliveries: deliveries,
        }),
      );
      return json({ id }, 201);
    }
    const match = path.match(/^\/campaigns\/([a-f0-9-]{36})(?:\/(cancel))?$/i);
    if (match && request.method === "POST" && match[2] === "cancel") {
      const canceled = check(
        await db.rpc("x_cancel_campaign", { p_id: match[1] }),
      );
      return json({ ok: canceled }, canceled ? 200 : 404);
    }
    if (match && request.method === "DELETE" && !match[2]) {
      const deleted = check(await db.rpc("x_delete_draft", { p_id: match[1] }));
      return json({ ok: deleted }, deleted ? 200 : 404);
    }
    return json({ error: "Rota não encontrada." }, 404);
  } catch (e) {
    console.error(
      "x-studio request failed:",
      e instanceof Error ? e.name : "unknown",
    );
    return json(
      {
        error:
          "Não foi possível concluir. Confira a configuração do Supabase e tente novamente.",
      },
      500,
    );
  }
});
