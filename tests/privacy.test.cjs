const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+1+next)}
function harness(names=[]){
 const stored=new Map(),events=[],button={classList:{toggle:(...x)=>events.push(['class',...x])},setAttribute:(...x)=>events.push(['attr',...x])};
 const c=vm.createContext({privacyMode:false,privacyEpoch:0,privacyRtcConnections:new Set(),PRIVACY_MODE_KEY:'privacy',localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
  $:()=>button,setActionIcon:(...args)=>events.push(['icon',...args.slice(1)]),toast:m=>events.push(['toast',m]),
  wrappers:new Map(),peerIngress:new Map(),peerRoutes:new Map(),actorRoutes:new Map(),routeActors:new Map(),peerPrimaryRoute:new Map(),routeBenchPending:new Map(),meshStatus:new Map(),
  natsState:{sessions:new Map(),nc:{kept:true}},localLive:null,activeLiveViewer:null,sessions:new Map(),activePreview:null,
  closeNatsPeer:remote=>{events.push(['close',remote]);c.natsState.sessions.delete(remote)},
  restartDecentralized:async()=>events.push(['restart-libp2p']),stopNkn:()=>events.push(['stop-nkn']),leaveStrategy:async key=>{events.push(['leave',key]);c.wrappers.delete(key)},clearTimeout:()=>{},
  startLiveRelayRecorder:async viewer=>events.push(['legacy-relay',viewer]),scheduleLiveViewerRetry:()=>{},
  advertisedRemoteSeeders:()=>['source'],scheduleSession:s=>events.push(['schedule',s]),announceStreamDemand:async s=>events.push(['demand',s]),sendLiveWatchRequest:v=>events.push(['watch',v]),
  publishNatsPresence:async()=>events.push(['presence']),broadcastAvailability:async()=>events.push(['availability']),meshSupervisorTick:async()=>events.push(['supervise']),updateMeshState:()=>{},storedTurnIce:()=>[]
 });
 for(const name of ['privacyEnabled','privacyPublicNknAddr','privacyTurnReady','privacyCandidateIsRelay','privacySanitizeSdp','privacyRtcAvailable','privacyPcAllowed','privacyWrapperAllowed','privacyRouteAllowed','renderPrivacyMode','setPrivacyMode',...names])vm.runInContext(source(name),c);
 return {c,stored,events};
}
test('enabling privacy closes pre-existing peer routes while preserving sources, broker and active sessions',()=>{
 const {c,stored,events}=harness(),broker=c.natsState.nc,session={state:'downloading',mode:'stream',cid:'movie',holders:new Set()},live={chunked:true};
 c.natsState.sessions.set('peer',{pc:{}});c.wrappers.set('torrent:0',{});c.peerIngress.set('peer',{direct:{old:true},relay:'nats'});
 for(const map of [c.actorRoutes,c.routeActors,c.peerRoutes,c.peerPrimaryRoute])map.set('old',{});
 c.meshStatus.set('torrent:0','on');c.sessions.set('movie',session);c.activePreview={session};c.activeLiveViewer=live;
 let idleClosed=false;const idle={getConfiguration:()=>({iceTransportPolicy:'all'}),close:()=>{idleClosed=true;c.privacyRtcConnections.delete(idle)}};c.privacyRtcConnections.add(idle);
 c.localLive={stream:{kept:true},peers:new Map([['viewer',{chunked:true,pc:null,relay:{kept:true}}]])};const capture=c.localLive,decoder=c.activePreview;
 c.setPrivacyMode(true);
 assert.equal(c.privacyMode,true);assert.equal(stored.get('privacy'),'1');assert.equal(c.natsState.nc,broker);assert.equal(c.natsState.sessions.size,0);assert.equal(c.wrappers.size,0);
 assert.equal(idleClosed,true);assert.equal(c.privacyRtcConnections.size,0);
 assert.equal(c.peerIngress.get('peer').direct,null);assert.equal(c.peerIngress.get('peer').relay,'nats');assert.equal(c.peerRoutes.size,0);
 assert.equal(c.localLive,capture);assert.equal(c.activePreview,decoder);assert.equal(session.holders.has('source'),true);
 assert.equal(events.filter(x=>x[0]==='schedule').length,1);assert.ok(events.some(x=>x[0]==='watch'&&x[1]===live));assert.ok(events.some(x=>x[0]==='attr'&&x[1]==='aria-pressed'&&x[2]==='true'));
 c.setPrivacyMode(false);assert.equal(stored.get('privacy'),'0');assert.equal(c.privacyMode,false);assert.equal(c.privacyEpoch,2);
});
test('privacy closes legacy media connections without ending the capture or chunk encoders',()=>{
 const {c,events}=harness();let closed=0;const pc={close:()=>closed++},chunked={chunked:true,pc:null,relay:{encoder:'same'}},legacy={pc};
 c.localLive={peers:new Map([['modern',chunked],['old',legacy]])};c.activeLiveViewer={pc:{close:()=>closed++}};
 c.setPrivacyMode(true);assert.equal(closed,2);assert.equal(legacy.pc,null);assert.equal(c.activeLiveViewer.pc,null);assert.equal(chunked.relay.encoder,'same');assert.ok(events.some(x=>x[0]==='legacy-relay'&&x[1]==='old'));
});
test('privacy permits relay-configured NATS and libp2p wrappers, independent of stored TURN credentials',()=>{
 const {c}=harness();c.privacyMode=true;c.storedTurnIce=()=>[{urls:'turn:configured'}];
 assert.equal(c.privacyWrapperAllowed({strategy:'nats',privacyRelay:false}),false);assert.equal(c.privacyWrapperAllowed({strategy:'nats',privacyRelay:true}),true);
 assert.equal(c.privacyWrapperAllowed({strategy:'libp2p',privacyRelay:true}),true);assert.equal(c.privacyWrapperAllowed({strategy:'libp2p',privacyRelay:false}),false);
 for(const strategy of ['torrent','nkn','mqtt','nostr'])assert.equal(c.privacyWrapperAllowed({strategy,privacyRelay:true}),false);
 assert.equal(c.privacyPcAllowed({getConfiguration:()=>({iceTransportPolicy:'all'})}),false);assert.equal(c.privacyPcAllowed({getConfiguration:()=>({iceTransportPolicy:'relay'})}),true);
 c.privacyMode=false;assert.equal(c.privacyWrapperAllowed({strategy:'torrent'}),true);
});
test('private RTC uses no STUN and only the configured TURN server; SDP and ICE filters remove host addresses',()=>{
 const {c}=harness(['rtcConfig']);c.DEFAULT_STUN_URL='stun:ordinary';c.privacyMode=true;
 assert.equal(c.privacyRtcAvailable(),false);assert.equal(c.rtcConfig().iceTransportPolicy,'relay');assert.equal(c.rtcConfig().iceServers.length,0);
 c.storedTurnIce=()=>[{urls:'turn:configured',username:'user',credential:'secret'}];assert.equal(c.privacyRtcAvailable(),true);assert.equal(c.rtcConfig().iceServers.length,1);assert.equal(c.rtcConfig().iceServers[0].urls,'turn:configured');
 const sdp='v=0\r\na=candidate:1 1 udp 10 192.168.1.1 123 typ host\r\na=candidate:2 1 udp 10 203.0.113.1 123 typ srflx\r\na=candidate:3 1 udp 10 198.51.100.1 123 typ relay\r\n';
 const clean=c.privacySanitizeSdp(sdp);assert.doesNotMatch(clean,/typ host|typ srflx/);assert.match(clean,/typ relay/);assert.equal(c.privacyCandidateIsRelay({type:'host'}),false);assert.equal(c.privacyCandidateIsRelay({type:'relay'}),true);
});
test('the global RTC cap tracks idle connections and prevents configuration changes from restoring direct ICE',()=>{
 const {c}=harness(['rtcConfig']);
 class Native{constructor(config){this.config=config;this.connectionState='new';this.sent=0}getConfiguration(){return this.config}setConfiguration(config){this.config=config}close(){this.connectionState='closed'}createDataChannel(){return{send:()=>this.sent++}}addEventListener(){}}
 Object.assign(c,{window:{RTCPeerConnection:Native},DEFAULT_STUN_URL:'stun:ordinary',console:{info(){},warn(){}}});vm.runInContext(source('installRtcHardCap'),c);
 const idle=new c.window.RTCPeerConnection({iceServers:[]}),connected=new c.window.RTCPeerConnection({iceServers:[]}),dc=connected.createDataChannel();connected.connectionState='connected';dc.send('ordinary');assert.equal(connected.sent,1);
 assert.equal(c.privacyRtcConnections.has(idle),true);c.setPrivacyMode(true);dc.send('late library leave or queued payload');assert.equal(connected.sent,1);assert.equal(connected.connectionState,'closed');assert.equal(idle.connectionState,'new');assert.equal(idle.getConfiguration().iceTransportPolicy,'relay');assert.equal(idle.getConfiguration().iceServers.length,0);idle.close();assert.equal(c.privacyRtcConnections.size,0);
 const relay=new c.window.RTCPeerConnection({iceServers:[{urls:'turn:configured'}]});relay.setConfiguration({iceTransportPolicy:'all',iceServers:[{urls:'stun:forbidden'},{urls:'turn:configured'}]});
 assert.equal(relay.getConfiguration().iceTransportPolicy,'relay');assert.deepEqual(Array.from(relay.getConfiguration().iceServers,x=>x.urls),['turn:configured']);relay.close();assert.equal(c.privacyRtcConnections.size,0);
});
test('cached control ingress cannot bypass the privacy policy, while encrypted broker delivery remains usable',async()=>{
 const {c}=harness(['firstSuccessfulSend','sendPacketVia','sendActorIngress']);c.wakuPlane={ready:false};let direct=0,relayed=0;
 c.privacyMode=true;const w={strategy:'torrent',key:'stale',peers:new Set(['p']),ctl:{send:async()=>{direct++;return true}}};
 Object.assign(c,{seal:async x=>x,peerIngress:new Map([['peer',{direct:{w,peerId:'p'},relay:'nats'}]]),controlRoutesFor:()=>[],localRelayPlanes:()=>['nats'],remoteRelayPlanes:()=>['nats'],relayPlaneName:x=>x,RELAY_PLANES:['nats'],relayActors:new Map([['peer',{}]]),bc:null,routeKey:()=> 'stale',publishRelayPacketOnPlane:async()=>{relayed++;return true}});
 assert.equal(await c.sendPacketVia(w,'packet','p'),false);assert.equal(await c.sendActorIngress('peer',{type:'request'}),true);assert.equal(direct,0);assert.equal(relayed,1);
});
test('a queued direct media send rechecks privacy when it runs after the toggle',async()=>{
 const {c}=harness(['streamDataCandidates']);let sent=0;c.privacyMode=false;
 const route={wrapper:{strategy:'torrent',key:'old',bin:{send:async()=>{sent++;return true}}},peerId:'p'};
 Object.assign(c,{healthyRoutesFor:()=>[route],streamPathIdFromRoute:()=> 'direct:old',localRelayPlanes:()=>[],remoteRelayPlanes:()=>[],relayActors:new Map(),routeScore:()=>1,relayPlaneName:x=>x,bc:null});
 const path=c.streamDataCandidates('peer')[0];c.privacyMode=true;assert.equal(await path.send(new Uint8Array(),{}),false);assert.equal(sent,0);
});
test('a strategy import started before enabling privacy cannot later join a direct room',async()=>{
 const {c}=harness(['joinStrategy']);let resolveImport,joined=0;
 Object.assign(c,{MESH_STRATEGIES:{torrent:{pkg:'test'}},meshEpochNow:()=>0,meshStopped:false,importStrategy:()=>new Promise(r=>resolveImport=r)});
 const joining=c.joinStrategy('torrent');c.setPrivacyMode(true);resolveImport({joinRoom:()=>{joined++;throw Error('must not run')}});
 assert.equal(await joining,false);assert.equal(joined,0);
});
