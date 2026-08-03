// Generic implementation directories omitted from local shape overviews.
// Surface/product-specific folders belong in caller-supplied exclusions.
export const DEFAULT_IGNORED_DIRECTORIES = [
  ".git",
  ".github",
  ".vscode",
  ".idea",
  "node_modules",
  "dist",
  "build",
] as const;
