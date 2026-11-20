// Solo desarrollo local y pruebas. En Vercel se usa exclusivamente PostgreSQL.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {InputError,rowData} from './model.js';
const formatDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'});
export class LocalStore {
  constructor(path=':memory:') {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec('CREATE TABLE IF NOT EXISTS records(uid TEXT PRIMARY KEY,type TEXT,grams INTEGER,measured_at TEXT,received_at TEXT)');
  }
  async save(r) {
    const old=this.db.prepare('SELECT * FROM records WHERE uid=?').get(r.uid);
    if(old) {
      if(old.type!==r.type || old.grams!==r.grams || old.measured_at!==r.measured_at) throw new InputError('El ID ya existe con otros datos.',409);
      return r.uid;
    }
    this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(r.uid,r.type,r.grams,r.measured_at,new Date().toISOString());
    return r.uid;
  }
  async latest(){return this.db.prepare('SELECT MAX(received_at) AS latest FROM records').get().latest}
  async all(filters) {
    return this.db.prepare('SELECT * FROM records').all().map(rowData).filter(r=>{
      const day=formatDay.format(new Date(r.event_at));
      return (!filters.type||r.type===filters.type)&&(!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to);
    }).sort((a,b)=>b.event_at.localeCompare(a.event_at)||b.uid.localeCompare(a.uid));
  }
  async list(filters) {
    const records=await this.all(filters);
    const totals={count:records.length,grams:0,resin:0,solids:0,latest:records[0]?.event_at||null},days=new Map();
    for(const r of records) {
      const day=formatDay.format(new Date(r.event_at)),key=r.type==='RESINA_LIQUIDA'?'resin':'solids';
      totals.grams+=r.grams;totals[key]+=r.grams;
      if(!days.has(day))days.set(day,{day,resin:0,solids:0});
      days.get(day)[key]+=r.grams;
    }
    return {records:records.slice(0,200),latest_received:await this.latest(),totals,daily:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)).slice(-14)};
  }
  close(){this.db.close()}
}
