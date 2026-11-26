import { esc, readStorage, writeStorage } from './util.js';
import {formatPsalm,psalmResponse,replaceResponse} from './psalm.js';
import {askText,toast} from './ui.js';
import {PUBLIC_KEY,URL_BASE,call} from './api.js';
import { isSpecialMassDate, massDateFor, sundayLabel } from './dates.js';
import {lectionaryFor} from './lectionary.js';
// Catholic Vulgate translation by Félix Torres Amat (Barcelona, 1883–1884).
import specialPassages from './special-mass-passages.json';
const SOURCE='https://feed.evangelizo.org/v2/reader.php';
const KEY='cancionero.sunday-readings.v2';
const specialResponseKey=date=>`cancionero.special-psalm-response.v1.${date}`;
const LEGACY_WARNING='Respuesta de la asamblea no disponible en la fuente. Pulsa Actualizar lecturas para reintentar.';
const MAX_AGE=6*3600000;
const getPsalm=result=>result?.readings.find(r=>r.label==='Salmo responsorial');
const FIELDS=[['reading_text1','Primera lectura'],['reading_text2','Salmo responsorial'],['reading_text3','Segunda lectura'],['reading_gospel','Evangelio']];
function plain(text){
  const doc=new DOMParser().parseFromString(String(text??'').replace(/<br\s*\/?\s*>/gi,'\n'),'text/html');
  return doc.body.textContent.replace(/\r\n?/g,'\n').trim();
}
export function parseReadings(xml,date){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror')||doc.querySelector('date')?.textContent!==date.replaceAll('-',''))throw new Error('La fuente no devolvió las lecturas de esta fecha.');
  const readings=FIELDS.map(([key,label])=>({label,title:plain(doc.querySelector(key+'_lt')?.textContent||''),text:plain(doc.querySelector(key)?.textContent||'')})).filter(r=>r.text);
  if(!readings.some(r=>r.label==='Evangelio')||!readings.some(r=>r.label==='Primera lectura')||!readings.some(r=>r.label==='Salmo responsorial'))throw new Error('Las lecturas todavía no están completas.');
  return {date,celebration:plain(doc.querySelector('litugic_t')?.textContent||''),readings,savedAt:Date.now()};
}
export function cachedReadings(date){
  if(specialPassages[date]){
    const result={date,readings:structuredClone(specialPassages[date])};
    try{
      const override=JSON.parse(readStorage(specialResponseKey(date),'null'));
      if(override?.date===date&&typeof override.response==='string')applyOverride(result,override);
    }catch{/* bundled readings remain available */}
    return result;
  }
  try{
    const value=JSON.parse(readStorage(KEY,'null'));
    if(value?.date!==date||!Array.isArray(value.readings)||value.readings.length<3)return null;
    if(lectionaryFor(date)?.differentCalendar&&(value.readingsSource||value.psalmSource))return null;
    const psalm=getPsalm(value);
    for(const field of ['text','originalText']){
      if(psalm?.[field]?.startsWith(LEGACY_WARNING))psalm[field]=psalm[field].slice(LEGACY_WARNING.length).trim();
    }
    return value;
  }catch{return null;}
}
async function withDeadline(ms,request){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),ms);
  try{return await request(controller.signal);}
  finally{clearTimeout(timeout);}
}
function loadEvangelizo(date){
  const params=new URLSearchParams({date:date.replaceAll('-',''),type:'xml',lang:'SP'});
  return withDeadline(9000,async signal=>{
    const response=await fetch(`${SOURCE}?${params}`,{signal,credentials:'omit',cache:'no-store'});
    if(!response.ok)throw new Error('No se pudieron cargar las lecturas.');
    return parseReadings(await response.text(),date);
  });
}
function usccbReadings(source,date){
  if(source?.date!==date||!Array.isArray(source.readings))return null;
  const readings=source.readings.map(({label,reference,content})=>({label,title:plain(reference),text:plain(content)}));
  if(!['Primera lectura','Salmo responsorial','Evangelio'].every(label=>readings.some(r=>r.label===label&&r.text)))return null;
  return {date,readings,readingsSource:source.url,savedAt:Date.now()};
}
function applySourcePsalm(result,source,previous){
  const psalm=getPsalm(result);
  const text=source?.date===result.date&&source.html?formatPsalm(plain(source.html)):'';
  const savedPsalm=getPsalm(previous);
  if(psalmResponse(text)){
    psalm.text=psalm.originalText=text;
    psalm.title=plain(source.reference)||psalm.title;
    result.psalmSource=source.url;
  }else if(previous?.psalmSource&&psalmResponse(savedPsalm?.originalText||savedPsalm?.text)){
    psalm.text=psalm.originalText=savedPsalm.originalText||savedPsalm.text;
    psalm.title=savedPsalm.title;
    result.psalmSource=previous.psalmSource;
  }
}
function fetchOverride(date){
  return withDeadline(7000,async signal=>{
    const response=await fetch(`${URL_BASE}/rest/v1/cancionero_psalm_responses?date=eq.${date}&select=*`,{
      headers:{apikey:PUBLIC_KEY},cache:'no-store',signal,
    });
    if(!response.ok)throw new Error('No se pudo actualizar la respuesta.');
    const rows=await response.json();
    return rows[0]||null;
  });
}
function applyOverride(result,override){
  result.psalmOverride=override;
  const psalm=getPsalm(result);
  psalm.originalText??=psalm.text;
  psalm.text=override?replaceResponse(psalm.originalText,override.response):formatPsalm(psalm.originalText);
}
export function saveReadings(result){
  if(specialPassages[result.date]){
    writeStorage(specialResponseKey(result.date),JSON.stringify(result.psalmOverride??null));
    return;
  }
  writeStorage(KEY,JSON.stringify(result));
}

