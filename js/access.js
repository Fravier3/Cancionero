import {readStorage,writeStorage} from './util.js';
import {loadSession,getSession,setSession,clearSession} from './session.js';
import {call} from './api.js';
const KEY='cancionero.mode.v1';
export function initAccess({onChange,beforeChange=async()=>true}){
 let role='viewer';const screen=document.querySelector('#mode-screen'),select=document.querySelector('#mode-select'),app=document.querySelector('#app'),button=document.querySelector('#btn-mode');
 const password=document.querySelector('#mode-password'),passwordField=document.querySelector('#mode-password-field');
 const pin=document.querySelector('#mode-pin'),pinField=document.querySelector('#mode-pin-field'),method=document.querySelector('#mode-method');
 const error=document.querySelector('#mode-error'),submit=document.querySelector('#mode-submit');
 let usePassword=false;
 function label(){button.textContent=isEditor()?'Editor':'Visor';button.setAttribute('aria-label','Cambiar modo de acceso: '+button.textContent);}
 function isEditor(){const s=getSession();return role==='editor'&&Boolean(s)&&Date.parse(s.expiresAt)>Date.now();}
 function renderCredentials(focus=false){
  const editor=select.value==='editor';
  pinField.hidden=!editor||usePassword;
  passwordField.hidden=!editor||!usePassword;
  method.hidden=!editor;
  method.textContent=usePassword?'Usar PIN':'Usar contraseña';
  if(focus&&editor)(usePassword?password:pin).focus();
 }
 function clearCredentials(){pin.value='';password.value='';error.textContent='';}
 function show(){select.value=isEditor()?'editor':'viewer';usePassword=false;clearCredentials();screen.hidden=false;app.inert=true;renderCredentials(true);}
 function hide(){screen.hidden=true;app.inert=false;app.hidden=false;label();clearCredentials();}
 select.addEventListener('change',()=>{usePassword=false;clearCredentials();renderCredentials(true);});
 method.addEventListener('click',()=>{usePassword=!usePassword;clearCredentials();renderCredentials(true);});
 pin.addEventListener('input',()=>{pin.value=pin.value.replace(/[^0-9]/g,'').slice(0,4);});
 document.querySelector('#mode-form').addEventListener('submit',async e=>{
  e.preventDefault();if(submit.disabled)return;
  error.textContent='';submit.disabled=true;method.disabled=true;select.disabled=true;
  try{
   if(select.value==='editor'){
    if(usePassword&&!password.value)throw new Error('Introduce la contraseña de Editor.');
    if(!usePassword&&!/^[0-9]{4}$/.test(pin.value))throw new Error('Introduce el PIN de 4 dígitos.');
    const result=await call('login',{password:usePassword?password.value:'pin:'+pin.value});
    await setSession(result);role='editor';
   }else{if(getSession())await call('logout');await clearSession();role='viewer';}
   writeStorage(KEY,role);hide();await onChange?.(role);
  }catch(e){error.textContent=e.message;}
  finally{pin.value='';password.value='';submit.disabled=false;method.disabled=false;select.disabled=false;}
 });
 button.addEventListener('click',async()=>{if(await beforeChange())show();});
 window.addEventListener('cancionero:auth',()=>{if(!getSession()){role='viewer';label();onChange?.(role);}});
 const ready=(async()=>{await loadSession();const saved=readStorage(KEY);if(saved==='editor'&&getSession()){
  try{await call('verify');role='editor';}catch(error){if(error.status===401){await clearSession();role='viewer';}else{role='editor';}}
  hide();await onChange?.(role);
 }else if(saved==='viewer'){hide();await onChange?.('viewer');}else{show();select.value='';renderCredentials();}})();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&getSession())call('verify').catch(()=>{});});
 return {isEditor,getRole:()=>role,isChoosing:()=>!screen.hidden,show:async()=>{if(await beforeChange())show();},ready};
}
