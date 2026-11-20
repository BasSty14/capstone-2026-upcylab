import {getStore} from '../lib/store.js';
import {json,handleError} from '../lib/http.js';
export default async function handler(req,res) {
  if(req.method!=='GET') {res.setHeader('Allow','GET');return json(res,405,{error:'Método no permitido.'})}
  try {
    const latest=await getStore(req).latest();
    json(res,200,{ready:true,mode:req.localPreview?'local':'cloud',latest,
      message:latest?'Última recepción confirmada':'Esperando el primer registro del ESP32'});
  }catch(error){handleError(res,error)}
}
