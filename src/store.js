const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const USE_DATABASE = Boolean(process.env.DATABASE_URL);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PG_STORE_CLI_PATH = path.join(__dirname, "..", "scripts", "pg-store-cli.js");

function defaultStore() {
  return {
    counters: {
      user: 1,
      nurse: 1,
      patient: 1,
      agent: 1
    },
    users: [],
    nurses: [],
    patients: [],
    agents: []
  };
}

function mergeWithDefaults(store) {
  return {
    ...defaultStore(),
    ...(store || {}),
    counters: {
      ...defaultStore().counters,
      ...(((store || {}).counters) || {})
    }
  };
}

function runPgStoreCli(command, payload) {
  if (!fs.existsSync(PG_STORE_CLI_PATH)) {
    throw new Error(`Postgres store helper not found at ${PG_STORE_CLI_PATH}`);
  }

  const result = spawnSync(process.execPath, [PG_STORE_CLI_PATH, command], {
    cwd: process.cwd(),
    env: process.env,
    input: payload === undefined ? undefined : JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const errorText = String(result.stderr || result.stdout || "").trim();
    throw new Error(`Postgres store command failed (${command}): ${errorText}`);
  }

  const output = String(result.stdout || "").trim();
  if (!output) {
    return null;
  }
  return JSON.parse(output);
}

function assertStorageMode() {
  if (IS_PRODUCTION && !USE_DATABASE) {
    throw new Error("DATABASE_URL is required in production. File store mode is disabled.");
  }
}

function ensureStore() {
  assertStorageMode();
  if (USE_DATABASE) {
    return;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(defaultStore(), null, 2), "utf8");
  }
}

function readStore() {
  assertStorageMode();
  if (USE_DATABASE) {
    const parsed = runPgStoreCli("read");
    return mergeWithDefaults(parsed);
  }

  ensureStore();
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  return mergeWithDefaults(JSON.parse(raw));
}

function writeStore(store) {
  assertStorageMode();
  if (USE_DATABASE) {
    runPgStoreCli("write", store);
    return;
  }

  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function nextId(store, key) {
  const current = store.counters[key] || 1;
  store.counters[key] = current + 1;
  return current;
}

function updateStore(mutator) {
  const store = readStore();
  mutator(store);
  writeStore(store);
}

function verifyStorageConnection() {
  assertStorageMode();
  if (!USE_DATABASE) {
    ensureStore();
    return { mode: "file" };
  }
  runPgStoreCli("read");
  return { mode: "postgres" };
}

module.exports = {
  readStore,
  writeStore,
  nextId,
  updateStore,
  verifyStorageConnection,
  USE_DATABASE,
  IS_PRODUCTION
};
