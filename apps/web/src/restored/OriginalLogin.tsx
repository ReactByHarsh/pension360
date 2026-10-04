import { useState, type FormEvent } from "react";
import { ShieldCheck, Moon, Sun, ArrowRight } from "lucide-react";
import { roleOrder, roleProfiles } from "../roles";
import logo from "./assets/logo.png";

type Props = {
  mode: "dev" | "oidc" | undefined;
  busy: boolean;
  error: Error | null;
  dark: boolean;
  onToggleTheme: () => void;
  onDevLogin: (id: string, credentials?: { loginId: string; password: string }) => void | Promise<void>;
  loginRequired?: boolean;
  onSignIn: () => void | Promise<void>;
};

/** Restored v6.2 login layout, using the Node application's real identity flow. */
export function OriginalLogin({ mode, busy, error, dark, onToggleTheme, onDevLogin, onSignIn, loginRequired }: Props) {
  const [selected, setSelected] = useState("superadmin");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === "dev") void onDevLogin(selected, loginRequired ? { loginId, password } : undefined);
    else if (mode === "oidc") void onSignIn();
    else window.location.reload();
  }
  return <div className="original-login login-layout">
    <div className="login-brand-panel">
      <img src={logo} alt="" />
      <h1>Pension360</h1>
      <p>Evidence, preparation and assurance.</p>
      <div className="login-points">
        <ShieldCheck size={34} />
        <h2>Your work, connected</h2>
        <p>Review member evidence, resolve differences and apply approved rules in one workspace.</p>
      </div>
    </div>
    <main className="login-main">
      <button className="btn ghost login-theme" onClick={onToggleTheme} aria-label={dark ? "Use light appearance" : "Use dark appearance"}>
        {dark ? <Sun /> : <Moon />}
      </button>
      <form className="login-card" onSubmit={submit} aria-busy={busy}>
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Sign in</h1>
        <p className="muted">Use the account provided by your administrator.</p>
        {error && <div className="notice warning" role="alert">{error.message}</div>}
        {mode === "dev" && loginRequired && <>
          <label className="field">Login ID
            <input value={loginId} autoComplete="username" autoFocus required disabled={busy} onChange={(event) => setLoginId(event.target.value)} />
          </label>
          <label className="field">Password
            <input type="password" value={password} autoComplete="current-password" required disabled={busy} onChange={(event) => setPassword(event.target.value)} />
          </label>
        </>}
        {mode === "dev" && <>
          <div className="notice warning">Demonstration environment · fictional member data</div>
          <label className="field">Development role
            <select value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}>
              {roleOrder.map((role) => <option key={role} value={roleProfiles[role].userId}>{roleProfiles[role].name}</option>)}
            </select>
          </label>
          <p className="login-help">Start as Super administrator for the full tour. Switch to the individual roles to demonstrate their work and independent approvals.</p>
        </>}
        <button className="btn primary" disabled={busy} type="submit">
          {busy ? "Connecting…" : mode === "oidc" ? "Continue with organization SSO" : mode === "dev" ? "Sign in to demo" : "Retry connection"}
          <ArrowRight size={18} />
        </button>
        <p className="muted">Need access? Ask your administrator to register your organization identity and assign your role.</p>
      </form>
    </main>
  </div>;
}
