export type FortySixtyRow = {
  id: string; week: string; merchantName: string; deviceTag: string;
  loanAgeDays: number | null; numberOfPayments: number | null; loanRepaymentBiweek: number | null;
  cedula: string; status: "40/60 APROBADO" | "40/60 NO APROBADO"; pay40At60: 0 | 1 | null; paidInFull: boolean;
};
export type FortySixtyPayload = {
  recordName: string; week: string; fileName: string; sheetName: string; totalRows: number;
  ageReferenceDate: string | null; filteredRows: number;
  summary: { aprobados: number; noAprobados: number; cedulasEncontradas: number; cedulasPendientes: number };
  rows: FortySixtyRow[];
};
export type FortySixtyRecord = FortySixtyPayload & {
  id: number; revision: number; savedById: number | null; savedByName: string; savedByUser: string;
  savedAt: string; updatedAt: string;
};
export type FortySixtyDraft = {
  version: 1; owner: string; writerId: string; clientKey: string; recordId: number | null;
  baseRevision: number | null; updatedAt: number; autoSave: boolean;
  payload: FortySixtyPayload; createPayload?: FortySixtyPayload;
  pendingPatch?: { baseRevision: number; payload: FortySixtyPayload };
};
export type FortySixtyAutosaveState = {
  phase: "idle" | "pending" | "saving" | "saved" | "offline" | "error" | "conflict" | "restoring";
  dirty: boolean; backedUp: boolean; backupError: boolean; error: string;
  recordId: number | null; revision: number | null; savedAt: string | null;
};
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
type Pointer = { version: 1; owner: string; writerId: string; recordId: number | null; clientKey: string; draftKey: string | null; updatedAt: number };
type Dependencies = {
  owner: string; storage: StorageLike | null; session?: StorageLike | null; writerId?: string;
  request: (url: string, init?: RequestInit) => Promise<Response>;
  onState: (state: FortySixtyAutosaveState) => void;
  onHydrate: (payload: FortySixtyPayload, id: number | null, revision: number | null, restored: boolean) => void;
  onSaved?: (record: FortySixtyRecord) => void;
  now?: () => number; uuid?: () => string; schedule?: (fn: () => void, ms: number) => unknown; cancel?: (handle: unknown) => void;
};
const API = "/api/payjoy/40-60/registros";
const RETENTION = 7 * 24 * 60 * 60 * 1000;
const RETRIES = [2000, 5000, 15000];
const emptyState = (): FortySixtyAutosaveState => ({ phase: "idle", dirty: false, backedUp: false, backupError: false, error: "", recordId: null, revision: null, savedAt: null });
const validId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

// Only the fields needed to recover the working table enter browser storage.
export function normalizeFortySixtyPayload(value: unknown): FortySixtyPayload | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.rows) || !source.rows.length || source.rows.length > 100000) return null;
  const rows: FortySixtyRow[] = [];
  for (const item of source.rows) {
    if (!item || typeof item !== "object" || !["40/60 APROBADO", "40/60 NO APROBADO"].includes(item.status)) return null;
    rows.push({ id: text(item.id).trim(), week: text(item.week).trim(), merchantName: text(item.merchantName).trim(), deviceTag: text(item.deviceTag).trim().toUpperCase(),
      loanAgeDays: number(item.loanAgeDays), numberOfPayments: number(item.numberOfPayments), loanRepaymentBiweek: number(item.loanRepaymentBiweek),
      cedula: text(item.cedula).trim(), status: item.status, pay40At60: item.pay40At60 === 1 ? 1 : item.pay40At60 === 0 ? 0 : null, paidInFull: item.paidInFull === true });
  }
  const summary = { aprobados: 0, noAprobados: 0, cedulasEncontradas: 0, cedulasPendientes: 0 };
  for (const row of rows) { summary[row.status === "40/60 APROBADO" ? "aprobados" : "noAprobados"]++; summary[row.cedula.trim() ? "cedulasEncontradas" : "cedulasPendientes"]++; }
  const week = text(source.week).trim();
  return { recordName: text(source.recordName).trim() || `40/60 - ${week || "Semana"}`, week, fileName: text(source.fileName).trim(), sheetName: text(source.sheetName).trim(),
    totalRows: number(source.totalRows) ?? rows.length, filteredRows: rows.length, ageReferenceDate: /^\d{4}-\d{2}-\d{2}$/.test(text(source.ageReferenceDate)) ? text(source.ageReferenceDate) : null, summary, rows };
}
export function fortySixtyFingerprint(payload: FortySixtyPayload) { return JSON.stringify(normalizeFortySixtyPayload(payload)); }

