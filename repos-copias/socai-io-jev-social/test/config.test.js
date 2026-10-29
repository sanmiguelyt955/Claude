import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getConfigPath, readConfig, writeConfig } from "../src/config.js";

test("config is round-tripped with owner-only permissions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jev-social-config-"));
  const env = { JEV_SOCIAL_HOME: directory };
  try {
    await writeConfig({ openrouterApiKey: "secret" }, env);
    assert.deepEqual(await readConfig(env), { openrouterApiKey: "secret" });
    if (process.platform !== "win32") {
      const mode = (await stat(getConfigPath(env))).mode & 0o777;
      assert.equal(mode, 0o600);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