export async function fetchReadings(date,{force=false,previous=cachedReadings(date)}={}){
  const override=fetchOverride(date).catch(()=>undefined);
  if(specialPassages[date]){
    const result=structuredClone(previous??cachedReadings(date));
    const sharedResponse=await override;
    if(sharedResponse!==undefined)applyOverride(result,sharedResponse);
    return result;
  }
  const complete=previous&&psalmResponse(getPsalm(previous)?.originalText||getPsalm(previous)?.text);
  const differentCalendar=lectionaryFor(date)?.differentCalendar;
  let result;
  if(complete&&!previous.usedOfflineCopy&&!force&&Date.now()-previous.savedAt<MAX_AGE){
    result=structuredClone(previous);
  }else{
    const [primary,secondary]=await Promise.allSettled([
      loadEvangelizo(date),
      differentCalendar?null:withDeadline(18000,signal=>call('readings',{date},{public:true,signal})),
    ]);
    const source=secondary.status==='fulfilled'?secondary.value:null;
    result=(primary.status==='fulfilled'?primary.value:null)||usccbReadings(source,date);
    if(!result&&!previous)return null;
    const offline=!result;
    result??=structuredClone(previous);
    applySourcePsalm(result,source,previous);
    result.usedOfflineCopy=offline;
    if(previous?.psalmOverride)applyOverride(result,previous.psalmOverride);
  }
  const sharedResponse=await override;
  if(sharedResponse!==undefined)applyOverride(result,sharedResponse);
  return result;
}

