/* Local historical chart. No network requests and no account connection. */
'use strict';
const $=id=>document.getElementById(id);
const secs={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400};
const names={'1m':'1분','5m':'5분','15m':'15분','1h':'1시간','4h':'4시간','1d':'일봉'};
const fmt=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2});
const num=n=>fmt.format(n);
const compact=n=>Math.abs(n)>=1e6?(n/1e6).toFixed(2)+'M':Math.abs(n)>=1e3?(n/1e3).toFixed(1)+'K':String(n);
const when=(sec,ms=false)=>{let s=new Date((Number(sec)+32400)*1000).toISOString();return s.slice(0,ms?23:19).replace('T',' ');};
const pos=n=>n===0?'없음':`${n>0?'롱':'숏'} ${num(Math.abs(n))}`;
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const P=PositionLabels;
let positions={cycles:[],records:[]},activePosition=null;
const cycleOf=id=>positions.cycles[id-1];
const badge=id=>{const c=cycleOf(id);return c?`<span class="position-badge ${c.side>0?'is-long':'is-short'}">${P.direction(c.side)} #${c.id}</span>`:'';};
const eventBadges=i=>positions.records[i].cycleIds.map(badge).join('<span class="position-arrow">→</span>');
let symbol='XBTUSD',tf='1h',bars=[],events=[],orders=[],barMap=new Map(),bins=new Map(),selected=-1,page=0,filtered=[],loading=0,syncing=false,updating=true,selectionLine=null;
const loaded=new Map();
const maxDays={'1m':31,'5m':180};
let bounds=null,activeChunks=new Set(),emaVersion=0,emaBusy=false;
const emas=[],emaCache=new Map();
const emaColors=['#da9024','#5f67c8','#be5899','#358dc4','#807441','#364c70'];
const options={layout:{background:{type:'solid',color:'#ffffff'},textColor:'#61767b',fontFamily:'Malgun Gothic, sans-serif',fontSize:11},grid:{vertLines:{color:'#f1f4f2'},horzLines:{color:'#edf2ef'}},rightPriceScale:{borderColor:'#dde6e1',minimumWidth:86},timeScale:{borderColor:'#dde6e1',timeVisible:true,secondsVisible:false,rightOffset:2,minBarSpacing:.001},crosshair:{mode:0},localization:{locale:'ko-KR',timeFormatter:t=>when(t)},handleScroll:true,handleScale:true};
const chart=LightweightCharts.createChart($('priceChart'),{...options,height:$('priceChart').clientHeight});
const candle=chart.addCandlestickSeries({upColor:'#188c7b',downColor:'#cf665c',wickUpColor:'#188c7b',wickDownColor:'#cf665c',borderVisible:false,priceLineVisible:false,lastValueVisible:false});
candle.priceScale().applyOptions({scaleMargins:{top:.08,bottom:.22}});
const volume=chart.addHistogramSeries({priceScaleId:'',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});
volume.priceScale().applyOptions({scaleMargins:{top:.85,bottom:0}});
const anchors=[chart.addLineSeries({lineVisible:false,pointMarkersVisible:false,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false}),chart.addLineSeries({lineVisible:false,pointMarkersVisible:false,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})];
const pchart=LightweightCharts.createChart($('positionChart'),{...options,height:$('positionChart').clientHeight});
const pseries=pchart.addLineSeries({color:'#274b58',lineWidth:2,lineType:1,priceLineVisible:false,lastValueVisible:false,priceFormat:{type:'price',precision:3,minMove:.001}});
const plow=pchart.addLineSeries({color:'#b5c8bf',lineWidth:1,lineStyle:2,lineType:1,priceLineVisible:false,lastValueVisible:false,visible:false,crosshairMarkerVisible:false});
const phigh=pchart.addLineSeries({color:'#b5c8bf',lineWidth:1,lineStyle:2,lineType:1,priceLineVisible:false,lastValueVisible:false,visible:false,crosshairMarkerVisible:false});
pseries.createPriceLine({price:0,color:'#98afa5',lineWidth:1,lineStyle:2,axisLabelVisible:false});
new ResizeObserver(()=>{chart.resize($('priceChart').clientWidth,$('priceChart').clientHeight);pchart.resize($('positionChart').clientWidth,$('positionChart').clientHeight);}).observe($('priceChart'));
async function unpack(raw){
 if(raw?.encoding!=='f64-gzip')return raw;
 if(typeof DecompressionStream==='undefined')throw Error('1분·5분봉은 최신 Chrome 또는 Edge에서 열어주세요.');
 const binary=Uint8Array.from(atob(raw.data),c=>c.charCodeAt(0));
 const buffer=await new Response(new Blob([binary]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const values=new Float64Array(buffer);
 if(values.length!==raw.count*raw.columns)throw Error('압축 데이터 길이가 올바르지 않습니다.');
 if(raw.columns===1)return {start:raw.start,step:raw.step,values};
 const rows=[];
 for(let i=0;i<raw.count;i++){const row=[raw.start+i*raw.step];for(let j=0;j<raw.columns;j++){const v=values[i*raw.columns+j];row.push(Number.isFinite(v)?v:null);}rows.push(row);}
 return rows;
}
function load(key){
 if(loaded.has(key))return loaded.get(key);
 const promise=new Promise((resolve,reject)=>{
  const finish=async()=>{try{const data=await unpack(window.CHART_DATA[key]);window.CHART_DATA[key]=data;resolve(data);}catch(e){loaded.delete(key);reject(e);}};
  if(window.CHART_DATA[key]){finish();return;}
  const script=document.createElement('script');script.src='data/'+key+'.js';
  script.onload=()=>{script.remove();finish();};
  script.onerror=()=>{script.remove();loaded.delete(key);reject(new Error('데이터 파일을 열지 못했습니다: '+key+'.js'));};
  document.body.append(script);
 });loaded.set(key,promise);return promise;
}
function range(){return chart.timeScale().getVisibleRange();}
function setRange(r){if(!r)return;syncing=true;chart.timeScale().setVisibleRange(r);pchart.timeScale().setVisibleRange(r);syncing=false;schedule();}
function clampRange(r,limits=bounds,interval=tf){
 const maxSpan=(maxDays[interval]||Infinity)*86400;
 const span=Math.min(Math.max(r.to-r.from,secs[interval]*2),maxSpan,limits.to-limits.from);
 let from=(r.from+r.to-span)/2,to=from+span;
 if(from<limits.from){to+=limits.from-from;from=limits.from;}
 if(to>limits.to){from-=to-limits.to;to=limits.to;}
 return {from:Math.max(limits.from,from),to};
}
async function focus(t,days){
 const r=range(),span=days?days*86400:r?r.to-r.from:7*86400;
 const next=clampRange({from:t-span*.5,to:t+span*.5});
 if(maxDays[tf])await refresh(true,next);else setRange(next);
}
function bucketOf(e){return Math.floor(e[0]/1000/secs[tf])*secs[tf];}
function prepareBins(){
 bins=new Map();
 events.forEach((e,i)=>{
  const t=bucketOf(e);if(!bins.has(t))bins.set(t,{ids:[],sides:[null,null],legs:new Map()});
  const b=bins.get(t);b.ids.push(i);const s=e[2]===1?0:1;
  if(!b.sides[s])b.sides[s]={qty:0,weighted:0,actions:new Set(),ids:[]};
  const a=b.sides[s];a.qty+=e[3];a.weighted+=e[3]*e[4];a.actions.add(e[9]);a.ids.push(i);
  for(const leg of positions.records[i].legs){
   const key=leg.cycleId+':'+leg.kind;
   if(!b.legs.has(key))b.legs.set(key,{...leg,qty:0,weighted:0,ids:[]});
   const g=b.legs.get(key);g.qty+=leg.qty;g.weighted+=leg.qty*e[4];g.ids.push(i);
  }
 });
 for(let s=0;s<2;s++)anchors[s].setData([...bins].filter(([t,b])=>barMap.has(t)&&[...b.legs.values()].some(l=>l.side===(s===0?1:-1))).map(([time,b])=>{
  const legs=[...b.legs.values()].filter(l=>l.side===(s===0?1:-1));return {time,value:legs.reduce((v,l)=>v+l.weighted,0)/legs.reduce((v,l)=>v+l.qty,0)};
 }));
}
function markerUpdate(){
 const r=range();if(!r)return;
 const showText=$('labels').checked&&(r.to-r.from)/secs[tf]<150,only=$('onlyPosition').checked;
 for(let s=0;s<2;s++){
  const markers=[];let lastTextX=-10000;
  if($('markers').checked)for(const[t,b]of bins){
   if(!barMap.has(t)||t<r.from-secs[tf]*2||t>r.to+secs[tf]*2)continue;
   let legs=[...b.legs.values()].filter(l=>l.side===(s===0?1:-1)&&(!only||l.cycleId===activePosition));
   if(!only&&legs.length>3){
    const pick=legs.find(l=>l.ids.includes(selected))||legs[0],ids=[...new Set(legs.flatMap(l=>l.ids))];
    legs=[{...pick,kind:'summary',ids,qty:legs.reduce((v,l)=>v+l.qty,0),summary:`${P.direction(pick.side)} ${new Set(legs.map(l=>l.cycleId)).size}개 포지션 · ${ids.length}건`}];
   }
   for(const a of legs){
    const chosen=a.ids.includes(selected),focused=a.cycleId===activePosition,x=chart.timeScale().timeToCoordinate(t);
    const label=showText&&(chosen||x-lastTextX>150);if(label)lastTextX=x;
    markers.push({time:t,id:a.kind==='summary'?`bucket:${t}`:`position:${a.cycleId}:${a.ids[0]}`,position:s===0?'belowBar':'aboveBar',shape:a.kind==='add'||a.kind==='summary'?'circle':a.kind==='close'||a.kind==='reduce'?'square':s===0?'arrowUp':'arrowDown',color:s===0?(focused?'#087f73':'#659b90'):(focused?'#c04f49':'#b98983'),size:chosen?1.5:focused?1.1:.7,text:label?(a.summary||`${P.direction(a.side)} #${a.cycleId} ${P.names[a.kind]} ${compact(a.qty)}`):''});
   }
  }
  anchors[s].setMarkers(markers);
 }
}
let timer;function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(updating)return;markerUpdate();renderTable();updateStatus();ensureWindow();},160);}
function ensureWindow(){
 if(!maxDays[tf]||updating||!bars.length)return;
 const r=range(),margin=86400;
 if(r.to-r.from>maxDays[tf]*86400+secs[tf]||(r.from<bars[0][0]+margin&&bars[0][0]>bounds.from)||(r.to>bars.at(-1)[0]-margin&&bars.at(-1)[0]<bounds.to))refresh(true,r);
}
chart.timeScale().subscribeVisibleTimeRangeChange(r=>{if(!r||syncing||updating)return;syncing=true;pchart.timeScale().setVisibleRange(r);syncing=false;page=0;schedule();});
pchart.timeScale().subscribeVisibleTimeRangeChange(r=>{if(!r||syncing||updating)return;syncing=true;chart.timeScale().setVisibleRange(r);syncing=false;page=0;schedule();});
function updateStatus(){const r=range();if(!r)return;$('rangeLabel').textContent=when(r.from).slice(0,16)+' – '+when(r.to).slice(0,16)+' KST';const view=bars.filter(b=>b[0]>=r.from&&b[0]<=r.to),missing=view.filter(b=>b[4]===null).length;$('status').textContent=`표시 구간 ${view.length.toLocaleString()}봉 · 누락 ${missing}봉 · 체결 묶음 ${filtered.length.toLocaleString()}개 · 수량은 계약 단위`;}
function tooltip(p){if(!p.time){$('ohlc').textContent='차트 위에 마우스를 올리면 가격과 보유 수량을 확인할 수 있습니다.';return;}const b=barMap.get(Number(p.time));if(!b)return;const text=b[4]===null?'가격 봉 누락':`O ${num(b[1])}  H ${num(b[2])}  L ${num(b[3])}  C ${num(b[4])}  V ${num(b[5])}`;$('ohlc').textContent=`${when(b[0]).slice(0,16)} KST · ${text} · 종료 보유 ${pos(b[6])} · 봉 내 ${num(b[7])} ~ ${num(b[8])}`;}
chart.subscribeCrosshairMove(p=>{tooltip(p);if(p.time&&barMap.has(Number(p.time)))pchart.setCrosshairPosition(barMap.get(Number(p.time))[6]/1e6,p.time,pseries);else pchart.clearCrosshairPosition();});
pchart.subscribeCrosshairMove(p=>{tooltip(p);});
chart.subscribeClick(p=>{
 if(p.hoveredObjectId&&String(p.hoveredObjectId).startsWith('position:')){
  const [,id,index]=String(p.hoveredObjectId).split(':');activePosition=Number(id);selectEvent(Number(index),false);
 }else if(p.time)showBucket(Number(p.time),true);
});
pchart.subscribeClick(p=>{if(p.time)showBucket(Number(p.time),true);});
function renderPositionContext(){
 const c=cycleOf(activePosition);if(!c)return;
 $('positionIdentity').innerHTML=badge(c.id)+`<strong>${c.closed?'종료된 포지션':c.endReason||'기록 끝까지 보유'}</strong>`;
 $('positionPeriod').textContent=`${c.initial?'기록 시작 전부터 보유 · ':''}${when(c.start).slice(0,16)} → ${c.end==null?(c.endReason||'종료 기록 없음'):when(c.end).slice(0,16)+' '+c.endReason} KST`;
 $('positionStats').textContent=`최대 ${num(c.max)} 계약 · 체결 묶음 ${num(c.eventIds.length)}개`;
 $('positionPrevious').disabled=c.id<=1;$('positionNext').disabled=c.id>=positions.cycles.length;
}
async function focusPosition(id=activePosition){
 const c=cycleOf(id);if(!c||updating)return;
 activePosition=id;selectEvent(c.firstIndex,false);page=0;
 const end=c.end??events[c.lastIndex][1]/1000,pad=Math.max(secs[tf]*10,(end-c.start)*.2);
 const next=clampRange({from:c.start-pad,to:end+pad});
 if(maxDays[tf])await refresh(true,next,events[c.firstIndex][0]);else setRange(next);
}
function showBucket(t,choose=false){
 const b=bins.get(t);$('bucketTitle').textContent=when(t).slice(0,16)+' · '+names[tf]+'봉';
 if(!b){$('bucketSummary').textContent='체결 없음';$('bucketList').innerHTML='<p class="empty">이 봉에는 체결이 없습니다.</p>';return;}
 const ids=b.ids.filter(i=>!$('onlyPosition').checked||positions.records[i].cycleIds.includes(activePosition));
 if(choose&&ids.length&&!ids.includes(selected))selectEvent(ids[0],false);
 const cycleCount=new Set(ids.flatMap(i=>positions.records[i].cycleIds)).size;
 $('bucketSummary').textContent=`${cycleCount}개 포지션 · 체결 묶음 ${ids.length}개`;
 let previous=null;
 $('bucketList').innerHTML=ids.slice(0,200).map(i=>{
  const e=events[i],r=positions.records[i],separator=r.primaryCycleId!==previous;previous=r.primaryCycleId;
  return `<button class="bucketrow ${separator?'cycle-start ':''}${i===selected?'selected':''}" data-event="${i}"><span>${eventBadges(i)} <b>${r.label}</b><small>${when(e[0]/1000).slice(11)} · ${e[2]===1?'매수':'매도'} ${num(e[3])} 계약</small></span><span class="position-change">${pos(e[7])}<br>→ ${pos(e[8])}</span></button>`;
 }).join('')||( '<p class="empty">선택한 포지션의 체결이 없는 봉입니다.</p>');
 if(ids.length>200)$('bucketList').insertAdjacentHTML('beforeend','<p class="empty">상위 200개 표시. 확대하면 더 자세히 볼 수 있습니다.</p>');
}
function selectEvent(i,move=true){
 if(!events.length)return;selected=Math.max(0,Math.min(i,events.length-1));
 const e=events[selected],r=positions.records[selected],t=e[0]/1000,bucket=bucketOf(e);
 if(!r.cycleIds.includes(activePosition))activePosition=r.primaryCycleId;
 $('date').value=when(t).slice(0,10);$('detailTitle').textContent=r.label;
 const id=orders[e[10]],unknown=id.startsWith('unidentified:');
 const split=r.kind==='reverse'?`<p class="reversal-note">${r.legs.map(l=>`${badge(l.cycleId)} ${P.names[l.kind]} ${num(l.qty)} 계약`).join(' + ')}<br>한 번의 체결에서 기존 포지션을 닫고 새 포지션을 열었습니다.</p>`:'';
 $('detailBody').innerHTML=`<div class="position-tags">${eventBadges(selected)}<span class="execution-side">${symbol} · ${e[2]===1?'매수':'매도'} 체결</span></div>${split}<div class="facts"><div><span>실제 체결 수량</span><b>${num(e[3])} 계약</b></div><div><span>수량 가중 평균 체결가</span><b>${num(e[4])} USD</b></div><div><span>체결 전 포지션</span><b>${pos(e[7])}</b></div><div><span>체결 후 포지션</span><b>${pos(e[8])}</b></div></div><div class="detailnote">시작 ${when(t,true)} KST<br>마지막 ${when(e[1]/1000,true)} KST<br>체결 ${num(e[11])}건 · 가격 범위 ${num(e[5])} – ${num(e[6])} USD<br>${unknown?'주문 식별자가 없어 개별 체결로 표시합니다.':'주문 ID '+safe(id)}<br>같은 주문의 연속 체결을 1분 단위로 합산한 수량입니다.</div>`;
 if(selectionLine)candle.removePriceLine(selectionLine);
 selectionLine=candle.createPriceLine({price:e[4],color:r.side>0?'#087f73':'#c04f49',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:r.label});
 if(move){const view=range();if(!view||bucket<view.from||bucket>view.to)focus(bucket);}
 renderPositionContext();showBucket(bucket);markerUpdate();renderTable();$('previous').disabled=selected===0;$('next').disabled=selected===events.length-1;
}
function renderTable(){
 const r=range();if(!r)return;const action=$('actionFilter').value,only=$('onlyPosition').checked;filtered=[];
 events.forEach((e,i)=>{const t=e[0]/1000;if(t>=r.from&&t<r.to+secs[tf]&&(action==='all'||e[9]===action)&&(!only||positions.records[i].cycleIds.includes(activePosition)))filtered.push(i);});
 const size=60,total=Math.ceil(filtered.length/size);page=Math.max(0,Math.min(page,Math.max(0,total-1)));let previous=null;
 $('tradeRows').innerHTML=filtered.slice(page*size,(page+1)*size).map(i=>{
  const e=events[i],m=positions.records[i],id=only?activePosition:m.primaryCycleId,c=cycleOf(id),separator=id!==previous;previous=id;
  const divider=separator?`<tr class="cycle-divider"><td colspan="7"><button data-position="${id}">${badge(id)} <span>${when(c.start).slice(0,16)}부터 · 최대 ${num(c.max)} 계약</span><span class="focus-link">이 포지션 보기 ↗</span></button></td></tr>`:'';
  return `${divider}<tr data-event="${i}" class="${i===selected?'selected':''}" tabindex="0"><td>${when(e[0]/1000)}</td><td><strong class="action-label action-${m.kind}">${m.label}</strong><small class="execution-side">${e[2]===1?'매수':'매도'} 체결</small></td><td>${eventBadges(i)}</td><td>${num(e[3])}</td><td>${num(e[4])}</td><td>${pos(e[8])}</td><td>${num(e[11])}</td></tr>`;
 }).join('')||'<tr><td colspan="7">현재 구간에는 해당 체결이 없습니다.</td></tr>';
 $('tableCount').textContent=`${only?P.direction(cycleOf(activePosition)?.side)+' #'+activePosition+' · ':''}${filtered.length.toLocaleString()}개 · ${total?page+1:0} / ${total} 페이지`;
 $('pagePrev').disabled=page===0;$('pageNext').disabled=page>=total-1;
}

