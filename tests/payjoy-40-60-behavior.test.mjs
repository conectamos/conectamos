import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source=readFileSync(new URL('../app/dashboard/payjoy/_components/payjoy-40-60-workspace.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const rows=()=>Array.from({length:32},(_,i)=>({id:'row-'+i,week:'2026-10-19',merchantName:'Comercio QA',deviceTag:'QA'+String(i+1).padStart(6,'0'),loanAgeDays:50,numberOfPayments:4,loanRepaymentBiweek:125000,cedula:i%4?'1000000000':'',status:i%3?'40/60 APROBADO':'40/60 NO APROBADO',pay40At60:i%3?1:0,paidInFull:false}));
const summary=items=>items.reduce((s,r)=>{s[r.status==='40/60 APROBADO'?'aprobados':'noAprobados']++;s[r.cedula?'cedulasEncontradas':'cedulasPendientes']++;return s},{aprobados:0,noAprobados:0,cedulasEncontradas:0,cedulasPendientes:0});
function environment({auditor=false,saveError=false,holdSave=false}={}){
 let slots=[],cursor=0,tree,changed=false,gateResolve;
 const effects=[],requests=[];
 const data={ok:true,fileName:'archivo-qa.xlsx',sheetName:'Transacciones',week:'2026-10-19',totalRows:64,filteredRows:32,summary:summary(rows()),rows:rows()};
 const records=Array.from({length:8},(_,i)=>({...data,id:101+i,recordName:'SEMANA QA '+(i+1),savedByName:'Usuario QA',savedByUser:'qa',savedAt:'2026-10-23T15:00:00Z',updatedAt:'2026-10-23T15:00:00Z'}));
 const gate=holdSave?new Promise(resolve=>{gateResolve=resolve}):Promise.resolve();
 const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(!Object.is(next,slots[i])){slots[i]=next;changed=true}}]},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useMemo(callback){return callback()},
  useEffect(callback,deps){const i=cursor++;const previous=slots[i];if(!previous||deps.some((d,j)=>!Object.is(d,previous[j]))){slots[i]=deps;effects.push(callback)}}
 };
 const jsx=(type,props,key)=>({type,props:props||{},key});
 async function fetchMock(url,options={}){const method=options.method||'GET';const request={url,method,body:options.body};requests.push(request);const response=(payload,ok=true)=>({ok,json:async()=>structuredClone(payload)});
  if(url.endsWith('/weeks'))return response({ok:true,fileName:data.fileName,sheetName:data.sheetName,weeks:['2026-10-19','2026-10-12']});
  if(url==='/api/payjoy/40-60')return response(data);
  if(method==='GET'&&url.includes('?id='))return response({ok:true,registro:records.find(r=>r.id===Number(url.split('=')[1]))});
  if(method==='GET')return response({ok:true,registros:records});
  if(method==='POST'||method==='PATCH'){await gate;if(saveError)return response({error:'Error de guardado de prueba'},false);const payload=JSON.parse(options.body);return response({ok:true,registro:{...records[0],...payload,id:method==='POST'?1001:payload.id},mensaje:'Guardado confirmado por servidor QA'})}
  return response({ok:true});
 }
 const mod={exports:{}};
 const req=name=>{
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
  if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='next/image')return{__esModule:true,default:'img'};
  if(name.endsWith('.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name.includes('sales-dashboard-parts'))return{SalesProfile:'profile'};
  if(name.includes('dashboard-icon'))return{__esModule:true,default:'icon'};
  throw Error('Import de prueba inesperado: '+name);
 };
 new Function('require','module','exports','fetch','window',compiled)(req,mod,mod.exports,fetchMock,{confirm:()=>true});
 const Page=mod.exports.default;
 function render(){cursor=0;changed=false;tree=Page({puedeEliminar:!auditor,user:{nombre:'Usuario QA',usuario:'qa',rolNombre:auditor?'AUDITOR':'ADMIN',sedeNombre:'SEDE QA'}});while(effects.length)effects.shift()();return tree}
 function all(node=tree,list=[]){if(node==null||typeof node==='boolean')return list;if(Array.isArray(node)){node.forEach(n=>all(n,list));return list}if(typeof node==='object'){list.push(node);if(node.props?.children!==undefined)all(node.props.children,list)}return list}
 function text(node=tree){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(n=>text(n)).join('');if(typeof node==='object')return node.props?.children===undefined?'':text(node.props.children);return String(node)}
 function one(predicate){const found=all().find(predicate);assert.ok(found,'No se encontró nodo. Vista: '+text());return found}
 function button(name){return one(n=>n.type==='button'&&text(n)===name)}
 async function settle(){for(let i=0;i<20;i++){await Promise.resolve();if(changed)render()}return tree}
 render();
 return{requests,render,settle,all,text,one,button,releaseSave:()=>gateResolve?.(),data};
}
async function uploadAndProcess(env){await env.settle();const input=env.one(n=>n.type==='input'&&n.props.type==='file');input.props.onChange({target:{files:[new File(['qa'],'archivo-qa.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})]}});await env.settle();const week=env.one(n=>n.type==='select'&&!n.props['aria-label']);week.props.onChange({target:{value:'2026-10-19'}});env.render();env.button('Procesar').props.onClick();await env.settle()}

test('el historial empieza cerrado y muestra las ocho semanas sin requerir procesamiento',async()=>{
 const env=environment();await env.settle();assert.equal(env.button('Ver historial').props['aria-expanded'],false);assert.ok(!env.text().includes('SEMANA QA 8'));env.button('Ver historial').props.onClick();env.render();assert.ok(env.text().includes('SEMANA QA 8'));assert.equal(env.requests.filter(r=>r.url==='/api/payjoy/40-60').length,0);assert.equal(env.requests.filter(r=>r.method!=='GET').length,0);
});
test('abrir y cerrar el historial conserva la carga seleccionada y la WEEK',async()=>{
 const env=environment();await uploadAndProcess(env);const before=env.text();env.button('Ver historial').props.onClick();env.render();env.button('Ocultar historial').props.onClick();env.render();assert.ok(env.text().includes('archivo-qa.xlsx'));assert.ok(env.text().includes('32 filas listas para guardar'));assert.equal(env.one(n=>n.type==='select'&&!n.props['aria-label']).props.value,'2026-10-19');assert.equal(env.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/registros')).length,0);assert.ok(before.includes('Registros procesados'));
});
test('guardar incluye todas las filas y sus ediciones aunque se filtre y pagine',async()=>{
 const env=environment();await uploadAndProcess(env);assert.equal(env.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/registros')).length,0);env.button('Siguiente').props.onClick();env.render();env.one(n=>n.type==='input'&&n.props['aria-label']==='Cédula de QA000026').props.onChange({target:{value:'000123456789'}});env.render();env.one(n=>n.type==='select'&&n.props['aria-label']==='Resultado de QA000026').props.onChange({target:{value:'40/60 NO APROBADO'}});env.render();env.button('Aprobados').props.onClick();env.render();await env.settle();env.button('Guardar semana').props.onClick();await env.settle();const request=env.requests.find(r=>r.method==='POST'&&r.url.endsWith('/registros'));assert.ok(request);const payload=JSON.parse(request.body);assert.equal(payload.rows.length,32);assert.equal(payload.filteredRows,32);assert.equal(payload.rows[25].cedula,'000123456789');assert.equal(payload.rows[25].status,'40/60 NO APROBADO');assert.deepEqual(payload.summary,summary(payload.rows));assert.ok(env.text().includes('Guardado confirmado por servidor QA'));
});
test('dos clics inmediatos en guardar producen un solo envío y muestran procesamiento',async()=>{
 const env=environment({holdSave:true});await uploadAndProcess(env);const guardar=env.button('Guardar semana');guardar.props.onClick();guardar.props.onClick();env.render();assert.equal(env.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/registros')).length,1);assert.ok(env.text().includes('Guardando…'));assert.equal(env.button('Guardando…').props.disabled,true);env.releaseSave();await env.settle();assert.ok(env.text().includes('Guardado confirmado por servidor QA'));
});
test('el error del servidor conserva el nombre, las filas y la cédula sin afirmar éxito',async()=>{
 const env=environment({saveError:true});await uploadAndProcess(env);env.one(n=>n.type==='input'&&n.props.placeholder==='Ej.: 40/60 - Semana 02').props.onChange({target:{value:'Semana personalizada QA'}});env.render();env.one(n=>n.type==='input'&&n.props['aria-label']==='Cédula de QA000001').props.onChange({target:{value:'000987654321'}});env.render();env.button('Guardar semana').props.onClick();await env.settle();assert.ok(env.text().includes('Error de guardado de prueba'));assert.equal(env.one(n=>n.type==='input'&&n.props.placeholder==='Ej.: 40/60 - Semana 02').props.value,'Semana personalizada QA');assert.equal(env.one(n=>n.type==='input'&&n.props['aria-label']==='Cédula de QA000001').props.value,'000987654321');assert.ok(env.text().includes('32 filas listas para guardar'));assert.ok(!env.text().includes('Guardado confirmado'));
});
test('AUDITOR consulta todas las semanas y sus resultados sin ofrecer borrado',async()=>{
 const env=environment({auditor:true});await env.settle();env.button('Ver historial').props.onClick();env.render();assert.equal(env.all().filter(n=>n.type==='button'&&String(n.props['aria-label']||'').startsWith('Eliminar ')).length,0);const consultar=env.all().filter(n=>n.type==='button'&&env.text(n)==='Consultar');assert.equal(consultar.length,8);consultar[7].props.onClick();await env.settle();assert.ok(env.text().includes('32 filas listas para guardar'));assert.equal(env.one(n=>n.type==='input'&&n.props.placeholder==='Ej.: 40/60 - Semana 02').props.value,'SEMANA QA 8');
});



test('actualizar un guardado con archivo nuevo reprocesa sin interbloqueo y libera el bloqueo al terminar',async()=>{
 const env=environment();await env.settle();env.button('Ver historial').props.onClick();env.render();env.all().find(n=>n.type==='button'&&env.text(n)==='Consultar').props.onClick();await env.settle();env.one(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[new File(['otro'],'archivo-nuevo-qa.xlsx')]}});await env.settle();const update=env.button('Actualizar guardado');update.props.onClick();update.props.onClick();await env.settle();const patches=env.requests.filter(r=>r.method==='PATCH');assert.equal(patches.length,1);const payload=JSON.parse(patches[0].body);assert.equal(payload.id,101);assert.equal(payload.rows.length,32);assert.equal(env.requests.filter(r=>r.url==='/api/payjoy/40-60').length,1);assert.ok(env.text().includes('usando el archivo nuevo'));env.button('Actualizar guardado').props.onClick();await env.settle();assert.equal(env.requests.filter(r=>r.method==='PATCH').length,2);assert.equal(env.requests.filter(r=>r.url==='/api/payjoy/40-60').length,1);
});
