/**
 * CI guard for the visual-parity contract (build prompt SS9.1):
 * every colour must come from a Fluent design token, never a literal.
 *
 * Scans component/style/hook sources for hex colours, rgb()/rgba()/hsl()
 * literals and hardcoded font-family stacks. Exits non-zero on any hit so
 * `npm run verify` fails the build.
 */
const fs = require("fs");
const path = require("path");

const ROOTS = ["GroupedTotalsGrid/components", "GroupedTotalsGrid/styles", "GroupedTotalsGrid/hooks"];
const PATTERNS = [
  { name: "hex colour literal", re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "rgb()/rgba() literal", re: /\brgba?\s*\(/ },
  { name: "hsl()/hsla() literal", re: /\bhsla?\s*\(/ },
  { name: "hardcoded font stack", re: /fontFamily\s*:\s*["'](?!var\()/ }
];
// nativeGridMetrics.ts is the one sanctioned place for measured raw values.
const ALLOWLIST = [/nativeGridMetrics\.ts$/];

let failures = 0;
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
    if (ALLOWLIST.some((re) => re.test(full))) continue;
    const lines = fs.readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Per-line escape hatch. Deliberately not eslint syntax - this is a
      // standalone script, and borrowing eslint's directive format would
      // imply eslint is running when it is not.
      if (/style-guard-allow/.test(lines[i - 1] || "")) return;
      for (const p of PATTERNS) {
        if (p.re.test(line)) {
          console.error(`${full}:${i + 1}  ${p.name}: ${line.trim()}`);
          failures++;
        }
      }
    });
  }
}
ROOTS.forEach(walk);
if (failures > 0) {
  console.error(`\nFAILED: ${failures} raw style literal(s). Use Fluent tokens instead.`);
  process.exit(1);
}
console.log("OK: no raw colour or font literals outside nativeGridMetrics.ts");
