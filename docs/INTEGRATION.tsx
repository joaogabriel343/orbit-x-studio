// Exemplo para o sistema React PRINCIPAL, que já possui login Supabase.
// Use o cliente Supabase existente. Não crie outro fluxo de autenticação.
import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

const PANEL_URL = "https://painel.seudominio.com";
const PANEL_ORIGIN = new URL(PANEL_URL).origin;

export function OrbitPanel({ supabase }: { supabase: SupabaseClient }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let alive = true;
    const send = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (alive)
        frame.current?.contentWindow?.postMessage(
          { type: "orbit:session", accessToken: session?.access_token ?? null },
          PANEL_ORIGIN,
        );
    };
    const ready = (event: MessageEvent) => {
      if (
        event.origin !== PANEL_ORIGIN ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (event.data?.type === "orbit:ready") void send();
    };
    window.addEventListener("message", ready);
    // Também transmite renovação do token e logout do sistema principal.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive)
        frame.current?.contentWindow?.postMessage(
          { type: "orbit:session", accessToken: session?.access_token ?? null },
          PANEL_ORIGIN,
        );
    });
    void send();
    return () => {
      alive = false;
      window.removeEventListener("message", ready);
      subscription.unsubscribe();
    };
  }, [supabase]);
  return (
    <iframe
      ref={frame}
      src={PANEL_URL}
      title="Orbit — Publicações no X"
      style={{
        width: "100%",
        height: "calc(100vh - 80px)",
        border: 0,
        borderRadius: 12,
      }}
    />
  );
}
