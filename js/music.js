import {esc} from './util.js';
export const blankKey=()=>({note:'',mode:'',accidental:''});
export function keyFromChoice(value) {
 return value ? {note:value.slice(0,-1),mode:value.slice(-1),accidental:''} : blankKey();
}
export function renderMusic(lyrics,chords=[],show=true,interactive=false){
 if(!interactive&&(!show||!chords.length))return esc(lyrics);
 return String(lyrics).split('\n').map((line,lineIndex)=>{
  const anchors=chords.filter(c=>c.line===lineIndex);if(!line)return '<span class="music-line blank">&#8203;</span>';
  let offset=0,wordNumber=0;
  const words=line.match(/\s+|\S+/gu)||[];
  const pieces=words.map(word=>{
   const count=Array.from(word).length,start=offset;offset+=count;
   if(/\S/u.test(word))wordNumber++;
   const attrs=interactive&&/\S/u.test(word)?` role="button" tabindex="0" aria-haspopup="dialog" data-word-line="${lineIndex+1}" data-word-number="${wordNumber}" aria-label="${esc(word)}, línea ${lineIndex+1}, palabra ${wordNumber}"`:'';
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
function chordOptions(value){return `${value&&!CHORD_CHOICES.includes(value)?`<option value="${esc(value)}" selected>${esc(value)}</option>`:''}${CHORD_CHOICES.map(c=>`<option value="${c}" ${c===value?'selected':''}>${c.slice(0,-1)} ${c.slice(-1)}</option>`).join('')}`;}
export function initMusicEditor({getDraft,onChanged}){
 const root=document.querySelector('#music-editor');
 const preview=document.querySelector('#music-preview');
 const status=document.querySelector('#chord-position-status');
 const picker=document.querySelector('#chord-picker');
 const pickerTitle=document.querySelector('#chord-picker-title');
 const choices=document.querySelector('#chord-choices');
 const another=document.querySelector('#chord-picker-another');
 const cancel=document.querySelector('#chord-picker-cancel');
 let selection=null;

 function render(){
  const d=getDraft();
  if(!d)return;
  d.chords??=[];
  d.key??=blankKey();
  status.textContent='';
  document.querySelector('#f-number').value=d.number||'';
  document.querySelector('#f-key-note').value=d.key.note?(d.key.note+(d.key.mode||'+')):'';
  root.innerHTML=d.chords.length?d.chords.map((c,i)=>{const at=anchorWord(d.lyrics,c);return `<div class="chord-edit-row ${c.needsReview?'review':''}" data-chord="${i}"><label>Acorde<select data-field="chord" aria-label="Acorde ${i+1}">${chordOptions(c.chord)}</select></label><label>Línea<input data-field="line" type="number" inputmode="numeric" min="1" max="${d.lyrics.split('\n').length}" value="${c.line+1}" aria-label="Línea del acorde ${i+1}"></label><label>Palabra<input data-field="word" type="number" inputmode="numeric" min="1" max="${lineWords(d.lyrics,c.line).length||1}" value="${at?.word||1}" aria-label="Palabra del acorde ${i+1}"></label><button type="button" class="icon-btn" data-chord-delete="${i}" aria-label="Eliminar acorde ${i+1}">×</button>${c.needsReview?`<button type="button" class="btn secondary small" data-chord-confirm="${i}">Confirmar posición</button>`:''}</div>`;}).join(''):'<p class="note">Los acordes que coloques aparecerán aquí.</p>';
  renderPreview();
 }
 function renderPreview(){
  const d=getDraft();
  preview.innerHTML=renderMusic(d?.lyrics||'',d?.chords||[],true,true);
 }
 document.querySelector('#f-number').oninput=e=>{getDraft().number=e.target.value;onChanged();};
 document.querySelector('#f-key-note').onchange=e=>{getDraft().key=keyFromChoice(e.target.value);onChanged();};

 function renderChoices(){
  const {word,existing}=selection;
  const current=existing?.chord;
  pickerTitle.textContent=current?`Cambiar acorde en «${word}»`:`Añadir acorde en «${word}»`;
  another.hidden=!existing;
  const options=current&&!CHORD_CHOICES.includes(current)?[current,...CHORD_CHOICES]:CHORD_CHOICES;
  choices.innerHTML=options.map(chord=>`<button type="button" class="btn secondary" data-chord-choice="${esc(chord)}"${chord===current?' aria-current="true"':''}${chord===(current||options[0])?' autofocus':''}>${esc(chord)}</button>`).join('');
 }
 function openPicker(token){
  const d=getDraft();
  const line=Number(token.dataset.wordLine);
  const wordNumber=Number(token.dataset.wordNumber);
  const at=wordAnchor(d.lyrics,line,wordNumber);
  if(!at||picker.open)return;
  const {text:word}=lineWords(d.lyrics,at.line)[wordNumber-1];
  const end=at.offset+Array.from(word).length;
  const existing=d.chords.find(c=>c.line===at.line&&c.offset>=at.offset&&c.offset<end);
  selection={draft:d,lyrics:d.lyrics,at,existing,word,token};
  renderChoices();
  token.focus({preventScroll:true});
  token.classList.add('word-selected');
  picker.showModal();
 }
 preview.addEventListener('click',e=>{
  const token=e.target.closest('[data-word-line]');
  if(token)openPicker(token);
 });
 preview.addEventListener('keydown',e=>{
  if(['Enter',' '].includes(e.key)&&e.target.matches('[data-word-line]')){
   e.preventDefault();
   openPicker(e.target);
  }
 });
 cancel.addEventListener('click',()=>picker.close());
 picker.addEventListener('click',e=>{if(e.target===picker)picker.close();});
 picker.addEventListener('close',()=>{
  if(picker.open)return;
  selection?.token.classList.remove('word-selected');
  selection=null;
 });
 another.addEventListener('click',()=>{
  selection.existing=null;
  renderChoices();
  choices.querySelector('button').focus();
 });
 choices.addEventListener('click',e=>{
  const button=e.target.closest('[data-chord-choice]');
  if(!button||!picker.open)return;
  const {draft,lyrics,at,existing,token}=selection;
  const chord=button.dataset.chordChoice;
  picker.close();
  if(draft!==getDraft()||lyrics!==draft.lyrics)return;
  if(existing)existing.chord=chord;
  else draft.chords.push({...at,chord});
  render();
  onChanged();
  const {wordLine,wordNumber}=token.dataset;
  preview.querySelector(`[data-word-line="${wordLine}"][data-word-number="${wordNumber}"]`)?.focus({preventScroll:true});
 });
 root.addEventListener('change',e=>{const row=e.target.closest('[data-chord]');if(!row)return;const d=getDraft(),i=Number(row.dataset.chord),c=d.chords[i],field=e.target.dataset.field;
  if(field==='chord')c.chord=e.target.value;else{
   const lineNumber=Number(row.querySelector('[data-field="line"]').value),requestedWord=Number(row.querySelector('[data-field="word"]').value),wordNumber=field==='line'?Math.min(requestedWord,lineWords(d.lyrics,lineNumber-1).length):requestedWord,at=wordAnchor(d.lyrics,lineNumber,wordNumber);
   if(!at){render();status.textContent='Esa palabra no existe en la línea indicada. Revisa los números.';return;}
   Object.assign(c,at);delete c.needsReview;
  }
  render();onChanged();
 });
 root.addEventListener('click',e=>{const del=e.target.closest('[data-chord-delete]'),confirm=e.target.closest('[data-chord-confirm]');if(del)getDraft().chords.splice(Number(del.dataset.chordDelete),1);else if(confirm)delete getDraft().chords[Number(confirm.dataset.chordConfirm)].needsReview;else return;render();onChanged();});
 return {render,renderPreview};
}
