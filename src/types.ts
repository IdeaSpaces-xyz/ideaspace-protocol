/**
 * @ideaspaces/sdk types
 *
 * All interfaces for the SDK. Moved from pi-sw-space/src/client.ts
 * with new SDK-specific types added (config, transport, response wrapper).
 */

// ─── SDK Config & Infrastructure ────────────────────────────────────

/** Configuration for createClient(). */
export interface IsClientConfig {
  /** API key for authentication. */
  apiKey: string;
  /** API base URL. Default: https://api.ideaspaces.xyz */
  apiUrl?: string;
  /** Repo ID. Auto-discovered if omitted and user has exactly one repo. */
  repo?: string;
  /** Retry configuration for transient failures. */
  retry?: {
    /** Max retry attempts. Default: 3 */
    maxRetries?: number;
    /** HTTP statuses to retry on. Default: [429, 502, 503, 529] */
    retryableStatuses?: number[];
  };
  /** Per-request timeout in ms. Default: 30000 */
  timeout?: number;
  /** Injectable transport for testing. Overrides apiUrl/apiKey/retry/timeout. */
  transport?: IsTransport;
}

/** Transport abstraction — the seam for testing and custom HTTP. */
export interface IsTransport {
  request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<TransportResponse>;
}

/** Raw response from the transport layer. */
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** Every SDK operation returns data + metadata. */
export interface SdkResponse<T> {
  data: T;
  meta: {
    /** Round-trip time in ms. */
    requestMs: number;
    /** Number of retries (0 if first attempt succeeded). */
    retries: number;
    /** Rate limit info from response headers, if present. */
    rateLimit?: {
      remaining: number;
      resetAt: Date;
    };
  };
}

/** Error categories for typed error handling. */
export type SdkErrorCategory =
  | "rate_limited"
  | "overloaded"
  | "auth_error"
  | "client_error"
  | "not_found"
  | "network_error"
  | "timeout";

// ─── API Response Types ─────────────────────────────────────────────

export interface RepoInfo {
  repo_id: string;
  slug: string;
  hostname: string | null;
  role: string;
  name?: string;
  file_count?: number;
  last_activity?: string;
  description?: string;
}

export interface CreateRepoBody {
  name: string;
  slug?: string;
  purpose?: string;
  hostname?: string | null;
}

export interface CreateRepoResult {
  repo_id: string;
  slug: string;
  name: string;
}

export interface ConnectRepoBody {
  origin_url: string;
  name: string;
  slug?: string;
  hostname?: string | null;
}

export interface ReindexRepoResult {
  repo_id: string;
  removed_entries: number;
  indexed_files: number;
  status: string;
}

export interface OutlineItem {
  type: "branch" | "note" | "perspective" | "skill" | "agent_context";
  path: string;
  name: string;
  summary?: string;
  node_id: string;
  node_type: string;
}

export interface OutlineResult {
  repo_id: string;
  username: string | null;
  slug: string;
  items: OutlineItem[];
}

export interface NavigateResult {
  path: string;
  readme: string | null;
  now: string | null;
  children: Array<{
    name: string;
    type: string;
    summary?: string;
    file_count?: number;
    path?: string;
    node_id?: string;
  }>;
  ancestor_context: Array<{ path: string; readme: string }>;
  agent_context: Array<{
    kind: string;
    path: string;
    name: string;
    description?: string;
    inherited_from?: string;
    node_id?: string;
  }>;
  conversations: Array<{
    conversation_id: string;
    name: string;
    summary?: string;
    status: string;
  }>;
  centroid: number[] | null;
  file_count: number;
}

export interface SearchParams {
  query: string;
  scope?: string;
  node_type?: string;
  attached_to?: string;
  contributed_by?: string;
  /** Preferred API field. */
  tag?: string;
  /** Backward-compatible alias for `tag`. */
  tags?: string;
  /** Preferred API field. */
  top_k?: number;
  /** Backward-compatible alias for `top_k`. */
  limit?: number;
}

export interface SearchResult {
  node_id: string;
  path: string;
  name: string;
  summary?: string;
  score: number;
  tags: string[];
  attached_to: string[];
  node_type: string;
}

export interface FileResult {
  path: string;
  node_id?: string;
  content: string;
  total_lines: number;
  continuation?: { next_offset: number; remaining: number };
  frontmatter: Record<string, unknown>;
  node_type: string;
  tags: string[];
  attached_to: string[];
  last_commit_sha?: string;
}

export interface WriteFileBody {
  content: string;
  name?: string;
  summary?: string;
  tags?: string[];
  attached_to?: string[];
  accessibility?: string[];
  if_match?: string;
}

export interface WriteFileOptions {
  /**
   * Bypass SDK auto-CAS behavior and send write as-is.
   * Use for intentional overwrite flows.
   */
  force?: boolean;
}

export interface WriteResult {
  path: string;
  node_id: string;
  commit_sha: string;
}

export interface GrepResult {
  pattern: string;
  matches: Array<{ file: string; line_number: number; content: string }>;
}

export interface GrepSectionsResult {
  heading: string;
  section_count: number;
  sections: Array<{
    file: string;
    heading: string;
    level: number;
    line: number;
    content: string;
    truncated: boolean;
  }>;
}

export interface TagsResult {
  tags: Array<{
    tag: string;
    total: number;
    notes: number;
    perspectives: number;
  }>;
}

export interface HistoryResult {
  node_id: string;
  path?: string;
  history: Array<{
    sha: string;
    message: string;
    date: string;
    author: string;
  }>;
}

export interface NodeVersionResult {
  node_id: string;
  path: string;
  sha: string;
  content: string;
}

export interface DeleteResult {
  deleted: string;
  path: string;
}

export interface MoveResult {
  moved?: string;
  deleted?: string;
  destination?: string;
  files_updated?: number;
}

export interface MetadataFields {
  accessibility?: string[];
  tags?: string[];
  attached_to?: string[];
  contributed_by?: string[];
  origin?: string;
  references?: string[];
}

export interface MetadataUpdateResult {
  updated: string;
  fields: string[];
}

export interface ListNodesParams {
  node_type?: string;
  tag?: string;
  dir_path?: string;
  attached_to?: string;
  contributed_by?: string;
  origin?: string;
  limit?: number;
  offset?: number;
  sort_by?: "updated_at" | "created_at";
  sort_order?: "asc" | "desc";
}

export interface NodeListItem {
  node_id: string;
  name: string;
  summary?: string;
  node_type: string;
  path: string;
  dir_path: string;
  tags: string[];
  attached_to: string[];
  contributed_by: string[];
  references: string[];
  referenced_by: string[];
  origin: string;
  web_page?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ListNodesResult {
  nodes: NodeListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface GitOpsParams {
  op: "log" | "changes" | "find" | "diff" | "word_diff";
  path?: string;
  ref?: string;
  text?: string;
  since?: string;
  limit?: number;
}

export interface FileStatusResult {
  head: string;
  files: Array<{ path: string; sha: string }>;
}

export interface GitOpsResult {
  op: string;
  entries?: Array<{
    sha: string;
    message: string;
    date: string;
    author: string;
  }>;
  changes?: Array<{ status: string; path: string }>;
  text?: string;
  since?: string;
  ref?: string;
  output?: string;
}
