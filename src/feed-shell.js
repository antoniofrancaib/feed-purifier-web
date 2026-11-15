import { isFeedRoute, renderFeed } from './feed.js';

const main = document.querySelector('#main');
const status = document.querySelector('#navigation-status');
let revision = 0;
async function render(focus = false) {
  const own = ++revision;
  const title = await renderFeed(main,()=>own === revision);
  if (own !== revision) return;
  status.textContent = title || '';
  if (focus) { main.querySelector('h1')?.focus({preventScroll:true}); window.scrollTo(0,0); }
}
document.addEventListener('click',event=>{
  const a = event.target.closest('a[data-library-link]');
  if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(a.href);
  if (url.origin !== location.origin || !isFeedRoute(url.pathname)) return;
  event.preventDefault();
  history.pushState(null,'',url.pathname+url.search+url.hash);
  render(true);
});
window.addEventListener('popstate',()=>isFeedRoute(location.pathname) ? render(true) : location.reload());
const theme = document.querySelector('#theme-button');
const system = matchMedia('(prefers-color-scheme: dark)');
let selected;
try { selected = localStorage.getItem('knowledge-theme'); } catch {}
function setTheme(value) {
  document.documentElement.dataset.theme = value;
  theme.setAttribute('aria-label',value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  theme.title = theme.getAttribute('aria-label');
}
setTheme(selected || (system.matches ? 'dark' : 'light'));
theme.addEventListener('click',()=>{
  selected = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(selected);
  try {localStorage.setItem('knowledge-theme',selected);} catch {}
});
system.addEventListener('change',e=>{if(!selected) setTheme(e.matches ? 'dark' : 'light');});
render();
