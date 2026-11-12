import { useState } from "react";
import {
  CalendarDays,
  Clock3,
  ArrowUpRight,
  ChevronDown,
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  Check,
  Send,
  Loader2,
  FileText,
  Globe2,
} from "lucide-react";
import {
  type Account,
  type Campaign,
  type CampaignInput,
  countText,
  validateCampaign,
} from "../../supabase/functions/_shared/domain";
import { Modal, Avatar, XLogo } from "./Primitives";
import { dateTimeInput, zonedToIso, ZONES, DEFAULT_ZONE } from "../lib/dates";
interface Props {
  accounts: Account[];
  initial?: Campaign | null;
  initialDate?: string;
  initialAccountId?: number;
  onClose: () => void;
  onSave: (input: CampaignInput) => Promise<void>;
  demo: boolean;
}
export default function Composer({
  accounts,
  initial,
  initialDate,
  initialAccountId,
  onClose,
  onSave,
  demo,
}: Props) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [ids, setIds] = useState<number[]>(
    initial?.deliveries.map((d) => d.account_id) ??
      accounts
        .filter(
          (a) =>
            a.active &&
            a.verified_at &&
            (!initialAccountId || a.id === initialAccountId),
        )
        .slice(0, 1)
        .map((a) => a.id),
  );
  const [variants, setVariants] = useState<Record<string, string>>(
    Object.fromEntries(
      initial?.deliveries.map((d) => [String(d.account_id), d.body]) ?? [],
    ),
  );
  const [custom, setCustom] = useState((initial?.deliveries.length ?? 0) > 1);
  const [zone, setZone] = useState(initial?.timezone ?? DEFAULT_ZONE);
  const [when, setWhen] = useState(
    dateTimeInput(
      initialDate ?? new Date(Date.now() + 3600000),
      initial?.timezone ?? DEFAULT_ZONE,
    ),
  );
  const [timing, setTiming] = useState<"schedule" | "now">("schedule");
  const [previewId, setPreviewId] = useState(ids[0] ?? 1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(crypto.randomUUID());
  const selected = accounts.filter((a) => ids.includes(a.id));
  const preview =
    selected.find((a) => a.id === previewId) ?? selected[0] ?? accounts[0];
  const previewText =
    (custom && preview ? variants[String(preview.id)] : undefined) ?? body;
  function toggle(id: number) {
    setIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
    setRequestId(crypto.randomUUID());
  }
  async function submit(draft: boolean) {
    setError("");
    setBusy(true);
    try {
      const scheduledAt =
        draft || timing === "now"
          ? new Date().toISOString()
          : zonedToIso(when, zone);
      const input: CampaignInput = {
        requestId,
        title,
        body,
        accountIds: ids,
        variants: custom ? variants : {},
        scheduledAt,
        timezone: zone,
        draft,
      };
      validateCampaign(input, accounts);
      await onSave(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={
        initial ? "Usar publicação como base" : "Uma nova ideia para o mundo"
      }
      subtitle="Escolha as contas, prepare o conteúdo e deixe o horário com a gente."
      onClose={busy ? () => {} : onClose}
    >
      <div className="composer-layout">
        <div className="composer-form">
          <div className="field-heading">
            <span className="eyebrow">01 / ONDE PUBLICAR</span>
            <button
              className="text-button"
              onClick={() => {
                setIds(
                  accounts
                    .filter((a) => a.active && a.verified_at)
                    .map((a) => a.id),
                );
                setCustom(true);
              }}
            >
              Selecionar conectadas
            </button>
          </div>
          <div className="account-chips">
            {accounts.map((a) => (
              <button
                key={a.id}
                className={`account-chip ${ids.includes(a.id) ? "selected" : ""}`}
                disabled={!a.active || !a.verified_at}
                onClick={() => toggle(a.id)}
                title={!a.verified_at ? "Conecte esta conta primeiro" : a.name}
              >
                <Avatar account={a} size="small" />
                <span>{a.name}</span>
                {ids.includes(a.id) && <Check size={13} />}
              </button>
            ))}
          </div>
          <div className="field-heading">
            <span className="eyebrow">02 / O QUE VAMOS COMPARTILHAR?</span>
            <span className={countText(body) > 280 ? "danger-text" : "muted"}>
              {countText(body)} / 280
            </span>
          </div>
          <label className="sr-only" htmlFor="post-title">
            Título interno
          </label>
          <input
            id="post-title"
            className="title-input"
            placeholder="Título interno (opcional)"
            value={title}
            maxLength={100}
            onChange={(e) => {
              setTitle(e.target.value);
              setRequestId(crypto.randomUUID());
            }}
          />
          <label className="sr-only" htmlFor="post-body">
            Texto da publicação
          </label>
          <textarea
            id="post-body"
            className="post-textarea"
            placeholder="O que merece uma boa conversa hoje?"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setRequestId(crypto.randomUUID());
            }}
            rows={5}
          />
          <div className="editor-foot">
            <span>
              <FileText size={14} /> Publicação de texto e links
            </span>
            <span>Links contam como 23 caracteres</span>
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => setCustom(e.target.checked)}
            />{" "}
            Personalizar o texto por conta
          </label>
          {custom && (
            <div className="variant-list">
              {selected.map((a) => (
                <label key={a.id}>
                  <span>
                    <Avatar account={a} size="small" /> {a.name}
                    <small>
                      {countText(variants[String(a.id)] ?? body)}/280
                    </small>
                  </span>
                  <textarea
                    rows={3}
                    placeholder="Escreva o conteúdo específico deste perfil"
                    value={variants[String(a.id)] ?? body}
                    onChange={(e) => {
                      setVariants((v) => ({
                        ...v,
                        [String(a.id)]: e.target.value,
                      }));
                      setRequestId(crypto.randomUUID());
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          {ids.length > 1 && (
            <p className="field-note">
              Prepare conteúdos próprios para cada perfil. O X restringe posts
              duplicados ou muito semelhantes entre contas.
            </p>
          )}
          <div className="field-heading">
            <span className="eyebrow">03 / O MOMENTO CERTO</span>
          </div>
          <div className="segmented timing">
            <button
              className={timing === "schedule" ? "active" : ""}
              onClick={() => setTiming("schedule")}
            >
              <CalendarDays size={15} />
              Agendar
            </button>
            <button
              className={timing === "now" ? "active" : ""}
              onClick={() => setTiming("now")}
            >
              <Send size={14} />
              Publicar agora
            </button>
          </div>
          {timing === "schedule" && (
            <div className="schedule-inputs">
              <label>
                <span>Data e horário</span>
                <input
                  aria-label="Data e horário"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => {
                    setWhen(e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
              </label>
              <label>
                <span>Fuso horário</span>
                <select
                  value={zone}
                  onChange={(e) => {
                    setZone(e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                >
                  {ZONES.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {timing === "now" && (
            <p className="field-note">
              O worker enviará na próxima consulta da fila. Ele precisa estar
              ligado.
            </p>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <aside className="composer-preview">
          <span className="eyebrow">PRÉVIA NO X</span>
          <div className="preview-select">
            <select
              aria-label="Conta da prévia"
              value={preview?.id ?? ""}
              onChange={(e) => setPreviewId(Number(e.target.value))}
            >
              {selected.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="tweet-preview">
            {preview && (
              <>
                <div className="tweet-head">
                  <Avatar account={preview} />
                  <div>
                    <strong>{preview.name}</strong>
                    <span>@{preview.username || "sua_conta"} · agora</span>
                  </div>
                  <XLogo />
                </div>
                <p className={!previewText ? "placeholder-text" : ""}>
                  {previewText || "Sua próxima boa ideia aparece aqui."}
                </p>
                <div className="tweet-actions">
                  <MessageCircle />
                  <Repeat2 />
                  <Heart />
                  <Share />
                </div>
              </>
            )}
          </div>
          <p className="preview-note">
            <Globe2 size={14} /> A prévia é ilustrativa. O conteúdo será
            publicado na conta selecionada.
          </p>
          <div className="composer-tip">
            <span className="mini-spark">✳</span>
            <strong>Uma boa conversa começa com você.</strong>
            <p>
              Seja útil, seja claro e escreva para as pessoas do outro lado da
              tela.
            </p>
          </div>
        </aside>
      </div>
      <footer className="modal-footer">
        <span className="muted">
          {demo
            ? "Demonstração · nenhum post será enviado"
            : `${ids.length} conta${ids.length === 1 ? "" : "s"} selecionada${ids.length === 1 ? "" : "s"}`}
        </span>
        <div>
          <button
            className="button button-ghost"
            disabled={busy}
            onClick={() => submit(true)}
          >
            <FileText size={15} />
            Salvar rascunho
          </button>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => submit(false)}
          >
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Clock3 size={16} />
            )}{" "}
            {timing === "now" ? "Adicionar à fila" : "Agendar publicação"}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </footer>
    </Modal>
  );
}
