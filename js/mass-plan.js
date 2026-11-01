import {searchText} from './search.js';
export const MOMENTS=['Entrada','Ten piedad','Gloria','Interleccional','Ofertorio','Santo','Cordero','Comunión','Despedida'];
export const descriptionLyrics=text=>'Cantaremos:\n\n“'+String(text).trim().replace(/[.…]+$/u,'')+'...”';
export function slotsFrom(entries){const slots=MOMENTS.map(moment=>({moment,mode:'song',song:null,description:''})),extras=[];for(const entry of entries){let i=MOMENTS.indexOf(entry.moment);if(i<0){const names={'Piedad':'Ten piedad','Aleluya':'Interleccional','Cordero de Dios':'Cordero','Salida':'Despedida'};i=MOMENTS.indexOf(names[entry.category]||entry.category);}if(i<0||slots[i].song||slots[i].description)i=slots.findIndex(s=>!s.song&&!s.description);if(i<0){extras.push(entry);continue;}slots[i]=entry.kind==='description'?{moment:MOMENTS[i],mode:'description',song:null,description:entry.description||entry.lyrics}:{moment:MOMENTS[i],mode:'song',song:entry,description:''};}return {slots,extras};}
export function planEntries(slots,extras=[]){return [...slots.flatMap(s=>s.mode==='description'?(s.description.trim()?[{moment:s.moment,kind:'description',description:s.description.trim(),title:s.moment,lyrics:descriptionLyrics(s.description),category:s.moment}]:[]):s.song?[{...s.song,moment:s.moment,kind:'song'}]:[]),...extras];}

// Resolve shared songs by stable ID; legacy plans match their original text.
export function resolveMassSong(entry,songs){
 if(entry.kind==='description')return entry;
 let song=entry.songId?songs.find(s=>String(s.id)===entry.songId):null;
 if(!song&&!entry.songId){
  const sameTitle=songs.filter(s=>searchText(s.title)===searchText(entry.title));
  const exact=sameTitle.filter(s=>searchText(s.lyrics)===searchText(entry.lyrics));
  const matches=exact.length?exact:sameTitle.length?sameTitle:songs.filter(s=>searchText(s.lyrics)===searchText(entry.lyrics));
  if(matches.length===1)song=matches[0];
 }
 return song?{...entry,songId:String(song.id),title:song.title,lyrics:song.lyrics,key:song.key,chords:song.chords||[],number:song.number||''}:entry;
}
