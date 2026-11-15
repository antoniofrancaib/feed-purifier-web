const DATABASE = 'feed-purifier-feedback';
const LEGACY = 'feed-purifier:state:v1';
const key = (id,field) => `${id}:${field}`;
export const emptyDocument = () => ({schema:2,server:{},outbox:[],conflicts:[],migrated:false,lastSyncedAt:null,revision:0,lease:null});

export function readingState(doc) {
  const state = Object.create(null);
  const apply = (id,field,value,item,updatedAt) => {
    const s = state[id] ||= {};
    if (item) s.item = item;
    if (updatedAt) s.updatedAt = updatedAt;
    if (field === 'opinion') Object.assign(s,value); else s[field] = value;
  };
  for (const r of Object.values(doc.server)) apply(r.id,r.field,r.value,r.item,r.updatedAt);
  for (const op of doc.outbox) apply(op.itemId,op.field,op.value,op.item,op.createdAt);
  return state;
}

export function queueChange(doc,item,field,value,options={}) {
  const predecessor = doc.outbox.findLast(o => o.itemId === item.id && o.field === field);
  doc.outbox.push({eventId:options.eventId || crypto.randomUUID(),itemId:item.id,field,value,item,
    baseVersion:options.migration ? 0 : doc.server[key(item.id,field)]?.version || 0,
    predecessor:predecessor?.eventId || null,createdAt:new Date().toISOString()});
}

export function importLegacy(doc,legacy) {
  if (doc.migrated) return;
  for (const [id,s] of Object.entries(legacy || {})) {
    if (!s?.item || !/^[a-z0-9-]{4,64}$/.test(id) || s.item.id !== id) continue;
    if ('valuable' in s || 'dismissed' in s || 'reason' in s) {
      queueChange(doc,s.item,'opinion',{valuable:Boolean(s.valuable),dismissed:!s.valuable && Boolean(s.dismissed),reason:!s.valuable && s.dismissed ? s.reason || '' : ''},{migration:true});
    }
    for (const field of ['read','queued']) if (typeof s[field] === 'boolean') queueChange(doc,s.item,field,s[field],{migration:true});
  }
  doc.migrated = true;
}

export function acknowledge(doc,op,reply) {
  if (reply.eventId !== op.eventId || typeof reply.applied !== 'boolean' || !Number.isSafeInteger(reply.version) || reply.version <= 0) throw new Error('Invalid save receipt');
  if (reply.record) {
    if (reply.record.id !== op.itemId || reply.record.field !== op.field) throw new Error('Mismatched save receipt');
    const k = key(op.itemId,op.field);
    if ((doc.server[k]?.version || 0) <= reply.record.version) doc.server[k] = reply.record;
  }
  if (reply.applied) {
    doc.outbox = doc.outbox.filter(o => o.eventId !== op.eventId);
    for (const successor of doc.outbox) if (successor.predecessor === op.eventId) {
      successor.baseVersion = reply.version; successor.predecessor = null;
    }
  } else {
    // Keep the latest local intention for explicit conflict resolution.
    const same = o => o.itemId === op.itemId && o.field === op.field;
    const latest = doc.outbox.findLast(same) || op;
    doc.conflicts = doc.conflicts.filter(c => !same(c));
    if (JSON.stringify(latest.value) !== JSON.stringify(reply.record?.value)) doc.conflicts.push({...latest,server:reply.record || null});
    doc.outbox = doc.outbox.filter(o => !same(o));
  }
}

export function mergeSnapshot(doc,records,revision) {
  for (const r of records) {
    if (!r || !/^[a-z0-9-]{4,64}$/.test(r.id) || !['opinion','read','queued'].includes(r.field) || !Number.isSafeInteger(r.version) || r.version < 1 || r.version > revision) throw new Error('Invalid feedback snapshot');
    const k = key(r.id,r.field);
    if ((doc.server[k]?.version || 0) <= r.version) doc.server[k] = r;
  }
  doc.revision = Math.max(doc.revision,revision);
  doc.lastSyncedAt = new Date().toISOString();
}

