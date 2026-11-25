import {parseDate} from './dates.js';
import {specialReadingsFor} from '../backend/special-readings.js';

const usccb='https://bible.usccb.org/es/bible/lecturas/';
const episcopal='https://www.conferenciaepiscopal.es/liturgia/';
const spanishLectionary=(title,file)=>({
  title,url:episcopal+file,source:'Conferencia Episcopal Española',
});

export function lectionaryFor(date){
  const day=parseDate(date);
  if(!day)return null;
  const special=specialReadingsFor(date);
  if(date==='2026-11-26'){
    return {...special,url:'https://pacrired.org/EnC-2026-11-26',source:'Parroquia Cristo Redentor · San Juan'};
  }
  if(date==='2026-11-29')return spanishLectionary('I Domingo de Adviento','ba1.pdf');
  // The US lectionary moves Epiphany to a Sunday. Puerto Rico keeps January 6.
  if(day.getMonth()===0){
    const n=day.getDate();
    const cycle=['c','a','b'][day.getFullYear()%3];
    if(n===6){
      return spanishLectionary('Epifanía del Señor',cycle+'epifania.pdf');
    }
    if(day.getDay()===0&&n>=2&&n<=5){
      return {...spanishLectionary('II Domingo de Navidad',cycle==='c'?'cn2.pdf':'an2.pdf'),differentCalendar:true};
    }
    if(day.getDay()===0&&(n===7||n===8)){
      return {...spanishLectionary('Bautismo del Señor',cycle+'bautismo.pdf'),differentCalendar:true};
    }
  }
  if(special)return {...special,source:'Conferencia de Obispos Católicos de EE. UU.'};
  const [year,month,dayOfMonth]=date.split('-');
  return {
    url:`${usccb}${month}${dayOfMonth}${year.slice(2)}.cfm`,
    source:'Conferencia de Obispos Católicos de EE. UU.',
  };
}
