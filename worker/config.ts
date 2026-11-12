import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
export const dataDir = resolve(process.env.WORKER_DATA_DIR || ".local");
export const headless = process.env.WORKER_HEADLESS !== "false";
export const pollMs = Math.max(
  10000,
  Number(process.env.WORKER_POLL_SECONDS || 20) * 1000 || 20000,
);
export function database() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret)
    throw new Error(
      "Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env do worker.",
    );
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function accountId(value: string | undefined) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1 || id > 10)
    throw new Error(
      "Informe uma conta de 1 a 10. Ex.: npm run account:connect -- 1",
    );
  return id;
}
