import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {LocalStore} from '../lib/local-store.mjs';
import records from '../api/records.js';
import status from '../api/status.js';
import exportRecords from '../api/export.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const store=new LocalStore(resolve(root,'data/preview.sqlite3'));
process.env.DEVICE_TOKEN ||= randomBytes(32).toString('hex');
const routes={'/api/records':records,'/api/status':status,'/api/export':exportRecords};
const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
const port=Number(process.env.PORT||8877);
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  try {
    if(routes[path]) {req.store=store;req.localPreview=true;return await routes[path](req,res)}
    if(assets[path] && req.method==='GET') {
      const [name,mime]=assets[path];res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store'});
      return res.end(await readFile(resolve(root,'public',name)));
    }
    res.writeHead(404);res.end('No encontrado');
  }catch {res.writeHead(500);res.end('Error local')}
});
server.listen(port,'127.0.0.1',()=>console.log(`Vista local preparada para Vercel: http://127.0.0.1:${port}`));
process.on('SIGINT',()=>server.close(()=>{store.close();process.exit(0)}));
