import { esc, readStorage, writeStorage } from './util.js';
import {call} from './api.js';
import { sundayFor, sundayLabel } from './dates.js';
const SOURCE='https://feed.evangelizo.org/v2/reader.php';
const KEY='cancionero.sunday-readings.v2';
const FIELDS=[['reading_text1','Primera lectura'],['reading_text2','Salmo responsorial'],['reading_text3','Segunda lectura'],['reading_gospel','Evangelio']];
function plain(text){
  const doc=new DOMParser().parseFromString(String(text).replace(/<br\s*\/?\s*>/gi,'\n'),'text/html');
  return doc.body.textContent.replace(/\r\n?/g,'\n').trim();
}
export function parseReadings(xml,date){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror')||doc.querySelector('date')?.textContent!==date.replaceAll('-',''))throw new Error('La fuente no devolvió las lecturas de este domingo.');
  const readings=FIELDS.map(([key,label])=>({label,title:plain(doc.querySelector(key+'_lt')?.textContent||''),text:plain(doc.querySelector(key)?.textContent||'')})).filter(r=>r.text);
  if(!readings.some(r=>r.label==='Evangelio')||!readings.some(r=>r.label==='Primera lectura')||!readings.some(r=>r.label==='Salmo responsorial'))throw new Error('Las lecturas todavía no están completas.');
  return {date,celebration:plain(doc.querySelector('litugic_t')?.textContent||''),readings,savedAt:Date.now()};
}
function cached(date){
  try{const value=JSON.parse(readStorage(KEY,'null'));return value?.date===date&&Array.isArray(value.readings)&&value.readings.length>=3?value:null;}catch{return null;}
}
export function initGospel({openReading,closeOtherReaders}){
  const root=document.querySelector('#view-gospel'),nav=document.querySelector('#gospel-reader-nav');
  const prev=document.querySelector('#gospel-prev'),next=document.querySelector('#gospel-next');
  let data=null,token=0,index=0,opened=null;
  function render(message=''){
    const date=sundayFor();
    root.innerHTML=`<div class="section-heading"><span class="eyebrow">LITURGIA DE LA PALABRA</span><h2>Evangelio del domingo</h2><p class="sunday-label">${esc(sundayLabel(date))}</p>${data?.celebration?`<p>${esc(data.celebration)}</p>`:''}</div>
    <p class="readings-status" role="status">${esc(message)}</p>
    <div class="reading-cards">${data?.date===date?data.readings.map((r,i)=>`<button class="reading-card" data-reading="${i}"><span class="reading-number">${i+1}</span><span><small>${esc(r.label)}</small><strong>${esc(r.title)}</strong><span class="reading-excerpt">${esc(r.text.slice(0,115))}…</span></span><span aria-hidden="true">›</span></button>`).join(''):''}</div>
    ${data?.date===date?'<p class="note">Toca una lectura para verla a pantalla completa. Amplía con A+ o pellizcando la pantalla.</p>':''}
    <div class="readings-footer"><button class="btn secondary" type="button" data-readings-refresh>Actualizar lecturas</button><p>Fuente: <a href="https://www.evangeliodeldia.org/" target="_blank" rel="noopener noreferrer">Evangelizo · Evangelio del día</a><br>Salmo responsorial: USCCB (leccionario de México; puede variar en tu parroquia).<br>Calendario romano ordinario · Español</p></div>`;
  }
  async function show(force=false){
    const current=++token,date=sundayFor();data=cached(date);render(data?'Lecturas guardadas de este domingo.':'Cargando las lecturas de este domingo…');
    if(data&&!force&&Date.now()-data.savedAt<6*3600000)return;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    try{
      const params=new URLSearchParams({date:date.replaceAll('-',''),type:'xml',lang:'SP'});
      const response=await fetch(`${SOURCE}?${params}`,{signal:controller.signal,credentials:'omit',cache:'no-store'});
      if(!response.ok)throw new Error('No se pudieron cargar las lecturas.');
      const result=parseReadings(await response.text(),date);
      try{const psalm=await call('readings',{date});const reading=result.readings.find(r=>r.label==='Salmo responsorial');reading.text=plain(psalm.html);reading.title=plain(psalm.reference)||reading.title;result.psalmSource=psalm.url;}catch{const reading=result.readings.find(r=>r.label==='Salmo responsorial');reading.text='Respuesta de la asamblea no disponible en la fuente. Pulsa Actualizar lecturas para reintentar.\n\n'+reading.text;}

      if(current!==token||date!==sundayFor())return;
      data=result;writeStorage(KEY,JSON.stringify(result));render('Lecturas de este domingo listas para leer.');
    }catch{
      if(current!==token)return;
      render(data?'Sin conexión con la fuente · puedes leer la copia guardada de este domingo.':'No se pudieron cargar las lecturas de este domingo. Comprueba tu conexión y pulsa Actualizar lecturas.');
    }finally{clearTimeout(timer);}
  }
  function display(){
    const r=opened.readings[index];closeOtherReaders();
    openReading({title:r.label,category:r.title,lyrics:r.text,source:'gospel'});
    nav.hidden=false;document.querySelector('#gospel-reader-position').textContent=`${sundayLabel(opened.date)} · ${index+1} de ${opened.readings.length}`;
    prev.disabled=index===0;next.disabled=index===opened.readings.length-1;
  }
  root.addEventListener('click',e=>{
    if(e.target.closest('[data-readings-refresh]'))return show(true);
    const button=e.target.closest('[data-reading]');if(!button||!data)return;
    opened=structuredClone(data);index=Number(button.dataset.reading);display();
  });
  prev.onclick=()=>{if(index>0){index--;display();}};next.onclick=()=>{if(index<opened.readings.length-1){index++;display();}};
  const checkDate=()=>{if(!root.hidden&&data?.date!==sundayFor())show();};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkDate();});
  setInterval(checkDate,60000);
  return {show,resetReader:()=>{nav.hidden=true;}};
}
