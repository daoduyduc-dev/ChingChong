import { choose } from "../shared/ai";
import { initial, play, legal } from "../shared/chess";
import { cpus, totalmem, platform } from "node:os";
import { writeFileSync } from "node:fs";
const report = {
  date: new Date().toISOString(),
  environment: {
    platform: platform(),
    cpu: cpus()[0]?.model,
    memoryGB: Math.round(totalmem() / 1024 ** 3),
  },
  samples: [] as unknown[],
};
for (const level of ["easy", "medium", "hard"] as const) {
  let position = initial();
  for (let i = 0; i < 3; i++) {
    const result = choose(position, level);
    report.samples.push({
      level,
      ply: i,
      ...result,
      legal: !!result.move && legal(position, result.move),
    });
    if (result.move) position = play(position, result.move);
  }
}
writeFileSync(
  "docs/implementation/ai-benchmark.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
