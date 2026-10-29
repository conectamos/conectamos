import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { fakeClock, loadAutosave, MemoryStorage } from './helpers/payjoy-40-60-autosave-harness.mjs';

const source=readFileSync(new URL('../app/dashboard/payjoy/_components/payjoy-40-60-workspace.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const rows=()=>Array.from({length:32},(_,i)=>({id:'row-'+i,week:'2026-10-19',merchantName:'Comercio QA',deviceTag:'QA'+String(i+1).padStart(6,'0'),loanAgeDays:50,numberOfPayments:4,loanRepaymentBiweek:125000,cedula:i%4?'1000000000':'',status:i%3?'40/60 APROBADO':'40/60 NO APROBADO',pay40At60:i%3?1:0,paidInFull:false}));
const summary=items=>items.reduce((s,r)=>{s[r.status==='40/60 APROBADO'?'aprobados':'noAprobados']++;s[r.cedula?'cedulasEncontradas':'cedulasPendientes']++;return s},{aprobados:0,noAprobados:0,cedulasEncontradas:0,cedulasPendientes:0});
// Actual component, isolated hooks and a persistent in-memory API: no network/provider/Prisma.
function environment({auditor=false,saveError=false,holdSave=false,holdProcess=false,userId=8,perfilId=7,storage=new MemoryStorage(),sessionStorage=new MemoryStorage(),clock=fakeClock(),initialRecords=null,clientKeys=new Map()}={}){
 const controls={saveError,processError:false,emptyProcess:false,responseWeek:null,confirm:true,confirmations:[],dropAfterCommit:false};
 let slots=[],cursor=0,tree,changed=false,gateResolve;
 let processResolve;
 const effects=[],requests=[],listeners=new Map();
 const data={ok:true,fileName:'archivo-qa.xlsx',sheetName:'Transacciones',week:'2026-10-19',ageReferenceDate:'2026-10-28',totalRows:64,filteredRows:32,summary:summary(rows()),rows:rows()};
 const records=initialRecords||Array.from({length:8},(_,i)=>({...structuredClone(data),id:101+i,revision:1,recordName:'SEMANA QA '+(i+1),savedByName:'Usuario QA',savedByUser:'qa',savedAt:'2026-10-23T15:00:00Z',updatedAt:'2026-10-23T15:00:00Z'}));
 const gate=holdSave?new Promise(resolve=>{gateResolve=resolve}):Promise.resolve();
 const processGate=holdProcess?new Promise(resolve=>{processResolve=resolve}):Promise.resolve();
 const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(!Object.is(next,slots[i])){slots[i]=next;changed=true}}]},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useMemo(callback,deps){const i=cursor++;const previous=slots[i];if(!previous||deps.some((d,j)=>!Object.is(d,previous.deps[j])))slots[i]={deps,value:callback()};return slots[i].value},
  useCallback(callback,deps){return react.useMemo(()=>callback,deps)},
  useEffect(callback,deps){const i=cursor++;const previous=slots[i];if(!previous||deps.some((d,j)=>!Object.is(d,previous.deps[j]))){const slot={deps,cleanup:null};slots[i]=slot;effects.push(()=>{previous?.cleanup?.();slot.cleanup=callback()})}}
 };
 const jsx=(type,props,key)=>{if(typeof type==='string'&&props?.ref&&typeof props.ref==='object'){const element=props.ref.current||{value:'',click(){},focus(){}};if('value'in props)element.value=props.value??'';props.ref.current=element}return{type,props:props||{},key}};
 async function fetchMock(url,options={}){const method=options.method||'GET';const request={url,method,body:options.body};requests.push(request);const response=(payload,ok=true,status=ok?200:500)=>({ok,status,json:async()=>structuredClone(payload)});
  if(url.endsWith('/weeks'))return response({ok:true,fileName:options.body.get('file').name,sheetName:data.sheetName,weeks:['2026-10-19','2026-10-12']});
  if(url==='/api/payjoy/40-60'){
   await processGate;if(controls.processError)return response({error:'Error de procesamiento de prueba'},false);
   const nextRows=controls.emptyProcess?[]:rows();const nextWeek=controls.responseWeek||options.body.get('week');
   return response({...data,fileName:options.body.get('file').name,week:nextWeek,rows:nextRows.map(row=>({...row,week:nextWeek})),filteredRows:nextRows.length,summary:summary(nextRows)});
  }
  if(method==='GET'&&url.includes('?id='))return response({ok:true,registro:records.find(r=>r.id===Number(url.split('=')[1]))});
  if(method==='GET')return response({ok:true,registros:records});
  if(method==='POST'||method==='PATCH'){
   await gate;if(controls.saveError)return response({error:'Error de guardado de prueba'},false);
   const payload=JSON.parse(options.body),key=payload.clientKey?`${userId}:${perfilId}:${payload.clientKey}`:null;
   const replayed=method==='POST'&&key&&clientKeys.has(key),id=method==='POST'?(replayed?clientKeys.get(key):1000+records.length):payload.id,index=records.findIndex(record=>record.id===id);
   if(replayed)return response({ok:true,replayed:true,registro:records[index]});
   if(method==='PATCH'&&payload.expectedRevision!==undefined&&payload.expectedRevision!==records[index]?.revision)return response({code:'REVISION_CONFLICT',currentRevision:records[index]?.revision,error:'Otra pestaña cambió el corte QA'},false,409);
   const saved={...(index>=0?records[index]:records[0]),...payload,id,revision:method==='POST'?1:(records[index]?.revision||0)+1,updatedAt:'2026-10-28T15:00:00Z'};
   if(index>=0)records[index]=structuredClone(saved);else records.push(structuredClone(saved));
   if(key)clientKeys.set(key,id);if(controls.dropAfterCommit){controls.dropAfterCommit=false;throw new TypeError('Respuesta perdida QA')}
   return response({ok:true,replayed:false,registro:saved,mensaje:'Guardado confirmado por servidor QA'});
  }
  return response({ok:true});
 }
 const mod={exports:{}};
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.now()]))}static now(){return clock.now()}}
 const intervals=new Map();let intervalSequence=0;
 const browser={localStorage:storage,sessionStorage,setTimeout:clock.schedule,clearTimeout:clock.cancel,setInterval(fn,ms){const id=++intervalSequence;const run=()=>{fn();intervals.set(id,clock.schedule(run,ms))};intervals.set(id,clock.schedule(run,ms));return id},clearInterval(id){clock.cancel(intervals.get(id));intervals.delete(id)},confirm(message){controls.confirmations.push(message);return controls.confirm},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},removeEventListener(type,fn){listeners.get(type)?.delete(fn)}};
 const documentMock={addEventListener:(type,fn)=>browser.addEventListener('document:'+type,fn),removeEventListener:(type,fn)=>browser.removeEventListener('document:'+type,fn)};
 const modules=new Map();
 const req=name=>{
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
  if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='next/image')return{__esModule:true,default:'img'};
  if(name.endsWith('.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name.includes('sales-dashboard-parts'))return{SalesProfile:'profile'};
  if(name.includes('dashboard-icon'))return{__esModule:true,default:'icon'};
  if(name==='@/lib/payjoy-40-60-autosave'){
   if(!modules.has(name))modules.set(name,loadAutosave({setTimeout:clock.schedule,clearTimeout:clock.cancel,Date:ClockDate}));return modules.get(name);
  }
  if(name==='@/lib/payjoy-40-60-age'){
   if(!modules.has(name)){const age={exports:{}};const code=ts.transpileModule(readFileSync(new URL('../lib/payjoy-40-60-age.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('module','exports','Date',code)(age,age.exports,ClockDate);modules.set(name,age.exports)}return modules.get(name);
  }
  throw Error('Import de prueba inesperado: '+name);
 };
 new Function('require','module','exports','fetch','window','document','setTimeout','clearTimeout','Date',compiled)(req,mod,mod.exports,fetchMock,browser,documentMock,clock.schedule,clock.cancel,ClockDate);
 const Page=mod.exports.default;
 const user={id:userId,perfilId,nombre:'Usuario QA',usuario:'qa',rolNombre:auditor?'AUDITOR':'ADMIN',sedeNombre:'SEDE QA'};
 function render(){cursor=0;changed=false;tree=Page({puedeEliminar:!auditor,user});while(effects.length)effects.shift()();return tree}
 function all(node=tree,list=[]){if(node==null||typeof node==='boolean')return list;if(Array.isArray(node)){node.forEach(n=>all(n,list));return list}if(typeof node==='object'){list.push(node);if(node.props?.children!==undefined)all(node.props.children,list)}return list}
 function text(node=tree){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(n=>text(n)).join('');if(typeof node==='object')return node.props?.children===undefined?'':text(node.props.children);return String(node)}
 function one(predicate){const found=all().find(predicate);assert.ok(found,'No se encontró nodo. Vista: '+text());return found}
 function button(name){return one(n=>n.type==='button'&&text(n)===name)}
 async function settle(){for(let i=0;i<50;i++){await Promise.resolve();if(changed)render()}return tree}
 render();
 return{requests,records,controls,render,settle,all,text,one,button,releaseSave:()=>gateResolve?.(),releaseProcess:()=>processResolve?.(),data,storage,sessionStorage,clientKeys,clock,async advance(ms){await clock.advance(ms);await settle()},unmount(){for(const slot of slots)slot?.cleanup?.()},dispatch(type,event={}){for(const listener of listeners.get(type)||[])listener(event)}};
}
async function uploadAndProcess(env){await env.settle();const input=env.one(n=>n.type==='input'&&n.props.type==='file');input.props.onChange({target:{files:[new File(['qa'],'archivo-qa.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})]}});await env.settle();const week=env.one(n=>n.type==='select'&&!n.props['aria-label']);week.props.onChange({target:{value:'2026-10-19'}});env.render();env.button('Procesar').props.onClick();await env.settle()}
const writes=env=>env.requests.filter(r=>r.url.endsWith('/registros')&&['POST','PATCH'].includes(r.method));
const assertSaved=env=>assert.ok(env.all().some(n=>n.props?.role==='status'&&env.text(n)==='Guardado'),'Debe confirmar guardado en el estado del corte');
const processing=env=>env.requests.filter(r=>r.url==='/api/payjoy/40-60');
const nameField=env=>env.one(n=>n.type==='input'&&n.props.placeholder==='Ej.: 40/60 - Semana 02');
const weekField=env=>env.one(n=>n.type==='select'&&!n.props['aria-label']);
const cedulaField=(env,tag='QA000001')=>env.one(n=>n.type==='input'&&n.props['aria-label']==='Cédula de '+tag);
async function selectFile(env,name='archivo-nuevo-qa.xlsx'){
 env.one(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[new File(['otro'],name)]}});await env.settle();
}
async function openStored(env,index=0){
 await env.settle();if(env.all().some(n=>n.type==='button'&&env.text(n)==='Ver historial')){env.button('Ver historial').props.onClick();env.render()}
 env.all().filter(n=>n.type==='button'&&env.text(n)==='Consultar')[index].props.onClick();await env.settle();
}
function edit(env,tag='QA000001',value='000987654321'){cedulaField(env,tag).props.onChange({target:{value}});env.render()}

test('el historial empieza cerrado y muestra las ocho semanas sin requerir procesamiento',async()=>{
 const env=environment();await env.settle();assert.equal(env.button('Ver historial').props['aria-expanded'],false);assert.ok(!env.text().includes('SEMANA QA 8'));env.button('Ver historial').props.onClick();env.render();assert.ok(env.text().includes('SEMANA QA 8'));assert.equal(env.requests.filter(r=>r.url==='/api/payjoy/40-60').length,0);assert.equal(env.requests.filter(r=>r.method!=='GET').length,0);
});
test('abrir y cerrar el historial conserva la carga seleccionada y la WEEK',async()=>{
 const env=environment();await uploadAndProcess(env);const before=env.text();env.button('Ver historial').props.onClick();env.render();env.button('Ocultar historial').props.onClick();env.render();assert.ok(env.text().includes('archivo-qa.xlsx'));assert.ok(env.text().includes('32 filas listas para guardar'));assert.equal(env.one(n=>n.type==='select'&&!n.props['aria-label']).props.value,'2026-10-19');assert.equal(env.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/registros')).length,0);assert.ok(before.includes('Registros procesados'));
});
test('guardar incluye todas las filas y sus ediciones aunque se filtre y pagine',async()=>{
 const env=environment();await uploadAndProcess(env);assert.equal(env.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/registros')).length,0);env.button('Siguiente').props.onClick();env.render();env.one(n=>n.type==='input'&&n.props['aria-label']==='Cédula de QA000026').props.onChange({target:{value:'000123456789'}});env.render();env.one(n=>n.type==='select'&&n.props['aria-label']==='Resultado de QA000026').props.onChange({target:{value:'40/60 NO APROBADO'}});env.render();env.button('Aprobados').props.onClick();env.render();await env.settle();env.button('Guardar').props.onClick();await env.settle();const request=env.requests.find(r=>r.method==='POST'&&r.url.endsWith('/registros'));assert.ok(request);const payload=JSON.parse(request.body);assert.equal(payload.rows.length,32);assert.equal(payload.filteredRows,32);assert.equal(payload.rows[25].cedula,'000123456789');assert.equal(payload.rows[25].status,'40/60 NO APROBADO');assert.deepEqual(payload.summary,summary(payload.rows));assertSaved(env);
});
test('dos clics inmediatos en guardar producen un solo envío y muestran procesamiento',async()=>{
 const env=environment({holdSave:true});await uploadAndProcess(env);const guardar=env.button('Guardar');guardar.props.onClick();guardar.props.onClick();env.render();assert.equal(env.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/registros')).length,1);assert.ok(env.text().includes('Guardando…'));assert.equal(env.button('Guardando…').props.disabled,true);env.releaseSave();await env.settle();assertSaved(env);
});
test('el error del servidor conserva el nombre, las filas y la cédula sin afirmar éxito',async()=>{
 const env=environment({saveError:true});await uploadAndProcess(env);env.one(n=>n.type==='input'&&n.props.placeholder==='Ej.: 40/60 - Semana 02').props.onChange({target:{value:'Semana personalizada QA'}});env.render();env.one(n=>n.type==='input'&&n.props['aria-label']==='Cédula de QA000001').props.onChange({target:{value:'000987654321'}});env.render();env.button('Guardar').props.onClick();await env.settle();assert.match(env.text(),/Sin conexión|No se pudo guardar|sin respuesta del servidor/);assert.equal(env.one(n=>n.type==='input'&&n.props.placeholder==='Ej.: 40/60 - Semana 02').props.value,'Semana personalizada QA');assert.equal(env.one(n=>n.type==='input'&&n.props['aria-label']==='Cédula de QA000001').props.value,'000987654321');assert.ok(env.text().includes('32 filas listas para guardar'));assert.ok(!env.text().includes('Guardado confirmado'));
});
test('AUDITOR consulta todas las semanas y sus resultados sin ofrecer borrado',async()=>{
 const env=environment({auditor:true});await env.settle();env.button('Ver historial').props.onClick();env.render();assert.equal(env.all().filter(n=>n.type==='button'&&String(n.props['aria-label']||'').startsWith('Eliminar ')).length,0);const consultar=env.all().filter(n=>n.type==='button'&&env.text(n)==='Consultar');assert.equal(consultar.length,8);consultar[7].props.onClick();await env.settle();assert.ok(env.text().includes('32 filas listas para guardar'));assert.equal(env.one(n=>n.type==='input'&&n.props.placeholder==='Ej.: 40/60 - Semana 02').props.value,'SEMANA QA 8');
});



test('Guardar activo envía PATCH con las 32 filas y no reprocesa archivo ni WEEK pendientes',async()=>{
 const env=environment();await openStored(env);env.button('Siguiente').props.onClick();env.render();edit(env,'QA000026','000123456789');
 env.one(n=>n.type==='select'&&n.props['aria-label']==='Resultado de QA000026').props.onChange({target:{value:'40/60 NO APROBADO'}});env.render();env.button('Aprobados').props.onClick();await env.settle();
 await selectFile(env);weekField(env).props.onChange({target:{value:'2026-10-12'}});env.render();env.button('Guardar').props.onClick();await env.settle();
 assert.equal(processing(env).length,0);assert.equal(writes(env).length,1);assert.equal(writes(env)[0].method,'PATCH');
 const payload=JSON.parse(writes(env)[0].body);assert.equal(payload.id,101);assert.equal(payload.week,'2026-10-19');assert.equal(payload.fileName,'archivo-qa.xlsx');assert.equal(payload.recordName,'SEMANA QA 1');assert.equal(payload.rows.length,32);assert.equal(payload.rows[25].cedula,'000123456789');assert.equal(payload.rows[25].status,'40/60 NO APROBADO');assert.deepEqual(payload.summary,summary(payload.rows));assert.equal(env.records.length,8);
 assertSaved(env);
 await openStored(env);env.button('Siguiente').props.onClick();env.render();assert.equal(cedulaField(env,'QA000026').props.value,'000123456789');
});

test('doble clic en Guardar activo produce un solo PATCH y bloquea ambas acciones',async()=>{
 const env=environment({holdSave:true});await openStored(env);edit(env);const guardar=env.button('Guardar');guardar.props.onClick();guardar.props.onClick();env.render();
 assert.equal(writes(env).length,1);assert.equal(writes(env)[0].method,'PATCH');const busy=env.all().filter(n=>n.type==='button'&&env.text(n)==='Guardando…');assert.ok(busy.length);assert.ok(busy.every(n=>n.props.disabled));assert.ok(env.all().filter(n=>n.type==='button'&&env.text(n)==='Recargar').every(n=>n.props.disabled));
 env.releaseSave();await env.settle();assertSaved(env);
});

test('fallo PATCH conserva ediciones y nombre, permite reintentar y no afirma guardado',async()=>{
 const env=environment({saveError:true});await openStored(env);nameField(env).props.onChange({target:{value:'Nombre pendiente QA'}});env.render();edit(env);env.button('Guardar').props.onClick();await env.settle();
 assert.match(env.text(),/Sin conexión|No se pudo guardar|sin respuesta del servidor/);assert.equal(nameField(env).props.value,'Nombre pendiente QA');assert.equal(cedulaField(env).props.value,'000987654321');assert.ok(env.text().includes('32 filas listas para guardar'));assert.ok(env.text().includes('Respaldo en este equipo'));assert.ok(!env.all().some(n=>n.props?.role==='status'&&env.text(n)==='Guardado'));assert.equal(env.records[0].recordName,'SEMANA QA 1');
 env.controls.saveError=false;env.button('Guardar').props.onClick();await env.settle();assert.deepEqual(writes(env).map(r=>r.method),['PATCH','PATCH']);assertSaved(env);assert.equal(env.records.length,8);
});

test('AUDITOR guarda el mismo corte mediante PATCH sin crear duplicado',async()=>{
 const env=environment({auditor:true});await openStored(env,7);edit(env);env.button('Guardar').props.onClick();await env.settle();assert.equal(writes(env).length,1);assert.equal(writes(env)[0].method,'PATCH');assert.equal(JSON.parse(writes(env)[0].body).id,108);assert.equal(env.records.length,8);
});

test('Recargar procesa una vez a pantalla y exige Guardar separado conservando ID, nombre y WEEK',async()=>{
 const env=environment({holdProcess:true});await openStored(env);nameField(env).props.onChange({target:{value:'Nombre conservado QA'}});env.render();await selectFile(env);
 const reload=env.button('Recargar');reload.props.onClick();reload.props.onClick();env.render();assert.equal(processing(env).length,1);assert.equal(writes(env).length,0);const busy=env.all().filter(n=>n.type==='button'&&env.text(n)==='Recargando…');assert.ok(busy.length);assert.ok(busy.every(n=>n.props.disabled));
 env.releaseProcess();await env.settle();assert.equal(writes(env).length,0);assert.equal(nameField(env).props.value,'Nombre conservado QA');assert.ok(env.text().includes('Cambios pendientes'));assert.ok(env.text().includes('archivo-nuevo-qa.xlsx'));assert.equal(env.records[0].fileName,'archivo-qa.xlsx');
 edit(env);env.button('Guardar').props.onClick();await env.settle();assert.equal(processing(env).length,1);assert.equal(writes(env).length,1);assert.equal(writes(env)[0].method,'PATCH');
 const payload=JSON.parse(writes(env)[0].body);assert.equal(payload.id,101);assert.equal(payload.recordName,'Nombre conservado QA');assert.equal(payload.week,'2026-10-19');assert.equal(payload.fileName,'archivo-nuevo-qa.xlsx');assert.equal(payload.rows.length,32);assert.equal(payload.rows[0].cedula,'000987654321');
});

for(const failure of ['processError','emptyProcess','responseWeek','selectedWeek'])test(`Recargar con ${failure} conserva todo el avance abierto`,async()=>{
 const env=environment();await openStored(env);nameField(env).props.onChange({target:{value:'Avance que se conserva QA'}});env.render();edit(env);await selectFile(env);
 if(failure==='selectedWeek'){weekField(env).props.onChange({target:{value:'2026-10-12'}});env.render()}else env.controls[failure]=failure==='responseWeek'?'2026-10-12':true;
 env.button('Recargar').props.onClick();await env.settle();assert.equal(writes(env).length,0);assert.equal(nameField(env).props.value,'Avance que se conserva QA');assert.equal(cedulaField(env).props.value,'000987654321');assert.ok(env.text().includes('32 filas listas para guardar'));assert.ok(env.text().includes('Cambios pendientes'));
 if(failure==='processError')assert.ok(env.text().includes('Error de procesamiento de prueba'));if(failure==='emptyProcess')assert.ok(env.text().includes('no contiene filas'));if(failure==='selectedWeek')assert.equal(processing(env).length,0);
 const prior=processing(env).length;env.button('Guardar').props.onClick();await env.settle();assert.equal(processing(env).length,prior);const payload=JSON.parse(writes(env)[0].body);assert.equal(payload.id,101);assert.equal(payload.week,'2026-10-19');assert.equal(payload.fileName,'archivo-qa.xlsx');assert.equal(payload.rows.length,32);assert.equal(payload.rows[0].cedula,'000987654321');
});

test('después del primer POST, Guardar actualiza el mismo ID sin duplicar la semana',async()=>{
 const env=environment();await uploadAndProcess(env);env.button('Guardar').props.onClick();await env.settle();edit(env);env.button('Guardar').props.onClick();await env.settle();assert.deepEqual(writes(env).map(r=>r.method),['POST','PATCH']);assert.equal(JSON.parse(writes(env)[1].body).id,env.records[8].id);assert.equal(env.records.length,9);assert.equal(processing(env).length,1);
});

test('seleccionar otro archivo conserva las ediciones del corte nuevo sin guardarlo todavía',async()=>{
 const env=environment();await uploadAndProcess(env);edit(env);await selectFile(env);assert.equal(cedulaField(env).props.value,'000987654321');env.button('Guardar').props.onClick();await env.settle();assert.equal(processing(env).length,1);const payload=JSON.parse(writes(env)[0].body);assert.equal(payload.fileName,'archivo-qa.xlsx');assert.equal(payload.rows[0].cedula,'000987654321');
});

test('cancelar Recargar conserva cambios y no procesa ni guarda el archivo',async()=>{
 const env=environment();await openStored(env);edit(env);await selectFile(env);env.controls.confirm=false;env.button('Recargar').props.onClick();await env.settle();
 assert.equal(processing(env).length,0);assert.equal(writes(env).length,0);assert.equal(cedulaField(env).props.value,'000987654321');assert.equal(nameField(env).props.value,'SEMANA QA 1');assert.ok(env.text().includes('Cambios pendientes'));
});

test('cancelar Nuevo corte conserva el ID activo para el siguiente Guardar',async()=>{
 const env=environment();await openStored(env);edit(env);env.controls.confirm=false;env.button('Nuevo corte').props.onClick();await env.settle();assert.equal(cedulaField(env).props.value,'000987654321');assert.equal(nameField(env).props.value,'SEMANA QA 1');
 env.button('Guardar').props.onClick();await env.settle();assert.equal(writes(env)[0].method,'PATCH');assert.equal(JSON.parse(writes(env)[0].body).id,101);
});

test('cancelar la consulta de otro guardado conserva el avance y evita leerlo',async()=>{
 const env=environment();await openStored(env);edit(env);env.controls.confirm=false;const previousGets=env.requests.filter(r=>r.url.includes('?id=')).length;
 env.all().filter(n=>n.type==='button'&&env.text(n)==='Consultar')[1].props.onClick();await env.settle();assert.equal(env.requests.filter(r=>r.url.includes('?id=')).length,previousGets);assert.equal(cedulaField(env).props.value,'000987654321');assert.equal(nameField(env).props.value,'SEMANA QA 1');
});

test('Recargar admite la misma WEEK en formatos fecha y timestamp sin cambiar de corte',async()=>{
 const env=environment();env.records[0].week='2026-10-19 00:00:00+00';env.records[0].rows=env.records[0].rows.map(row=>({...row,week:env.records[0].week}));
 await openStored(env);await selectFile(env);assert.equal(weekField(env).props.value,'2026-10-19');env.controls.responseWeek='2026-10-19T00:00:00.000Z';
 env.button('Recargar').props.onClick();await env.settle();assert.equal(processing(env).length,1);assert.equal(writes(env).length,0);assert.equal(nameField(env).props.value,'SEMANA QA 1');
 env.button('Guardar').props.onClick();await env.settle();assert.equal(writes(env)[0].method,'PATCH');const payload=JSON.parse(writes(env)[0].body);assert.equal(payload.id,101);assert.equal(payload.week,'2026-10-19T00:00:00.000Z');assert.equal(payload.rows.length,32);assert.equal(env.records.length,8);
});

test('autoguardado no escribe al consultar un corte sin cambios ni consulta el proveedor',async()=>{
 const env=environment();await openStored(env);await env.advance(10000);assert.equal(writes(env).length,0);assert.equal(processing(env).length,0);env.unmount();
});

test('autoguardado espera 1 s y envía las 32 filas aunque solo haya un filtro o página visible',async()=>{
 const env=environment();await openStored(env);env.button('Siguiente').props.onClick();env.render();edit(env,'QA000026','000111');await env.advance(800);edit(env,'QA000026','000123456789');
 env.one(n=>n.type==='select'&&n.props['aria-label']==='Resultado de QA000026').props.onChange({target:{value:'40/60 NO APROBADO'}});env.render();env.button('Aprobados').props.onClick();await env.settle();
 await env.advance(999);assert.equal(writes(env).length,0);await env.advance(1);assert.equal(writes(env).length,1);assert.equal(writes(env)[0].method,'PATCH');const payload=JSON.parse(writes(env)[0].body);
 assert.equal(payload.expectedRevision,1);assert.equal(payload.rows.length,32);assert.equal(payload.rows[25].cedula,'000123456789');assert.equal(payload.rows[25].status,'40/60 NO APROBADO');assert.deepEqual(payload.summary,summary(payload.rows));assert.equal(payload.ageReferenceDate,'2026-10-28');assert.ok(payload.rows.every(row=>row.loanAgeDays===50));assert.equal(processing(env).length,0);env.unmount();
});

test('seguir escribiendo durante autoguardado conserva el texto reciente y serializa solicitudes',async()=>{
 const env=environment({holdSave:true});await openStored(env);edit(env,'QA000001','0001');await env.advance(1000);assert.equal(writes(env).length,1);assert.equal(cedulaField(env).props.disabled,false);assert.equal(nameField(env).props.disabled,false);
 edit(env,'QA000001','000123');await env.advance(1500);assert.equal(writes(env).length,1);env.releaseSave();await env.settle();await env.advance(1000);
 assert.equal(writes(env).length,2);assert.equal(JSON.parse(writes(env)[1].body).expectedRevision,2);assert.equal(env.records[0].rows[0].cedula,'000123');assert.equal(cedulaField(env).props.value,'000123');env.unmount();
});

test('F5 restaura el borrador local del mismo perfil con nombre, 32 filas y ceros iniciales',async()=>{
 const env=environment();await openStored(env);nameField(env).props.onChange({target:{value:'Borrador después de F5 QA'}});env.render();edit(env);env.unmount();
 const restored=environment({storage:env.storage,sessionStorage:env.sessionStorage,initialRecords:env.records,clientKeys:env.clientKeys});await restored.settle();
 assert.equal(nameField(restored).props.value,'Borrador después de F5 QA');assert.equal(cedulaField(restored).props.value,'000987654321');assert.ok(restored.text().includes('32 filas listas para guardar'));assert.equal(processing(restored).length,0);assert.equal(writes(restored).length,0);
 await restored.advance(1000);assert.equal(writes(restored).length,1);assert.equal(JSON.parse(writes(restored)[0].body).ageReferenceDate,'2026-10-28');restored.unmount();
});

test('otro perfil de la cuenta base no recibe el borrador al entrar',async()=>{
 const env=environment({userId:8,perfilId:7});await openStored(env);edit(env);env.unmount();
 const other=environment({userId:8,perfilId:9,storage:env.storage,sessionStorage:env.sessionStorage,initialRecords:env.records});await other.settle();await other.advance(10000);
 assert.equal(other.all().filter(n=>n.type==='input'&&String(n.props['aria-label']||'').startsWith('Cédula de ')).length,0);assert.equal(writes(other).length,0);assert.equal(other.requests.filter(r=>r.url.includes('?id=')).length,0);other.unmount();
});

test('conflicto de revisión mantiene ediciones locales y no sobrescribe la versión de otra pestaña',async()=>{
 const env=environment();await openStored(env);env.records[0].revision=2;env.records[0].rows[0].cedula='777';edit(env);await env.advance(1000);
 assert.equal(writes(env).length,1);assert.equal(cedulaField(env).props.value,'000987654321');assert.equal(env.records[0].rows[0].cedula,'777');assert.match(env.text(),/otra (?:sesión|revisión|pestaña)|conflicto/i);
 edit(env,'QA000001','000555');await env.advance(10000);assert.equal(writes(env).length,1);assert.equal(env.records[0].rows[0].cedula,'777');env.unmount();
});

test('fecha base desconocida permanece null al autoguardar un corte antiguo',async()=>{
 const env=environment();env.records[0].ageReferenceDate=null;await openStored(env);edit(env);await env.advance(1000);assert.equal(writes(env).length,1);const payload=JSON.parse(writes(env)[0].body);assert.equal(payload.ageReferenceDate,null);assert.ok(payload.rows.every(row=>row.loanAgeDays===50));env.unmount();
});

test('sin espacio local y sin respuesta del servidor muestra que no hay respaldo confirmado',async()=>{
 const storage=new MemoryStorage();storage.failWrites=true;const env=environment({storage,saveError:true});await openStored(env);edit(env);await env.advance(1000);
 assert.ok(env.text().includes('No se pudo crear respaldo en este equipo'));assert.ok(env.text().includes('Mantén abierta esta página'));assert.match(env.text(),/Sin conexión|sin respuesta del servidor/);assert.ok(!env.all().some(n=>n.props?.role==='status'&&env.text(n)==='Guardado'));assert.equal(cedulaField(env).props.value,'000987654321');env.unmount();
});

test('avisa al salir solo mientras quedan cambios sin confirmar',async()=>{
 const env=environment();await openStored(env);let warnings=0;env.dispatch('beforeunload',{preventDefault(){warnings++}});assert.equal(warnings,0);edit(env);env.dispatch('beforeunload',{preventDefault(){warnings++}});assert.equal(warnings,1);
 await env.advance(1000);env.dispatch('beforeunload',{preventDefault(){warnings++}});assert.equal(warnings,1);env.unmount();
});

test('medianoche de Colombia aumenta la edad mostrada sin guardar ni cambiar el resultado manual',async()=>{
 const env=environment({clock:fakeClock(Date.parse('2026-10-28T04:59:30Z'))});env.records[0].ageReferenceDate='2026-10-27';await openStored(env);
 const ageCell=()=>env.all(env.one(n=>n.type==='tr'&&env.text(n).includes('QA000001'))).filter(n=>n.type==='td')[3];
 const status=()=>env.one(n=>n.type==='select'&&n.props['aria-label']==='Resultado de QA000001').props.value;
 assert.equal(env.text(ageCell()),'50');const initialStatus=status();await env.advance(60000);assert.equal(env.text(ageCell()),'51');assert.equal(status(),initialStatus);assert.equal(writes(env).length,0);assert.equal(processing(env).length,0);assert.ok(env.records[0].rows.every(row=>row.loanAgeDays===50));env.unmount();
});

test('editar la fecha no cambia edad ni guarda hasta pulsar Aplicar fecha y confirmar una vez',async()=>{
 const env=environment();await openStored(env);const date=()=>env.one(n=>n.type==='input'&&n.props.type==='date');
 const age=()=>env.text(env.all(env.one(n=>n.type==='tr'&&env.text(n).includes('QA000001'))).filter(n=>n.type==='td')[3]);
 date().props.onChange({target:{value:'2026-10-27'}});env.render();date().props.onBlur?.({target:{value:'2026-10-27'}});await env.settle();await env.advance(2000);
 assert.equal(writes(env).length,0);assert.equal(age(),'50');assert.equal(env.controls.confirmations.length,0);assert.equal(env.button('Aplicar fecha').props.disabled,false);
 env.button('Aplicar fecha').props.onClick();await env.settle();assert.equal(env.controls.confirmations.length,1);assert.equal(age(),'51');await env.advance(999);assert.equal(writes(env).length,0);await env.advance(1);
 const payload=JSON.parse(writes(env)[0].body);assert.equal(payload.ageReferenceDate,'2026-10-27');assert.ok(payload.rows.every(row=>row.loanAgeDays===50));assert.deepEqual(payload.rows.map(row=>row.status),env.data.rows.map(row=>row.status));assert.equal(processing(env).length,0);env.unmount();
});

test('cancelar Aplicar fecha conserva la base original y las ediciones posteriores usan esa base',async()=>{
 const env=environment();await openStored(env);env.one(n=>n.type==='input'&&n.props.type==='date').props.onChange({target:{value:'2026-10-27'}});env.render();env.controls.confirm=false;
 env.button('Aplicar fecha').props.onClick();await env.settle();await env.advance(2000);assert.equal(writes(env).length,0);assert.equal(env.controls.confirmations.length,1);
 edit(env);await env.advance(1000);assert.equal(JSON.parse(writes(env)[0].body).ageReferenceDate,'2026-10-28');assert.ok(env.records[0].rows.every(row=>row.loanAgeDays===50));env.unmount();
});

test('fecha pendiente no se incorpora al autoguardado de otras correcciones',async()=>{
 const env=environment();await openStored(env);env.one(n=>n.type==='input'&&n.props.type==='date').props.onChange({target:{value:'2026-10-27'}});env.render();edit(env);await env.advance(1000);
 assert.equal(JSON.parse(writes(env)[0].body).ageReferenceDate,'2026-10-28');assert.equal(env.one(n=>n.type==='input'&&n.props.type==='date').props.value,'2026-10-27');assert.equal(env.controls.confirmations.length,0);env.unmount();
});
