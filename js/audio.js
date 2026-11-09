import {URL_BASE,call} from './api.js';
import {esc} from './util.js';
import {confirmBox,toast} from './ui.js';
export const audioUrl=s=>s?.audio_path?`${URL_BASE}/storage/v1/object/public/cancionero-audio/${s.audio_path}`:'';
export function audioPlayer(s){return audioUrl(s)?`<audio controls preload="none" src="${esc(audioUrl(s))}" aria-label="Fragmento de ${esc(s.title)}"></audio>`:'';}
let cleanup=()=>{},dirty=false;
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
export const audioBusy=()=>dirty;
export function closeAudio(){cleanup();cleanup=()=>{};dirty=false;}
export function mountAudio(root,song,{canEdit,onSaved,onMass}){
 closeAudio();if(!song?.id||song.legacy||song.kind==='description'){root.innerHTML='';return;}
 let blob=null,preview='',recorder,stream,timer,ticker,duration=0,active=true,busy=false;
 const stop=()=>{clearTimeout(timer);clearInterval(ticker);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());};
 const visibility=()=>{if(document.hidden&&recorder?.state==='recording')stop();};document.addEventListener('visibilitychange',visibility);
 cleanup=()=>{document.removeEventListener('visibilitychange',visibility);active=false;stop();if(preview)URL.revokeObjectURL(preview);root.querySelectorAll('audio').forEach(a=>a.pause());};
 function render(){root.innerHTML=`<section class="song-audio"><h3>Reconoce esta canción</h3>${audioPlayer(song)||'<p class="note">Todavía no tiene un fragmento grabado.</p>'}${canEdit()?`<p class="note">Graba hasta 8 segundos de la melodía para identificarla.</p><div class="audio-tools"><button class="btn secondary" data-audio="record">${song.audio_path?'Grabar otro fragmento':'Grabar fragmento'}</button>${song.audio_path?'<button class="btn ghost" data-audio="delete">Borrar fragmento</button>':''}</div><p data-audio-status role="status"></p><div data-preview hidden><audio controls preload="none" aria-label="Escuchar grabación antes de guardar"></audio><div class="audio-tools"><button class="btn primary" data-audio="save">Guardar fragmento</button><button class="btn ghost" data-audio="discard">Descartar</button></div></div><button class="btn primary block" data-audio="mass">Añadir a la misa…</button>`:''}</section>`;}
 render();
 const status=text=>{const n=root.querySelector('[data-audio-status]');if(n)n.textContent=text;};
 function discard(){blob=null;dirty=false;if(preview)URL.revokeObjectURL(preview);preview='';render();}
 root.onclick=async e=>{
  const action=e.target.closest('[data-audio]')?.dataset.audio;if(!action||!canEdit()||busy)return;
  try{
   if(action==='mass')return await onMass(song);
   if(action==='discard')return discard();
   if(action==='record'){
    if(recorder?.state==='recording'){stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Este navegador no permite grabar. Abre Cancionero en Safari o Chrome actualizado.');
    if(blob&&!await confirmBox({title:'¿Grabar de nuevo?',message:'Se descartará la vista previa sin guardar.',okLabel:'Volver a grabar'}))return;
    busy=true;status('Solicitando acceso al micrófono…');
    try{stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1},video:false});}finally{busy=false;}
    if(!active||!canEdit()){stream.getTracks().forEach(t=>t.stop());return;}
    if(preview)URL.revokeObjectURL(preview);blob=null;root.querySelector('[data-preview]').hidden=true;
    const mimeType=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mimeType)throw new Error('No hay un formato de grabación compatible en este navegador.');
    recorder=new MediaRecorder(stream,{mimeType,audioBitsPerSecond:64000});const chunks=[];const start=performance.now();dirty=true;
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>{stop();dirty=false;status('La grabación falló. Puedes intentarlo otra vez.');};
    recorder.onstop=()=>{clearTimeout(timer);clearInterval(ticker);stream.getTracks().forEach(t=>t.stop());if(!active)return;duration=Math.min(8,(performance.now()-start)/1000);blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});render();if(duration<0.4||!blob.size){discard();return;}preview=URL.createObjectURL(blob);const panel=root.querySelector('[data-preview]');panel.hidden=false;panel.querySelector('audio').src=preview;status('Escucha el fragmento y guárdalo si se reconoce bien.');};
    recorder.start();e.target.textContent='Detener grabación';status('Grabando · 0 / 8 s');ticker=setInterval(()=>status(`Grabando · ${Math.min(8,Math.floor((performance.now()-start)/1000))} / 8 s`),200);timer=setTimeout(stop,8000);return;
   }
   if(action==='delete'&&!await confirmBox({title:'¿Borrar fragmento?',message:'La letra se conserva. El audio se quitará para todos.',okLabel:'Borrar',danger:true}))return;
   if(action==='save'||action==='delete'){
    if(action==='save'&&!blob)return;
    busy=true;dirty=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);status('Guardando…');
    const data={id:song.id,revision:song.revision};
    if(action==='save'){if(blob.size>262144)throw new Error('La grabación pesa demasiado. Graba un fragmento más corto.');const audio=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});Object.assign(data,{audio,type:blob.type,duration});}
    const result=await call(action==='save'?'audio_save':'audio_delete',data,{audio:true});song=result.song;discard();await onSaved(song);toast(action==='save'?'Fragmento guardado para todos.':'Fragmento borrado.');
   }
  }catch(error){stop();status(error.name==='NotAllowedError'?'Permite el micrófono en los ajustes del navegador para grabar.':error.message||'No se pudo grabar.');toast(error.message||'No se pudo grabar.',5000);}
  finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}
 };
}
