import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const version=JSON.parse(await readFile('package.json')).version;
async function files(dir){let out=[];for(const d of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+d.name;if(d.isDirectory())out.push(...await files(path));else out.push(path.slice(5));}return out;}
let html=await readFile('dist/index.html','utf8');
html=html.replace(/window\.APP_VERSION\s*=\s*'[^']*'/,`window.APP_VERSION = '${version}'`);
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const hash=createHash('sha256').update(inline).digest('base64');
const csp="default-src 'self'; script-src 'self' 'sha256-"+hash+"' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; media-src 'self' blob: https://syyealdlapxmpeccaary.supabase.co; worker-src 'self' blob:; connect-src 'self' https://syyealdlapxmpeccaary.supabase.co https://feed.evangelizo.org; object-src 'none'; base-uri 'self'; form-action 'none'";
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="'+csp+'">');await writeFile('dist/index.html',html);
const assets=(await files('dist')).filter(p=>p!=='sw.js'&&p!=='version.json');
await writeFile('dist/version.json',JSON.stringify({version}));
await writeFile('dist/sw.js',`const CACHE='cancionero-v${version}';const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cancionero-v')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(new URL(self.registration.scope).pathname))return;
if(r.mode==='navigate'){e.respondWith(fetch(r,{cache:'no-store'}).catch(()=>caches.open(CACHE).then(c=>c.match('index.html'))));return;}
if(u.pathname.endsWith('version.json')){e.respondWith(fetch(r,{cache:'no-store'}));return;}
e.respondWith(caches.open(CACHE).then(async c=>(await c.match(r))||fetch(r)));});`);
console.log(`Version ${version}; ${assets.length} public assets; no backend, tests, sources or secrets in dist.`);
