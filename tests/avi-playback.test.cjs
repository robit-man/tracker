const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+1+next)}
function context(names,extras={}){const c=vm.createContext({File,Blob,Date,Set,Map,Uint8Array,performance,setTimeout,clearTimeout,...extras});for(const name of names)vm.runInContext(source(name),c);return c}
test('local AVI uses compatibility decoding instead of handing an unsupported container to video.src',async()=>{
  const blob=new Blob(['RIFF']),p={c:{id:'avi'},name:'film.avi',kind:'video'},calls=[];
  const c=context(['renderPreviewBlob'],{activePreview:p,compatNeedsTranscode:()=>true,initStreamingMedia:async()=>calls.push('decoder'),pumpCompatMedia:async()=>calls.push('conversion'),URL:{createObjectURL(){throw Error('raw AVI must not be assigned to the native player')}}});
  await c.renderPreviewBlob(blob);assert.equal(p.compatInputBlob,blob);assert.deepEqual(calls,['decoder','conversion']);
});
test('local compatibility input needs no peer session and preserves the original file bytes',async()=>{
  const blob=new Blob([new Uint8Array([82,73,70,70,7,9])]),p={c:{id:'avi'},name:'film.avi',mime:'video/x-msvideo',compatInputBlob:blob};
  const c=context(['materializeCompatInput'],{extOf:()=> 'avi'}),file=await c.materializeCompatInput(p);
  assert.equal(file.name,'tracker-input.avi');assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new Uint8Array(await blob.arrayBuffer()));
});
test('verified local AVI can convert without a synthetic download session',async()=>{
  let conversions=0;const p={mode:'compat',media:{},compatInputBlob:new Blob(['AVI']),compatNeedsTranscode:true};
  const c=context(['pumpCompatMedia'],{activePreview:p,compatTranscodePlayback:async()=>{conversions++;p.compatPlaybackReady=true}});
  await Promise.all([c.pumpCompatMedia(),c.pumpCompatMedia()]);assert.equal(conversions,1);assert.equal(p.compatRefreshing,false);
});
test('closing an AVI while conversion loads retains a resumable player',()=>{
  const c=context(['previewCanStayWarm']);assert.equal(c.previewCanStayWarm({kind:'video',media:{paused:true},compatInputBlob:new Blob(['AVI'])}),true);
  assert.equal(c.previewCanStayWarm({kind:'video',media:{},lifecycleClosed:true,compatInputBlob:new Blob(['AVI'])}),false);
});
test('late conversion results cannot replace another file player',async()=>{
  const p={media:{}};const c=context(['setCompatPlaybackBlob'],{activePreview:{},URL:{createObjectURL(){throw Error('must not attach an obsolete conversion')}}});
  assert.equal(await c.setCompatPlaybackBlob(p,new Blob(['movie']),'video/mp4'),false);
});
test('finishing AVI conversion while hidden loads the decoder without resuming playback',async()=>{
  const listeners=new Map();let plays=0,restores=0;const el={readyState:4,load(){setTimeout(()=>listeners.get('canplay')?.(),0)},addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),play:async()=>plays++};
  const p={media:el,hiddenAt:1,wantPlayback:false,session:{state:'paused'}};
  const c=context(['setCompatPlaybackBlob'],{activePreview:p,URL:{createObjectURL:()=> 'blob:converted',revokeObjectURL(){}},restorePreviewPosition:()=>restores++,markPreviewPlayable(){}});
  assert.equal(await c.setCompatPlaybackBlob(p,new Blob(['movie']),'video/mp4'),true);assert.equal(p.compatPlaybackReady,true);assert.equal(plays,0);assert.equal(restores,1);
});
