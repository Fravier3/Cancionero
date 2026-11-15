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
 let firstVisit=readStorage(KEY)===null;
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
 async function request(action,data,timeout=12000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await call(action,data,{signal:controller.signal});}
  catch(error){
   if(controller.signal.aborted)throw new Error('El servidor está tardando en responder. Intenta de nuevo.');
   throw error;
  }finally{clearTimeout(timer);}
 }
 function verifySession(){if(isEditor())request('verify',{},8000).catch(()=>{});}
 function clearCredentials(){pin.value='';password.value='';error.textContent='';}
 function show(){select.value=isEditor()?'editor':'viewer';usePassword=false;clearCredentials();screen.hidden=false;app.inert=true;renderCredentials();}
 function hide(){screen.hidden=true;app.inert=false;app.hidden=false;label();clearCredentials();}
 function enterFirstViewer(){
  firstVisit=false;
  hide();
  writeStorage(KEY,'viewer');
  requestAnimationFrame(()=>setTimeout(()=>{
   if(role==='viewer'&&screen.hidden)onChange?.('viewer');
  },0));
 }
 select.addEventListener('change',()=>{
  if(firstVisit&&select.value==='viewer'){enterFirstViewer();return;}
  usePassword=false;clearCredentials();renderCredentials();
 });
 method.addEventListener('click',()=>{usePassword=!usePassword;clearCredentials();renderCredentials(true);});
 pin.addEventListener('input',()=>{pin.value=pin.value.replace(/[^0-9]/g,'').slice(0,4);});
 document.querySelector('#mode-form').addEventListener('submit',async e=>{
  e.preventDefault();if(submit.disabled)return;
  error.textContent='';submit.disabled=true;method.disabled=true;select.disabled=true;
  try{
   if(select.value==='editor'){
    if(usePassword&&!password.value)throw new Error('Introduce la contraseña de Editor.');
    if(!usePassword&&!/^[0-9]{4}$/.test(pin.value))throw new Error('Introduce el PIN de 4 dígitos.');
    submit.textContent='Verificando…';
    const result=await request('login',{password:usePassword?password.value:'pin:'+pin.value});
    if(!result?.token||!(Date.parse(result.expiresAt)>Date.now()))throw new Error('El servidor no devolvió una sesión de Editor válida.');
    setSession(result);
    role='editor';
   }else{
    role='viewer';
    if(getSession()){
     request('logout',{},8000).catch(()=>{});
     clearSession().catch(()=>{});
    }
   }
   firstVisit=false;writeStorage(KEY,role);hide();await onChange?.(role);
  }catch(e){error.textContent=e.message;}
  finally{pin.value='';password.value='';submit.textContent='Entrar';submit.disabled=false;method.disabled=false;select.disabled=false;}
 });
 button.addEventListener('click',async()=>{if(await beforeChange())show();});
 window.addEventListener('cancionero:auth',()=>{
  if(role==='editor'&&!getSession()){
   role='viewer';writeStorage(KEY,role);label();onChange?.(role);
  }
 });
 const ready=Promise.resolve().then(async()=>{
  const saved=readStorage(KEY);
  if(saved==='editor'){
   submit.disabled=true;
   const session=await loadSession();
   submit.disabled=false;
   if(session){
    role='editor';hide();onChange?.(role);verifySession();
   }else{
    show();select.value='editor';renderCredentials();
   }
  }else if(saved==='viewer'){
   hide();onChange?.(role);
  }else if(select.value==='viewer'){
   enterFirstViewer();
  }else if(select.value==='editor'){
   renderCredentials();
  }else{
   show();select.value='';renderCredentials();
  }
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')verifySession();});
 return {isEditor,getRole:()=>role,isChoosing:()=>!screen.hidden,show:async()=>{if(await beforeChange())show();},ready};
}
