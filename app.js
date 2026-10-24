globalThis.HUB_READING_POLICY={"ranks":{"action":3,"focus":2,"normal":1,"low":0},"labels":{"action":"需要检查","focus":"值得关注","normal":"按需阅读","low":"低优先级"},"homeLimit":3,"conditionLimit":2,"highlightLimit":3};
import {createPublicData} from './public-data.js?v=e533c768ad165efd923d222a654798a1eb0a7699a163b6a580442dd5c3da23dc';
const main=document.querySelector('#main'),sidebar=document.querySelector('#sidebar');
const storageKey='agent-intelligence-public-v1';
const categories={'Model Release':'模型发布','ChatGPT Update':'ChatGPT 更新','Codex Feature':'Codex 功能','Codex CLI / SDK':'CLI / SDK','API Update':'API 更新','Pricing / Usage Limits':'价格与额度',Deprecation:'弃用迁移',Incident:'服务事件','Community Signal':'社区信号','Reset Signal':'Reset 信号'};
const sections={dashboard:'情报总览',updates:'更新情报',weekly:'每周回顾',models:'模型中心',forecast:'Reset 观察',saved:'我的收藏',sources:'数据与来源',settings:'偏好设置'};
const descriptions={dashboard:'重要变化，先看这三件事。',updates:'先理解变化，再决定是否行动。',weekly:'把一周的变化，整理成少量值得记住的事。',models:'先明确任务，再比较能力与成本。',forecast:'查看可信来源，保留预测边界。',saved:'留给以后认真读的内容。',sources:'数据的来处，和它此刻的状态。',settings:'为当前浏览器设置阅读习惯。'};
const paths={dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',updates:'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5',weekly:'M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3',models:'M12 3l9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',forecast:'M3 12h4l3-7 4 14 3-7h4',saved:'M6 3h12v18l-6-4-6 4z',sources:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c-5 6-5 12 0 18 M12 3c5 6 5 12 0 18',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6L7 7 M17 17l1.4 1.4 M5.6 18.4L7 17 M17 7l1.4-1.4'};
let data,error='',loading=false,weekOffset=0,toastTimer;
const snapshotCacheKey='agent-intelligence-snapshot-v1:'+new URL('.',import.meta.url).pathname;
const maxSnapshotBytes=8*1024*1024,maxStoredSnapshotBytes=2*1024*1024;
let snapshotFromCache=false,snapshotSavedAt=null,publicIssue=null,cacheNote='',loadAttempt=0,lastPublicCheck=null,nextAutomaticCheck=0;
let localMode=false,localCache=null,localModule=null,localError='',localLoading=false,localResolved=false;
let personal={saved:[],read:[],theme:'light',timezone:'Asia/Taipei'};
try{const value=JSON.parse(localStorage.getItem(storageKey)??'{}');for(const key of ['saved','read'])if(Array.isArray(value[key]))personal[key]=value[key].filter(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)).slice(0,2000);if(['light','dark'].includes(value.theme))personal.theme=value.theme;if(typeof value.timezone==='string'){new Intl.DateTimeFormat('zh-CN',{timeZone:value.timezone});personal.timezone=value.timezone;}}catch{/* Browsing works without storage. */}
document.body.classList.toggle('light',personal.theme==='light');

