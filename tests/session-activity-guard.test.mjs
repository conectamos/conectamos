import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const ACTIVE_USER = { id: 71, nombre: "Operador QA", perfilId: 19, sessionKey: "test-session-key" };

async function flush() {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, data = {}) {
      for (const listener of [...(listeners.get(type) || [])]) {
        listener({ type, isTrusted: true, ...data });
      }
    },
    listenerCount() { return [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0); },
  };
}

function probe({ visible = true, pathname = "/dashboard", get = [], heartbeat = [], ignoreAbort = false } = {}) {
  let now = Date.UTC(2026, 9, 24, 18), sequence = 0, route = pathname;
  const timers = new Map(), calls = [], redirects = [], refs = [], effects = [];
  const queue = { session: [...get], heartbeat: [...heartbeat] };
  let hookIndex = 0, effectIndex = 0, pendingEffects = [];
  const clockDate = class extends Date { static now() { return now; } };
  const schedule = (callback, delay, repeat = false) => {
    const id = ++sequence;
    timers.set(id, { callback, at: now + Number(delay), delay: Number(delay), repeat });
    return id;
  };
  const clear = id => timers.delete(id);
  const window = {
    ...target(),
    setTimeout: (callback, delay) => schedule(callback, delay),
    clearTimeout: clear,
    setInterval: (callback, delay) => schedule(callback, delay, true),
    clearInterval: clear,
  };
  const document = { ...target(), visibilityState: visible ? "visible" : "hidden", hidden: !visible };
  let href = pathname;
  window.location = {
    get href() { return href; },
    set href(value) { href = value; redirects.push(value); },
    assign(value) { this.href = value; },
    replace(value) { this.href = value; },
  };
  const fetch = (url, init = {}) => {
    const kind = url === "/api/session" ? "session" : url === "/api/session/heartbeat" ? "heartbeat" : "other";
    const record = { url, method: init.method || "GET", init, at: now };
    calls.push(record);
    if (kind === "other") return Promise.reject(new Error(`Solicitud inesperada: ${record.method} ${url}`));
    const next = queue[kind].shift();
    let result;
    try { result = typeof next === "function" ? next(record) : next; } catch (error) { result = Promise.reject(error); }
    if (result === undefined) result = Response.json(kind === "session" ? ACTIVE_USER : { ok: true });
    const response = Promise.resolve(result);
    if (!init.signal || ignoreAbort) return response;
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init.signal.aborted) { abort(); return; }
      init.signal.addEventListener("abort", abort, { once: true });
      response.then(value => { init.signal.removeEventListener("abort", abort); resolve(value); }, error => { init.signal.removeEventListener("abort", abort); reject(error); });
    });
  };
  const hooks = {
    useRef(initial) { const index = hookIndex++; return refs[index] ||= { current: initial }; },
    useEffect(callback, dependencies) {
      const index = effectIndex++;
      const previous = effects[index];
      const changed = !previous || !dependencies || dependencies.some((value, cursor) => !Object.is(value, previous.dependencies?.[cursor]));
      if (changed) pendingEffects.push(() => {
        previous?.cleanup?.();
        effects[index] = { dependencies, cleanup: callback() };
      });
    },
  };
  const source = readFileSync("app/_components/session-activity-guard.tsx", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} };
  const imports = { react: hooks, "next/navigation": { usePathname: () => route } };
  new Function("require", "module", "exports", "Date", "window", "document", "fetch", "AbortController", "setTimeout", "clearTimeout", "setInterval", "clearInterval", compiled)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loadedModule, loadedModule.exports, clockDate, window, document, fetch, AbortController, window.setTimeout, clear, window.setInterval, clear);
  const Guard = loadedModule.exports.default;
  const render = () => {
    hookIndex = 0; effectIndex = 0; pendingEffects = [];
    Guard();
    pendingEffects.forEach(run => run());
  };
  render();
  const api = {
    calls, redirects, window, document, queue,
    sessionCalls: () => calls.filter(call => call.url === "/api/session"),
    heartbeatCalls: () => calls.filter(call => call.url === "/api/session/heartbeat"),
    async navigate(pathname) { route = pathname; render(); await flush(); },
    async emit(type) { window.emit(type); await flush(); },
    async visibility(visible) { document.visibilityState = visible ? "visible" : "hidden"; document.hidden = !visible; document.emit("visibilitychange"); await flush(); },
    async advance(duration) {
      const until = now + duration;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        const [id, timer] = due;
        now = timer.at;
        if (timer.repeat) timer.at += timer.delay; else timers.delete(id);
        timer.callback();
        await flush();
      }
      now = until;
      await flush();
    },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
    assertReadOnly() {
      assert.ok(calls.every(call => call.url === "/api/session" && call.method === "GET" || call.url === "/api/session/heartbeat" && call.method === "POST"), "Una pestaña inactiva nunca puede revocar la sesión compartida con /api/logout");
    },
  };
  return api;
}

