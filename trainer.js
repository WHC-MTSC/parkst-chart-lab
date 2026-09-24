'use strict';
const $=id=>document.getElementById(id),D=TrainingData,S=TrainingSim,C=TradeComparison,STEP=C.STEP;
const NAME={'1m':'1분','5m':'5분','15m':'15분','1h':'1시간','4h':'4시간'};
const P=PositionLabels;
const ownRead=e=>({before:e.before,after:e.after,time:e.time,end:e.time,price:e.price});
const ownFills=()=>session.sim.logs.filter(e=>e.price!=null);
const positionPercent=(v,limit)=>v?P.direction(v)+' '+n(100*Math.abs(v)/limit)+'%':'무포지션';
const trainBadge=(c,owner='내')=>c?`<span class="position-badge ${c.side>0?'is-long':'is-short'}">${owner} ${P.direction(c.side)} #${c.id}</span>`:'';
const COLORS=['#d88e24','#626ac6','#b45c9b','#398cc0','#7b7542','#37536b'];
const STORE='wonyotti-position-test-v2';
const numberFormat=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2});
const n=x=>Number.isFinite(x)?numberFormat.format(x):'—';
const kst=t=>new Date((t+32400)*1000).toISOString().slice(0,19).replace('T',' ');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null,tf='1h',bars=[],barMap=new Map(),busy=false,playing=false,playTimer=null,renderVersion=0,viewCursor=null,follow=true,emaPrefs=[],emaSeries=[],priceLines=[],aoa=[],benchmark=[];
const emaCache=new Map(),catalogs=new Map(),emaLines=new Map(),benchmarkModels=new WeakMap();
const chart=LightweightCharts.createChart($('trainingChart'),{height:$('trainingChart').clientHeight,layout:{background:{type:'solid',color:'#ffffff'},textColor:'#61767b',fontFamily:'Malgun Gothic, sans-serif',fontSize:11},grid:{vertLines:{color:'#f1f4f2'},horzLines:{color:'#edf2ef'}},rightPriceScale:{borderColor:'#dde6e1',minimumWidth:75},timeScale:{borderColor:'#dde6e1',timeVisible:true,secondsVisible:false,rightOffset:8},localization:{locale:'ko-KR',timeFormatter:t=>kst(t)},crosshair:{mode:0}});
const candle=chart.addCandlestickSeries({upColor:'#188c7b',downColor:'#cf665c',wickUpColor:'#188c7b',wickDownColor:'#cf665c',borderVisible:false,priceLineVisible:false,lastValueVisible:false});
candle.priceScale().applyOptions({scaleMargins:{top:.1,bottom:.2}});
const volume=chart.addHistogramSeries({priceScaleId:'',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});volume.priceScale().applyOptions({scaleMargins:{top:.87,bottom:0}});
const ownLine=chart.addLineSeries({lineVisible:false,pointMarkersVisible:false,crosshairMarkerVisible:false,lastValueVisible:false,priceLineVisible:false});
const aoaLine=chart.addLineSeries({lineVisible:false,pointMarkersVisible:false,crosshairMarkerVisible:false,lastValueVisible:false,priceLineVisible:false});
new ResizeObserver(()=>{const el=$('trainingChart');if(el.clientWidth>0&&el.clientHeight>0)chart.resize(el.clientWidth,el.clientHeight);}).observe($('trainingChart'));

const positionChart=LightweightCharts.createChart($('comparisonChart'),{height:150,layout:{background:{type:'solid',color:'#fff'},textColor:'#61767b',fontSize:11},grid:{vertLines:{color:'#f1f4f2'},horzLines:{color:'#edf2ef'}},timeScale:{timeVisible:true,secondsVisible:false},rightPriceScale:{minimumWidth:75},localization:{timeFormatter:t=>kst(t)}});
const myPositionLine=positionChart.addLineSeries({color:'#386c9b',lineWidth:2,lineType:1,priceLineVisible:false,lastValueVisible:false,priceFormat:{type:'custom',formatter:v=>n(v)+'%'}});
const referencePositionLine=positionChart.addLineSeries({color:'#b18b31',lineWidth:2,lineType:1,priceLineVisible:false,lastValueVisible:false,priceFormat:{type:'custom',formatter:v=>n(v)+'%'}});
window.ParkstTheme?.bind([chart,positionChart]);
new ResizeObserver(()=>{const width=$('comparisonChart').clientWidth;if(width>0)positionChart.resize(width,150);}).observe($('comparisonChart'));

