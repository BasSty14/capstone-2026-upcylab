export const TYPES = ['RESINA_LIQUIDA', 'SOLIDOS_EPIS'];
export class InputError extends Error {
  constructor(message, status=400) { super(message); this.status=status; }
}
export function parseRecord(data) {
  if (!data || Array.isArray(data) || typeof data!=='object') throw new InputError('Se requiere un registro JSON.');
  if (typeof data.uid!=='string' || !/^[A-Za-z0-9_-]{1,64}$/.test(data.uid)) throw new InputError('ID inválido.');
  if (!TYPES.includes(data.type)) throw new InputError('Tipo inválido.');
  if (!Number.isInteger(data.grams) || data.grams<1 || data.grams>1000) throw new InputError('El peso debe ser un entero entre 1 y 1000 gramos.');
  let measured_at=null;
  if (data.measured_at!==undefined && data.measured_at!==null) {
    if (typeof data.measured_at!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(data.measured_at))
      throw new InputError('Fecha de medición inválida.');
    const timestamp=Date.parse(data.measured_at);
    if (!Number.isFinite(timestamp) || timestamp<Date.UTC(2024,0,1) || timestamp>Date.now()+300000 ||
        new Date(timestamp).toISOString().replace('.000','')!==data.measured_at)
      throw new InputError('Fecha de medición fuera de rango.');
    measured_at=new Date(timestamp).toISOString();
  }
  return {uid:data.uid,type:data.type,grams:data.grams,measured_at};
}
export function parseFilters(search) {
  const result={type:search.get('type')||'',from:search.get('from')||'',to:search.get('to')||''};
  if(result.type && !TYPES.includes(result.type)) throw new InputError('Tipo inválido.');
  for(const key of ['from','to']) if(result[key]) {
    const value=result[key];
    const parsed=Date.parse(value+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,10)!==value)
      throw new InputError('Fecha inválida.');
  }
  if(result.from && result.to && result.from>result.to) throw new InputError('La fecha inicial debe ser anterior a la final.');
  return result;
}
export function rowData(row) {
  const iso=value=>value instanceof Date?value.toISOString():value;
  return {...row,received_at:iso(row.received_at),measured_at:iso(row.measured_at),
    event_at:iso(row.measured_at||row.received_at),grams:Number(row.grams)};
}
export function csv(rows) {
  const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const lines=[['ID','Fecha registro UTC','Tipo','Gramos','Kilogramos','Recepción UTC','Origen de fecha']];
  for(const raw of rows) {
    const r=rowData(raw);
    lines.push([r.uid,r.event_at,r.type,r.grams,(r.grams/1000).toFixed(3),r.received_at,r.measured_at?'ESP32':'Servidor']);
  }
  return '\uFEFF'+lines.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