function el(tag,attrs={},...children){const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(key==='className')node.className=value;else if(key==='checked')node.checked=value;else if(key==='value')node.value=value;else if(value!==false&&value!=null)node.setAttribute(key,value===true?'':String(value));}for(const child of children.flat(Infinity))if(child!=null&&child!==false)node.append(child instanceof Node?child:document.createTextNode(String(child)));return node;}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]??paths.updates);svg.append(p);return svg;}
function external(url,label){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error();return el('a',{href:u.href,target:'_blank',rel:'noopener noreferrer',className:'link'},label+' ↗');}catch{return el('span',{},label+'（链接不可用）');}}
function toast(text,warning=false){clearTimeout(toastTimer);const box=document.querySelector('#toast');box.replaceChildren(el('span',{},text),el('button',{'aria-label':'关闭消息',onclick:()=>{box.hidden=true;}},'×'));box.hidden=false;if(!warning)toastTimer=setTimeout(()=>{box.hidden=true;},6000);}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(personal));}catch{toast('浏览器存储不可用；本次操作仅保留到关闭页面。',true);}}
function date(value,precision='instant'){if(!value)return '尚无记录';const d=new Date(value);if(!Number.isFinite(+d))return '日期未知';return precision==='day'?String(value).slice(0,10):new Intl.DateTimeFormat('zh-CN',{timeZone:personal.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);}
function state(s){const stale=s.lastSuccessAt&&Date.now()-Date.parse(s.lastSuccessAt)>s.staleHours*3600000;return {tone:s.error?'warn':stale?'warn':s.lastSuccessAt?'ok':'muted',label:s.error?'采集受阻':stale?'缓存过期':s.lastSuccessAt?'正常':'待同步'};}
function route(){const url=new URL(location.hash.slice(1)||'/',location.origin);const parts=url.pathname.split('/').filter(Boolean);return {section:parts[0]||(url.searchParams.size?'dashboard':'home'),id:parts[1]??null,params:url.searchParams};}
function filters(){const {params}=route();return {days:[30,90,365].includes(Number(params.get('days')))?Number(params.get('days')):0,q:(params.get('q')??'').slice(0,200),product:params.get('product')??'',source:params.get('source')??'',category:params.get('category')??'',priority:Number(params.get('priority')??0)||0,unread:params.get('unread')==='1',page:Math.max(1,Math.floor(Number(params.get('page'))||1)),view:params.get('view')==='all'?'all':'focus'};}
function filterChange(values){const r=route(),p=r.params;for(const [key,value] of Object.entries({...values,page:values.page??1})){if(value==null||value===''||value===false||value===0||value===1&&key==='page')p.delete(key);else p.set(key,String(value===true?1:value));}const next='#/'+r.section+(p.size?'?'+p:'');if(location.hash===next)render();else location.hash=next;}
function go(section){location.hash='#/'+section;}
const readingPolicy=globalThis.HUB_READING_POLICY??{ranks:{action:3,focus:2,normal:1,low:0},labels:{action:"需要检查",focus:"值得关注",normal:"按需阅读",low:"低优先级"},homeLimit:3};
const ranks=readingPolicy.ranks;
function reading(u){if(u.reading)return u.reading;const preview=['prerelease','beta'].includes(u.channel);const level=preview?'low':u.category==='Deprecation'?'action':['Model Release','Pricing / Usage Limits'].includes(u.category)?'focus':'normal';return {headline:u.title,level,reason:'依据已发布的官方快照；完整条件请核对原文。',action:u.recommendation,functional:false,resolved:false,essentials:[],highlights:[],effectiveDate:null};}
function ordered(rows){return [...rows].sort((a,b)=>ranks[reading(b).level]-ranks[reading(a).level]||String(b.publishedAt??b.fetchedAt).localeCompare(String(a.publishedAt??a.fetchedAt))||b.importance-a.importance||a.id.localeCompare(b.id));}
function match(rows,f){return rows.filter(u=>(!f.days||!u.publishedAt||Date.parse(u.publishedAt)<=Date.now()&&Date.parse(u.publishedAt)>=Date.now()-f.days*86400000)&&(!f.q||[u.title,u.excerpt,reading(u).headline,...reading(u).essentials].join(' ').toLowerCase().includes(f.q.toLowerCase()))&&(!f.product||u.product===f.product)&&(!f.source||u.evidence.some(e=>e.sourceId===f.source))&&(!f.category||u.category===f.category)&&u.importance>=f.priority&&(!f.unread||!personal.read.includes(u.id)));}
// Reading projection only. Never rewrite records, source grades or personal IDs.
function reportTitle(value){return value.normalize('NFKC').toLowerCase().replace(/[‐‑‒–—]/g,'-').replace(/^(?:you can now choose |the api now supports )/,'').replace(/ in the api[.!]?$/,'').replace(/[^\p{L}\p{N}]/gu,'');}
function reportLinks(row){return [row.referenceUrl,...row.evidence.filter(e=>['api-changelog','codex-changelog','chatgpt-help','openai-products'].includes(e.sourceId)).map(e=>e.url)].filter(Boolean).flatMap(value=>{try{const u=new URL(value);return u.protocol==='https:'&&['developers.openai.com','learn.chatgpt.com','help.openai.com','openai.com'].includes(u.hostname)?[u.origin+u.pathname.replace(/\/$/,'')]:[];}catch{return [];}});}
function reportProjection(rows,selected=null){
  if(route().params.get('reports')==='all')return rows;
  const rank=u=>u.id===selected?-1:u.sourceType==='third-party'?2:u.sourceType==='first-party'?1:0;
  const buckets=[];
  for(const row of [...rows].sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id))){
    const title=reportTitle(row.title),links=reportLinks(row);
    const group=title.length>=18&&row.publishedAt&&buckets.find(g=>g.row.product===row.product&&g.row.channel===row.channel&&g.row.publishedAt?.slice(0,10)===row.publishedAt.slice(0,10)&&reportTitle(g.row.title)===title&&links.some(link=>g.links.includes(link)));
    if(group)group.peers.push(row);else buckets.push({row,links,peers:[]});
  }
  const byId=new Map(buckets.map(g=>[g.row.id,g.peers.length?{...g.row,reportPeers:g.peers}:g.row]));
  return rows.filter(u=>byId.has(u.id)).map(u=>byId.get(u.id));
}
function reportSwitch(rows,shown){return el('div',{className:'cache-recovery'},el('span',{},route().params.get('reports')==='all'?'当前显示全部报道；各来源记录独立保留。':shown.length<rows.length?`已折叠 ${rows.length-shown.length} 条重复报道 · 各来源记录保留`:'重复报道按严格规则折叠；仅标题相近的消息保留独立展示。'),el('button',{className:'button','aria-pressed':route().params.get('reports')==='all',onclick:()=>filterChange({reports:route().params.get('reports')==='all'?null:'all',star:null})},route().params.get('reports')==='all'?'折叠重复报道':'展开全部报道'));}
function reportPeers(row){return row.reportPeers?.length?el('details',{className:'card-advice'},el('summary',{},`另有 ${row.reportPeers.length} 条报道 · 查看来源与差异`),el('p',{},'依据同产品、同日、同渠道、共同公告页面与等价标题折叠；各记录独立保留。'),row.reportPeers.map(peer=>el('p',{},el('a',{className:'link',href:'#/updates/'+peer.id},peer.title+' · '+sourceName(peer)),el('small',{},' · '+(peer.sourceType==='official'?'官方':peer.sourceType==='first-party'?'人物公开言论':'第三方转述')+' · '+date(peer.publishedAt,peer.datePrecision))))):null;}
function toggle(kind,id){personal[kind]=personal[kind].includes(id)?personal[kind].filter(v=>v!==id):[...personal[kind],id].slice(-2000);save();render();}
function empty(title,text,href=null,label='浏览全部更新'){return el('div',{className:'empty'},el('span',{className:'empty-mark','aria-hidden':'true'},'○'),el('h3',{},title),el('p',{},text),href?el('a',{href,className:'button'},label):null);}
function sourceName(u){return data.sources.find(s=>s.id===u.evidence[0]?.sourceId)?.name??'官方来源';}
function card(u,lead=false){const p=reading(u),saved=personal.saved.includes(u.id),read=personal.read.includes(u.id);return el('article',{className:'update-card public-update '+(lead?'lead-update ':'')+(read?'read-card':''),'aria-label':u.title},
  el('div',{className:'update-meta'},el('span',{className:'product-label'},u.product),el('span',{className:'reading-tag '+p.level},readingPolicy.labels[p.level]),['prerelease','beta'].includes(u.channel)?el('span',{className:'pill amber'},u.channel==='beta'?'Beta':'预发布'):null,el('time',{datetime:u.publishedAt??''},date(u.publishedAt,u.datePrecision))),
  el('a',{href:'#/updates/'+u.id,className:'update-title'},p.headline),
  p.essentials.length?el('ul',{className:'public-essentials'},p.essentials.map(s=>el('li',{},s))):null,
  el('div',{className:'card-end'},el('span',{className:'source-signature'},el('span',{className:'source-seal','aria-hidden':'true'},u.sourceType&&u.sourceType!=='official'?'↗':'✓'),sourceName(u),u.sourceType&&u.sourceType!=='official'?' · '+(u.sourceType==='first-party'?'公开言论':'第三方转述'):''),el('div',{className:'mini-actions'},el('button',{className:'icon-button '+(saved?'is-saved':''),'aria-label':saved?'取消收藏':'收藏更新',onclick:()=>toggle('saved',u.id)},saved?'★':'☆'),el('button',{className:'icon-button','aria-label':read?'标记未读':'标记已读',onclick:()=>toggle('read',u.id)},read?'✓✓':'✓'))),
  reportPeers(u),el('details',{className:'card-advice'},el('summary',{},'为什么关注与建议'),el('p',{},p.reason),el('p',{},p.action)));
}
function sectionTitle(title,href=null,label='查看全部 →'){return el('div',{className:'section-heading'},el('h2',{},title),href?el('a',{href,className:'link'},label):null);}
function sourceSummary(){const issues=data.sources.filter(s=>state(s).tone!=='ok');return el('div',{className:'panel source-summary'},el('span',{className:'eyebrow'},'SOURCE STATUS'),el('div',{className:'summary-title'},el('span',{className:'dot '+(issues.length?'warn':'ok')}),el('h3',{},issues.length?issues.length+' 个来源需要留意':'来源状态正常')),el('p',{},issues.length?'成功缓存继续可读，受阻来源的完整性仍需核对。':'公开快照保留原始来源和各自的检查时间。'),el('a',{href:'#/sources',className:'link'},'查看来源状态 →'));}
function dashboard(){const now=Date.now(),recent=data.updates.filter(u=>u.publishedAt&&Date.parse(u.publishedAt)<=now&&now-Date.parse(u.publishedAt)<=7*86400000),important=ordered(reportProjection(recent.filter(u=>['action','focus'].includes(reading(u).level)))).slice(0,readingPolicy.homeLimit);return [
  el('div',{className:'overview-stats'},[['本周更新',recent.length],['本周重点',recent.filter(u=>['action','focus'].includes(reading(u).level)).length],['公开来源',data.sources.length]].map(([label,value])=>el('div',{},el('strong',{},value),el('span',{},label)))),
  el('div',{className:'overview-grid'},el('section',{'aria-label':'本周值得关注'},sectionTitle('本周值得关注','#/updates'),important.length?important.map((u,i)=>card(u,i===0)):empty('本周暂无重大更新','没有确认的重要变化时，不用维护记录填满重点区。','#/updates?view=all','浏览已收录更新 →')),
    el('aside',{className:'overview-aside'},sourceSummary(),el('a',{href:'#/weekly',className:'quiet-link-card'},icon('weekly'),el('h3',{},'花几分钟，回顾这一周'),el('p',{},'三项重点，以及值得采取的下一步。'),el('span',{className:'link'},'打开每周回顾 →')),el('a',{href:'#/forecast',className:'quiet-link-card'},icon('forecast'),el('h3',{},localMode?'Reset 缓存观察':'Reset 原站观察'),el('p',{},localMode?'读取本地保存的第三方预测和历史。':'第三方预测有独立来源与时效，个人额度另行管理。'),el('span',{className:'link'},localMode?'查看缓存预测 →':'查看可信入口 →')))),
  el('div',{className:'quiet-bottom'},el('span',{},'其余发布记录，按需查看。'),el('a',{href:'#/updates?view=all',className:'link'},'完整时间线 · '+data.updates.length+' 项 →'))];}
