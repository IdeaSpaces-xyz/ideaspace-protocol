import { describe, expect, it } from "vitest";
import { buildMap, parseMap, type MapRoot } from "./maps.js";
import {
  projectContentTreeMembers,
  projectRootMapMembers,
  renderContentTreeProjection,
  renderRootMapMembers,
} from "./map-projection.js";
import type { ContentAwarenessTree } from "./awareness.js";

const pinnedRoot: MapRoot = {
  repo: "https://ideaspaces.example/repos/n_0123456789abcdef01234567",
  sha: "1".repeat(40),
};

function fixtureTree(): ContentAwarenessTree {
  return {
    placement: "head",
    totalMarkdownFiles: 7,
    omittedEntries: 2,
    entries: [
      {
        name: "alpha",
        kind: "directory",
        placement: "head",
        markdownFiles: 5,
        summary: "Alpha summary.",
        omittedChildren: 2,
        children: [
          {
            name: "deep",
            kind: "directory",
            placement: "head",
            markdownFiles: 2,
            children: [
              {
                name: "finding.md",
                kind: "markdown",
                placement: "head",
              },
            ],
          },
          {
            name: "notes.md",
            kind: "markdown",
            placement: "head",
          },
        ],
      },
      {
        name: "overview.md",
        kind: "markdown",
        placement: "head",
        summary: "Overview summary.",
      },
    ],
  };
}

describe("Content tree Map projection", () => {
  it("projects producer order with summary ceilings only where summaries were observed", () => {
    const projected = projectContentTreeMembers(fixtureTree());
    expect(projected.members.map(({ member }) => member)).toEqual([
      {
        root: 0,
        position: "alpha",
        depth: "summary",
        disclosure: { name: "alpha", summary: "Alpha summary." },
      },
      {
        root: 0,
        position: "alpha/deep",
        depth: "name",
        disclosure: { name: "deep" },
      },
      {
        root: 0,
        position: "alpha/deep/finding.md",
        depth: "name",
        disclosure: { name: "finding.md" },
      },
      {
        root: 0,
        position: "alpha/notes.md",
        depth: "name",
        disclosure: { name: "notes.md" },
      },
      {
        root: 0,
        position: "overview.md",
        depth: "summary",
        disclosure: { name: "overview.md", summary: "Overview summary." },
      },
    ]);
    expect(JSON.stringify(projected.members.map(({ member }) => member))).not.toContain(
      "placement",
    );
    expect(projected.members[0]?.presentation).toEqual({
      kind: "directory",
      level: 1,
      markdownFiles: 5,
      omittedChildren: 2,
    });
  });

  it("builds a strict portable Map when the producer supplies one valid pinned root", () => {
    const projection = projectContentTreeMembers(fixtureTree());
    const built = buildMap({
      roots: [pinnedRoot],
      members: projection.members.map(({ member }) => member),
    });
    expect(built.status).toBe("valid");
    if (built.status === "valid") expect(parseMap(built.map)).toEqual(built);
  });

  it("renders the frozen tree order with nested and top-level omission counts", () => {
    expect(renderContentTreeProjection(projectContentTreeMembers(fixtureTree()))).toBe(
      [
        "Tree (7 files):",
        "  alpha/ (5) — Alpha summary.",
        "    deep/ (2)",
        "      finding.md",
        "    notes.md",
        "    … and 2 more",
        "  overview.md — Overview summary.",
        "  … and 2 more",
      ].join("\n"),
    );
  });

  it("retains explicit full-diagnostic summaries without changing member depth semantics", () => {
    const tree: ContentAwarenessTree = {
      placement: "head",
      totalMarkdownFiles: 1,
      entries: [{
        name: "branch",
        kind: "directory",
        placement: "head",
        markdownFiles: 1,
        children: [{
          name: "finding.md",
          kind: "markdown",
          placement: "head",
          summary: "Deep local diagnostic.",
        }],
      }],
    };
    expect(projectContentTreeMembers(tree).members[1]?.member).toEqual({
      root: 0,
      position: "branch/finding.md",
      depth: "summary",
      disclosure: { name: "finding.md", summary: "Deep local diagnostic." },
    });
  });
});

describe("Root-handle Map projection", () => {
  it("keeps private display and harness state beside members, never inside them", () => {
    const projected = projectRootMapMembers([
      {
        root: 0,
        name: "home",
        summary: "Home summary.",
        presentation: {
          label: "home",
          display: "/private/checkouts/home",
          details: ["3 dirs"],
        },
      },
      {
        root: 1,
        name: "mounted",
        presentation: {
          label: "mount",
          display: "/private/checkouts/mounted",
          details: ["dirty", "mounted"],
        },
      },
      {
        address: "https://ideaspaces.example/repos/n_aaaaaaaaaaaaaaaaaaaaaaaa",
        name: "online",
        presentation: { details: ["alice"] },
      },
      {
        name: "legacy-online",
        presentation: { details: ["legacy"] },
      },
    ]);

    expect(projected.map(({ member }) => member)).toEqual([
      {
        root: 0,
        position: ".",
        depth: "summary",
        disclosure: { name: "home", summary: "Home summary." },
      },
      {
        root: 1,
        position: ".",
        depth: "name",
        disclosure: { name: "mounted" },
      },
      {
        address: "https://ideaspaces.example/repos/n_aaaaaaaaaaaaaaaaaaaaaaaa",
        depth: "name",
        disclosure: { name: "online" },
      },
      null,
    ]);
    expect(JSON.stringify(projected.map(({ member }) => member))).not.toContain(
      "/private/checkouts",
    );
    expect(renderRootMapMembers(projected.slice(0, 2), { heading: "Working set:" })).toBe(
      [
        "Working set:",
        "  home: /private/checkouts/home — Home summary. (3 dirs)",
        "  mount: /private/checkouts/mounted (dirty · mounted)",
      ].join("\n"),
    );
    expect(renderRootMapMembers(projected.slice(2), {
      heading: "Pullable (remote — not yet local):",
      omittedMembers: 2,
    })).toBe(
      [
        "Pullable (remote — not yet local):",
        "  online (alice)",
        "  legacy-online (legacy)",
        "  …and 2 more",
      ].join("\n"),
    );
  });

  it("returns no dangling section for no entries", () => {
    expect(renderRootMapMembers([], { heading: "Working set:" })).toBeNull();
  });
});
