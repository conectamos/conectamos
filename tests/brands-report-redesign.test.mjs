import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
function loadComponent(relative){
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file).exports;
  if(file.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  const mod={exports:{}};cache.set(file,mod);
  const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  function required(name){
   if(name==='react')return React;
   if(name==='react/jsx-runtime')return jsxRuntime;
   if(name==='next/link')return {__esModule:true,default:({href,children,...props})=>{for(const key of ['prefetch','replace','scroll'])delete props[key];return React.createElement('a',{href,...props},children)}};
   if(name==='next/image')return {__esModule:true,default:props=>React.createElement('img',Object.fromEntries(Object.entries(props).filter(([key])=>!['priority','fill','quality','sizes','unoptimized'].includes(key))))};
   if(name==='next/navigation')return {useRouter:()=>({push(){},replace(){},refresh(){}}),usePathname:()=>'/dashboard/top-marcas-vendidas'};
   if(name==='@/app/ventas/_components/sales-dashboard-parts')return {SalesProfile:({name,role})=>React.createElement('div',{'data-testid':'profile'},name+' · '+role)};
   let target=name.startsWith('@/')?path.join(root,name.slice(2)):name.startsWith('.')?path.resolve(path.dirname(file),name):null;
   assert.ok(target,'Dependencia no esperada: '+name);
   if(!existsSync(target))target=['.tsx','.ts','.js'].map(ext=>target+ext).find(existsSync);
   assert.ok(target,'Archivo no encontrado: '+name);return load(target);
  }
  new Function('require','module','exports',source)(required,mod,mod.exports);return mod.exports;
 }
 return load(path.join(root,relative));
}
const jsxRuntime=await import('react/jsx-runtime');
const Report=loadComponent('app/dashboard/top-marcas-vendidas/brands-report.tsx').default;
const props={usuario:{nombre:'Auditora QA',rolNombre:'AUDITOR'},consulta:{period:'2026-09',periodLabel:'septiembre de 2026',sedeId:'7',cobertura:'SEDE QA 7'},sedes:[{id:7,nombre:'SEDE QA 7'}],ventas:137,marcas:[{nombre:'MARCA QA',total:137,porcentaje:100}],referencias:Array.from({length:14},(_,i)=>({nombre:'REFERENCIA QA '+String(i+1).padStart(2,'0'),total:14-i,porcentaje:(14-i)/137*100})),detalles:{'MARCA QA':[{sedeId:7,nombre:'SEDE QA 7',total:137,porcentaje:100}]}};

test('el reporte muestra el corte y la cobertura recibidos sin sustituirlos por cifras del diseño',()=>{
 const html=renderToStaticMarkup(React.createElement(Report,props));
 assert.match(html,/137/);
 assert.match(html,/MARCA QA/);
 assert.match(html,/REFERENCIA QA 01/);
 assert.match(html,/Referencias vendidas/);
 assert.match(html,/SEDE QA 7/);
 assert.match(html,/value="2026-09"/);
 assert.match(html,/<option value="7" selected="">/);
 assert.match(html,/AUDITOR/);
 assert.doesNotMatch(html,/1\.201/);
});
test('el resumen sin ventas y las dos tablas vacías conservan estados legibles',()=>{
 const html=renderToStaticMarkup(React.createElement(Report,{...props,ventas:0,marcas:[],referencias:[],detalles:{}}));
 assert.match(html,/Sin ventas/);
 assert.match(html,/No hay marcas registradas/);
 assert.match(html,/No hay referencias registradas/);
 assert.match(html,/disabled=""/);
});
test('el top inicial conserva diez referencias y mantiene disponible la búsqueda y el ranking completo',()=>{
 const html=renderToStaticMarkup(React.createElement(Report,props));
 assert.match(html,/REFERENCIA QA 10/);
 assert.doesNotMatch(html,/REFERENCIA QA 11/);
 assert.match(html,/Buscar marca o referencia/);
 assert.match(html,/Ver ranking completo/);
 assert.match(html,/aria-expanded="false"/);
});
test('textos extensos se renderizan completos y el contenido de datos permanece escapado',()=>{
 const long='REFERENCIA DE PRUEBA CON NOMBRE COMPLETO MUY EXTENSO <script>sin ejecutar</script>';
 const html=renderToStaticMarkup(React.createElement(Report,{...props,marcas:[{nombre:'MARCA & QA',total:137,porcentaje:100}],referencias:[{nombre:long,total:137,porcentaje:100}]}));
 assert.match(html,/REFERENCIA DE PRUEBA CON NOMBRE COMPLETO MUY EXTENSO &lt;script&gt;sin ejecutar&lt;\/script&gt;/);
 assert.match(html,/MARCA &amp; QA/);
 assert.doesNotMatch(html,/<script>sin ejecutar<\/script>/);
});


