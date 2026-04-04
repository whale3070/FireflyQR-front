/** 将 ipfs:// 转为可直连的 HTTPS（多网关可提高可用性） */
export function normalizeAssetUrl(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (s.startsWith("ipfs://")) {
    const cidPath = s.replace(/^ipfs:\/\//, "");
    return `https://ipfs.io/ipfs/${cidPath}`;
  }
  return s;
}

export function parseJsonDataUri(uri: string): Record<string, unknown> | null {
  const raw = (uri || "").trim();
  if (!raw.startsWith("data:application/json")) return null;
  const idx = raw.indexOf(",");
  if (idx < 0) return null;
  const meta = raw.slice(0, idx);
  const payload = raw.slice(idx + 1);
  try {
    if (meta.includes(";base64")) {
      return JSON.parse(atob(payload)) as Record<string, unknown>;
    }
    return JSON.parse(decodeURIComponent(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
