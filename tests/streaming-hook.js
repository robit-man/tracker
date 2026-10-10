startMesh=async()=>{};wakeTransferTransports=()=>{};wakeSeederRecoveryTransports=()=>{};promoteRelayActor=async()=>false;
window.__tracker={get actor(){return actor},get p(){return activePreview},catalog,contents,openPreview,closePreview,trimBehind(){trimPreviewBehind(activePreview)},
 async seed(){const f=document.querySelector('#harnessFile').files[0];const h=await hashFileStreaming(f),cid='f-'+h.root,c={id:cid,root:h.root,sha:h.root,hashAlg:HASH_ALG,size:f.size,type:f.type||'video/mp4',chunkSize:h.chunkSize,totalChunks:h.total},e={id:cid,contentId:cid,kind:'file',name:f.name,parent:null,v:nextV(),created:Date.now()};contents.set(cid,c);catalog.set(cid,e);sourceFiles.set(cid,f);localHave.add(cid);selectedSeeds.add(cid);await broadcast(msg('state',{entries:[e],contents:[c],availability:[cid]}));return cid},
 stats(){const p=activePreview,s=p?.session,d=p?.debug;return {mode:p?.mode,ready:p?.mp4boxReady,safe:streamBufferedAhead(p),band:s&&streamSafeBand(s,p),time:p?.media?.currentTime,paused:p?.media?.paused,mediaError:p?.media?.error?.message,state:s?.state,error:s?.error,rx:s?.receivedCount,total:s?.total,fed:s?.decoderFedCount,head:s&&mp4ProgressiveCursor(s),netBytes:s?.bytesReceived,segBytes:d?.segmentBytes,mseBytes:d?.mseBytes,latency:s?.deliveryLatency,jitter:s?.deliveryJitter,slope:s?.safeSlopeEma,supply:s?.safeSupplyRate,target:s?.safePlantTarget,pressure:s?.safePlantPressure,requestChunks:s?.safeRequestChunks,inflight:s?.inflight.size,q:p&&mp4QueuePressure(p),seekEpoch:s?.seekEpoch||0,anchor:s?.decoderAnchor,prefix:s?.rxPrefix,ranges:p?.media?Array.from({length:p.media.buffered.length},(_,i)=>[p.media.buffered.start(i),p.media.buffered.end(i)]):[],events:d?.events.slice(-6)}},
 async rtc(remote,initiator){
   const pc=new RTCPeerConnection({iceServers:[]});window.__pc=pc;
   const w={key:'harness-rtc',name:'harness-rtc',strategy:'torrent',peers:new Set(['peer']),ctl:{},bin:{}};
   window.__link={bps:4*1024*1024,pause:false,dropIndex:10,dropped:new Set(),tx:Promise.resolve(),sent:0};
   const sendFrame=async(dc,data)=>{while(dc.bufferedAmount>256*1024)await sleep(2);if(dc.readyState!=='open')throw Error('data channel closed');dc.send(data)};
   const bind=dc=>{dc.binaryType='arraybuffer';if(dc.label==='ctl'){
     w.ctl.send=async data=>sendFrame(dc,data);
     dc.onmessage=e=>handleControl(e.data,{peerId:'peer'},w,'direct').catch(e=>console.error('control',e));
   }else{
     let rx=null;
     dc.onmessage=e=>{if(typeof e.data==='string'){const m=JSON.parse(e.data);rx={...m,parts:[],bytes:0}}else{if(!rx)throw Error('binary header missing');rx.parts.push(new Uint8Array(e.data));rx.bytes+=e.data.byteLength;if(rx.bytes===rx.size){const packet=new Uint8Array(rx.size),metadata=rx.metadata;let offset=0;for(const part of rx.parts){packet.set(part,offset);offset+=part.length;}rx=null;handleBinary(packet,{peerId:'peer',metadata},w).catch(e=>console.error('binary',e))}}};
     w.bin.send=(packet,{metadata}={})=>{const link=window.__link;const job=link.tx.catch(()=>{}).then(async()=>{
       if(metadata.idx===link.dropIndex&&!link.dropped.has(metadata.idx)){link.dropped.add(metadata.idx);return}
       while(link.pause)await sleep(20);
       await sleep(packet.byteLength/Math.max(1,link.bps)*1000);
       await sendFrame(dc,JSON.stringify({metadata,size:packet.byteLength}));
       const data=new Uint8Array(packet);for(let i=0;i<data.length;i+=16384)await sendFrame(dc,data.slice(i,i+16384));link.sent+=data.length;
     });link.tx=job;return job};
   }dc.onopen=()=>{if(Object.keys(w.ctl).length&&Object.keys(w.bin).length){wrappers.set(w.key,w);registerPeerRoute(remote,w,'peer','torrent');window.__rtcReady=true}}};
   pc.ondatachannel=e=>bind(e.channel);
   if(initiator){bind(pc.createDataChannel('ctl'));bind(pc.createDataChannel('bin'));
     await pc.setLocalDescription(await pc.createOffer());await new Promise(r=>{if(pc.iceGatheringState==='complete')r();else pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete')r()})});return pc.localDescription.toJSON();}
 }
};
const harnessFile=document.createElement('input');harnessFile.id='harnessFile';harnessFile.type='file';document.body.append(harnessFile);
