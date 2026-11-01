import {esc} from './util.js';
export const blankKey=()=>({note:'',mode:'',accidental:''});
export function renderMusic(lyrics,chords=[],show=true,interactive=false){
 if(!interactive&&(!show||!chords.length))return esc(lyrics);
 return String(lyrics).split('\n').map((line,lineIndex)=>{
  const anchors=chords.filter(c=>c.line===lineIndex);if(!line)return '<span class="music-line blank">&#8203;</span>';
  let offset=0,wordNumber=0;
  const words=line.match(/\s+|\S+/gu)||[];
  const pieces=words.map(word=>{
   const count=Array.from(word).length,start=offset;offset+=count;
   if(/\S/u.test(word))wordNumber++;
   const attrs=interactive&&/\S/u.test(word)?` role="button" tabindex="0" data-word-line="${lineIndex+1}" data-word-number="${wordNumber}" aria-label="${esc(word)}, línea ${lineIndex+1}, palabra ${wordNumber}"`:'';
   const points=anchors.filter(c=>c.offset>=start&&c.offset<offset);
   if(!points.length)return `<span class="music-word"${attrs}><span class="chord-cell" aria-hidden="true">&nbsp;</span><span>${esc(word)}</span></span>`;
   const indexes=[0,...new Set(points.map(c=>c.offset-start)),count].sort((a,b)=>a-b).filter((v,i,a)=>i===0||v!==a[i-1]);
   const chars=Array.from(word);
   return `<span class="music-word anchored"${attrs}>${indexes.slice(0,-1).map((at,i)=>{const labels=points.filter(c=>c.offset===start+at).map(c=>c.chord).join(' · ');return `<span class="music-fragment"><span class="chord-cell">${esc(labels||'\u00a0')}</span><span>${esc(chars.slice(at,indexes[i+1]).join(''))}</span></span>`;}).join('')}</span>`;
  }).join('');
  const tail=anchors.filter(c=>c.offset===Array.from(line).length).map(c=>c.chord).join(" · ");
  return `<span class="music-line">${pieces}${tail?`<span class="music-word"><span class="chord-cell">${esc(tail)}</span><span> </span></span>`:''}</span>`;
 }).join('');
}
function absolute(text,c){const lines=text.split('\n');let at=0;for(let i=0;i<c.line;i++)at+=Array.from(lines[i]||'').length+1;return at+c.offset;}
function location(text,index){const before=Array.from(text).slice(0,index).join('').split('\n');return {line:before.length-1,offset:Array.from(before.at(-1)).length};}
export function rebaseChords(before,after,chords){
 const a=Array.from(before),b=Array.from(after);let prefix=0,suffix=0;
 while(prefix<Math.min(a.length,b.length)&&a[prefix]===b[prefix])prefix++;
 while(suffix<Math.min(a.length-prefix,b.length-prefix)&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
 return chords.map(c=>{const at=absolute(before,c);const tail=a.slice(at).join('').match(/^\S*/u)?.[0]||'';
  if(at<prefix){if(at+Array.from(tail).length>prefix)return {...c,needsReview:true};return {...c};}if(at>=a.length-suffix)return {...c,...location(after,at+b.length-a.length)};return {...c,...location(after,Math.min(prefix,b.length)),needsReview:true};});
}
export function selectionAnchor(text,utf16index){return location(text,Array.from(text.slice(0,utf16index)).length);}
export function keyLabel(key){return key?.note?key.note+(key.accidental||'')+(key.mode||''):'';}
export const CHORD_CHOICES=['Do','Re','Mi','Fa','Sol','La','Si'].flatMap(note=>[note+'+',note+'-']);
export function lineWords(text,line){
 const value=String(text).split('\n')[line]||'';
 return [...value.matchAll(/\S+/gu)].map(m=>({text:m[0],offset:Array.from(value.slice(0,m.index)).length}));
}
export function wordAnchor(text,line,word){
 if(!Number.isInteger(line)||line<1||!Number.isInteger(word)||word<1)return null;
 const target=lineWords(text,line-1)[word-1];
 return target?{line:line-1,offset:target.offset}:null;
}
export function anchorWord(text,anchor){
 const words=lineWords(text,anchor.line);let index=words.findIndex(w=>anchor.offset<w.offset+Array.from(w.text).length);
 if(index<0)index=words.length-1;
 return index<0?null:{line:anchor.line+1,word:index+1,text:words[index].text};
}
function chordOptions(value='',placeholder=false){return `${placeholder?'<option value="">Escoger acorde…</option>':''}${value&&!CHORD_CHOICES.includes(value)?`<option value="${esc(value)}" selected>${esc(value)}</option>`:''}${CHORD_CHOICES.map(c=>`<option value="${c}" ${c===value?'selected':''}>${c.slice(0,-1)} ${c.slice(-1)}</option>`).join('')}`;}
export function initMusicEditor({getDraft,onChanged}){
 const root=document.querySelector('#music-editor'),textarea=document.querySelector('#f-lyrics'),preview=document.querySelector('#music-preview');
 const chord=document.querySelector('#new-chord'),line=document.querySelector('#chord-line'),word=document.querySelector('#chord-word'),add=document.querySelector('#chord-add'),another=document.querySelector('#chord-another'),status=document.querySelector('#chord-target');
 let active=null,lastDraft=null;
 chord.innerHTML=chordOptions('',true);
 function updateTarget(){
  const d=getDraft(),at=wordAnchor(d?.lyrics||'',Number(line.value),Number(word.value));
  const target=at&&anchorWord(d.lyrics,at);
  status.textContent=target?`Encima de «${target.text}» · Línea ${target.line}, palabra ${target.word}`:'Toca una palabra de la vista previa o indica una línea y palabra válidas.';
  add.disabled=!at||!chord.value;add.textContent=active===null?'Añadir acorde':'Actualizar acorde';another.hidden=active===null;
  for(const token of preview.querySelectorAll('[data-word-line]')){
   const selected=token.dataset.wordLine===line.value&&token.dataset.wordNumber===word.value;
   token.classList.toggle('word-selected',selected);token.setAttribute('aria-pressed',String(selected));
  }
 }
 function render(){const d=getDraft();if(!d)return;
  if(d!==lastDraft){active=null;line.value='1';word.value='1';chord.innerHTML=chordOptions('',true);lastDraft=d;}
  d.chords??=[];if(active!==null&&!d.chords[active])active=null;d.key??=blankKey();
  document.querySelector('#f-number').value=d.number||'';document.querySelector('#f-key-note').value=d.key.note?(d.key.note+(d.key.mode||'+')):'';
  root.innerHTML=d.chords.length?d.chords.map((c,i)=>{const at=anchorWord(d.lyrics,c);return `<div class="chord-edit-row ${c.needsReview?'review':''}" data-chord="${i}"><label>Acorde<select data-field="chord" aria-label="Acorde ${i+1}">${chordOptions(c.chord)}</select></label><label>Línea<input data-field="line" type="number" inputmode="numeric" min="1" max="${d.lyrics.split('\n').length}" value="${c.line+1}" aria-label="Línea del acorde ${i+1}"></label><label>Palabra<input data-field="word" type="number" inputmode="numeric" min="1" max="${lineWords(d.lyrics,c.line).length||1}" value="${at?.word||1}" aria-label="Palabra del acorde ${i+1}"></label><button type="button" class="icon-btn" data-chord-delete="${i}" aria-label="Eliminar acorde ${i+1}">×</button>${c.needsReview?`<button type="button" class="btn secondary small" data-chord-confirm="${i}">Confirmar posición</button>`:''}</div>`;}).join(''):'<p class="note">Escoge un acorde y toca la palabra donde quieres colocarlo.</p>';
  renderPreview();
 }
 function renderPreview(){const d=getDraft();preview.innerHTML=renderMusic(d?.lyrics||'',d?.chords||[],true,true);updateTarget();}
 document.querySelector('#f-number').oninput=e=>{getDraft().number=e.target.value;onChanged();};
 document.querySelector('#f-key-note').onchange=e=>{const value=e.target.value;getDraft().key=value?{note:value.slice(0,-1),mode:value.slice(-1),accidental:''}:blankKey();onChanged();};
 function pick(lineNumber,wordNumber){
  const d=getDraft();line.value=String(lineNumber);word.value=String(wordNumber);
  active=(d.chords||[]).findIndex(c=>{const at=anchorWord(d.lyrics,c);return at?.line===lineNumber&&at.word===wordNumber;});
  if(active<0)active=null;
  if(active!==null)chord.innerHTML=chordOptions(d.chords[active].chord,true);
  updateTarget();
 }
 preview.addEventListener('click',e=>{const token=e.target.closest('[data-word-line]');if(token)pick(Number(token.dataset.wordLine),Number(token.dataset.wordNumber));});
 preview.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-word-line]')){e.preventDefault();pick(Number(e.target.dataset.wordLine),Number(e.target.dataset.wordNumber));}});
 function fromSelection(){const d=getDraft();if(!d)return;const at=anchorWord(d.lyrics,selectionAnchor(d.lyrics,textarea.selectionStart));if(at)pick(at.line,at.word);}
 for(const event of ['select','keyup','click'])textarea.addEventListener(event,fromSelection);
 chord.onchange=updateTarget;line.oninput=word.oninput=updateTarget;
 another.onclick=()=>{active=null;chord.innerHTML=chordOptions('',true);updateTarget();chord.focus();};
 add.onclick=()=>{const d=getDraft(),at=wordAnchor(d.lyrics,Number(line.value),Number(word.value));if(!at||!chord.value)return;
  d.chords??=[];const c={...at,chord:chord.value};if(active===null){d.chords.push(c);active=d.chords.length-1;}else d.chords[active]=c;
  render();onChanged();
 };
 root.addEventListener('change',e=>{const row=e.target.closest('[data-chord]');if(!row)return;const d=getDraft(),i=Number(row.dataset.chord),c=d.chords[i],field=e.target.dataset.field;
  if(field==='chord')c.chord=e.target.value;else{
   const lineNumber=Number(row.querySelector('[data-field="line"]').value),requestedWord=Number(row.querySelector('[data-field="word"]').value),wordNumber=field==='line'?Math.min(requestedWord,lineWords(d.lyrics,lineNumber-1).length):requestedWord,at=wordAnchor(d.lyrics,lineNumber,wordNumber);
   if(!at){render();status.textContent='Esa palabra no existe en la línea indicada. Revisa los números.';return;}
   Object.assign(c,at);delete c.needsReview;
  }
  if(active===i){const at=anchorWord(d.lyrics,c);line.value=String(at.line);word.value=String(at.word);chord.innerHTML=chordOptions(c.chord,true);}
  render();onChanged();
 });
 root.addEventListener('click',e=>{const del=e.target.closest('[data-chord-delete]'),confirm=e.target.closest('[data-chord-confirm]');if(del){const i=Number(del.dataset.chordDelete);getDraft().chords.splice(i,1);if(active===i)active=null;else if(active!==null&&active>i)active--;}else if(confirm)delete getDraft().chords[Number(confirm.dataset.chordConfirm)].needsReview;else return;render();onChanged();});
 return {render,renderPreview};
}
