import httpClient from "../services/api/http";

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|heif|heic|webp)$/i;
const PDF_EXT_RE = /\.pdf$/i;

export type StorageCategory = "profile" | "document" | "certificate";

/**
 * Resolves DB values like `/api/files/profile/x.png`, `profile/x.png`,
 * S3 URLs, or bare filenames (e.g. from self-registration JSON) to a full fetch URL.
 */
export function resolveFileUrl(raw: string, defaultCategory: StorageCategory): string {
  const url = raw.trim();
  if (!url) return "";

  const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

  if (url.includes(".s3.") && url.includes(".amazonaws.com")) {
    return url;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("/api/files/")) {
    return `${apiBaseUrl}${url}`;
  }

  const uploadsMatch = url.match(/uploads\/(profile|document|certificate)\/([^/]+)$/i);
  if (uploadsMatch) {
    return `${apiBaseUrl}/api/files/${uploadsMatch[1]}/${uploadsMatch[2]}`;
  }

  const pathMatch = url.match(
    /(profile|profiles|document|documents|certificate|certificates|courses|idproof|idproofs)\/([^/]+)$/i
  );
  if (pathMatch) {
    let [, category] = pathMatch;
    const filename = pathMatch[2];
    if (category === "profiles") category = "profile";
    if (category === "documents") category = "document";
    if (category === "certificates") category = "certificate";
    if (category === "idproofs") category = "document";
    return `${apiBaseUrl}/api/files/${category}/${filename}`;
  }

  // Bare filename only (e.g. register_client sent only the file name)
  if (!url.includes("/") && !url.includes("\\")) {
    return `${apiBaseUrl}/api/files/${defaultCategory}/${url}`;
  }

  return `${apiBaseUrl}/api${url.startsWith("/") ? url : `/${url}`}`;
}

/** Path only — strips query/hash so `.jpg?AWSAccessKeyId=...` still matches image regex. */
export function pathForExtensionCheck(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) {
      return new URL(s).pathname;
    }
  } catch {
    /* ignore */
  }
  return s.split("?")[0].split("#")[0];
}

export function isImageFile(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  return IMAGE_EXT_RE.test(pathForExtensionCheck(raw));
}

export function isPdfFile(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  return PDF_EXT_RE.test(pathForExtensionCheck(raw));
}

/**
 * Use path relative to axios baseURL when possible so dev proxy + prod API URL both work.
 * Keep absolute URLs for S3 / other hosts.
 */
export function urlForAxiosBlobGet(raw: string, defaultCategory: StorageCategory): string {
  const full = resolveFileUrl(raw, defaultCategory);
  if (!full) return "";
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
  if (base && full.startsWith(base)) {
    const path = full.slice(base.length);
    return path.startsWith("/") ? path : `/${path}`;
  }
  return full;
}

/** Fetch file bytes with session (Bearer / cookies) — required for protected `/api/files/...`. */
export async function getBlobAuthenticated(
  raw: string,
  defaultCategory: StorageCategory
): Promise<Blob> {
  const url = urlForAxiosBlobGet(raw, defaultCategory);
  if (!url) throw new Error("empty url");
  const res = await httpClient.get<Blob>(url, { responseType: "blob" });
  const blob = res.data;
  if (blob.type.includes("json") || blob.type === "application/json") {
    const text = await blob.text();
    throw new Error(text || "Server returned JSON instead of a file");
  }
  return blob;
}
