import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const manifestPath = "docs/implementation/release-manifest.json";
function run(command, args) {
  const r = spawnSync(command, args, { encoding: "utf8" });
  if (r.status !== 0)
    throw Error("Release packaging command failed: " + command);
  return r.stdout.trim();
}
const files = run("git", [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .split("\0")
  .filter((path) => path && path !== manifestPath && existsSync(path));
if (
  files.some((path) =>
    /(^|\/)\.env$|(^|\/)(\.local|node_modules|test-results|\.git)\//.test(path),
  )
)
  throw Error("Private/generated path in release list");
files.sort();
const hashes = files.map((path) => ({
  path,
  sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
}));
mkdirSync(".local/releases", { recursive: true });
writeFileSync(".local/release-files.txt", files.join("\n") + "\n");
const sourceArchive = ".local/releases/kyvien-source-20261030.tar.gz";
const frontendArchive = ".local/releases/kyvien-client-20261030.tar.gz";
run("tar", ["-czf", sourceArchive, "-T", ".local/release-files.txt"]);
run("tar", ["-czf", frontendArchive, "-C", "client", "dist"]);
const archives = [sourceArchive, frontendArchive].map((path) => ({
  path,
  sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
}));
const images = ["backend", "frontend", "postgres"].map((service) => ({
  service,
  imageId: run("docker", [
    "inspect",
    `kyvien-release-${service}-1`,
    "--format",
    "{{.Image}}",
  ]),
  healthy: run("docker", [
    "inspect",
    `kyvien-release-${service}-1`,
    "--format",
    "{{.State.Health.Status}}",
  ]),
}));
writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      baseCommit: run("git", ["rev-parse", "HEAD"]),
      source:
        "Working tree including local hardening changes; not pushed; SHA256 identifies exact archived bytes",
      localUrl: "http://127.0.0.1:5180",
      archives,
      images,
      files: hashes,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    packagedFiles: files.length,
    archives: archives.map((a) => a.path),
    imagesHealthy: images.every((i) => i.healthy === "healthy"),
    secretsExcluded: true,
  }),
);
