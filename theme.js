/* Shared by the Tistory shell and chart frames. No polling or chart recreation. */
(()=>{'use strict';
 const root=document.documentElement,key='parkst-theme',media=matchMedia('(prefers-color-scheme: dark)');
 const valid=value=>value==='dark'||value==='light';
 let saved;try{saved=localStorage.getItem(key);}catch{}
 const initial=new URLSearchParams(location.search).get('theme');
 let chosen=valid(initial)?initial:valid(saved)?saved:null;
 const light={background:'#ffffff',text:'#61767b',grid:'#edf2ef',border:'#dde6e1',position:'#274b58',extreme:'#b5c8bf'};
 const dark={background:'#171d23',text:'#b2bfc9',grid:'#27323a',border:'#384650',position:'#85b9cd',extreme:'#6e8d86'};
 function controls(){document.querySelectorAll('[data-theme-toggle]').forEach(button=>{const on=root.dataset.theme==='dark';button.textContent=on?'라이트 모드':'다크 모드';button.setAttribute('aria-label',on?'라이트 모드로 전환':'다크 모드로 전환');button.setAttribute('aria-pressed',String(on));});}
 function apply(value,persist=false){
  if(!valid(value))return;
  const changed=root.dataset.theme!==value;root.dataset.theme=value;root.style.colorScheme=value;
  if(persist){chosen=value;try{localStorage.setItem(key,value);}catch{}}
  controls();if(changed)window.dispatchEvent(new CustomEvent('parkst:themechange',{detail:value}));
 }
 function palette(){return root.dataset.theme==='dark'?dark:light;}
 function chartOptions(){const p=palette();return {layout:{background:{type:'solid',color:p.background},textColor:p.text},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},rightPriceScale:{borderColor:p.border},timeScale:{borderColor:p.border}};}
 window.ParkstTheme={apply,palette,chartOptions,bind(charts,update){const paint=()=>{const opts=chartOptions();charts.forEach(chart=>chart.applyOptions(opts));update?.(palette());};paint();window.addEventListener('parkst:themechange',paint);}};
 apply(chosen||(media.matches?'dark':'light'));
 document.addEventListener('click',event=>{if(event.target.closest('[data-theme-toggle]'))apply(root.dataset.theme==='dark'?'light':'dark',true);});
 document.addEventListener('DOMContentLoaded',controls,{once:true});
 media.addEventListener('change',()=>{if(!chosen)apply(media.matches?'dark':'light');});
 window.addEventListener('storage',event=>{if(event.key===key){chosen=valid(event.newValue)?event.newValue:null;apply(chosen||(media.matches?'dark':'light'));}});
 if(window.parent!==window){
  let parentOrigin;try{parentOrigin=new URL(document.referrer).origin;}catch{}
  if(parentOrigin&&(parentOrigin==='https://parkst.tistory.com'||parentOrigin===location.origin)){
   window.addEventListener('message',event=>{if(event.source===window.parent&&event.origin===parentOrigin&&event.data?.type==='parkst:theme'&&valid(event.data.theme))apply(event.data.theme);});
   window.parent.postMessage({type:'parkst:theme-ready'},parentOrigin);
  }
 }
})();
