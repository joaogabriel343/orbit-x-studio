import {
  X,
  Check,
  Clock3,
  Loader2,
  AlertTriangle,
  FileText,
  Ban,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { Account } from "../../supabase/functions/_shared/domain";
export function OrbitLogo() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <ellipse cx="20" cy="20" rx="16" ry="7.5" transform="rotate(-40 20 20)" />
      <circle cx="20" cy="20" r="7.5" />
      <circle cx="31" cy="11" r="3" className="logo-dot" />
    </svg>
  );
}
export function XLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-7.4L5.5 22H2.3l7.2-8.5L.8 2h6.5l4.5 6.7L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
    </svg>
  );
}
export function Avatar({
  account,
  size = "normal",
}: {
  account: Account;
  size?: "small" | "normal" | "large";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: account.color, color: "#263225" }}
      title={account.name}
    >
      {account.avatar_url ? (
        <img
          src={account.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span>
          {account.name
            .split(" ")
            .filter((v) => v !== "&")
            .slice(0, 2)
            .map((v) => v[0])
            .join("")
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}
export function AvatarStack({ accounts }: { accounts: Account[] }) {
  return (
    <div className="avatar-stack">
      {accounts.slice(0, 4).map((a) => (
        <Avatar key={a.id} account={a} size="small" />
      ))}
      {accounts.length > 4 && (
        <span className="avatar avatar-small extra">
          +{accounts.length - 4}
        </span>
      )}
    </div>
  );
}
const statuses: Record<string, { label: string; icon: typeof Clock3 }> = {
  scheduled: { label: "Agendada", icon: Clock3 },
  pending: { label: "Na fila", icon: Clock3 },
  published: { label: "Publicada", icon: Check },
  draft: { label: "Rascunho", icon: FileText },
  processing: { label: "Publicando", icon: Loader2 },
  failed: { label: "Falhou", icon: AlertTriangle },
  uncertain: { label: "Conferir no X", icon: AlertTriangle },
  partial: { label: "Parcial", icon: AlertTriangle },
  canceled: { label: "Cancelada", icon: Ban },
};
export function Status({ value }: { value: string }) {
  const s = statuses[value] ?? statuses.failed;
  return (
    <span className={`status status-${value}`}>
      <s.icon size={12} />
      {s.label}
    </span>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = dialog.current;
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) ?? [],
      );
    focusables()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const elements = focusables();
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
