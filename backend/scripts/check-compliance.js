import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function main() {
  const r = await pool.query(
    "SELECT type, version, is_active, LENGTH(content) as len FROM compliance_policies ORDER BY type, version"
  );
  console.log('=== compliance_policies ===');
  console.table(r.rows);
  const terms = await pool.query(
    "SELECT content FROM compliance_policies WHERE type='terms' AND is_active=true LIMIT 1"
  );
  if (terms.rows[0]) {
    const hasPlatform = terms.rows[0].content.includes('Platform Legal Status') || terms.rows[0].content.includes('สถานะทางกฎหมาย');
    console.log('\nTerms has Platform Legal Status:', hasPlatform);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