export function initGospel({openReading,closeOtherReaders,canEdit=()=>false}){
  const root=document.querySelector('#view-gospel'),nav=document.querySelector('#gospel-reader-nav');
  const prev=document.querySelector('#gospel-prev'),next=document.querySelector('#gospel-next');
  let data=null,token=0,index=0,opened=null,shownDate=null;
  async function editResponse(readingSet){
    if(!canEdit()||!getPsalm(readingSet))return;
    const date=readingSet.date;
    const latest=data?.date===date?data:readingSet;
    const value=await askText({
      title:'Respuesta de la asamblea (R.)',
      message:`Esta respuesta se compartirá para la misa del ${sundayLabel(date)}. Las estrofas del lector se conservan.`,
      value:latest.psalmOverride?.response||psalmResponse(getPsalm(latest).text),maxLength:500,
    });
    if(!value||!canEdit())return;
    try{
      const {response}=await call('psalm_response_save',{date,response:value,revision:latest.psalmOverride?.revision??null});
      applyOverride(latest,response);
      if(data?.date===date){
        token++;
        if(data!==latest)applyOverride(data,response);
        saveReadings(data);
        render('Respuesta guardada para todos.');
      }else if(isSpecialMassDate(date)){
        saveReadings(latest);
      }
      if(opened?.date===date&&!nav.hidden){applyOverride(opened,response);display(true);}
      toast('Respuesta del salmo guardada');
    }catch(error){toast(error.message,5000);}
  }
  const editButton=document.createElement('button');editButton.type='button';editButton.className='btn secondary';editButton.id='psalm-reader-edit';editButton.textContent='Editar respuesta (R.)';editButton.onclick=()=>editResponse(opened);nav.prepend(editButton);
  function render(message=''){
    const date=shownDate;
    const lectionary=lectionaryFor(date);
    const special=isSpecialMassDate(date);
    const celebration=lectionary.title||(data?.date===date&&data.celebration);
    const source=special||lectionary.differentCalendar
      ?`<a href="${esc(lectionary.url)}" target="_blank" rel="noopener noreferrer">Texto litúrgico de la celebración</a>`
      :data?.readingsSource?'<a href="https://bible.usccb.org/es" target="_blank" rel="noopener noreferrer">USCCB · Lecturas en español</a>':'<a href="https://www.evangeliodeldia.org/" target="_blank" rel="noopener noreferrer">Evangelizo · Evangelio del día</a>';
    root.innerHTML=`<div class="section-heading"><span class="eyebrow">LITURGIA DE LA PALABRA</span><h2>${special?'Evangelio y lecturas':'Evangelio del domingo'}</h2><p class="sunday-label">${esc(sundayLabel(date))}</p>${celebration?`<p>${esc(celebration)}</p>`:''}</div>
    <p class="readings-status" role="status" ${message?'':'hidden'}>${esc(message)}</p>
    ${canEdit()&&data?.date===date&&getPsalm(data)?'<button type="button" class="btn secondary" data-psalm-edit>Editar respuesta del salmo (R.)</button>':''}
    <div class="reading-cards">${data?.date===date?data.readings.map((r,i)=>`<button class="reading-card" data-reading="${i}"><span class="reading-number">${i+1}</span><span><small>${esc(r.label)}</small><strong>${esc(r.title)}</strong><span class="reading-excerpt">${esc(r.text.slice(0,115))}…</span></span><span aria-hidden="true">›</span></button>`).join(''):''}</div>
    ${data?.date===date?'<p class="note">Toca una lectura para verla a pantalla completa. Amplía con A+ y reduce con A−.</p>':''}
    <div class="readings-footer"><button class="btn secondary" type="button" data-readings-refresh>Actualizar lecturas</button><p>Fuente: ${source}</p></div>`;
  }
  async function show(force=false){
    const current=++token,date=massDateFor();
    shownDate=date;
    const special=isSpecialMassDate(date);
    const previous=cachedReadings(date);
    data=previous;
    render(data?(special?'':'Lecturas guardadas de este domingo.'):'Cargando las lecturas…');
    const result=await fetchReadings(date,{force,previous}).catch(()=>null);
    if(current!==token||date!==massDateFor())return;
    if(!result){
      render('No se pudieron cargar las lecturas. Pulsa Actualizar lecturas para reintentar.');
      return;
    }
    data=result;
    saveReadings(result);
    if(special&&opened?.date===date&&!nav.hidden){
      const previousPsalm=getPsalm(opened).text;
      applyOverride(opened,result.psalmOverride??null);
      if(opened.readings[index].label==='Salmo responsorial'&&getPsalm(opened).text!==previousPsalm)display(true);
    }
    let message=result.usedOfflineCopy
      ?'Fuentes no disponibles · mostrando la copia guardada de este domingo.'
      :special?'':'Lecturas de este domingo listas para leer.';
    if(!psalmResponse(getPsalm(result)?.text))message='Las lecturas están disponibles. Pulsa Actualizar lecturas para volver a buscar la respuesta del salmo.';
    render(message);
  }
  function display(refresh=false){
    const r=opened.readings[index];editButton.hidden=!canEdit()||r.label!=='Salmo responsorial';closeOtherReaders();
    openReading({title:r.label,category:r.title,lyrics:r.text,source:'gospel'},false,refresh);
    nav.hidden=false;document.querySelector('#gospel-reader-position').textContent=`${sundayLabel(opened.date)} · ${index+1} de ${opened.readings.length}`;
    prev.disabled=index===0;next.disabled=index===opened.readings.length-1;
  }
  root.addEventListener('click',e=>{
    if(e.target.closest('[data-psalm-edit]'))return editResponse(data);
    if(e.target.closest('[data-readings-refresh]'))return show(true);
    const button=e.target.closest('[data-reading]');if(!button||!data)return;
    opened=structuredClone(data);index=Number(button.dataset.reading);display();
  });
  prev.onclick=()=>{if(index>0){index--;display();}};next.onclick=()=>{if(index<opened.readings.length-1){index++;display();}};
  const checkDate=()=>{if(!root.hidden&&shownDate!==massDateFor())show();};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkDate();});
  setInterval(checkDate,60000);
  return {show,updateAccess:()=>{editButton.hidden=!canEdit()||opened?.readings[index]?.label!=='Salmo responsorial';if(shownDate)render();},resetReader:()=>{nav.hidden=true;}};
}
