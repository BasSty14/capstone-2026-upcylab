'use strict';
const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('es-CL', {minimumFractionDigits:3,maximumFractionDigits:3});
const integer = new Intl.NumberFormat('es-CL');
const dateTime = new Intl.DateTimeFormat('es-CL', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'America/Santiago'});
let demo = false;
const kindLabel = kind => kind === 'RESINA_LIQUIDA' ? 'Resina líquida' : 'Sólidos / EPIs';

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {cache:'no-store'} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}
function fail(message) { $('error').textContent=message; $('error').hidden=!message; }
function filters() {
  const params=new URLSearchParams();
  for (const id of ['from','to','type']) if ($(id).value) params.set(id,$(id).value);
  return params.toString();
}
function updateStatus(data) {
  $('cloud-badge').textContent=data.ready?'API disponible':'Sin conexión';
  $('cloud-badge').classList.toggle('connected',data.ready);
  $('cloud-message').textContent=data.message;
  $('last-reception').textContent=data.latest?new Date(data.latest).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}):'—';
  $('cloud-mode').textContent=data.mode==='local'?'Vista local · base de desarrollo':'Dashboard en la nube';
  $('storage-label').textContent=demo?'Ejemplo sin guardar':data.mode==='local'?'Base de desarrollo local':'Guardados en la nube';
}
function exampleData() {
  const rows=[];
  // Ficticios en memoria del navegador: nunca se envian al servidor.
  for(let day=0;day<7;day++) for(let j=0;j<3;j++) {
    const time=new Date(); time.setDate(time.getDate()-day); time.setHours(10+j*2,15,0,0);
    rows.push({uid:`ejemplo-${day}-${j}`,received_at:time.toISOString(),
      type:j===1?'SOLIDOS_EPIS':'RESINA_LIQUIDA',grams:[250,120,480,180,320,650,410][(day+j)%7]});
  }
  const from=$('from').value, to=$('to').value, type=$('type').value;
  const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const filtered=rows.filter(r=>{const day=localDay(new Date(r.event_at||r.received_at)); return (!from||day>=from)&&(!to||day<=to)&&(!type||r.type===type)}).sort((a,b)=>b.received_at.localeCompare(a.received_at));
  const totals={count:filtered.length,grams:0,resin:0,solids:0,latest:filtered[0]?.received_at||null}, days=new Map();
  for(const r of filtered) {
    const key=r.type==='RESINA_LIQUIDA'?'resin':'solids', day=localDay(new Date(r.event_at||r.received_at));
    totals.grams+=r.grams; totals[key]+=r.grams;
    if(!days.has(day)) days.set(day,{day,resin:0,solids:0}); days.get(day)[key]+=r.grams;
  }
  return {records:filtered,totals,daily:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day))};
}
function renderChart(days) {
  const holder=$('bar-chart'); holder.replaceChildren();
  if(!days.length) {
    const empty=document.createElement('div'); empty.className='chart-empty';
    const text=document.createElement('span'); text.textContent='El gráfico aparecerá con tu primer registro'; empty.append(text); holder.append(empty); return;
  }
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg'); svg.setAttribute('viewBox','0 0 600 190'); svg.setAttribute('role','img');
  const title=document.createElementNS(NS,'title'); title.textContent='Peso diario por tipo de residuo en kilogramos'; svg.append(title);
  function node(tag,attrs,text) {const e=document.createElementNS(NS,tag); for(const [key,value] of Object.entries(attrs)) e.setAttribute(key,value); if(text!==undefined)e.textContent=text; svg.append(e); return e;}
  const max=Math.max(...days.map(d=>(d.resin+d.solids)/1000),.1), top=Math.ceil(max*10)/10;
  for(let i=0;i<=3;i++) {
    const y=15+i*45;
    node('line',{x1:40,x2:590,y1:y,y2:y,stroke:'#e9efed','stroke-dasharray':'3 4'});
    node('text',{x:31,y:y+4,'text-anchor':'end',fill:'#91a39b','font-size':10},(top*(3-i)/3).toLocaleString('es-CL',{maximumFractionDigits:2}));
  }
  const step=540/days.length, width=Math.min(step*.5,36);
  days.forEach((d,i)=>{
    const x=40+step*(i+.5)-width/2, resin=d.resin/1000/top*135, solids=d.solids/1000/top*135;
    const a=node('rect',{x,y:150-resin,width,height:resin,fill:'#34c5a1',rx:2});
    const b=node('rect',{x,y:150-resin-solids,width,height:solids,fill:'#7997d6',rx:2});
    for(const [rect,text] of [[a,`Resina: ${number.format(d.resin/1000)} kg`],[b,`Sólidos: ${number.format(d.solids/1000)} kg`]]) {
      const t=document.createElementNS(NS,'title');t.textContent=d.day+' · '+text;rect.append(t);
    }
    node('text',{x:x+width/2,y:173,'text-anchor':'middle',fill:'#83968d','font-size':10},d.day.slice(8)+'/'+d.day.slice(5,7));
  });
  holder.append(svg);
}
function render(data) {
  const t=data.totals;
  $('total-kg').textContent=number.format(t.grams/1000);
  $('resin-kg').textContent=number.format(t.resin/1000);
  $('solids-kg').textContent=number.format(t.solids/1000);
  $('count').textContent=integer.format(t.count); $('donut-count').textContent=integer.format(t.count);
  $('latest').textContent=t.latest?'Último: '+dateTime.format(new Date(t.latest)):'Aún no hay registros';
  const share=t.grams?t.resin/t.grams:0;
  $('resin-pct').textContent=t.grams?Math.round(share*100)+' %':'0 %';
  $('solids-pct').textContent=t.grams?(100-Math.round(share*100))+' %':'0 %';
  $('donut').style.background=t.grams?`conic-gradient(#34c5a1 ${share*360}deg, #7997d6 0deg)`:'#e9efed';
  renderChart(data.daily);
  $('table-body').replaceChildren();
  for(const r of data.records) {
    const tr=document.createElement('tr');
    const td=text=>{const el=document.createElement('td');el.textContent=text;tr.append(el);return el;};
    td(dateTime.format(new Date(r.event_at||r.received_at)));
    const cell=td(''), chip=document.createElement('span'); chip.className='type-chip'+(r.type==='SOLIDOS_EPIS'?' blue':'');
    const dot=document.createElement('i');dot.className='legend '+(r.type==='SOLIDOS_EPIS'?'solids':'resin');chip.append(dot,document.createTextNode(kindLabel(r.type)));cell.append(chip);
    td(integer.format(r.grams)).className='numeric';td(number.format(r.grams/1000)).className='numeric';
    const uid=td(r.uid.length>18?'…'+r.uid.slice(-15):r.uid);uid.className='record-id';uid.title=r.uid;
    $('table-body').append(tr);
  }
  $('empty').hidden=!!t.count;
  $('table-count').textContent=`${data.records.length} de ${integer.format(t.count)} registros${demo?' · ejemplo':''}`;
  $('table-caption').textContent=demo?'Datos ficticios · vista de ejemplo':'Fecha de registro · hora de Chile';
  $('updated').textContent=demo?'Ejemplo · no son registros reales':'Actualizado '+new Date().toLocaleTimeString('es-CL');
  const href='/api/export?'+filters();
  for(const id of ['export','export-side']) {$(id).href=href;$(id).setAttribute('aria-disabled',String(demo));}
}
let refreshing=false, refreshQueued=false;
let lastRendered='';
async function refresh() {
  if(refreshing) {refreshQueued=true;return;}
  refreshing=true;
  try {
    if($('from').value && $('to').value && $('from').value>$('to').value) throw new Error('La fecha inicial debe ser anterior a la final.');
    const requestedFilters=filters();
    const data=await api('/api/records?'+requestedFilters);
    // No pintar resultados de filtros que ya cambiaron durante la petición.
    if(requestedFilters!==filters()){refreshQueued=true;return;}
    updateStatus(data.status);
    const shown=demo?exampleData():data;
    const signature=JSON.stringify([demo,requestedFilters,shown.records,shown.totals,shown.daily]);
    if(signature!==lastRendered) {render(shown);lastRendered=signature;}
    else $('updated').textContent=demo?'Ejemplo · no son registros reales':'Actualizado '+new Date().toLocaleTimeString('es-CL');
    fail('');
  } catch(error) {
    fail('No se pudo actualizar: '+error.message);
    $('updated').textContent='Datos sin actualizar';
    $('cloud-badge').textContent='Sin actualizar';
    $('cloud-badge').classList.remove('connected');
  } finally {
    refreshing=false;
    if(refreshQueued){refreshQueued=false;queueMicrotask(refresh);}
  }
}
for(const id of ['from','to','type']) $(id).addEventListener('change',refresh);
$('clear-filters').addEventListener('click',()=>{for(const id of ['from','to','type'])$(id).value='';refresh()});
$('demo-toggle').addEventListener('click',()=>{
  demo=!demo;$('demo-toggle').textContent=demo?'Volver a registros':'Ver ejemplo';
  $('demo-toggle').setAttribute('aria-pressed',String(demo));$('demo-banner').hidden=!demo;
  refresh();
});
for(const id of ['export','export-side'])$(id).addEventListener('click',event=>{if(demo){event.preventDefault();fail('Sal de la vista de ejemplo para exportar tus registros reales.')}});
function clock(){ $('clock').textContent=new Date().toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'}); }
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
clock();refresh();setInterval(()=>{if(!document.hidden && !refreshing)refresh();},2000);
