import {neon} from '@neondatabase/serverless';
import {InputError,rowData} from './model.js';

export const SCHEMA=`CREATE TABLE IF NOT EXISTS upcylab_records (
  uid TEXT PRIMARY KEY CHECK(length(uid) BETWEEN 1 AND 64),
  type TEXT NOT NULL CHECK(type IN ('RESINA_LIQUIDA','SOLIDOS_EPIS')),
  grams INTEGER NOT NULL CHECK(grams BETWEEN 1 AND 1000),
  measured_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
const DAY="(COALESCE(measured_at,received_at) AT TIME ZONE 'America/Santiago')::date";
function condition(filters) {
  const clauses=[],params=[];
  const add=(expr,value)=>{params.push(value);clauses.push(expr.replace('?',`$${params.length}`));};
  if(filters.type) add('type = ?',filters.type);
  if(filters.from) add(`${DAY} >= ?::date`,filters.from);
  if(filters.to) add(`${DAY} <= ?::date`,filters.to);
  return {where:clauses.length?' WHERE '+clauses.join(' AND '):'',params};
}
export class PostgresStore {
  constructor(sql) { this.sql=sql; }
  async save(r) {
    // Una sola operación atómica: los reintentos conservan la primera recepción.
    const rows=await this.sql.query(`INSERT INTO upcylab_records(uid,type,grams,measured_at)
      VALUES ($1,$2,$3,$4::timestamptz)
      ON CONFLICT(uid) DO UPDATE SET uid=EXCLUDED.uid
      WHERE upcylab_records.type=EXCLUDED.type AND upcylab_records.grams=EXCLUDED.grams
        AND upcylab_records.measured_at IS NOT DISTINCT FROM EXCLUDED.measured_at
      RETURNING uid`,[r.uid,r.type,r.grams,r.measured_at]);
    if(!rows.length) throw new InputError('El ID ya existe con otros datos.',409);
    return rows[0].uid;
  }
  async latest() {
    const [row]=await this.sql.query('SELECT MAX(received_at) AS latest FROM upcylab_records');
    return row.latest instanceof Date?row.latest.toISOString():row.latest;
  }
  async all(filters) {
    const {where,params}=condition(filters);
    const rows=await this.sql.query('SELECT * FROM upcylab_records'+where+' ORDER BY COALESCE(measured_at,received_at) DESC,uid DESC',params);
    return rows.map(rowData);
  }
  async list(filters) {
    const {where,params}=condition(filters);
    const [rows,totals,daily]=await Promise.all([
      this.sql.query('SELECT * FROM upcylab_records'+where+' ORDER BY COALESCE(measured_at,received_at) DESC,uid DESC LIMIT 200',params),
      this.sql.query(`SELECT COUNT(*) AS count,COALESCE(SUM(grams),0) AS grams,
        COALESCE(SUM(grams) FILTER(WHERE type='RESINA_LIQUIDA'),0) AS resin,
        COALESCE(SUM(grams) FILTER(WHERE type='SOLIDOS_EPIS'),0) AS solids,
        MAX(COALESCE(measured_at,received_at)) AS latest,
        (SELECT MAX(received_at) FROM upcylab_records) AS latest_received
        FROM upcylab_records`+where,params),
      this.sql.query(`SELECT ${DAY}::text AS day,
        COALESCE(SUM(grams) FILTER(WHERE type='RESINA_LIQUIDA'),0) AS resin,
        COALESCE(SUM(grams) FILTER(WHERE type='SOLIDOS_EPIS'),0) AS solids
        FROM upcylab_records`+where+' GROUP BY day ORDER BY day DESC LIMIT 14',params)
    ]);
    const t=totals[0];
    return {records:rows.map(rowData),latest_received:t.latest_received,totals:{count:Number(t.count),grams:Number(t.grams),
      resin:Number(t.resin),solids:Number(t.solids),latest:t.latest},
      daily:daily.reverse().map(d=>({...d,resin:Number(d.resin),solids:Number(d.solids)}))};
  }
}
let instance;
export function getStore(req) {
  if(req.store) return req.store; // Inyectado solo por servidor/pruebas locales.
  if(!process.env.DATABASE_URL) throw new InputError('Falta conectar la base de datos.',503);
  if(!instance) instance=new PostgresStore(neon(process.env.DATABASE_URL));
  return instance;
}