function select(label,value,options,onchange){return el('select',{className:'field','aria-label':label,onchange:e=>onchange(e.target.value)},options.map(([v,text])=>el('option',{value:v,selected:String(v)===String(value)},text)));}
function controls(f){return el('details',{className:'public-filters',open:!!(f.product||f.source||f.category||f.priority)},el('summary',{},'筛选与阅读偏好'),el('div',{className:'control-row'},select('产品筛选',f.product,[['','全部产品'],...['Codex','ChatGPT','API','OpenAI'].map(v=>[v,v])],v=>filterChange({product:v})),select('来源筛选',f.source,[['','全部来源'],...data.sources.map(s=>[s.id,s.name])],v=>filterChange({source:v})),select('分类筛选',f.category,[['','全部分类'],...Object.entries(categories)],v=>filterChange({category:v})),select('重要性筛选',f.priority,[[0,'全部评分'],[65,'重要'],[80,'高度重要']],v=>filterChange({priority:v})),el('label',{className:'check-label'},el('input',{type:'checkbox',checked:f.unread,onchange:e=>filterChange({unread:e.target.checked})}),'只看未读'),el('button',{className:'button',onclick:()=>{location.hash='#/'+route().section+'?view=all'+(wantsConstellation()?'&display=constellation&days=90':'');}},'清除筛选')));}
const constellationHost=el('div',{className:'public-constellation-host'});let constellationModule=null,constellationLoading=null;
function wantsConstellation(){const r=route();return r.section==='updates'&&!r.id&&r.params.get('display')==='constellation';}
function syncConstellation(){if(!wantsConstellation()||!constellationHost.isConnected||!data){constellationModule?.unmountConstellation();return;}
 if(constellationModule){const f=filters();constellationModule.mountConstellation(constellationHost,{rows:reportProjection(match(data.updates,f),route().params.get('star')).map(u=>({...u,reading:reading(u)})),sources:data.sources,filters:f,days:f.days||90,selected:/^[a-f0-9]{64}$/.test(route().params.get('star')??'')?route().params.get('star'):null,timezone:personal.timezone,change:filterChange,back:location.hash});return;}
 if(!constellationLoading)constellationLoading=import('./constellation.js?v=e533c768ad165efd923d222a654798a1eb0a7699a163b6a580442dd5c3da23dc').then(module=>{constellationModule=module;syncConstellation();}).catch(()=>{constellationLoading=null;if(constellationHost.isConnected)constellationHost.replaceChildren(empty('星图暂时不可读','可以切回文字列表，或刷新页面重试。'));});
}
function updateViewSwitch(){const sky=wantsConstellation();return el('div',{className:'update-view-switch','aria-label':'更新显示方式'},el('button',{className:'button '+(!sky?'primary':''),'aria-pressed':!sky,onclick:()=>filterChange({display:null,star:null})},'文字列表'),el('button',{className:'button '+(sky?'primary':''),'aria-pressed':sky,onclick:()=>filterChange({display:'constellation',days:filters().days||90})},'星图探索'));}
function feed(section){const f=filters();if(section==='updates'&&wantsConstellation())return [updateViewSwitch(),controls(f),reportSwitch(match(data.updates,f),reportProjection(match(data.updates,f))),constellationHost];const all=match(data.updates.filter(u=>section!=='saved'||personal.saved.includes(u.id)),f),important=ordered(all.filter(u=>['action','focus'].includes(reading(u).level)));const focus=f.view!=='all'&&!f.q&&section!=='saved';const projected=section==='saved'?all:reportProjection(all);const rows=focus?ordered(projected.filter(u=>['action','focus'].includes(reading(u).level))):[...projected].sort((a,b)=>String(b.publishedAt??b.fetchedAt).localeCompare(String(a.publishedAt??a.fetchedAt)));const size=focus?5:12,pages=Math.max(1,Math.ceil(rows.length/size)),page=Math.min(f.page,pages);return [
  section==='updates'?updateViewSwitch():null,
  section!=='saved'?el('div',{className:'reading-switch','aria-label':'阅读方式'},el('button',{className:'filter '+(focus?'active':''),'aria-pressed':focus,onclick:()=>filterChange({view:'focus',q:''})},'重点优先'),el('button',{className:'filter '+(!focus?'active':''),'aria-pressed':!focus,onclick:()=>filterChange({view:'all'})},'完整时间线'),el('span',{className:'subdued'},focus?'维护与测试构建收起':'包含维护、预发布及已恢复事件'),select('文字列表时间范围',f.days,[[0,'全部时间'],[30,'近30天'],[90,'近90天'],[365,'近365天']],v=>filterChange({days:Number(v)||null}))):null,
  controls(f),section==='saved'?null:reportSwitch(all,projected),sectionTitle(f.q?'搜索：“'+f.q+'”':section==='saved'?'已收藏的更新':focus?'值得关注的更新':'按时间浏览'),
  el('div',{className:'public-feed'},rows.length?rows.slice((page-1)*size,page*size).map(u=>card(u)):empty('没有匹配的更新',section==='saved'?'点击更新右下角的收藏按钮，稍后在这里继续阅读。':'尝试调整筛选，或打开完整时间线。')),
  rows.length>size?el('div',{className:'public-pagination'},el('button',{className:'button',disabled:page<=1,onclick:()=>filterChange({page:page-1})},'上一页'),el('span',{'aria-live':'polite'},page+' / '+pages+' · '+rows.length+' 项'),el('button',{className:'button',disabled:page>=pages,onclick:()=>filterChange({page:page+1})},'下一页')):null,
  focus?el('div',{className:'quiet-bottom'},el('span',{},all.length-important.length+' 项维护、预发布或其他记录按需查看。'),el('a',{href:'#/updates?view=all',className:'link'},'展开完整时间线 →')):null];}
