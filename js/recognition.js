import {call} from './api.js';
import {readLyricsFromImage} from './ocr.js';
import {readStorage,writeStorage} from './util.js';
const FAVORITES='cancionero.ai-favorites';
let photo=null;
export const clearPhoto=()=>{photo=null;const button=document.querySelector('#reprocess-photo');if(button)button.hidden=true;};
export const getPhoto=()=>photo;
export const hasPhoto=()=>Boolean(photo);
function readFavorites(){try{return JSON.parse(readStorage(FAVORITES,'[]')).filter(x=>typeof x==='string').slice(0,12);}catch{return [];}}
export function initRecognition(){
 const quick=document.querySelector('#ai-quick'),instructions=document.querySelector('#ai-instructions'),favorites=document.querySelector('#ai-favorites');
 const options={'original':'Conserva exactamente el texto, estrofas y todos los acordes visibles.','correct':'Corrige solamente errores evidentes de reconocimiento sin cambiar el contenido de la canción.','stanzas':'Organiza las estrofas y coros tal como aparecen en la imagen, conservando el contenido.','no-chords':'Extrae solamente la letra. Ignora todos los acordes. Devuelve chords vacío.','specific':'Extrae solamente la canción número '};
 quick.onchange=()=>{if(quick.value)instructions.value=options[quick.value];instructions.focus();};
 function render(){favorites.innerHTML='<option value="">Mis instrucciones favoritas…</option>'+readFavorites().map((s,i)=>`<option value="${i}"></option>`).join('');Array.from(favorites.options).slice(1).forEach((o,i)=>o.textContent=readFavorites()[i].slice(0,70));}
 favorites.onchange=()=>{if(favorites.value!=='')instructions.value=readFavorites()[Number(favorites.value)];};
 document.querySelector('#save-ai-favorite').onclick=()=>{const text=instructions.value.trim();if(!text)return;writeStorage(FAVORITES,JSON.stringify([...new Set([text,...readFavorites()])].slice(0,12)));render();};
 render();applyEnginePreference();
}
export function applyEnginePreference(){const allowed=readStorage('cancionero.allow-ocr')==='1';document.querySelector('#engine-field').hidden=!allowed;if(!allowed)document.querySelector('#photo-engine').value='ai';}
async function imageData(blob){
 const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 let result=canvas.toDataURL('image/jpeg',.9);if(result.length>2600000)result=canvas.toDataURL('image/jpeg',.75);canvas.width=canvas.height=1;if(result.length>2666000)throw new Error('La foto es muy grande. Recorta una sola canción.');return result;
}
export async function recognizePhoto(blob,{signal,onStatus}={}){
 if(blob)photo=blob;if(!photo)throw new Error('Selecciona otra foto para continuar.');document.querySelector('#reprocess-photo').hidden=false;
 if(readStorage('cancionero.allow-ocr')==='1'&&document.querySelector('#photo-engine').value==='traditional'){
  const result=await readLyricsFromImage(photo,{signal,onStatus});return {title:'',number:'',lyrics:result.text,category:'',key:{note:'',mode:'',accidental:''},chords:[],warnings:['OCR tradicional: revisa la letra antes de guardar.']};
 }
 onStatus?.({status:'recognizing text',progress:.05});let image=await imageData(photo);
 try{const response=await call('recognize',{requestId:crypto.randomUUID(),image,instructions:document.querySelector('#ai-instructions').value.trim()},{ai:true,signal});return response.result;}
 finally{image='';}
}
