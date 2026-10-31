import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { nextVersion, releaseBump } from "./release-version.ts";

describe("release versions", () => {
  it("defaults to minor and supports explicit patch, bugfix and major releases", () => {
    expect(releaseBump()).toBe("minor");
    expect(releaseBump(undefined, "Fix login [release:bugfix]")).toBe("patch");
    expect(releaseBump(undefined, "Fix login [release:patch]")).toBe("patch");
    expect(releaseBump(undefined, "Breaking change\n\n[release:major]")).toBe("major");
    expect(releaseBump("patch", "[release:major]")).toBe("patch");
    expect(() => releaseBump("invalid")).toThrow("Unsupported release type");
    expect(() => releaseBump(undefined, "[release:invalid]")).toThrow("Unsupported release type");
    expect(() => releaseBump(undefined, "[release:patch] [release:major]")).toThrow("Conflicting");
  });

  it("increments the highest web version numerically and resets lower parts", () => {
    const tags = ["v0.9.9", "v0.10.3", "extension-v9.0.0", "mobile-v9.0.0", "v1.0.0-beta.1"];
    expect(nextVersion(tags, "0.0.0", "minor")).toBe("0.11.0");
    expect(nextVersion(tags, "0.0.0", "patch")).toBe("0.10.4");
    expect(nextVersion(tags, "0.0.0", "major")).toBe("1.0.0");
    expect(nextVersion([], "0.0.0", "minor")).toBe("0.1.0");
    expect(nextVersion(["v0.1.0"], "1.0.0", "minor")).toBe("1.1.0");
  });
});

it("stamps the build and reuses the deployed tag on retries", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cloudkeep-release-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
  const eventPath = join(cwd, "event.json");
  const outputPath = join(cwd, "output.txt");
  const manifestPath = join(cwd, "package.json");
  try {
    git("init");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-m",
      "Initial",
    );
    git("tag", "v0.10.3");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-m",
      "Fix",
    );
    writeFileSync(manifestPath, JSON.stringify({ version: "0.0.0", private: true }));
    writeFileSync(eventPath, JSON.stringify({ head_commit: { message: "Fix [release:bugfix]" } }));
    const run = () => {
      writeFileSync(outputPath, "");
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL("./release-version.ts", import.meta.url))],
        {
          cwd,
          env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
        },
      );
      return readFileSync(outputPath, "utf8");
    };
    expect(run()).toBe("version=0.10.4\ntag_exists=false\n");
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({
      version: "0.10.4",
      private: true,
    });
    git("tag", "v0.10.4");
    writeFileSync(manifestPath, JSON.stringify({ version: "0.0.0", private: true }));
    writeFileSync(eventPath, JSON.stringify({ inputs: { release_type: "major" } }));
    expect(run()).toBe("version=0.10.4\ntag_exists=true\n");
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toMatchObject({ version: "0.10.4" });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
