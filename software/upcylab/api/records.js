import {getStore} from '../lib/store.js';
import {parseRecord,parseFilters} from '../lib/model.js';
import {authorize,json,readBody,handleError} from '../lib/http.js';

export default async function handler(req,res) {
  try {
    if(req.method==='POST') {
      authorize(req);
      const record=parseRecord(await readBody(req));
      const uid=await getStore(req).save(record);
      return json(res,200,{ok:true,uid});
    }
    if(req.method==='GET') {
      const filters=parseFilters(new URL(req.url,'https://upcylab.local').searchParams);
      const {latest_received,...data}=await getStore(req).list(filters);
      return json(res,200,{...data,status:{ready:true,mode:req.localPreview?'local':'cloud',
        latest:latest_received||null,
        message:latest_received?'Última recepción confirmada':'Esperando el primer registro del ESP32'}});
    }
    res.setHeader('Allow','GET, POST');json(res,405,{error:'Método no permitido.'});
  }catch(error){handleError(res,error)}
}
