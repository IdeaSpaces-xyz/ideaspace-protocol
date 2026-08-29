import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateSpace } from "./conformance.js";
import {
  classifyRepositoryPath,
  type RepositoryPathClassification,
} from "./repository-path.js";

interface ClassifyCasesVector {
  id: string;
  operation: "classify_cases";
  covers: string[];
  cases: Array<{
    input: { path: unknown; kind: unknown };
    expected: RepositoryPathClassification;
  }>;
}

interface ValidateSpaceVector {
  id: string;
  operation: "validate_space";
  covers: string[];
  tree: Record<string, string>;
  expected: {
    ok: boolean;
    notes_checked: number;
    infrastructure_warnings: string[];
  };
}

type ExtensionVector = ClassifyCasesVector | ValidateSpaceVector;

const manifest = JSON.parse(
  readFileSync(new URL("../conformance/extensions/manifest.json", import.meta.url), "utf-8"),
) as {
  format: string;
  required_coverage: string[];
  vectors: ExtensionVector[];
};

const temporarySpaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporarySpaces.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("repository path classification", () => {
  it("has complete language-neutral extension-boundary coverage", () => {
    expect(manifest.format).toBe("ideaspaces-extensions/v1");
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    for (const requirement of manifest.required_coverage) {
      expect(covered.has(requirement), requirement).toBe(true);
    }
  });

  it.each(manifest.vectors)("executes $id", async (vector) => {
    switch (vector.operation) {
      case "classify_cases":
        for (const testCase of vector.cases) {
          expect(
            classifyRepositoryPath(testCase.input.path, testCase.input.kind),
            JSON.stringify(testCase.input),
          ).toEqual(testCase.expected);
        }
        break;
      case "validate_space": {
        const root = await mkdtemp(join(tmpdir(), "is-extensions-conformance-"));
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
          report.issues
            .filter((issue) => {
              const classification = classifyRepositoryPath(issue.path, "file");
              return classification.status === "ok" && classification.role === "extension";
            })
            .map((issue) => issue.path)
            .sort(),
        ).toEqual([...vector.expected.infrastructure_warnings].sort());
        break;
      }
    }
  });
});
