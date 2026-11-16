/**
 * Typed links on entries (`parent`, `about`, the legacy `attached_to`) and the post-reference
 * grammar that makes a tree edge. Shared by `time.ts` (which reads the fields) and `threads.ts`
 * (which resolves the tree). Pure and browser-safe.
 */

import { parseMapPositionAddress } from "./maps.js";

/** A typed link `<type>:<id>`, or a bare post alias. `raw` preserves the authored value when parsed. */
export interface ThreadAttachment {
  kind: string;
  value: string;
  raw?: string;
}

export type ThreadAttachmentParseResult =
  | { status: "valid"; attachment: ThreadAttachment }
  | { status: "absent"; warning?: "invalid_attached_to" | "invalid_parent" }
  | { status: "invalid"; issue: "invalid_context" | "invalid_frontmatter" | "invalid_attached_to" };

export const POST_ID = /^msg_[A-Za-z0-9][A-Za-z0-9_-]*$/;
const POST_PATH = /^_threads\/[^/.][^/]*\/[^/.][^/]*\.md$/;

/** Parse a typed link (`parent`, `about`, legacy `attached_to`) into a structured ThreadAttachment. */
export function parseThreadAttachment(value: unknown): ThreadAttachment | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();

  const colon = raw.indexOf(":");
  if (colon > 0) {
    const type = raw.slice(0, colon);
    const val = raw.slice(colon + 1);
    // The type namespace is open. Post targets alone have a checked local grammar.
    if (/^[a-z][a-z0-9_]*$/.test(type) && val.length > 0 &&
      (type !== "post" || isPostAttachmentTarget(val))) {
      // `id` and `path` are internal bare-alias kinds, not typed tree edges.
      // Preserve these open typed values as metadata without reinterpreting them.
      return { kind: type === "id" || type === "path" ? `typed:${type}` : type, value: val, raw };
    }
  }

  if (POST_ID.test(raw)) return { kind: "id", value: raw, raw };
  if (isPostPath(raw)) return { kind: "path", value: raw, raw };
  return null;
}

/** A post reference: `post:` typed, or one of its bare aliases. The only kinds that make a tree edge. */
export function isPostReference(attachment: ThreadAttachment): boolean {
  return attachment.kind === "post" || attachment.kind === "id" || attachment.kind === "path";
}

/** A canonical direct post path, `_threads/<thread>/<post>.md`, never a README. */
export function isPostPath(value: string): boolean {
  return POST_PATH.test(value) && !value.endsWith("/README.md");
}

function isPostAttachmentTarget(value: string): boolean {
  return POST_ID.test(value) || isPostPath(value) || addressedPostTarget(value) !== null;
}

/**
 * An addressed post in a named root: `@n_…//<selector>` or `@name//<selector>`, where the selector is
 * a canonical post path or a folder's `msg_…` id (`_threads/<thread>/msg_…`, or `msg_…` at the
 * root). The reader's own root (`//…`) is not a parent form: a post in the same root uses the
 * plain forms.
 */
export function addressedPostTarget(value: string): { root: string; selector: string } | null {
  if (!value.startsWith("@")) return null;
  const parsed = parseMapPositionAddress(value);
  if (parsed.status !== "valid" || parsed.address.root.kind === "self") return null;
  const selector = parsed.address.position;
  const last = selector.split("/").at(-1) ?? "";
  if (!isPostPath(selector) && !POST_ID.test(last)) return null;
  const root = parsed.address.root.kind === "identity" ? parsed.address.root.rootNodeId : parsed.address.root.name;
  return { root, selector };
}

/** Does a supplied post answer an addressed selector: its exact path, or its id inside the named folder. */
export function matchesPostSelector(post: { path: string; id: string }, selector: string): boolean {
  if (post.path === selector) return true;
  const slash = selector.lastIndexOf("/");
  const folder = slash < 0 ? "" : selector.slice(0, slash);
  const id = slash < 0 ? selector : selector.slice(slash + 1);
  if (!POST_ID.test(id) || post.id !== id) return false;
  const postFolder = post.path.slice(0, post.path.lastIndexOf("/"));
  return folder === "" || postFolder === folder;
}