test("al confirmar la sesión renueva la actividad visible sin esperar un minuto ni revocar otras pestañas", async () => {
  const p = probe(); await flush();
  assert.equal(p.sessionCalls().length, 1);
  assert.equal(p.heartbeatCalls().length, 1);
  assert.equal(p.heartbeatCalls()[0].at, p.sessionCalls()[0].at);
  assert.equal(p.sessionCalls()[0].init.cache, "no-store");
  assert.equal(p.sessionCalls()[0].init.credentials, "include");
  assert.deepEqual(p.redirects, []);
  p.assertReadOnly(); p.unmount();
});

test("una pestaña antigua no cierra la sesión que el servidor mantiene activa en otra pestaña", async () => {
  const p = probe(); await flush();
  const initialHeartbeats = p.heartbeatCalls().length;
  await p.visibility(false);
  await p.advance(HOUR + 2 * MINUTE);
  assert.equal(p.heartbeatCalls().length, initialHeartbeats, "La pestaña oculta no debe inventar actividad");
  assert.ok(p.sessionCalls().length >= 2, "Debe comprobar el estado real sin renovarlo");
  assert.deepEqual(p.redirects, []);
  p.assertReadOnly(); p.unmount();
});

test("la inactividad real confirmada por el servidor redirige sin ejecutar un cierre global", async () => {
  const p = probe(); await flush();
  p.queue.session.push(() => Response.json({ error: "No autenticado" }, { status: 401 }));
  await p.visibility(false);
  await p.advance(HOUR + MINUTE);
  assert.deepEqual(p.redirects, ["/"]);
  p.assertReadOnly(); p.unmount();
});

test("entrar a Inventario después de otro acceso válido no reutiliza el reloj de una página anterior", async () => {
  const p = probe(); await flush();
  await p.visibility(false);
  await p.advance(59 * MINUTE);
  await p.navigate("/inventario");
  await p.advance(2 * MINUTE);
  assert.deepEqual(p.redirects, []);
  assert.ok(p.sessionCalls().length >= 2);
  p.assertReadOnly(); p.unmount();
});

test("la navegación cancela las peticiones viejas e ignora su 401 incluso si el transporte no respeta AbortSignal", async () => {
  const oldHeartbeat = deferred();
  const p = probe({ heartbeat: [() => oldHeartbeat.promise], ignoreAbort: true });
  await flush();
  const oldRequest = p.heartbeatCalls()[0];
  assert.ok(oldRequest);
  await p.navigate("/inventario");
  assert.equal(oldRequest.init.signal.aborted, true);
  const currentChecks = p.sessionCalls().length;
  oldHeartbeat.resolve(Response.json({ error: "Sesión anterior" }, { status: 401 }));
  await flush();
  assert.equal(p.sessionCalls().length, currentChecks, "La respuesta de la generación anterior no debe confirmar ni invalidar la sesión nueva");
  assert.deepEqual(p.redirects, []);
  p.assertReadOnly(); p.unmount();
});

test("un 401 atrasado de la consulta anterior no invalida la sesión del módulo actual", async () => {
  const oldSession = deferred();
  const p = probe({ get: [() => oldSession.promise], ignoreAbort: true });
  await flush();
  const oldRequest = p.sessionCalls()[0];
  await p.navigate("/inventario");
  oldSession.resolve(Response.json({ error: "Respuesta anterior" }, { status: 401 }));
  await flush();
  assert.equal(oldRequest.init.signal.aborted, true);
  assert.equal(p.heartbeatCalls().length, 1);
  assert.deepEqual(p.redirects, []);
  p.assertReadOnly(); p.unmount();
});

test("un heartbeat rechazado exige confirmar la sesión antes de redirigir", async () => {
  for (const status of [401, 403]) {
    const p = probe(); await flush();
    p.queue.heartbeat.push(() => Response.json({ error: "Rechazo temporal" }, { status }));
    await p.emit("click"); await p.advance(MINUTE);
    assert.ok(p.sessionCalls().length >= 2);
    assert.deepEqual(p.redirects, [], "Una sesión que GET confirma vigente se conserva");
    p.assertReadOnly(); p.unmount();
  }
});

test("un 401 vigente confirmado sí devuelve al acceso sin borrar la cookie ni alterar registros", async () => {
  const p = probe(); await flush();
  p.queue.heartbeat.push(() => Response.json({ error: "No autenticado" }, { status: 401 }));
  p.queue.session.push(() => Response.json({ error: "No autenticado" }, { status: 401 }));
  await p.emit("keydown"); await p.advance(MINUTE);
  assert.deepEqual(p.redirects, ["/"]);
  p.assertReadOnly(); p.unmount();
});

