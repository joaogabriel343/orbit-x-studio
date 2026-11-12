import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// A prévia distribuída é explícita. Produção exige false e as duas variáveis.
export const isDemo = import.meta.env.VITE_DEMO_MODE !== "false";
export const parentOrigin = import.meta.env.VITE_PARENT_ORIGIN;
let token: string | null = null;
let currentUser: string | null = null;
export function setSessionToken(value: string | null) {
  token = value;
  // JWT é validado pelo Supabase na função; aqui só detectamos troca de usuário.
  try {
    currentUser = value
      ? JSON.parse(
          atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ).sub
      : null;
  } catch {
    currentUser = null;
  }
}
export function sessionUser() {
  return currentUser;
}
export function hasSession() {
  return Boolean(token);
}
export async function loadExistingSession(
  onToken: (value: string | null) => void,
) {
  if (!url || !key || isDemo) return () => {};
  const client = createClient(url, key);
  const { data } = await client.auth.getSession();
  if (data.session) onToken(data.session.access_token);
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) =>
    onToken(session?.access_token ?? null),
  );
  return () => {
    subscription.unsubscribe();
    client.auth.stopAutoRefresh();
  };
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!url || !key)
    throw new Error(
      "Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  if (!token)
    throw new Error(
      "Abra este painel pelo sistema principal para receber sua sessão.",
    );
  const response = await fetch(`${url}/functions/v1/x-studio${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "O Supabase não retornou uma resposta válida. Confira o deploy da Edge Function.",
    );
  }
  if (!response.ok)
    throw new Error(data.error ?? "Não foi possível concluir a solicitação.");
  return data;
}
