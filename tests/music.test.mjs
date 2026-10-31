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
