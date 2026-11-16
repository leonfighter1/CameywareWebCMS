import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/** Every .tsx under src/app and src/components without "use client": what renders on the server. */
function serverComponents(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return serverComponents(path);
    return path.endsWith(".tsx") && !readFileSync(path, "utf8").startsWith('"use client"') ? [path] : [];
  });
}

// Mistakes 4 and 6: in a server component, Mantine's dotted parts are undefined, and a component handed to a client
// one as a prop (component={Link}) can't cross to the browser. Both only fail when the page is opened.
it("server components use Mantine's named parts and pass no component as a prop", () => {
  const bad: string[] = [];
  for (const file of [...serverComponents("src/app"), ...serverComponents("src/components")]) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/<([A-Z]\w*)\.([A-Z]\w*)/g)) bad.push(`${file}: <${m[1]}.${m[2]}>`);
    for (const m of text.matchAll(/component=\{([A-Z]\w*)\}/g)) bad.push(`${file}: component={${m[1]}}`);
  }
  expect(bad).toEqual([]);
});
