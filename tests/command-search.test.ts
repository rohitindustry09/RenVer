import { describe, expect, it } from "vitest";
import { filterCommands, type Command } from "@/lib/command-search";

const commands: Command[] = [
  { id: "page-projects", label: "Projects", hint: "Overview", href: "/", group: "Pages" },
  { id: "page-deployments", label: "Deployments", hint: "All builds", href: "/deployments", group: "Pages" },
  { id: "page-domains", label: "Domains", hint: "Add and verify domains", href: "/domains", group: "Pages" },
  { id: "p-1", label: "Products Scrapper", hint: "products-scrapper.localhost", href: "/projects/1", group: "Projects" },
  { id: "p-2", label: "Shop", hint: "shop.example.com", href: "/projects/2", group: "Projects" },
];

describe("filterCommands", () => {
  it("returns everything for an empty query", () => {
    expect(filterCommands(commands, "")).toHaveLength(commands.length);
    expect(filterCommands(commands, "   ")).toHaveLength(commands.length);
  });

  it("matches the label, ignoring case", () => {
    expect(filterCommands(commands, "DEPLOY").map((c) => c.id)).toEqual(["page-deployments"]);
  });

  it("matches the hint too, such as a project's address", () => {
    expect(filterCommands(commands, "example.com").map((c) => c.id)).toEqual(["p-2"]);
  });

  it("puts labels that start with the query before labels that merely contain it", () => {
    const list: Command[] = [
      { id: "a", label: "My shop", hint: "", href: "/a", group: "Projects" },
      { id: "b", label: "Shop", hint: "", href: "/b", group: "Projects" },
    ];
    expect(filterCommands(list, "shop").map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("needs every word of the query to match", () => {
    expect(filterCommands(commands, "products local").map((c) => c.id)).toEqual(["p-1"]);
    expect(filterCommands(commands, "products zzz")).toEqual([]);
  });

  it("returns nothing when nothing matches, and never changes the input", () => {
    const copy = [...commands];
    expect(filterCommands(commands, "qwertyuiop")).toEqual([]);
    expect(commands).toEqual(copy);
  });

  it("keeps the original order for equally good matches", () => {
    const list: Command[] = [
      { id: "first", label: "Alpha site", hint: "", href: "/1", group: "Projects" },
      { id: "second", label: "Alpha shop", hint: "", href: "/2", group: "Projects" },
      { id: "third", label: "Alpha blog", hint: "", href: "/3", group: "Projects" },
    ];
    expect(filterCommands(list, "alpha").map((c) => c.id)).toEqual(["first", "second", "third"]);
  });
});
