import { LANES, REASONS, safeURL, filterItems, readingTime } from './feed-schema.js';
import { FeedbackSync } from './feed-sync.js';
import { isConcept, formatLabel, openLabel, libraryItems, collectionItems, cardSummary } from './feed-catalogue.js';
const PUBLIC = globalThis.FEED_PUBLIC === true;
const OWNER_ORIGIN = 'https://antonio-learn.antoniofrancaib.workers.dev';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = (url, label, cls = '') => `<a data-library-link href="${esc(url)}" class="${cls}">${label}</a>`;
const external = (url, label, cls = '') => `<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer" class="${cls}">${label} <span aria-hidden="true">↗</span></a>`;
const lane = id => `<span class="f-lane ${id}">${LANES[id]}</span>`;
let state = {}, storageFailed = false, latest, index, sources, taste, loading, rerender, loadedAt = 0;
let syncStarted = false, refreshQueued = false, syncDetails = '';
const sync = PUBLIC ? {ready:Promise.resolve(),doc:{outbox:[],conflicts:[]},status:'',sync:async()=>{}} : new FeedbackSync((next, client) => {
  const details = JSON.stringify([client.doc.outbox.length,client.doc.conflicts,client.doc.lastSyncedAt]);
  const changed = JSON.stringify(next) !== JSON.stringify(state) || details !== syncDetails;
  syncDetails = details;
  state = next; storageFailed = client.store.storageFailed;
  for (const label of document.querySelectorAll('[data-feed-sync-status]')) label.textContent = client.status;
  updateSaveNotice(client);
  if (changed && rerender && document.body.classList.contains('feed-mode') && !refreshQueued) {
    refreshQueued = true;
    setTimeout(() => { refreshQueued = false; if(document.body.classList.contains('feed-mode')) rerender?.(); },0);
  }
});
const editions = new Map();
const choice = id => state[id] || {};
export const isFeedRoute = path => /^\/(?:home|today|news|video|watch|audio|playlists|library|canon|queue|cut|sources|taste|editions(?:\/\d{4}-\d{2}-\d{2})?|item\/[a-z0-9-]+)?\/?$/.test(path);
const json = async path => { const r = await fetch(path, {cache:'no-cache'}); if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new Error('Feed unavailable'); return r.json(); };
async function loadFeed() {
  if (!loading) loading = Promise.all(['/feed-data/latest.json','/feed-data/index.json','/feed-data/sources.json',...(!PUBLIC ? ['/feed-data/taste.json'] : [])].map(json)).then(values => {
    [latest, index, sources, taste] = values; editions.set(latest.date, latest); loadedAt = Date.now();
  }).catch(error => { loading = null; throw error; });
  return loading;
}
const itemURL = item => `/item/${item.id}`;
function actions(item, full = false) {
  if (PUBLIC) return full ? `<div class="f-actions">${external(item.url,openLabel(item),'f-btn primary')}</div>` : '';
  const s = choice(item.id);
  return `<div class="f-actions">${full ? external(item.url, openLabel(item), 'f-btn primary') : ''}${[['valuable','✓','Valuable'],['dismissed','×','Not for me'],['queued','+','Save'],['read','✓','Read']].map(([key, symbol, label]) => `<button type="button" class="f-btn ${full ? '' : 'quiet'}" data-feed-action="${key}" data-id="${item.id}" aria-pressed="${Boolean(s[key])}"><span aria-hidden="true">${symbol}</span> ${key === 'queued' && s[key] ? 'Saved' : label}</button>`).join('')}</div>`;
}
function media(item) {
  const concept = isConcept(item);
  const name = (item.by || item.source || '').replace(/^www\./,'');
  return `<div class="f-media${concept ? ' f-concept-art' : ''}"><div class="f-tile"><span>${esc(formatLabel(item))}</span><b>${esc(concept ? item.symbol || 'Aa' : name)}</b></div>${safeURL(item.image) ? `<img src="${esc(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
}
function duration(item) {
  if (item.format === 'Playlist') return item.videoCount ? `${item.videoCount} videos` : 'Playlist';
  const n = item.durationSeconds;
  if (!Number.isInteger(n) || n <= 0) return '';
  const h = Math.floor(n / 3600), m = Math.floor(n % 3600 / 60), sec = n % 60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}