function detail(id){const candidateBack=route().params.get('back'),back=candidateBack&&/^#\/updates\?/.test(candidateBack)&&candidateBack.length<3000?candidateBack:'#/updates';const u=data.updates.find(r=>r.id===id);if(!u)return empty('未找到这条更新','当前快照可能未包含这条历史记录。','#/updates');const p=reading(u);return el('article',{className:'article'},el('a',{href:back,className:'link'},back==='#/updates'?'← 返回更新列表':'← 返回更新星图'),el('div',{className:'detail-intro'},el('div',{className:'update-meta'},el('span',{className:'product-label'},u.product),el('span',{},categories[u.category]),u.sourceType&&u.sourceType!=='official'?el('span',{className:'pill amber'},u.sourceType==='first-party'?'人物公开言论':'第三方转述'):null,el('time',{},date(u.publishedAt,u.datePrecision))),el('h2',{className:'public-detail-title'},p.headline),p.essentials.length?el('ul',{className:'public-essentials'},p.essentials.map(v=>el('li',{},v))):null),el('div',{className:'panel decision-panel'},el('span',{className:'eyebrow'},'YOUR NEXT STEP'),el('h3',{},'接下来可以做什么'),el('p',{},p.action),el('small',{},'规则建议；适用计划、平台和账户资格以原文为准。')),
  p.highlights.length?el('section',{},sectionTitle('发生了什么'),p.highlights.map(h=>el('details',{className:'evidence-point'},el('summary',{},h.label),el('blockquote',{},h.quote)))):null,
  el('details',{className:'public-original'},el('summary',{},'查看原始标题与摘录'),el('h3',{},u.title),el('div',{className:'article-body'},u.excerpt||'此来源未提供正文。'),el('small',{},'公开摘录最多600字符，完整上下文请打开原文。')),
  u.originUrl?el('p',{},external(u.originUrl,'打开 Tibo 原始公开帖子')):null,u.referenceUrl?el('p',{className:'callout'},'第三方聚合记录，未独立读取官方原文。',external(u.referenceUrl,'聚合方引用的原文 ↗')):null,sectionTitle('可追溯的来源证据'),u.evidence.map(e=>el('div',{className:'evidence'},external(e.url,data.sources.find(s=>s.id===e.sourceId)?.name??e.sourceId),el('small',{},'采集 '+date(e.fetchedAt)+' · 核实 '+date(e.verifiedAt)),el('details',{},el('summary',{},'原始标识与内容指纹'),el('small',{},e.externalId),el('small',{},'SHA256 '+e.contentHash)))),el('details',{className:'public-original'},el('summary',{},'查看规则评分与时间'),el('p',{},'重要性 '+u.importance+' / 100'),u.reasons.map(r=>el('span',{className:'pill'},r.label+' +'+r.points)),el('p',{className:'subdued'},'首次收录 '+date(u.fetchedAt)+' · 修订 '+date(u.updatedAt))));}
