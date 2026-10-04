// Usage: npx tsx scripts/validate-parser.ts path/to/filenames.txt
//
// Runs the bulk upload parser over a list of real operator filenames,
// one path per line (blank lines and "#" comments are ignored).
// Exits 1 when fewer than half the lines yield an angle, so it can
// gate CI once real samples are checked in.

import { readFileSync } from "node:fs";

import {
  REQUIRED_ANGLES,
  classifyPaths,
  type Angle,
} from "../src/lib/bulk-parser.ts";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error(
    "Usage: npx tsx scripts/validate-parser.ts path/to/filenames.txt",
  );
  process.exit(2);
}

const lines = readFileSync(inputPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

const angleCounts = new Map<Angle, number>(
  REQUIRED_ANGLES.map((angle) => [angle, 0]),
);
let classified = 0;
let unassigned = 0;
let withAngle = 0;

// Classified together: folder decisions depend on sibling files.
for (const { relativePath: path, angle, pairKey: pair } of classifyPaths(
  lines,
)) {
  if (angle) {
    withAngle += 1;
    angleCounts.set(angle, (angleCounts.get(angle) ?? 0) + 1);
  }
  if (pair === null) unassigned += 1;
  if (angle && pair) classified += 1;

  const status = angle && pair ? "[OK]" : "[--]";
  console.log(
    `${status} ${path} → angle=${angle ?? "-"} pair=${pair ?? "-"}`,
  );
}

const total = lines.length;
const percent = (n: number) =>
  total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;

console.log("");
console.log(`Total:       ${total}`);
console.log(`Classified:  ${classified} (${percent(classified)}) — angle and pair`);
console.log(`Unassigned:  ${unassigned} (${percent(unassigned)}) — no pair key`);
console.log(`With angle:  ${withAngle} (${percent(withAngle)})`);
console.log("Angles:");
for (const [angle, count] of angleCounts) {
  console.log(`  ${angle.padEnd(9)} ${count}`);
}

process.exit(total > 0 && withAngle / total >= 0.5 ? 0 : 1);
