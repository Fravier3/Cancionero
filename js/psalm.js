// Plain text only: isolate each response from the reader's stanza.
export function formatPsalm(text){return String(text).replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).join('\n').replace(/(^|\n)(R\.[^\n]*)(?=\n|$)/g,'\n\n$2\n\n').replace(/\n{3,}/g,'\n\n').trim();}
export function psalmResponse(text){return String(text).split('\n').find(line=>/^R\./i.test(line.trim()))?.replace(/^R\.\s*(?:\([^)]*\)\s*)?/i,'').trim()||'';}
export function replaceResponse(text,response){const lines=String(text).split('\n');let found=false;const result=lines.map(line=>{if(/^R\./i.test(line.trim())){found=true;return 'R. '+response;}return line;}).join('\n');return formatPsalm(found?result:'R. '+response+'\n\n'+text);}
