/**
 * Manifest and resx sanity check.
 *
 * Exists because `pcf-scripts build` reports XML problems as a line/column pair
 * with no explanation, and the failure mode that produced this script -
 * "Malformed comment" - is genuinely non-obvious: the XML spec forbids a double
 * hyphen anywhere inside a comment, so writing a CLI example with `--flag` in a
 * comment breaks the build.
 *
 * Catches the cases that actually bite, with messages that say what to do.
 */
const fs = require("fs");
const path = require("path");

const FILES = [
  "GroupedTotalsGrid/ControlManifest.Input.xml",
  "GroupedTotalsGrid/strings/GroupedTotalsGrid.1033.resx",
  "GroupedTotalsGrid.pcfproj"
];

let failures = 0;

function fail(file, line, message, hint) {
  console.error(`${file}:${line}  ${message}`);
  if (hint) console.error(`    ${hint}`);
  failures++;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function checkComments(file, text) {
  // Match comments non-greedily, then inspect their bodies.
  const re = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const body = match[1];
    const hyphenIndex = body.indexOf("--");
    if (hyphenIndex !== -1) {
      const context = body.slice(Math.max(0, hyphenIndex - 30), hyphenIndex + 30).replace(/\s+/g, " ");
      fail(
        file,
        lineOf(text, match.index + 4 + hyphenIndex),
        `XML comments cannot contain "--". Near: ...${context.trim()}...`,
        'Rewrite the text without double hyphens. CLI flags in comments are the usual culprit - describe the command in prose instead.'
      );
    }
    if (body.endsWith("-")) {
      fail(file, lineOf(text, match.index), 'XML comments cannot end with "-" immediately before "-->".');
    }
  }
}

function checkAmpersands(file, text) {
  const re = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    fail(
      file,
      lineOf(text, match.index),
      'Unescaped "&".',
      'Use &amp; instead.'
    );
  }
}

function checkUnclosedComment(file, text) {
  const opens = (text.match(/<!--/g) || []).length;
  const closes = (text.match(/-->/g) || []).length;
  if (opens !== closes) {
    fail(file, 1, `Unbalanced comment markers: ${opens} "<!--" vs ${closes} "-->".`);
  }
}

/**
 * The pcfproj must be SDK-style or `dotnet build` skips it, producing obj cache
 * files and no solution zip - a failure with no useful error message.
 */
function checkPcfProjIsSdkStyle(file, rawText) {
  if (!file.endsWith(".pcfproj")) return;
  // Strip comments first - the file documents this very rule, and matching the
  // prose would fail the build for explaining itself.
  const text = rawText.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<Project\s+[^>]*Sdk\s*=/.test(text)) {
    fail(
      file,
      1,
      "Not SDK-style: the <Project> element has no Sdk attribute.",
      'Use <Project Sdk="Microsoft.NET.Sdk">. `dotnet build` cannot build legacy projects and will emit no zip.'
    );
  }
  if (/Microsoft\.CSharp\.targets/.test(text)) {
    fail(file, 1, "Legacy Microsoft.CSharp.targets import present.", "Remove it; the SDK supplies the targets.");
  }
}

for (const relative of FILES) {
  const file = path.resolve(relative);
  if (!fs.existsSync(file)) {
    fail(relative, 1, "File not found.");
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  checkUnclosedComment(relative, text);
  checkComments(relative, text);
  checkAmpersands(relative, text);
  checkPcfProjIsSdkStyle(relative, text);
}

if (failures > 0) {
  console.error(`\nFAILED: ${failures} XML problem(s). Fix these before building.`);
  process.exit(1);
}
console.log("OK: manifest, resx and pcfproj are well formed");
