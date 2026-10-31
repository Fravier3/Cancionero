// Photo and crop live only in memory. No storage or network upload.
import { esc } from './util.js';
export async function cropImage(file,{instructions='',onInstructions=()=>{}}={}) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try { image.src = url; await image.decode(); }
  catch { URL.revokeObjectURL(url); throw new Error('No se pudo abrir la foto. Prueba con una imagen JPG o PNG.'); }
  const previousFocus = document.activeElement;
  const layer = document.createElement('div');
  layer.className = 'crop-dialog';
  layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-labelledby', 'crop-title');
  layer.innerHTML = `<div class="crop-panel"><h2 id="crop-title">Recortar la letra</h2>
    <p>Arrastra las esquinas o ajusta los bordes. Incluye una sola columna y deja un pequeño margen.</p>
    <label class="crop-zoom">Ampliar imagen <input aria-label="Ampliar imagen" id="crop-zoom" type="range" min="1" max="4" step="0.25" value="1"></label><div class="crop-viewport"><div class="crop-stage"><canvas aria-label="Vista previa de la foto"></canvas><div class="crop-box">${['nw','ne','sw','se'].map(c=>`<span class="crop-handle ${c}" data-corner="${c}"></span>`).join('')}</div></div></div>
    <details><summary>Ajustar bordes con precisión</summary><div class="crop-ranges">${[['left','Izquierda'],['right','Derecha'],['top','Arriba'],['bottom','Abajo']].map(([key,label])=>`<label>${label}<input data-edge="${key}" aria-label="Borde ${esc(label.toLowerCase())}" type="range" min="0" max="100" step="1" value="${key==='right'||key==='bottom'?100:0}"></label>`).join('')}</div>
    </details><div class="crop-tools"><button type="button" class="btn secondary" data-action="rotate">Girar 90°</button><button type="button" class="btn ghost" data-action="reset">Foto completa</button></div>
    <button type="button" class="btn secondary" data-action="instructions" aria-expanded="false" aria-controls="crop-instruction-field">Dar instrucción</button><div id="crop-instruction-field" class="field" hidden><label for="crop-instructions">Instrucción opcional para la IA</label><textarea id="crop-instructions" rows="3" maxlength="2000" placeholder="Por ejemplo: extrae solo la canción 40 y conserva sus acordes."></textarea><p>Puedes dejarlo vacío para usar la lectura habitual.</p></div>
    <p class="crop-error" role="status"></p>
    <div class="crop-tools"><button type="button" class="btn secondary" data-action="cancel">Cancelar</button><button type="button" class="btn primary" data-action="read">Recortar y leer</button></div></div>`;
  document.body.append(layer);
  const canvas = layer.querySelector('canvas'), stage = layer.querySelector('.crop-stage'), box = layer.querySelector('.crop-box');
  layer.querySelector('#crop-instructions').value=instructions;
  const ctx = canvas.getContext('2d');
  let angle=0, rect={left:0,top:0,right:100,bottom:100}, drag=null, finished=false;
  let zoom=1;
  function resize(){const width=layer.querySelector(".crop-viewport").clientWidth;stage.style.width=`${Math.max(1,width)*zoom}px`;}
  layer.querySelector("#crop-zoom").oninput=e=>{zoom=Number(e.target.value);resize();};
  function draw() {
    const scale=Math.min(1,3200/Math.max(image.naturalWidth,image.naturalHeight));
    const w=Math.round(image.naturalWidth*scale), h=Math.round(image.naturalHeight*scale);
    canvas.width=angle%180?h:w; canvas.height=angle%180?w:h;
    ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle*Math.PI/180);
    ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();
    stage.style.aspectRatio=`${canvas.width}/${canvas.height}`;
    resize();
    update();
  }
  function update() {
    Object.assign(box.style,{left:rect.left+'%',top:rect.top+'%',width:rect.right-rect.left+'%',height:rect.bottom-rect.top+'%'});
    layer.querySelectorAll('[data-edge]').forEach(i=>i.value=rect[i.dataset.edge]);
  }
  function setEdge(key,value) {
    const min=key==='right'?rect.left+5:key==='bottom'?rect.top+5:0;
    const max=key==='left'?rect.right-5:key==='top'?rect.bottom-5:100;
    rect[key]=Math.max(min,Math.min(max,value));update();
  }
  layer.querySelectorAll('[data-edge]').forEach(i=>i.oninput=()=>setEdge(i.dataset.edge,Number(i.value)));
  stage.onpointerdown=e=>{
    const corner=e.target.dataset.corner;if(!corner)return;
    e.preventDefault();drag=corner;stage.setPointerCapture(e.pointerId);
  };
  stage.onpointermove=e=>{
    if(!drag)return;
    const b=stage.getBoundingClientRect();
    setEdge(drag.includes('w')?'left':'right',(e.clientX-b.left)/b.width*100);
    setEdge(drag.includes('n')?'top':'bottom',(e.clientY-b.top)/b.height*100);
  };
  stage.onpointerup=stage.onpointercancel=()=>{drag=null;};
  draw();
  return new Promise(resolve=>{
    function done(value) {
      if(finished)return;finished=true; document.removeEventListener('keydown',key,true);
      window.removeEventListener('pagehide',cancel);layer.remove();canvas.width=canvas.height=1;
      image.src='';URL.revokeObjectURL(url);if(value)previousFocus?.blur();else previousFocus?.focus();resolve(value);
    }
    const cancel=()=>done(null);
    function key(e) {
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();}
      if(e.key==='Tab'){
        const nodes=[...layer.querySelectorAll('button:not(:disabled),input,textarea')].filter(n=>n.getClientRects().length);
        if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}
      }
    }
    document.addEventListener('keydown',key,true);window.addEventListener('pagehide',cancel);
    layer.addEventListener('click',async e=>{
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(action==='instructions'){const field=layer.querySelector('#crop-instruction-field');field.hidden=!field.hidden;e.target.closest('button').setAttribute('aria-expanded',String(!field.hidden));if(!field.hidden){layer.querySelector('#crop-instructions').focus();field.scrollIntoView({block:'nearest'});}}
      if(action==='cancel')cancel();
      if(action==='rotate'){angle=(angle+90)%360;rect={left:0,top:0,right:100,bottom:100};draw();}
      if(action==='reset'){rect={left:0,top:0,right:100,bottom:100};update();}
      if(action==='read'){
        onInstructions(layer.querySelector('#crop-instructions').value);
        const button=e.target.closest('button');button.disabled=true;
        const out=document.createElement('canvas');
        const x=Math.round(rect.left*canvas.width/100),y=Math.round(rect.top*canvas.height/100);
        out.width=Math.max(1,Math.round((rect.right-rect.left)*canvas.width/100));out.height=Math.max(1,Math.round((rect.bottom-rect.top)*canvas.height/100));
        out.getContext('2d').drawImage(canvas,x,y,out.width,out.height,0,0,out.width,out.height);
        out.toBlob(blob=>{
          out.width=out.height=1;
          if(blob)done(blob);else{button.disabled=false;layer.querySelector('.crop-error').textContent='No se pudo recortar. Intenta una foto más pequeña.';}
        },'image/png');
      }
    });
    layer.querySelector('[data-action="read"]').focus();
  });
}
