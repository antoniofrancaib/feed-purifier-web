export const isConcept = item => item.format === 'Topic' || item.format === 'Primer';
export const formatLabel = item => isConcept(item) ? 'Concept' : item.format;
export const openLabel = item => item.format === 'Video' ? 'Watch' : item.format === 'Audio' ? 'Listen' : item.format === 'Playlist' ? 'Open playlist' : item.format === 'Repository' ? 'View repository' : isConcept(item) ? 'Explore concept' : /Paper|Preprint/.test(item.format) ? 'Read paper' : 'Read';
export const cardSummary = item => item.description || (item.why || '').match(/^.*?[.!?](?:\s+(?=[A-Z“])|$)/)?.[0].trim() || item.why;

export function publicDescription(value) {
  // Older editorial prompts sometimes mentioned private feedback in prose.
  // Drop those sentences as well as excluding structured preference fields.
  return String(value || '').split(/(?<=[.!?])\s+(?=[A-Z“])/).filter(sentence =>
    !/\b(you|your|reader|valued|liked|queued|saved|dismissed|antonio)\b|\bfeedback\b(?!\s+(?:loops?|control)\b)/i.test(sentence)).join(' ');
}

export function libraryItems(items, state, view = 'valuable') {
  const field = {valuable:'valuable', saved:'queued', read:'read'}[view] || 'valuable';
  return items.filter(item => state[item.id]?.[field]).sort((a,b) => (state[b.id]?.updatedAt || '').localeCompare(state[a.id]?.updatedAt || ''));
}

// Public publication is an explicit field allowlist. Raw feedback, model traces,
// collection failures and the old knowledge archive never enter this export.
export function publicItem(item) {
  const fields = ['id','url','title','lane','format','section','minutes','readingTimeBasis','source','by','published','why','description','takeaway','image','fit','evidenceBasis','edition','symbol','durationSeconds','audioSuitable','videoCount'];
  const result = Object.fromEntries(fields.filter(key => item[key] !== undefined).map(key => [key,item[key]]));
  result.why = publicDescription(item.why) || item.title;
  if (result.description) {
    const description = publicDescription(result.description);
    if (description) result.description = description;
    else delete result.description;
  }
  if (result.takeaway) result.takeaway = publicDescription(result.takeaway);
  result.links = (item.links || []).map(({url,label}) => ({url,label}));
  return result;
}

export function publicEdition(edition) {
  return {schema:edition.schema,date:edition.date,publishedAt:edition.publishedAt,budgetMinutes:edition.budgetMinutes,
    ...(edition.schema === 2 ? {nextAt:edition.nextAt,collections:Object.fromEntries(['home','news','video','audio','playlists'].map(key=>[key,edition.collections[key]]))} : {}),
    items:edition.items.map(publicItem),earlier:(edition.earlier || []).map(publicItem)};
}

export function collectionItems(edition, catalogue, key) {
  if (edition.collections?.[key]) {
    const lookup = new Map(edition.items.map(item=>[item.id,item]));
    return edition.collections[key].map(id=>lookup.get(id)).filter(Boolean);
  }
  if (key === 'video') return catalogue.filter(item=>item.format === 'Video');
  if (key === 'audio') return catalogue.filter(item=>item.format === 'Audio' || item.audioSuitable === true);
  if (key === 'playlists') return catalogue.filter(item=>item.format === 'Playlist');
  if (key === 'news') return edition.items.filter(item=>item.section === 'fresh');
  return edition.items;
}
