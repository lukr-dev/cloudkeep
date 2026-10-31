import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const versionPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
type Bump = "minor" | "patch" | "major";

export function releaseBump(input?: string, message = ""): Bump {
  const markers = [...message.matchAll(/\[release:([^\]]+)\]/g)].map((match) => match[1]);
  const requested = input || markers[0] || "minor";
  if (!input && new Set(markers).size > 1) throw new Error("Conflicting release markers");
  if (requested === "bugfix") return "patch";
  if (requested !== "minor" && requested !== "patch" && requested !== "major") {
    throw new Error(`Unsupported release type: ${requested}`);
  }
  return requested;
}

export function nextVersion(tags: string[], baseline: string, bump: Bump): string {
  const versions = [`v${baseline}`, ...tags]
    .filter((tag) => versionPattern.test(tag))
    .map((tag) => tag.slice(1).split(".").map(Number))
    .sort((a, b) => b[0]! - a[0]! || b[1]! - a[1]! || b[2]! - a[2]!);
  const latest = versions[0];
  if (!latest) throw new Error("No valid base version");
  const [major, minor, patch] = latest as [number, number, number];
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor + 1}.0`;
}

if (import.meta.main) {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8"));
  const bump = releaseBump(event.inputs?.release_type, event.head_commit?.message);
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const existing = git("tag", "--points-at", "HEAD")
    .split("\n")
    .filter((tag) => versionPattern.test(tag));
  if (existing.length > 1) throw new Error("Multiple release tags point at HEAD");
  const version =
    existing[0]?.slice(1) || nextVersion(git("tag", "--list").split("\n"), manifest.version, bump);
  manifest.version = version;
  writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
  appendFileSync(
    process.env.GITHUB_OUTPUT!,
    `version=${version}\ntag_exists=${existing.length > 0}\n`,
  );
  console.log(`Release v${version}${existing.length ? " (retry)" : ` (${bump})`}`);
}
