import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ContentAwarenessTree } from "./awareness.js";
import {
  projectContentTreeMembers,
  projectRootMapMembers,
  renderRootMapMembers,
  type ContentTreeMapProjection,
  type RootMapMemberInput,
} from "./map-projection.js";
import { buildMap, parseMap, type MapRoot } from "./maps.js";

interface TreeVector {
  id: string;
  operation: "project_tree";
  covers: string[];
  input: { root: number; tree: ContentAwarenessTree };
  portable_root: MapRoot;
  expected: ContentTreeMapProjection;
}

interface RootVector {
  id: string;
  operation: "project_roots";
  covers: string[];
  input: RootMapMemberInput[];
  render: { heading: string; omittedMembers?: number };
  expected_members: unknown[];
  expected_render: string;
}

type ProjectionVector = TreeVector | RootVector;

const kit = JSON.parse(
  readFileSync(
    new URL("../conformance/map-projection/manifest.json", import.meta.url),
    "utf-8",
  ),
) as {
  format: string;
  required_coverage: string[];
  vectors: ProjectionVector[];
};

describe("Map projection conformance manifest", () => {
  it("declares every required behavior through a language-neutral vector", () => {
    expect(kit.format).toBe("ideaspaces-map-projection/v1");
    const covered = new Set(kit.vectors.flatMap((vector) => vector.covers));
    for (const requirement of kit.required_coverage) {
      expect(covered.has(requirement), requirement).toBe(true);
    }
  });

  it.each(kit.vectors)("executes $id", (vector) => {
    if (vector.operation === "project_tree") {
      const projection = projectContentTreeMembers(
        vector.input.tree,
        vector.input.root,
      );
      expect(projection).toEqual(vector.expected);
      const built = buildMap({
        roots: [vector.portable_root],
        members: projection.members.map(({ member }) => member),
      });
      expect(built.status).toBe("valid");
      if (built.status === "valid") expect(parseMap(built.map)).toEqual(built);
      return;
    }

    const projection = projectRootMapMembers(vector.input);
    expect(projection.map(({ member }) => member)).toEqual(
      vector.expected_members,
    );
    expect(JSON.stringify(projection.map(({ member }) => member))).not.toContain(
      "/private/",
    );
    expect(renderRootMapMembers(projection, vector.render)).toBe(
      vector.expected_render,
    );
  });
});