const displayTime = item => item.format === 'Playlist' ? (item.videoCount ? `${item.videoCount} videos` : '') : ['Video','Audio'].includes(item.format) ? duration(item) : readingTime(item.minutes);
function card(item, withDescription = false) {
  const isMedia = ['Video','Audio','Playlist'].includes(item.format);
  const stamp = duration(item);
  return `<article class="f-item f-card${isMedia ? ' f-video' : ''}${!isMedia && !isConcept(item) && !item.image ? ' f-text-card' : ''}${choice(item.id).read ? ' muted' : ''}" data-feed-item="${item.id}">
    <a class="f-card-image" href="${esc(safeURL(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(openLabel(item) + ' ' + item.title)}">${media(item)}${stamp ? `<span class="f-duration">${stamp}</span>` : ''}</a>
    <div class="f-card-body"><h2>${external(item.url,esc(item.title))}</h2>${withDescription ? `<p class="f-card-description">${esc(cardSummary(item))}</p>` : ''}<div class="f-card-source" title="${esc(item.by || item.source)}">${esc(item.by || item.source)}</div><div class="f-card-meta">${lane(item.lane)}<span>${esc(formatLabel(item))}</span>${item.published ? `<time datetime="${esc(item.published)}">${formatDate(item.published)}</time>` : ''}${link(itemURL(item),'Details','f-card-details')}</div>${actions(item)}</div></article>`;
}
const icons = {
 home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
 news:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h5v5H7zM15 8h3M15 12h3M7 16h11"/>',
 video:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3Z"/>',
 audio:'<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
 playlists:'<path d="M3 5h15M3 10h15M3 15h7m4-1 7 4-7 4Z"/>',
 library:'<path d="M4 4h4v16H4zM11 4h4v16h-4zM18 4l3 15"/>'
};
function header(page) {
  const active = {'/today':'/home','/':'/home','/watch':'/video'}[page] || page;
  const libraryURL = PUBLIC ? `${OWNER_ORIGIN}/library` : '/library';
  document.querySelector('#library-navigation').innerHTML = [...['home','news','video','audio','playlists'].map(key=>['/'+key,key]),[libraryURL,'library']].map(([url,key]) => `<a data-library-link class="header-link${active === url ? ' is-current' : ''}${key === 'library' ? ' f-nav-library' : ''}" href="${url}"${active === url ? ' aria-current="page"' : ''}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg><span>${key[0].toUpperCase()+key.slice(1)}</span></a>`).join('');
  document.querySelector('#subject-navigation').innerHTML = `<form class="f-global-search" data-feed-search role="search"><label class="sr-only" for="feed-search">Search this section</label><input id="feed-search" name="q" type="search" value="${esc(new URLSearchParams(location.search).get('q') || '')}" placeholder="Search"><button type="submit" aria-label="Search"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></form>`;
  document.querySelector('#notebook-footer').innerHTML = `<span class="f-footer-links">${link('/sources','Sources')}${link('/editions','Archive')}${PUBLIC ? `<a href="${esc(OWNER_ORIGIN + location.pathname + location.search)}">Sign in</a>` : link('/taste','Settings')}${external('https://github.com/antoniofrancaib/feed-purifier-web','GitHub')}</span>`;
}
function updateSaveNotice(client) {
  const notice = document.querySelector('[data-save-notice]');
  if (!notice) return;
  const problem = /offline|signed out|unavailable|failed|review|could not|sign in|invalid|recovery|awaiting setup/i.test(client.status);
  notice.hidden = !problem;
  notice.innerHTML = problem ? `${esc(client.doc.conflicts.length ? 'A saved choice needs your attention.' : 'Changes are kept on this device. Sync needs attention.')} ${link('/taste','Review')}` : '';
}
function filterURL(key, value) {
  const p = new URLSearchParams(location.search);
  value === 'all' || !value ? p.delete(key) : p.set(key, value);
  return location.pathname + (p.size ? '?' + p : '');
}
function filters(items) {
  const params = new URLSearchParams(location.search), selected = params.get('lane') || 'all';
  return `<div class="f-toolbar"><nav class="f-lanes" aria-label="Topic">${[['all','All'],...Object.entries(LANES)].map(([id,label]) => `<a data-library-link href="${esc(filterURL('lane',id))}"${id === selected ? ' aria-current="true"' : ''}>${label}</a>`).join('')}</nav>${new Set(items.map(i=>i.format)).size > 1 ? `<select id="feed-format" aria-label="Format"><option value="all">All formats</option>${[...new Set(items.map(i=>i.format))].sort().map(f=>`<option${params.get('format') === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>` : ''}</div>`;
}
const formatDate = value => {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-GB',{day:'numeric',month:'short',...(date.getFullYear() !== new Date().getFullYear() ? {year:'numeric'} : {})}) : '';
};
function libraryView(items) {
  const view = new URLSearchParams(location.search).get('view') || 'valuable';
  const tabs = [['valuable','Valuable'],['saved','Saved for later'],['read','Read']];
  const chosen = libraryItems(items,state,view);
  const filtered = filterItems(chosen,Object.fromEntries(new URLSearchParams(location.search)));
  return `<nav class="f-library-tabs" aria-label="Library collections">${tabs.map(([key,label])=>`<a data-library-link href="${esc(filterURL('view',key))}"${view === key ? ' aria-current="page"' : ''}>${label}<span>${libraryItems(items,state,key).length}</span></a>`).join('')}</nav>${filtered.length ? `<div class="f-library-table"><div class="f-library-head"><span>WORK</span><span>FORMAT / SOURCE</span><span>TIME</span></div>${filtered.map(item=>`<article class="f-library-row" data-feed-item="${item.id}"><div><div class="f-meta">${lane(item.lane)}</div><h3>${link(itemURL(item),esc(item.title))}</h3>${actions(item)}</div><div class="f-library-source"><span>${esc(formatLabel(item))}</span><a href="${esc(safeURL(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.source)} ↗</a></div><span class="f-library-time">${displayTime(item) || '—'}</span></article>`).join('')}</div>` : `<div class="f-empty f-library-empty"><span class="f-empty-symbol" aria-hidden="true">f<span>.</span></span><h2>${chosen.length ? 'No matches.' : view === 'valuable' ? 'No valuable items yet.' : view === 'saved' ? 'Nothing saved for later.' : 'No read items yet.'}</h2><p>${chosen.length ? 'Try another topic or search.' : view === 'valuable' ? 'Mark a recommendation Valuable to add it here.' : view === 'saved' ? 'Save an item to keep it here.' : 'Items you mark Read will appear here.'}</p>${link('/today','Browse Home →')}</div>`}`;
}
function itemPage(item) {
  const s = choice(item.id);
  return `<div class="f-crumb">${link(item.edition ? `/editions/${item.edition}` : '/today','← Back to the edition')}</div><div class="f-detail"><article><div class="f-meta">${lane(item.lane)}<span>${esc(formatLabel(item))}</span>${displayTime(item) ? `<span>${displayTime(item)}</span>` : ''}<span>${esc(item.source)}</span></div>
  <h1 tabindex="-1">${esc(item.title)}</h1><p class="f-facts">${esc(item.by)}${item.published ? ` · ${esc(item.published)}` : ''}</p>${actions(item,true)}${media(item)}
  <section class="f-block"><h2>About</h2><p class="f-lede">${esc(item.why)}</p>${item.takeaway ? `<dl><dt>Summary</dt><dd>${esc(item.takeaway)}</dd></dl>` : ''}</section>
  <section class="f-block"><h2>The evidence</h2><p>${esc(item.signal || item.source)}</p><p class="f-hint">${esc(item.evidenceBasis || 'Source metadata')}. ${item.format === 'Preprint' ? 'This work has not necessarily been peer reviewed. ' : ''}</p></section></article>
  <aside><section class="f-block"><h2>At the source</h2><div class="f-evidence-links">${external(item.url,esc(item.source))}${(item.links || []).map(l=>external(l.url,esc(l.label))).join('')}</div></section>
  ${!PUBLIC ? `<section class="f-block"><h2>Your feedback</h2><div class="f-reasons">${REASONS.map(r=>`<button class="f-btn" data-feed-action="reason" data-id="${item.id}" data-reason="${r}" aria-pressed="${s.reason === r}">${r}</button>`).join('')}</div><p class="f-hint">${link('/taste','Settings →')}</p></section>` : ''}</aside></div>`;
}
function settingsPage(page) {
  if (page === '/sources') return `<div class="f-settings"><h1 tabindex="-1">Sources</h1><p class="f-intro">Research labs, journals, independent writers, podcasts and video collections. Refreshed every four days.</p><div class="f-source-list">${sources.sources.map(s=>{
    const health = latest.sources?.find(h=>h.id === s.id);
    return `<article><div><h2>${external(s.homepage || `https://${new URL(s.url).hostname.replace(/^api\./,'')}`,esc(s.name))}</h2><p>${esc(s.format === 'Video' ? 'Video' : s.lane === 'bio' ? 'Life sciences' : s.lane === 'x' ? 'AI × Bio' : 'AI & computing')}</p></div>${!PUBLIC && health && !health.ok ? '<span class="f-tag">Needs attention</span>' : ''}</article>`;
  }).join('')}</div></div>`;
  if (page === '/taste') return `<div class="f-settings"><h1 tabindex="-1">Settings</h1><div class="f-taste">${taste.text.split(/\n\s*\n/).filter(p=>!p.startsWith('#')).map(p=>`<p>${esc(p)}</p>`).join('')}</div><section class="f-block"><h2>Your feedback</h2><p>Manage your saved choices and editorial preferences.</p><p>${sync.doc.outbox.length} changes waiting · ${sync.doc.conflicts.length} conflicts${sync.doc.lastSyncedAt ? ` · Last fetched ${esc(new Date(sync.doc.lastSyncedAt).toLocaleString())}` : ''}</p><div class="f-actions"><button class="f-btn" data-feed-sync>Sync now</button><button class="f-btn" data-feed-export>Export backup</button>${external('https://github.com/antoniofrancaib/feed-purifier/edit/main/content/feed/taste.md','Edit the editorial brief','f-btn')}</div><p class="f-hint">${latest.feedback?.mode === 'cloud' ? `This edition incorporated ${latest.feedback.count} feedback items, fetched ${esc(new Date(latest.feedback.fetchedAt).toLocaleString())}.` : 'This edition has not yet incorporated automatically synchronized feedback.'}</p><p class="f-hint">${link('/cut','Editorial decisions')} · ${link('/sources','Source health')} · ${link('/subjects/machine-learning','Learn archive')}</p>${sync.doc.conflicts.map(c=>`<article class="f-block"><h3>${esc(c.item.title)}</h3><p>Both devices changed ${esc(c.field)}. Synced choice: ${esc(JSON.stringify(c.server?.value ?? false))}. Your pending choice: ${esc(JSON.stringify(c.value))}.</p><div class="f-actions"><button class="f-btn" data-feed-resolve="${c.eventId}" data-keep="true">Keep my change</button><button class="f-btn" data-feed-resolve="${c.eventId}">Use synced choice</button></div></article>`).join('')}</section></div>`;
  return `<div class="f-settings"><h1 tabindex="-1">Archive</h1><div class="f-source-list">${index.editions.map(e=>`<article>${link('/editions/'+e.date,formatDate(e.date)+' · '+e.date.slice(0,4))}<span>${e.count} picks</span></article>`).join('')}</div></div>`;
}

export async function renderFeed(main, current = () => true) {
  document.body.dataset.page = 'feed';
  document.body.classList.add('feed-mode');
  const path = location.pathname.replace(/\/$/, '') || '/home';
  const route = {'/today':'/home','/watch':'/video'}[path] || path;
  header(route.startsWith('/item/') || /^\/editions\//.test(route) ? '/today' : route);
  try { await loadFeed(); await sync.ready; } catch {
    if (current()) main.innerHTML = '<div class="f-settings"><h1 tabindex="-1">Your edition couldn’t load</h1><p>Please reload to try again.</p></div>';
    return 'Edition unavailable';
  }
  let edition = latest;
  if (/^\/editions\//.test(route)) {
    const day = route.split('/')[2];
    if (!editions.has(day)) {
      try { editions.set(day, await json(`/feed-data/${day}.json`)); } catch { edition = null; }
    }
    if (edition) edition = editions.get(day);
  }
  if (!current()) return;
  header(route.startsWith('/item/') || /^\/editions\//.test(route) ? '/today' : route);
  rerender = () => renderFeed(main, current);
  if (!PUBLIC && !syncStarted) { syncStarted = true; setTimeout(()=>void sync.sync(),0); }
  const all = new Map(index.items.map(i=>[i.id,i]));
  for (const s of Object.values(state)) if (s.item && !all.has(s.item.id)) all.set(s.item.id,s.item);
  if (!edition) {
    main.innerHTML = `<div class="f-settings"><h1 tabindex="-1">Edition not found</h1>${link('/today','Open the latest edition')}</div>`;
  } else if (route.startsWith('/item/')) {
    const item = all.get(route.split('/')[2]);
    main.innerHTML = item ? itemPage(item) : `<div class="f-settings"><h1 tabindex="-1">Item not found</h1>${link('/today','Back to today')}</div>`;
  } else if (PUBLIC && ['/library','/taste','/queue','/cut'].includes(route)) {
    location.replace(OWNER_ORIGIN + route); return;
  } else if (['/sources','/taste','/editions'].includes(route)) {
    main.innerHTML = settingsPage(route);
  } else {
    const archived = /^\/editions\//.test(route);
    const page = archived ? '/home' : route;
    const key = page.slice(1);
    const items = page === '/library' ? [...all.values()] : page === '/queue' ? [...all.values()].filter(i=>choice(i.id).queued) : page === '/canon' ? [...all.values()].filter(i=>i.section === 'canon') : collectionItems(edition,[...all.values()],key);
    const filtered = filterItems(items, Object.fromEntries(new URLSearchParams(location.search)));
    let contents;
    if (page === '/library') contents = libraryView(items);
    else if (page === '/cut') contents = (edition.cut || []).map(c=>`<article class="f-cut"><h3>${external(c.url,esc(c.title))}</h3><p>${esc(c.reason)}</p></article>`).join('');
    else contents = `<div class="f-card-grid${['/home','/news'].includes(page) ? ' f-reading-grid' : ''}">${filtered.map(item=>card(item,page === '/home')).join('')}</div>${!filtered.length ? '<div class="f-empty"><h2>No matches.</h2><p>Try another search or topic.</p></div>' : ''}`;
    const title = {'/home':'Home','/news':'News','/video':'Video','/audio':'Audio','/playlists':'Playlists','/library':'Library','/queue':'Saved for later','/canon':'Archive','/cut':'Editorial decisions'}[page] || 'Home';
    main.innerHTML = `<div class="f-browse"><div class="f-page-head"><h1 tabindex="-1">${archived ? formatDate(edition.date) : title}</h1>${page === '/library' ? link('/subjects/machine-learning','Learn archive ↗') : `<span>Updated ${formatDate(edition.date)}</span>`}</div>${page === '/cut' ? '' : filters(page === '/library' ? libraryItems(items,state,new URLSearchParams(location.search).get('view') || 'valuable') : items)}${contents}</div>`;
  }
  if (!PUBLIC) {
    main.insertAdjacentHTML('afterbegin',`<span class="sr-only" role="status" data-feed-sync-status>${esc(sync.status)}</span><p class="f-notice f-save-notice" data-save-notice hidden></p>`);
    updateSaveNotice(sync);
  }
  if (storageFailed) main.insertAdjacentHTML('afterbegin','<p class="f-notice" role="status">Device storage is unavailable. Pending choices may not survive a reload. Export a backup before closing.</p>');
  for (const image of main.querySelectorAll('.f-media img')) image.addEventListener('error',()=>{ const card = image.closest('.f-card'); image.remove(); if(card && !card.classList.contains('f-video') && !card.querySelector('.f-concept-art')) card.classList.add('f-text-card'); },{once:true});
  document.title = `feed-purifier · ${route.startsWith('/item/') ? 'Read' : route === '/home' ? 'Home' : route.split('/')[1]}`;
  return document.title;
}

document.addEventListener('click', async event => {
  if (PUBLIC || !document.body.classList.contains('feed-mode')) return;
  const button = event.target.closest('[data-feed-action]');
  if (button) {
    const {id, feedAction:action, reason} = button.dataset;
    const item = index.items.find(i=>i.id === id) || state[id]?.item;
    if (!item) return;
    try {
      await sync.change(item,['read','queued'].includes(action) ? action : 'opinion', current => {
        if (['read','queued'].includes(action)) return !current;
        const s = {...current};
        if (action === 'reason') { s.reason = s.reason === reason ? '' : reason; s.dismissed = Boolean(s.reason); if(s.dismissed) s.valuable = false; }
        else { s[action] = !s[action]; if(action === 'valuable' && s.valuable) {s.dismissed = false;s.reason = '';} if(action === 'dismissed') {if(s.dismissed) s.valuable = false; else s.reason = '';}}
        return s;
      });
    } catch { storageFailed = true; }
    await rerender?.();
    document.querySelector(`[data-feed-action="${action}"][data-id="${id}"]${reason ? `[data-reason="${reason}"]` : ''}`)?.focus({preventScroll:true});
    document.querySelector('#navigation-status').textContent = storageFailed ? 'Could not save to device storage' : sync.status;
  }
  if (event.target.closest('[data-feed-sync]')) { await sync.sync(); await rerender?.(); }
  const resolve = event.target.closest('[data-feed-resolve]');
  if (resolve) { await sync.resolve(resolve.dataset.feedResolve,resolve.dataset.keep === 'true'); await rerender?.(); }
  if (event.target.closest('[data-feed-export]')) {
    const items = Object.entries(state).map(([id,s])=>({id,title:s.item?.title,url:s.item?.url,valuable:Boolean(s.valuable),dismissed:Boolean(s.dismissed),read:Boolean(s.read),queued:Boolean(s.queued),reason:s.reason || '',updatedAt:s.updatedAt}));
    const url = URL.createObjectURL(new Blob([JSON.stringify({schema:1,exportedAt:new Date().toISOString(),items,pending:sync.doc.outbox,conflicts:sync.doc.conflicts},null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = `feed-feedback-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
});
document.addEventListener('submit', event => {
  if (!event.target.matches('[data-feed-search]')) return;
  event.preventDefault();
  const a = document.createElement('a'); a.href = filterURL('q',new FormData(event.target).get('q')); a.dataset.libraryLink = ''; document.body.append(a); a.click(); a.remove();
});
document.addEventListener('change', event => {
  if (event.target.id !== 'feed-format') return;
  const a = document.createElement('a'); a.href = filterURL('format',event.target.value); a.dataset.libraryLink = ''; document.body.append(a); a.click(); a.remove();
});
document.addEventListener('visibilitychange',()=>{
  if (!document.hidden && document.body.classList.contains('feed-mode')) void sync.sync();
  if (!document.hidden && document.body.classList.contains('feed-mode') && Date.now() - loadedAt > 15 * 60 * 1000) {
    loading = null;
    rerender?.();
  }
});
window.addEventListener('online',()=>void sync.sync());
window.addEventListener('focus',()=>{ if(document.body.classList.contains('feed-mode')) void sync.sync(); });
setInterval(()=>{ if(!document.hidden && document.body.classList.contains('feed-mode')) void sync.sync(); },60000);
