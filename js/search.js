// Match a continuous phrase; never combine loose words from unrelated positions.
export const searchText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
export function searchSongs(items,query){const phrase=searchText(query);if(!phrase)return items.map(s=>({s,score:0}));return items.flatMap(s=>{const title=searchText(s.title),lyrics=searchText(s.lyrics);const score=title.startsWith(phrase)?0:title.includes(phrase)?1:lyrics.includes(phrase)?3:null;return score===null?[]:[{s,score}];}).sort((a,b)=>a.score-b.score||a.s.title.localeCompare(b.s.title,'es'));}
export function matchingSnippet(text,query){
 const phrase=searchText(query);if(!phrase)return '';
 const source=String(text??'').normalize('NFC').replace(/\s+/g,' ').trim();let folded='',offset=0;const starts=[],ends=[];
 for(const char of source){const value=char.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');for(let i=0;i<value.length;i++){starts.push(offset);ends.push(offset+char.length);}folded+=value;offset+=char.length;}
 const found=folded.indexOf(phrase);if(found<0)return '';
 const matchStart=starts[found],matchEnd=ends[found+phrase.length-1];let start=Math.max(0,matchStart-48),end=Math.min(source.length,matchEnd+60);
 if(start>0){const boundary=source.indexOf(' ',start);if(boundary>=0&&boundary<matchStart)start=boundary+1;else start=matchStart;}
 if(end<source.length){const boundary=source.lastIndexOf(' ',end);if(boundary>=matchEnd)end=boundary;}
 return (start?'…':'')+source.slice(start,end)+(end<source.length?'…':'');
}
