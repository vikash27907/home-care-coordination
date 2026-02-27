/**
 * Database Reset Script
 * Wipes all tables so the database can be recreated correctly
 */

const { pool } = require('../src/db');

async function resetDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Dropping all tables...');
    
    await client.query('DROP TABLE IF EXISTS care_applications CASCADE');
    await client.query('DROP TABLE IF EXISTS care_requests CASCADE');
    await client.query('DROP TABLE IF EXISTS concerns CASCADE');
    await client.query('DROP TABLE IF EXISTS patients CASCADE');
    await client.query('DROP TABLE IF EXISTS agents CASCADE');
    await client.query('DROP TABLE IF EXISTS nurses CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');
    await client.query('DROP TABLE IF EXISTS counters CASCADE');
    await client.query('DROP TABLE IF EXISTS session CASCADE');
    
    console.log('Database wiped successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase();