function emaValues(closes,period){
 const output=new Float64Array(closes.length);output.fill(NaN);
 let count=0,sum=0,previous=NaN;const alpha=2/(period+1);
 for(let i=0;i<closes.length;i++){
  const close=closes[i];
  if(!Number.isFinite(close)){count=0;sum=0;previous=NaN;continue;}
  count++;
  if(count<=period){sum+=close;if(count===period){previous=sum/period;output[i]=previous;}}
  else{previous=alpha*close+(1-alpha)*previous;output[i]=previous;}
 }
 return output;
}
function renderEMAs(){
 $('emaList').innerHTML=emas.map(e=>`<span class="emachip ${e.enabled?'':'disabled'}"><label style="color:${e.color}"><input type="checkbox" data-ema-toggle="${e.period}" ${e.enabled?'checked':''}>EMA ${e.period}</label><button type="button" data-ema-remove="${e.period}" aria-label="EMA ${e.period} 삭제">×</button></span>`).join('');
 $('emaStatus').className='';
 $('emaStatus').textContent=emas.length?'체크로 켜기·끄기 · × 삭제 · 현재 시간봉 기준':'기본 꺼짐 · 원하는 기간만 추가하세요';
}
async function updateEMAs(preserveRange=null){
 const version=++emaVersion,marketVersion=loading,currentSymbol=symbol,currentTF=tf;
 const enabled=emas.filter(e=>e.enabled);
 if(!enabled.length){emaBusy=false;return;}
 emaBusy=true;$('emaStatus').textContent='전체 과거 종가로 EMA 계산 중…';
 try{
  const history=maxDays[currentTF]?await load(currentSymbol+'_'+currentTF+'_closes'):{start:bars[0][0],step:secs[currentTF],values:Float64Array.from(bars,b=>b[4]===null?NaN:b[4])};
  if(version!==emaVersion||marketVersion!==loading)return;
  const prefix=currentSymbol+'_'+currentTF+'_';
  for(const key of emaCache.keys())if(!key.startsWith(prefix))emaCache.delete(key);
  const r=preserveRange||range();syncing=true;
  try{for(const e of enabled){
   const key=prefix+e.period;
   if(!emaCache.has(key))emaCache.set(key,emaValues(history.values,e.period));
   const values=emaCache.get(key);
   e.series.setData(bars.map(b=>{const value=values[Math.round((b[0]-history.start)/history.step)];return Number.isFinite(value)?{time:b[0],value}:{time:b[0]};}));
   e.series.applyOptions({visible:true});
  }}finally{syncing=false;}
  if(r)setRange(r);emaBusy=false;renderEMAs();
 }catch(error){if(version!==emaVersion||marketVersion!==loading)return;emaBusy=false;$('emaStatus').className='error';$('emaStatus').textContent=error.message;console.error(error);}
}
$('emaForm').onsubmit=event=>{
 event.preventDefault();const period=Number($('emaPeriod').value);
 if(!Number.isInteger(period)||period<2||period>1000){$('emaStatus').textContent='기간은 2~1,000 사이의 정수로 입력하세요.';return;}
 const existing=emas.find(e=>e.period===period);
 if(existing){existing.enabled=true;existing.series.applyOptions({visible:true});}
 else{
  if(emas.length>=6){$('emaStatus').textContent='EMA는 최대 6개입니다. 기존 선을 삭제한 뒤 추가하세요.';return;}
  const color=emaColors.find(c=>!emas.some(e=>e.color===c))||emaColors[0];
  const series=chart.addLineSeries({color,lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:true,title:'EMA '+period});
  emas.push({period,color,enabled:true,series});
 }
 renderEMAs();if(!updating)updateEMAs();
};
$('emaList').onchange=event=>{
 const e=emas.find(v=>v.period===Number(event.target.dataset.emaToggle));if(!e)return;
 e.enabled=event.target.checked;e.series.applyOptions({visible:e.enabled});renderEMAs();if(!updating)updateEMAs();
};
$('emaList').onclick=event=>{
 const button=event.target.closest('[data-ema-remove]');if(!button)return;
 const i=emas.findIndex(e=>e.period===Number(button.dataset.emaRemove));if(i<0)return;
 const [e]=emas.splice(i,1);chart.removeSeries(e.series);
 for(const key of emaCache.keys())if(key.endsWith('_'+e.period))emaCache.delete(key);
 renderEMAs();if(!updating)updateEMAs();
};
async function refresh(keep=true,requested=null,targetTime=null){
 updating=true;window.chartReady=false;emaVersion++;
 const token=++loading,currentSymbol=symbol,currentTF=tf;
 let r=requested||(keep?range():null);
 const oldTime=targetTime??(selected>=0&&events[selected]?events[selected][0]:null);
 $('status').className='';$('status').textContent='데이터를 불러오고 있습니다…';
 try{
  const [market,executions]=await Promise.all([load(currentSymbol+'_'+currentTF),load(currentSymbol+'_events')]);
  if(token!==loading)return;
  const limits=maxDays[currentTF]?{from:market.from,to:market.to}:{from:market[0][0],to:market.at(-1)[0]};
  const center=Date.parse($('date').value+'T12:00:00+09:00')/1000;
  if(!r)r={from:center-3.5*86400,to:center+3.5*86400};
  if(maxDays[currentTF]&&r.to-r.from>maxDays[currentTF]*86400&&oldTime&&oldTime/1000>=r.from&&oldTime/1000<=r.to){
   const half=maxDays[currentTF]*43200;r={from:oldTime/1000-half,to:oldTime/1000+half};
  }
  r=clampRange(r,limits,currentTF);
  let rows=market,keys=[];
  if(maxDays[currentTF]){
   const pad=Math.max(2*86400,(r.to-r.from)*.2);
   keys=market.chunks.filter(c=>c.to>=r.from-pad&&c.from<=r.to+pad).map(c=>c.key);
   rows=(await Promise.all(keys.map(load))).flat();
  }
  if(token!==loading)return;
  bounds=limits;activeChunks=new Set(keys);bars=rows;events=executions.events;orders=executions.orders;positions=P.build(events);
  barMap=new Map(bars.map(b=>[b[0],b]));
  if(selectionLine){candle.removePriceLine(selectionLine);selectionLine=null;}
  for(const a of anchors){a.setMarkers([]);a.setData([]);}
  for(const e of emas)e.series.setData([]);
  candle.setData(bars.map(b=>b[4]===null?{time:b[0]}:{time:b[0],open:b[1],high:b[2],low:b[3],close:b[4]}));
  volume.setData(bars.map(b=>b[4]===null?{time:b[0]}:{time:b[0],value:b[5],color:b[4]>=b[1]?'#d4e7df':'#f0dcd6'}));
  pseries.setData(bars.map(b=>({time:b[0],value:b[6]/1e6})));
  plow.setData(bars.map(b=>({time:b[0],value:b[7]/1e6})));
  phigh.setData(bars.map(b=>({time:b[0],value:b[8]/1e6})));
  prepareBins();
  const ticker=symbol==='XBTUSD'?'BTCUSDT':'ETHUSDT';$('chartTitle').textContent=ticker+' · '+names[tf];
  document.querySelectorAll('[data-tf]').forEach(b=>b.classList.toggle('active',b.dataset.tf===tf));
  document.querySelectorAll('[data-days]').forEach(b=>{b.disabled=Number(b.dataset.days)>(maxDays[tf]||Infinity);b.title=b.disabled?'1분봉은 최대 31일씩 표시합니다.':'';});
  $('all').textContent=maxDays[tf]?'전체 · 일봉':'전체';
  $('windowNote').hidden=!maxDays[tf];
  $('windowNote').textContent=`${names[tf]}봉은 최대 ${maxDays[tf]}일씩 표시합니다. 드래그 또는 날짜 이동으로 2018~2021년 전체 기간을 탐색하세요.`;
  for(const c of[chart,pchart])c.timeScale().applyOptions({tickMarkFormatter:t=>tf==='1d'?when(t).slice(0,10):when(t).slice(5,16)});
  page=0;setRange(r);
  const target=oldTime??Date.parse($('date').value+'T00:00:00+09:00');let nearest=0;
  events.forEach((v,i)=>{if(Math.abs(v[0]-target)<Math.abs(events[nearest][0]-target))nearest=i;});
  selectEvent(nearest,false);
  // Only the current fine-grained window is retained. Full close vectors are small enough to cache for exact EMA.
  for(const key of loaded.keys())if(/_(1m|5m)_\d{3}$/.test(key)&&!activeChunks.has(key)){loaded.delete(key);delete window.CHART_DATA[key];}
  await updateEMAs(r);if(token!==loading)return;
  updating=false;setRange(r);schedule();window.chartReady=true;
 }catch(error){if(token!==loading)return;updating=false;emaBusy=false;$('status').className='error';$('status').textContent=error.message;console.error(error);}
}

