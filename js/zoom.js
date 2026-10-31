// App-level enlargement is handled by the reader's A-/A+ controls.
export function initZoomGuard(){
 const prevent=e=>{if(e.cancelable)e.preventDefault();};
 for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,prevent,{passive:false});
 const multiTouch=e=>{if(e.touches?.length>1)prevent(e);};
 document.addEventListener('touchstart',multiTouch,{passive:false});document.addEventListener('touchmove',multiTouch,{passive:false});
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','=','-','_','0'].includes(e.key))prevent(e);});
 document.addEventListener('dblclick',prevent,{passive:false});
 document.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)prevent(e);},{passive:false});
}