function calendarDate(value,precision='instant'){
  if(precision==='day')return value.slice(0,10);
  const parts=new Intl.DateTimeFormat('en',{timeZone:personal.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)),part=t=>parts.find(p=>p.type===t).value;
  return part('year')+'-'+part('month')+'-'+part('day');
}
function weekly(){
  const today=Date.parse(calendarDate(new Date().toISOString())+'T00:00:00Z'),weekday=new Date(today).getUTCDay(),start=today-((weekday+6)%7+weekOffset*7)*86400000,end=start+7*86400000;
  const all=data.updates.filter(u=>{if(!u.publishedAt)return false;const day=Date.parse(calendarDate(u.publishedAt,u.datePrecision)+'T00:00:00Z');return day>=start&&day<end&&Date.parse(u.publishedAt)<=Date.now();}),key=ordered(reportProjection(all.filter(u=>['action','focus'].includes(reading(u).level)))).slice(0,3);
  return [el('div',{className:'week-control'},el('button',{className:'button',onclick:()=>{weekOffset++;render();}},'上一周'),el('strong',{},new Date(start).toISOString().slice(0,10)+' — '+new Date(end-86400000).toISOString().slice(0,10)),el('button',{className:'button',disabled:weekOffset===0,onclick:()=>{weekOffset--;render();}},'下一周')),el('p',{className:'subdued'},'按原始发布日期归入显示时区的日历周；仅总结已发布的公开快照。'),sectionTitle('这一周，记住这些'),key.length?key.map(u=>card(u)):empty('这一周暂无重大更新','没有可靠的重要变化时，不生成填充式总结。'),el('div',{className:'quiet-bottom'},el('span',{},'本周共 '+all.length+' 项记录；重点最多三项。'),el('a',{href:'#/updates?view=all',className:'link'},'打开完整时间线 →'))];
}
function sourcesView(){const labels={http:'HTTP 访问失败',timeout:'请求超时',robots:'访问策略检查未通过',parse:'来源结构无法解析',budget:'超出本轮预算',unavailable:'来源不可用',cloudflare:'需要 Cloudflare 浏览器验证',dns:'域名解析失败',network_permission:'执行环境拒绝网络访问'};return [el('div',{className:'source-intro'},icon('sources'),el('div',{},el('h2',{},'可靠，也包括如实显示缺口。'),el('p',{},'检查快照只读取已发布文件。来源受阻时，保留最近成功的数据。'))),el('div',{className:'callout'},el('p',{},'来源采集：以下逐项显示最近结果；失败或退避期间保留旧缓存。'),el('p',{},'数据快照：'+date(data.exportedAt)+'，不代表所有来源同时采集成功。'),el('p',{},'网页部署：当前页面已读取此快照；本机任务执行与后续上传状态请在本机查看。')),el('div',{className:'table-wrap'},el('table',{'aria-label':'公开来源状态'},el('thead',{},el('tr',{},['公开来源','状态','最近成功'].map(t=>el('th',{},t)))),el('tbody',{},data.sources.map(s=>el('tr',{},el('td',{},external(s.url,s.name),el('small',{},'最近检查 '+date(s.checkedAt))),el('td',{},el('span',{className:'dot '+state(s).tone}),state(s).label,s.error?el('small',{},labels[s.error]):null,s.retry?el('small',{},'连续 '+s.retry.failureCount+' 次失败 · '+(Date.parse(s.retry.nextRetryAt)>Date.now()?'自动检查不早于 '+date(s.retry.nextRetryAt):'退避到期，等待下一轮任务')):null),el('td',{},date(s.lastSuccessAt))))))),el('details',{className:'public-original'},el('summary',{},'快照与公开范围'),el('p',{},'导出时间 '+date(data.exportedAt)+'，不代表所有来源同时更新。'),el('p',{},'与本地共用事件、分类与阅读规则；包含官方公开摘录、已核实原帖和带原帖链接的功能观察。私人核查备注、AA受限数据、Reset缓存及个人额度不导出。'),el('p',{className:'public-hash'},'SHA256 '+data.contentHash))];}
const publicData=createPublicData({el,date,external,render,section:()=>route().section});
function models(){return publicData.models();}
const starportHost=el('div',{className:'public-starport'});let starportModule=null,starportLoading=null;
function syncStarport(){if(route().section!=='forecast'||isLocalPage()||!starportHost.isConnected){starportModule?.unmountStarport();return;}
 if(starportModule){starportModule.mountStarport(starportHost,publicData.starportSnapshot(),personal.timezone);return;}
 if(!starportLoading)starportLoading=import('./starport.js?v=e533c768ad165efd923d222a654798a1eb0a7699a163b6a580442dd5c3da23dc').then(module=>{starportModule=module;syncStarport();}).catch(()=>{starportLoading=null;if(starportHost.isConnected)starportHost.replaceChildren(el('p',{className:'callout'},'星港资源暂时不可读，请刷新页面重试。'));});
}
function forecast(){return [...publicData.reset(),starportHost];}
function settings(){return el('div',{className:'panel settings-panel'},el('h2',{},'你的浏览器，你的阅读习惯。'),el('p',{},'收藏、已读、主题与时区只保存在当前浏览器，不上传，也不与本地版或其他设备同步。'),el('label',{className:'settings-label'},'显示时区',select('显示时区',personal.timezone,['Asia/Taipei','Asia/Shanghai','UTC','America/New_York','Europe/London'].map(v=>[v,v]),v=>{personal.timezone=v;save();render();})),el('p',{className:'method-note'},'此浏览器也会保存上次成功读取的公开快照，打开时先显示，再后台检查更新。清除浏览器存储会移除快照及阅读状态。首次访问或页面资源未加载时仍需联网。公开页面不需要 API Key。'));}
function isLocalPage(){return ['models','forecast'].includes(route().section)&&(localMode||!localResolved&&localLoading);}
function updateBusy(){const local=isLocalPage(),busy=local?localLoading:loading||(route().section==='forecast'&&publicData.resetBusy);main.setAttribute('aria-busy',String(busy));const button=main.querySelector('.refresh-button');if(button){button.disabled=busy;button.textContent=busy?'正在检查…':local?'检查本机缓存':route().section==='forecast'?'刷新 Reset 数据':'检查已发布快照';}for(const retry of main.querySelectorAll('[data-cache-retry]'))retry.disabled=localLoading;for(const retry of main.querySelectorAll('[data-public-retry]'))retry.disabled=loading;updatePublicStatus();}
const homeRoot=document.querySelector('#home-root');
let homeController,homeLoading;
let holdHomeRender=false,homeNavigationSequence=0,homeTransition;
function renderHome(section){
 const active=section==='home';homeRoot.hidden=!active;document.body.classList.toggle('home-active',active);
 if(!active){homeController?.dispose();homeController=undefined;return false;}
 document.title='AIHub · 看清 AI 的每一次变化';
 if(!homeController&&!homeLoading)homeLoading=import('./home.js?v=e533c768ad165efd923d222a654798a1eb0a7699a163b6a580442dd5c3da23dc').then(module=>{if(route().section==='home')homeController=module.mountHome(homeRoot);}).catch(()=>{homeRoot.querySelector('#home-status').textContent='静态标志 · 入口仍可使用';}).finally(()=>{homeLoading=undefined;});
 return true;
}
function render(){if(holdHomeRender)return;const {section,id}=route(),localPage=isLocalPage();if(renderHome(section)){constellationModule?.unmountConstellation();starportModule?.unmountStarport();return;}if(!wantsConstellation())constellationModule?.unmountConstellation();if(section!=='forecast'||localPage)starportModule?.unmountStarport();document.querySelector('#navigation').replaceChildren(...Object.entries(sections).map(([key,label])=>el('a',{href:'#/'+key,className:'nav-item '+(key===section?'active':''),'aria-current':key===section?'page':null,onclick:()=>setNavigation(false)},icon(key),label,key==='saved'&&personal.saved.length?el('span',{className:'nav-count'},personal.saved.length):null)));const title=id?'更新详情':sections[section]??'页面不存在';document.title=title+' · Agent Intelligence Hub';document.querySelector('#breadcrumb-current').textContent=title;document.querySelector('#global-search').value=filters().q;
  const header=el('div',{className:'page-heading'},el('div',{},el('span',{className:'eyebrow'},'AGENT INTELLIGENCE HUB'),el('h1',{},title),el('p',{},descriptions[section]??'')),el('button',{className:'button refresh-button',onclick:()=>refreshAll()},'检查已发布快照'));
  if(!localPage&&error){constellationModule?.unmountConstellation();starportModule?.unmountStarport();main.replaceChildren(header,el('div',{className:'cache-recovery public-load-status','data-public-load-status':true,role:'status','aria-live':'polite'}),empty('公开快照读取失败',error),el('button',{className:'button','data-public-retry':true,disabled:loading,onclick:()=>load(false)},'重新读取快照'));updateBusy();return;}
  if(!localPage&&!data){constellationModule?.unmountConstellation();starportModule?.unmountStarport();main.replaceChildren(header,el('div',{className:'cache-recovery public-load-status','data-public-load-status':true,role:'status','aria-live':'polite'}),el('div',{className:'skeleton',role:'status','aria-label':'正在读取公开快照'}));updateBusy();return;}
  const content=section==='dashboard'?dashboard():['updates','saved'].includes(section)?id?detail(id):feed(section):section==='weekly'?weekly():section==='sources'?sourcesView():section==='models'?localContent('models'):section==='forecast'?localContent('forecast'):section==='settings'?settings():empty('页面不存在','从侧边导航打开页面。');
  main.replaceChildren(header,el('div',{className:'public-snapshot-strip'},el('span',{className:'dot '+(localPage?(localError?'warn':localCache?'ok':'muted'):data.sources.some(s=>state(s).tone!=='ok')?'warn':'ok')}),el('span',localPage?{}:{'data-public-snapshot-time':true},localPage?(localCache?'本机快照 '+date(localCache.exportedAt):'正在读取本机缓存'):'快照 '+date(data.exportedAt)),el('span',{className:'snapshot-divider'},'·'),el('span',{},localPage?'本机只读缓存':'公开来源可追溯')),localPage?null:el('div',{className:'cache-recovery public-load-status','data-public-load-status':true,role:'status','aria-live':'polite'}), ...[content].flat(Infinity).filter(Boolean),el('footer',{className:'footer'},el('span',{},'Agent Intelligence Hub · 独立工具，非 OpenAI 官方产品'),el('span',{},'静态快照 / '+personal.timezone)));updateBusy();syncStarport();syncConstellation();
}
function validSnapshot(next){
  const text=v=>typeof v==='string',stamp=v=>text(v)&&Number.isFinite(Date.parse(v)),optionalStamp=v=>v===null||stamp(v);
  if(!next||next.schemaVersion!==1||!stamp(next.exportedAt)||!text(next.contentHash)||!/^[a-f0-9]{64}$/.test(next.contentHash)||!Array.isArray(next.updates)||next.updates.length>1000||!Array.isArray(next.sources)||next.sources.length>12)return false;
  for(const s of next.sources){if(s.retry&&(!Number.isSafeInteger(s.retry.failureCount)||s.retry.failureCount<1||!stamp(s.retry.lastFailedAt)||!stamp(s.retry.nextRetryAt)))return false;}
  for(const u of next.updates){
    if(!u||!text(u.id)||!/^[a-f0-9]{64}$/.test(u.id)||![u.title,u.excerpt,u.product,u.category,u.recommendation].every(text)||!Number.isFinite(u.importance)||!optionalStamp(u.publishedAt)||!Array.isArray(u.reasons)||!Array.isArray(u.evidence)||u.evidence.length<1||u.evidence.length>6||u.evidence.some(e=>!e||![e.sourceId,e.url,e.externalId,e.contentHash].every(text)))return false;
    if(u.aliases&&(!Array.isArray(u.aliases)||u.aliases.length>6||u.aliases.some(id=>!text(id)||!/^[a-f0-9]{64}$/.test(id))))return false;
    if(u.sourceType&&!['official','first-party','third-party'].includes(u.sourceType))return false;
    if(u.verification&&!['source-verified','human-reviewed'].includes(u.verification))return false;
    if(u.originUrl&&(!text(u.originUrl)||!/^https:\/\/x\.com\/thsottiaux\/status\/\d+$/.test(u.originUrl)))return false;
    if(u.referenceUrl){try{const link=new URL(u.referenceUrl),paths={'help.openai.com':['/en/articles/6825453-chatgpt-release-notes'],'learn.chatgpt.com':['/docs/changelog'],'developers.openai.com':['/api/docs/changelog','/codex/changelog'],'openai.com':['/products/release-notes']};if(u.sourceType!=='third-party'||!u.evidence.some(e=>['releasebot-openai','releases-codex','releases-api'].includes(e.sourceId))||link.protocol!=='https:'||link.username||link.password||link.port||link.search||!paths[link.hostname]?.includes(link.pathname.replace(/\/$/,'')))return false;}catch{return false;}}
    const p=u.reading;
    if(p&&(![p.headline,p.reason,p.action].every(text)||!Object.hasOwn(ranks,p.level)||!Array.isArray(p.essentials)||p.essentials.length>2||!p.essentials.every(text)||!Array.isArray(p.highlights)||p.highlights.length>3||p.highlights.some(h=>!h||!text(h.label)||!text(h.quote))))return false;
  }
  return next.sources.every(s=>s&&[s.id,s.name,s.url].every(text)&&Number.isFinite(s.staleHours)&&optionalStamp(s.lastSuccessAt)&&optionalStamp(s.checkedAt));
}
function publicFault(code,message,retryable=false){return Object.assign(new Error(message),{publicSnapshotFault:true,code,retryable});}
function publicFailure(cause){
  if(cause?.publicSnapshotFault===true)return cause;
  if(['TimeoutError','AbortError'].includes(cause?.name))return publicFault('timeout','读取公开数据超时',true);
  if(navigator.onLine===false)return publicFault('offline','当前网络已断开',false);
  return publicFault('network','网络连接未完成',true);
}
async function checkedPublicSnapshot(raw){
  if(raw.length>maxSnapshotBytes||new TextEncoder().encode(raw).length>maxSnapshotBytes)throw publicFault('size','公开数据超过读取上限');
  let next;try{next=JSON.parse(raw);}catch{throw publicFault('json','服务器返回了非 JSON 或损坏的数据');}
  let valid=false;try{valid=validSnapshot(next);}catch{}if(!valid)throw publicFault('schema','公开数据格式与当前页面不匹配，请刷新页面');
  if(!globalThis.crypto?.subtle)throw publicFault('browser','浏览器无法校验公开数据，请使用新版浏览器通过 HTTPS 打开');
  const bytes=new TextEncoder().encode(JSON.stringify([next.updates,next.sources]));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==next.contentHash)throw publicFault('integrity','公开数据完整性校验未通过');
  return next;
}
function applyPublicSnapshot(next){
  const aliases=new Map(next.updates.flatMap(u=>(u.aliases??[]).map(id=>[id,u.id])));let migrated=false;
  for(const key of ['saved','read']){const ids=[...new Set(personal[key].map(id=>aliases.get(id)??id))];if(JSON.stringify(ids)!==JSON.stringify(personal[key])){personal[key]=ids;migrated=true;}}
  if(migrated)save();data=next;error='';
}
function savePublicSnapshot(next){
  try{
    const savedAt=new Date().toISOString(),raw=JSON.stringify({version:1,savedAt,snapshot:next});
    if(raw.length>maxStoredSnapshotBytes||new TextEncoder().encode(raw).length>maxStoredSnapshotBytes){cacheNote='本次数据已读取；快照较大，未保存到浏览器。';return;}
    localStorage.setItem(snapshotCacheKey,raw);snapshotSavedAt=savedAt;cacheNote='';
  }catch{cacheNote='本次数据已读取；浏览器存储不可用，关闭页面后可能需要重新联网。';}
}
function updatePublicStatus(){
  const host=main.querySelector('[data-public-load-status]');if(!host)return;
  let message='';
  if(publicIssue)message=publicIssue.message+'。'+(data?'继续显示上次成功的数据。':'尚无可用快照。');
  else if(snapshotFromCache)message='已显示上次保存的快照'+(loading?'，正在后台检查更新。':'。');
  else if(loading&&loadAttempt>1)message='公开数据读取较慢，正在自动重试。';
  else if(cacheNote)message=cacheNote;
  else if(lastPublicCheck)message='已检查 '+date(lastPublicCheck)+(snapshotSavedAt?' · 已保存到此浏览器':'');
  if(loading&&loadAttempt>1)message+=' 自动重试 '+(loadAttempt-1)+' / 2。';
  host.hidden=!message;host.replaceChildren(el('span',{},message));
  if(publicIssue&&!loading&&data)host.append(el('button',{className:'button','data-public-retry':true,onclick:()=>load(false)},'重新检查'));
  const stamp=main.querySelector('[data-public-snapshot-time]');if(stamp)stamp.textContent=(snapshotFromCache?'上次快照 ':'快照 ')+date(data?.exportedAt);
}
async function readPublicSnapshot(){
  const response=await fetch(new URL('./data.json',import.meta.url),{cache:'no-cache',credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(!response.ok){
    const fault=publicFault('http','公开数据请求失败（HTTP '+response.status+'）',[408,425,429].includes(response.status)||response.status>=500);
    const header=response.headers.get('retry-after');
    if(header){const seconds=Number(header),delay=Number.isFinite(seconds)?seconds*1000:Date.parse(header)-Date.now();if(Number.isFinite(delay)&&delay>0){fault.retryDelay=delay;if(delay>10000){fault.retryable=false;fault.message+='，服务器要求稍后再试';}}}
    throw fault;
  }
  if(Number(response.headers.get('content-length'))>maxSnapshotBytes)throw publicFault('size','公开数据超过读取上限');
  const reader=response.body?.getReader();if(!reader)return checkedPublicSnapshot(await response.text());
  const decoder=new TextDecoder();let size=0,raw='';
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxSnapshotBytes){await reader.cancel();throw publicFault('size','公开数据超过读取上限');}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}
  finally{reader.releaseLock();}
  return checkedPublicSnapshot(raw);
}
async function startPublicSnapshot(){
  loading=true;updateBusy();let cached=null;
  try{
    const raw=localStorage.getItem(snapshotCacheKey);
    if(raw){
      if(raw.length>maxStoredSnapshotBytes||new TextEncoder().encode(raw).length>maxStoredSnapshotBytes)throw Error();
      const entry=JSON.parse(raw),saved=Date.parse(entry.savedAt);
      if(entry.version!==1||!Number.isFinite(saved)||saved>Date.now()+300000)throw Error();
      cached=await checkedPublicSnapshot(JSON.stringify(entry.snapshot));snapshotSavedAt=entry.savedAt;
    }
  }catch{cacheNote='浏览器缓存不可用，正在重新读取公开数据。';}
  finally{loading=false;}
  if(cached){applyPublicSnapshot(cached);snapshotFromCache=true;render();}
  await load(true);
}
async function load(quiet=false){
  if(loading||quiet&&Date.now()<nextAutomaticCheck)return;
  const previousError=error;let changed=false;loading=true;loadAttempt=1;publicIssue=null;updateBusy();updatePublicStatus();
  try{
    let next;
    for(let attempt=1;attempt<=3;attempt++){
      loadAttempt=attempt;updatePublicStatus();
      try{next=await readPublicSnapshot();break;}
      catch(cause){const issue=publicFailure(cause);if(!issue.retryable||attempt===3)throw issue;publicIssue=issue;updatePublicStatus();await new Promise(resolve=>setTimeout(resolve,Math.max(issue.retryDelay??0,attempt===1?1000:3000)));}
    }
    changed=data?.contentHash!==next.contentHash;applyPublicSnapshot(next);snapshotFromCache=false;publicIssue=null;lastPublicCheck=new Date().toISOString();savePublicSnapshot(next);
    if(!changed&&!quiet)toast('已发布数据没有变化。');
  }catch(cause){publicIssue=publicFailure(cause);if(!data)error=publicIssue.message+'。已结束本轮读取，可稍后重试。';}
  finally{
    loading=false;loadAttempt=0;nextAutomaticCheck=Date.now()+60000;
    if(!isLocalPage()&&(changed||previousError!==error))render();updateBusy();updatePublicStatus();
  }
}
const mobileNavigation=matchMedia('(max-width:680px)');
function setNavigation(open){sidebar.classList.toggle('open',open);sidebar.inert=mobileNavigation.matches&&!open;document.querySelector('#nav-backdrop').hidden=!open;document.querySelector('.main').inert=mobileNavigation.matches&&open;document.querySelector('#open-navigation').setAttribute('aria-expanded',String(open));if(open){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');document.querySelector('#close-navigation').focus();}else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');if(sidebar.contains(document.activeElement))document.querySelector('#open-navigation').focus();}}
document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();main.focus();});
document.querySelector('#search-form').addEventListener('submit',e=>{e.preventDefault();const q=document.querySelector('#global-search').value.trim().slice(0,200);location.hash='#/updates?view=all'+(q?'&q='+encodeURIComponent(q):'')+(wantsConstellation()?'&display=constellation&days='+(filters().days||90):'');render();});
document.querySelector('#theme-button').addEventListener('click',()=>{personal.theme=personal.theme==='light'?'dark':'light';document.body.classList.toggle('light',personal.theme==='light');save();});
document.querySelector('#open-navigation').addEventListener('click',()=>setNavigation(true));document.querySelector('#close-navigation').addEventListener('click',()=>setNavigation(false));document.querySelector('#nav-backdrop').addEventListener('click',()=>setNavigation(false));mobileNavigation.addEventListener('change',()=>setNavigation(false));
async function navigateFromHome(){
 const sequence=++homeNavigationSequence,wasHome=!homeRoot.hidden,isHome=route().section==='home';
 homeTransition?.skipTransition();
 // On the first visit retain the homepage while reading the same public
 // snapshot that normal navigation already requests. No collection/prefetch.
 if(wasHome&&!isHome&&!data&&!loading&&!error){
  holdHomeRender=true;let timer;
  await Promise.race([startPublicSnapshot(),new Promise(resolve=>{timer=setTimeout(resolve,700);})]);clearTimeout(timer);
  if(sequence!==homeNavigationSequence)return;
 }
 holdHomeRender=false;
 const update=()=>{if(sequence!==homeNavigationSequence)return;setNavigation(false);render();window.scrollTo({top:0,behavior:'instant'});if(wasHome!==isHome){const target=isHome?homeRoot.querySelector('h1'):main;if(target){if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});}}};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(wasHome!==isHome&&!reduced&&document.startViewTransition){
  document.documentElement.classList.add('hub-page-transition');
  const active=document.startViewTransition(update);homeTransition=active;
  void active.finished.catch(()=>{}).finally(()=>{if(homeTransition===active){homeTransition=undefined;document.documentElement.classList.remove('hub-page-transition');}});
  await active.updateCallbackDone.catch(()=>{});
 }else{
  update();
  if(wasHome!==isHome&&!reduced){const target=isHome?homeRoot:document.querySelector('.shell');target?.animate?.([{opacity:.72,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.2,.65,.3,1)'});}
 }
 if(sequence===homeNavigationSequence&&route().section!=='home'){if(!data&&!loading&&!error)void startPublicSnapshot();void loadLocal();}
}
window.addEventListener('hashchange',()=>void navigateFromHome());
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();if(route().section==='home'){go('updates');render();}document.querySelector('#global-search').focus();}if(e.key==='Escape')setNavigation(false);if(e.key==='Tab'&&mobileNavigation.matches&&sidebar.classList.contains('open')){const items=[...sidebar.querySelectorAll('a,button')].filter(n=>n.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
setNavigation(false);render();if(route().section!=='home'){void startPublicSnapshot();void loadLocal();}

setInterval(()=>{if(document.visibilityState==="visible")refreshAll(true);},300000);
window.addEventListener('online',()=>{nextAutomaticCheck=0;if(route().section!=='home')void load(true);});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refreshAll(true);});


function localContent(section){
  if(!localResolved&&localLoading)return empty('正在读取本机缓存…','只读取已保存的数据，不请求第三方。');
  if(!localMode)return section==='models'?models():forecast();
  if(!localCache||!localModule)return [empty(localLoading?'正在读取本机缓存…':'本机缓存暂不可读',localError||'完成本地同步后再检查；此操作不会请求第三方。'),!localLoading?el('button',{className:'button','data-cache-retry':true,onclick:()=>loadLocal(false)},'重新读取本机缓存'):null];
  const helpers={el,select,render,empty,external,date};return [localError?el('div',{className:'cache-recovery',role:'status'},el('span',{},localError),el('button',{className:'button','data-cache-retry':true,disabled:localLoading,onclick:()=>loadLocal(false)},'重新读取本机缓存')):null,section==='models'?localModule.modelCenter(localCache,helpers):localModule.resetCenter(localCache,helpers)];
}
async function loadLocal(quiet=true){
  if(localLoading||!['127.0.0.1','localhost','[::1]'].includes(location.hostname))return;
  const before={mode:localMode,hash:localCache?.contentHash,error:localError,resolved:localResolved};localLoading=true;updateBusy();
  try{
    const context=await fetch(new URL('./preview-context.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!context.ok){if(localMode)throw Error();return;}const mode=await context.json();if(typeof mode.local!=='boolean')throw Error();localMode=mode.local;
    if(!localMode){localCache=null;localError='';return;}
    document.querySelector('.local-pill').replaceChildren(el('span',{className:'dot ok'}),'本机静态预览');
    const response=await fetch(new URL('./local-data.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();
    const raw=await response.text();if(new TextEncoder().encode(raw).length>8*1024*1024)throw Error();
    const next=JSON.parse(raw),module=await import('./local-preview.js?v=e533c768ad165efd923d222a654798a1eb0a7699a163b6a580442dd5c3da23dc');if(!await module.validPrivateSnapshot(next))throw Error();
    const unchanged=localCache?.contentHash===next.contentHash;localModule=module;localCache=next;localError='';
    if(!quiet)toast(unchanged?'本机缓存没有变化。':'已读取本机模型与 Reset 缓存。');
  }catch{if(localMode)localError=localCache?'本机缓存检查失败，继续显示已读取的数据。':'本机缓存暂不可读，请先完成本地同步。';}
  finally{localLoading=false;localResolved=true;if(!before.resolved||before.mode!==localMode||before.hash!==localCache?.contentHash||before.error!==localError)render();updateBusy();}
}
function refreshAll(quiet=false){if(route().section==='home')return Promise.resolve();const localPage=localMode&&['models','forecast'].includes(route().section);return Promise.all([load(quiet||localPage),loadLocal(quiet||!localPage),!localPage&&route().section==='forecast'?publicData.refreshReset(!quiet):!localPage&&route().section==='models'&&!quiet?publicData.refreshCharts():null]);}

