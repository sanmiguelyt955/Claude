import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { firstExecutable, localSocaiBuildCandidates } from "./env.js";

export function getHomeDir(env = process.env) {
  return path.resolve(env.JEV_SOCIAL_HOME || path.join(os.homedir(), ".jev-social"));
}

export function getConfigPath(env = process.env) {
  return path.join(getHomeDir(env), "config.json");
}

export async function readConfig(env = process.env) {
  try {
    const raw = await readFile(getConfigPath(env), "utf8");
    const config = JSON.parse(raw);
    return config && typeof config === "object" ? config : {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeConfig(next, env = process.env) {
  const homeDir = getHomeDir(env);
  const configPath = getConfigPath(env);
  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  await mkdir(homeDir, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, configPath);
  return configPath;
}

export function resolveApiKey(config, env = process.env) {
  return (
    env.OPENROUTER_API_KEY?.trim() ||
    env.openrouter?.trim() ||
    config.openrouterApiKey?.trim() ||
    config.typesafeApiKey?.trim() ||
    ""
  );
}

export function configuredSocaiBin(config, env = process.env) {
  return env.SOCAI_BIN?.trim() || config.socaiBin?.trim() || "";
}

export async function defaultInstalledSocaiBin() {
  const filename = process.platform === "win32" ? "socai.exe" : "socai";
  const candidate = path.join(os.homedir(), ".socai", "bin", filename);
  try {
    await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return candidate;
  } catch {
    return (await firstExecutable(localSocaiBuildCandidates())) || "socai";
  }
}
