/**
 * Version consistency guard.
 *
 * Three files must agree, and each disagreement fails in its own confusing way:
 *
 *   package.json          - what npm reports
 *   ControlManifest       - what the PLATFORM uses to decide whether to serve a
 *                           new bundle. Forget this one and a deploy is a
 *                           silent no-op: the build succeeds, the import
 *                           succeeds, and users keep running the old code.
 *   CHANGELOG.md          - what a human reads to find out what changed
 *   Solution.xml          - the solution version Dataverse records on import.
 *                           Left behind, an import looks like a downgrade or
 *                           a no-op in the solution history.
 *
 * The manifest case is not hypothetical: a stale bundle served for several
 * releases while fixes were reported as deployed.
 */
const fs = require("fs");

const problems = [];

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")).version;

const manifestXml = fs.readFileSync("GroupedTotalsGrid/ControlManifest.Input.xml", "utf8");
const manifestMatch = manifestXml.match(/<control\b[\s\S]*?\bversion="([^"]+)"/);
const manifest = manifestMatch && manifestMatch[1];

const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const changelogMatch = changelog.match(/^## \[([0-9]+\.[0-9]+\.[0-9]+)\]/m);
const latest = changelogMatch && changelogMatch[1];

const solutionXml = fs.readFileSync("GroupedTotalsGridSolution/src/Other/Solution.xml", "utf8");
const solutionMatch = solutionXml.match(/<Version>([^<]+)<\/Version>/);
const solution = solutionMatch && solutionMatch[1];

if (!solution) problems.push("Could not read the version from GroupedTotalsGridSolution/src/Other/Solution.xml");
if (!manifest) problems.push("Could not read the version from ControlManifest.Input.xml");
if (!latest) problems.push("Could not read the latest version heading from CHANGELOG.md");

if (manifest && manifest !== pkg) {
  problems.push(
    `Manifest version ${manifest} does not match package.json ${pkg}.\n` +
      "    The platform caches control bundles by manifest version - if this is\n" +
      "    not incremented, your deployment will silently serve the old code."
  );
}
if (solution && solution !== pkg) {
  problems.push(`Solution.xml version ${solution} does not match package.json ${pkg}.`);
}
if (latest && latest !== pkg) {
  problems.push(`CHANGELOG latest entry ${latest} does not match package.json ${pkg}.`);
}

if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\nFAILED: ${problems.length} version problem(s).`);
  process.exit(1);
}
console.log(`OK: version ${pkg} consistent across package.json, manifest, solution and changelog`);
