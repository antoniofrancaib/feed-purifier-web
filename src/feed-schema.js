export const LANES = { ai: 'AI', bio: 'Bio', x: 'AI × Bio' };
export const SECTIONS = [
  { id: 'fresh', label: 'Fresh this week', note: 'New work worth your attention' },
  { id: 'canon', label: 'Worth returning to', note: 'Ideas beyond the news cycle' },
  { id: 'long', label: 'Go deeper', note: 'Make a little more time' },
  { id: 'primer', label: 'A concept to explore', note: 'Build your understanding' },
];
export const REASONS = ['Too basic', 'Too advanced', 'Already know it', 'Not my topic', 'Hype', 'Weak source'];
export function safeURL(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function validateEdition(e) {
  const fail = message => { throw new Error(`Feed edition: ${message}`); };
  if (![1,2].includes(e.schema) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isFinite(Date.parse(e.publishedAt))) fail('invalid identity');
  if (!Array.isArray(e.items) || e.items.length < 1 || e.items.length > (e.schema === 2 ? 160 : 12)) fail('invalid item count');
  if (e.schema === 1 && (!Number.isInteger(e.budgetMinutes) || e.budgetMinutes < 1 || e.budgetMinutes > 180)) fail('invalid reading budget');
  const ids = new Set();
  for (const i of e.items) {
    if (!/^[a-z0-9-]{4,64}$/.test(i.id) || ids.has(i.id)) fail('invalid or duplicate item ID');
    ids.add(i.id);
    if (!safeURL(i.url) || typeof i.title !== 'string' || !i.title.trim() || typeof i.why !== 'string' || !i.why.trim() || typeof i.format !== 'string' || !Object.hasOwn(LANES, i.lane) || !SECTIONS.some(s => s.id === i.section)) fail(`invalid item ${i.id}`);
    if (!Number.isInteger(i.minutes) || i.minutes < 1 || i.minutes > 1440) fail(`invalid duration ${i.id}`);
    if (i.image && !safeURL(i.image)) fail('invalid image URL');
    if (i.description !== undefined && (typeof i.description !== 'string' || !i.description.trim() || i.description.length > 280 || /[<>\n\r]/.test(i.description))) fail('invalid description');
    if (i.durationSeconds !== undefined && (!Number.isInteger(i.durationSeconds) || i.durationSeconds < 0)) fail('invalid media duration');
    if (i.audioSuitable !== undefined && typeof i.audioSuitable !== 'boolean') fail('invalid audio classification');
    if (i.videoCount !== undefined && (!Number.isInteger(i.videoCount) || i.videoCount < 1)) fail('invalid playlist count');
    for (const l of i.links || []) if (!safeURL(l.url)) fail('invalid evidence link');
  }
  if (e.schema === 1 && e.items.filter(i=>i.section !== 'long').reduce((n,i)=>n+i.minutes,0) > e.budgetMinutes) fail('reading budget exceeded');
  if (e.schema === 2) {
    if (!Number.isFinite(Date.parse(e.nextAt))) fail('invalid next refresh');
    for (const key of ['home','news','video','audio','playlists']) {
      const list = e.collections?.[key];
      if (!Array.isArray(list) || list.length > 60 || new Set(list).size !== list.length || list.some(id=>!ids.has(id))) fail(`invalid ${key} collection`);
      const selected = list.map(id=>e.items.find(item=>item.id === id));
      if (key === 'video' && selected.some(item=>item.format !== 'Video')) fail('non-video in Video');
      if (key === 'audio' && selected.some(item=>item.format !== 'Audio' && !(item.format === 'Video' && item.audioSuitable))) fail('non-listenable item in Audio');
      if (key === 'playlists' && selected.some(item=>item.format !== 'Playlist')) fail('non-playlist in Playlists');
      if (key === 'news' && selected.some(item=>!Number.isFinite(Date.parse(item.published)) || Date.parse(e.date)-Date.parse(item.published) < 0 || Date.parse(e.date)-Date.parse(item.published) > 14*86400000)) fail('undated or stale news');
    }
  }
  if (e.earlier !== undefined && !Array.isArray(e.earlier)) fail('invalid earlier picks');
  for (const item of e.earlier || []) {
    if (ids.has(item.id)) fail('duplicate earlier pick');
    if (!SECTIONS.some(s=>s.id === item.section)) fail('invalid earlier section');
    validateEdition({...e,schema:1,budgetMinutes:180,items:[{...item,section:'long'}],earlier:[]});
    ids.add(item.id);
  }
  for (const c of e.cut || []) if (!safeURL(c.url) || !c.reason) fail('invalid cut record');
  return e;
}
export const readingTime = minutes => minutes >= 90 ? `≈ ${Math.round(minutes / 60)} h` : `≈ ${minutes} min`;
export const totalTime = minutes => minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} m` : ''}` : `${minutes} min`;
export function filterItems(items, { lane = 'all', format = 'all', q = '' } = {}) {
  const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(i => (lane === 'all' || i.lane === lane) && (format === 'all' || i.format === format) && terms.every(t => `${i.title} ${i.source} ${i.by || ''} ${i.why}`.toLowerCase().includes(t)));
}
