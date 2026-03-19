async function getNextCounterValue(db, keyName) {
  const result = await db.query(
    `INSERT INTO counters (key_name, current_value)
     VALUES ($1, 1)
     ON CONFLICT (key_name)
     DO UPDATE SET current_value = counters.current_value + 1
     RETURNING current_value`,
    [keyName]
  );

  return Number.parseInt(result.rows[0].current_value, 10);
}

async function generateNurseId(db) {
  const count = await getNextCounterValue(db, "nurse_public_id");
  const padded = String(count).padStart(3, "0");
  return `PHCN-${padded}`;
}

async function generateAgentId(db) {
  const count = await getNextCounterValue(db, "agent_public_id");
  const padded = String(count).padStart(3, "0");
  return `PHCA-${padded}`;
}

module.exports = {
  generateNurseId,
  generateAgentId
};
