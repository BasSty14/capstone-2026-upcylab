import {timingSafeEqual} from 'node:crypto';
import {InputError} from './model.js';

export function json(res,status,data) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.statusCode=status;res.end(JSON.stringify(data));
}
export function authorize(req) {
  const secret=process.env.DEVICE_TOKEN;
  if(!secret || secret.length<32 || secret.startsWith('REEMPLAZA_')) throw new InputError('Falta configurar DEVICE_TOKEN.',503);
  const header=req.headers.authorization||'';
  const expected='Bearer '+secret;
  if(typeof header!=='string' || Buffer.byteLength(header)!==Buffer.byteLength(expected) ||
     !timingSafeEqual(Buffer.from(header),Buffer.from(expected))) throw new InputError('No autorizado.',401);
}
export async function readBody(req) {
  if(!(req.headers['content-type']||'').startsWith('application/json')) throw new InputError('Se requiere JSON.',415);
  if(Number(req.headers['content-length'])>2048) throw new InputError('Solicitud demasiado grande.',413);
  if(req.body!==undefined) {
    if(typeof req.body==='string' && Buffer.byteLength(req.body)>2048) throw new InputError('Solicitud demasiado grande.',413);
    try { return typeof req.body==='string'?JSON.parse(req.body):req.body; }
    catch { throw new InputError('JSON inválido.'); }
  }
  let body='';
  for await(const chunk of req) {
    body+=chunk;
    if(Buffer.byteLength(body)>2048) throw new InputError('Solicitud demasiado grande.',413);
  }
  try{return JSON.parse(body)}catch{throw new InputError('JSON inválido.')}
}
export function handleError(res,error) {
  // Nunca devolver conexiones, consultas SQL ni claves al cliente.
  const status=error instanceof InputError?error.status:503;
  json(res,status,{error:error instanceof InputError?error.message:'Base de datos no disponible. Se reintentará.'});
}