function message(text=''){ $('orderMessage').textContent=text; }
function cutoff(){return viewCursor??session.cursor;}
function pause(){playing=false;clearTimeout(playTimer);$('play').textContent='▶ 재생';}
function setBusy(value){busy=value;$('orderForm').closest('aside').setAttribute('aria-busy',String(value));updateControls();}
function updateControls(){
 const active=session?.status==='active';
 for(const id of ['step','stepBar','finish','long','short','observe'])$(id).disabled=busy||!active;
 $('play').disabled=!active||(busy&&!playing);
 for(const id of ['reduce','closePosition'])$(id).disabled=busy||!active||!session?.sim.position||Boolean(session?.sim.pending);
 $('cancelOrder').disabled=busy||!active||!session?.sim.pending;
 $('randomSession').disabled=busy;$('importJSON').disabled=busy;
 for(const id of ['compareControl','comparisonDetails','comparisonReport','positionCompare'])$(id).hidden=active||!session;
 $('modeBadge').textContent=active?'블라인드':'비교';$('modeBadge').classList.toggle('finished',!active);$('stepBar').textContent='+'+NAME[tf];
}
function stored(){try{return JSON.parse(localStorage.getItem(STORE)||'[]').filter(S.validSession);}catch{return [];}}
function persist(){
 if(!session)return;session.tf=tf;session.emas=emaPrefs.map(e=>({...e}));session.updated=Date.now();
 try{const list=stored().filter(s=>s.id!==session.id);list.unshift(session);localStorage.setItem(STORE,JSON.stringify(list.slice(0,20)));$('saveState').textContent='이 브라우저에 저장됨';renderSaved(list.slice(0,20));}
 catch{$('saveState').textContent='저장 불가 · 테스트 파일을 내려받으세요';}
}
function renderSaved(list=stored()){
 $('savedSessions').innerHTML=list.map(s=>`<div class="saved-item"><div><b>${s.symbol==='XBTUSD'?'BTC':'ETH'} · ${NAME[s.baseTF]} 기준 · ${kst(s.start).slice(0,16)}</b><br><span>${s.status==='active'?'진행 중':'종료 · 포지션 유사도 '+n(s.result?.overlap)+(s.result?.overlap!=null?'%':'')}</span></div><button data-resume="${esc(s.id)}">${s.id===session?.id?'현재 테스트':s.status==='active'?'이어 하기':'비교 보기'}</button></div>`).join('')||'<p class="hint">저장한 테스트가 없습니다.</p>';
}
async function getCatalog(symbol){if(!catalogs.has(symbol)){const data=await D.load(symbol+'_events');catalogs.set(symbol,{events:data.events,episodes:C.episodes(data.events)});}return catalogs.get(symbol);}
async function newSession(){
 if(busy)return;pause();message();setBusy(true);
 try{
  const symbol=$('trainSymbol').value,baseTF=$('challengeTF').value,data=await getCatalog(symbol);let challenge;
  for(let attempt=0;attempt<40;attempt++){const chosen=C.pick(data.episodes,baseTF),last=await D.windowData(symbol,'1m',chosen.start-60,chosen.start);if(last[0]?.[4]!=null){challenge=chosen;break;}}
  if(!challenge)throw Error('봉 데이터가 있는 구간을 찾지 못했습니다. 다시 시작하세요.');
  if(session)persist();session={version:2,model:'wonyotti-match',id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),symbol,baseTF,start:challenge.start,cursor:challenge.start,status:'active',challenge,sim:S.create(challenge.limit)};
  tf=baseTF;benchmark=data.events;viewCursor=null;follow=true;$('compare').checked=false;aoa=[];$('comparisonRows').innerHTML='';$('playStep').value=String(STEP[baseTF]);
  await renderChart(true);persist();
 }catch(error){setBusy(false);message(error.message);}
}
function applyPrefs(prefs){
 emaPrefs=Array.isArray(prefs)?prefs.filter(e=>Number.isInteger(e.period)&&e.period>=2&&e.period<=1000).slice(0,6).map(e=>({period:e.period,enabled:!!e.enabled})):[];
 emaPrefs=emaPrefs.filter((e,i)=>emaPrefs.findIndex(v=>v.period===e.period)===i);renderEmaChips();
}
async function restore(raw){
 if(busy)return;
 if(!S.validSession(raw))throw Error('판단 비교 테스트 파일이 아닙니다. 이전 수익률 연습 파일은 사용할 수 없습니다.');
 pause();setBusy(true);
 try{
  const data=await getCatalog(raw.symbol);C.resolve(data.episodes,raw.baseTF,raw.challenge);
  if(session)persist();session=JSON.parse(JSON.stringify(raw));benchmark=data.events;tf=STEP[session.tf]?session.tf:session.baseTF;viewCursor=session.status==='finished'?session.challenge.end:null;follow=true;
  applyPrefs(session.emas);$('trainSymbol').value=session.symbol;$('challengeTF').value=session.baseTF;$('playStep').value=String(STEP[session.baseTF]);
  $('compare').checked=session.status==='finished';await renderChart(true);persist();
 }catch(error){setBusy(false);throw error;}
}
async function replayBars(symbol,interval,time){
 const step=STEP[interval],bucket=Math.floor((time-1)/step)*step;
 const from=Math.max(1517443200,bucket-599*step);
 const rows=await D.windowData(symbol,interval,from,time);
 const result=rows.filter(b=>b[0]+step<=time).map(b=>b.slice(0,6));
 let partial=false;
 if(bucket+step>time){
  partial=true;const minutes=await D.windowData(symbol,'1m',bucket,time);
  const expected=(time-bucket)/60;
  if(minutes.length!==expected||minutes.some(b=>b[4]==null))result.push([bucket,null,null,null,null,null]);
  else result.push([bucket,minutes[0][1],Math.max(...minutes.map(b=>b[2])),Math.min(...minutes.map(b=>b[3])),minutes.at(-1)[4],minutes.reduce((sum,b)=>sum+b[5],0)]);
 }
 return {rows:result.slice(-600),partial};
}
async function renderChart(reset=false){
 if(!session)return;const version=++renderVersion;setBusy(true);window.trainerReady=false;
 const currentSymbol=session.symbol,currentTF=tf,time=cutoff();$('trainStatus').textContent='현재 시각까지의 봉을 준비하고 있습니다…';
 try{
  const [result,latest]=await Promise.all([replayBars(currentSymbol,currentTF,time),D.windowData(currentSymbol,'1m',time-60,time)]);
  if(version!==renderVersion)return;
  bars=result.rows;barMap=new Map(bars.map(b=>[b[0],b]));
  if(!viewCursor)session.sim.lastPrice=latest[0]?.[4]??null;
  ownLine.setMarkers([]);ownLine.setData([]);aoaLine.setMarkers([]);aoaLine.setData([]);
  const enabledPeriods=new Set(emaPrefs.filter(p=>p.enabled).map(p=>p.period));
  for(const [period,line] of emaLines)if(!enabledPeriods.has(period)){chart.removeSeries(line);emaLines.delete(period);}
  emaSeries=[];
  for(const line of priceLines)candle.removePriceLine(line);priceLines=[];
  candle.setData(bars.map(b=>b[4]==null?{time:b[0]}:{time:b[0],open:b[1],high:b[2],low:b[3],close:b[4]}));
  volume.setData(bars.map(b=>b[4]==null?{time:b[0]}:{time:b[0],value:b[5],color:b[4]>=b[1]?'#188c7b55':'#cf665c55'}));
  if(emaPrefs.some(e=>e.enabled)){
   const history=await D.history(currentSymbol,currentTF);if(version!==renderVersion)return;
   const prefix=currentSymbol+'_'+currentTF+'_';
   for(const key of emaCache.keys())if(!key.startsWith(prefix))emaCache.delete(key);
   for(let i=0;i<emaPrefs.length;i++){
    const pref=emaPrefs[i];if(!pref.enabled)continue;
    const key=prefix+pref.period;if(!emaCache.has(key))emaCache.set(key,D.ema(history.values,pref.period));
    const values=emaCache.get(key);let line=emaLines.get(pref.period);
    if(!line){line=chart.addLineSeries({color:COLORS[i],lineWidth:2,priceLineVisible:false,lastValueVisible:false,title:'EMA '+pref.period});emaLines.set(pref.period,line);}else line.applyOptions({color:COLORS[i]});
    const points=bars.map((b,j)=>{const value=result.partial&&j===bars.length-1?D.partialEMA(history,values,b[0],b[4],pref.period):values[Math.round((b[0]-history.start)/history.step)];return Number.isFinite(value)?{time:b[0],value}:{time:b[0]};});
    line.setData(points);emaSeries.push(line);
   }
  }
  drawOwn();
  drawPositionComparison();
  if(session.status==='finished'&&$('compare').checked)await drawAOA(time,version);
  if(version!==renderVersion)return;
  const ticker=currentSymbol==='XBTUSD'?'BTCUSDT':'ETHUSDT';$('trainTitle').textContent=`${ticker} · ${NAME[currentTF]}${result.partial?' · 진행 중인 봉':''}`;
  $('replayClock').textContent=kst(time).slice(0,16)+' KST';
  document.querySelectorAll('[data-train-tf]').forEach(b=>b.classList.toggle('active',b.dataset.trainTf===tf));
  chart.timeScale().applyOptions({tickMarkFormatter:t=>kst(t).slice(5,16)});
  if(reset||follow){chart.timeScale().setVisibleLogicalRange({from:Math.max(-1,bars.length-160),to:bars.length+8});}
  const missing=bars.filter(b=>b[4]==null).length;
  $('trainStatus').textContent=`${bars.length}봉 · 누락 ${missing}봉 · ${session.status==='active'?'미래와 워뇨띠 매매 숨김':'종료한 테스트 복기'}${result.partial?' · 마지막 봉은 현재까지의 값':''}`;
  $('trainOHLC').textContent=latest[0]?.[4]!=null?`최근 완료 1분봉 종가 ${n(latest[0][4])} USDT · 현재 시각 이후의 봉은 숨겨져 있습니다.`:'직전 1분봉 누락 · 새 주문을 받을 수 없습니다.';
  renderPanels();setBusy(false);window.trainerReady=true;
 }catch(error){if(version!==renderVersion)return;pause();setBusy(false);$('trainStatus').textContent=error.message;message(error.message);console.error(error);}
}
function drawPositionEvents(line,rows,model,read,owner){
 const groups=new Map(),time=cutoff();
 rows.forEach((row,i)=>{
  const e=read(row);if((e.end??e.time)>=time)return;
  const t=Math.floor(e.time/STEP[tf])*STEP[tf];if(!barMap.has(t))return;
  if(!groups.has(t))groups.set(t,[]);
  for(const leg of model.records[i].legs)groups.get(t).push({...leg,price:e.price});
 });
 line.setData([...groups].map(([time,list])=>({time,value:list.reduce((sum,l)=>sum+l.price*l.qty,0)/list.reduce((sum,l)=>sum+l.qty,0)})));
 const markers=[];
 for(const[time,list]of groups){
  // One label per lifecycle on a candle keeps a round-trip identifiable on higher timeframes.
  const cycles=new Map();for(const leg of list){if(!cycles.has(leg.cycleId))cycles.set(leg.cycleId,[]);cycles.get(leg.cycleId).push(leg);}
  const entries=[...cycles];
  if(entries.length>3){markers.push({time,position:owner==='내'?'belowBar':'aboveBar',shape:'circle',color:owner==='내'?'#386c9b':'#b18b31',text:`${owner} ${entries.length}개 포지션`});continue;}
  for(const[id,legs]of entries){
   const c=model.cycles[id-1],kinds=[...new Set(legs.map(l=>l.kind))],first=kinds[0],single=kinds.length===1;
   markers.push({time,position:owner==='내'?'belowBar':'aboveBar',shape:single&&(first==='close'||first==='reduce')?'square':single&&first==='entry'?(c.side>0?'arrowUp':'arrowDown'):'circle',color:owner==='내'?(c.side>0?'#087f73':'#c04f49'):'#a47f22',text:`${owner} ${P.direction(c.side)} #${id} ${kinds.map(k=>P.names[k]).join('·')}`});
  }
 }
 line.setMarkers(markers);
}
function drawOwn(){const rows=ownFills();drawPositionEvents(ownLine,rows,P.build(rows,ownRead),ownRead,'내');}
function drawPositionComparison(){
 const finished=session.status==='finished';$('positionCompare').hidden=!finished;
 if(!finished){myPositionLine.setData([]);referencePositionLine.setData([]);return;}
 const own=session.sim.logs.filter(e=>e.price!=null),ref=benchmark.slice(session.challenge.entryIndex,session.challenge.exitIndex+1),end=cutoff();
 const completed=e=>(Math.floor(e[1]/60000)+1)*60;
 const times=[...new Set([session.start,end,Math.min(end,session.cursor),...own.map(e=>e.time+60),...ref.map(completed)])].filter(t=>t>=session.start&&t<=end).sort((a,b)=>a-b);
 const mine=[],theirs=[];let i=0,j=0,a=0,b=0;
 for(const time of times){while(i<own.length&&own[i].time+60<=time)a=own[i++].after;while(j<ref.length&&completed(ref[j])<=time)b=ref[j++][8];mine.push(time>session.cursor?{time}:{time,value:100*a/session.sim.limit});theirs.push({time,value:100*b/session.sim.limit});}
 myPositionLine.setData(mine);referencePositionLine.setData(theirs);
 positionChart.timeScale().applyOptions({tickMarkFormatter:t=>kst(t).slice(5,16)});
 if(end>session.start)positionChart.timeScale().setVisibleRange({from:session.start,to:end});
}
async function drawAOA(time,version){
 if(version!==renderVersion)return;
 aoa=benchmark.slice(session.challenge.entryIndex,session.challenge.exitIndex+1).filter(e=>e[1]<time*1000);
 const full=P.build(benchmark),offset=session.challenge.entryIndex;
 const model={cycles:full.cycles,records:full.records.slice(offset,offset+aoa.length)};
 drawPositionEvents(aoaLine,aoa,model,e=>({before:e[7],after:e[8],time:e[0]/1000,end:e[1]/1000,price:e[4]}),'워뇨띠');
}
function renderOrderLabels(){
 if(!session)return;
 const percent=Number($('orderAmount').value),valid=Number.isInteger(percent)&&percent>=1&&percent<=100;
 const qty=valid?Math.max(1,Math.floor(session.sim.limit*percent/100)):0;
 for(const[id,side]of [['long',1],['short',-1]]){
  const text=valid?P.describe(session.sim.position,session.sim.position+side*qty).label:side>0?'매수':'매도';
  $(id).innerHTML=`${text}<small>${side>0?'매수':'매도'}${valid?' '+n(percent)+'%':''}</small>`;
 }
}
chart.subscribeCrosshairMove(event=>{const b=barMap.get(Number(event.time));if(b)$('trainOHLC').textContent=`${kst(b[0]).slice(0,16)} KST · ${b[4]==null?'데이터 누락':`O ${n(b[1])} H ${n(b[2])} L ${n(b[3])} C ${n(b[4])} V ${n(b[5])}`}`;});
$('trainingChart').addEventListener('pointerdown',()=>{follow=false;});$('trainingChart').addEventListener('wheel',()=>{follow=false;},{passive:true});
function renderPanels(){
 const s=session.sim,p=s.position,ratio=100*p/s.limit,finished=session.status==='finished';
 const fills=ownFills(),model=P.build(fills,ownRead),byFill=new Map(fills.map((e,i)=>[e,model.records[i]])),current=model.cycles.at(-1);
 renderOrderLabels();
 $('positionSummary').innerHTML=p?`${trainBadge(current)}<br><b>${n(Math.abs(ratio))}% 보유</b> · 남은 한도 ${n(100-Math.abs(ratio))}%`:'<b>무포지션 · 0%</b><br>사용 가능 한도 100%';
 $('positionUsage').value=Math.abs(ratio);
 $('pendingSummary').textContent=s.pending?`다음 시가 · ${P.describe(p,p+s.pending.side*s.pending.qty).label} ${n(100*s.pending.qty/s.limit)}% 대기`:'대기 주문 없음';
 $('sessionSummary').textContent=`${kst(session.start).slice(0,16)} → ${kst(session.cursor).slice(0,16)} KST · ${NAME[session.baseTF]} 기준 테스트 · 누락 ${s.gapTimes.length}분`;
 const items=[...s.logs,...s.decisions.map(d=>({...d,type:d.kind==='observe'?'관망':'주문 제출'}))].sort((a,b)=>b.time-a.time);
 $('journalRows').innerHTML=items.slice(0,250).map(e=>{
  const r=byFill.get(e),label=r?r.label:esc(e.type),badges=r?r.cycleIds.map(id=>trainBadge(model.cycles[id-1])).join(' → '):'';
  const position=e.after!=null?`${positionPercent(e.before,s.limit)} → ${positionPercent(e.after,s.limit)}`:e.qty!=null?(e.side===1?'매수 ':'매도 ')+n(100*e.qty/s.limit)+'% 대기':'—';
  return `<tr ${finished?`data-review-time="${e.time}" tabindex="0"`:''}><td>${kst(e.time)}</td><td>${badges}<strong class="journal-action">${label}</strong></td><td>${position}</td><td>${esc(e.reason||'')}${e.timeframe?' · '+esc(NAME[e.timeframe]):''}</td></tr>`;
 }).join('')||'<tr><td colspan="4">아직 판단 기록이 없습니다.</td></tr>';
 if(finished){
  const r=C.score(session,benchmark);session.result=r;const c=session.challenge,first=benchmark[c.entryIndex];
  $('similarityValue').textContent=r.overlap==null?'비교 불가':n(r.overlap)+'%';$('directionValue').textContent=r.direction==null?'—':n(r.direction)+'%';
  $('timingValue').textContent=r.timingBars==null?'진입 없음':r.timingBars===0?'같은 봉':n(Math.abs(r.timingBars))+'봉 '+(r.timingBars<0?'빠름':'늦음');
  $('sizeValue').textContent=n(r.peak)+'%';$('completionLabel').textContent=r.complete?'선택 구간 완료':'일부 구간 비교';
  $('answerSummary').textContent=`${NAME[session.baseTF]} ${c.offset}봉 전에서 시작 · 워뇨띠 첫 진입 ${kst(first[0]/1000)} KST (${first[8]>0?'롱':'숏'}) · 이 구간 최대 포지션 ${n(c.limit)} 계약`;
  const firstMatch=r.firstDirection==null?'내 첫 진입 없음':r.firstDirection?'첫 진입 방향 같음':'첫 진입 방향 다름';
  $('comparisonNote').textContent=(r.beforeEntry?'워뇨띠 진입 이전에 종료했습니다. ':'')+`${firstMatch}. ${r.activeMinutes}분의 보유 구간을 비교했습니다. 종료 후 차트에는 정답 구간 전체를 공개하며 점수는 진행한 구간만 비교합니다.`;
  if(!benchmarkModels.has(benchmark))benchmarkModels.set(benchmark,P.build(benchmark));const ref=benchmarkModels.get(benchmark);
  $('comparisonRows').innerHTML=benchmark.slice(Math.max(c.entryIndex,c.exitIndex-499),c.exitIndex+1).map((e,offset)=>{
   const i=Math.max(c.entryIndex,c.exitIndex-499)+offset,r=ref.records[i];return `<tr><td>${kst(e[0]/1000)}</td><td>${r.label}<small class="execution-side">${e[2]===1?'매수':'매도'} 체결</small></td><td>${r.cycleIds.map(id=>trainBadge(ref.cycles[id-1],'워뇨띠')).join(' → ')}</td><td>${n(e[3])}</td><td>${positionPercent(e[7],c.limit)} → ${positionPercent(e[8],c.limit)}</td></tr>`;
  }).join('');
 }
 updateControls();
}
async function advance(seconds){
 if(busy||session?.status!=='active')return;
 setBusy(true);message();const current=session,end=Math.min(session.challenge.end,session.cursor+seconds),start=session.cursor;
 try{
  const rows=await D.windowData(session.symbol,'1m',start,end),map=new Map(rows.map(b=>[b[0],b]));if(session!==current)return;
  for(let time=start;time<end;time+=60)S.minute(session.sim,map.get(time)||[time,null,null,null,null,null]);
  session.cursor=end;viewCursor=null;follow=true;
  if(end>=session.challenge.end){session.status='finished';pause();$('compare').checked=true;viewCursor=end;message('선택한 매매 구간이 끝났습니다. 비교 결과를 확인하세요.');}
  await renderChart();persist();
 }catch(error){pause();setBusy(false);message(error.message);console.error(error);}
}
async function tick(){if(!playing||session?.status!=='active')return;await advance(Number($('playStep').value));if(playing)playTimer=setTimeout(tick,Number($('speed').value));}
function queueEntry(side){
 pause();message();if(busy||session?.status!=='active')return;
 try{const percent=Number($('orderAmount').value);if(!Number.isInteger(percent)||percent<1||percent>100)throw Error('주문 비중은 1~100%로 입력하세요.');
  const qty=Math.max(1,Math.floor(session.sim.limit*percent/100));
  S.queue(session.sim,{side,qty,reason:$('reason').value.trim(),setup:$('setup').value,trend:$('trend').value,timeframe:tf},session.cursor,session.sim.lastPrice);
  renderPanels();persist();message('주문을 기록했습니다. 다음 1분봉 시가에 반영합니다.');
 }catch(error){message(error.message);}
}
function queueExit(fraction){
 pause();if(busy||session?.status!=='active')return;message();
 try{const p=session.sim.position;if(!p)throw Error('청산할 포지션이 없습니다.');S.queue(session.sim,{side:-Math.sign(p),qty:fraction===1?Math.abs(p):Math.max(1,Math.floor(Math.abs(p)*fraction)),reason:$('reason').value.trim()||(fraction===1?'전량 청산':'부분 청산'),timeframe:tf},session.cursor,session.sim.lastPrice);renderPanels();persist();}catch(error){message(error.message);}
}
async function finish(){if(!session||busy||session.status!=='active')return;pause();S.cancel(session.sim,session.cursor);session.status='finished';viewCursor=session.challenge.end;$('compare').checked=true;await renderChart(true);persist();}
function renderEmaChips(){ $('trainEmaList').innerHTML=emaPrefs.map((e,i)=>`<span class="emachip ${e.enabled?'':'disabled'}"><label style="color:${COLORS[i]}"><input type="checkbox" data-toggle-period="${e.period}" ${e.enabled?'checked':''}>EMA ${e.period}</label><button data-remove-period="${e.period}" aria-label="EMA ${e.period} 삭제">×</button></span>`).join(''); }
function download(name,text,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('randomSession').onclick=newSession;
$('play').onclick=()=>{if(playing)pause();else{playing=true;$('play').textContent='Ⅱ 일시정지';tick();}};
$('step').onclick=()=>{pause();advance(60);};$('stepBar').onclick=()=>{pause();advance(STEP[tf]);};$('finish').onclick=finish;
$('long').onclick=()=>queueEntry(1);$('short').onclick=()=>queueEntry(-1);$('reduce').onclick=()=>queueExit(.5);$('closePosition').onclick=()=>queueExit(1);
$('cancelOrder').onclick=()=>{pause();S.cancel(session.sim,session.cursor);renderPanels();persist();};$('orderForm').onsubmit=e=>e.preventDefault();
document.querySelectorAll('[data-amount]').forEach(b=>b.onclick=()=>{$('orderAmount').value=b.dataset.amount;renderOrderLabels();});
$('orderAmount').addEventListener('input',renderOrderLabels);
$('observe').onclick=()=>{pause();if(busy||session?.status!=='active')return;const reason=$('reason').value.trim();if(!reason){message('관망 이유를 입력하세요.');return;}session.sim.decisions.push({time:session.cursor,kind:'observe',reason,timeframe:tf,trend:$('trend').value,setup:$('setup').value});renderPanels();persist();message('관망을 기록했습니다.');};
document.querySelectorAll('[data-train-tf]').forEach(button=>button.onclick=async()=>{pause();tf=button.dataset.trainTf;follow=true;await renderChart(true);persist();});
$('trainEmaForm').onsubmit=async e=>{e.preventDefault();pause();const period=Number($('trainEmaPeriod').value);if(!Number.isInteger(period)||period<2||period>1000)return;const existing=emaPrefs.find(v=>v.period===period);if(existing)existing.enabled=true;else if(emaPrefs.length<6)emaPrefs.push({period,enabled:true});else{$('trainEmaHint').textContent='최대 6개입니다.';return;}renderEmaChips();await renderChart();persist();};
$('trainEmaList').onchange=async e=>{const pref=emaPrefs.find(v=>v.period===Number(e.target.dataset.togglePeriod));if(pref){pause();pref.enabled=e.target.checked;renderEmaChips();await renderChart();persist();}};
$('trainEmaList').onclick=async e=>{const b=e.target.closest('[data-remove-period]');if(b){pause();emaPrefs=emaPrefs.filter(v=>v.period!==Number(b.dataset.removePeriod));renderEmaChips();await renderChart();persist();}};
$('compare').onchange=()=>renderChart();$('followCursor').onclick=()=>{viewCursor=session.status==='finished'?session.challenge.end:null;follow=true;renderChart(true);};
$('journalRows').onclick=e=>{const row=e.target.closest('[data-review-time]');if(row&&session.status==='finished'){viewCursor=Math.min(session.challenge.end,Number(row.dataset.reviewTime)+60);follow=true;renderChart(true);}};
$('savedSessions').onclick=e=>{const b=e.target.closest('[data-resume]');if(b&&!busy){const s=stored().find(v=>v.id===b.dataset.resume);if(s)restore(s).catch(e=>message(e.message));}};
$('exportJSON').onclick=()=>{if(!session)return;persist();download(`wonyotti-test-${session.id}.json`,JSON.stringify(session,null,2),'application/json');};
$('exportCSV').onclick=()=>{if(!session)return;const cell=x=>'"'+String(x??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const fills=ownFills(),model=P.build(fills,ownRead),meta=new Map(fills.map((e,i)=>[e,model.records[i]]));const rows=[['시각(KST)','행동','매수/매도','계약 수량','체결 후 비중(%)','판단 근거','시간봉'],...session.sim.logs.map(e=>[kst(e.time),meta.has(e)?meta.get(e).cycleIds.map(id=>'#'+id).join('→')+' '+meta.get(e).label:e.type,e.side===1?'매수':e.side===-1?'매도':'',e.qty??'',e.after==null?'':100*e.after/session.sim.limit,e.reason,e.timeframe||'']),...session.sim.decisions.filter(d=>d.kind==='observe').map(d=>[kst(d.time),'관망','','','',d.reason,d.timeframe])];download(`wonyotti-decisions-${session.id}.csv`,'\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
$('importJSON').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5e6)throw Error('파일은 5MB 이하만 지원합니다.');await restore(JSON.parse(await file.text()));message('테스트 기록을 불러왔습니다.');}catch(error){message(error.message);}finally{e.target.value='';}};
$('reviewLink').onclick=()=>{if(session?.status==='active'){pause();S.cancel(session.sim,session.cursor);session.status='finished';persist();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();persist();}});
window.addEventListener('pagehide',persist);window.addEventListener('message',event=>{if(window.parent!==window&&event.source===window.parent&&event.data?.type==='parkst:pause-replay'){pause();persist();}});
window.trainingState=()=>({ready:window.trainerReady,busy,playing,tf,baseTF:session?.baseTF,symbol:session?.symbol,cursor:session?.cursor,viewCursor,status:session?.status,bars:bars.map(b=>b.slice()),emas:emaSeries.map(s=>s.data()),preferences:emaPrefs.map(p=>({...p})),position:session?.sim.position,pending:session?.sim.pending,logs:session?.sim.logs,decisions:session?.sim.decisions,aoaVisible:aoaLine.data().length,id:session?.id,result:session?.status==='finished'?session.result:null});
(async()=>{const latest=stored()[0];if(latest)await restore(latest);else await newSession();})().catch(error=>{message(error.message);console.error(error);});
