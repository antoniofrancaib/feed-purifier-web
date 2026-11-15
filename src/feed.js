import { LANES, SECTIONS, REASONS, safeURL, filterItems, readingTime, totalTime } from './feed-schema.js';
import { FeedbackSync } from './feed-sync.js';
import { isConcept, formatLabel, openLabel, libraryItems, cardSummary } from './feed-catalogue.js';
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
export const isFeedRoute = path => /^\/(?:today|watch|library|canon|queue|cut|sources|taste|editions(?:\/\d{4}-\d{2}-\d{2})?|item\/[a-z0-9-]+)?\/?$/.test(path);
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
  if (isConcept(item)) return `<div class="f-media f-concept-art"><span class="f-concept-symbol" aria-hidden="true">${esc(item.symbol || 'Aa')}</span><span>CONCEPT</span></div>`;
  const fallback = `<div class="f-tile"><b>${esc(formatLabel(item))}</b><span>${esc(readingTime(item.minutes))}<br>${esc(item.source)}</span></div>`;
  return `<div class="f-media">${fallback}${safeURL(item.image) ? `<img class="${item.fit === 'contain' ? 'contain' : ''}" src="${esc(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
}
function card(item, number, lead = false) {
  const s = choice(item.id);
  return `<article class="f-item${lead ? ' lead' : ''}${s.read || s.dismissed ? ' muted' : ''}" data-feed-item="${item.id}">
    <span class="f-number">${String(number).padStart(2,'0')}</span>
    <div class="f-body"><div class="f-meta">${lane(item.lane)}<span>${esc(formatLabel(item))}</span><span>${readingTime(item.minutes)}</span><span class="f-source">${esc(item.source)}</span></div>
    <h3>${link(itemURL(item), esc(item.title))}</h3><p class="f-why">${esc(cardSummary(item))}</p>
    <p class="f-signal">${s.read ? '<span class="f-tag">Read</span>' : ''}${s.queued ? '<span class="f-tag">In queue</span>' : ''}</p>
    <div class="f-open">${external(item.url, openLabel(item))}${link(itemURL(item), 'Details')}</div></div>
    ${media(item)}${actions(item)}</article>`;
}
function header(page) {
  const libraryURL = PUBLIC ? `${OWNER_ORIGIN}/library` : '/library';
  document.querySelector('#library-navigation').innerHTML = [['/today','Today'],['/watch','Watch'],[libraryURL,'Library']].map(([url,label]) => `<a data-library-link class="header-link${page === url ? ' is-current' : ''}" href="${url}"${page === url ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  document.querySelector('#subject-navigation').innerHTML = '';
  document.querySelector('#notebook-footer').innerHTML = `<span>feed<span class="f-stop">.</span> <span class="f-footer-motto">Attention, well spent.</span></span><span class="f-footer-links">${link('/sources','Sources')}${PUBLIC ? `<a href="${OWNER_ORIGIN}/today">Sign in</a>` : link('/taste','Settings')}${external('https://github.com/antoniofrancaib/feed-purifier-web','GitHub')}</span>`;
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
  return `<nav class="f-lanes" aria-label="Topic">${[['all','All'],...Object.entries(LANES)].map(([id,label]) => `<a data-library-link href="${esc(filterURL('lane',id))}"${id === selected ? ' aria-current="true"' : ''}>${id === 'all' ? label : lane(id)}<span>${id === 'all' ? items.length : items.filter(i=>i.lane === id).length}</span></a>`).join('')}</nav>
  <form class="f-search" data-feed-search><label for="feed-search">Search this selection</label><div><input id="feed-search" name="q" type="search" value="${esc(params.get('q') || '')}" placeholder="A topic, author or source"><button class="f-btn" type="submit">Find</button></div></form>
  <label class="f-format" for="feed-format">Format<select id="feed-format"><option value="all">Any format</option>${[...new Set(items.map(i=>i.format))].sort().map(f=>`<option${params.get('format') === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>`;
}
const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'long'});
function side(e, items, page) {
  const today = page === '/today';
  const minutes = e.items.filter(i=>i.section !== 'long').reduce((n,i)=>n+i.minutes,0);
  const titles = {'/watch':'Worth watching.','/library':'Your library.','/queue':'Saved for later.','/canon':'The archive.','/cut':'Editorial decisions'};
  return `<aside class="f-side"><p class="f-eyebrow">${today ? 'THE DAILY EDITION' : page === '/watch' ? 'TALKS · TUTORIALS · IDEAS' : 'A COLLECTION THAT GROWS WITH YOU'}</p>
  <h1 tabindex="-1">${today ? formatDate(e.date) : titles[page] || formatDate(e.date)}</h1>
  <p class="f-facts">${today ? `${e.items.length} picks · ${totalTime(minutes)}<br>AI, biology & everything between.` : page === '/watch' ? 'Make time for a good idea.' : page === '/library' ? 'The work you want to keep.' : ''}</p>
  ${page !== '/cut' ? filters(items) : ''}
  <div class="f-side-links">${link('/editions','Previous editions ↗')}${!PUBLIC && page === '/library' ? link('/subjects/machine-learning','Learn archive ↗') : ''}</div></aside>`;
}
function videoCard(item) {
  return `<article class="f-video" data-feed-item="${item.id}"><a class="f-video-image" href="${esc(safeURL(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${esc(item.title)}">${media(item)}<span class="f-play" aria-hidden="true">▶</span><span class="f-duration">${readingTime(item.minutes)}</span></a><div class="f-meta">${lane(item.lane)}<span>${esc(item.by || item.source)}</span></div><h3>${link(itemURL(item),esc(item.title))}</h3><p class="f-why">${esc(cardSummary(item))}</p>${actions(item)}</article>`;
}
function libraryView(items) {
  const view = new URLSearchParams(location.search).get('view') || 'valuable';
  const tabs = [['valuable','Valuable'],['saved','Saved for later'],['read','Read']];
  const chosen = libraryItems(items,state,view);
  const filtered = filterItems(chosen,Object.fromEntries(new URLSearchParams(location.search)));
  return `<nav class="f-library-tabs" aria-label="Library collections">${tabs.map(([key,label])=>`<a data-library-link href="${esc(filterURL('view',key))}"${view === key ? ' aria-current="page"' : ''}>${label}<span>${libraryItems(items,state,key).length}</span></a>`).join('')}</nav>${filtered.length ? `<div class="f-library-table"><div class="f-library-head"><span>WORK</span><span>FORMAT / SOURCE</span><span>TIME</span></div>${filtered.map(item=>`<article class="f-library-row" data-feed-item="${item.id}"><div><div class="f-meta">${lane(item.lane)}</div><h3>${link(itemURL(item),esc(item.title))}</h3><p>${esc(item.why)}</p>${actions(item)}</div><div class="f-library-source"><span>${esc(formatLabel(item))}</span><a href="${esc(safeURL(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.source)} ↗</a></div><span class="f-library-time">${readingTime(item.minutes)}</span></article>`).join('')}</div>` : `<div class="f-empty f-library-empty"><span class="f-empty-symbol" aria-hidden="true">f<span>.</span></span><h2>${chosen.length ? 'No matches.' : view === 'valuable' ? 'Keep what stays with you.' : view === 'saved' ? 'A little room for later.' : 'A record of good reading.'}</h2><p>${chosen.length ? 'Try another topic or search.' : view === 'valuable' ? 'Mark a recommendation Valuable to add it here.' : view === 'saved' ? 'Save something from Today or Watch.' : 'Items you mark Read will appear here.'}</p>${link('/today','Explore the edition →')}</div>`}`;
}
function itemPage(item) {
  const s = choice(item.id);
  return `<div class="f-crumb">${link(item.edition ? `/editions/${item.edition}` : '/today','← Back to the edition')}</div><div class="f-detail"><article><div class="f-meta">${lane(item.lane)}<span>${esc(formatLabel(item))}</span><span>${readingTime(item.minutes)}</span><span>${esc(item.source)}</span></div>
  <h1 tabindex="-1">${esc(item.title)}</h1><p class="f-facts">${esc(item.by)}${item.published ? ` · ${esc(item.published)}` : ''}</p>${actions(item,true)}${media(item)}
  <section class="f-block"><h2>Why it’s here</h2><p class="f-lede">${esc(item.why)}</p>${item.takeaway ? `<dl><dt>You’ll take away</dt><dd>${esc(item.takeaway)}</dd></dl>` : ''}</section>
  <section class="f-block"><h2>The evidence</h2><p>${esc(item.signal || 'Selected for topic fit.')}</p><p class="f-hint">Curation based on: ${esc(item.evidenceBasis || 'Source metadata')}. ${item.format === 'Preprint' ? 'This work has not necessarily been peer reviewed. ' : ''}Popularity does not establish correctness. Reading times are estimates.</p></section></article>
  <aside><section class="f-block"><h2>At the source</h2><div class="f-evidence-links">${external(item.url,esc(item.source))}${(item.links || []).map(l=>external(l.url,esc(l.label))).join('')}</div></section>
  ${!PUBLIC ? `<section class="f-block"><h2>Your feedback</h2><div class="f-reasons">${REASONS.map(r=>`<button class="f-btn" data-feed-action="reason" data-id="${item.id}" data-reason="${r}" aria-pressed="${s.reason === r}">${r}</button>`).join('')}</div><p class="f-hint">${link('/taste','Settings →')}</p></section>` : ''}</aside></div>`;
}
function settingsPage(page) {
  if (page === '/sources') return `<div class="f-settings"><p class="f-eyebrow">Where good work comes from</p><h1 tabindex="-1">The sources</h1><p class="f-intro">Independent writers, research labs, papers, videos and open code. Collected every 12 hours; assessed for substance and fit.</p><div class="f-source-list">${sources.sources.map(s=>{
    const health = latest.sources?.find(h=>h.id === s.id);
    return `<article><div><h2>${external(s.homepage || `https://${new URL(s.url).hostname.replace(/^api\./,'')}`,esc(s.name))}</h2><p>${esc(s.format === 'Video' ? 'Video' : s.lane === 'bio' ? 'Life sciences' : s.lane === 'x' ? 'AI × Bio' : 'AI & computing')}</p></div>${!PUBLIC && health && !health.ok ? '<span class="f-tag">Needs attention</span>' : ''}</article>`;
  }).join('')}</div></div>`;
  if (page === '/taste') return `<div class="f-settings"><p class="f-eyebrow">A feed with a point of view</p><h1 tabindex="-1">Settings</h1><p class="f-intro">Deepen your understanding of AI and life sciences. Keep the signal; make room to think.</p><div class="f-taste">${taste.text.split(/\n\s*\n/).filter(p=>!p.startsWith('#')).map(p=>`<p>${esc(p)}</p>`).join('')}</div><section class="f-block"><h2>Your feedback</h2><p>Manage your saved choices and editorial preferences.</p><p>${sync.doc.outbox.length} changes waiting · ${sync.doc.conflicts.length} conflicts${sync.doc.lastSyncedAt ? ` · Last fetched ${esc(new Date(sync.doc.lastSyncedAt).toLocaleString())}` : ''}</p><div class="f-actions"><button class="f-btn" data-feed-sync>Sync now</button><button class="f-btn" data-feed-export>Export backup</button>${external('https://github.com/antoniofrancaib/feed-purifier/edit/main/content/feed/taste.md','Edit the editorial brief','f-btn')}</div><p class="f-hint">${latest.feedback?.mode === 'cloud' ? `This edition incorporated ${latest.feedback.count} feedback items, fetched ${esc(new Date(latest.feedback.fetchedAt).toLocaleString())}.` : 'This edition has not yet incorporated automatically synchronized feedback.'}</p><p class="f-hint">${link('/cut','Editorial decisions')} · ${link('/sources','Source health')} · ${link('/subjects/machine-learning','Learn archive')}</p>${sync.doc.conflicts.map(c=>`<article class="f-block"><h3>${esc(c.item.title)}</h3><p>Both devices changed ${esc(c.field)}. Synced choice: ${esc(JSON.stringify(c.server?.value ?? false))}. Your pending choice: ${esc(JSON.stringify(c.value))}.</p><div class="f-actions"><button class="f-btn" data-feed-resolve="${c.eventId}" data-keep="true">Keep my change</button><button class="f-btn" data-feed-resolve="${c.eventId}">Use synced choice</button></div></article>`).join('')}</section></div>`;
  return `<div class="f-settings"><p class="f-eyebrow">The archive</p><h1 tabindex="-1">Previous editions</h1><div class="f-source-list">${index.editions.map(e=>`<article>${link('/editions/'+e.date,formatDate(e.date)+' · '+e.date.slice(0,4))}<span>${e.count} picks</span></article>`).join('')}</div></div>`;
}

export async function renderFeed(main, current = () => true) {
  document.body.dataset.page = 'feed';
  document.body.classList.add('feed-mode');
  const route = location.pathname.replace(/\/$/, '') || '/today';
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
    const page = /^\/editions\//.test(route) ? '/today' : route;
    const items = page === '/watch' ? [...all.values()].filter(i=>i.format === 'Video') : page === '/library' ? [...all.values()] : page === '/queue' ? [...all.values()].filter(i=>choice(i.id).queued) : page === '/canon' ? [...all.values()].filter(i=>i.section === 'canon') : edition.items;
    const filtered = filterItems(items, Object.fromEntries(new URLSearchParams(location.search)));
    let contents;
    if (page === '/watch') {
      contents = `<div class="f-section-head"><h2>The watchlist</h2><span>${filtered.length} selected videos</span></div><div class="f-video-grid">${filtered.map(videoCard).join('')}</div>${!filtered.length ? '<div class="f-empty"><h2>No matches.</h2><p>Try another topic or search.</p></div>' : ''}`;
    } else if (page === '/library') {
      contents = libraryView(items);
    } else if (page === '/cut') {
      contents = `<section class="f-section"><div class="f-section-head"><h2>Considered, then set aside</h2><span>${edition.cut.length} decisions</span></div>${edition.cut.map(c=>`<article class="f-cut"><h3>${external(c.url,esc(c.title))}</h3><p>${esc(c.reason)}</p><span>${esc(c.source)} · ${esc(c.signal)}</span></article>`).join('')}<p class="f-end">These are editorial judgements, not verdicts on the authors.</p></section>`;
    } else {
      contents = SECTIONS.map(section=>{
        const group = filtered.filter(i=>(isConcept(i) ? 'primer' : i.section) === section.id);
        return group.length ? `<section class="f-section"><div class="f-section-head"><h2>${section.label}</h2><span>${section.note}</span></div>${group.map(i=>card(i,items.findIndex(x=>x.id === i.id)+1,filtered[0] === i && page === '/today')).join('')}</section>` : '';
      }).join('') || `<div class="f-empty"><h2>${page === '/queue' ? 'A little room for later.' : 'Nothing in this selection.'}</h2><p>${page === '/queue' ? 'Use Queue on any recommendation to keep it here.' : 'Try another topic or clear your filters.'}</p>${link('/today','Explore today’s edition →')}</div>`;
    }
    const stale = Date.now() - Date.parse(edition.publishedAt) > 36 * 3600 * 1000 && edition.date === latest.date;
    main.innerHTML = `<div class="f-edition">${side(edition,page === "/library" ? libraryItems(items,state,new URLSearchParams(location.search).get("view") || "valuable") : items,page)}<div class="f-content">${stale ? '<p class="f-notice">The latest refresh is overdue. This is the last completed edition.</p>' : ''}${contents}${page === '/today' ? `<p class="f-end">Until the next edition. ${link('/editions','Browse the archive →')}</p>` : ''}</div></div>`;
  }
  if (!PUBLIC) {
    main.insertAdjacentHTML('afterbegin',`<span class="sr-only" role="status" data-feed-sync-status>${esc(sync.status)}</span><p class="f-notice f-save-notice" data-save-notice hidden></p>`);
    updateSaveNotice(sync);
  }
  if (storageFailed) main.insertAdjacentHTML('afterbegin','<p class="f-notice" role="status">Device storage is unavailable. Pending choices may not survive a reload. Export a backup before closing.</p>');
  for (const image of main.querySelectorAll('.f-media img')) image.addEventListener('error',()=>image.remove(),{once:true});
  document.title = `feed-purifier · ${route.startsWith('/item/') ? 'Read' : route === '/today' ? 'Today' : route.split('/')[1]}`;
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