document.querySelectorAll('[data-tf]').forEach(b=>b.onclick=()=>{tf=b.dataset.tf;refresh(true);});
$('symbol').onchange=()=>{symbol=$('symbol').value;selected=-1;activePosition=null;refresh(true);};
async function goDate(){
 const value=$('date').value;if(!value||updating)return;
 const t=Date.parse(value+'T12:00:00+09:00')/1000;
 let best=0;events.forEach((e,i)=>{if(Math.abs(e[0]/1000-t)<Math.abs(events[best][0]/1000-t))best=i;});
 selected=best;await focus(t);selectEvent(best,false);$('date').value=value;
}
$('go').onclick=goDate;$('date').onkeydown=e=>{if(e.key==='Enter')goDate();};
$('positionPrevious').onclick=()=>focusPosition(activePosition-1);$('positionNext').onclick=()=>focusPosition(activePosition+1);$('positionFocus').onclick=()=>focusPosition();
$('onlyPosition').onchange=()=>{page=0;markerUpdate();renderTable();if(selected>=0)showBucket(bucketOf(events[selected]));updateStatus();};
$('previous').onclick=()=>selectEvent(selected-1);$('next').onclick=()=>selectEvent(selected+1);
document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-days]').forEach(x=>x.classList.toggle('active',x===b));const r=range();focus(selected>=0?bucketOf(events[selected]):(r.from+r.to)/2,Number(b.dataset.days));});
$('all').onclick=()=>{if(maxDays[tf]){tf='1d';refresh(true,{from:1514764800,to:1640908800});}else setRange(bounds);};
for(const id of['labels','markers'])$(id).onchange=markerUpdate;
$('extremes').onchange=()=>{plow.applyOptions({visible:$('extremes').checked});phigh.applyOptions({visible:$('extremes').checked});};
$('actionFilter').onchange=()=>{page=0;renderTable();updateStatus();};$('pagePrev').onclick=()=>{page--;renderTable();};$('pageNext').onclick=()=>{page++;renderTable();};
document.addEventListener('click',e=>{const target=e.target.closest('[data-position]');if(target){$('onlyPosition').checked=true;focusPosition(Number(target.dataset.position));return;}const row=e.target.closest('[data-event]');if(row)selectEvent(Number(row.dataset.event));});
$('tradeRows').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.event)selectEvent(Number(e.target.dataset.event));});
// Read-only state hook for verification and reproducibility.
window.chartState=()=>({symbol,tf,activePosition,positionCount:positions.cycles.length,onlyPosition:$('onlyPosition').checked,bars:bars.length,events:events.length,selected,selectedTime:selected>=0?events[selected][0]:null,range:range(),visibleTrades:filtered.length,selectedBucket:selected>=0?bucketOf(events[selected]):null,loadedFrom:bars[0]?.[0],loadedTo:bars.at(-1)?.[0],bounds,updating,emaBusy,emas:emas.map(e=>({period:e.period,enabled:e.enabled}))});
window.chartInspect=t=>({bar:barMap.get(t),bucket:bins.has(t)?{ids:bins.get(t).ids,qty:bins.get(t).sides.map(s=>s?.qty||0)}:null,emas:emas.map(e=>({period:e.period,value:e.series.data().find(d=>d.time===t)?.value??null}))});
refresh(false);
