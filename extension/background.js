/* A supervised same-origin Tracker tab owns the real encrypted provider.
 * No fake presence; no remote code executes inside the extension origin. */
if(typeof TrackerExtensionProtocol==='undefined')importScripts('protocol.js');
const P=TrackerExtensionProtocol,api=typeof browser!=='undefined'?browser:chrome;
const KEY='providerV2',ALARM='tracker-provider-supervisor',TTL=150000;
let tail=Promise.resolve();const knownTabs=new Map();
const serial=work=>{const next=tail.catch(()=>{}).then(work);tail=next.catch(()=>{});return next;};
const fresh=()=>({version:2,config:{...P.defaults},target:null,tabId:null,token:'',lastHeartbeat:0,lastReload:0,state:null,error:''});
async function read(){const value=(await api.storage.local.get(KEY))[KEY];if(!value||value.version!==2)return fresh();P.settings(value.config);if(value.target){P.site(value.target.base);P.room(value.target.url);}return value;}
async function write(record){await api.storage.local.set({[KEY]:record});return record;}
function managedUrl(record){const u=new URL(record.target.url);u.searchParams.set('trackerBackground',record.token);return u.href;}
function matches(tab,record){return !!record.target&&!!tab?.url&&tab.url===managedUrl(record);}
function sameRoom(url,record){try{return !!record.target&&P.room(url)===record.target.url;}catch(_){return false;}}
function trustedPage(sender){if(sender.id!==api.runtime.id||sender.frameId!==0||!sender.tab||sender.tab.incognito)throw Error('Tracker top-level tab required');P.site(sender.url);if(sender.tab.url&&P.site(sender.tab.url)!==P.site(sender.url))throw Error('Tab origin changed');return sender.tab.id;}
function trustedPopup(sender){if(sender.id!==api.runtime.id||sender.url!==api.runtime.getURL('popup.html'))throw Error('Use the extension popup to change background participation');}
async function message(tabId,msg,timeout=12000){let timer;try{return await Promise.race([api.tabs.sendMessage(tabId,msg),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Tracker did not respond. Open or reload its tab and try again.')),timeout);})]);}finally{clearTimeout(timer);}}
async function apply(tab,record){if(!tab.url||P.site(tab.url)!==record.target.base)return;const response=await message(tab.id,{type:'TRACKER_STORAGE_APPLY',config:record.config,room:sameRoom(tab.url,record)});if(!response?.ok)throw Error(response?.error||'Tracker could not apply contribution settings');return P.state(response.state);}
function applied(state,config){return !!state&&Object.keys(P.defaults).every(key=>state.config[key]===config[key]);}
function publicView(record){const alive=record.lastHeartbeat>0&&Date.now()-record.lastHeartbeat<TTL,state=alive?record.state:null,c=record.config,confirmed=applied(state,c);const serving=confirmed&&(!c.roomEnabled||state.seedMode!=='off'&&state.roomNetworkReady)&&(!c.globalEnabled||state.globalLeader&&state.globalNetworkReady);return {version:2,config:c,enrolled:!!record.target,site:record.target?.base||'',roomAuthorized:record.target?.roomAuthorized===true,tabId:record.tabId,lastHeartbeat:record.lastHeartbeat,phase:!P.enabled(c)?'off':record.error?'error':serving?'running':confirmed?'waiting-network':'starting',state,error:record.error};}
async function broadcast(record){const view=publicView(record);for(const tab of await api.tabs.query({})){try{P.site(tab.url);api.tabs.sendMessage(tab.id,{type:'TRACKER_STORAGE_STATUS',view}).catch(()=>{});}catch(_){}}return view;}
async function candidates(){const tabs=await api.tabs.query({});return tabs.filter(t=>{try{return !t.incognito&&!new URL(t.url).searchParams.has('trackerBackground')&&!!P.site(t.url);}catch(_){return false;}}).sort((a,b)=>Number(b.active)-Number(a.active)||(b.lastAccessed||b.id)-(a.lastAccessed||a.id));}
async function popupView(){const record=await read(),tab=(await candidates())[0];let current=null;if(tab){try{const reply=await message(tab.id,{type:'TRACKER_STORAGE_INSPECT'},4000);if(reply?.ok)current={tabId:tab.id,site:P.site(tab.url),state:P.state(reply.state)};}catch(_){}}return {view:publicView(record),current};}
async function reconcile(){
  let record=await read();if(!P.enabled(record.config)||!record.target)return broadcast(record);
  const tabs=await api.tabs.query({});let tab=tabs.find(t=>t.id===record.tabId&&matches(t,record))||tabs.find(t=>matches(t,record));
  if(!tab){const windows=await api.windows.getAll({windowTypes:['normal']});if(!windows.length)return publicView(record);tab=await api.tabs.create({url:managedUrl(record),active:false,pinned:true});record.tabId=tab.id;record.lastHeartbeat=0;record.state=null;record.error='';await write(record);}
  if(record.tabId!==tab.id){record.tabId=tab.id;await write(record);}
  // Firefox lacks autoDiscardable; Chromium additionally opts out of eviction.
  try{await api.tabs.update(tab.id,{autoDiscardable:false});}catch(_){}
  if(tab.discarded||tab.frozen){await api.tabs.reload(tab.id);return broadcast(record);}
  if(tab.status==='complete'){try{record.state=await apply(tab,record);record.lastHeartbeat=Date.now();record.error='';}catch(e){record.error=e.message;const now=Date.now();if(now-(record.lastReload||0)>=60000){record.lastReload=now;await api.tabs.reload(tab.id);}}await write(record);}
  return broadcast(record);
}
async function syncTabs(record,except=null){const failures=[];for(const tab of await api.tabs.query({})){if(tab.id===except||tab.id===record.tabId&&!matches(tab,record))continue;try{if(P.site(tab.url)!==record.target.base)continue;}catch(_){continue;}try{await apply(tab,record);}catch(e){failures.push(e.message);}}return failures;}
async function stop(){
  const record=await read(),ownedId=record.tabId;record.config={...record.config,roomEnabled:false,globalEnabled:false};record.error='';await write(record);
  const failures=record.target?await syncTabs(record):[];
  if(ownedId!==null){const tab=await api.tabs.get(ownedId).catch(()=>null);if(matches(tab,record))await api.tabs.remove(ownedId);}
  record.tabId=null;record.lastHeartbeat=0;record.state=null;record.error=failures.length?'Some open tabs did not confirm opt-out. Reload them and check contribution settings.':'';await write(record);await broadcast(record);return {view:publicView(record),warnings:failures};
}
async function configure(msg){
  P.object(msg,['type','config','tabId']);const config=P.settings(msg.config);let record=await read();if(!P.enabled(config))return stop();let target=record.target;
  if(msg.tabId!==null&&msg.tabId!==undefined){if(!Number.isInteger(msg.tabId))throw Error('Invalid tab');const tab=await api.tabs.get(msg.tabId);if(tab.incognito)throw Error('Private browsing is not supported');const base=P.site(tab.url),url=config.roomEnabled?P.room(tab.url):target?.base===base&&!target.roomAuthorized?target.url:base+'#'+Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');const inspected=await message(tab.id,{type:'TRACKER_STORAGE_INSPECT'});if(!inspected?.ok)throw Error(inspected?.error||'Tracker is not ready');P.state(inspected.state);target={base,url,roomAuthorized:config.roomEnabled};}
  if(!target||config.roomEnabled&&!target.roomAuthorized)throw Error('Open the room to authorize it from the popup');
  if(!config.roomEnabled&&target.roomAuthorized)target={base:target.base,url:target.base+'#'+Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join(''),roomAuthorized:false};
  if(record.target&&record.target.url!==target.url){await stop();record=await read();record.tabId=null;record.token='';}
  record.target=target;record.config=config;record.token=record.token||crypto.randomUUID();record.error='';await write(record);const warnings=await syncTabs(record);await reconcile();record=await read();return {view:publicView(record),warnings};
}
async function receive(msg,sender){
  if(!msg||typeof msg.type!=='string')throw Error('Invalid message');
  if(msg.type==='TRACKER_STORAGE_POPUP'){trustedPopup(sender);P.object(msg,['type']);return popupView();}
  if(msg.type==='TRACKER_STORAGE_VIEW'){trustedPopup(sender);P.object(msg,['type']);return {view:publicView(await read())};}
  if(msg.type==='TRACKER_STORAGE_CONFIGURE'){trustedPopup(sender);return serial(()=>configure(msg));}
  if(msg.type==='TRACKER_STORAGE_STOP'){trustedPopup(sender);P.object(msg,['type']);return serial(stop);}
  if(msg.type==='TRACKER_STORAGE_OPEN'){trustedPopup(sender);P.object(msg,['type']);await api.tabs.create({url:'https://robit-man.github.io/tracker/'});return {};}
  const tabId=trustedPage(sender);knownTabs.set(tabId,sender.url);
  if(msg.type==='TRACKER_STORAGE_GET'){P.object(msg,['type']);return {view:publicView(await read())};}
  if(msg.type==='TRACKER_STORAGE_REPORT'){P.object(msg,['type','state']);const state=P.state(msg.state);return serial(async()=>{const record=await read();if(tabId!==record.tabId||!matches({url:sender.url},record))return {};record.state=state;record.lastHeartbeat=Date.now();if(applied(state,record.config))record.error='';await write(record);return {view:await broadcast(record)};});}
  if(msg.type==='TRACKER_STORAGE_CHANGED'){
    P.object(msg,['type','scope','config']);if(!['room','global'].includes(msg.scope))throw Error('Invalid scope');const config=P.settings(msg.config);
    return serial(async()=>{const record=await read();if(!record.target||!P.enabled(record.config)||P.site(sender.url)!==record.target.base||msg.scope==='room'&&!sameRoom(sender.url,record))return {};const next={...record.config,...(msg.scope==='room'?{roomEnabled:config.roomEnabled,roomCapacityGB:config.roomCapacityGB}:{globalEnabled:config.globalEnabled,globalCapacityGB:config.globalCapacityGB,anonymous:config.anonymous,shard:config.shard})};if(JSON.stringify(next)===JSON.stringify(record.config))return {};record.config=next;record.error='';await write(record);if(!P.enabled(next))return stop();await syncTabs(record,tabId);return {view:await reconcile()};});
  }
  throw Error('Unsupported extension message');
}
api.runtime.onMessage.addListener((msg,sender,respond)=>{receive(msg,sender).then(result=>respond({ok:true,...result}),e=>respond({ok:false,error:e.message}));return true;});
api.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)serial(reconcile).catch(()=>{});});
api.windows.onCreated.addListener(()=>serial(reconcile).catch(()=>{}));
api.tabs.onUpdated.addListener((id,change)=>{if(change.status==='complete'||change.discarded||change.frozen)serial(async()=>{const record=await read();if(id===record.tabId)await reconcile();}).catch(()=>{});});
api.tabs.onRemoved.addListener((id,info)=>{const url=knownTabs.get(id);knownTabs.delete(id);serial(async()=>{const record=await read();if(id===record.tabId){record.tabId=null;record.lastHeartbeat=0;await write(record);if(!info.isWindowClosing)await reconcile();}else if(url&&record.tabId!==null&&sameRoom(url,record)){const tab=await api.tabs.get(record.tabId).catch(()=>null);if(matches(tab,record))await api.tabs.reload(tab.id);}}).catch(()=>{});});
async function boot(){if(api.storage.local.setAccessLevel)await api.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});const existing=await api.alarms.get(ALARM);if(!existing)await api.alarms.create(ALARM,{periodInMinutes:1});const stored=await api.storage.local.get(KEY);if(!stored[KEY]){await api.storage.local.clear();await write(fresh());}await reconcile();}
api.runtime.onInstalled.addListener(()=>serial(boot).catch(()=>{}));api.runtime.onStartup.addListener(()=>serial(boot).catch(()=>{}));serial(boot).catch(()=>{});
