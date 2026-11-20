import {neon} from '@neondatabase/serverless';
import {SCHEMA} from '../lib/store.js';
if(!process.env.DATABASE_URL) throw new Error('Configura DATABASE_URL en .env.local o en el entorno.');
const sql=neon(process.env.DATABASE_URL);
await sql.query(SCHEMA);
await sql.query('CREATE INDEX IF NOT EXISTS upcylab_records_received_idx ON upcylab_records(received_at DESC)');
console.log('Tabla de registros preparada. No se modificaron registros existentes.');