test("un fallo al confirmar un heartbeat no se interpreta como una sesión revocada", async () => {
  for (const status of [403, 500]) {
    const p = probe(); await flush();
    p.queue.heartbeat.push(() => Response.json({ error: "Heartbeat rechazado" }, { status: 401 }));
    p.queue.session.push(() => Response.json({ error: "Comprobación temporalmente no disponible" }, { status }));
    await p.emit("click"); await p.advance(2 * MINUTE);
    assert.equal(p.sessionCalls().length, 2);
    assert.equal(p.heartbeatCalls().length, 3, "La actividad permanece pendiente para renovar tras el fallo");
    assert.deepEqual(p.redirects, []);
    p.assertReadOnly(); p.unmount();
  }
});

test("errores de red, servidor o permiso no se convierten en un cierre de sesión", async () => {
  for (const first of [() => Promise.reject(new Error("Red temporal")), () => Response.json({ error: "Temporal" }, { status: 500 }), () => Response.json({ error: "Restringido" }, { status: 403 }), () => new Response("<html>Proxy</html>", { status: 200 })]) {
    const p = probe({ get: [first] }); await flush();
    assert.deepEqual(p.redirects, []);
    assert.equal(p.heartbeatCalls().length, 0, "Sin identidad confirmada no se envían heartbeats");
    await p.advance(2 * MINUTE);
    assert.ok(p.sessionCalls().length >= 2, "El error debe poder recuperarse automáticamente");
    assert.ok(p.heartbeatCalls().length >= 1);
    assert.deepEqual(p.redirects, []);
    p.assertReadOnly(); p.unmount();
  }
});

test("una respuesta 200 sin usuario válido no autentica al cliente ni renueva actividad", async () => {
  for (const payload of [{}, { id: 0 }, { id: -1 }, { id: "incorrecto" }]) {
    const p = probe({ get: [() => Response.json(payload)] }); await flush();
    assert.equal(p.heartbeatCalls().length, 0);
    assert.deepEqual(p.redirects, []);
    p.assertReadOnly(); p.unmount();
  }
});

test("una página oculta no envía actividad falsa; volver a una página visible permite renovarla", async () => {
  const p = probe({ visible: false }); await flush();
  await p.advance(2 * MINUTE);
  assert.equal(p.heartbeatCalls().length, 0);
  await p.visibility(true); await p.emit("focus"); await p.advance(MINUTE);
  assert.ok(p.heartbeatCalls().length >= 1);
  assert.deepEqual(p.redirects, []);
  p.assertReadOnly(); p.unmount();
});

test("la actividad recibida mientras se confirma el heartbeat permanece pendiente para la siguiente renovación", async () => {
  const pendingHeartbeat = deferred();
  const p = probe({ heartbeat: [() => pendingHeartbeat.promise] }); await flush();
  assert.equal(p.heartbeatCalls().length, 1);
  await p.emit("mousemove");
  pendingHeartbeat.resolve(Response.json({ ok: true })); await flush();
  await p.advance(MINUTE);
  assert.equal(p.heartbeatCalls().length, 2, "La respuesta previa solo confirma la actividad enviada antes de la nueva interacción");
  p.assertReadOnly(); p.unmount();
});

test("un heartbeat temporalmente fallido conserva la actividad para reintentar sin otro clic", async () => {
  const p = probe(); await flush();
  p.queue.heartbeat.push(() => Response.json({ error: "Error temporal" }, { status: 500 }));
  await p.emit("scroll"); await p.advance(2 * MINUTE);
  assert.equal(p.heartbeatCalls().length, 3);
  assert.deepEqual(p.redirects, []);
  p.assertReadOnly(); p.unmount();
});

test("las consultas pendientes se cancelan a los quince segundos y pueden recuperarse", async () => {
  const pendingSession = deferred();
  const p = probe({ get: [() => pendingSession.promise] }); await flush();
  const request = p.sessionCalls()[0];
  await p.advance(15_001);
  assert.equal(request.init.signal.aborted, true);
  assert.deepEqual(p.redirects, []);
  await p.advance(2 * MINUTE);
  assert.ok(p.sessionCalls().length >= 2);
  assert.ok(p.heartbeatCalls().length >= 1);
  p.assertReadOnly(); p.unmount();
});

test("desmontar el guard cancela temporizadores y listeners sin peticiones posteriores", async () => {
  const p = probe(); await flush();
  const count = p.calls.length;
  p.unmount();
  assert.equal(p.window.listenerCount(), 0);
  assert.equal(p.document.listenerCount(), 0);
  await p.emit("click"); await p.advance(2 * HOUR);
  assert.equal(p.calls.length, count);
  assert.deepEqual(p.redirects, []);
  p.assertReadOnly();
});
