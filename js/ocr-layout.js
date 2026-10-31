// Recover line breaks, indentation and stanza gaps from OCR word coordinates.
// No spelling guesses: preserve recognized words for the user's review.
const median = values => { const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0; };
export function layoutLyrics(data) {
  const rows=String(data.tsv||'').split(/\r?\n/).slice(1);
  const lines=new Map();
  for(const row of rows){
    const c=row.split('\t');if(c[0]!=='5'||!c.slice(11).join('\t').trim())continue;
    const word={x:+c[6],y:+c[7],w:+c[8],h:+c[9],text:c.slice(11).join('\t').trim()};
    if(![word.x,word.y,word.w,word.h].every(Number.isFinite))continue;
    const key=c.slice(1,5).join(':');if(!lines.has(key))lines.set(key,[]);lines.get(key).push(word);
  }
  const ordered=[...lines.values()].map(words=>({words:words.sort((a,b)=>a.x-b.x),top:Math.min(...words.map(w=>w.y)),bottom:Math.max(...words.map(w=>w.y+w.h)),left:Math.min(...words.map(w=>w.x))})).sort((a,b)=>a.top-b.top||a.left-b.left);
  if(!ordered.length)return String(data.text||'').replace(/\r\n?/g,'\n').replace(/^\n+|\n+$/g,'');
  const height=median(ordered.map(l=>l.bottom-l.top))||20;
  const gaps=ordered.slice(1).map((l,i)=>Math.max(0,l.top-ordered[i].bottom)).sort((a,b)=>a-b);
  const normalGap=gaps.length?gaps[Math.floor((gaps.length-1)*.25)]:height*.3;
  const charWidth=median(ordered.flatMap(l=>l.words.map(w=>w.w/Math.max(1,[...w.text].length))))||height*.5;
  const left=Math.min(...ordered.map(l=>l.left));
  return ordered.map((line,i)=>{
    const gap=i?line.top-ordered[i-1].bottom:0;
    const extra=i&&gap>Math.max(height*.85,normalGap*1.8)?Math.max(1,Math.min(4,Math.round((gap-normalGap)/(height+normalGap)))):0;
    let text=' '.repeat(Math.min(40,Math.max(0,Math.round((line.left-left)/charWidth))));
    line.words.forEach((w,j)=>{
      if(j){const previous=line.words[j-1];const space=w.x-previous.x-previous.w;text+=' '.repeat(space>charWidth*2?Math.min(30,Math.max(1,Math.round(space/charWidth))):1);}
      text+=w.text;
    });
    return (i?'\n'.repeat(1+extra):'')+text;
  }).join('');
}
