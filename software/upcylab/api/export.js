import {getStore} from '../lib/store.js';
import {parseFilters,csv} from '../lib/model.js';
import {json,handleError} from '../lib/http.js';
export default async function handler(req,res) {
  if(req.method!=='GET') {res.setHeader('Allow','GET');return json(res,405,{error:'Método no permitido.'})}
  try {
    const rows=await getStore(req).all(parseFilters(new URL(req.url,'https://upcylab.local').searchParams));
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Disposition','attachment; filename="upcylab-registros.csv"');
    res.statusCode=200;res.end(csv(rows));
  }catch(error){handleError(res,error)}
}
