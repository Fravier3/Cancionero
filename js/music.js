import {esc} from './util.js';
export const blankKey=()=>({note:'',mode:'',accidental:''});
export function renderMusic(lyrics,chords=[],show=true){
 if(!show||!chords.length)return esc(lyrics);
 return String(lyrics).split('\n').map((line,lineIndex)=>{
  const anchors=chords.filter(c=>c.line===lineIndex);if(!line)return '<span class="music-line blank">&#8203;</span>';
  let offset=0;
  const words=line.match(/\s+|\S+/gu)||[];
  const pieces=words.map(word=>{
   const count=Array.from(word).length,start=offset;offset+=count;
   const points=anchors.filter(c=>c.offset>=start&&c.offset<offset);
   if(!points.length)return `<span class="music-word"><span class="chord-cell" aria-hidden="true">&nbsp;</span><span>${esc(word)}</span></span>`;
   const indexes=[0,...new Set(points.map(c=>c.offset-start)),count].sort((a,b)=>a-b).filter((v,i,a)=>i===0||v!==a[i-1]);
   const chars=Array.from(word);
   return `<span class="music-word anchored">${indexes.slice(0,-1).map((at,i)=>{const labels=points.filter(c=>c.offset===start+at).map(c=>c.chord).join(' · ');return `<span class="music-fragment"><span class="chord-cell">${esc(labels||'\u00a0')}</span><span>${esc(chars.slice(at,indexes[i+1]).join(''))}</span></span>`;}).join('')}</span>`;
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
export function initMusicEditor({getDraft,onChanged}){
 const root=document.querySelector('#music-editor'),textarea=document.querySelector('#f-lyrics'),preview=document.querySelector('#music-preview');
 function render(){const d=getDraft();if(!d)return;d.chords??=[];d.key??=blankKey();
  document.querySelector('#f-number').value=d.number||'';document.querySelector('#f-key-note').value=d.key.note;document.querySelector('#f-key-mode').value=d.key.mode;
  root.innerHTML=d.chords.length?d.chords.map((c,i)=>`<div class="chord-edit-row ${c.needsReview?'review':''}" data-chord="${i}"><label>Acorde<input data-field="chord" value="${esc(c.chord)}" maxlength="24" aria-label="Acorde ${i+1}"></label><label>Línea<input data-field="line" type="number" min="1" value="${c.line+1}" aria-label="Línea del acorde ${i+1}"></label><label>Carácter<input data-field="offset" type="number" min="1" value="${c.offset+1}" aria-label="Carácter del acorde ${i+1}"></label><button type="button" class="icon-btn" data-chord-delete="${i}" aria-label="Eliminar acorde ${i+1}">×</button>${c.needsReview?`<button type="button" class="btn secondary small" data-chord-confirm="${i}">Confirmar posición</button>`:''}</div>`).join(''):'<p class="note">Selecciona una palabra o sílaba en la letra y pulsa «Añadir acorde».</p>';
  renderPreview();
 }
 function renderPreview(){const d=getDraft();preview.innerHTML=renderMusic(d?.lyrics||'',d?.chords||[],true);}
 document.querySelector('#f-number').oninput=e=>{getDraft().number=e.target.value;onChanged();};
 for(const id of ['#f-key-note','#f-key-mode'])document.querySelector(id).onchange=()=>{const d=getDraft();d.key={...blankKey(),note:document.querySelector('#f-key-note').value,mode:document.querySelector('#f-key-mode').value};if(!d.key.note)d.key.mode='';onChanged();};
 let selection=0;textarea.addEventListener('select',()=>selection=textarea.selectionStart);textarea.addEventListener('keyup',()=>selection=textarea.selectionStart);textarea.addEventListener('click',()=>selection=textarea.selectionStart);
 document.querySelector('#chord-add').onclick=()=>{const d=getDraft();const value=document.querySelector('#new-chord').value.trim();if(!value)return;d.chords??=[];d.chords.push({...selectionAnchor(d.lyrics,selection),chord:value});document.querySelector('#new-chord').value='';render();onChanged();};
 root.addEventListener('change',e=>{const row=e.target.closest('[data-chord]');if(!row)return;const d=getDraft(),c=d.chords[Number(row.dataset.chord)],field=e.target.dataset.field;
  if(field==='chord')c.chord=e.target.value.trim();else{const value=Number(e.target.value)-1;if(!Number.isInteger(value)||value<0){render();return;}c[field]=value;c.needsReview=true;}
  render();onChanged();
 });
 root.addEventListener('click',e=>{const del=e.target.closest('[data-chord-delete]'),confirm=e.target.closest('[data-chord-confirm]');if(del)getDraft().chords.splice(Number(del.dataset.chordDelete),1);else if(confirm)delete getDraft().chords[Number(confirm.dataset.chordConfirm)].needsReview;else return;render();onChanged();});
 return {render,renderPreview};
}
