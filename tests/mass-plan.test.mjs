import test from 'node:test';import assert from 'node:assert/strict';import {MOMENTS,slotsFrom,planEntries,descriptionLyrics} from '../js/mass-plan.js';
test('nine empty moments in approved order; selected songs and descriptions publish in order',()=>{const {slots}=slotsFrom([]);assert.equal(slots.length,9);assert.equal(planEntries(slots).length,0);assert.equal(MOMENTS[3],'Interleccional');slots[0].song={title:'Entrada',lyrics:'Texto',category:'Entrada'};slots[3].mode='description';slots[3].description='Abre mis labios señor...';const entries=planEntries(slots);assert.equal(entries[0].moment,'Entrada');assert.equal(entries[1].kind,'description');assert.equal(entries[1].lyrics,'Cantaremos:\n\n“Abre mis labios señor...”');assert.deepEqual(planEntries(slotsFrom(entries).slots),entries);});
test('old masses preserve entries beyond the nine slots',()=>{const old=Array.from({length:11},(_,i)=>({title:'Canción '+i,lyrics:'Texto',category:''}));const {slots,extras}=slotsFrom(old);assert.equal(extras.length,2);assert.equal(planEntries(slots,extras).length,11);assert.equal(descriptionLyrics('Memoria…'),'Cantaremos:\n\n“Memoria...”');});

test('Mass uses current library keys for old snapshots without changing moments',async()=>{
 const {resolveMassSong}=await import('../js/mass-plan.js');
 const entry={title:'Cordero',lyrics:'Cordero de Dios',moment:'Cordero',key:{note:'',mode:''}};
 const song={title:'CORDERO',lyrics:'Cordero de Dios',key:{note:'Re',mode:'-'}};
 const resolved=resolveMassSong(entry,[song]);
 assert.deepEqual(resolved.key,song.key);assert.equal(resolved.lyrics,entry.lyrics);assert.equal(resolved.moment,entry.moment);assert.equal(entry.key.note,'');
 assert.equal(resolveMassSong({...entry,key:{note:'Sol',mode:'+'}},[song]).key.note,'Re');
 assert.equal(resolveMassSong(entry,[]),entry);
 assert.equal(resolveMassSong(entry,[song,{...song,key:{note:'Mi'}}]),entry);
 assert.equal(resolveMassSong({...entry,kind:'description'},[song]).key.note,'');
 assert.equal(resolveMassSong(entry,[{...song,key:{note:'',mode:''}}]).key.note,'');
});

test('linked songs follow title, lyrics and chords edits while descriptions and missing songs keep their snapshot',async()=>{
 const {resolveMassSong}=await import('../js/mass-plan.js');
 const old={songId:'abc',title:'Anterior',lyrics:'Letra anterior',moment:'Entrada',key:{note:'Re',mode:'+'}};
 const updated={id:'abc',title:'Título nuevo',lyrics:'Letra corregida\n\nOtra estrofa',key:{note:'Mi',mode:'-'},chords:[{line:0,offset:0,chord:'Mi-'}],number:'40'};
 const result=resolveMassSong(old,[updated]);
 for(const field of ['title','lyrics','chords','key','number'])assert.deepEqual(result[field],updated[field]);
 assert.equal(result.moment,'Entrada');assert.equal(resolveMassSong(old,[]),old);
 assert.equal(resolveMassSong({...old,kind:'description'},[updated]).lyrics,old.lyrics);
});
