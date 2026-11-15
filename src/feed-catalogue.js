export const isConcept = item => item.format === 'Topic' || item.format === 'Primer';
export const formatLabel = item => isConcept(item) ? 'Concept' : item.format;
export const openLabel = item => item.format === 'Video' ? 'Watch' : item.format === 'Repository' ? 'View repository' : isConcept(item) ? 'Explore concept' : /Paper|Preprint/.test(item.format) ? 'Read paper' : 'Read';
export const cardSummary = item => (item.why || '').match(/^.*?[.!?](?:\s|$)/)?.[0].trim() || item.why;

export function publicDescription(value) {
  // Older editorial prompts sometimes mentioned private feedback in prose.
  // Drop those sentences as well as excluding structured preference fields.
  return String(value || '').split(/(?<=[.!?])\s+(?=[A-Z“])/).filter(sentence =>
    !/\b(you|your|reader|feedback|valued|liked|queued|saved|dismissed|antonio)\b/i.test(sentence)).join(' ');
}

export function libraryItems(items, state, view = 'valuable') {
  const field = {valuable:'valuable', saved:'queued', read:'read'}[view] || 'valuable';
  return items.filter(item => state[item.id]?.[field]).sort((a,b) => (state[b.id]?.updatedAt || '').localeCompare(state[a.id]?.updatedAt || ''));
}

// Public publication is an explicit field allowlist. Raw feedback, model traces,
// collection failures and the old knowledge archive never enter this export.
export function publicItem(item) {
  const fields = ['id','url','title','lane','format','section','minutes','source','by','published','why','takeaway','image','fit','evidenceBasis','edition','symbol'];
  const result = Object.fromEntries(fields.filter(key => item[key] !== undefined).map(key => [key,item[key]]));
  result.why = publicDescription(item.why) || `Selected reading from ${item.source}.`;
  if (result.takeaway) result.takeaway = publicDescription(result.takeaway);
  result.links = (item.links || []).map(({url,label}) => ({url,label}));
  return result;
}

export function publicEdition(edition) {
  return {schema:1,date:edition.date,publishedAt:edition.publishedAt,budgetMinutes:edition.budgetMinutes,
    items:edition.items.map(publicItem),earlier:(edition.earlier || []).map(publicItem)};
}
