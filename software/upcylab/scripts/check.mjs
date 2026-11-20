import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const file of ['public/app.js','api/records.js','api/status.js','api/export.js','lib/model.js','lib/store.js','lib/http.js']) {
  const result=spawnSync(process.execPath,['--check',resolve(root,file)],{stdio:'inherit'});
  if(result.status!==0)process.exit(1);
}
const html=await readFile(resolve(root,'public/index.html'),'utf8');
if(/id="(?:port|connect|disconnect)"/.test(html))throw new Error('El dashboard nube no debe incluir controles USB.');
const config=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8'));
if(config.outputDirectory!=='public')throw new Error('Salida Vercel incorrecta.');
console.log('Dashboard y API listos para Vercel.');
