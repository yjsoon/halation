import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Exercise the gate as a CLI in real Git repositories. Substitute only the
// expensive checks: their own suites cannot detect a gate silently skipping
// them on a clean checkout, swallowing failures, or accepting a mistyped flag.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "howmuch-check-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "scripts/check.sh"), readFileSync(new URL("./check.sh", import.meta.url)));
  const checker = '#!/bin/bash\nif [[ "$*" == "$FAIL_COMMAND" ]]; then exit 23; fi\n';
  for (const name of ["bun", "bunx"]) writeFileSync(join(root, "bin", name), checker, { mode: 0o755 });
  writeFileSync(join(root, "scripts/ios-xcodebuild.sh"), checker, { mode: 0o755 });
  writeFileSync(join(root, "bin/uname"), '#!/bin/bash\necho "${CHECK_TEST_OS:-Darwin}"\n', { mode: 0o755 });
  const env = { PATH: `${root}/bin:${process.env.PATH}`, HOME: root,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", HOWMUCH_CHECK_BASE: "HEAD" };
  for (const args of [["init", "-q"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]]) {
    const result = Bun.spawnSync(["git", ...args], { cwd: root, env });
    if (result.exitCode) throw new Error(result.stderr.toString());
  }
  return {
    root,
    run(args: string[] = [], extra: Record<string, string> = {}) {
      const result = Bun.spawnSync(["bash", "scripts/check.sh", ...args], { cwd: root, env: { ...env, ...extra } });
      return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
    },
  };
}

test("full checks cannot report success when any check fails, even on a clean checkout without a base", () => {
  const { run } = fixture();
  for (const command of [
    "test", "run --cwd apps/web typecheck", "run --cwd apps/worker typecheck",
    "scripts/verify-ios-focus-zoom.ts", "scripts/verify-ios-confirm-presentation.ts",
    "scripts/verify-ios-disclosure-chevron.ts", "bun@1.4.0 scripts/build-ios-engine.ts check",
    "test -- -only-testing:HowMuchTests",
  ]) {
    const result = run(["--full"], { HOWMUCH_CHECK_BASE: "missing-base", FAIL_COMMAND: command });
    expect(result.code).toBe(23);
    expect(result.output).not.toContain("check: pass");
  }
  expect(run(["--full"], { HOWMUCH_CHECK_BASE: "missing-base" }).code).toBe(0);
  const unsupported = run(["--full"], { CHECK_TEST_OS: "Linux", FAIL_COMMAND: "test" });
  expect(unsupported.code).toBe(1);
  expect(unsupported.output).toContain("iOS tests required");
});

test("a mistyped option fails rather than claiming an empty or docs-only round passed", () => {
  const { run, root } = fixture();
  expect(run().code).toBe(0);
  expect(run(["--ful"]).code).not.toBe(0);
  writeFileSync(join(root, "README.md"), "Documentation only\n");
  expect(run([], { FAIL_COMMAND: "test" }).code).toBe(0);
  expect(run(["--full"], { FAIL_COMMAND: "test" }).code).toBe(23);
  expect(run([], { HOWMUCH_CHECK_BASE: "missing-base" }).code).not.toBe(0);
  rmSync(join(root, ".git"), { recursive: true });
  expect(run(["--full"]).code).not.toBe(0);
});
