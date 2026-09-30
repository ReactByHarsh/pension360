import { OriginalShell } from './restored/OriginalShell';
import { OriginalLogin } from './restored/OriginalLogin';
import { OriginalPages } from './restored/OriginalPages';
import { AdministrationPages, isAdministrationPage } from './restored/AdministrationPages';
import { allowedScreen, legacyTarget, normalizeTarget, screenCopilot, studioPages } from './restored/navigation';
import {
  Component,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { api, setAccessToken } from "./api";
import { oidc } from "./auth";
import type { User } from "./types";
import { ErrorBox, ToastHost } from "./ui";
import { Copilot, CopilotProvider } from "./Copilot";

type Session = { user: User | null; mode: "dev" | "oidc" };
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(true);
  const [requestedPath, setPath] = useState(
    normalizeTarget(location.hash.slice(1) || "executive"),
  );
  const path = session?.user
    ? (allowedScreen(requestedPath.split("?")[0], session.user.role, session.mode) ? requestedPath.split("?")[0] : "roles")
    : requestedPath;
  const [dark, setDark] = useState(
    () => localStorage.getItem("p360-theme") === "dark",
  );
  const [rtl, setRtl] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const routeRef=useRef(requestedPath),dirtyRef=useRef(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("p360-theme", dark ? "dark" : "light");
  }, [dark]);
  // A newly opened page always starts at the top, including via sidebar links
  // (hash changes) and after the new page has rendered.
  const screen = requestedPath.split("?")[0];
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const top = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      document
        .querySelectorAll<HTMLElement>("main, .page-content, .original-shell")
        .forEach((el) => {
          if (el.scrollTop) el.scrollTop = 0;
        });
    };
    top();
    const frame = requestAnimationFrame(() => requestAnimationFrame(top));
    const late = window.setTimeout(top, 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(late);
    };
  }, [screen]);
  useEffect(() => {
    const onHash = () => {
      const next=normalizeTarget(location.hash.slice(1)||'executive');
      if(next!==routeRef.current && dirtyRef.current && !window.confirm('Discard unsaved decision changes?')) {
        history.replaceState(null,'',`#${routeRef.current}`); return;
      }
      routeRef.current=next;setPath(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const expired = () => {
      setAccessToken(null);
      setSession((s) => (s ? { ...s, user: null } : s));
      setError(
        new Error("Your session has expired. Sign in again to continue."),
      );
    };
    window.addEventListener("p360-session-expired", expired);
    return () => window.removeEventListener("p360-session-expired", expired);
  }, []);
  useEffect(() => {
    const track = (event: Event) => {
      dirtyRef.current=Boolean((event as CustomEvent).detail);
      setHasUnsaved(dirtyRef.current);
    };
    window.addEventListener("p360-unsaved", track);
    return () => window.removeEventListener("p360-unsaved", track);
  }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (location.pathname === "/auth/callback") {
          const user = await oidc().signinRedirectCallback();
          setAccessToken(user.access_token);
          history.replaceState(null, "", "/");
        }
        const result = await api<Session>("/session");
        if (live) setSession(result);
      } catch (err) {
        if (live) setError(err as Error);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  function navigate(target: string) {
    let next=normalizeTarget(target);
    if(studioPages.includes(next) && next!==path) {
      const params=new URLSearchParams(requestedPath.split('?')[1]||'');
      const selected=params.get('rule')||params.get('v');
      if(selected)next+='?rule='+encodeURIComponent(selected);
    }
    if (
      hasUnsaved &&
      next !== requestedPath &&
      !window.confirm("Discard unsaved decision changes?")
    )
      return;
    routeRef.current=next;
    location.hash = next;
    setPath(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function devLogin(userId: string) {
    if (busy) return;
    if (
      hasUnsaved &&
      !window.confirm("Discard unsaved decision changes and switch user?")
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ accessToken: string; user: User }>(
        "/auth/dev",
        { userId },
      );
      setAccessToken(result.accessToken);
      const current = await api<Session>("/session");
      setSession(current);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }
  async function signIn() {
    setError(null);
    try {
      await oidc().signinRedirect();
    } catch (err) {
      setError(err as Error);
    }
  }
  async function refreshSession() {
    try {
      setSession(await api<Session>("/session"));
    } catch (err) {
      setError(err as Error);
    }
  }
  async function logout() {
    if(hasUnsaved && !window.confirm('Discard unsaved decision changes and sign out?'))return;
    setAccessToken(null);
    if (session?.mode === "oidc") {
      try {
        await oidc().signoutRedirect();
      } catch (err) {
        setError(err as Error);
      }
    }
    setSession((s) => (s ? { ...s, user: null } : s));
  }
  if (!session?.user)
    return <OriginalLogin mode={session?.mode} busy={busy} error={error} dark={dark} onToggleTheme={()=>setDark(!dark)} onDevLogin={devLogin} onSignIn={signIn}/>;
  const user=session.user;
  const navigateLegacy=(target:string)=>navigate(legacyTarget(target));
  return <><ToastHost/><OriginalShell user={user} mode={session.mode} dark={dark} onToggleTheme={()=>setDark(!dark)} rtl={rtl} onToggleRtl={()=>setRtl(!rtl)} currentPage={path} navigate={navigate} onDevLogin={devLogin} onLogout={logout} busy={busy} hasUnsaved={hasUnsaved}>
    <ErrorBox error={error}/>
    {requestedPath.split('?')[0]!==path && <div className="notice warning" role="status">That page is not available for your current role. Your permitted workspaces and responsibilities are shown below.</div>}
    <AppErrorBoundary key={requestedPath+'-'+user.id+'-'+user.role}>
      <CopilotProvider>
        {isAdministrationPage(path)? <AdministrationPages page={path} user={user} mode={session.mode} navigate={navigate} dark={dark} switchUser={devLogin} refreshSession={refreshSession}/>:<OriginalPages page={path} user={user} mode={session.mode} navigate={navigate} dark={dark}/>}
        {screenCopilot(path) && <Copilot page={screenCopilot(path)!} mode={session.mode} user={user} navigate={navigateLegacy}/>}
      </CopilotProvider>
    </AppErrorBoundary>
  </OriginalShell></>;
}
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Deliberately avoid logging member data in the browser. */
  }
  render() {
    return this.state.error ? (
      <div className="panel panel-body">
        <h2>This view could not be displayed.</h2>
        <p>
          Reload the workspace and retry. If it continues, contact the
          application administrator.
        </p>
        <button className="secondary" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
