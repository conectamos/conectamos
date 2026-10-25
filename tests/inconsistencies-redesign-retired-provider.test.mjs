import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url), jsx = require("react/jsx-runtime");
const PAGE = "app/vendedor/registros/inconsistencias/workspace.tsx";
const source = path => readFileSync(join(ROOT,path),"utf8");
const compile = code => ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const css = {__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})};
function flatten(node){if(!node||typeof node!=="object")return [];if(Array.isArray(node))return node.flatMap(flatten);return [node,...flatten(node.props?.children)];}
function content(node){if(node==null||typeof node==="boolean")return "";if(Array.isArray(node))return node.map(content).join(" ");return typeof node==="object"?content(node.props?.children):String(node);}
const text = node => content(node).replace(/\s+/g," ").trim();
function resolve(node){if(!node||typeof node!=="object")return node;if(Array.isArray(node))return node.map(resolve);if(typeof node.type==="function")return resolve(node.type(node.props));return {...node,props:{...node.props,children:resolve(node.props?.children)}};}
const nodes = (tree,type)=>flatten(tree).filter(node=>node.type===type);
const button = (tree,label)=>nodes(tree,"button").find(node=>text(node)===label||node.props["aria-label"]===label);
const admin = {nombre:"Administradora de prueba",sedeNombre:"SEDE 6",rolNombre:"ADMIN",perfilNombre:"Administradora QA",perfilTipoLabel:"ADMIN"};
const result = index => ({registroId:9000+index,createdAt:"2026-10-24T15:00:00.000Z",clienteNombre:`Cliente de prueba ${index}`,documentoNumero:"00123456789",serialImei:"001234567890123",puntoVenta:"SEDE 6",asesorNombre:"Asesor QA",proveedor:"SUMASPAY",identificadorTipo:"CEDULA",plataformaCredito:"SUMASPAY",creditoRegistrado:1715000.25,creditoPlataforma:1450000.5,fechaCreditoPlataforma:"2026-10-24",ordenId:"000123-REFERENCIA-DE-ORDEN-LARGA-SIN-RECORTAR",estado:index%3===0?"COINCIDE":"INCONSISTENTE",razones:["El valor autorizado no coincide."]});
const report = () => ({modo:"RANGO",desde:"2026-10-01",hasta:"2026-10-24",proveedores:["PAYJOY","SUMASPAY","ADDI"],limitado:false,maxRegistros:0,resumen:{registrosAnalizados:23,creditosAnalizados:23,coincidencias:8,inconsistencias:15,revisar:0,sinVerificar:0,revisados:0},resultados:Array.from({length:23},(_,index)=>result(index))});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function probe({initial={},session=admin,respond}={}){
 const ast=ts.createSourceFile(PAGE,source(PAGE),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),component=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==="InconsistenciasCreditosWorkspace");
 const states=component.body.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[]).filter(node=>ts.isArrayBindingPattern(node.name)&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(ast)==="useState").map(node=>node.name.elements[0].name.getText(ast));
 const state={...initial},refs=[],calls=[];let cursor=0,refCursor=0;
 const hooks={useState(value){const name=states[cursor++];assert.ok(name);if(!(name in state))state[name]=typeof value==="function"?value():value;return [state[name],next=>{state[name]=typeof next==="function"?next(state[name]):next;}];},useMemo:callback=>callback(),useRef(value){return refs[refCursor++]??=( {current:value});},useEffect(){}};
 const loaded={exports:{}};
 const imports={react:hooks,"react/jsx-runtime":jsx,"next/link":{__esModule:true,default:({children,...props})=>jsx.jsx("a",{...props,children})},"next/image":{__esModule:true,default:props=>jsx.jsx("img",props)},"@/app/dashboard/_components/dashboard-icon":{__esModule:true,default:()=>null},"@/app/ventas/_components/sales-dashboard-parts":{SalesProfile:props=>jsx.jsxs("div",{children:[props.name," ",props.role,jsx.jsx("button",{children:"Cerrar sesión"})]})},"./inconsistencies.module.css":css};
 new Function("require","module","exports","fetch",compile(source(PAGE)))(name=>{assert.ok(name in imports,`Import inesperado ${name}`);return imports[name];},loaded,loaded.exports,async(url,options={})=>{calls.push({url,options});const value=respond?await respond(url,options):{ok:true,data:{resultados:[],paginacion:{snapshot:"2026-10-24T16:00:00Z",cursorSiguiente:null}}};return value instanceof Response?value:{ok:value.ok,json:async()=>value.data};});
 return {state,calls,render(){cursor=refCursor=0;return resolve(loaded.exports.default({fechaHoy:"2026-10-24",mesActual:"2026-10",session}));}};
}
function apiProbe(path,{session={perfilTipo:"ADMINISTRADOR",rolNombre:"ADMIN",perfilId:7},configured=true,records=null}={}){
 const calls=[],loaded={exports:{}};
 const prisma = records ? {registroVendedorVenta:{findMany:async()=>records},revisionInconsistenciaCredito:{findMany:async()=>[]}} : new Proxy({},{get:()=>{throw Error("No se debe consultar la base de datos para ESMIO retirado");}});
 class LookupError extends Error{}
 const provider=(prefix)=>({[`is${prefix}ConsultaConfigured`]:()=>configured,[`obtenerCredito${prefix==='Sumas'?'SumasPay':prefix==='Alo'?'AloParaRegistro':prefix}PorCedula`]:async()=>null});
 const lookup=financial=>async documento=>{calls.push({financial,documento});return {documento,financiera:financial,creditoAutorizado:1200000};};
 const dates={getTodayBogotaDateKey:()=>"2026-10-24",getBogotaDateKey:date=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota"}).format(date),getBogotaDayRangeFromInput:day=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;const start=new Date(`${day}T05:00:00.000Z`);return {start,end:new Date(start.getTime()+86400000)};},getBogotaMonthRangeFromInput:()=>null};
 const imports={"next/server":{NextResponse:{json:(data,options)=>Response.json(data,options)}},"@/lib/auth":{getSessionUser:async()=>session},"@/lib/access-control":{puedeAccederPanelVendedor:()=>true,esPerfilRegistroVenta:tipo=>tipo==="VENDEDOR",esRolAdministrativo:role=>["ADMIN","AUDITOR"].includes(role),esPerfilAdministrativo:tipo=>tipo==="ADMINISTRADOR"},"@/lib/vendor-profile-schema":{ensureVendorProfilesSchema:async()=>{}},"@/lib/prisma":{__esModule:true,default:prisma},"@/lib/ventas-utils":dates,"@/lib/credit-date-utils":{normalizeDateKey:()=>null,shiftDateKey:()=>"2026-10-23"},"@/lib/payjoy-retail":{isPayJoyRetailConfigured:()=>true},"@/lib/finserpayconsulta":{isFinserpayConsultaConfigured:()=>true},"@/lib/sumasconsulta":{...provider("Sumas"),SumasConsultaConfigError:LookupError,SumasConsultaLookupError:LookupError,obtenerCreditoSumasPayPorCedula:lookup("SUMASPAY")},"@/lib/addiconsulta":{...provider("Addi"),AddiConsultaConfigError:LookupError,AddiConsultaLookupError:LookupError,obtenerCreditoAddiPorCedula:lookup("ADDI")},"@/lib/aloconsulta":{...provider("Alo"),AloConsultaConfigError:LookupError,AloConsultaLookupError:LookupError,obtenerCreditoAloParaRegistro:lookup("ALO CREDIT")}};
 new Function("require","module","exports","console",compile(source(path)))(name=>{assert.ok(name in imports,`Import activo no permitido: ${name}`);return imports[name];},loaded,loaded.exports,{error(){},info(){}});
 return {calls,get:query=>loaded.exports.GET(new Request(`http://qa.local/api?${query}`)),post:body=>loaded.exports.POST(new Request("http://qa.local/api",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}))};
}

