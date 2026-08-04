import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim();
const temp = mkdtempSync(join(tmpdir(), "ideaspaces-protocol-package-"));

const expected = [
  "LICENSE",
  "README.md",
  "SKILLS.md",
  "SPEC.md",
  "VERSION",
  "dist/awareness.d.ts",
  "dist/awareness.d.ts.map",
  "dist/awareness.js",
  "dist/awareness.js.map",
  "dist/conformance.d.ts",
  "dist/conformance.d.ts.map",
  "dist/conformance.js",
  "dist/conformance.js.map",
  "dist/filesystem.d.ts",
  "dist/filesystem.d.ts.map",
  "dist/filesystem.js",
  "dist/filesystem.js.map",
  "dist/frontmatter.d.ts",
  "dist/frontmatter.d.ts.map",
  "dist/frontmatter.js",
  "dist/frontmatter.js.map",
  "dist/git.d.ts",
  "dist/git.d.ts.map",
  "dist/git.js",
  "dist/git.js.map",
  "dist/index.d.ts",
  "dist/index.d.ts.map",
  "dist/index.js",
  "dist/index.js.map",
  "dist/path-context.d.ts",
  "dist/path-context.d.ts.map",
  "dist/path-context.js",
  "dist/path-context.js.map",
  "dist/skill-catalog.generated.d.ts",
  "dist/skill-catalog.generated.d.ts.map",
  "dist/skill-catalog.generated.js",
  "dist/skill-catalog.generated.js.map",
  "dist/skills.d.ts",
  "dist/skills.d.ts.map",
  "dist/skills.js",
  "dist/skills.js.map",
  "dist/space.d.ts",
  "dist/space.d.ts.map",
  "dist/space.js",
  "dist/space.js.map",
  "dist/stale-docs.d.ts",
  "dist/stale-docs.d.ts.map",
  "dist/stale-docs.js",
  "dist/stale-docs.js.map",
  "dist/surface-state.d.ts",
  "dist/surface-state.d.ts.map",
  "dist/surface-state.js",
  "dist/surface-state.js.map",
  "dist/trailers.d.ts",
  "dist/trailers.d.ts.map",
  "dist/trailers.js",
  "dist/trailers.js.map",
  "dist/workspace.d.ts",
  "dist/workspace.d.ts.map",
  "dist/workspace.js",
  "dist/workspace.js.map",
  "package.json",
  "schema/README.md",
  "schema/agent-contract.md",
  "schema/content-awareness.md",
  "schema/frontmatter.schema.json",
  "schema/surface-state.md",
  "schema/trailers.md",
  "schema/workspace-handles.md",
  "skills/awareness.md",
  "skills/capture.md",
  "skills/form-perspective.md",
  "skills/form-primitive.md",
  "skills/guide.md",
  "skills/purpose-elicitation.md",
  "skills/repo-context.md",
  "skills/writing.md",
].sort();

try {
  if (pkg.version !== version) {
    throw new Error(`package.json version ${pkg.version} does not match VERSION ${version}`);
  }
  if (JSON.stringify(Object.keys(pkg.dependencies ?? {})) !== JSON.stringify(["yaml"])) {
    throw new Error("The public protocol package must have exactly one runtime dependency: yaml.");
  }
  if (pkg.sideEffects !== false) {
    throw new Error("The public protocol package must remain side-effect free.");
  }

  const exportKeys = Object.keys(pkg.exports ?? {});
  const expectedExports = [".", "./schema/frontmatter", "./SPEC.md", "./SKILLS.md"];
  if (JSON.stringify(exportKeys) !== JSON.stringify(expectedExports)) {
    throw new Error(`Unexpected package exports: ${exportKeys.join(", ")}`);
  }

  // A clean build must remove APIs deleted from source rather than carrying stale dist files.
  mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
  writeFileSync(new URL("../dist/obsolete.js", import.meta.url), "stale\n");
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });

  // npm 10 runs `prepare` during `npm pack` even with --ignore-scripts. Its
  // stdout precedes the requested JSON, so parse the final top-level array
  // rather than assuming the command emits JSON alone.
  const packOutput = execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", temp],
    { cwd: root, encoding: "utf8" },
  );
  const jsonStart = packOutput.lastIndexOf("\n[");
  const packed = JSON.parse(jsonStart >= 0 ? packOutput.slice(jsonStart + 1) : packOutput)[0];
  const paths = packed.files.map((file) => file.path).sort();
  if (JSON.stringify(paths) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected package contents.\nExpected:\n${expected.map((path) => `- ${path}`).join("\n")}\nActual:\n${paths.map((path) => `- ${path}`).join("\n")}`,
    );
  }

  const installRoot = join(temp, "install");
  const tarball = join(temp, packed.filename);
  execFileSync(
    "npm",
    ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--prefix", installRoot, tarball],
    { stdio: "inherit" },
  );

  const probe = `
    import { createRequire } from "node:module";
    import * as protocol from "@ideaspaces/protocol";
    const require = createRequire(import.meta.url);
    const schema = require("@ideaspaces/protocol/schema/frontmatter");
    const required = [
      "assembleContentAwareness",
      "composeContractAlongPath",
      "renderContentAwareness",
      "renderPosition",
      "validateSpace",
    ];
    for (const name of required) {
      if (typeof protocol[name] !== "function") throw new Error(\`Missing runtime export: \${name}\`);
    }
    if (schema?.title !== "Ideaspace Note frontmatter (Layer 1)") {
      throw new Error("Frontmatter schema export did not load");
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: installRoot,
    stdio: "inherit",
  });

  console.log(
    `Verified ${pkg.name}@${pkg.version}: ${paths.length} files, ` +
      `${packed.unpackedSize} bytes unpacked, clean install and public exports load.`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
