import {readStorage,writeStorage} from './util.js';
import {loadSession,getSession,setSession,clearSession} from './session.js';
import {call} from './api.js';
const KEY='cancionero.mode.v1';
export function initAccess({onChange,beforeChange=async()=>true}){
 let role='viewer';const screen=document.querySelector('#mode-screen'),select=document.querySelector('#mode-select'),app=document.querySelector('#app'),button=document.querySelector('#btn-mode');
 const password=document.querySelector('#mode-password'),field=document.querySelector('#mode-password-field'),error=document.querySelector('#mode-error'),submit=document.querySelector('#mode-submit');
 function label(){button.textContent=isEditor()?'Editor':'Visor';button.setAttribute('aria-label','Cambiar modo de acceso: '+button.textContent);}
 function isEditor(){const s=getSession();return role==='editor'&&Boolean(s)&&Date.parse(s.expiresAt)>Date.now();}
 function show(){select.value=isEditor()?'editor':'viewer';field.hidden=select.value!=='editor';screen.hidden=false;app.inert=true;error.textContent='';password.value='';password.focus();}
 function hide(){screen.hidden=true;app.inert=false;app.hidden=false;label();password.value='';}
 select.addEventListener('change',()=>{field.hidden=select.value!=='editor';if(select.value==='editor')password.focus();});
 document.querySelector('#mode-form').addEventListener('submit',async e=>{e.preventDefault();error.textContent='';submit.disabled=true;
 try{if(select.value==='editor'){
   if(!password.value)throw new Error('Introduce la contraseña de Editor.');
   const result=await call('login',{password:password.value});await setSession(result);role='editor';
  }else{if(getSession())await call('logout');await clearSession();role='viewer';}
  writeStorage(KEY,role);hide();await onChange?.(role);
 }catch(e){error.textContent=e.message;}finally{password.value='';submit.disabled=false;}});
 button.addEventListener('click',async()=>{if(await beforeChange())show();});
 window.addEventListener('cancionero:auth',()=>{if(!getSession()){role='viewer';label();onChange?.(role);}});
 const ready=(async()=>{await loadSession();const saved=readStorage(KEY);if(saved==='editor'&&getSession()){
  try{await call('verify');role='editor';}catch(error){if(error.status===401){await clearSession();role='viewer';}else{role='editor';}}
  hide();await onChange?.(role);
 }else if(saved==='viewer'){hide();await onChange?.('viewer');}else{show();select.value='';field.hidden=true;}})();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&getSession())call('verify').catch(()=>{});});
 return {isEditor,getRole:()=>role,isChoosing:()=>!screen.hidden,show:async()=>{if(await beforeChange())show();},ready};
}
