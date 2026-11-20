import test from 'node:test';
import assert from 'node:assert/strict';
import records from '../api/records.js';
import status from '../api/status.js';
import exportRecords from '../api/export.js';
import {LocalStore} from '../lib/local-store.mjs';
import {PostgresStore} from '../lib/store.js';
import {parseRecord,parseFilters} from '../lib/model.js';

process.env.DEVICE_TOKEN='test-only-token-00000000000000000000000000000000';
const sample={uid:'esp32-test-1',type:'RESINA_LIQUIDA',grams:250,measured_at:'2026-01-10T14:00:00Z'};
function request(store,method='GET',url='/api/records',body=undefined,auth=true) {
  return {store,method,url,body,headers:{'content-type':'application/json',
    ...(auth?{authorization:'Bearer '+process.env.DEVICE_TOKEN}:{})}};
}
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},end(body){this.body=body}}}
async function call(fn,req){const res=response();await fn(req,res);return res}

test('commit, ACK exacto y reintento conservan una sola fila y su hora',async()=>{
  const store=new LocalStore();
  try {
    const first=await call(records,request(store,'POST','/api/records',sample));
    assert.equal(first.statusCode,200);
    assert.equal(first.body,'{"ok":true,"uid":"esp32-test-1"}');
    const initial=(await store.all({}))[0].received_at;
    await call(records,request(store,'POST','/api/records',sample));
    const listed=JSON.parse((await call(records,request(store))).body);
    assert.equal(listed.totals.count,1);assert.equal(listed.totals.grams,250);
    assert.equal(listed.records[0].received_at,initial);
    assert.equal(listed.records[0].event_at,'2026-01-10T14:00:00.000Z');
    const conflict=await call(records,request(store,'POST','/api/records',{...sample,grams:251}));
    assert.equal(conflict.statusCode,409);
  }finally{store.close()}
});
test('autenticacion, peso y fechas invalidos no se guardan',async()=>{
  const store=new LocalStore();
  try {
    assert.equal((await call(records,request(store,'POST','/',sample,false))).statusCode,401);
    for(const body of [{...sample,grams:0},{...sample,grams:1001},{...sample,grams:1.5},
      {...sample,type:'UNKNOWN'},{...sample,uid:'=formula()'},{...sample,measured_at:'2026-02-30T00:00:00Z'}])
      assert.equal((await call(records,request(store,'POST','/',body))).statusCode,400);
    assert.equal((await store.list({})).totals.count,0);
    const bad=request(store,'POST','/',sample);bad.headers['content-length']='3000';
    assert.equal((await call(records,bad)).statusCode,413);
  }finally{store.close()}
});
test('fecha nula usa recepcion; filtros usan dia de Chile, no dia UTC',async()=>{
  const store=new LocalStore();
  try {
    await store.save(parseRecord({...sample,measured_at:'2026-01-10T01:00:00Z'}));
    await store.save(parseRecord({...sample,uid:'esp-2',type:'SOLIDOS_EPIS',measured_at:null,grams:500}));
    assert.equal((await store.list({from:'2026-01-09',to:'2026-01-09'})).totals.count,1);
    const solids=await store.list({type:'SOLIDOS_EPIS'});
    assert.equal(solids.totals.solids,500);
    assert.equal(solids.records[0].event_at,solids.records[0].received_at);
    assert.throws(()=>parseFilters(new URLSearchParams('from=2026-02-30')));
    assert.throws(()=>parseFilters(new URLSearchParams('from=2026-12-01&to=2026-01-01')));
  }finally{store.close()}
});
test('los totales y CSV cubren todo el filtro, tabla limitada a 200',async()=>{
  const store=new LocalStore();
  try {
    for(let i=0;i<205;i++)await store.save(parseRecord({...sample,uid:'esp-'+i}));
    const listed=await store.list({});assert.equal(listed.records.length,200);assert.equal(listed.totals.count,205);
    const output=await call(exportRecords,request(store,'GET','/api/export'));
    assert.equal(output.statusCode,200);assert.equal(output.body.split('\r\n').length,207);
    assert(output.body.includes('"0.250"'));
  }finally{store.close()}
});
test('un fallo de base de datos no produce ACK ni revela secretos',async()=>{
  const failing={save(){throw new Error('postgresql://secret@private/database')}};
  const res=await call(records,request(failing,'POST','/',sample));
  assert.equal(res.statusCode,503);assert(!res.body.includes('secret'));assert(!res.body.includes('"ok":true'));
});
test('status no confunde ultima recepcion con dispositivo online',async()=>{
  const store=new LocalStore();
  try {
    const res=await call(status,request(store,'GET','/api/status'));
    const data=JSON.parse(res.body);assert.equal(data.ready,true);assert.equal(data.latest,null);
    assert.equal(data.connected,undefined);
  }finally{store.close()}
});
test('una sola respuesta incluye estado global aunque el filtro oculte registros',async()=>{
  const store=new LocalStore();
  try {
    await store.save(parseRecord(sample));
    const req=request(store,'GET','/api/records?type=SOLIDOS_EPIS');
    req.localPreview=true;
    const data=JSON.parse((await call(records,req)).body);
    assert.equal(data.totals.count,0);
    assert.equal(data.records.length,0);
    assert.equal(data.status.ready,true);
    assert.equal(data.status.mode,'local');
    assert.equal(data.status.latest,await store.latest());
    assert.equal(data.latest_received,undefined);
  }finally{store.close()}
});
test('Postgres parametriza todos los datos y conserva idempotencia atomica',async()=>{
  const calls=[];
  const sql={async query(text,params){calls.push({text,params});return [{uid:sample.uid}]}};
  const store=new PostgresStore(sql);await store.save(parseRecord(sample));
  assert(calls[0].text.includes('ON CONFLICT(uid)'));assert(!calls[0].text.includes(sample.uid));
  assert.equal(calls[0].params[0],sample.uid);
  const conflict=new PostgresStore({query:async()=>[]});
  await assert.rejects(()=>conflict.save(parseRecord(sample)),{status:409});
});
