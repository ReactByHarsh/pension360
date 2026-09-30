import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OriginalLogin } from "./OriginalLogin";
import { OriginalShell } from "./OriginalShell";
import type { Role } from "../types";

const noop = () => {};
function shell(role: Role, mode: "dev" | "oidc") {
  return renderToStaticMarkup(<OriginalShell user={{ id: role.toLowerCase(), name: "Demo User", role }}
    mode={mode} dark={false} onToggleTheme={noop} rtl={false} onToggleRtl={noop}
    currentPage="executive" navigate={noop} onDevLogin={noop} onLogout={noop}
    busy={false} hasUnsaved={false}><p>Authorized workspace content</p></OriginalShell>);
}
describe("Restored shell identity boundaries", () => {
  it("uses SSO without rendering demo identities or a legacy password form in production", () => {
    const html = renderToStaticMarkup(<OriginalLogin mode="oidc" busy={false} error={null}
      dark={false} onToggleTheme={noop} onDevLogin={noop} onSignIn={noop} />);
    expect(html).toContain("Continue with organization SSO");
    expect(html).not.toContain("superadmin");
    expect(html).not.toContain("Development role");
    expect(html).not.toContain('type="password"');
  });
  it("offers all six identities only for a development sign-in", () => {
    const html = renderToStaticMarkup(<OriginalLogin mode="dev" busy={false} error={null}
      dark={false} onToggleTheme={noop} onDevLogin={noop} onSignIn={noop} />);
    expect(html.match(/<option /g)).toHaveLength(6);
    expect(html).toContain("fictional member data");
    expect(html).toContain("Super administrator");
  });
  it("keeps the account role switch out of production and restricts user access to the super administrator", () => {
    const admin = shell("ADMIN", "oidc");
    const superAdmin = shell("SUPER_ADMIN", "dev");
    expect(admin).not.toContain("Switch development role");
    expect(admin).not.toContain(">Users &amp; roles</button>");
    expect(superAdmin).toContain("Switch development role");
    expect(superAdmin).toContain(">Users &amp; roles</button>");
  });
  it("keeps auditor navigation free of Copilot actions while rendering its authorized content", () => {
    const html = shell("AUDITOR", "oidc");
    expect(html).not.toContain("Ask Copilot");
    expect(html).not.toContain("Ask a question");
    expect(html).toContain("Authorized workspace content");
    expect(html).toContain('aria-label="Search the workspace"');
  });
});