export class FortySixtyAutosave {
  private readonly deps: Dependencies;
  private readonly prefix: string;
  private readonly writerId: string;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private state = emptyState();
  private draft: FortySixtyDraft | null = null;
  private baseline: string | null = null;
  private timer: unknown = null;
  private flight: Promise<void> | null = null;
  private retries = 0;
  private epoch = 0;
  private disposed = false;
  private sourceKey: string | null = null;
  private sourceRaw: string | null = null;
  private verificationNeeded = false;

  constructor(deps: Dependencies) {
    this.deps = deps; this.now = deps.now || Date.now; this.uuid = deps.uuid || (() => crypto.randomUUID());
    this.writerId = deps.writerId || this.uuid(); this.prefix = `conectamos:payjoy40-60:v1:${deps.owner}:`;
    this.schedule = deps.schedule || ((fn, ms) => setTimeout(fn, ms)); this.cancel = deps.cancel || (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
    if (!/^\d+:(?:\d+|usuario)$/.test(deps.owner)) throw new Error("Identidad de borrador inválida");
  }
  getState() { return { ...this.state }; }
  getPayload() { return this.draft?.payload || null; }
  private emit(next: Partial<FortySixtyAutosaveState> = {}) {
    this.state = { ...this.state, ...next, recordId: this.draft?.recordId ?? null, revision: this.draft?.baseRevision ?? null,
      dirty: Boolean(this.draft && fortySixtyFingerprint(this.draft.payload) !== this.baseline) };
    if (!this.disposed) this.deps.onState({ ...this.state });
  }
  private key(draft = this.draft) { return draft ? `${this.prefix}draft:${draft.recordId ? `cut-${draft.recordId}` : `new-${draft.clientKey}`}:${this.writerId}` : null; }
  private stopTimer() { if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  private pointer(draftKey: string | null): Pointer | null {
    return this.draft ? { version: 1, owner: this.deps.owner, writerId: this.writerId, recordId: this.draft.recordId, clientKey: this.draft.clientKey, draftKey, updatedAt: this.now() } : null;
  }
  private writePointer(draftKey: string | null, force = false) {
    const pointer = this.pointer(draftKey); if (!pointer) return;
    const value = JSON.stringify(pointer); const key = `${this.prefix}last`;
    try { this.deps.session?.setItem(key, value); } catch { /* Main backup can still work without session storage. */ }
    try {
      const old = this.readPointer(this.deps.storage?.getItem(key) || null);
      if (!draftKey && old?.draftKey && old.writerId !== this.writerId) return;
      if (force || !old || old.writerId === this.writerId) this.deps.storage?.setItem(key, value);
    } catch { /* Report the backup status through its own write. */ }
  }
  private backup(forcePointer = false) {
    if (!this.draft) return;
    this.draft.updatedAt = this.now();
    try {
      if (!this.deps.storage) throw new Error("Storage unavailable");
      this.deps.storage.setItem(this.key()!, JSON.stringify(this.draft));
      this.writePointer(this.key(), forcePointer); this.emit({ backedUp: true, backupError: false });
    } catch { this.emit({ backedUp: false, backupError: true }); }
  }
  private cleanBackup(savedPayload: FortySixtyPayload) {
    const snapshot = fortySixtyFingerprint(savedPayload);
    try {
      if (this.key()) this.deps.storage?.removeItem(this.key()!);
      if (this.sourceKey) {
        const raw = this.deps.storage?.getItem(this.sourceKey) || null;
        const source = this.readDraft(raw);
        if (raw === this.sourceRaw || source && fortySixtyFingerprint(source.payload) === snapshot) this.deps.storage?.removeItem(this.sourceKey);
      }
    } catch { /* Retention will remove inaccessible backups later. */ }
    this.sourceKey = null; this.sourceRaw = null; this.writePointer(null); this.emit({ backedUp: false, backupError: false });
  }
  private readPointer(raw: string | null): Pointer | null {
    try { const value = JSON.parse(raw || "null"); return value?.version === 1 && value.owner === this.deps.owner && Number.isFinite(value.updatedAt) && this.now() - value.updatedAt <= RETENTION && value.updatedAt <= this.now() + 60000 ? value : null; } catch { return null; }
  }
  private readDraft(raw: string | null): FortySixtyDraft | null {
    try {
      const value = JSON.parse(raw || "null"); const payload = normalizeFortySixtyPayload(value?.payload);
      if (!payload || value.version !== 1 || value.owner !== this.deps.owner || typeof value.clientKey !== "string" || !/^[\da-f-]{36}$/i.test(value.clientKey) || !Number.isFinite(value.updatedAt) || this.now() - value.updatedAt > RETENTION || value.updatedAt > this.now() + 60000) return null;
      if (value.recordId !== null && (!validId(value.recordId) || !validId(value.baseRevision))) return null;
      if (typeof value.writerId !== "string" || !value.writerId) return null;
      const createPayload = normalizeFortySixtyPayload(value.createPayload);
      const pendingPayload = normalizeFortySixtyPayload(value.pendingPatch?.payload);
      const pendingPatch = pendingPayload && validId(value.pendingPatch?.baseRevision) && value.pendingPatch.baseRevision === value.baseRevision
        ? { baseRevision: value.pendingPatch.baseRevision, payload: pendingPayload } : null;
      return { version: 1, owner: this.deps.owner, writerId: value.writerId, clientKey: value.clientKey, recordId: value.recordId, baseRevision: value.baseRevision,
        updatedAt: value.updatedAt, autoSave: value.autoSave === true, payload, ...(createPayload ? { createPayload } : {}), ...(pendingPatch ? { pendingPatch } : {}) };
    } catch { return null; }
  }
  private prune() {
    try {
      const storage = this.deps.storage; if (!storage) return;
      const keys: string[] = []; for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(`${this.prefix}draft:`)) keys.push(key); }
      for (const key of keys) if (!this.readDraft(storage.getItem(key))) storage.removeItem(key);
    } catch { /* A failing browser store must not block editing. */ }
  }
  open(record: FortySixtyRecord) {
    if (this.flight || !validId(record.id) || !validId(record.revision)) return false;
    const payload = normalizeFortySixtyPayload(record); if (!payload) return false;
    this.discard(); this.draft = { version: 1, owner: this.deps.owner, writerId: this.writerId, clientKey: this.uuid(), recordId: record.id, baseRevision: record.revision, updatedAt: this.now(), autoSave: true, payload };
    this.baseline = fortySixtyFingerprint(payload); this.writePointer(null, true); this.emit({ phase: "saved", savedAt: record.updatedAt, error: "" });
    this.deps.onHydrate(payload, record.id, record.revision, false); return true;
  }
  import(payload: FortySixtyPayload) {
    if (this.flight) return false;
    const clean = normalizeFortySixtyPayload(payload); if (!clean) return false;
    this.stopTimer(); this.epoch++;
    this.draft = this.draft ? { ...this.draft, payload: clean, autoSave: false } : { version: 1, owner: this.deps.owner, writerId: this.writerId, clientKey: this.uuid(), recordId: null, baseRevision: null, updatedAt: this.now(), autoSave: false, payload: clean };
    this.retries = 0; this.emit({ phase: "pending", error: "" }); this.backup(true); return true;
  }
  edit(payload: FortySixtyPayload) {
    const clean = normalizeFortySixtyPayload(payload); if (!clean || !this.draft) return;
    this.draft.payload = clean; this.draft.autoSave = true; this.retries = 0;
    this.backup();
    if (this.state.phase === "conflict") return;
    this.emit({ phase: this.flight ? "saving" : "pending", error: "" }); this.queue(1000);
  }
  private queue(delay: number) {
    this.stopTimer(); if (this.disposed || !this.draft?.autoSave || this.state.phase === "conflict") return;
    this.timer = this.schedule(() => { this.timer = null; void this.run(); }, delay);
  }
  async flush() {
    if (!this.draft || this.state.phase === "conflict") return;
    this.draft.autoSave = true; this.backup(); this.stopTimer(); this.retries = 0;
    if (this.verificationNeeded) await this.verifyCurrent();
    if (this.getState().phase !== "conflict" && !this.verificationNeeded) await this.run();
  }
  async retry() { if (this.state.phase !== "conflict") await this.flush(); }
  pause() { this.stopTimer(); }
  resume() { if (this.draft?.autoSave && this.state.dirty && this.state.phase !== "conflict") this.queue(1000); }
  private async run(): Promise<void> {
    if (this.flight) { await this.flight; if (this.draft?.autoSave && this.state.phase !== "conflict" && this.state.phase !== "error" && this.state.phase !== "offline" && this.state.dirty) await this.run(); return; }
    if (!this.draft?.autoSave || this.state.phase === "conflict" || this.disposed) return;
    if (this.verificationNeeded) { await this.verifyCurrent(); if (this.verificationNeeded || this.getState().phase === "conflict") return; }
    if (fortySixtyFingerprint(this.draft.payload) === this.baseline) { this.cleanBackup(this.draft.payload); this.emit({ phase: "saved" }); return; }
    const task = this.send(); this.flight = task;
    try { await task; } finally { this.flight = null; }
    if (!this.disposed && this.draft?.autoSave && this.state.phase === "pending") await this.run();
  }
  private async send() {
    const draft = this.draft!; const epoch = this.epoch; const oldKey = this.key();
    const creating = draft.recordId === null;
    if (creating && !draft.createPayload) { draft.createPayload = draft.payload; this.backup(); }
    const sent = creating ? draft.createPayload! : draft.payload;
    if (!creating) {
      // Persist the exact in-flight mutation before requesting it. A lost ACK or
      // power cut can then be reconciled without confusing later typing with it.
      draft.pendingPatch = { baseRevision: draft.baseRevision!, payload: sent };
      this.backup();
    }
    const controller = new AbortController(); const timeout = this.schedule(() => controller.abort(), 20000);
    this.emit({ phase: "saving", error: "" });
    try {
      const response = await this.deps.request(API, { method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
        body: JSON.stringify({ ...sent, ...(creating ? { clientKey: draft.clientKey } : { id: draft.recordId, expectedRevision: draft.baseRevision }) }) });
      const result = await response.json().catch(() => null);
      if (this.disposed || epoch !== this.epoch || this.draft !== draft) return;
      if (response.status === 409 && !creating) {
        this.verificationNeeded = true;
        await this.verifyCurrent();
        return;
      }
      if (response.status === 409) { this.emit({ phase: "conflict", error: "Este corte cambió en otra sesión. Tu avance sigue respaldado; revisa la versión guardada antes de continuar." }); this.backup(); return; }
      if (!response.ok || !validId(result?.registro?.id) || !validId(result?.registro?.revision)) {
        if (response.status >= 500 || response.status === 408 || response.status === 429) throw new Error("retry");
        this.emit({ phase: "error", error: typeof result?.error === "string" ? result.error : "No fue posible guardar el avance. El borrador se conserva." }); return;
      }
      const stored = creating ? normalizeFortySixtyPayload(result.registro) : normalizeFortySixtyPayload({ ...sent, ...result.registro, rows: sent.rows });
      if (!stored) throw new Error("invalid-response");
      const storedFingerprint = fortySixtyFingerprint(stored);
      if (creating && result.replayed === true && storedFingerprint !== fortySixtyFingerprint(sent) && storedFingerprint !== fortySixtyFingerprint(draft.payload)) {
        draft.recordId = result.registro.id; draft.baseRevision = result.registro.revision;
        this.emit({ phase: "conflict", error: "El corte recuperado tiene cambios de otra sesión. Se conserva tu respaldo y no se reemplazará automáticamente." }); this.backup(); return;
      }
      draft.recordId = result.registro.id; draft.baseRevision = result.registro.revision; delete draft.createPayload; delete draft.pendingPatch;
      this.baseline = storedFingerprint; this.retries = 0;
      const currentMatches = fortySixtyFingerprint(draft.payload) === storedFingerprint;
      if (currentMatches) draft.payload = stored;
      this.emit({ phase: currentMatches ? "saved" : "pending", savedAt: result.registro.updatedAt || new Date(this.now()).toISOString(), error: "" });
      if (currentMatches) this.cleanBackup(stored); else this.backup();
      if (oldKey && oldKey !== this.key() && (currentMatches || this.state.backedUp)) { try { this.deps.storage?.removeItem(oldKey); } catch { /* Retention cleanup. */ } }
      if (currentMatches || this.state.backedUp) this.writePointer(currentMatches ? null : this.key());
      this.deps.onSaved?.({ ...stored, ...result.registro, rows: stored.rows });
    } catch {
      if (this.disposed || epoch !== this.epoch) return;
      if (!creating) this.verificationNeeded = true;
      this.emit({ phase: "offline", error: "Sin conexión o sin respuesta del servidor. Conservamos el avance y volveremos a intentar." }); this.backup();
      if (this.retries < RETRIES.length) this.queue(RETRIES[this.retries++]);
    } finally { this.cancel(timeout); }
  }
  async restore() {
    if (this.draft || this.flight || this.disposed) return;
    this.prune(); let pointer: Pointer | null = null;
    try {
      const sessionPointer = this.readPointer(this.deps.session?.getItem(`${this.prefix}last`) || null);
      pointer = sessionPointer || this.readPointer(this.deps.storage?.getItem(`${this.prefix}last`) || null);
      if (this.deps.storage) {
        let latest: FortySixtyDraft | null = null; let latestKey: string | null = null;
        // A successful draft write can outlive a failed pointer update. With a
        // session pointer, only recover newer drafts from that same tab writer.
        // After a closed-browser restart, the newest owner-scoped draft wins.
        for (let i = 0; i < this.deps.storage.length; i++) {
          const key = this.deps.storage.key(i); if (!key?.startsWith(`${this.prefix}draft:`)) continue;
          const candidate = this.readDraft(this.deps.storage.getItem(key));
          if (candidate && (!sessionPointer || candidate.writerId === sessionPointer.writerId) &&
            (!pointer || candidate.updatedAt >= pointer.updatedAt) && (!latest || candidate.updatedAt >= latest.updatedAt)) { latest = candidate; latestKey = key; }
        }
        if (latest) pointer = { version: 1, owner: this.deps.owner, writerId: latest.writerId, recordId: latest.recordId, clientKey: latest.clientKey, draftKey: latestKey, updatedAt: latest.updatedAt };
      }
    } catch { this.emit({ backupError: true }); }
    if (!pointer) return;
    let draft: FortySixtyDraft | null = null;
    try { if (pointer.draftKey?.startsWith(`${this.prefix}draft:`)) draft = this.readDraft(this.deps.storage?.getItem(pointer.draftKey) || null); } catch { this.emit({ backupError: true }); }
    if (draft && (draft.recordId !== pointer.recordId || draft.clientKey !== pointer.clientKey)) draft = null;
    if (draft) {
      this.draft = { ...draft, writerId: this.writerId }; draft = this.draft; this.sourceKey = pointer.draftKey; this.baseline = null;
      try { this.sourceRaw = this.sourceKey ? this.deps.storage?.getItem(this.sourceKey) || null : null; } catch { this.sourceRaw = null; }
      if (draft.recordId) { this.verificationNeeded = true; await this.verifyCurrent(); }
      else { this.emit({ phase: "pending" }); this.deps.onHydrate(draft.payload, null, null, true); this.backup(true); if (draft.autoSave) this.queue(1000); }
    } else if (validId(pointer.recordId)) {
      const epoch = this.epoch; this.emit({ phase: "restoring" });
      try {
        const { response, result } = await this.readRecord(pointer.recordId);
        if (this.disposed || epoch !== this.epoch || this.draft) return;
        if (!response.ok || !result.registro || !this.open(result.registro)) this.emit({ phase: "error", error: "No fue posible recuperar el último corte guardado. Puedes consultarlo en el historial." });
      } catch { this.emit({ phase: "offline", error: "Sin conexión para recuperar el último corte guardado. Reintenta cuando vuelva la conexión." }); }
    }
  }
  private async readRecord(id: number) {
    const controller = new AbortController(); const timeout = this.schedule(() => controller.abort(), 20000);
    try {
      const response = await this.deps.request(`${API}?id=${id}`, { cache: "no-store", signal: controller.signal });
      return { response, result: await response.json().catch(() => null) };
    }
    finally { this.cancel(timeout); }
  }
  private async verifyCurrent() {
    const draft = this.draft; if (!draft?.recordId) return;
    const epoch = this.epoch; this.emit({ phase: "restoring" });
    try {
      const { response, result } = await this.readRecord(draft.recordId);
      if (this.disposed || epoch !== this.epoch || this.draft !== draft) return;
      if (response.status === 401 || response.status === 403) { this.emit({ phase: "error", error: "No tienes acceso para recuperar este corte." }); return; }
      if (response.status === 404) { this.verificationNeeded = false; this.emit({ phase: "conflict", error: "El corte ya no está disponible en el servidor. Conservamos el respaldo de este equipo." }); this.deps.onHydrate(draft.payload, draft.recordId, draft.baseRevision, true); this.backup(true); return; }
      const stored = normalizeFortySixtyPayload(result?.registro);
      if (!response.ok || !stored || !validId(result.registro.revision) || result.registro.id !== draft.recordId) throw new Error("unavailable");
      this.verificationNeeded = false; this.baseline = fortySixtyFingerprint(stored);
      const ownCommittedPatch = draft.pendingPatch && result.registro.revision === draft.pendingPatch.baseRevision + 1 &&
        this.baseline === fortySixtyFingerprint(draft.pendingPatch.payload);
      if (ownCommittedPatch) { draft.baseRevision = result.registro.revision; delete draft.pendingPatch; }
      if (this.baseline === fortySixtyFingerprint(draft.payload)) { draft.baseRevision = result.registro.revision; delete draft.pendingPatch; this.emit({ phase: "saved", savedAt: result.registro.updatedAt, error: "" }); this.cleanBackup(stored); }
      else if (result.registro.revision !== draft.baseRevision) this.emit({ phase: "conflict", error: "El servidor tiene otra revisión de este corte. Tu borrador se conserva y no reemplazará esos cambios." });
      else { delete draft.pendingPatch; this.emit({ phase: "pending", error: "" }); }
      if (ownCommittedPatch || this.state.phase === "saved") this.deps.onSaved?.({ ...stored, ...result.registro, rows: stored.rows });
      this.deps.onHydrate(draft.payload, draft.recordId, draft.baseRevision, true);
      if (this.state.dirty) this.backup(true);
      if (draft.autoSave && this.state.phase === "pending") this.queue(1000);
    } catch {
      if (this.disposed || epoch !== this.epoch) return;
      this.emit({ phase: "offline", error: "Sin conexión. Se recuperó el respaldo de este equipo; verificaremos la revisión antes de guardar." });
      this.deps.onHydrate(draft.payload, draft.recordId, draft.baseRevision, true); this.backup(true);
      if (draft.autoSave && this.retries < RETRIES.length) this.queue(RETRIES[this.retries++]);
    }
  }
  discard() {
    if (this.flight) return false;
    this.stopTimer(); this.epoch++;
    const key = this.key();
    try {
      if (key) this.deps.storage?.removeItem(key);
      if (this.sourceKey && this.sourceRaw && this.deps.storage?.getItem(this.sourceKey) === this.sourceRaw) this.deps.storage?.removeItem(this.sourceKey);
      const pointerKey = `${this.prefix}last`;
      const empty: Pointer = { version: 1, owner: this.deps.owner, writerId: this.writerId, recordId: null, clientKey: "", draftKey: null, updatedAt: this.now() };
      this.deps.session?.setItem(pointerKey, JSON.stringify(empty));
      const shared = this.readPointer(this.deps.storage?.getItem(pointerKey) || null);
      if (shared?.writerId === this.writerId || shared?.draftKey === key) this.deps.storage?.setItem(pointerKey, JSON.stringify(empty));
    } catch { /* No interruption of the current page. */ }
    this.draft = null; this.baseline = null; this.sourceKey = null; this.sourceRaw = null; this.verificationNeeded = false; this.retries = 0; this.state = emptyState(); this.emit(); return true;
  }
  dispose() { this.disposed = true; this.stopTimer(); this.epoch++; }
}
