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
  "conformance/assets/manifest.json",
  "conformance/awareness/focus-render.txt",
  "conformance/awareness/foundation-render.txt",
  "conformance/awareness/foundation-vector-render.txt",
  "conformance/awareness/manifest.json",
  "conformance/awareness/placement-head-render.txt",
  "conformance/awareness/placement-tail-render.txt",
  "conformance/awareness/tail-composition-render.txt",
  "conformance/awareness/tail-composition-state.txt",
  "conformance/content-look/manifest.json",
  "conformance/content-look/note-full-render.txt",
  "conformance/extensions/manifest.json",
  "conformance/local-effects/manifest.json",
  "conformance/map-projection/manifest.json",
  "conformance/maps/manifest.json",
  "conformance/root-identity/manifest.json",
  "conformance/reference-agreement/README.md",
  "conformance/reference-agreement/_agent/agreement.md",
  "conformance/reference-agreement/_agent/purpose.md",
  "conformance/reference-agreement/_agent/skills/ask.md",
  "conformance/reference-agreement/_agent/skills/close-context.md",
  "conformance/reference-agreement/_agent/skills/reach-agreement.md",
  "conformance/reference-look/_agent/agreement.md",
  "conformance/reference-look/_agent/foundation.md",
  "conformance/reference-look/data.txt",
  "conformance/reference-look/docs/README.md",
  "conformance/reference-look/docs/alpha.md",
  "conformance/reference-look/docs/sub/beta.md",
  "conformance/reference-look/notes/decision.md",
  "dist/agreement.d.ts",
  "dist/agreement.d.ts.map",
  "dist/agreement.js",
  "dist/agreement.js.map",
  "dist/assets.d.ts",
  "dist/assets.d.ts.map",
  "dist/assets.js",
  "dist/assets.js.map",
  "dist/awareness.d.ts",
  "dist/awareness.d.ts.map",
  "dist/awareness.js",
  "dist/awareness.js.map",
  "dist/content-look.d.ts",
  "dist/content-look.d.ts.map",
  "dist/content-look.js",
  "dist/content-look.js.map",
  "dist/content-state.d.ts",
  "dist/content-state.d.ts.map",
  "dist/content-state.js",
  "dist/content-state.js.map",
  "dist/conformance.d.ts",
  "dist/conformance.d.ts.map",
  "dist/conformance.js",
  "dist/conformance.js.map",
  "dist/filesystem.d.ts",
  "dist/filesystem.d.ts.map",
  "dist/filesystem.js",
  "dist/filesystem.js.map",
  "dist/foundation-core.d.ts",
  "dist/foundation-core.d.ts.map",
  "dist/foundation-core.js",
  "dist/foundation-core.js.map",
  "dist/foundation-core.generated.d.ts",
  "dist/foundation-core.generated.d.ts.map",
  "dist/foundation-core.generated.js",
  "dist/foundation-core.generated.js.map",
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
  "dist/local-effects.d.ts",
  "dist/local-effects.d.ts.map",
  "dist/local-effects.js",
  "dist/local-effects.js.map",
  "dist/local-effects-runtime.d.ts",
  "dist/local-effects-runtime.d.ts.map",
  "dist/local-effects-runtime.js",
  "dist/local-effects-runtime.js.map",
  "dist/markdown-inspection.d.ts",
  "dist/markdown-inspection.d.ts.map",
  "dist/markdown-inspection.js",
  "dist/markdown-inspection.js.map",
  "dist/map-projection.d.ts",
  "dist/map-projection.d.ts.map",
  "dist/map-projection.js",
  "dist/map-projection.js.map",
  "dist/maps.d.ts",
  "dist/maps.d.ts.map",
  "dist/maps.js",
  "dist/maps.js.map",
  "dist/path-context.d.ts",
  "dist/path-context.d.ts.map",
  "dist/path-context.js",
  "dist/path-context.js.map",
  "dist/repository-path.d.ts",
  "dist/repository-path.d.ts.map",
  "dist/repository-path.js",
  "dist/repository-path.js.map",
  "dist/root-identity.d.ts",
  "dist/root-identity.d.ts.map",
  "dist/root-identity.js",
  "dist/root-identity.js.map",
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
  "schema/assets.md",
  "schema/content-awareness.md",
  "schema/content-look.md",
  "schema/extensions.md",
  "schema/frontmatter.schema.json",
  "schema/local-effects.md",
  "schema/map-projection.md",
  "schema/markdown-inspection.md",
  "schema/maps.md",
  "schema/repository-path.md",
  "schema/root-identity.md",
  "schema/surface-state.md",
  "schema/trailers.md",
  "schema/workspace-handles.md",
  "skills/awareness.md",
  "skills/capture.md",
  "skills/form-perspective.md",
  "skills/form-primitive.md",
  "skills/guide-bigger-picture.md",
  "skills/guide-jobs.md",
  "skills/guide-story.md",
  "skills/guide-working.md",
  "skills/guide.md",
  "skills/migrate-to-agreement.md",
  "skills/purpose-elicitation.md",
  "skills/repo-context.md",
  "skills/writing.md",
  "templates/foundation-core.md",
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
  const expectedExports = [
    ".",
    "./assets",
    "./frontmatter",
    "./local-effects",
    "./maps",
    "./schema/frontmatter",
    "./schema/repository-path",
    "./schema/extensions",
    "./schema/assets",
    "./schema/local-effects",
    "./schema/root-identity",
    "./schema/maps",
    "./schema/map-projection",
    "./schema/content-awareness",
    "./schema/content-look",
    "./conformance/extensions",
    "./conformance/assets",
    "./conformance/local-effects",
    "./conformance/root-identity",
    "./conformance/awareness",
    "./conformance/content-look",
    "./conformance/maps",
    "./conformance/map-projection",
    "./SPEC.md",
    "./SKILLS.md",
    "./templates/foundation-core.md",
  ];
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
    import { deepStrictEqual } from "node:assert";
    import { dirname, resolve } from "node:path";
    import * as protocol from "@ideaspaces/protocol";
    import * as assetsRuntime from "@ideaspaces/protocol/assets";
    import * as frontmatterRuntime from "@ideaspaces/protocol/frontmatter";
    import * as localEffects from "@ideaspaces/protocol/local-effects";
    import * as mapsRuntime from "@ideaspaces/protocol/maps";
    const require = createRequire(import.meta.url);
    const schema = require("@ideaspaces/protocol/schema/frontmatter");
    const extensions = require("@ideaspaces/protocol/conformance/extensions");
    const assets = require("@ideaspaces/protocol/conformance/assets");
    const effects = require("@ideaspaces/protocol/conformance/local-effects");
    const rootIdentity = require("@ideaspaces/protocol/conformance/root-identity");
    const awareness = require("@ideaspaces/protocol/conformance/awareness");
    const contentLook = require("@ideaspaces/protocol/conformance/content-look");
    const maps = require("@ideaspaces/protocol/conformance/maps");
    const mapProjection = require("@ideaspaces/protocol/conformance/map-projection");
    const repositoryPathSchema = require.resolve("@ideaspaces/protocol/schema/repository-path");
    const extensionsSchema = require.resolve("@ideaspaces/protocol/schema/extensions");
    const assetsSchema = require.resolve("@ideaspaces/protocol/schema/assets");
    const localEffectsSchema = require.resolve("@ideaspaces/protocol/schema/local-effects");
    const rootIdentitySchema = require.resolve("@ideaspaces/protocol/schema/root-identity");
    const mapsSchema = require.resolve("@ideaspaces/protocol/schema/maps");
    const mapProjectionSchema = require.resolve("@ideaspaces/protocol/schema/map-projection");
    const awarenessSchema = require.resolve("@ideaspaces/protocol/schema/content-awareness");
    const contentLookSchema = require.resolve("@ideaspaces/protocol/schema/content-look");
    const required = [
      "assembleContentAwareness",
      "assembleContentFocus",
      "assembleContentLook",
      "assembleContentState",
      "composeAgreementAlongPath",
      "classifyRepositoryPath",
      "composeContractAlongPath",
      "inspectMarkdown",
      "inspectMarkdownFile",
      "parseCanonicalRepoUrl",
      "buildMap",
      "evaluateRootIdentity",
      "mintRootNodeId",
      "parseMap",
      "parseRootNodeId",
      "projectContentTreeMembers",
      "projectRootMapMembers",
      "pathRevision",
      "rootNodeIdFromBytes",
      "renderContentAwareness",
      "renderContentFocus",
      "renderContentLook",
      "renderContentState",
      "renderContentTail",
      "renderContentTreeProjection",
      "renderPosition",
      "renderRootMapMembers",
      "resolveAssetReference",
      "validateCommitPathsRequest",
      "validateSpace",
      "validateWriteMarkdownRequest",
    ];
    for (const name of required) {
      if (typeof protocol[name] !== "function") throw new Error(\`Missing runtime export: \${name}\`);
    }
    deepStrictEqual(protocol.CONTENT_AWARENESS_PLACEMENTS, ["head", "tail"]);
    for (const name of ["writeMarkdown", "commitPaths"]) {
      if (name in protocol) throw new Error(\`Mutation leaked through package root: \${name}\`);
      if (typeof localEffects[name] !== "function") throw new Error(\`Missing local-effect export: \${name}\`);
    }
    if (typeof localEffects.nodeLocalEffectFileSystem?.atomicWriteUtf8 !== "function") {
      throw new Error("Node local-effect filesystem adapter did not load");
    }
    const invalidWrite = await localEffects.writeMarkdown(null, {});
    if (invalidWrite.status !== "error" || invalidWrite.code !== "invalid_request") {
      throw new Error("Local-effect subpath did not execute its portable validation boundary");
    }
    if (typeof protocol.FOUNDATION_CORE !== "string" || !protocol.FOUNDATION_CORE.includes("**Never:**")) {
      throw new Error("FOUNDATION_CORE export did not load");
    }
    if (schema?.title !== "Ideaspace Note frontmatter (Layer 1)") {
      throw new Error("Frontmatter schema export did not load");
    }
    if (extensions?.format !== "ideaspaces-extensions/v1" || !extensions.required_coverage?.length) {
      throw new Error("Extensions conformance manifest did not load");
    }
    if (assets?.format !== "ideaspaces-assets/v1" || !assets.required_coverage?.length) {
      throw new Error("Assets conformance manifest did not load");
    }
    if (effects?.format !== "ideaspaces-local-effects/v1" || !effects.required_coverage?.length) {
      throw new Error("Local-effect conformance manifest did not load");
    }
    if (rootIdentity?.format !== "ideaspaces-root-identity/v1" || !rootIdentity.required_coverage?.length) {
      throw new Error("Root-identity conformance manifest did not load");
    }
    if (
      awareness?.format !== "ideaspaces-content-awareness/v1" ||
      !awareness.required_coverage?.length ||
      !awareness.focus_required_coverage?.length
    ) {
      throw new Error("Content-awareness conformance manifest did not load");
    }
    if (contentLook?.format !== "ideaspaces-content-look/v1" || !contentLook.required_coverage?.length) {
      throw new Error("Content-look conformance manifest did not load");
    }
    const contentLookManifestPath = require.resolve("@ideaspaces/protocol/conformance/content-look");
    const contentLookFixture = resolve(dirname(contentLookManifestPath), contentLook.fixture);
    const looked = await protocol.assembleContentLook({
      position: resolve(contentLookFixture, "notes/decision.md"),
      depth: "children",
      contractSource: "agreement",
    });
    if (
      looked?.status !== "ok" ||
      looked.contractRole !== "reference" ||
      looked.target.children?.[1]?.name !== "Evidence" ||
      !protocol.renderContentLook(looked).includes("placement: history")
    ) {
      throw new Error("Installed Content-look reader did not execute the conformance fixture");
    }
    if (!awareness.required_coverage.includes("tail_composition")) {
      throw new Error("Content-awareness manifest does not require tail composition");
    }
    if (!awareness.required_coverage.includes("agreement_reference")) {
      throw new Error("Content-awareness manifest does not require agreement reference coverage");
    }
    const referenceAgreementRoot = resolve(dirname(contentLookManifestPath), "../reference-agreement");
    const refAwareness = await protocol.assembleContentAwareness({
      position: referenceAgreementRoot,
      contractSource: "agreement",
      lastSha: null,
    });
    if (
      refAwareness?.status !== "ok" ||
      refAwareness.agreementReference !== "convention:repo:n_3226f849f85239cb3b996ae0"
    ) {
      throw new Error("Installed awareness reader did not lift agreement reference from fixture");
    }
    const tailState = {
      placement: "tail",
      git: { repoRoot: "/r", headSha: null, branch: "main", ahead: null, behind: null, dirty: false, untrackedInTrackedDirs: [] },
      captures: ["notes/a.md"],
    };
    const composedTail = protocol.renderContentTail(null, { state: tailState, handles: ["h"], change: "c" });
    if (composedTail !== [protocol.renderContentState(tailState), "h", "c"].join("\\n\\n")) {
      throw new Error("Installed tail composer did not order State, handles, and Change");
    }
    if (maps?.format !== "ideaspaces-maps/v2" || !maps.required_coverage?.length) {
      throw new Error("Map conformance manifest did not load");
    }
    if (mapProjection?.format !== "ideaspaces-map-projection/v1" || !mapProjection.required_coverage?.length) {
      throw new Error("Map-projection conformance manifest did not load");
    }
    if (!repositoryPathSchema.endsWith("schema/repository-path.md")) {
      throw new Error("Repository-path schema export did not resolve");
    }
    if (!extensionsSchema.endsWith("schema/extensions.md")) {
      throw new Error("Named-extension schema export did not resolve");
    }
    if (!assetsSchema.endsWith("schema/assets.md")) {
      throw new Error("Assets schema export did not resolve");
    }
    if (!localEffectsSchema.endsWith("schema/local-effects.md")) {
      throw new Error("Local-effect schema export did not resolve");
    }
    if (!rootIdentitySchema.endsWith("schema/root-identity.md")) {
      throw new Error("Root-identity schema export did not resolve");
    }
    if (!mapsSchema.endsWith("schema/maps.md")) {
      throw new Error("Map schema export did not resolve");
    }
    if (!mapProjectionSchema.endsWith("schema/map-projection.md")) {
      throw new Error("Map-projection schema export did not resolve");
    }
    if (!awarenessSchema.endsWith("schema/content-awareness.md")) {
      throw new Error("Content-awareness schema export did not resolve");
    }
    if (!contentLookSchema.endsWith("schema/content-look.md")) {
      throw new Error("Content-look schema export did not resolve");
    }
    const extension = protocol.classifyRepositoryPath("_example/payload.md", "file");
    if (extension.status !== "ok" || extension.role !== "extension" || extension.extension !== "_example") {
      throw new Error("Repository-path package boundary did not execute");
    }
    const asset = protocol.resolveAssetReference("guides/topic.md", "_assets/x.png");
    if (asset.status !== "asset" || asset.path !== "guides/_assets/x.png") {
      throw new Error("Assets package boundary did not execute");
    }
    const narrowAsset = assetsRuntime.resolveAssetReference("guides/topic.md", "_assets/x.png");
    if (narrowAsset.status !== "asset" || narrowAsset.path !== "guides/_assets/x.png") {
      throw new Error("Narrow assets package boundary did not execute");
    }
    const parsedFromSubpath = mapsRuntime.parseMap({
      roots: [{
        repo: "https://ideaspaces.example/repos/n_0123456789abcdef01234567",
        sha: "1111111111111111111111111111111111111111",
      }],
      members: [{ root: 0, position: "note.md", depth: "full" }],
    });
    if (
      parsedFromSubpath.status !== "valid" ||
      parsedFromSubpath.map.roots[0].root_node_id !== "n_0123456789abcdef01234567"
    ) {
      throw new Error("Maps subpath export did not parse map correctly");
    }
    const fm = frontmatterRuntime.parseFrontmatter("---\\nname: Test\\nsummary: Summary\\n---\\nBody");
    if (
      fm?.name !== "Test" ||
      fm?.summary !== "Summary" ||
      frontmatterRuntime.stripFrontmatter("---\\nname: Test\\n---\\nBody").trim() !== "Body"
    ) {
      throw new Error("Frontmatter subpath export did not parse frontmatter correctly");
    }
    const map = protocol.parseMap({
      roots: [{
        repo: "https://ideaspaces.example/repos/n_0123456789abcdef01234567",
        sha: "1111111111111111111111111111111111111111",
      }],
      members: [{ root: 0, position: "note.md", depth: "full" }],
    });
    if (
      map.status !== "valid" ||
      map.map.roots[0].repo !== "https://ideaspaces.example/repos/n_0123456789abcdef01234567" ||
      map.map.roots[0].root_node_id !== "n_0123456789abcdef01234567"
    ) {
      throw new Error("Map package boundary did not execute");
    }
    for (const vector of maps.vectors.filter((v) => v.operation === "build")) {
      const result = protocol.buildMap(vector.input);
      deepStrictEqual(result, vector.expected, vector.id);
      if (result.status === "valid") deepStrictEqual(protocol.parseMap(result.map), result);
    }
    const treeVector = mapProjection.vectors.find((v) => v.operation === "project_tree");
    if (!treeVector) throw new Error("Map-projection tree vector is missing");
    deepStrictEqual(
      protocol.projectContentTreeMembers(treeVector.input.tree, treeVector.input.root),
      treeVector.expected,
    );
    const aligned = protocol.evaluateRootIdentity({
      declaration: "n_0123456789abcdef01234567",
      canonicalOrigin: "n_0123456789abcdef01234567",
    });
    if (aligned.state !== "aligned" || aligned.rootNodeId !== "n_0123456789abcdef01234567") {
      throw new Error("Root-identity package boundary did not execute");
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: installRoot,
    stdio: "inherit",
  });

  const browserEntry = join(installRoot, "browser-entry.js");
  writeFileSync(
    browserEntry,
    `
      import { parseMap, buildMap } from "@ideaspaces/protocol/maps";
      import { parseFrontmatter, stripFrontmatter, composeFrontmatter } from "@ideaspaces/protocol/frontmatter";
      export { parseMap, buildMap, parseFrontmatter, stripFrontmatter, composeFrontmatter };
    `,
  );

  const { build: viteBuild } = await import("vite");
  const warnings = [];
  await viteBuild({
    root: installRoot,
    build: {
      lib: { entry: browserEntry, formats: ["es"] },
      write: false,
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          warnings.push(warning.message || String(warning));
          defaultHandler(warning);
        },
      },
    },
    logLevel: "silent",
  });
  if (warnings.length > 0) {
    throw new Error(`Browser build of subpaths emitted warnings:\n${warnings.join("\n")}`);
  }

  console.log(
    `Verified ${pkg.name}@${pkg.version}: ${paths.length} files, ` +
      `${packed.unpackedSize} bytes unpacked, clean install and public exports load.`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
