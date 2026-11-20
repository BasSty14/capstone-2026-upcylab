// Prueba contra la API real. Solo elimina el ID temporal creado por esta prueba.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
const base=process.env.DASHBOARD_URL;
if(!base || !base.startsWith('https://') || base.includes('TU_PROYECTO'))
  throw new Error('Configura DASHBOARD_URL con la implementacion que quieres probar.');
if(!process.env.DEVICE_TOKEN || !process.env.DATABASE_URL)throw new Error('Faltan las variables privadas de prueba.');
const sql=neon(process.env.DATABASE_URL);
const uid='validacion-'+randomUUID();
const record={uid,type:'SOLIDOS_EPIS',grams:360,measured_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z')};
const headers={'Content-Type':'application/json',Authorization:'Bearer '+process.env.DEVICE_TOKEN};
try {
  const denied=await fetch(base+'/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
  assert.equal(denied.status,401);
  for(let i=0;i<2;i++) {
    const r=await fetch(base+'/api/records',{method:'POST',headers,body:JSON.stringify(record)});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,uid});
  }
  const [count]=await sql.query('SELECT COUNT(*)::int AS count FROM upcylab_records WHERE uid=$1',[uid]);
  assert.equal(count.count,1);
  const conflict=await fetch(base+'/api/records',{method:'POST',headers,body:JSON.stringify({...record,grams:361})});
  assert.equal(conflict.status,409);
  const result=await (await fetch(base+'/api/records?type=SOLIDOS_EPIS')).json();
  assert(result.records.some(r=>r.uid===uid && r.grams===360));
  const csv=await (await fetch(base+'/api/export')).text();assert(csv.includes(uid));assert(csv.includes('0.360'));
  console.log('PASS producción: autorización, guardado, reintento sin duplicados, conflicto, lectura y CSV.');
}finally{
  await sql.query('DELETE FROM upcylab_records WHERE uid=$1',[uid]);
  console.log('Registro temporal de validación retirado.');
}