export class FeedbackStore {
  constructor(indexedDB = globalThis.indexedDB) {
    this.memory = emptyDocument(); this.storageFailed = false;
    this.database = new Promise((resolve,reject) => {
      if (!indexedDB) { reject(new Error('No device storage')); return; }
      const request = indexedDB.open(DATABASE,1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Device storage is blocked'));
    }).catch(() => { this.storageFailed = true; return null; });
  }
  async change(fn = () => {}) {
    const db = await this.database;
    if (!db) { fn(this.memory); return structuredClone(this.memory); }
    return new Promise((resolve,reject) => {
      const transaction = db.transaction('state','readwrite');
      const object = transaction.objectStore('state');
      const request = object.get('document'); let doc;
      request.onsuccess = () => {
        try { doc = request.result || emptyDocument(); fn(doc); object.put(doc,'document'); }
        catch (error) { transaction.abort(); reject(error); }
      };
      transaction.oncomplete = () => { this.memory = doc; resolve(structuredClone(doc)); };
      transaction.onerror = () => { this.storageFailed = true; reject(transaction.error); };
      transaction.onabort = () => reject(transaction.error || new Error('Could not save to device storage'));
    });
  }
}

export class FeedbackSync {
  constructor(onchange,store = new FeedbackStore(),fetcher = globalThis.fetch.bind(globalThis)) {
    this.store = store; this.fetcher = fetcher; this.onchange = onchange;
    this.owner = crypto.randomUUID(); this.doc = emptyDocument(); this.status = 'Checking saved choices…';
    this.ready = this.initialize();
  }
  async initialize() {
    let legacy = {};
    try { legacy = JSON.parse(globalThis.localStorage?.getItem(LEGACY) || '{}'); } catch {}
    try { this.doc = await this.store.change(doc => importLegacy(doc,legacy)); }
    catch {
      this.store.storageFailed = true;
      this.store.database = Promise.resolve(null);
      importLegacy(this.store.memory,legacy);
      this.doc = structuredClone(this.store.memory);
      this.status = 'Device storage unavailable · export before closing';
    }
    this.notify();
  }
  notify() { this.onchange?.(readingState(this.doc),this); }
  async change(item,field,next) {
    this.status = 'Saving on this device…'; this.notify();
    await this.ready;
    this.doc = await this.store.change(doc => {
      const current = readingState(doc)[item.id] || {};
      const value = typeof next === 'function' ? next(field === 'opinion' ? {valuable:Boolean(current.valuable),dismissed:Boolean(current.dismissed),reason:current.reason || ''} : Boolean(current[field])) : next;
      doc.conflicts = doc.conflicts.filter(c => c.itemId !== item.id || c.field !== field);
      queueChange(doc,item,field,value);
    });
    this.status = 'Saved on this device · waiting to sync'; this.notify();
    void this.sync();
  }
  async resolve(eventId,keepMine) {
    this.doc = await this.store.change(doc => {
      const conflict = doc.conflicts.find(c => c.eventId === eventId);
      if (!conflict) return;
      doc.conflicts = doc.conflicts.filter(c => c.eventId !== eventId);
      if (keepMine) queueChange(doc,conflict.item,conflict.field,conflict.value);
    });
    this.notify(); void this.sync();
  }
  async request(path,options={}) {
    const response = await this.fetcher(path,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000),...options});
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Sign in again to sync · device saves kept');
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Sign in again to sync · device saves kept');
      if (data.error === 'feedback_not_configured') throw new Error('Cloud sync awaiting setup · saved on this device');
      if (data.error === 'unknown_item') throw new Error('An older saved item needs recovery · export feedback as a backup');
      throw new Error('Sync unavailable · device saves kept');
    }
    return data;
  }
  async sync() {
    await this.ready;
    if (this.running) return this.running;
    const locks = globalThis.navigator?.locks;
    // Web Locks release automatically on page termination. They allow a fresh
    // page to take over a crashed tab's durable lease without a 30-second wait.
    this.running = (locks ? locks.request('feed-purifier-sync',{ifAvailable:true},async lock => {
      if (lock) return this.run(true);
      this.doc = await this.store.change(); this.status = 'Syncing in another tab'; this.notify();
    }) : this.run()).catch(() => {
      this.status = 'Device storage unavailable · export before closing'; this.notify();
    }).finally(() => { this.running = null; });
    return this.running;
  }
  async run(exclusiveLock = false) {
    let acquired = false;
    try {
      this.doc = await this.store.change(doc => {
        if (!exclusiveLock && doc.lease && doc.lease.owner !== this.owner && doc.lease.until > Date.now()) return;
        doc.lease = {owner:this.owner,until:Date.now()+30000}; acquired = true;
      });
      if (!acquired) { this.notify(); return; }
      this.status = 'Syncing…'; this.notify();
      // Only a complete, revision-pinned snapshot is merged. New writes during
      // pagination cannot move records across pages or silently omit a choice.
      const records = []; let revision, after = 0;
      do {
        const params = revision === undefined ? '' : `?revision=${revision}&after=${after}`;
        const page = await this.request(`/api/feedback${params}`);
        if (page.schema !== 2 || !Number.isSafeInteger(page.revision) || page.revision < 0 || !Array.isArray(page.records) ||
            (revision !== undefined && page.revision !== revision)) throw new Error('Invalid feedback snapshot');
        revision = page.revision; records.push(...page.records);
        if (page.next !== null && (!Number.isSafeInteger(page.next) || page.next <= after || page.next > revision)) throw new Error('Invalid feedback cursor');
        after = page.next;
        await this.renewLease();
      } while (after !== null);
      this.doc = await this.store.change(doc => mergeSnapshot(doc,records,revision)); this.notify();
      // A bounded pass prevents an endless loop if another tab is very active.
      for (let n = 0; n < 300; n++) {
        await this.renewLease();
        const op = this.doc.outbox[0]; if (!op) break;
        const {eventId,itemId,field,value,baseVersion} = op;
        const reply = await this.request('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json','X-Feed-Request':'1'},body:JSON.stringify({eventId,itemId,field,value,baseVersion})});
        this.doc = await this.store.change(doc => acknowledge(doc,op,reply)); this.notify();
      }
      this.status = this.doc.conflicts.length ? 'Changes need review · open Taste' : this.doc.outbox.length ? 'Saved on this device · waiting to sync' : 'Saved across devices';
    } catch (error) {
      this.status = error.name === 'TypeError' || error.name === 'TimeoutError' ? 'Offline or signed out · device saves kept' : error.message;
    } finally {
      if (acquired) try {
        this.doc = await this.store.change(doc => { if (doc.lease?.owner === this.owner) doc.lease = null; });
      } catch { this.status = 'Device storage unavailable · export before closing'; }
      this.notify();
    }
  }
  async renewLease() {
    this.doc = await this.store.change(doc => {
      if (doc.lease?.owner !== this.owner) throw new Error('Sync continued in another tab');
      doc.lease.until = Date.now()+30000;
    });
  }
}
