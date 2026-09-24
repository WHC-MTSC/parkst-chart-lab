(function(){
'use strict';
const cache=new Map(),histories=new Map();
function lowerBound(rows,time){let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid][0]<time)lo=mid+1;else hi=mid;}return lo;}
function sliceWindow(rows,from,to){return rows.slice(lowerBound(rows,from),lowerBound(rows,to));}
async function decode(raw){
 if(raw?.encoding!=='f64-gzip')return raw;
 const bytes=Uint8Array.from(atob(raw.data),c=>c.charCodeAt(0));
 const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const values=new Float64Array(buffer);
 if(values.length!==raw.count*raw.columns)throw Error('데이터 길이를 확인할 수 없습니다.');
 if(raw.columns===1)return {start:raw.start,step:raw.step,values};
 const rows=[];for(let i=0;i<raw.count;i++){const row=[raw.start+i*raw.step];for(let j=0;j<raw.columns;j++){const n=values[i*raw.columns+j];row.push(Number.isFinite(n)?n:null);}rows.push(row);}return rows;
}
function load(key){
 if(cache.has(key))return cache.get(key);
 const promise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='data/'+key+'.js';
  script.onerror=()=>{script.remove();cache.delete(key);reject(Error('데이터를 열지 못했습니다: '+key));};
  script.onload=async()=>{script.remove();try{const data=await decode(window.CHART_DATA[key]);delete window.CHART_DATA[key];resolve(data);}catch(error){cache.delete(key);reject(error);}};
  document.body.append(script);
 });cache.set(key,promise);return promise;
}
async function windowData(symbol,tf,from,to){
 const market=await load(symbol+'_'+tf);
 if(Array.isArray(market))return sliceWindow(market,from,to);
 const chunks=market.chunks.filter(c=>c.to>=from&&c.from<to),keys=new Set(chunks.map(c=>c.key));
 const rows=(await Promise.all(chunks.map(c=>load(c.key)))).flatMap(rows=>sliceWindow(rows,from,to));
 if(cache.size>45)for(const key of cache.keys())if(/_(1m|5m)_\d{3}$/.test(key)&&!keys.has(key))cache.delete(key);
 return rows;
}
async function history(symbol,tf){
 if(['1m','5m'].includes(tf))return load(symbol+'_'+tf+'_closes');
 const key=symbol+'_'+tf;if(histories.has(key))return histories.get(key);
 const data=await load(key),step={'15m':900,'1h':3600,'4h':14400,'1d':86400}[tf];
 const result={start:data[0][0],step,values:Float64Array.from(data,b=>b[4]==null?NaN:b[4])};histories.set(key,result);return result;
}
function ema(values,n){
 let count=0,sum=0,prev=NaN;const out=new Float64Array(values.length),a=2/(n+1);out.fill(NaN);
 for(let i=0;i<values.length;i++){const c=values[i];if(!Number.isFinite(c)){count=0;sum=0;prev=NaN;continue;}count++;if(count<=n){sum+=c;if(count===n)out[i]=prev=sum/n;}else out[i]=prev=c*a+prev*(1-a);}return out;
}
function partialEMA(history,values,time,close,n){
 if(close==null)return NaN;const index=Math.round((time-history.start)/history.step),prior=values[index-1];
 if(Number.isFinite(prior))return 2/(n+1)*close+(1-2/(n+1))*prior;
 if(index<n-1)return NaN;let sum=close;for(let j=index-n+1;j<index;j++){const c=history.values[j];if(!Number.isFinite(c))return NaN;sum+=c;}return sum/n;
}
window.TrainingData={load,windowData,history,ema,partialEMA};
})();
