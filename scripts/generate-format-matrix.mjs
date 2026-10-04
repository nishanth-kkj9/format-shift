// Regenerates docs/format-matrix.md from src/core/conversionRegistry.ts — the
// single source of truth for which conversions exist and where they run.
// Run via `npm run matrix:docs`. The output is deterministic: src/core/
// consistency.test.ts parses the summary table and fails if the doc ever
// disagrees with the registry, so hand-editing the doc's numbers is pointless.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONVERSION_REGISTRY, getAvailableTargetsForSource } from "../src/core/conversionRegistry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "docs", "format-matrix.md");
const CATEGORIES = ["image", "audio", "video", "data", "document"];

const pairsFor = (category) => {
  const spec = CONVERSION_REGISTRY[category];
  let advertised = 0;
  let browser = 0;
  let server = 0;
  let excluded = 0;
  const rows = [];
  for (const source of spec.sourceFormats) {
    const targets = getAvailableTargetsForSource(category, source);
    advertised += targets.length;
    for (const target of targets) {
      if (spec.targets[target].engine === "browser") browser += 1;
      else server += 1;
    }
    const excludedTargets = (spec.excludedTargetsBySource?.[source] ?? []).filter((t) => spec.targets[t]);
    excluded += excludedTargets.length;
    rows.push({
      source,
      targets: targets.map((t) => `${t} (${spec.targets[t].engine})`),
      excluded: excludedTargets,
    });
  }
  return { spec, rows, advertised, browser, server, excluded };
};

const lines = [];
lines.push("# Format Conversion Matrix");
lines.push("");
lines.push("> **Generated file — do not edit by hand.** This document is produced from");
lines.push("> `src/core/conversionRegistry.ts` (the single source of truth) by");
lines.push("> `npm run matrix:docs`. `src/core/consistency.test.ts` asserts the summary");
lines.push("> numbers against the registry, so any drift fails the test suite.");
lines.push("");
lines.push("## Summary");
lines.push("");
lines.push("| Category | Sources | Advertised pairs | Browser engine | Server engine | Excluded pairs |");
lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");

const totals = { advertised: 0, browser: 0, server: 0, excluded: 0 };
const statsByCategory = {};
for (const category of CATEGORIES) {
  const s = pairsFor(category);
  statsByCategory[category] = s;
  totals.advertised += s.advertised;
  totals.browser += s.browser;
  totals.server += s.server;
  totals.excluded += s.excluded;
  lines.push(
    `| ${category} | ${s.spec.sourceFormats.length} | ${s.advertised} | ${s.browser} | ${s.server} | ${s.excluded} |`
  );
}
lines.push(
  `| **Total** | — | **${totals.advertised}** | **${totals.browser}** | **${totals.server}** | **${totals.excluded}** |`
);
lines.push("");

for (const category of CATEGORIES) {
  const { spec, rows, excluded } = statsByCategory[category];
  lines.push(`## ${category}`);
  lines.push("");
  lines.push(`Sources: ${spec.sourceFormats.map((s) => `\`${s}\``).join(", ")}`);
  lines.push("");
  lines.push("| Source | Available targets |");
  lines.push("| --- | --- |");
  for (const row of rows) {
    lines.push(`| \`${row.source}\` | ${row.targets.join(", ")} |`);
  }
  lines.push("");
  if (excluded.length > 0) {
    lines.push("Excluded pairs (registry-encoded, the API answers 400 for these):");
    lines.push("");
    for (const row of rows) {
      for (const target of row.excluded) {
        lines.push(`- \`${row.source} -> ${target}\``);
      }
    }
    lines.push("");
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join("\n").replace(/\n$/, "\n"), "utf8");
console.log(`Wrote ${OUT}`);
console.log(
  `Categories: ${CATEGORIES.length}, advertised pairs: ${totals.advertised} (browser ${totals.browser}, server ${totals.server}), excluded: ${totals.excluded}`
);
