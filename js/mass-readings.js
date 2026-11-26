import {$} from './util.js';
import {sundayLabel} from './dates.js';
import {cachedReadings,fetchReadings,saveReadings} from './gospel.js';
import {lectionaryFor} from './lectionary.js';

export function initMassReadings({getDate,getFontSize,fontSteps}){
  const dialog=$('#mass-readings');
  const opener=$('#mass-open-readings');
  const choice=$('#mass-readings-choice');
  const status=$('#mass-readings-status');
  const scroll=$('#mass-reading-scroll');
  const title=$('#mass-reading-title');
  const reference=$('#mass-reading-reference');
  const text=$('#mass-reading-text');
  const prev=$('#mass-readings-prev');
  const next=$('#mass-readings-next');
  const smaller=$('#mass-readings-smaller');
  const bigger=$('#mass-readings-bigger');
  const retry=$('#mass-readings-retry');
  const celebration=$('#mass-readings-celebration');
  const fallback=$('#mass-readings-fallback');
  let date,lectionary,readings=[],request=0,font=0,closing=false,selectedLabel='';

  function display({resetScroll=true}={}){
    const index=readings.findIndex(reading=>reading.label===selectedLabel);
    const reading=readings[index];
    for(const button of choice.querySelectorAll('button')){
      button.setAttribute('aria-pressed',String(button.dataset.reading===selectedLabel));
    }
    title.textContent=reading?.label||'';
    reference.textContent=reading?.title||'';
    text.textContent=reading?.text||'';
    prev.disabled=index<=0;
    next.disabled=index<0||index>=readings.length-1;
    if(resetScroll)scroll.scrollTop=0;
  }

  function setReadings(result,{preserve=false}={}){
    const previousLabel=selectedLabel;
    readings=result?.readings||[];
    const keepSelection=preserve&&readings.some(reading=>reading.label===previousLabel);
    const firstReading=readings.find(reading=>reading.label==='Primera lectura')??readings[0];
    selectedLabel=keepSelection?previousLabel:firstReading?.label??'';
    choice.replaceChildren(...readings.map(reading=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='mass-reading-choice';
      button.dataset.reading=reading.label;
      button.textContent=reading.label;
      button.setAttribute('aria-controls','mass-reading-scroll');
      button.onclick=()=>{selectedLabel=reading.label;display();};
      return button;
    }));
    display({resetScroll:!keepSelection});
  }

  function setStatus(message=''){
    status.textContent=message;
    status.hidden=!message;
  }

  async function load(force=false){
    const token=++request;
    const previous=cachedReadings(date);
    if(!force)setReadings(previous);
    retry.hidden=true;
    fallback.hidden=true;
    setStatus(readings.length?'':'Cargando las lecturas…');
    const result=await fetchReadings(date,{force,previous}).catch(()=>null);
    if(token!==request||!dialog.open)return;
    if(!result){
      setStatus('No se pudieron cargar las lecturas.');
      fallback.hidden=!lectionary.differentCalendar;
      retry.hidden=false;
      return;
    }
    saveReadings(result);
    setReadings(result,{preserve:true});
    setStatus(result.usedOfflineCopy?'Mostrando las lecturas guardadas.':'');
    retry.hidden=!result.usedOfflineCopy;
  }

  function setFont(index){
    font=Math.max(0,Math.min(fontSteps.length-1,index));
    text.style.setProperty('--fs',`${fontSteps[font]}px`);
    smaller.disabled=font===0;
    bigger.disabled=font===fontSteps.length-1;
  }

  function open(target){
    if(!target||dialog.open)return;
    lectionary=lectionaryFor(target);
    if(!lectionary)return;
    date=target;
    closing=false;
    $('#mass-readings-date').textContent=sundayLabel(date);
    celebration.textContent=lectionary.title||'';
    fallback.querySelector('a').href=lectionary.url;
    setFont(fontSteps.indexOf(getFontSize()));
    dialog.showModal();
    history.pushState({...history.state,massReadings:true},'');
    load();
  }

  function close(){
    if(!dialog.open)return;
    request++;
    closing=false;
    dialog.close();
  }

  function dismiss(){
    if(closing)return;
    if(history.state?.massReadings){
      closing=true;
      history.back();
    }else close();
  }

  function step(direction){
    const index=readings.findIndex(reading=>reading.label===selectedLabel);
    const reading=readings[index+direction];
    if(index<0||!reading)return;
    selectedLabel=reading.label;
    display();
  }

  opener.onclick=()=>open(getDate());
  $('#mass-readings-close').onclick=dismiss;
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  prev.onclick=()=>step(-1);
  next.onclick=()=>step(1);
  smaller.onclick=()=>setFont(font-1);
  bigger.onclick=()=>setFont(font+1);
  retry.onclick=()=>load(true);

  return {open,isOpen:()=>dialog.open,close};
}
