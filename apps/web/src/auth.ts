import { UserManager, WebStorageStateStore } from "oidc-client-ts";

// Access tokens are kept in memory. Only the short-lived redirect state uses session storage.
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
let manager: UserManager | null = null;
export function oidc() {
  if (manager) return manager;
  const authority = import.meta.env.VITE_OIDC_AUTHORITY;
  const clientId = import.meta.env.VITE_OIDC_CLIENT_ID;
  if (!authority || !clientId)
    throw new Error(
      "Single sign-on is not configured. Set the frontend OIDC authority and client ID for this deployment.",
    );
  manager = new UserManager({
    authority,
    client_id: clientId,
    redirect_uri:
      import.meta.env.VITE_OIDC_REDIRECT_URI ||
      `${location.origin}/auth/callback`,
    post_logout_redirect_uri: location.origin,
    response_type: "code",
    scope: import.meta.env.VITE_OIDC_SCOPE || "openid profile pension360",
    automaticSilentRenew: false,
    loadUserInfo: false,
    userStore: new WebStorageStateStore({ store: new MemoryStorage() }),
    stateStore: new WebStorageStateStore({ store: sessionStorage }),
  });
  return manager;
}
