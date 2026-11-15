import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateEdition } from '../src/feed-schema.js';
import { publicEdition } from '../src/feed-catalogue.js';

export async function buildFeed(root, out, {publicOnly = false} = {}) {
  const source = resolve(root, 'content/feed');
  const files = (await readdir(resolve(source, 'editions'))).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  if (!files.length) throw new Error('No feed edition available');
  await mkdir(resolve(out, 'feed-data'), {recursive:true});
  const editions = [], items = new Map();
  for (const file of files) {
    const original = validateEdition(JSON.parse(await readFile(resolve(source, 'editions', file), 'utf8')));
    const e = publicOnly ? publicEdition(original) : original;
    if (file !== `${e.date}.json`) throw new Error('Edition date/filename mismatch');
    await writeFile(resolve(out, 'feed-data', file), JSON.stringify(e));
    if (!editions.length) await writeFile(resolve(out, 'feed-data/latest.json'), JSON.stringify(e));
    editions.push({date:e.date, count:e.items.length, publishedAt:e.publishedAt});
    for (const item of [...e.items,...(e.earlier || [])]) if (!items.has(item.id)) items.set(item.id, {...item, edition:e.date});
  }
  await writeFile(resolve(out, 'feed-data/index.json'), JSON.stringify({editions, items:[...items.values()]}));
  const sources = JSON.parse(await readFile(resolve(source, 'sources.json'), 'utf8'));
  const directory = {sources:sources.sources.map(({id,name,url,lane,format,homepage})=>({id,name,url:homepage || url,lane,format,homepage}))};
  await writeFile(resolve(out, 'feed-data/sources.json'), JSON.stringify(publicOnly ? directory : sources));
  if (!publicOnly) await writeFile(resolve(out, 'feed-data/taste.json'), JSON.stringify({text:await readFile(resolve(source, 'taste.md'), 'utf8')}));
}
