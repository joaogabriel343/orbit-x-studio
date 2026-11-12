import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Layers,
  Users,
  Settings2,
  Search,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Clock3,
  Check,
  CheckCheck,
  Radio,
  SlidersHorizontal,
  MoreHorizontal,
  ExternalLink,
  Copy,
  CheckCircle2,
  Info,
  RefreshCw,
  Menu,
  X,
  Loader2,
  AlertCircle,
  Link2,
  FileText,
  Activity,
  LogOut,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  type Account,
  type Campaign,
  type CampaignInput,
  campaignStatus,
  validateCampaign,
} from "../supabase/functions/_shared/domain";
import {
  isDemo,
  parentOrigin,
  request,
  loadExistingSession,
  setSessionToken,
  sessionUser,
  hasSession,
} from "./lib/api";
import { type Bootstrap, demoLoad, demoSave, demoCampaign } from "./lib/demo";
import { DEFAULT_ZONE, dateKey, timeLabel, dayLabel } from "./lib/dates";
import {
  OrbitLogo,
  Avatar,
  AvatarStack,
  Status,
  Modal,
  XLogo,
} from "./components/Primitives";
import Composer from "./components/Composer";
type View = "overview" | "calendar" | "posts" | "accounts" | "settings";
const nav = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
  { id: "posts", label: "Publicações", icon: Layers },
  { id: "accounts", label: "Contas conectadas", icon: Users },
] as const;
const EMPTY: Bootstrap = {
  accounts: [],
  campaigns: [],
  worker: { last_run_at: null, last_error: null, last_processed: 0 },
  user: { name: "Workspace" },
};

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<Bootstrap>(() =>
    isDemo ? demoLoad() : EMPTY,
  );
  const [loading, setLoading] = useState(!isDemo);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState(0);
  const [accountMenu, setAccountMenu] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [postFilter, setPostFilter] = useState("all");
  const [composer, setComposer] = useState<{
    initial?: Campaign;
    date?: string;
  } | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [connect, setConnect] = useState<Account | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()));
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authVersion = useRef(0);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const refresh = useCallback(async () => {
    if (isDemo) return;
    const version = authVersion.current;
    try {
      const value = await request<Bootstrap>("/bootstrap");
      if (version === authVersion.current) {
        setData(value);
        setLoadError("");
      }
    } catch (e) {
      if (version === authVersion.current)
        setLoadError(
          e instanceof Error
            ? e.message
            : "Não foi possível carregar o painel.",
        );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (isDemo) return;
    const accept = (value: string | null) => {
      const previous = sessionUser();
      setSessionToken(value);
      authVersion.current++;
      if (previous !== sessionUser() || !value) {
        setData(EMPTY);
        setDetail(null);
        setComposer(null);
      }
      if (value) void refresh();
      else {
        setLoading(false);
        setLoadError(
          "Abra o painel pelo sistema principal para receber sua sessão.",
        );
      }
    };
    const handler = (event: MessageEvent) => {
      if (
        !parentOrigin ||
        event.origin !== parentOrigin ||
        event.source !== window.parent
      )
        return;
      if (
        event.data?.type === "orbit:session" &&
        (typeof event.data.accessToken === "string" ||
          event.data.accessToken === null)
      )
        accept(event.data.accessToken);
    };
    window.addEventListener("message", handler);
    if (parentOrigin && window.parent !== window)
      window.parent.postMessage({ type: "orbit:ready" }, parentOrigin);
    let stop: (() => void) | undefined;
    let disposed = false;
    // Em iframe de outra origem, a sessão vem exclusivamente de postMessage.
    if (window.parent === window)
      void loadExistingSession(accept).then((cleanup) => {
        if (disposed) cleanup();
        else stop = cleanup;
      });
    const loadingTimeout = setTimeout(() => {
      if (!hasSession()) {
        setLoading(false);
        setLoadError(
          "Aguardando a sessão do sistema principal. Configure a integração descrita no README.",
        );
      }
    }, 2000);
    const timer = setInterval(() => {
      if (hasSession()) void refresh();
    }, 30000);
    return () => {
      disposed = true;
      stop?.();
      clearInterval(timer);
      clearTimeout(loadingTimeout);
      window.removeEventListener("message", handler);
    };
  }, [refresh]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const editing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (e.key === "/" && !editing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (
        e.key.toLowerCase() === "n" &&
        !editing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        setComposer({});
      }
      if (e.key === "Escape") {
        setMobileMenu(false);
        setAccountMenu(false);
        setNotifications(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (isDemo) demoSave(data);
  }, [data]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const visible = data.campaigns.filter(
    (c) =>
      (!accountFilter ||
        c.deliveries.some((d) => d.account_id === accountFilter)) &&
      (!search ||
        `${c.title} ${c.body} ${c.deliveries.map((d) => data.accounts.find((a) => a.id === d.account_id)?.name).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const pending = visible
    .filter(
      (c) =>
        campaignStatus(c) === "scheduled" || campaignStatus(c) === "processing",
    )
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const published = visible
    .flatMap((c) => c.deliveries)
    .filter((d) => d.status === "published").length;
  const connected = data.accounts.filter((a) => a.verified_at);
  const drafts = visible.filter((c) => c.state === "draft");
  const alerts = data.campaigns.filter((c) =>
    ["failed", "partial", "uncertain"].includes(campaignStatus(c)),
  );
  const currentAccount = data.accounts.find((a) => a.id === accountFilter);
  const workerAlive = Boolean(
    data.worker.last_run_at &&
    Date.now() - Date.parse(data.worker.last_run_at) < 120000 &&
    !data.worker.last_error,
  );
  const navigate = (next: View) => {
    setView(next);
    setMobileMenu(false);
  };
  const closeComposer = useCallback(() => setComposer(null), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const closeConnect = useCallback(() => {
    setConnect(null);
    setCopied(false);
  }, []);
  async function save(input: CampaignInput) {
    validateCampaign(input, data.accounts);
    if (isDemo) {
      setData((d) =>
        d.campaigns.some((c) => c.request_id === input.requestId)
          ? d
          : { ...d, campaigns: [demoCampaign(input), ...d.campaigns] },
      );
    } else {
      await request("/campaigns", "POST", input);
      await refresh();
    }
    notify(
      input.draft
        ? "Rascunho salvo. Sua ideia fica por aqui."
        : isDemo
          ? "Agendamento salvo na demonstração. Nenhum post será enviado."
          : "Publicação adicionada à fila.",
    );
  }
  async function toggleAccount(account: Account) {
    setBusy(true);
    try {
      if (!isDemo)
        await request(`/accounts/${account.id}`, "PATCH", {
          active: !account.active,
        });
      setData((d) => ({
        ...d,
        accounts: d.accounts.map((a) =>
          a.id === account.id ? { ...a, active: !a.active } : a,
        ),
      }));
      notify(
        account.active
          ? "Conta pausada. Os envios pendentes aguardam a reativação."
          : "Conta reativada.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao atualizar.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel(campaign: Campaign) {
    setBusy(true);
    try {
      if (!isDemo) await request(`/campaigns/${campaign.id}/cancel`, "POST");
      setData((d) => ({
        ...d,
        campaigns: d.campaigns.map((c) =>
          c.id === campaign.id
            ? {
                ...c,
                state: "canceled",
                deliveries: c.deliveries.map((j) =>
                  j.status === "pending" ? { ...j, status: "canceled" } : j,
                ),
              }
            : c,
        ),
      }));
      setDetail(null);
      notify(
        "Envios pendentes cancelados. Um envio já em andamento pode ser concluído.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setBusy(false);
    }
  }
  async function deleteDraft(campaign: Campaign) {
    setBusy(true);
    try {
      if (!isDemo) await request(`/campaigns/${campaign.id}`, "DELETE");
      setData((d) => ({
        ...d,
        campaigns: d.campaigns.filter((c) => c.id !== campaign.id),
      }));
      setDetail(null);
      notify("Rascunho excluído.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }
  async function copyCommand(id: number) {
    try {
      await navigator.clipboard.writeText(`npm run account:connect -- ${id}`);
      setCopied(true);
    } catch {
      notify("Selecione e copie o comando exibido.");
    }
  }
  const accountNames = (c: Campaign) =>
    data.accounts.filter((a) =>
      c.deliveries.some((d) => d.account_id === a.id),
    );
  function rows(campaigns: Campaign[], compact = false) {
    return campaigns.length ? (
      <div className={`post-list ${compact ? "compact" : ""}`}>
        {campaigns.map((c) => (
          <button className="post-row" key={c.id} onClick={() => setDetail(c)}>
            <div className="post-platform">
              <XLogo />
            </div>
            <div className="post-main">
              <strong>{c.title}</strong>
              <span>{c.body}</span>
            </div>
            <div className="post-accounts">
              <AvatarStack accounts={accountNames(c)} />
              <small>
                {c.deliveries.length} conta
                {c.deliveries.length === 1 ? "" : "s"}
              </small>
            </div>
            <div className="post-date">
              <strong>{timeLabel(c.scheduled_at, c.timezone)}</strong>
              <span>{dayLabel(c.scheduled_at, c.timezone)}</span>
            </div>
            <Status value={campaignStatus(c)} />
            <MoreHorizontal size={18} className="row-more" />
          </button>
        ))}
      </div>
    ) : (
      <div className="empty-state">
        <CalendarDays size={28} />
        <strong>Espaço para a próxima ideia</strong>
        <p>
          {search
            ? "Nenhuma publicação corresponde à busca."
            : "Crie uma publicação e dê vida à sua agenda."}
        </p>
        <button
          className="button button-outline"
          onClick={() => setComposer({})}
        >
          <Plus size={15} />
          Criar publicação
        </button>
      </div>
    );
  }
  const today = dateKey(new Date());
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  function weekStrip() {
    return (
      <div className="week-strip">
        {week.map((d, i) => {
          const key = dateKey(d);
          const posts = pending.filter(
            (c) => dateKey(c.scheduled_at, c.timezone) === key,
          );
          return (
            <button
              className={`week-day ${i === 0 ? "today" : ""}`}
              key={key}
              onClick={() => {
                setSelectedDay(key);
                setCalendarDate(d);
                navigate("calendar");
              }}
            >
              <span>
                {i === 0
                  ? "HOJE"
                  : new Intl.DateTimeFormat("pt-BR", {
                      weekday: "short",
                      timeZone: DEFAULT_ZONE,
                    })
                      .format(d)
                      .replace(".", "")
                      .toUpperCase()}
              </span>
              <strong>{d.getUTCDate().toString().padStart(2, "0")}</strong>
              <div className="day-dots">
                {posts.slice(0, 4).map((c) => (
                  <i key={c.id} />
                ))}
                {!posts.length && <span>—</span>}
              </div>
              <small>
                {posts.length
                  ? `${posts.length} publicaç${posts.length === 1 ? "ão" : "ões"}`
                  : "Agenda livre"}
              </small>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-overlay"
          onClick={() => setMobileMenu(false)}
          aria-label="Fechar menu"
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "is-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <OrbitLogo />
          </span>
          <span>
            orbit<span className="brand-period">.</span>
          </span>
          <small>X STUDIO</small>
        </a>
        <div className="workspace-tag">
          <span className="workspace-avatar">O</span>
          <div>
            <strong>Meu workspace</strong>
            <span>Seu espaço de criação</span>
          </div>
          <span className="tiny-dot" />
        </div>
        <span className="nav-caption">GERENCIAR</span>
        <nav aria-label="Menu principal">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "posts" && pending.length > 0 && (
                <small>{pending.length}</small>
              )}
              {item.id === "accounts" && (
                <span className="nav-count">{connected.length}/10</span>
              )}
            </button>
          ))}
          <button
            className="nav-item"
            onClick={() => {
              setPostFilter("draft");
              navigate("posts");
            }}
          >
            <FileText size={19} />
            <span>Rascunhos</span>
            {drafts.length > 0 && <small>{drafts.length}</small>}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div>
              <span className="tiny-dot" />
              <span>CRIAR. CONECTAR. REPETIR.</span>
            </div>
            <strong>
              Boas ideias merecem
              <br />o momento certo.
            </strong>
            <button onClick={() => setComposer({})}>
              Vamos criar <ArrowUpRight size={15} />
            </button>
            <span className="note-orbit">✳</span>
          </div>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            <span>Configurações</span>
          </button>
          <div className="sidebar-user">
            <span className="user-avatar">
              {data.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{data.user.name}</strong>
              <span>
                {isDemo
                  ? "Workspace de demonstração"
                  : "Sessão do sistema principal"}
              </span>
            </div>
            <span className="tiny-dot" />
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>
              {view === "settings"
                ? "Configurações"
                : nav.find((n) => n.id === view)?.label}
            </span>
          </div>
          <label className="global-search">
            <Search size={17} />
            <input
              ref={searchRef}
              placeholder="Buscar uma publicação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>/</kbd>
            {search && (
              <button onClick={() => setSearch("")} aria-label="Limpar busca">
                <X size={14} />
              </button>
            )}
          </label>
          <div className="topbar-end">
            <div className="account-switcher-wrap">
              <button
                className="account-switcher"
                onClick={() => {
                  setAccountMenu((v) => !v);
                  setNotifications(false);
                }}
              >
                {currentAccount ? (
                  <Avatar account={currentAccount} size="small" />
                ) : (
                  <span className="switcher-icon">
                    <Users size={14} />
                  </span>
                )}
                <span>{currentAccount?.name ?? "Todas as contas"}</span>
                <ChevronDown size={14} />
              </button>
              {accountMenu && (
                <>
                  <button
                    className="popover-dismiss"
                    aria-label="Fechar seletor"
                    onClick={() => setAccountMenu(false)}
                  />
                  <div className="popover account-popover">
                    <span className="eyebrow">ALTERNAR VISUALIZAÇÃO</span>
                    <button
                      onClick={() => {
                        setAccountFilter(0);
                        setAccountMenu(false);
                      }}
                    >
                      <Users size={17} />
                      <span>Todas as contas</span>
                      {!accountFilter && <Check size={15} />}
                    </button>
                    {data.accounts
                      .filter((a) => a.verified_at)
                      .map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setAccountFilter(a.id);
                            setAccountMenu(false);
                          }}
                        >
                          <Avatar account={a} size="small" />
                          <span>
                            {a.name}
                            <small>@{a.username}</small>
                          </span>
                          {a.id === accountFilter && <Check size={15} />}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
            <button
              className="icon-button notification-button"
              aria-label="Ver atividade"
              onClick={() => {
                setNotifications((v) => !v);
                setAccountMenu(false);
              }}
            >
              <Activity size={19} />
              {alerts.length > 0 && <i />}
            </button>
            {notifications && (
              <>
                <button
                  className="popover-dismiss"
                  aria-label="Fechar atividade"
                  onClick={() => setNotifications(false)}
                />
                <div className="popover notifications">
                  <h3>Atividade do workspace</h3>
                  {alerts.length ? (
                    alerts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setDetail(c);
                          setNotifications(false);
                        }}
                      >
                        <AlertCircle size={16} />
                        <span>
                          {c.title}
                          <small>Uma entrega precisa de atenção</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p>
                      <CheckCircle2 size={18} /> Nenhuma entrega com erro.
                    </p>
                  )}
                  <small>
                    {isDemo
                      ? "Modo de demonstração"
                      : workerAlive
                        ? "Worker conectado e consultando a fila."
                        : "Worker sem sinal recente. Confira o processo Node."}
                  </small>
                </div>
              </>
            )}
            <span className="topbar-divider" />
            <span className="user-avatar small">
              {data.user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="content">
          {isDemo && (
            <div className="demo-banner">
              <span>
                <Info size={14} />
                <strong>Modo de demonstração</strong>
                <span>
                  Explore o painel. Nenhuma publicação é enviada ao X.
                </span>
              </span>
              <button onClick={() => navigate("settings")}>
                Configurar ambiente <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow green">
                {view === "overview"
                  ? "SEU CENTRO DE CONTEÚDO"
                  : view === "calendar"
                    ? "CADA IDEIA NO SEU TEMPO"
                    : view === "accounts"
                      ? "CONEXÕES QUE IMPORTAM"
                      : view === "settings"
                        ? "DO SEU JEITO"
                        : "DA IDEIA À CONVERSA"}
              </div>
              <h1>
                {view === "overview"
                  ? "Tudo no seu ritmo."
                  : view === "calendar"
                    ? "Sua agenda, com espaço para criar."
                    : view === "accounts"
                      ? "Suas contas. Um só lugar."
                      : view === "settings"
                        ? "Um espaço que funciona para você."
                        : "Conteúdo que ganha o mundo."}
              </h1>
              <p>
                {view === "overview"
                  ? "Um olhar sobre suas contas, suas publicações e o que vem por aí."
                  : view === "calendar"
                    ? "Planeje a semana e encontre o momento de cada publicação."
                    : view === "accounts"
                      ? "Alterne entre até 10 perfis e cuide de cada conversa."
                      : view === "settings"
                        ? "Conecte o Supabase, o sistema principal e o worker de publicação."
                        : "Organize publicações, acompanhe os envios e retome suas ideias."}
              </p>
            </div>
            <button
              className="button button-primary new-post"
              onClick={() => setComposer({})}
            >
              <Plus size={18} />
              Nova publicação<span className="shortcut">N</span>
            </button>
          </div>
          {loading ? (
            <div className="loading-state">
              <Loader2 size={24} className="spin" />
              <p>Preparando seu espaço…</p>
            </div>
          ) : loadError ? (
            <div className="connection-state">
              <Link2 size={32} />
              <h2>Vamos conectar seu workspace</h2>
              <p>{loadError}</p>
              <button
                className="button button-primary"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
              >
                <RefreshCw size={16} />
                Tentar novamente
              </button>
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                Ver instruções de configuração
              </button>
            </div>
          ) : null}
          {!loading && (!loadError || view === "settings") && (
            <>
              {view === "overview" && (
                <>
                  <section className="metrics" aria-label="Resumo do workspace">
                    <Metric
                      icon={Users}
                      label="Contas conectadas"
                      value={String(connected.length).padStart(2, "0")}
                      suffix="/ 10"
                      note={`${data.accounts.filter((a) => a.verified_at && a.active).length} perfis ativos`}
                      bars={Array(7).fill(connected.length)}
                    />
                    <Metric
                      icon={CalendarDays}
                      label="Na sua agenda"
                      value={String(pending.length).padStart(2, "0")}
                      note="Publicações programadas"
                      bars={week.map(
                        (d) =>
                          pending.filter(
                            (c) =>
                              dateKey(c.scheduled_at, c.timezone) ===
                              dateKey(d),
                          ).length,
                      )}
                    />
                    <Metric
                      icon={CheckCheck}
                      label="Publicações enviadas"
                      value={String(published).padStart(2, "0")}
                      note="Entregas confirmadas"
                      bars={Array.from({ length: 7 }, (_, i) => {
                        const day = new Date();
                        day.setDate(day.getDate() - 6 + i);
                        return visible
                          .flatMap((c) => c.deliveries)
                          .filter(
                            (d) =>
                              d.status === "published" &&
                              d.published_at &&
                              dateKey(d.published_at) === dateKey(day),
                          ).length;
                      })}
                    />
                    <Metric
                      icon={FileText}
                      label="Ideias em rascunho"
                      value={String(drafts.length).padStart(2, "0")}
                      note="Prontas para ganhar forma"
                      bars={Array.from({ length: 7 }, (_, i) => {
                        const day = new Date();
                        day.setDate(day.getDate() - 6 + i);
                        return drafts.filter(
                          (c) => dateKey(c.created_at) === dateKey(day),
                        ).length;
                      })}
                    />
                  </section>
                  <div className="overview-grid">
                    <section className="card upcoming-card">
                      <div className="card-header">
                        <div>
                          <h2>
                            O que vem por aí{" "}
                            <span className="count-badge">
                              {pending.length}
                            </span>
                          </h2>
                          <p>Suas próximas conversas já têm hora marcada.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => {
                            setPostFilter("scheduled");
                            navigate("posts");
                          }}
                        >
                          Ver todas <ArrowUpRight size={14} />
                        </button>
                      </div>
                      {rows(pending.slice(0, 4), true)}
                      <button
                        className="card-bottom-link"
                        onClick={() => setComposer({})}
                      >
                        <Plus size={15} /> Tem mais uma ideia? Adicione à sua
                        agenda <ArrowRight size={15} />
                      </button>
                    </section>
                    <aside className="card accounts-summary">
                      <div className="card-header">
                        <h2>Por aqui, conectadas</h2>
                        <XLogo />
                      </div>
                      <div className="summary-accounts">
                        {connected.slice(0, 5).map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              setAccountFilter(a.id);
                              navigate("posts");
                            }}
                          >
                            <Avatar account={a} />
                            <span>
                              <strong>{a.name}</strong>
                              <small>@{a.username}</small>
                            </span>
                            <i className={a.active ? "online" : "paused"} />
                          </button>
                        ))}
                      </div>
                      <button
                        className="card-bottom-link"
                        onClick={() => navigate("accounts")}
                      >
                        Gerenciar {connected.length} contas{" "}
                        <ArrowUpRight size={14} />
                      </button>
                    </aside>
                  </div>
                  <section className="card weekly-card">
                    <div className="card-header">
                      <div>
                        <h2>Uma semana de possibilidades</h2>
                        <p>
                          Um pouco de planejamento. Muito espaço para boas
                          ideias.
                        </p>
                      </div>
                      <button
                        className="button button-outline small-button"
                        onClick={() => navigate("calendar")}
                      >
                        <CalendarDays size={14} />
                        Abrir calendário
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                    {weekStrip()}
                  </section>
                  <div className="workspace-footer">
                    <span>
                      <span
                        className={`tiny-dot ${workerAlive ? "" : "muted-dot"}`}
                      />
                      {isDemo
                        ? "Você está explorando uma demonstração"
                        : workerAlive
                          ? "Worker conectado · fila atualizada automaticamente"
                          : "Worker offline · inicie npm run worker"}
                    </span>
                    <span>
                      Feito para criar com mais intenção{" "}
                      <span className="footer-spark">✳</span>
                    </span>
                  </div>
                </>
              )}
              {view === "posts" && (
                <section className="card all-posts">
                  <div className="posts-toolbar">
                    <div className="tabs">
                      {[
                        ["all", "Todas"],
                        ["scheduled", "Agendadas"],
                        ["published", "Publicadas"],
                        ["draft", "Rascunhos"],
                        ["attention", "Atenção"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          className={postFilter === id ? "active" : ""}
                          onClick={() => setPostFilter(id)}
                        >
                          {label}
                          {id === "all" && <span>{visible.length}</span>}
                        </button>
                      ))}
                    </div>
                    <span className="muted toolbar-note">
                      <SlidersHorizontal size={14} />
                      {currentAccount?.name ?? "Todos os perfis"}
                    </span>
                  </div>
                  {rows(
                    visible
                      .filter(
                        (c) =>
                          postFilter === "all" ||
                          (postFilter === "attention" &&
                            ["failed", "partial", "uncertain"].includes(
                              campaignStatus(c),
                            )) ||
                          campaignStatus(c) === postFilter,
                      )
                      .sort((a, b) =>
                        b.scheduled_at.localeCompare(a.scheduled_at),
                      ),
                  )}
                </section>
              )}
              {view === "calendar" && (
                <div className="calendar-layout">
                  <section className="card calendar-card">
                    <div className="card-header">
                      <h2 className="capitalize">
                        {new Intl.DateTimeFormat("pt-BR", {
                          month: "long",
                          year: "numeric",
                        }).format(calendarDate)}
                      </h2>
                      <div className="calendar-controls">
                        <button
                          className="button button-outline small-button"
                          onClick={() => {
                            setCalendarDate(new Date());
                            setSelectedDay(today);
                          }}
                        >
                          Hoje
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Mês anterior"
                          onClick={() =>
                            setCalendarDate(
                              new Date(
                                calendarDate.getFullYear(),
                                calendarDate.getMonth() - 1,
                                1,
                              ),
                            )
                          }
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Próximo mês"
                          onClick={() =>
                            setCalendarDate(
                              new Date(
                                calendarDate.getFullYear(),
                                calendarDate.getMonth() + 1,
                                1,
                              ),
                            )
                          }
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="calendar-weekdays">
                      {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map(
                        (d) => (
                          <span key={d}>{d}</span>
                        ),
                      )}
                    </div>
                    <div className="calendar-grid">
                      {Array.from({ length: 42 }, (_, i) => {
                        const date = new Date(
                          calendarDate.getFullYear(),
                          calendarDate.getMonth(),
                          1,
                        );
                        date.setDate(1 - date.getDay() + i);
                        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                        const items = visible.filter(
                          (c) =>
                            dateKey(c.scheduled_at, c.timezone) === key &&
                            c.state !== "draft" &&
                            c.state !== "canceled",
                        );
                        return (
                          <button
                            key={key}
                            className={`calendar-cell ${date.getMonth() !== calendarDate.getMonth() ? "outside" : ""} ${key === today ? "is-today" : ""} ${key === selectedDay ? "selected" : ""}`}
                            onClick={() => setSelectedDay(key)}
                          >
                            <span className="calendar-number">
                              {date.getDate()}
                            </span>
                            {items.slice(0, 2).map((c) => (
                              <span
                                key={c.id}
                                className={`calendar-event ${campaignStatus(c) === "published" ? "sent" : ""}`}
                              >
                                {timeLabel(c.scheduled_at, c.timezone)}{" "}
                                {c.title}
                              </span>
                            ))}
                            {items.length > 2 && (
                              <small>+{items.length - 2} publicações</small>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="calendar-legend">
                      <span>
                        <i /> Agendadas
                      </span>
                      <span>
                        <i /> Publicadas
                      </span>
                      <small>Horários no fuso de cada publicação</small>
                    </div>
                  </section>
                  <aside className="card day-agenda">
                    <div className="card-header">
                      <div>
                        <span className="eyebrow">AGENDA DO DIA</span>
                        <h2>
                          {new Intl.DateTimeFormat("pt-BR", {
                            day: "numeric",
                            month: "long",
                            timeZone: "UTC",
                          }).format(new Date(`${selectedDay}T12:00:00Z`))}
                        </h2>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Agendar neste dia"
                        onClick={() =>
                          setComposer({ date: `${selectedDay}T18:00:00-03:00` })
                        }
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {rows(
                      visible.filter(
                        (c) =>
                          dateKey(c.scheduled_at, c.timezone) === selectedDay &&
                          c.state !== "draft",
                      ),
                      true,
                    )}
                  </aside>
                </div>
              )}
              {view === "accounts" && (
                <>
                  <div className="accounts-toolbar">
                    <span>
                      <span className="tiny-dot" />
                      {connected.length} contas conectadas de 10 disponíveis
                    </span>
                    <button
                      className="button button-outline small-button"
                      onClick={() => {
                        if (isDemo)
                          notify(
                            "Os perfis exibidos são exemplos. Configure o Supabase para conectar suas contas.",
                          );
                        else void refresh();
                      }}
                    >
                      <RefreshCw size={14} />
                      Atualizar conexões
                    </button>
                  </div>
                  <div className="account-grid">
                    {data.accounts.map((a) => (
                      <article
                        className={`card account-card ${!a.verified_at ? "disconnected" : ""}`}
                        key={a.id}
                      >
                        <div className="account-card-top">
                          <span className="eyebrow">
                            CONTA {String(a.id).padStart(2, "0")}
                          </span>
                          {a.verified_at ? (
                            <span
                              className={`connection-label ${a.active ? "" : "paused"}`}
                            >
                              <i />
                              {a.active ? "Conectada" : "Pausada"}
                            </span>
                          ) : (
                            <span className="connection-label muted">
                              Disponível
                            </span>
                          )}
                        </div>
                        <Avatar account={a} size="large" />
                        <h2>{a.name}</h2>
                        <span className="account-handle">
                          {a.username
                            ? `@${a.username}`
                            : "Seu próximo perfil no X"}
                        </span>
                        <div className="account-card-stat">
                          <span>
                            <CalendarDays size={14} />
                            {
                              data.campaigns.filter(
                                (c) =>
                                  campaignStatus(c) === "scheduled" &&
                                  c.deliveries.some(
                                    (d) => d.account_id === a.id,
                                  ),
                              ).length
                            }{" "}
                            na agenda
                          </span>
                          <XLogo />
                        </div>
                        {a.last_error && (
                          <p className="account-error">{a.last_error}</p>
                        )}
                        <div className="account-card-buttons">
                          {a.verified_at ? (
                            <>
                              <button
                                className="button button-outline"
                                disabled={busy}
                                onClick={() => toggleAccount(a)}
                              >
                                {a.active ? "Pausar conta" : "Reativar conta"}
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Reconectar ${a.name}`}
                                onClick={() => setConnect(a)}
                              >
                                <Link2 size={17} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Ver publicações de ${a.name}`}
                                onClick={() => {
                                  setAccountFilter(a.id);
                                  navigate("posts");
                                }}
                              >
                                <ArrowUpRight size={18} />
                              </button>
                            </>
                          ) : (
                            <button
                              className="button button-outline"
                              onClick={() => setConnect(a)}
                            >
                              <Plus size={16} />
                              Conectar conta
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  <p className="accounts-footnote">
                    <Info size={14} /> Cada perfil usa uma sessão independente
                    no computador do worker. Você escolhe as contas em cada
                    publicação.
                  </p>
                </>
              )}
              {view === "settings" && (
                <div className="settings-grid">
                  <section className="card settings-card">
                    <span className="settings-icon">
                      <Link2 size={22} />
                    </span>
                    <h2>Supabase e acesso</h2>
                    <p>
                      O painel usa a sessão Supabase do seu sistema React. Os
                      operadores autorizados ficam na tabela{" "}
                      <code>x_studio_admins</code>.
                    </p>
                    <div className="setting-row">
                      <span>Ambiente</span>
                      <span className="pill">
                        {isDemo ? "Demonstração" : "Produção"}
                      </span>
                    </div>
                    <div className="setting-row">
                      <span>Login do painel</span>
                      <span>Sessão do sistema principal</span>
                    </div>
                    <div className="setting-row">
                      <span>Contas por instalação</span>
                      <span>Até 10 perfis</span>
                    </div>
                    <p className="field-note">
                      Configure as variáveis VITE_SUPABASE_URL,
                      VITE_SUPABASE_PUBLISHABLE_KEY e VITE_PARENT_ORIGIN no
                      .env. Use VITE_DEMO_MODE=false para ativar.
                    </p>
                  </section>
                  <section className="card settings-card">
                    <span className="settings-icon">
                      <Terminal size={22} />
                    </span>
                    <h2>Worker de publicação</h2>
                    <p>
                      Playwright abre o X no navegador e usa as sessões
                      conectadas. Mantenha o worker ligado para cumprir os
                      agendamentos.
                    </p>
                    <div className="setting-row">
                      <span>Status</span>
                      <span
                        className={`connection-label ${workerAlive ? "" : "paused"}`}
                      >
                        <i />
                        {workerAlive ? "Online" : "Sem sinal recente"}
                      </span>
                    </div>
                    <div className="setting-row">
                      <span>Último sinal</span>
                      <span>
                        {data.worker.last_run_at
                          ? new Date(data.worker.last_run_at).toLocaleString(
                              "pt-BR",
                            )
                          : "Aguardando worker"}
                      </span>
                    </div>
                    <div className="command">
                      <code>npm run worker</code>
                      <Terminal size={16} />
                    </div>
                    {data.worker.last_error && (
                      <p className="inline-error">{data.worker.last_error}</p>
                    )}
                  </section>
                  <section className="card settings-card">
                    <span className="settings-icon">
                      <CalendarDays size={22} />
                    </span>
                    <h2>Horários e fila</h2>
                    <p>
                      O horário é salvo em UTC e exibido no fuso escolhido. O
                      worker consulta a fila a cada 20 segundos, por padrão.
                    </p>
                    <div className="setting-row">
                      <span>Fuso inicial</span>
                      <span>America/Sao_Paulo</span>
                    </div>
                    <div className="setting-row">
                      <span>Envios</span>
                      <span>Um por vez</span>
                    </div>
                    <div className="setting-row">
                      <span>Confirmação incerta</span>
                      <span>Conferência manual no X</span>
                    </div>
                    <p className="field-note">
                      Um envio em andamento pode terminar depois do
                      cancelamento. Entregas com confirmação incerta não são
                      reenviadas automaticamente.
                    </p>
                  </section>
                  <section className="card settings-card">
                    <span className="settings-icon">
                      <Info size={22} />
                    </span>
                    <h2>
                      {isDemo
                        ? "Seu espaço para experimentar"
                        : "Instalação e documentação"}
                    </h2>
                    <p>
                      {isDemo
                        ? "Os dados de exemplo ficam neste navegador. Você pode criar, agendar e cancelar publicações para conhecer o fluxo."
                        : "O README do projeto inclui o SQL, o deploy da Edge Function e um exemplo de integração no React principal."}
                    </p>
                    {isDemo ? (
                      <button
                        className="button button-outline"
                        onClick={() => {
                          localStorage.removeItem("orbit-demo-v1");
                          setData(demoLoad());
                          setAccountFilter(0);
                          notify("Demonstração restaurada.");
                        }}
                      >
                        <RefreshCw size={16} />
                        Restaurar dados de exemplo
                      </button>
                    ) : (
                      <div className="command">
                        <code>README.md · docs/INTEGRATION.tsx</code>
                        <FileText size={16} />
                      </div>
                    )}
                    <div className="settings-note">
                      Sem chaves da API do X. Sem senha do X no .env.
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {composer && (
        <Composer
          accounts={data.accounts}
          initial={composer.initial}
          initialDate={composer.date}
          initialAccountId={accountFilter}
          onClose={closeComposer}
          onSave={save}
          demo={isDemo}
        />
      )}
      {detail && (
        <Modal
          wide
          title={detail.title}
          subtitle={`${dayLabel(detail.scheduled_at, detail.timezone)} às ${timeLabel(detail.scheduled_at, detail.timezone)} · ${detail.timezone}`}
          onClose={closeDetail}
        >
          <div className="detail-content">
            <div className="detail-summary">
              <Status value={campaignStatus(detail)} />
              <p>{detail.body}</p>
            </div>
            <span className="eyebrow">ACOMPANHAMENTO POR CONTA</span>
            <div className="delivery-list">
              {detail.deliveries.map((d) => {
                const a = data.accounts.find((a) => a.id === d.account_id);
                return (
                  <article key={d.id}>
                    {a && <Avatar account={a} />}
                    <div>
                      <strong>{a?.name ?? `Conta ${d.account_id}`}</strong>
                      <p>{d.body}</p>
                      {d.error && (
                        <small className="danger-text">{d.error}</small>
                      )}
                      {d.tweet_id && a && (
                        <a
                          className="text-button"
                          href={`https://x.com/${encodeURIComponent(a.username)}/status/${d.tweet_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver no X <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                    <Status value={d.status} />
                  </article>
                );
              })}
            </div>
            {["uncertain", "partial"].includes(campaignStatus(detail)) && (
              <p className="field-note">
                Confira os perfis no X antes de criar outro envio. A falta de
                confirmação pode significar que o post já foi publicado.
              </p>
            )}
          </div>
          <footer className="modal-footer">
            <div>
              {detail.state === "draft" ? (
                <button
                  className="button danger-button"
                  disabled={busy}
                  onClick={() => deleteDraft(detail)}
                >
                  <Trash2 size={15} />
                  Excluir rascunho
                </button>
              ) : (
                detail.deliveries.some((d) => d.status === "pending") && (
                  <button
                    className="button danger-button"
                    disabled={busy}
                    onClick={() => cancel(detail)}
                  >
                    Cancelar pendentes
                  </button>
                )
              )}
            </div>
            <button
              className="button button-primary"
              onClick={() => {
                setComposer({ initial: detail });
                setDetail(null);
              }}
            >
              <Copy size={15} />
              Usar como base
            </button>
          </footer>
        </Modal>
      )}
      {connect && (
        <Modal
          title={`Conectar conta ${String(connect.id).padStart(2, "0")}`}
          subtitle="Uma sessão do navegador, exclusiva para este perfil."
          onClose={closeConnect}
        >
          <div className="connect-content">
            {isDemo && (
              <div className="inline-info">
                <Info size={17} /> Esta é uma demonstração. A conexão real exige
                configurar o Supabase e o worker.
              </div>
            )}
            <div className="connect-step">
              <span>1</span>
              <div>
                <strong>No computador do worker, execute:</strong>
                <div className="command">
                  <code>npm run account:connect -- {connect.id}</code>
                  <button
                    className="icon-button"
                    aria-label="Copiar comando"
                    onClick={() => copyCommand(connect.id)}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="connect-step">
              <span>2</span>
              <div>
                <strong>Entre no X pelo navegador que abrir.</strong>
                <p>
                  Use a conta desejada e conclua a autenticação no próprio X.
                </p>
              </div>
            </div>
            <div className="connect-step">
              <span>3</span>
              <div>
                <strong>Volte ao terminal e pressione Enter.</strong>
                <p>
                  O worker identificará o perfil e salvará a sessão local.
                  Depois, atualize as contas neste painel.
                </p>
              </div>
            </div>
            <p className="field-note">
              As sessões ficam na pasta .local do worker e não são enviadas ao
              navegador do painel.
            </p>
          </div>
          <footer className="modal-footer">
            <span />
            <button
              className="button button-primary"
              onClick={() => {
                if (!isDemo) void refresh();
                closeConnect();
                notify(
                  isDemo
                    ? "Configure o ambiente para conectar suas contas."
                    : "Lista de contas atualizada.",
                );
              }}
            >
              <RefreshCw size={15} />
              Atualizar contas
            </button>
          </footer>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  suffix,
  note,
  bars,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  suffix?: string;
  note: string;
  bars: number[];
}) {
  const max = Math.max(...bars, 1);
  return (
    <article className="metric">
      <div className="metric-label">
        <Icon size={16} />
        <span>{label}</span>
        <ArrowUpRight size={14} />
      </div>
      <div className="metric-value">
        <strong>{value}</strong>
        {suffix && <span>{suffix}</span>}
        <div className="spark-bars" aria-hidden="true">
          {bars.map((v, i) => (
            <i
              key={i}
              style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <p>
        <span className="tiny-dot" />
        {note}
      </p>
    </article>
  );
}
