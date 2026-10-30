import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

describe("L4-08 authenticated shell responsive contract", () => {
  it("uses the compact navigation through tablet widths so the Admin header fits", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*991px\)\s*\{[\s\S]*?\.app-shell__header-inner\s*\{[\s\S]*?flex-wrap:\s*wrap/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*991px\)\s*\{[\s\S]*?\.app-shell__nav\s*\{[\s\S]*?display:\s*none/);
    expect(styles).toMatch(/@media\s*\(min-width:\s*992px\)\s*\{\s*\.app-shell__menu-toggle\s*\{\s*display:\s*none/);
  });
});
