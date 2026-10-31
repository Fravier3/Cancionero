// Device preference, not authentication: visitors choose how much UI to show.
import { readStorage, writeStorage } from './util.js';
const KEY='cancionero.mode.v1';
export function initAccess({ onChange, beforeChange=async()=>true }) {
  let role=readStorage(KEY);
  if(!['editor','viewer'].includes(role))role=null;
  const screen=document.querySelector('#mode-screen'),select=document.querySelector('#mode-select');
  const app=document.querySelector('#app'),button=document.querySelector('#btn-mode');
  function label(){button.textContent=role==='editor'?'Editor':'Visor';button.setAttribute('aria-label','Cambiar modo: '+button.textContent);}
  function show(){select.value=role||'';screen.hidden=false;app.inert=true;requestAnimationFrame(()=>select.focus());}
  function hide(){screen.hidden=true;app.inert=false;app.hidden=false;label();}
  document.querySelector('#mode-form').addEventListener('submit',async e=>{
    e.preventDefault();const next=select.value;if(!['editor','viewer'].includes(next))return;
    role=next;writeStorage(KEY,role);hide();await onChange?.(role);
  });
  button.addEventListener('click',async()=>{if(await beforeChange())show();});
  if(role)hide();else show();
  return {isEditor:()=>role==='editor',getRole:()=>role,isChoosing:()=>!screen.hidden};
}
