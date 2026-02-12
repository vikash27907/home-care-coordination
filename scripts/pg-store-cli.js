const { Client } = require("pg");

const STORE_KEY = "main";

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

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_store (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function writeStore(client, store) {
  await client.query(
    `
      INSERT INTO app_store (key, data, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [STORE_KEY, JSON.stringify(store)]
  );
}

async function readStore(client) {
  const result = await client.query("SELECT data FROM app_store WHERE key = $1", [STORE_KEY]);
  if (result.rowCount && result.rows[0] && result.rows[0].data) {
    return result.rows[0].data;
  }

  const store = defaultStore();
  await writeStore(client, store);
  return store;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

async function run() {
  const command = String(process.argv[2] || "").trim().toLowerCase();
  if (!command || !["read", "write"].includes(command)) {
    throw new Error("Invalid command. Use: read | write");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Postgres store mode.");
  }

  const sslMode = String(process.env.PGSSLMODE || "").trim().toLowerCase();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslMode === "disable" ? false : { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await ensureSchema(client);

    if (command === "read") {
      const store = await readStore(client);
      process.stdout.write(JSON.stringify(store));
      return;
    }

    const raw = await readStdin();
    if (!raw) {
      throw new Error("Write command expected JSON store payload on stdin.");
    }

    const store = JSON.parse(raw);
    await writeStore(client, store);
    process.stdout.write(JSON.stringify({ ok: true }));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  const message = error && error.message ? error.message : "Unknown Postgres store error";
  // eslint-disable-next-line no-console
  console.error(message);
  process.exit(1);
});
