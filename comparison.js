/* Benchmark episodes and transparent position-overlap comparison. */
(function(root){
'use strict';
const STEP={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400},MIN=1519862400,MAX=1640995200;
function episodes(events){
 const out=[];let open=null,flatSince=MIN;
 events.forEach((e,index)=>{
  if(e[7]===0&&e[8]!==0)open={entryIndex:index,entryMs:e[0],flatSince,limit:Math.abs(e[8])};
  if(open){
   open.limit=Math.max(open.limit,Math.abs(e[7]),Math.abs(e[8]));
   if(e[8]===0){const end=(Math.floor(e[1]/60000)+1)*60;if(end>(Math.floor(open.entryMs/60000)+1)*60&&end<=MAX)out.push({...open,exitIndex:index,end});open=null;}
   else if(e[7]*e[8]<0)open=null;
  }
  if(e[8]===0)flatSince=(Math.floor(e[1]/60000)+1)*60;
 });return out;
}
function challenge(episode,tf,offset){
 if(!STEP[tf]||!Number.isInteger(offset)||offset<0||offset>30)return null;
 const anchor=Math.floor(episode.entryMs/1000/STEP[tf])*STEP[tf],start=anchor-offset*STEP[tf];
 if(start<Math.max(MIN,episode.flatSince))return null;
 return {entryIndex:episode.entryIndex,exitIndex:episode.exitIndex,anchor,start,end:episode.end,limit:episode.limit,offset};
}
function randomInt(n){const a=new Uint32Array(1),bound=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=bound);return a[0]%n;}
function pick(catalog,tf,rng=randomInt){
 if(!STEP[tf])throw Error('이 테스트는 1분~4시간봉만 지원합니다.');
 const groups=Array.from({length:31},(_,offset)=>catalog.map(e=>challenge(e,tf,offset)).filter(Boolean));
 const available=groups.map((v,i)=>v.length?i:null).filter(v=>v!==null);
 if(!available.length)throw Error('이 시간봉에서 시작할 수 있는 매매 구간이 없습니다.');
 const group=groups[available[rng(available.length)]];return group[rng(group.length)];
}
function resolve(catalog,tf,saved){
 const e=catalog.find(e=>e.entryIndex===saved?.entryIndex&&e.exitIndex===saved?.exitIndex),canonical=e&&challenge(e,tf,saved.offset);
 if(!canonical||Object.keys(canonical).some(k=>canonical[k]!==saved[k]))throw Error('실제 매매기록과 일치하지 않는 테스트 파일입니다.');return canonical;
}
function score(session,events){
 const c=session.challenge,own=session.sim.logs.filter(e=>e.price!=null),reference=events.slice(c.entryIndex,c.exitIndex+1),gaps=new Set(session.sim.gapTimes);
 let i=0,j=0,u=0,v=0,overlap=0,union=0,active=0,same=0,peak=0,peakReference=0;
 for(let t=session.start;t<session.cursor;t+=60){
  while(i<own.length&&own[i].time<t+60){u=own[i++].after;peak=Math.max(peak,Math.abs(u));}
  while(j<reference.length&&reference[j][1]<(t+60)*1000){v=reference[j++][8];peakReference=Math.max(peakReference,Math.abs(v));}
  if(gaps.has(t))continue;
  const a=Math.abs(u),b=Math.abs(v);if(!a&&!b)continue;
  active++;union+=Math.max(a,b);if(u*v>0){same++;overlap+=Math.min(a,b);}
 }
 const firstOwn=own.find(e=>e.before===0&&e.after!==0),firstRef=reference[0];
 return {overlap:union?100*overlap/union:null,direction:active?100*same/active:null,activeMinutes:active,firstDirection:firstOwn?Math.sign(firstOwn.after)===Math.sign(firstRef[8]):null,timingBars:firstOwn?(Math.floor(firstOwn.time/STEP[session.baseTF])*STEP[session.baseTF]-c.anchor)/STEP[session.baseTF]:null,peak:100*peak/c.limit,peakReference:100*peakReference/c.limit,complete:session.cursor>=c.end,beforeEntry:session.cursor*1000<=firstRef[0]};
}
root.TradeComparison={STEP,episodes,challenge,pick,resolve,score};if(typeof module!=='undefined')module.exports=root.TradeComparison;
})(typeof window==='undefined'?globalThis:window);
