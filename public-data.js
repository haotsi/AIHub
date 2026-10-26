const origin='https://codex-reset.com';
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now()+300000;
const safeLink=value=>{if(typeof value!=='string'||!value.trim()||value.length>2000)return null;try{const u=new URL(value,origin);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['codex-reset.com','x.com','twitter.com','openai.com','status.openai.com','learn.chatgpt.com'].includes(u.hostname)?u.href:null;}catch{return null;}};
const text=(value,max=400)=>typeof value==='string'?value.slice(0,max):'';
async function json(url,maximum=1048576){const response=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('来源暂不可读');const reader=response.body.getReader();let size=0,raw='';const decoder=new TextDecoder();try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum){await reader.cancel();throw Error('响应超限');}raw+=decoder.decode(part.value,{stream:true});}return JSON.parse(raw+decoder.decode());}finally{reader.releaseLock();}}
export function parseForecast(value){
 if(!value||!stamp(value.updated_at)||!value.probabilities||typeof value.probabilities!=='object')throw Error('预测格式异常');
 const probability=v=>{if(v==null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100)throw Error('预测数值异常');return v;};
 if(value.last_reset_at!=null&&!stamp(value.last_reset_at))throw Error('重置时间异常');
 return {at:value.updated_at,version:text(value.model?.version,120)||'Codex Reset',p24:probability(value.probabilities.rounded_24h),p48:probability(value.probabilities.rounded_48h),lastAt:value.last_reset_at??null,lastUrl:null,lastText:'',promise:null};
}
export function parseTimeline(value){if(!value||!Array.isArray(value.events)||value.events.length>200)throw Error('历史格式异常');return value.events.flatMap(e=>{
 if(!e||!stamp(e.announced_at)||typeof e.id!=='string'||e.id.length>200)return [];
 if(e.preview!=null&&typeof e.preview!=='boolean')return [];
 const kind=e.reset_kind==='banked'||e.banked_grant===true||e.group==='credits'?'banked':e.scope!=='global'?'other':e.preview===true?'promise':e.group==='reset'&&e.announcement_state==='announced'&&e.confirmed!==false?'global':'other';
 if(kind==='other')return [];return [{id:e.id,kind,at:e.announced_at,title:text(e.summary||e.body,220),url:safeLink(e.url)}];
}).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,30);}
export function latestPublicReset(p,events){
 const globals=events.filter(e=>e.kind==='global'),event=globals[0],id=p?.lastUrl?.match(/\/status\/(\d+)/)?.[1],matching=id?events.find(e=>e.id===id):null;
 const conflict=matching&&matching.kind==='global'&&p?.lastAt&&Math.abs(Date.parse(p.lastAt)-Date.parse(matching.at))>86400000;
 if(event&&(!p?.lastAt||conflict||matching&&matching.kind!=='global'||Date.parse(event.at)>Date.parse(p.lastAt)))return {at:event.at,title:event.title,url:event.url,label:'记录发布时间',note:conflict?'源站摘要与时间线日期不一致，采用记录发布时间；实际完成时刻未提供。':'第三方记录的发布时间，不代表账户实际完成重置的时刻。'};
 return p?.lastAt&&(!matching||matching.kind==='global')?{at:p.lastAt,title:p.lastText,url:p.lastUrl,label:'源站报告的重置时间',note:''}:null;
}
export function createPublicData(h){
 const {el,date,external,render}=h;let forecast=null,events=[],forecastError='',historyError='',checkedAt=null,pending=false,started=false,lastAttempt=0,chartMeta=null,chartStarted=false,chartError='';
 let chartViewer;
 function refreshView(){if(['forecast','models'].includes(h.section()))render();}
 async function refreshReset(force=false){if(pending||lastAttempt&&Date.now()-lastAttempt<(force?60000:900000))return;started=true;lastAttempt=Date.now();pending=true;refreshView();
  const results=await Promise.allSettled([json(origin+'/api/forecast').then(parseForecast),json(origin+'/api/timeline',2097152).then(parseTimeline)]);
  if(results[0].status==='fulfilled'){forecast=results[0].value;forecastError='';}else forecastError=forecast?'预测暂时读取失败，保留上次成功快照。':'预测暂时不可读，未生成替代概率。';
  if(results[1].status==='fulfilled'){events=results[1].value;historyError='';}else historyError=events.length?'历史读取失败，保留原记录。':'历史暂时不可读。';
  checkedAt=new Date().toISOString();pending=false;refreshView();
 }
 function reset(){if(!started)queueMicrotask(()=>void refreshReset());const latest=latestPublicReset(forecast,events),stale=!forecast||Date.now()-Date.parse(forecast.at)>3600000;
  return [el('section',{className:'panel reset-intro public-live-reset'},el('span',{className:'eyebrow'},'CODEX RESET'),el('h2',{},'重置概率'),el('p',{},'来自 Codex Reset 的第三方预测。'),el('div',{className:'reset-empty-probs'},el('div',{},el('span',{},'未来 24h'),el('strong',{},forecast?.p24==null?'—':forecast.p24+'%')),el('div',{},el('span',{},'未来 48h'),el('strong',{},forecast?.p48==null?'—':forecast.p48+'%'))),el('p',{className:'subdued'},forecast?'预测起点 '+date(forecast.at)+' · '+forecast.version:pending?'正在读取公开预测…':'暂无可用预测'),stale&&forecast?el('p',{className:'pill amber'},'历史快照：不代表当前时刻的未来窗口'):null,checkedAt?el('small',{},'本次检查 '+date(checkedAt)):null,external(origin+'/zh/','来源：Codex Reset')),
  forecastError||historyError?el('p',{className:'callout',role:'status'},[forecastError,historyError].filter(Boolean).join(' ')):null,
  el('section',{className:'panel reset-provider-latest'},el('h3',{},'最近全局重置 · 第三方记录'),el('strong',{},latest?date(latest.at):'—'),latest?el('p',{className:'subdued'},latest.label):null,latest?el('p',{},latest.title):el('p',{},'暂无可用全局记录'),latest?.note?el('p',{className:'subdued'},latest.note):null,latest?.url?external(latest.url,'查看重置依据'):null),
  forecast?.promise?el('details',{className:'panel'},el('summary',{},'源站当前信号'),el('p',{},forecast.promise.quote),forecast.promise.url===latest?.url?el('p',{className:'subdued'},'源站将同一条证据同时用于预告和最近重置，请核对原文。'):null,forecast.promise.url?external(forecast.promise.url,'信号原文'):null):null,
  el('details',{className:'panel public-reset-history'},el('summary',{},'近期重置记录'),events.slice(0,6).map(e=>el('article',{className:'evidence'},el('small',{},({global:'全局重置',banked:'储备发放',promise:'预告'})[e.kind]+' · '+date(e.at)),el('p',{},e.title),e.url?external(e.url,'原始依据'):null)),external(origin+'/zh/timeline','打开历史时间线')),
  el('p',{className:'method-note'},'概率沿用第三方结果，不代表 OpenAI 官方计划。全局重置与个人 5-hour / weekly 窗口分开；此页不读取个人账户或额度。'),external(origin+'/forecast-method','查看预测方法')];
 }
 async function refreshCharts(){chartStarted=true;try{const v=await json(new URL('./aa-charts.json',import.meta.url),8000);if(v?.schemaVersion!==1||!stamp(v.generatedAt)||v.sourceUrl!=='https://artificialanalysis.ai/'||!Array.isArray(v.charts)||v.charts.length!==3||new Set(v.charts.map(c=>c.id)).size!==3||v.charts.some(c=>({intelligence:'aa-intelligence.png',speed:'aa-speed.png',cost:'aa-cost.png'})[c.id]!==c.file||!/^[a-f0-9]{64}$/.test(c.sha256)))throw Error();chartMeta=v;chartError='';}catch{chartError=chartMeta?'图表检查失败，保留已读取快照。':'图表快照暂未生成或暂时不可读。';}refreshView();}
 const chartName=id=>({intelligence:'综合能力',speed:'输出速度',cost:'API 任务成本'})[id];
 const chartUrl=c=>new URL('./'+c.file+'?v='+c.sha256,import.meta.url).href;
 function createChartViewer(){
  const dialog=el('dialog',{className:'aa-chart-viewer','aria-labelledby':'aa-viewer-title'});
  if(typeof dialog.showModal!=='function')return null;
  let entries=[],index=0,actual=true,opener,scrollTop=0,address='',closing=false;
  const owner='aa-'+Math.random().toString(36).slice(2),historyKey='hubAAChartViewer';
  const title=el('h2',{id:'aa-viewer-title'}),count=el('span',{className:'aa-viewer-count',role:'status','aria-live':'polite'});
  const canvas=el('div',{className:'aa-viewer-canvas',tabindex:'0','aria-label':'榜图，可滚动查看'});
  const message=el('p',{className:'aa-viewer-message',role:'status',hidden:true});
  const previous=el('button',{type:'button','aria-label':'上一张榜图',title:'上一张榜图',onclick:()=>move(-1)},'←');
  const next=el('button',{type:'button','aria-label':'下一张榜图',title:'下一张榜图',onclick:()=>move(1)},'→');
  const zoom=el('button',{type:'button',className:'aa-viewer-zoom','aria-pressed':'false',onclick:()=>setZoom(!actual)},'原尺寸');
  const original=el('a',{className:'aa-viewer-original',target:'_blank',rel:'noopener noreferrer'},'原图 ↗');
  const close=el('button',{type:'button','aria-label':'关闭榜图查看器',title:'关闭',onclick:()=>requestClose()},'×');
  dialog.append(el('header',{},title,close),canvas,message,el('footer',{},previous,count,next,zoom,original));document.body.append(dialog);
  const ownsHistory=()=>history.state?.[historyKey]?.owner===owner&&location.href===address;
  const historyValue=()=>({...history.state,[historyKey]:{owner,index}});
  function setZoom(value){actual=value;canvas.classList.toggle('is-actual',actual);zoom.textContent=actual?'适应屏幕':'原尺寸';zoom.setAttribute('aria-pressed',String(actual));zoom.setAttribute('aria-label',actual?'适应屏幕查看榜图':'按原始尺寸查看榜图');canvas.scrollTo({top:0,left:0,behavior:'instant'});}
  function draw(){
   const entry=entries[index],name=chartName(entry.id),url=chartUrl(entry),current=index;
   title.textContent=name;count.textContent=(index+1)+' / '+entries.length;previous.disabled=index===0;next.disabled=index===entries.length-1;original.href=url;original.setAttribute('aria-label','在新标签页打开'+name+'原图');message.hidden=true;
   canvas.replaceChildren(el('img',{src:url,alt:'AA '+name+'柱状图（图片快照）',width:790,height:1040,ondblclick:()=>setZoom(!actual),onerror:e=>{if(index===current&&e.target.isConnected){message.textContent='图表图片暂时无法显示，可尝试打开原图。';message.hidden=false;}}}));setZoom(actual);
  }
  function move(delta){const target=index+delta;if(target<0||target>=entries.length)return;index=target;draw();if(ownsHistory())try{history.replaceState(historyValue(),'',address);}catch{}}
  function openAt(value,trigger,push=true){
   if(!chartMeta)return false;
   entries=chartMeta.charts.map(c=>({...c}));index=Math.max(0,Math.min(entries.length-1,value));opener=trigger??document.activeElement;scrollTop=window.scrollY;address=location.href;closing=false;actual=true;draw();
   try{dialog.showModal();}catch{return false;}
   document.body.classList.add('aa-viewer-open');close.focus({preventScroll:true});
   if(push)try{history.pushState(historyValue(),'',address);}catch{}
   return true;
  }
  function requestClose(){if(!dialog.open||closing)return;closing=true;const goBack=ownsHistory();dialog.close();if(goBack)history.back();}
  dialog.addEventListener('cancel',e=>{e.preventDefault();requestClose();});
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const box=dialog.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)requestClose();});
  dialog.addEventListener('close',()=>{document.body.classList.remove('aa-viewer-open');closing=false;if(location.href===address){window.scrollTo({top:scrollTop,behavior:'instant'});const target=opener?.isConnected?opener:document.querySelector('.public-aa-charts figcaption a[aria-label="放大查看'+chartName(entries[index].id)+'榜图"]');target?.focus({preventScroll:true});}});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();requestClose();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopPropagation();}else if(!actual&&!e.ctrlKey&&!e.metaKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();move(e.key==='ArrowLeft'?-1:1);}});
  window.addEventListener('hashchange',()=>{if(dialog.open)dialog.close();});
  window.addEventListener('popstate',()=>{if(ownsHistory()&&h.section()==='models'){if(!dialog.open)openAt(history.state[historyKey].index,document.activeElement,false);}else if(dialog.open)dialog.close();});
  return {open:openAt};
 }
 function viewChart(event,index){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  chartViewer??=createChartViewer();if(chartViewer?.open(index,event.currentTarget))event.preventDefault();
 }
 function models(){if(!chartStarted)queueMicrotask(()=>void refreshCharts());return [el('section',{className:'public-model-intro','aria-label':'榜图与数据日期'},el('div',{className:'aa-chart-shortcuts'},['intelligence','speed','cost'].map((id,index)=>el('button',{type:'button',className:'button',disabled:!chartMeta,onclick:e=>viewChart(e,index)},chartName(id)+' ↗'))),chartMeta?el('p',{className:'subdued'},'数据检查 '+date(chartMeta.measuredAt)):null,chartMeta&&(!stamp(chartMeta.measuredAt)||Date.now()-Date.parse(chartMeta.measuredAt)>54*3600000)?el('p',{className:'pill amber'},'模型数据缓存待更新'):null),
 chartError?el('p',{role:'status',className:'callout'},chartError):null,
 chartMeta?el('div',{className:'public-aa-charts'},chartMeta.charts.map((c,index)=>{const name=chartName(c.id),url=chartUrl(c),open=e=>viewChart(e,index);return el('figure',{className:'panel'},el('figcaption',{},el('strong',{},name),el('a',{className:'link',href:url,target:'_blank',rel:'noopener noreferrer','aria-label':'放大查看'+name+'榜图',onclick:open},'放大查看 ↗')),el('div',{className:'aa-chart-scroll',tabindex:'0','aria-label':name+'榜图预览，可横向滚动'},el('a',{className:'aa-chart-preview',href:url,target:'_blank',rel:'noopener noreferrer',tabindex:'-1','aria-label':'放大查看'+name+'榜图',onclick:open},el('img',{src:url,alt:'AA '+name+'柱状图（图片快照）',width:790,height:1040,loading:'lazy',onerror:e=>e.target.replaceWith(el('p',{},'图表图片读取失败，请稍后重试。'))}))));})):el('div',{className:'empty'},chartError?'暂无图表':'正在读取图表…'),
 el('details',{className:'panel'},el('summary',{},'来源与排名口径'),h.metricGuide?.(),el('p',{},'近一年发布、综合能力 ≥ 25；每个模型仅保留最佳配置。'),chartMeta?el('p',{className:'subdued'},'图表生成 '+date(chartMeta.generatedAt)):null,el('p',{},'图中数值来自 Artificial Analysis，图表由 Agent Intelligence Hub 绘制，不代表 AA 认可或背书。速度与成本分别独立排名；成本假设每次输入10k、输出2k Token，不等于订阅额度。'),el('p',{},'公开版仅分享图片，不提供模型数据列表、比较器或原始数据下载。完整数据分析保留在本机。'),external('https://artificialanalysis.ai/data-api','数据与授权'))];}
 return {reset,models,refreshReset,refreshCharts,starportSnapshot:()=>({forecast,events,checkedAt,error:[forecastError,historyError].filter(Boolean).join(' ')||null}),get resetBusy(){return pending;}};
}
