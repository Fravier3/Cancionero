import test from 'node:test';import assert from 'node:assert/strict';
import {renderMusic,rebaseChords,selectionAnchor,keyLabel} from '../js/music.js';
test('Mi- and Do+ retain different anchors in the same lyric line',()=>{
 const lyric='Pan, que ha sido preparado';const chords=[{line:0,offset:0,chord:'Mi-'},{line:0,offset:17,chord:'Do+'}];const html=renderMusic(lyric,chords);
 assert.match(html,/Mi-/);assert.match(html,/Do\+/);assert.match(html,/Do\+<\/span><span>preparado/);assert.equal(renderMusic(lyric,chords,false),lyric);assert.deepEqual(chords,[{line:0,offset:0,chord:'Mi-'},{line:0,offset:17,chord:'Do+'}]);
});
test('editing text near a chord requires explicit anchor review',()=>{
 const chords=[{line:0,offset:17,chord:'Do+'}];const result=rebaseChords('Pan, que ha sido preparado','Pan, que ha sido cambiado',chords);assert.equal(result[0].needsReview,true);
 const shifted=rebaseChords('Pan, que ha sido preparado','Nuevo\nPan, que ha sido preparado',chords);assert.deepEqual(shifted,[{line:1,offset:17,chord:'Do+'}]);
});
test('Unicode positions, safe escaping, blank stanzas and key labels',()=>{
 assert.deepEqual(selectionAnchor('Luz 🎵 hoy\nPaz',12),{line:1,offset:1});assert.equal(keyLabel({note:'Mi',mode:'-',accidental:''}),'Mi-');assert.match(renderMusic('<script>\n\ntexto',[{line:2,offset:0,chord:'<x>'}]),/&lt;script&gt;/);assert.match(renderMusic('pan',[{line:0,offset:3,chord:'Do+'}]),/Do\+/);
});

test('word positions are one-based and preserve Unicode, tabs, repeated words and empty lines',async()=>{
 const {lineWords,wordAnchor,anchorWord,CHORD_CHOICES}=await import('../js/music.js');
 const lyric='Entre tus manos esta mi vida señor\n\nLuz 🎵\tseñor señor';
 assert.equal(lineWords(lyric,0).length,7);
 assert.deepEqual(wordAnchor(lyric,1,7),{line:0,offset:29});
 assert.deepEqual(anchorWord(lyric,{line:0,offset:31}),{line:1,word:7,text:'señor'});
 assert.deepEqual(wordAnchor(lyric,3,4),{line:2,offset:12});
 assert.equal(wordAnchor(lyric,2,1),null);assert.equal(wordAnchor(lyric,1,8),null);assert.equal(wordAnchor(lyric,0,1),null);
 assert.equal(CHORD_CHOICES.length,14);assert.ok(CHORD_CHOICES.includes('Do+'));assert.ok(CHORD_CHOICES.includes('Si-'));
 const html=renderMusic(lyric,[],true,true);
 assert.match(html,/data-word-line="1" data-word-number="7"/);assert.match(html,/data-word-line="3" data-word-number="4"/);
 assert.doesNotMatch(renderMusic(lyric,[],true),/data-word-line/);
});
