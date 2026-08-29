import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ASSET_DIRECTORY,
  resolveAssetReference,
  type AssetReferenceResolution,
} from "./assets.js";
import { validateSpace } from "./conformance.js";

describe("asset reference resolution", () => {
  it("resolves lexically without consulting availability", () => {
    expect(resolveAssetReference("guides/topic.md", "_assets/shared.png")).toEqual({
      status: "asset",
      path: "guides/_assets/shared.png",
    });
    expect(resolveAssetReference("guides/topic.md", "../_assets/shared.png")).toEqual({
      status: "asset",
      path: "_assets/shared.png",
    });
  });

  it("uses the first infrastructure directory to determine the role", () => {
    expect(resolveAssetReference("topic.md", "_scratch/_assets/x.png")).toEqual({
      status: "other",
      path: "_scratch/_assets/x.png",
    });
    expect(resolveAssetReference("topic.md", "_assets/_scratch/x.png")).toEqual({
      status: "asset",
      path: "_assets/_scratch/x.png",
    });
  });

  it("reports root escape without turning it into invalid input", () => {
    expect(resolveAssetReference("guides/topic.md", "../../outside.png")).toEqual({
      status: "outside",
    });
  });
});

interface ResolveVector {
  id: string;
  operation: "resolve";
  covers: string[];
  input: { source_path: unknown; reference_path: unknown };
  expected: AssetReferenceResolution;
}

interface ResolveCasesVector {
  id: string;
  operation: "resolve_cases";
  covers: string[];
  source_path: unknown;
  tree?: string[];
  cases: Array<{
    reference_path: unknown;
    expected: AssetReferenceResolution;
  }>;
}

interface InvalidSourceCasesVector {
  id: string;
  operation: "invalid_source_cases";
  covers: string[];
  reference_path: unknown;
  cases: unknown[];
  expected: AssetReferenceResolution;
}

interface InvalidReferenceCasesVector {
  id: string;
  operation: "invalid_reference_cases";
  covers: string[];
  source_path: unknown;
  cases: unknown[];
  expected: AssetReferenceResolution;
}

interface ValidateSpaceVector {
  id: string;
  operation: "validate_space";
  covers: string[];
  tree: Record<string, string>;
  expected: {
    ok: boolean;
    notes_checked: number;
    unknown_infrastructure_warnings: string[];
  };
}

type AssetVector =
  | ResolveVector
  | ResolveCasesVector
  | InvalidSourceCasesVector
  | InvalidReferenceCasesVector
  | ValidateSpaceVector;

const manifest = JSON.parse(
  readFileSync(new URL("../conformance/assets/manifest.json", import.meta.url), "utf-8"),
) as {
  format: string;
  asset_directory: string;
  required_coverage: string[];
  vectors: AssetVector[];
};

const temporarySpaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporarySpaces.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("assets conformance manifest", () => {
  it("has the expected language-neutral format and complete declared coverage", () => {
    expect(manifest.format).toBe("ideaspaces-assets/v1");
    expect(manifest.asset_directory).toBe(ASSET_DIRECTORY);
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    for (const requirement of manifest.required_coverage) {
      expect(covered.has(requirement), requirement).toBe(true);
    }
  });

  it.each(manifest.vectors)("executes $id", async (vector) => {
    switch (vector.operation) {
      case "resolve":
        expect(
          resolveAssetReference(vector.input.source_path, vector.input.reference_path),
        ).toEqual(vector.expected);
        break;
      case "resolve_cases":
        for (const testCase of vector.cases) {
          const result = resolveAssetReference(vector.source_path, testCase.reference_path);
          expect(result, String(testCase.reference_path)).toEqual(testCase.expected);
          if (vector.tree && result.status === "asset") {
            expect(vector.tree, `${result.path} must be one of the both-present paths`).toContain(
              result.path,
            );
          }
        }
        break;
      case "invalid_source_cases":
        for (const sourcePath of vector.cases) {
          expect(
            resolveAssetReference(sourcePath, vector.reference_path),
            JSON.stringify(sourcePath),
          ).toEqual(vector.expected);
        }
        break;
      case "invalid_reference_cases":
        for (const referencePath of vector.cases) {
          expect(
            resolveAssetReference(vector.source_path, referencePath),
            JSON.stringify(referencePath),
          ).toEqual(vector.expected);
        }
        break;
      case "validate_space": {
        const root = await mkdtemp(join(tmpdir(), "is-assets-conformance-"));
        temporarySpaces.push(root);
        for (const [path, content] of Object.entries(vector.tree)) {
          const destination = join(root, path);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, content, "utf-8");
        }
        const report = await validateSpace(root);
        expect(report.ok).toBe(vector.expected.ok);
        expect(report.notesChecked).toBe(vector.expected.notes_checked);
        expect(
          report.issues.some((issue) => issue.path.split("/").includes("_assets")),
        ).toBe(false);
        const unknownWarnings = report.issues
          .filter((issue) => issue.level === "warn")
          .filter((issue) => {
            const owner = issue.path.split("/").find((segment) => segment.startsWith("_"));
            return owner !== undefined && owner !== "_agent" && owner !== "_assets";
          })
          .map((issue) => issue.path)
          .sort();
        expect(unknownWarnings).toEqual(
          [...vector.expected.unknown_infrastructure_warnings].sort(),
        );
        break;
      }
    }
  });
});
