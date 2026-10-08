let accessToken: string | null = null;
export function setAccessToken(value: string | null) {
  accessToken = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && accessToken && typeof window !== "undefined")
      window.dispatchEvent(new Event("p360-session-expired"));
    throw new ApiError(
      data?.error?.message || `Request failed (${response.status}).`,
      response.status,
      data?.error?.code,
      data?.error?.requestId,
    );
  }
  const verb = method || (body === undefined ? "GET" : "POST");
  if (
    !["GET", "HEAD"].includes(verb.toUpperCase()) &&
    !/^\/(assistant(?:\/|$)|auth(?:\/|$)|session(?:\/|$))/.test(path) &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new CustomEvent("p360-data-changed", { detail: { path, method: verb } }));
  }
  return data as T;
}

/** Download a member-matched demonstration document using the same signed-in API session. */
export async function getGuidedSampleDocument(
  batchId: string,
  memberId: string,
  kind: "profile" | "payment" | "contribution" | "service",
): Promise<File> {
  const response = await fetch(`/api/v1/guided-demo/batches/${encodeURIComponent(batchId)}/members/${encodeURIComponent(memberId)}/sample-document?kind=${kind}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: "same-origin",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.error?.message || "The matching sample document could not be downloaded.", response.status);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("application/pdf") || blob.size > 5 * 1024 * 1024)
    throw new Error("The sample response is not a supported PDF.");
  return new File([blob], `Pension360_${memberId.replace(/[^A-Za-z0-9_-]/g, "_")}_${kind}_sample.pdf`, { type: "application/pdf" });
}
export async function downloadDocument(id: string, title: string) {
  const response = await fetch(
    `/api/v1/documents/${encodeURIComponent(id)}/content`,
    { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  );
  if (!response.ok)
    throw new ApiError("Document download failed.", response.status);
  const url = URL.createObjectURL(await response.blob());
  const serverName = /filename="([^"]+)"/.exec(
    response.headers.get("Content-Disposition") || "",
  )?.[1];
  const extension = serverName?.match(/\.(pdf|png|jpg)$/i)?.[0] || "";
  const safeTitle = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .slice(0, 160);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeTitle.endsWith(extension)
    ? safeTitle
    : safeTitle + extension;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type DemoAsset = {
  id: string;
  module: string;
  title: string;
  filename: string;
  memberId?: string;
  description: string;
  uploadPurpose: string;
  downloadPath: string;
};
export async function getDemoAssetFile(
  asset: Pick<DemoAsset, "id" | "filename">,
): Promise<File> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id))
    throw new Error("Choose a known demonstration document.");
  const response = await fetch(
    `/api/v1/demo/assets/${encodeURIComponent(asset.id)}/download`,
    {
      credentials: "same-origin",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  );
  if (!response.ok) {
    if (response.status === 401 && accessToken && typeof window !== "undefined")
      window.dispatchEvent(new Event("p360-session-expired"));
    throw new ApiError(
      "Sample document could not be downloaded.",
      response.status,
    );
  }
  const content = await response.blob();
  if (content.type !== "application/pdf" || content.size > 5 * 1024 * 1024)
    throw new Error("The sample response is not a supported PDF.");
  const filename = asset.filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .slice(0, 160);
  return new File([content], filename, { type: "application/pdf" });
}
export async function downloadDemoAsset(asset: DemoAsset) {
  const file = await getDemoAssetFile(asset);
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
