/* Contract-position decisions. Prices are chart annotations, not a P&L model. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function action(before,after){if(!before&&after)return '진입';if(before&&!after)return '종료';if(before*after<0)return '반전';return Math.abs(after)>Math.abs(before)?'추가':'축소';}
function create(limit){if(!Number.isSafeInteger(limit)||limit<=0)throw Error('포지션 한도가 올바르지 않습니다.');return {limit,position:0,pending:null,logs:[],decisions:[],lastPrice:null,gapTimes:[]};}
function queue(s,order,time,reference){
 if(s.pending)throw Error('대기 주문을 먼저 처리하거나 취소하세요.');
 if(!Number.isFinite(reference)||reference<=0)throw Error('현재 봉 데이터가 없어 주문할 수 없습니다.');
 if(![1,-1].includes(order.side)||!Number.isSafeInteger(order.qty)||order.qty<=0)throw Error('주문 비중을 확인하세요.');
 if(Math.abs(s.position+order.side*order.qty)>s.limit)throw Error('총 포지션은 이 구간의 한도 100%를 넘을 수 없습니다.');
 if(!order.reason?.trim())throw Error('판단 근거를 입력하세요.');
 s.pending={...clone(order),submitted:time};s.decisions.push({time,kind:'order',...clone(order),reference});
}
function cancel(s,time){if(s.pending){s.logs.push({time,type:'취소',reason:'대기 주문 취소'});s.pending=null;}}
function minute(s,bar){
 const [time,open,,,close]=bar,order=s.pending;s.pending=null;
 if(!Number.isFinite(open)||!Number.isFinite(close)){s.lastPrice=null;s.gapTimes.push(time);if(order)s.logs.push({time,type:'미체결',reason:'1분봉 데이터 누락'});return;}
 if(order){
  const after=s.position+order.side*order.qty;
  if(Math.abs(after)>s.limit)s.logs.push({time,type:'미체결',reason:'포지션 한도 초과'});
  else{s.logs.push({time,type:action(s.position,after),side:order.side,qty:order.qty,price:open,before:s.position,after,reason:order.reason,timeframe:order.timeframe});s.position=after;}
 }
 s.lastPrice=close;
}
function validSession(r){
 if(!r||r.version!==2||r.model!=='wonyotti-match'||typeof r.id!=='string'||r.id.length>100||!['XBTUSD','ETHUSD'].includes(r.symbol)||!['1m','5m','15m','1h','4h'].includes(r.baseTF)||!['active','finished'].includes(r.status))return false;
 if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.cursor)||r.start%60||r.cursor%60||r.start<1519862400||r.cursor<r.start||r.cursor>1640995200)return false;
 const s=r.sim,c=r.challenge;if(!s||!c||!Number.isSafeInteger(s.limit)||s.limit<=0||!Number.isSafeInteger(s.position)||Math.abs(s.position)>s.limit||c.limit!==s.limit||c.start!==r.start||r.cursor>c.end)return false;
 for(const k of ['logs','decisions','gapTimes'])if(!Array.isArray(s[k])||s[k].length>100000)return false;
 if(s.lastPrice!=null&&(!Number.isFinite(s.lastPrice)||s.lastPrice<=0))return false;
 let position=0,previous=r.start;
 for(const e of s.logs){
  if(!e||!Number.isSafeInteger(e.time)||e.time%60||e.time<previous||e.time>r.cursor||typeof e.type!=='string')return false;previous=e.time;
  if(e.price!=null){if(e.time>=r.cursor||!Number.isFinite(e.price)||e.price<=0||![1,-1].includes(e.side)||!Number.isSafeInteger(e.qty)||e.qty<=0||e.before!==position||e.after!==position+e.side*e.qty||Math.abs(e.after)>s.limit)return false;position=e.after;}
 }
 if(position!==s.position)return false;
 for(const e of s.decisions)if(!e||!Number.isSafeInteger(e.time)||e.time<r.start||e.time>r.cursor||typeof e.reason!=='string'||e.reason.length>1000)return false;
 if(s.gapTimes.some(t=>!Number.isSafeInteger(t)||t%60||t<r.start||t>=r.cursor))return false;
 if(s.pending){const o=s.pending;if(r.status!=='active'||o.submitted!==r.cursor||![1,-1].includes(o.side)||!Number.isSafeInteger(o.qty)||o.qty<=0||Math.abs(position+o.side*o.qty)>s.limit||typeof o.reason!=='string'||!o.reason.trim()||o.reason.length>1000)return false;}
 return true;
}
root.TrainingSim={create,action,queue,cancel,minute,validSession};if(typeof module!=='undefined')module.exports=root.TrainingSim;
})(typeof window==='undefined'?globalThis:window);
