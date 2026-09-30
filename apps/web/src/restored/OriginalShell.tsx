import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard, CalendarCheck, Files, BookOpen, Layers, Wallet,
  ChartNoAxesCombined, Contact, ClipboardList, Workflow, Plug, Settings,
  Presentation, ChevronDown, Search, Sun, Moon, Menu, Sparkles, ArrowRight, X,
} from "lucide-react";
import { api } from "../api";
import { roleOrder, roleProfiles } from "../roles";
import type { Member, User } from "../types";
import { groups, screens, descriptions, allowedScreen } from "./navigation";
import logo from "./assets/logo.png";

const icons = [LayoutDashboard, CalendarCheck, Files, BookOpen, Layers, Wallet,
  ChartNoAxesCombined, Contact, ClipboardList, Workflow, Plug, Settings, Presentation];

type Props = {
  children: ReactNode;
  user: User;
  mode: "dev" | "oidc";
  dark: boolean;
  onToggleTheme: () => void;
  rtl: boolean;
  onToggleRtl: () => void;
  currentPage: string;
  navigate: (page: string) => void;
  onDevLogin: (id: string) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  busy: boolean;
  hasUnsaved: boolean;
};

function Dialog({ open, onClose, title, children, className = "" }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={`original-dialog ${className}`} aria-label={title}
    onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
    onClick={(event) => { if (event.target === ref.current) closeRef.current(); }}>
    <div className="original-dialog-content">
      <div className="modal-heading"><h2>{title}</h2>
        <button className="btn ghost" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={20} /></button>
      </div>
      {children}
    </div>
  </dialog>;
}