test("la consulta activa por cédula usa solo SUMASPAY, ADDI y ALO, conservando los resultados",async()=>{
 const p=apiProbe("app/api/vendedor/registros/creditos-financieras/route.ts"),response=await p.get("documento=00123456789"),data=await response.json();assert.equal(response.status,200);assert.deepEqual(p.calls.map(item=>item.financial),["SUMASPAY","ADDI","ALO CREDIT"]);assert.deepEqual(data.creditos.map(item=>item.financiera),["SUMASPAY","ADDI","ALO CREDIT"]);assert.ok(p.calls.every(item=>item.documento==="00123456789"));
});
test("el retiro no convierte credenciales ausentes en consultas a ESMIO",async()=>{const p=apiProbe("app/api/vendedor/registros/creditos-financieras/route.ts",{configured:false}),response=await p.get("documento=123456"),data=await response.json();assert.equal(response.status,503);assert.deepEqual(p.calls,[]);assert.doesNotMatch(data.error,/ESMIO/i);});
test("la API de inconsistencias rechaza el proveedor retirado en rango y revisión manual sin consultar DB ni red",async()=>{const p=apiProbe("app/api/vendedor/registros/inconsistencias/route.ts");for(const proveedor of ["ESMIO","ESMIOPCION","ESMIOPCIÓN"]){assert.equal((await p.get(`desde=2026-10-01&hasta=2026-10-24&proveedor=${encodeURIComponent(proveedor)}`)).status,400);assert.equal((await p.post({registroId:123,proveedor})).status,400);}assert.deepEqual(p.calls,[]);});
test("el informe legado conserva registros ESMIO sin consultarlos ni modificar sus datos",async()=>{
 const record={id:12,createdAt:new Date("2026-10-24T12:00:00Z"),clienteNombre:"Cliente histórico",documentoNumero:"00123456789",serialImei:"001234567890123",puntoVenta:"SEDE 6",asesorNombre:"Asesor QA",plataformaCredito:"ESMIOPCIÓN",creditoAutorizado:1250000,cuotaInicial:0,valorCuota:100000,numeroCuotas:12,frecuenciaCuota:"MENSUAL",financierasDetalle:[]};
 const before=JSON.stringify(record),p=apiProbe("app/api/vendedor/registros/inconsistencias/route.ts",{records:[record]}),response=await p.get("fecha=2026-10-24"),data=await response.json();
 assert.equal(response.status,200);assert.deepEqual(data.resultados,[]);assert.deepEqual(p.calls,[]);assert.equal(JSON.stringify(record),before);
});
test("las APIs mantienen la exigencia de sesión antes de consultar",async()=>{for(const path of ["app/api/vendedor/registros/inconsistencias/route.ts","app/api/vendedor/registros/creditos-financieras/route.ts"]){const p=apiProbe(path,{session:null});assert.equal((await p.get("documento=123456&desde=2026-10-01&hasta=2026-10-24&proveedor=PAYJOY")).status,401);assert.deepEqual(p.calls,[]);}});
test("ESMIO no activa autocompletar y sus aliases históricos permanecen intactos",()=>{const s=source("app/vendedor/registros/workspace.tsx"),ast=ts.createSourceFile("registration.tsx",s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==="esPlataformaConsultaCedula");assert.doesNotMatch(fn.getText(ast),/esPlataformaEsmio/);assert.ok(source("lib/ventas-financieras.ts").includes('aliases: ["ESMIO", "ESMIOPCION", "ESMIOPCIÓN"]'));assert.match(source("lib/cierre-domain.ts"),/ESMIOPCION: "ESMIO"/);});
test("la navegación superior conserva módulos y permisos y solo ofrece tres financieras activas",()=>{for(const role of ["ADMIN","AUDITOR","SEDE"]){const p=probe({session:{...admin,rolNombre:role}}),tree=p.render(),links=nodes(tree,"a");assert.ok(!nodes(tree,"aside").length);assert.ok(links.some(item=>item.props.href==="/ventas"&&item.props["aria-current"]==="page"));for(const href of ["/dashboard","/ventas","/inventario","/prestamos","/caja","/cierre","/dashboard/aprobaciones","/vendedor/registros"])assert.ok(links.some(item=>item.props.href===href));assert.equal(links.some(item=>item.props.href==="/dashboard/sedes"),role!=="SEDE");const checks=nodes(tree,"input").filter(item=>item.props.type==="checkbox");assert.equal(checks.length,3);assert.doesNotMatch(text(tree),/ESMIO/);assert.ok(button(tree,"Cerrar sesión"));}});
test("el análisis recorre todos los bloques de las tres financieras con una misma referencia temporal",async()=>{const p=probe({respond:async url=>{const params=new URL(url,"http://qa.local").searchParams,cursor=Number(params.get("cursor"));return {ok:true,data:{resultados:[{...result(p.calls.length),proveedor:params.get("proveedor")}],paginacion:{snapshot:"2026-10-24T16:00:00Z",cursorSiguiente:cursor===0?2:null}}};}});button(p.render(),"Analizar créditos").props.onClick();for(let i=0;i<50;i++)await Promise.resolve();assert.equal(p.calls.length,6);assert.deepEqual(p.calls.map(item=>new URL(item.url,"http://qa.local").searchParams.get("proveedor")),["PAYJOY","PAYJOY","SUMASPAY","SUMASPAY","ADDI","ADDI"]);assert.ok(p.calls.slice(1).every(item=>new URL(item.url,"http://qa.local").searchParams.get("snapshot")==="2026-10-24T16:00:00Z"));assert.equal(p.state.reporte.resultados.length,6);});
test("el bloqueo síncrono evita repetir consultas con doble clic y conserva entradas en error",async()=>{const pending=deferred(),p=probe({respond:()=>pending.promise});const action=button(p.render(),"Analizar créditos").props.onClick;action();action();assert.equal(p.calls.length,1);pending.resolve({ok:false,data:{error:"Fallo de prueba"}});for(let i=0;i<15;i++)await Promise.resolve();assert.equal(p.state.error,"Fallo de prueba");assert.equal(p.state.mes,"2026-10");assert.deepEqual(p.state.proveedoresSeleccionados,["PAYJOY","SUMASPAY","ADDI"]);assert.equal(p.state.cargando,false);});
test("el listado pagina a diez sin perder IMEI, cédula, órdenes ni importes completos",()=>{const p=probe({initial:{reporte:report(),filtro:"TODOS"}});let tree=p.render();assert.equal(nodes(tree,"tbody")[0].props.children.length,10);assert.ok(text(tree).includes("001234567890123"));assert.ok(text(tree).includes("00123456789"));assert.ok(text(tree).includes("000123-REFERENCIA-DE-ORDEN-LARGA-SIN-RECORTAR"));assert.ok(text(tree).includes("$ 1.715.000,25"));button(tree,"Página 3").props.onClick();tree=p.render();assert.equal(nodes(tree,"tbody")[0].props.children.length,3);assert.match(text(tree),/#\s*9022/);});
test("el filtro se aplica sobre todo el informe y vuelve a la primera página",()=>{const p=probe({initial:{reporte:report(),filtro:"TODOS",pagina:3}}),tree=p.render();const filter=nodes(tree,"select").find(item=>item.props.value==="TODOS");filter.props.onChange({target:{value:"INCONSISTENTE"}});const next=p.render();assert.equal(p.state.pagina,1);assert.equal(nodes(next,"tbody")[0].props.children.length,10);assert.ok(text(next).includes("15 resultados"));});
test("marcar revisado se guarda una sola vez, actualiza resumen y conserva enlaces actuales",async()=>{const pending=deferred(),r=report(),p=probe({initial:{reporte:r,filtro:"TODOS"},respond:()=>pending.promise});let tree=p.render();const label=`Marcar como revisada la alerta de SUMASPAY del registro 9001`,action=button(tree,label).props.onClick;action();action();assert.equal(p.calls.length,1);assert.deepEqual(JSON.parse(p.calls[0].options.body),{registroId:9001,proveedor:"SUMASPAY"});pending.resolve({ok:true,data:{revision:{revisadoPor:"Supervisora QA"}}});for(let i=0;i<20;i++)await Promise.resolve();tree=p.render();assert.equal(p.state.reporte.resultados[1].estado,"REVISADO");assert.equal(p.state.reporte.resumen.revisados,1);assert.equal(p.state.reporte.resumen.inconsistencias,14);assert.ok(nodes(tree,"a").some(item=>item.props.href==="/vendedor/registros?editar=9001"));});
test("fallar al marcar revisado no cambia importes, estado ni contadores",async()=>{const p=probe({initial:{reporte:report(),filtro:"TODOS"},respond:async()=>({ok:false,data:{error:"No se guardó"}})}),action=button(p.render(),"Marcar como revisada la alerta de SUMASPAY del registro 9001");await action.props.onClick();for(let i=0;i<12;i++)await Promise.resolve();assert.equal(p.state.reporte.resultados[1].estado,"INCONSISTENTE");assert.equal(p.state.reporte.resumen.revisados,0);assert.equal(p.state.error,"No se guardó");});

test("una respuesta malformada muestra un error claro sin informe ni ceros falsos y conserva los filtros",async()=>{
 const validPage={snapshot:"2026-10-24T16:00:00Z",cursorSiguiente:null};
 const invalid=[
  {resultados:{unexpected:"No es un listado"},paginacion:validPage},
  {resultados:[]},
  {resultados:[],paginacion:{snapshot:123,cursorSiguiente:null}},
  {resultados:[],paginacion:{snapshot:validPage.snapshot,cursorSiguiente:-1}},
  {resultados:[],paginacion:{snapshot:validPage.snapshot,cursorSiguiente:1.5}},
  {resultados:[],paginacion:{snapshot:validPage.snapshot}},
 ];
 for(const data of invalid){
  const p=probe({initial:{tipoPeriodo:"RANGO",fechaDesde:"2026-10-03",fechaHasta:"2026-10-20",proveedoresSeleccionados:["ADDI"]},respond:async()=>({ok:true,data})});
  button(p.render(),"Analizar créditos").props.onClick();
  for(let index=0;index<20;index++)await Promise.resolve();
  const tree=p.render();
  assert.equal(p.state.reporte,null);assert.equal(p.state.cargando,false);assert.equal(p.calls.length,1);
  assert.equal(p.state.error,"La financiera devolvió una respuesta incompleta. Intenta consultar nuevamente.");
  assert.doesNotMatch(p.state.error,/TypeError|Cannot read|undefined/);
  assert.equal(p.state.tipoPeriodo,"RANGO");assert.equal(p.state.fechaDesde,"2026-10-03");assert.equal(p.state.fechaHasta,"2026-10-20");assert.deepEqual(p.state.proveedoresSeleccionados,["ADDI"]);
  assert.equal(nodes(tree,"article").filter(item=>text(item).includes("—")).length,6);
 }
});
