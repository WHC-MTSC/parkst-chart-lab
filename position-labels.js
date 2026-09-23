/* Position lifecycles are derived from signed holdings, never from buy/sell alone. */
(function(root){
 'use strict';
 const names={entry:'진입',add:'추가',reduce:'축소',close:'종료',reverse:'반전',hold:'유지'};
 const direction=side=>side>0?'롱':'숏';
 function describe(before,after){
  const kind=before===after?'hold':before===0?'entry':after===0?'close':Math.sign(before)!==Math.sign(after)?'reverse':Math.abs(after)>Math.abs(before)?'add':'reduce';
  const side=Math.sign(after||before);
  return {kind,side,label:kind==='reverse'?`${direction(before)} → ${direction(after)} 반전`:`${side?direction(side):'무포지션'} ${names[kind]}`};
 }
 const raw=e=>({before:e[7],after:e[8],time:e[0]/1000,end:e[1]/1000,price:e[4]});
 function build(rows,read=raw){
  const cycles=[],records=[];let current=null,previous=null;
  function open(side,time,index,initial=false){
   const c={id:cycles.length+1,side,start:time,end:null,firstIndex:index,lastIndex:index,eventIds:[],max:0,initial,closed:false,endReason:null};
   cycles.push(c);return c;
  }
  rows.forEach((row,index)=>{
   const e=read(row),d=describe(e.before,e.after),legs=[];
   if(current&&previous!==e.before){current.endReason='기록 단절';current=null;}
   if(!current&&e.before!==0)current=open(Math.sign(e.before),e.time,index,true);
   function leg(c,kind,qty){
    if(!c)return;
    c.lastIndex=index;if(c.eventIds.at(-1)!==index)c.eventIds.push(index);
    c.max=Math.max(c.max,Math.sign(e.before)===c.side?Math.abs(e.before):0,Math.sign(e.after)===c.side?Math.abs(e.after):0);
    legs.push({cycleId:c.id,side:c.side,kind,qty,reverse:d.kind==='reverse'});
   }
   if(d.kind==='reverse'){
    leg(current,'close',Math.abs(e.before));current.end=e.end??e.time;current.closed=true;current.endReason='반전';
    current=open(Math.sign(e.after),e.time,index);leg(current,'entry',Math.abs(e.after));
   }else if(d.kind==='entry'){
    current=open(Math.sign(e.after),e.time,index);leg(current,'entry',Math.abs(e.after));
   }else if(d.kind!=='hold'){
    leg(current,d.kind,Math.abs(e.after-e.before));
    if(d.kind==='close'){current.end=e.end??e.time;current.closed=true;current.endReason='전량 종료';current=null;}
   }
   records.push({...d,index,before:e.before,after:e.after,legs,cycleIds:legs.map(l=>l.cycleId),primaryCycleId:legs.at(-1)?.cycleId??current?.id??null});
   previous=e.after;
  });
  return {cycles,records};
 }
 const api={build,describe,direction,names};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.PositionLabels=api;
})(typeof window==='undefined'?globalThis:window);
