import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function transpile(relative) {
  return ts.transpileModule(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
}
const code = transpile("app/pago-facturas/workspace.tsx");
const jsx = (type, props, key) => ({ type, props: props || {}, key });
function nodes(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === "function") return [node, ...nodes(node.type(node.props))];
  return [node, ...nodes(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return typeof node.type === "function" ? textOf(node.type(node.props)) : textOf(node.props?.children);
}
const money = (amount) => `${amount < 0 ? "-" : ""}$ ${Math.abs(amount).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
const invoice = (id, extra = {}) => ({ id, providerId: id, number: `FAC-${id}`, provider: `Proveedor ${id}`, date: "2026-11-01", dueDate: null, dueStatus: "SIN_FECHA", deletedAt: null, amount: 1000, paidAmount: 0, balance: 1000, status: "PENDIENTE", paymentCount: 0, version: 1, payments: [], ...extra });
const result = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });

function harness({ invoices = [invoice(1)], providers: seededProviders, postOutcomes = [], delayLists = false, listFailures = 0, providerFailures = 0 } = {}) {
  const data = structuredClone(invoices);
  const providers = structuredClone(seededProviders || [...new Map(invoices.map(item => [item.providerId, { id: item.providerId, name: item.provider, active: true, version: 1 }])).values(),
    { id: 100, name: "Comercial QA", active: true, version: 1 }, { id: 101, name: "Proveedor QA", active: true, version: 1 }, { id: 102, name: "QA", active: true, version: 1 }]);
  const calls = [];
  const refreshEvents = [];
  const pendingLists = [];
  const replay = new Map();
  const slots = [];
  const effects = [];
  let cursor = 0;
  let dirty = true;
  let tree;
  let postIndex = 0;
  const dialogs = { opened: 0, closed: 0 };
  const dialogElement = { showModal() { dialogs.opened++; }, close() { dialogs.closed++; } };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { const next = typeof value === "function" ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useEffect(callback, deps) { const index = cursor++; if (!slots[index] || !deps.every((value, i) => Object.is(value, slots[index].deps[i]))) { if (slots[index]?.cleanup) effects.push(slots[index].cleanup); const slot = { deps }; slots[index] = slot; effects.push(() => { slot.cleanup = callback(); }); } },
  };
  function list(url) {
    const month = url.searchParams.get("month");
    const search = url.searchParams.get("search").toLocaleLowerCase("es-CO");
    const deleted = url.searchParams.get("deleted") === "1";
    const selected = data.filter((item) => (deleted ? item.date.startsWith(month) : item.balance > 0 || item.date.startsWith(month)) && Boolean(item.deletedAt) === deleted && `${item.provider} ${item.number}`.toLocaleLowerCase("es-CO").includes(search))
      .sort((a,b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.date.localeCompare(b.date) || a.id-b.id);
    const pending = selected.filter((item) => item.balance > 0);
    const paid = selected.filter((item) => item.balance === 0);
    const sum = (key) => selected.reduce((cents, item) => cents + Math.round(item[key] * 100), 0) / 100;
    function page(items, field) { const pages = Math.max(1, Math.ceil(items.length / 10)); const number = Math.max(1,Math.min(pages, Number(url.searchParams.get(field))||1)); return { items: structuredClone(items.slice((number - 1) * 10, number * 10)), page: number, pageSize: 10, total: items.length, pages }; }
    if(url.searchParams.get("deleted")==="1")return page(selected,"page");
    return { month, pendingScope: "ALL_MONTHS", paidMonth: month, today: "2026-11-16", summary: { invoiceCount: selected.length, totalAmount: sum("amount"), paidAmount: sum("paidAmount"), balance: sum("balance"), pendingCount: pending.length, paidCount: paid.length,
      overdueCount:pending.filter(r=>r.dueDate&&r.dueDate<"2026-11-16").length,dueSoonCount:pending.filter(r=>r.dueDate&&r.dueDate>="2026-11-16"&&r.dueDate<="2026-11-23").length }, pending: page(pending, "pendingPage"), paid: page(paid, "paidPage") };
  }
  const mockFetch = async (path, options = {}) => {
    const url = new URL(path, "http://localhost");
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: String(path), method: options.method || "GET", body, signal: options.signal });
    if (["POST","PATCH","DELETE"].includes(options.method)) {
      const outcome = postOutcomes[postIndex++];
      if (outcome === "503") return result({ error: "Servicio temporalmente no disponible." }, 503);
      if (replay.has(body.requestId)) return result(replay.get(body.requestId));
      if(url.pathname.includes("/providers")){
        const existing=providers.find(p=>p.id===Number(url.pathname.split("/")[4]));
        let provider=existing;
        if(existing&&existing.version!==body.version)return result({error:"El proveedor cambió.",code:"STALE_VERSION"},409);
        if(!existing){
          provider=providers.find(p=>p.name.toLowerCase()===body.name.toLowerCase());
          if(provider?.active)return result({error:"El proveedor ya existe."},409);
          if(provider){provider.active=true;provider.version++;}
          else{provider={id:Math.max(0,...providers.map(p=>p.id))+1,name:body.name,active:true,version:1};providers.push(provider);}
        }else if(options.method==="DELETE"){existing.active=false;existing.version++;}
        else{existing.name=body.name;existing.version++;}
        const payload={provider:structuredClone(provider)};replay.set(body.requestId,payload);
        if(outcome==="commit-network")throw Error("Connection lost after commit");
        return result(payload);
      }
      let saved;
      if (url.pathname === "/api/pago-facturas") {
        const selected=providers.find(p=>p.id===body.providerId&&p.active);
        if(!selected)return result({error:"Selecciona un proveedor activo."},400);
        if (data.some((item) => item.providerId === selected.id && item.number === body.number)) return result({ error: "La factura ya existe." }, 409);
        saved = invoice(Math.max(0,...data.map(r=>r.id))+1, { number: body.number, provider: selected.name,providerId:selected.id, date: body.date,dueDate:body.dueDate??null, amount: body.amount, balance: body.amount });
        data.push(saved);
      } else {
        saved = data.find((item) => item.id === Number(url.pathname.split("/")[3]));
        if (saved.version !== body.version) return result({ error: "La factura cambió. Actualiza sus datos.", code: "STALE_VERSION" }, 409);
        if(options.method==="DELETE"){saved.deletedAt="2026-11-16T18:00:00Z";saved.version++;}
        else if(options.method==="PATCH"){
          if(body.amount<saved.paidAmount)return result({error:"El valor no puede ser menor que lo pagado.",code:"AMOUNT_BELOW_PAID"},409);
          const selected=providers.find(p=>p.id===body.providerId);
          Object.assign(saved,{number:body.number,date:body.date,dueDate:body.dueDate,amount:body.amount,providerId:body.providerId??saved.providerId,provider:selected?.name??body.provider??saved.provider});
          saved.balance=(Math.round(saved.amount*100)-Math.round(saved.paidAmount*100))/100;saved.status=saved.balance===0?"PAGADA":"PENDIENTE";saved.version++;
        }else if(url.pathname.endsWith("/restore")){saved.deletedAt=null;saved.version++;}
        else{
        const amount = body.mode === "full" ? saved.balance : body.amount;
        saved.paidAmount = (Math.round(saved.paidAmount * 100) + Math.round(amount * 100)) / 100;
        saved.balance = (Math.round(saved.amount * 100) - Math.round(saved.paidAmount * 100)) / 100;
        saved.status = saved.balance === 0 ? "PAGADA" : "PENDIENTE";
        saved.version++;
        saved.paymentCount++;
        saved.payments.push({ id: saved.paymentCount, date: body.date, amount, reference: body.reference, createdBy: "Administración QA", createdAt: "2026-11-16T16:30:00Z" });
        }
      }
      replay.set(body.requestId, {invoice:structuredClone(saved)});
      if (outcome === "commit-network") throw new Error("Connection lost after commit");
      return result({ invoice: saved });
    }
    if(url.pathname==="/api/pago-facturas/providers"){
      if(providerFailures>0){providerFailures--;return result({error:"No fue posible cargar proveedores."},503);}
      return result({items:providers.filter(p=>p.active)});
    }
    if (url.pathname === "/api/pago-facturas") {
      if (listFailures > 0) { listFailures--; return result({ error: "No fue posible consultar el mes." }, 503); }
      const snapshot = list(url);
      if (delayLists) return new Promise((resolve) => pendingLists.push({ resolve: () => resolve(result(snapshot)), signal: options.signal }));
      return result(snapshot);
    }
    return result({ invoice: data.find((item) => item.id === Number(url.pathname.split("/")[3])) });
  };
  const imports = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { __esModule: true, default: "a" },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: "icon" },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: "sidebar" },
    "@/lib/monthly-reports-view": { formatoPesos: money },
    "@/lib/use-live-refresh": { triggerLiveRefresh: (source) => refreshEvents.push(source) },
    "./pago-facturas.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "fetch", "document", code)((name) => { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name]; }, mod, mod.exports, mockFetch, { body: { style: { overflow: "" } } });
  function render() { cursor = 0; dirty = false; tree = mod.exports.default({ today: "2026-11-16", userName: "Administración QA" }); for (const node of nodes(tree)) if (node.type === "dialog") node.props.ref.current = dialogElement; while (effects.length) effects.shift()(); }
  async function settle() { for (let i = 0; i < 12; i++) { if (dirty) render(); await new Promise((resolve) => setImmediate(resolve)); } }
  function find(type, text) { const node = nodes(tree).find((item) => item.type === type && (text === undefined || textOf(item).includes(text))); assert.ok(node, `Missing ${type}: ${text}`); return node; }
  function byLabel(label) { const node = nodes(tree).find((item) => item.props["aria-label"] === label); assert.ok(node, `Missing label: ${label}`); return node; }
  function field(label) { const wrapper = nodes(tree).find((node) => node.type === "label" && [node.props.children].flat().filter((child) => typeof child === "string").join("") === label); const input = nodes(wrapper).find((node) => ["input","select"].includes(node.type)); assert.ok(input, `Missing field ${label}`); return input; }
  async function setControl(label, value) {const control=field(label);if(control.type==="select"&&label==="Proveedor")value=String(providers.find(p=>p.name===value)?.id??value);control.props.onChange({ target: { value,checked:Boolean(value) } }); await settle(); }
  async function click(button) { button.props.onClick({ currentTarget: { focus() {} } }); await settle(); }
  async function submit() { const form = nodes(find("dialog")).find((node) => node.type === "form"); assert.ok(form); await form.props.onSubmit({ preventDefault() {} }); await settle(); }
  async function apply() { await find("form").props.onSubmit({ preventDefault() {} }); await settle(); }
  return { data,providers, calls, refreshEvents, pendingLists, dialogs, settle, find, byLabel, field, setControl, click, submit, apply, text: () => textOf(tree), nodes: () => nodes(tree), unmount: () => slots.forEach((slot) => slot?.cleanup?.()) };
}

test("invoice provider is selected from the catalog and sent by stable ID with its due date", async () => {
  const ui=harness({invoices:[],providers:[{id:7,name:"Proveedor catálogo",active:true,version:1}]});await ui.settle();
  await ui.click(ui.find("button","Nueva factura"));
  assert.equal(ui.field("Proveedor").type,"select");
  assert.match(textOf(ui.field("Proveedor")),/Proveedor catálogo/);
  await ui.setControl("Proveedor","7");await ui.setControl("Número de factura","CAT-001");
  await ui.setControl("Valor de la factura (COP)","1.200.000");await ui.setControl("Vencimiento (opcional)","2026-12-01");await ui.submit();
  const write=ui.calls.find(c=>c.method==="POST");
  assert.equal(write.body.providerId,7);assert.ok(!Object.hasOwn(write.body,"provider"));assert.equal(write.body.dueDate,"2026-12-01");
  assert.equal(ui.data[0].provider,"Proveedor catálogo");ui.unmount();
});

test("catalog create rename and removal refresh the dropdown without changing historical invoices or payments",async()=>{
  const ui=harness({invoices:[invoice(1,{provider:"Nombre histórico",paidAmount:100,balance:900,paymentCount:1})],
    providers:[{id:1,name:"Nombre histórico",active:true,version:1}]});await ui.settle();
  const original=structuredClone(ui.data);
  await ui.click(ui.find("button","Gestionar proveedores"));await ui.setControl("Nombre del proveedor","Proveedor creado");await ui.submit();
  assert.match(textOf(ui.byLabel("Proveedores activos")),/Proveedor creado/);
  await ui.click(ui.byLabel("Editar proveedor Proveedor creado"));await ui.setControl("Nombre del proveedor","Proveedor corregido");await ui.submit();
  const renamed=ui.providers.find(p=>p.name==="Proveedor corregido");assert.ok(renamed);
  await ui.click(ui.byLabel("Eliminar proveedor Nombre histórico"));await ui.submit();
  assert.equal(ui.calls.filter(c=>c.method==="DELETE").length,0,"requires explicit confirmation");
  await ui.setControl("Confirmo eliminar este proveedor",true);await ui.submit();
  assert.equal(ui.providers.find(p=>p.id===1).active,false);assert.deepEqual(ui.data,original);
  await ui.click(ui.find("button","Cerrar"));await ui.click(ui.find("button","Nueva factura"));
  assert.match(textOf(ui.field("Proveedor")),/Proveedor corregido/);assert.doesNotMatch(textOf(ui.field("Proveedor")),/Nombre histórico/);
  await ui.click(ui.find("button","Cancelar"));await ui.click(ui.byLabel("Editar factura FAC-1"));
  assert.equal(ui.field("Proveedor").props.value,"1");assert.match(textOf(ui.field("Proveedor")),/Nombre histórico.*fuera del catálogo activo/);
  ui.unmount();
});

test("ambiguous provider create edit and removal replay exact intent once",async()=>{
  for(const action of ["create","edit","delete"]){
    const ui=harness({postOutcomes:["commit-network"],providers:[{id:1,name:"Proveedor inicial",active:true,version:1}]});await ui.settle();
    await ui.click(ui.find("button","Gestionar proveedores"));
    if(action==="create")await ui.setControl("Nombre del proveedor","Nuevo proveedor");
    if(action==="edit"){await ui.click(ui.byLabel("Editar proveedor Proveedor inicial"));await ui.setControl("Nombre del proveedor","Nombre corregido");}
    if(action==="delete"){await ui.click(ui.byLabel("Eliminar proveedor Proveedor inicial"));await ui.setControl("Confirmo eliminar este proveedor",true);}
    await ui.submit();const first=ui.calls.find(c=>["POST","PATCH","DELETE"].includes(c.method));
    assert.match(textOf(ui.find("dialog")),/Reintentar registro/);
    await ui.submit();const writes=ui.calls.filter(c=>["POST","PATCH","DELETE"].includes(c.method));
    assert.deepEqual(writes[1].body,first.body);assert.equal(writes[1].method,first.method);
    assert.equal(ui.providers.length,action==="create"?2:1);assert.equal(ui.providers[0].version,action==="create"?1:2);
    ui.unmount();
  }
});

test("unavailable provider catalog blocks invoice registration and allows a retry without losing fields",async()=>{
  const ui=harness({providerFailures:1});await ui.settle();await ui.click(ui.find("button","Nueva factura"));
  assert.match(textOf(ui.find("dialog")),/No fue posible cargar proveedores/);
  assert.equal(ui.field("Proveedor").props.disabled,true);await ui.submit();
  assert.equal(ui.calls.filter(c=>c.method==="POST").length,0);
  await ui.click(ui.find("button","Reintentar proveedores"));assert.equal(ui.field("Proveedor").props.disabled,false);
  assert.match(textOf(ui.field("Proveedor")),/Comercial QA/);ui.unmount();
});

test("invoices are ordered by due date before pagination with undated invoices last",async()=>{
  const ui=harness({invoices:[invoice(1,{dueDate:null}),...Array.from({length:12},(_,i)=>invoice(i+2,{dueDate:`2026-11-${String(30-i).padStart(2,"0")}`}))]});await ui.settle();
  const cards=()=>ui.nodes().filter(n=>n.type==="article"&&n.props.className==="invoice").map(textOf);
  assert.match(cards()[0],/FAC-13/);assert.match(cards()[9],/FAC-4/);
  await ui.click(ui.byLabel("Página siguiente de pendientes"));assert.match(cards()[0],/FAC-3/);assert.match(cards().at(-1),/FAC-1(?:\D|$)/);
  ui.unmount();
});

test("invoice page restricts central administration before rendering any financial UI", async () => {
  const access = { exports: {} };
  new Function("module", "exports", transpile("lib/access-control.ts"))(access, access.exports);
  for (const [session, allowed] of [
    [{ rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR", perfilId: 37 }, true],
    [{ rolNombre: "ADMIN", perfilTipo: null }, true],
    [{ rolNombre: "ADMIN", perfilTipo: "SUPERVISOR_TIENDA" }, false],
    [{ rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }, false],
    [{ rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" }, false],
    [{ rolNombre: "BODEGA", perfilTipo: "BODEGA" }, false],
  ]) {
    const mod = { exports: {} };
    const rendered = [];
    let dateCalls = 0;
    const pageJsx = (type, props, key) => { rendered.push(type); return jsx(type, props, key); };
    const imports = { "next/navigation": { redirect: (path) => { throw new Error(`Redirect ${path}`); } }, "@/lib/access-control": access.exports, "@/lib/page-access": { requireSessionPage: async () => ({ ...session, id: 91, nombre: "QA" }) }, "@/lib/ventas-utils": { getTodayBogotaDateKey: () => { dateCalls++; return "2026-11-16"; } }, "./workspace": { __esModule: true, default: "workspace" }, "@/app/_components/invoice-due-notifications": { __esModule: true, default: "invoice-due-notifications" }, "react/jsx-runtime": { jsx: pageJsx, jsxs: pageJsx, Fragment: "fragment" } };
    new Function("require", "module", "exports", transpile("app/pago-facturas/page.tsx"))((name) => imports[name], mod, mod.exports);
    if (allowed) {
      const view = await mod.exports.default();
      const workspace = nodes(view).find((node) => node.type === "workspace");
      const notifications = nodes(view).find((node) => node.type === "invoice-due-notifications");
      assert.ok(workspace); assert.equal(workspace.props.today, "2026-11-16"); assert.equal(workspace.props.userName, "QA");
      assert.ok(notifications); assert.equal(notifications.props.userKey, `91:${session.perfilId ?? "usuario"}`); assert.equal(dateCalls, 1);
    } else {
      await assert.rejects(mod.exports.default(), /Redirect \/dashboard/);
      assert.deepEqual(rendered, [], "Denied users never receive invoice UI or notification data"); assert.equal(dateCalls, 0);
    }
  }
});

test("monthly columns paginate independently while summaries include all filtered invoices", async () => {
  const invoices = [...Array.from({ length: 12 }, (_, i) => invoice(i + 1)), ...Array.from({ length: 11 }, (_, i) => invoice(i + 13, { paidAmount: 1000, balance: 0, status: "PAGADA", paymentCount: 1 }))];
  const ui = harness({ invoices }); await ui.settle();
  assert.match(ui.text(), /FACTURAS PENDIENTES12/); assert.match(ui.text(), /FACTURAS PAGAS11/);
  assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /Total facturas\$ 23\.00023 facturas.*Abonado\$ 11\.000.*Saldo pendiente\$ 12\.000/);
  assert.equal(ui.nodes().filter((node) => node.type === "article" && node.props.className === "invoice").length, 20);
  await ui.click(ui.byLabel("Página siguiente de pendientes"));
  assert.match(ui.calls.at(-1).path, /pendingPage=2&paidPage=1/);
  assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /\$ 23\.000/);
  await ui.click(ui.byLabel("Página siguiente de pagas"));
  assert.match(ui.calls.at(-1).path, /pendingPage=2&paidPage=2/);
  assert.equal(ui.nodes().filter((node) => node.type === "article" && node.props.className === "invoice").length, 3);
  ui.unmount();
});

test("historical paid months and searches only apply on Consultar; new invoices default to today", async () => {
  const ui = harness({ invoices: [invoice(1), invoice(2, { date: "2025-02-01", provider: "Proveedor histórico" })] }); await ui.settle();
  const before = ui.calls.length;
  await ui.setControl("Mes de pagadas y eliminadas", "2025-02"); await ui.setControl("Buscar factura o proveedor", "histórico");
  assert.equal(ui.calls.length, before); assert.match(ui.text(), /Filtros sin aplicar/);
  await ui.apply();
  const url = new URL(ui.calls.at(-1).path, "http://localhost");
  assert.equal(url.searchParams.get("month"), "2025-02"); assert.equal(url.searchParams.get("search"), "histórico");
  assert.equal(url.searchParams.get("pendingPage"), "1"); assert.equal(url.searchParams.get("paidPage"), "1");
  assert.match(ui.text(), /Proveedor histórico/); assert.doesNotMatch(ui.text(), /Proveedor 1/);
  await ui.click(ui.find("button", "Nueva factura"));
  assert.equal(ui.field("Fecha de la factura").props.value, "2026-11-16"); ui.unmount();
});

test("new invoices preserve full COP amounts and refresh both columns and summaries", async () => {
  const ui = harness({ invoices: [] }); await ui.settle();
  await ui.click(ui.find("button", "Nueva factura"));
  await ui.setControl("Proveedor", "Comercial QA"); await ui.setControl("Número de factura", "FACT-001"); await ui.setControl("Valor de la factura (COP)", "1.250.000,50");
  await ui.submit();
  const write = ui.calls.find((call) => call.method === "POST");
  assert.equal(write.path, "/api/pago-facturas"); assert.equal(write.body.amount, 1250000.5); assert.equal(write.body.date, "2026-11-16"); assert.match(write.body.requestId, /^[a-f\d-]{36}$/i);
  assert.equal(ui.data.length, 1); assert.equal(ui.nodes().filter((node) => node.type === "dialog").length, 0);
  assert.match(ui.text(), /Factura FACT-001 registrada/); assert.match(ui.text(), /Comercial QA/); assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /1\.250\.000,5/);
  assert.match(ui.calls.at(-1).path, /\/api\/pago-facturas\?/); ui.unmount();
});

test("partial payment reduces balance and full payment moves invoice into pagas within invoice month", async () => {
  const ui = harness(); await ui.settle();
  await ui.click(ui.find("button", "Abonar / pagar"));
  await ui.setControl("Abono parcial", "partial"); await ui.setControl("Valor del abono (COP)", "400,25"); await ui.setControl("Fecha del pago", "2026-12-05"); await ui.setControl("Referencia o comprobante (opcional)", "Transferencia 001");
  assert.match(textOf(ui.find("dialog")), /Saldo después del pago\$ 599,75/);
  await ui.submit();
  assert.equal(ui.data[0].balance, 599.75); assert.equal(ui.data[0].status, "PENDIENTE"); assert.match(ui.text(), /Abono parcial/);
  await ui.click(ui.find("button", "Abonar / pagar")); await ui.submit();
  const writes = ui.calls.filter((call) => call.method === "POST");
  assert.equal(writes[1].body.mode, "full"); assert.ok(!Object.hasOwn(writes[1].body, "amount")); assert.equal(writes[1].body.version, 2);
  assert.equal(ui.data[0].balance, 0); assert.equal(ui.data[0].paymentCount, 2); assert.equal(ui.data[0].status, "PAGADA"); assert.equal(ui.data[0].date, "2026-11-01");
  assert.match(ui.text(), /FACTURAS PENDIENTES0/); assert.match(ui.text(), /FACTURAS PAGAS1/);
  await ui.click(ui.byLabel("Ver pagos de factura FAC-1"));
  assert.match(textOf(ui.find("dialog")), /05 de dic de 2026\$ 400,25Transferencia 001/); assert.match(textOf(ui.find("dialog")), /Administración QA/);
  ui.unmount();
});

test("ambiguous payment result locks intent and retry uses the same key and body without a duplicate", async () => {
  const ui = harness({ postOutcomes: ["commit-network"] }); await ui.settle();
  await ui.click(ui.find("button", "Abonar / pagar")); await ui.setControl("Abono parcial", "partial"); await ui.setControl("Valor del abono (COP)", "300"); await ui.submit();
  assert.equal(ui.data[0].paymentCount, 1); assert.match(textOf(ui.find("dialog")), /Reintentar pago/);
  assert.deepEqual(ui.refreshEvents, [], "Unconfirmed writes must not announce a successful refresh");
  assert.equal(ui.field("Valor del abono (COP)").props.disabled, true); assert.equal(ui.find("button", "Cancelar").props.disabled, true);
  const first = ui.calls.find((call) => call.method === "POST");
  await ui.submit();
  const writes = ui.calls.filter((call) => call.method === "POST"); assert.deepEqual(writes[1].body, first.body);
  assert.equal(ui.data[0].paymentCount, 1); assert.equal(ui.data[0].paidAmount, 300); assert.equal(ui.data[0].balance, 700);
  assert.deepEqual(ui.refreshEvents, ["invoice-payments"], "Confirmed payment refreshes the due notifications immediately");
  assert.equal(ui.nodes().filter((node) => node.type === "dialog").length, 0); ui.unmount();
});

test("ambiguous invoice creation retries the original request instead of adding another invoice", async () => {
  const ui = harness({ invoices: [], postOutcomes: ["commit-network"] }); await ui.settle(); await ui.click(ui.find("button", "Nueva factura"));
  await ui.setControl("Proveedor", "Proveedor QA"); await ui.setControl("Número de factura", "N-1"); await ui.setControl("Valor de la factura (COP)", "500"); await ui.submit();
  assert.equal(ui.data.length, 1); assert.equal(ui.field("Proveedor").props.disabled, true); assert.match(textOf(ui.find("dialog")), /Reintentar registro/);
  await ui.submit(); const writes = ui.calls.filter((call) => call.method === "POST"); assert.deepEqual(writes[1].body, writes[0].body); assert.equal(ui.data.length, 1); ui.unmount();
});

test("stale invoice version requires explicit refresh before a new payment intent", async () => {
  const ui = harness(); await ui.settle(); await ui.click(ui.find("button", "Abonar / pagar"));
  ui.data[0].version = 2; ui.data[0].paidAmount = 100; ui.data[0].balance = 900;
  await ui.submit(); assert.match(textOf(ui.find("dialog")), /La factura cambió/); assert.equal(ui.data[0].paymentCount, 0);
  const first = ui.calls.find((call) => call.method === "POST");
  await ui.click(ui.find("button", "Actualizar factura y revisar")); assert.match(textOf(ui.find("dialog")), /Valor del pago\$ 900/);
  await ui.submit(); const writes = ui.calls.filter((call) => call.method === "POST"); assert.notEqual(writes[1].body.requestId, first.body.requestId); assert.equal(writes[1].body.version, 2);
  assert.equal(ui.data[0].paymentCount, 1); assert.equal(ui.data[0].balance, 0); ui.unmount();
});

test("invalid invoices and overpayments are rejected locally and retain entered values", async () => {
  const ui = harness(); await ui.settle(); await ui.click(ui.find("button", "Nueva factura")); await ui.submit(); assert.match(textOf(ui.find("dialog")), /Indica el número de factura y el proveedor/);
  await ui.setControl("Proveedor", "QA"); await ui.setControl("Número de factura", "N-2");
  for (const value of ["-10", "0", "", "1.23", "1.000,123"]) { await ui.setControl("Valor de la factura (COP)", value); await ui.submit(); assert.equal(ui.field("Valor de la factura (COP)").props.value, value); }
  assert.equal(ui.calls.filter((call) => call.method === "POST").length, 0);
  await ui.click(ui.find("button", "Cancelar")); await ui.click(ui.find("button", "Abonar / pagar")); await ui.setControl("Abono parcial", "partial"); await ui.setControl("Valor del abono (COP)", "1.000,01"); await ui.submit();
  assert.match(textOf(ui.find("dialog")), /no superar el saldo/); assert.equal(ui.calls.filter((call) => call.method === "POST").length, 0); ui.unmount();
});

test("late list response cannot replace the newly selected historical paid month", async () => {
  const ui = harness({ delayLists: true, invoices: [invoice(1, { balance: 0, paidAmount: 1000, status: "PAGADA" }), invoice(2, { date: "2025-02-01", provider: "Histórico QA", balance: 0, paidAmount: 1000, status: "PAGADA" })] }); await ui.settle();
  await ui.setControl("Mes de pagadas y eliminadas", "2025-02"); await ui.apply();
  assert.equal(ui.pendingLists.length, 2); assert.equal(ui.pendingLists[0].signal.aborted, true);
  ui.pendingLists[1].resolve(); await ui.settle(); assert.match(ui.text(), /Histórico QA/);
  ui.pendingLists[0].resolve(); await ui.settle(); assert.match(ui.text(), /Histórico QA/); assert.doesNotMatch(ui.text(), /Proveedor 1/); ui.unmount();
});

test("failed initial query never presents zero invoice counts as confirmed data and retry recovers", async () => {
  const ui = harness({ listFailures: 1 }); await ui.settle();
  assert.match(ui.text(), /No fue posible consultar el mes/);
  assert.match(ui.text(), /FACTURAS PENDIENTES—/); assert.match(ui.text(), /FACTURAS PAGAS—/);
  assert.match(ui.text(), /Sin datos confirmados/); assert.doesNotMatch(ui.text(), /0 facturas/);
  assert.doesNotMatch(textOf(ui.byLabel("Resumen de facturas consultadas")), /\$ 0/);
  await ui.click(ui.find("button", "Reintentar"));
  assert.match(ui.text(), /FACTURAS PENDIENTES1/); assert.match(ui.text(), /FACTURAS PAGAS0/);
  assert.match(ui.text(), /Proveedor 1/); ui.unmount();
});

test("invoice edit loads fresh fields, validates due date and paid floor, and preserves payment history", async () => {
  const payment = { id: 1, date: "2026-11-10", amount: 400, reference: "Pago previo", createdBy: "QA", createdAt: "2026-11-10T17:00:00Z" };
  const ui = harness({ invoices: [invoice(1, { paidAmount: 400, balance: 600, paymentCount: 1, payments: [payment] })] }); await ui.settle();
  ui.data[0].number = "FAC-ACTUAL"; ui.data[0].version = 2;
  await ui.click(ui.byLabel("Editar factura FAC-1"));
  assert.equal(ui.field("Número de factura").props.value, "FAC-ACTUAL");
  await ui.setControl("Vencimiento (opcional)", "2026-10-31"); await ui.submit();
  assert.match(textOf(ui.find("dialog")), /igual o posterior/);
  await ui.setControl("Vencimiento (opcional)", "2026-11-20"); await ui.setControl("Valor de la factura (COP)", "399,99"); await ui.submit();
  assert.match(textOf(ui.find("dialog")), /no puede ser menor/); assert.equal(ui.calls.filter((call) => call.method === "PATCH").length, 0);
  await ui.setControl("Valor de la factura (COP)", "1.500,25"); await ui.submit();
  const write = ui.calls.find((call) => call.method === "PATCH");
  assert.equal(write.path, "/api/pago-facturas/1"); assert.equal(write.body.version, 2); assert.equal(write.body.dueDate, "2026-11-20"); assert.equal(write.body.amount, 1500.25);
  assert.equal(ui.data[0].paidAmount, 400); assert.deepEqual(ui.data[0].payments, [payment]); assert.equal(ui.data[0].balance, 1100.25);
  assert.match(ui.text(), /Sus pagos se conservan/); ui.unmount();
});

test("paid invoices remain editable and raising value returns the remaining balance to pendientes", async () => {
  const ui = harness({ invoices: [invoice(1, { paidAmount: 1000, balance: 0, status: "PAGADA", paymentCount: 1 })] }); await ui.settle();
  await ui.click(ui.byLabel("Editar factura FAC-1")); await ui.setControl("Valor de la factura (COP)", "1.200"); await ui.submit();
  assert.equal(ui.data[0].balance, 200); assert.equal(ui.data[0].status, "PENDIENTE"); assert.equal(ui.data[0].paidAmount, 1000);
  assert.match(ui.text(), /FACTURAS PENDIENTES1/); assert.match(ui.text(), /FACTURAS PAGAS0/); ui.unmount();
});

test("invoice deletion requires explicit confirmation, preserves payment history and can be restored", async () => {
  const payment = { id: 1, date: "2026-11-10", amount: 400, reference: "Referencia conservada", createdBy: "QA", createdAt: "2026-11-10T17:00:00Z" };
  const ui = harness({ invoices: [invoice(1, { paidAmount: 400, balance: 600, paymentCount: 1, payments: [payment] })] }); await ui.settle();
  await ui.click(ui.byLabel("Eliminar factura FAC-1"));
  assert.match(textOf(ui.find("dialog")), /Proveedor 1.*Factura FAC-1/); assert.match(textOf(ui.find("dialog")), /Referencia conservada/);
  await ui.submit(); assert.equal(ui.calls.filter((call) => call.method === "DELETE").length, 0);
  await ui.click(ui.find("button", "Cancelar")); assert.equal(ui.data[0].deletedAt ?? null, null);
  await ui.click(ui.byLabel("Eliminar factura FAC-1")); await ui.setControl("Confirmo eliminar esta factura del reporte", true); await ui.submit();
  assert.ok(ui.data[0].deletedAt); assert.deepEqual(ui.data[0].payments, [payment]);
  assert.match(ui.text(), /FACTURAS PENDIENTES0/); assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /Total facturas\$ 0/);
  await ui.click(ui.find("button", "Facturas eliminadas")); assert.match(textOf(ui.byLabel("Facturas eliminadas")), /Proveedor 1/);
  const deletedQuery = ui.calls.findLast((call) => call.path.includes("deleted=1")); assert.match(deletedQuery.path, /month=2026-11/);
  await ui.click(ui.byLabel("Restaurar factura FAC-1")); assert.match(textOf(ui.find("dialog")), /Referencia conservada/); await ui.submit();
  assert.equal(ui.data[0].deletedAt, null); assert.deepEqual(ui.data[0].payments, [payment]); assert.equal(ui.data[0].balance, 600);
  assert.match(ui.text(), /FACTURAS PENDIENTES1/); assert.match(textOf(ui.byLabel("Facturas eliminadas")), /No hay facturas eliminadas/); ui.unmount();
});

test("ambiguous invoice edit, deletion and restore replay the original method and intent", async () => {
  for (const kind of ["edit", "delete", "restore"]) {
    const ui = harness({ invoices: [invoice(1, kind === "restore" ? { deletedAt: "2026-11-16T18:00:00Z" } : {})], postOutcomes: ["commit-network"] }); await ui.settle();
    if (kind === "restore") { await ui.click(ui.find("button", "Facturas eliminadas")); await ui.click(ui.byLabel("Restaurar factura FAC-1")); }
    else if (kind === "delete") { await ui.click(ui.byLabel("Eliminar factura FAC-1")); await ui.setControl("Confirmo eliminar esta factura del reporte", true); }
    else { await ui.click(ui.byLabel("Editar factura FAC-1")); await ui.setControl("Número de factura", "CAMBIADA"); }
    await ui.submit(); assert.match(textOf(ui.find("dialog")), /Reintentar registro/); assert.equal(ui.find("button", "Cancelar").props.disabled, true);
    const version = ui.data[0].version;
    await ui.submit(); const writes = ui.calls.filter((call) => call.method !== "GET");
    assert.equal(writes.length, 2); assert.equal(writes[1].method, writes[0].method); assert.deepEqual(writes[1].body, writes[0].body); assert.equal(ui.data[0].version, version); assert.deepEqual(ui.refreshEvents, ["invoice-payments"]); ui.unmount();
  }
});

test("stale deletion requires another review and confirmation using the updated version", async () => {
  const ui = harness(); await ui.settle(); await ui.click(ui.byLabel("Eliminar factura FAC-1")); await ui.setControl("Confirmo eliminar esta factura del reporte", true);
  ui.data[0].version = 2; ui.data[0].paidAmount = 100; ui.data[0].balance = 900;
  await ui.submit(); assert.match(textOf(ui.find("dialog")), /La factura cambió/);
  await ui.click(ui.find("button", "Actualizar factura y revisar")); assert.equal(ui.field("Confirmo eliminar esta factura del reporte").props.checked, false);
  await ui.submit(); assert.equal(ui.calls.filter((call) => call.method === "DELETE").length, 1);
  await ui.setControl("Confirmo eliminar esta factura del reporte", true); await ui.submit();
  const writes = ui.calls.filter((call) => call.method === "DELETE"); assert.notEqual(writes[1].body.requestId, writes[0].body.requestId); assert.equal(writes[1].body.version, 2); ui.unmount();
});

test("due date labels distinguish overdue, today, soon, unknown and paid without false overdue paid badges", async () => {
  const ui = harness({ invoices: [invoice(1, { dueDate: "2026-11-15", dueStatus: "VENCIDA" }), invoice(2, { dueDate: "2026-11-16", dueStatus: "HOY" }), invoice(3, { dueDate: "2026-11-23", dueStatus: "PROXIMA" }), invoice(4), invoice(5, { paidAmount: 1000, balance: 0, status: "PAGADA", dueDate: "2026-11-10", dueStatus: "VENCIDA" })] }); await ui.settle();
  assert.match(ui.text(), /Vencida/); assert.match(ui.text(), /Vence hoy/); assert.match(ui.text(), /Próxima a vencer/); assert.match(ui.text(), /Vencimiento sin registrar/);
  assert.match(ui.text(), /Ordenadas por vencimiento · sin fecha al final/);
  const paidCard = ui.nodes().find((node) => node.type === "article" && node.props.className === "invoice" && textOf(node).includes("Factura FAC-5"));
  assert.doesNotMatch(textOf(paidCard), /Vencida|Vence hoy|Próxima a vencer/); ui.unmount();
});

test("pending invoices from every month remain visible while month limits paid and deleted invoices", async () => {
  const ui = harness({ invoices: [
    invoice(1, { date: "2024-01-02", amount: 2500, paidAmount: 500, balance: 2000, dueDate: "2024-02-01", dueStatus: "VENCIDA" }),
    invoice(2, { date: "2025-02-03", amount: 400, balance: 400, dueDate: "2026-11-16", dueStatus: "HOY" }),
    invoice(3, { date: "2025-02-04", amount: 600, paidAmount: 600, balance: 0, status: "PAGADA" }),
    invoice(4, { date: "2026-11-05", amount: 800, paidAmount: 800, balance: 0, status: "PAGADA" }),
    invoice(5, { date: "2025-02-06", deletedAt: "2026-11-16T18:00:00Z" }),
    invoice(6, { date: "2026-11-06", deletedAt: "2026-11-16T18:00:00Z" }),
  ] }); await ui.settle();
  assert.match(ui.text(), /Las pendientes incluyen todos los meses/);
  assert.match(ui.text(), /FACTURAS PENDIENTES2/); assert.match(ui.text(), /FACTURAS PAGAS1/);
  assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /Total facturas\$ 3\.7003 facturas.*Abonado\$ 1\.300.*Saldo pendiente\$ 2\.400/);
  assert.match(textOf(ui.byLabel("Resumen de vencimientos")), /1 vencidas1 vencen hoy/);
  let cards = ui.nodes().filter((node) => node.type === "article" && node.props.className === "invoice").map(textOf).join(" ");
  assert.match(cards, /Factura FAC-1/); assert.match(cards, /Factura FAC-2/); assert.match(cards, /Factura FAC-4/); assert.doesNotMatch(cards, /Factura FAC-3/);
  await ui.click(ui.find("button", "Facturas eliminadas")); assert.match(textOf(ui.byLabel("Facturas eliminadas")), /Factura FAC-6/); assert.doesNotMatch(textOf(ui.byLabel("Facturas eliminadas")), /Factura FAC-5/);
  await ui.setControl("Mes de pagadas y eliminadas", "2025-02"); await ui.apply();
  cards = ui.nodes().filter((node) => node.type === "article" && node.props.className === "invoice").map(textOf).join(" ");
  assert.match(cards, /Factura FAC-1/); assert.match(cards, /Factura FAC-2/); assert.match(cards, /Factura FAC-3/); assert.doesNotMatch(cards, /Factura FAC-4/);
  assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /Total facturas\$ 3\.5003 facturas.*Abonado\$ 1\.100.*Saldo pendiente\$ 2\.400/);
  assert.match(textOf(ui.byLabel("Facturas eliminadas")), /Factura FAC-5/); assert.doesNotMatch(textOf(ui.byLabel("Facturas eliminadas")), /Factura FAC-6/); ui.unmount();
});

test("search applies to pending invoices across all months and to paid invoices in the selected month", async () => {
  const ui = harness({ invoices: [invoice(1, { provider: "BUSCADO antiguo", date: "2020-01-01" }), invoice(2, { provider: "BUSCADO pagado", paidAmount: 1000, balance: 0, status: "PAGADA" }), invoice(3, { provider: "BUSCADO fuera del mes", date: "2025-02-01", paidAmount: 1000, balance: 0, status: "PAGADA" }), invoice(4)] }); await ui.settle();
  await ui.setControl("Buscar factura o proveedor", "BUSCADO"); await ui.apply();
  assert.match(ui.text(), /BUSCADO antiguo/); assert.match(ui.text(), /BUSCADO pagado/); assert.doesNotMatch(ui.text(), /BUSCADO fuera del mes|Proveedor 4/);
  assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /Total facturas\$ 2\.0002 facturas.*Saldo pendiente\$ 1\.000/); ui.unmount();
});

test("paying an old pending invoice removes it globally and identifies its paid month without losing its payment", async () => {
  const ui = harness({ invoices: [invoice(1, { date: "2025-02-01", dueDate: "2025-03-01", dueStatus: "VENCIDA" })] }); await ui.settle();
  await ui.click(ui.find("button", "Abonar / pagar")); await ui.submit();
  assert.equal(ui.data[0].paymentCount, 1); assert.equal(ui.data[0].paidAmount, 1000); assert.equal(ui.data[0].date, "2025-02-01");
  assert.match(ui.text(), /FACTURAS PENDIENTES0/); assert.match(ui.text(), /FACTURAS PAGAS0/); assert.match(ui.text(), /Disponible en pagadas de febrero de 2025/);
  await ui.setControl("Mes de pagadas y eliminadas", "2025-02"); await ui.apply();
  assert.match(ui.text(), /FACTURAS PAGAS1/); await ui.click(ui.byLabel("Ver pagos de factura FAC-1")); assert.match(textOf(ui.find("dialog")), /16 de nov de 2026\$ 1\.000/); ui.unmount();
});

test("global pending totals and due counts include every page and stay stable when only paid month changes", async () => {
  const invoices = Array.from({ length: 13 }, (_, i) => invoice(i + 1, { date: `202${i % 6}-01-01`, dueDate: i < 12 ? `2026-10-${String(i + 1).padStart(2, "0")}` : null }));
  const ui = harness({ invoices }); await ui.settle();
  assert.match(ui.text(), /FACTURAS PENDIENTES13/); assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /Total facturas\$ 13\.000/); assert.match(textOf(ui.byLabel("Resumen de vencimientos")), /12 vencidas/);
  await ui.click(ui.byLabel("Página siguiente de pendientes")); assert.equal(ui.nodes().filter((node) => node.type === "article" && node.props.className === "invoice").length, 3);
  assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /Saldo pendiente\$ 13\.000/);
  await ui.setControl("Mes de pagadas y eliminadas", "2020-01"); await ui.apply();
  assert.match(ui.text(), /FACTURAS PENDIENTES13/); assert.match(textOf(ui.byLabel("Resumen de facturas consultadas")), /Saldo pendiente\$ 13\.000/); assert.match(textOf(ui.byLabel("Resumen de vencimientos")), /12 vencidas/); ui.unmount();
});
