const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(process.env.TRACKER_HTML||require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1,`missing ${name}`);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+1+next)}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
class Target extends EventTarget{
 listeners=new Set();
 addEventListener(type,fn){super.addEventListener(type,fn);this.listeners.add(fn)}
 removeEventListener(type,fn){super.removeEventListener(type,fn);this.listeners.delete(fn)}
 emit(type){this.dispatchEvent(new Event(type))}
}
function harness(){
 const p={media:{currentTime:30},mode:'compat',wantPlayback:true},e={preview:p,ready:true,generation:0};p.compatProgressive=e;
 const list=new Target();list.items=[];list[Symbol.iterator]=function*(){yield*this.items};
 const ms=p.mediaSource=new Target();ms.readyState='open';ms.sourceBuffers=list;
 const sb=new Target();sb.__q=[];sb.__preview=p;sb.updating=false;sb.ranges=[[0,40]];sb.removals=[];sb.offsets=[];sb.appends=[];sb.aborts=0;
 const idle=()=>{assert.equal(sb.updating,false,'native operation requires an idle SourceBuffer');assert.equal(list.items.includes(sb),true);assert.notEqual(ms.readyState,'closed')};
 Object.defineProperties(sb,{
  buffered:{get(){return{length:sb.ranges.length,start:i=>sb.ranges[i][0],end:i=>sb.ranges[i][1]}}},
  timestampOffset:{set(value){idle();sb.offsets.push(value);ms.readyState='open'}}
 });
 sb.abort=()=>{idle();assert.equal(ms.readyState,'open');sb.aborts++};
 sb.remove=(a,b)=>{idle();sb.removals.push([a,b]);sb.updating=true};
 sb.complete=(ranges=sb.ranges)=>{sb.ranges=ranges;sb.updating=false;sb.emit('updateend')};
 ms.addSourceBuffer=()=>{list.items.push(sb);return sb};ms.endOfStream=()=>{idle();ms.readyState='ended'};
 const c=vm.createContext({Set,Uint8Array,performance,clearInterval,activePreview:p,STREAM_KEEP_BEHIND_SECONDS:15,
  previewMediaSourceType:()=>({isTypeSupported:()=>true}),compatEncodedMime:()=> 'video/mp4',
  restorePreviewPosition(){},maintainCompatPlayback(){},enforceMediaSourceDuration(){},previewDebugEvent(){},
  wakeCompatTranscode:()=>c.trimPreviewBehind(p),compatProgressiveFailure:(_e,error)=>assert.fail(error),
  queueSourceBuffer(buffer,data){idle();buffer.appends.push(data);buffer.updating=true},
  trackerFfmpegActiveJob:null,trackerFfmpegPromise:null
 });
 for(const name of ['compatProgressiveCurrent','compatProgressivePaused','cancelCompatBufferWaits','compatBufferCurrent','waitCompatBufferIdle','ensureCompatSourceBuffer','appendCompatSection','trimPreviewBehind','seekCompatSections','releaseCompatResources','runCompatSections'])vm.runInContext(source(name),c);
 c.ensureCompatSourceBuffer(e,new Uint8Array(1),{});
 const append=(start=40,generation=e.generation)=>c.appendCompatSection(e,new Uint8Array([1,2,3]),{},start,start+4,generation);
 return{p,e,sb,ms,list,c,append};
}
test('a converted append waits for trimming and reserves timestamp setup across updateend callbacks',async()=>{
 const h=harness();h.sb.remove(0,10);const pending=h.append();
 assert.equal(h.e.bufferWaiters.size,1);assert.deepEqual(h.sb.offsets,[]);
 h.sb.complete([[10,40]]);await turn();
 assert.equal(h.sb.removals.length,1,'the updateend watchdog cannot trim ahead of timestamp setup');
 assert.deepEqual(h.sb.offsets,[40]);assert.equal(h.sb.appends.length,1);assert.equal(h.e.bufferMutationPending,false);
 assert.equal(h.e.bufferWaiters.size,0);h.sb.complete([[10,44]]);assert.equal(await pending,true);
});
test('seek reset waits for an existing removal, then its own removal, before appending',async()=>{
 const h=harness();h.e.resetRanges=true;h.sb.remove(0,5);const pending=h.append(120);
 assert.equal(h.sb.aborts,0);h.sb.complete([[5,40]]);await turn();
 assert.equal(h.sb.aborts,1);assert.deepEqual(h.sb.removals,[[0,5],[5,40]]);assert.deepEqual(h.sb.offsets,[]);
 h.sb.complete([]);await turn();assert.deepEqual(h.sb.offsets,[120]);assert.equal(h.e.resetRanges,false);
 h.sb.complete([[120,124]]);assert.equal(await pending,true);
});
test('seeking cancels an obsolete buffer wait and never appends its converted output',async()=>{
 const h=harness();h.c.sourceBufferAhead=()=>0;h.sb.remove(0,5);const pending=h.append();
 h.p.media.currentTime=120;h.c.seekCompatSections(h.e);
 assert.equal(await pending,false);assert.equal(h.e.generation,1);assert.equal(h.e.bufferWaiters.size,0);
 h.sb.complete([[5,40]]);assert.deepEqual(h.sb.offsets,[]);assert.equal(h.sb.appends.length,0);
});
test('cleanup cancels buffer waiters before awaiting the conversion task',async()=>{
 const h=harness();h.sb.remove(0,5);h.e.task=h.append();h.e.closed=true;
 await h.c.releaseCompatResources(h.e);assert.equal(await h.e.task,false);assert.equal(h.e.bufferWaiters.size,0);
 assert.equal(h.ms.listeners.size,0);assert.equal(h.list.listeners.size,0);assert.equal(h.sb.listeners.size,2,'only the permanent buffer listeners remain');
 h.sb.complete();assert.equal(h.sb.appends.length,0);
});
test('detaching an active buffer rejects promptly and removes every temporary listener',async()=>{
 for(const kind of ['removed','closed']){
  const h=harness();h.sb.remove(0,5);const pending=h.append(),rejected=assert.rejects(pending,/no longer attached/);
  if(kind==='removed'){h.list.items=[];h.list.emit('removesourcebuffer')}else{h.ms.readyState='closed';h.ms.emit('sourceclose')}
  await rejected;assert.equal(h.e.bufferWaiters.size,0);assert.equal(h.ms.listeners.size,0);assert.equal(h.list.listeners.size,0);assert.equal(h.e.bufferMutationPending,false);
 }
});
test('a new generation arriving after the idle promise resolves still cannot mutate the buffer',async()=>{
 const h=harness();const pending=h.append();h.e.generation++;
 assert.equal(await pending,false);assert.deepEqual(h.sb.offsets,[]);assert.equal(h.sb.appends.length,0);
});
test('quota-deferred appends release setup ownership so eviction can make progress',async()=>{
 const h=harness();h.c.queueSourceBuffer=(sb,data)=>sb.__q.push(data);const pending=h.append();await turn();
 assert.equal(h.e.bufferMutationPending,false);h.c.trimPreviewBehind(h.p);assert.deepEqual(h.sb.removals,[[0,15]]);
 h.e.append.resolve(false);h.e.append=null;assert.equal(await pending,false);
});
test('a synchronous native append failure rejects its compatibility task instead of leaving it pending',async()=>{
 const h=harness(),error=new DOMException('detached','InvalidStateError');
 vm.runInContext(source('drainSourceBuffer'),h.c);Object.assign(h.c,{sourceBufferNativeUsage:()=>({seconds:0,bytes:0}),sourceBufferQuotaBlocked(){},previewDebugEvent(){},console:{warn(){}}});
 h.c.queueSourceBuffer=(sb,data)=>{sb.__q.push(data);h.c.drainSourceBuffer(sb)};h.sb.appendBuffer=()=>{throw error};
 await assert.rejects(h.append(),x=>x===error);assert.equal(h.e.append,null);assert.equal(h.sb.__q.length,0);
});
test('end of conversion waits for trimming and can seek back after endOfStream',async()=>{
 const h=harness();h.e.done=true;h.sb.remove(0,5);const ended=h.c.runCompatSections(h.e);
 assert.equal(h.ms.readyState,'open');h.sb.complete([[5,40]]);await ended;assert.equal(h.ms.readyState,'ended');assert.equal(h.p.compatTranscoded,true);
 h.e.resetRanges=true;const pending=h.append(120);await turn();assert.equal(h.ms.readyState,'open');assert.equal(h.sb.aborts,1);
 h.sb.complete([]);await turn();h.sb.complete([[120,124]]);assert.equal(await pending,true);
});