/** v6.2 Horizon shell: original structure and assets with the Node role and API contracts. */
export function OriginalShell({ children, user, mode, dark, onToggleTheme, rtl, onToggleRtl,
  currentPage, navigate, onDevLogin, onLogout, busy, hasUnsaved }: Props) {
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [people, setPeople] = useState<Member[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState("Dashboard");
  const account = useRef<HTMLDetailsElement>(null);
  const screen = screens.find((item) => item.id === currentPage.split("?")[0]);
  const active = screen?.group;
  const canCopilot = user.role !== "AUDITOR" && allowedScreen("copilot", user.role, mode);
  const canSearchMembers = allowedScreen("member", user.role, mode);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);
  useEffect(() => {
    if (active) setGroupOpen(active);
    setMobile(false);
    if (account.current) account.current.open = false;
    document.title = `${screen?.title || "Workspace"} | Pension360`;
  }, [active, currentPage, screen?.title, user.id]);
  useEffect(() => {
    setPeople([]);
    setSearchError(null);
    setSearchBusy(false);
    if (!searchOpen || !debounced || !canSearchMembers) return;
    const controller = new AbortController();
    setSearchBusy(true);
    void api<{ items: Member[] }>(`/members?q=${encodeURIComponent(debounced)}&limit=5`, undefined, "GET", controller.signal)
      .then((result) => { if (!controller.signal.aborted) setPeople(result.items); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : "Member search is unavailable. Please retry.");
      })
      .finally(() => { if (!controller.signal.aborted) setSearchBusy(false); });
    return () => controller.abort();
  }, [searchOpen, debounced, canSearchMembers, user.id]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMobile(false);
        setSearchOpen(true);
      }
      if (event.key === "Escape" && account.current?.open) {
        account.current.open = false;
        account.current.querySelector("summary")?.focus();
      }
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && account.current && !account.current.contains(event.target)) account.current.open = false;
    }
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", outside);
    };
  }, []);
  function go(page: string) {
    navigate(page);
    setSearchOpen(false);
    setMobile(false);
    if (account.current) account.current.open = false;
  }
  function logout() {
    void onLogout();
  }
  const q = term.toLocaleLowerCase().trim();
  const found = screens.filter((item) => allowedScreen(item.id, user.role, mode)
    && `${item.title} ${item.group}`.toLocaleLowerCase().includes(q)).slice(0, 7);
  const resultsCurrent = q === debounced.toLocaleLowerCase();
  const navigation = (mobileNavigation = false) => <>
    <a href="#executive" className="brand" onClick={(event) => { event.preventDefault(); go("executive"); }}>
      <img src={logo} alt="" /><span>Pension360</span>
    </a>
    <nav className="nav-scroll" aria-label={mobileNavigation ? "Mobile workspace navigation" : "Workspace navigation"}>
      <div className="nav-label">WORKSPACE</div>
      {groups.map((group, index) => {
        const items = group.items.filter((item) => allowedScreen(item.id, user.role, mode));
        if (!items.length) return null;
        const Icon = icons[index] || LayoutDashboard;
        const expanded = groupOpen === group.id;
        return <div className="nav-group" key={group.id}>
          {index === 6 && <div className="nav-label">SHARED TOOLS</div>}
          <button className={`nav-parent ${active === group.id ? "active" : ""}`} aria-expanded={expanded}
            onClick={() => setGroupOpen(expanded ? "" : group.id)}>
            <Icon size={20} /><span>{group.label}</span><ChevronDown size={15} className={expanded ? "rotated" : ""} />
          </button>
          {expanded && <div className="nav-children">{items.map((item) => <a key={item.id} href={`#${item.id}`}
            className={screen?.id === item.id ? "active" : ""} aria-current={screen?.id === item.id ? "page" : undefined}
            onClick={(event) => { event.preventDefault(); go(item.id); }}>{item.title}</a>)}</div>}
        </div>;
      })}
    </nav>
    <div className="sidebar-bottom">
      {canCopilot && <div className="assistant-tile"><Sparkles size={22} /><b>Evidence at your fingertips</b>
        <p>Ask Pension Copilot about a member, policy or finding.</p>
        <a href="#copilot" onClick={(event) => { event.preventDefault(); go("copilot"); }}>Ask a question <ArrowRight size={15} /></a>
      </div>}
      <small>{roleProfiles[user.role].name} workspace</small>
    </div>
  </>;
  return <div className="original-shell" dir={rtl ? "rtl" : "ltr"}>
    <a className="skip-link" href="#content" onClick={(event) => {
      event.preventDefault(); document.getElementById("content")?.focus();
    }}>Skip to main content</a>
    <aside className="sidebar desktop-sidebar">{navigation()}</aside>
    <Dialog open={mobile} onClose={() => setMobile(false)} title="Pension360 navigation" className="navigation-dialog">
      <div className="mobile-navigation">{navigation(true)}</div>
    </Dialog>
    <div className="app-workspace">
      <header className="topbar">
        <div className="topbar-left"><button className="btn ghost mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={22} /></button>
          <div className="breadcrumb"><span>Workspace</span><span>/</span><b>{groups.find((group) => group.id === active)?.label || "Pension360"}</b></div>
        </div>
        <div className="topbar-tools">
          <button className="btn ghost global-search" aria-label="Search the workspace" onClick={() => setSearchOpen(true)}><Search size={18} /><span>Search anything…</span><kbd>⌘ K</kbd></button>
          <button className="btn ghost appearance-toggle" aria-label={dark ? "Use light appearance" : "Use dark appearance"} onClick={onToggleTheme}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
          <button className="btn ghost rtl-toggle" aria-label="Toggle right-to-left layout" aria-pressed={rtl} onClick={onToggleRtl}>{rtl ? "LTR" : "RTL"}</button>
          <details ref={account} className="account-tools">
            <summary className="avatar" aria-label="Open account menu">{(user.name || user.role).split(" ").slice(0, 2).map((part) => part[0]).join("")}</summary>
            <div className="account-popover">
              <div className="account-identity"><b>{user.name}</b><small>{roleProfiles[user.role].name}</small></div>
              {mode === "dev" && <label className="field">Switch development role<select aria-label="Switch development role" disabled={busy}
                value={roleProfiles[user.role].userId} onChange={(event) => void onDevLogin(event.target.value)}>
                {roleOrder.map((role) => <option key={role} value={roleProfiles[role].userId}>{roleProfiles[role].name}</option>)}
              </select></label>}
              {allowedScreen("settings", user.role, mode) && <button onClick={() => go("settings")}>Workspace settings</button>}
              {allowedScreen("access", user.role, mode) && <button onClick={() => go("access")}>Users & roles</button>}
              {allowedScreen("roles", user.role, mode) && <button onClick={() => go("roles")}>Role capabilities</button>}
              {allowedScreen("demo-guide", user.role, mode) && <button onClick={() => go("demo-guide")}>Guided demonstration</button>}
              <button onClick={logout} disabled={busy}>Sign out</button>
            </div>
          </details>
        </div>
      </header>
      <main id="content" tabIndex={-1}>
        <div className="page-heading" key={screen?.id || "workspace"}><div><p className="eyebrow">PENSION INTELLIGENCE</p><h1>{screen?.title || "Workspace"}</h1>
          <p>{descriptions[screen?.id || ""] || "Review records, evidence and the next action."}</p></div>
          {canCopilot && currentPage !== "copilot" && <div className="page-heading-actions"><button className="btn primary" onClick={() => go("copilot")}><Sparkles size={17} />Ask Copilot</button></div>}
        </div>
        <div className="page-content" key={`${currentPage}-${user.id}`}>{children}</div>
      </main>
      <footer><span>Pension360 · Intelligence workspace</span><span>Source systems retain official decisions and payments.</span></footer>
    </div>
    <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} title="Search the workspace">
      <p className="muted">Find pages and members. Keyboard shortcut: Ctrl or Command + K.</p>
      <label className="search-field search-large"><Search size={19} /><input autoFocus value={term} maxLength={120}
        onChange={(event) => setTerm(event.target.value)} placeholder="Member name, ID or page…" aria-label="Search pages and members" /></label>
      <div className="search-results">
        {found.map((item) => <a key={item.id} href={`#${item.id}`} onClick={(event) => { event.preventDefault(); go(item.id); }}>
          <LayoutDashboard size={17} /><span>{item.title}<small>{groups.find((group) => group.id === item.group)?.label}</small></span><ArrowRight size={15} />
        </a>)}
        {q && resultsCurrent && people.map((member) => <a key={member.id} href={`#member?m=${encodeURIComponent(member.id)}`}
          onClick={(event) => { event.preventDefault(); go(`member?m=${encodeURIComponent(member.id)}`); }}>
          <Contact size={18} /><span>{member.name}<small>{member.id} · {member.nameAr || member.organization}</small></span><ArrowRight size={15} />
        </a>)}
        {q && (!resultsCurrent || searchBusy) && canSearchMembers && <p role="status">Searching members…</p>}
        {searchError && resultsCurrent && <p role="alert">{searchError}</p>}
        {!found.length && !people.length && resultsCurrent && !searchBusy && !searchError && <p>No results. Try another name or reference.</p>}
      </div>
    </Dialog>
  </div>;
}
