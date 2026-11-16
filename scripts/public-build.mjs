import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {buildFeed} from './feed-build.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const out = resolve(root,'.public-dist');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await buildFeed(root,out,{publicOnly:true});
// Copy individual public assets, never the legacy site's public/ or dist/ trees.
for (const file of ['favicon.svg','apple-touch-icon.png','icon-license.txt']) await cp(resolve(root,'public',file),resolve(out,file));
await mkdir(resolve(out,'fonts'),{recursive:true});
for (const file of ['Inter-latin.woff2','Inter-latin-ext.woff2','Inter-LICENSE.txt','DepartureMono-Regular.woff2','DepartureMono-LICENSE.txt']) await cp(resolve(root,'public/fonts',file),resolve(out,'fonts',file));
for (const [from,to] of [['src/styles.css','app.css'],['src/feed.css','feed.css']]) await cp(resolve(root,from),resolve(out,to));
const html = (await readFile(resolve(root,'index.html'),'utf8'))
  .replace('<head>','<head>\n  <script>globalThis.FEED_PUBLIC = true;</script>')
  .replace('  <link rel="stylesheet" href="/katex/katex.min.css">\n','');
await writeFile(resolve(out,'index.html'),html);
await writeFile(resolve(out,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · feed</title><link rel="stylesheet" href="/app.css"><body><main><h1>Page not found.</h1><p><a href="/today">Back to the edition →</a></p></main></body></html>');
await build({entryPoints:[resolve(root,'src/feed-shell.js')],bundle:true,minify:true,format:'esm',outfile:resolve(out,'app.js'),target:'es2022'});
let commit = process.env.VERCEL_GIT_COMMIT_SHA || null;
try { commit ||= execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch {}
let sourceCommit = commit;
try { sourceCommit = JSON.parse(await readFile(resolve(root,'deployment/source.json'),'utf8')).commit; } catch {}
await writeFile(resolve(out,'build-info.json'),JSON.stringify({commit,sourceCommit,builtAt:new Date().toISOString(),audience:'public'}));
await writeFile(resolve(out,'robots.txt'),'User-agent: *\nAllow: /\n');
console.log('Built public Home, News, Video, Audio and Playlists. Library and feedback remain private.');
