const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+1+next)}
function context(names,extras={}){const c=vm.createContext({File,Blob,Date,Set,Map,Uint8Array,performance,setTimeout,clearTimeout,...extras});for(const name of names)vm.runInContext(source(name),c);return c}

test('native decoder errors and silently omitted video trigger conversion once, preserving position',()=>{
  for(const event of ['error','loadedmetadata']){
    const listeners={},el={currentTime:7,videoWidth:0,addEventListener:(k,f)=>listeners[k]=f},p={kind:'video',mode:'buffer',media:el};let starts=0;
    const c=context(['attachCompatFallback'],{activePreview:p,startCompatMedia:(media,preview)=>{assert.equal(media,el);assert.equal(preview,p);starts++}});
    c.attachCompatFallback(p,el);listeners[event]();listeners.error();assert.equal(starts,1);assert.equal(p.compatForceTranscode,true);assert.equal(p.resumeTime,7);
  }
});
test('late native decoder errors cannot restart an obsolete or already converting preview',()=>{
  for(const mode of ['closed','replaced','converting']){
    const listeners={},el={addEventListener:(k,f)=>listeners[k]=f},p={media:el,mode:mode==='converting'?'compat':'buffer',lifecycleClosed:mode==='closed'};
    const c=context(['attachCompatFallback'],{activePreview:mode==='replaced'?{}:p,startCompatMedia:()=>assert.fail('obsolete decoder restarted')});
    c.attachCompatFallback(p,el);listeners.error();
  }
});
test('MP4 metadata checks both source codecs and skips large media payloads',async()=>{
  const p={},offsets=[];let parser;
  const blob={size:40*1024*1024,slice:(a,b)=>{offsets.push(a);return new Blob([new Uint8Array(b-a)])}};
  const c=context(['compatMp4Tracks','compatCheckIsoBmff'],{activePreview:p,document:{createElement:()=>({canPlayType:mime=>mime.includes('avc1')?'probably':''})},loadMp4BoxModule:async()=>({module:{createFile:()=>parser={stop(){},appendBuffer(buffer){if(buffer.fileStart===0)return 39*1024*1024;this.onReady({videoTracks:[{video:{},codec:'avc1.42c01e'}],audioTracks:[{audio:{},codec:'alac'}]});return blob.size}}}})});
  assert.equal(await c.compatCheckIsoBmff(p,blob),true);assert.equal(p.compatForceTranscode,true);assert.deepEqual(offsets,[0,39*1024*1024]);assert.equal(parser.onReady,null);
});
test('MP4Box other-track classification cannot silently discard ALAC or AC-3 audio',()=>{
  const c=context(['compatMp4Tracks']),video={video:{},codec:'avc1.42c01e'},alac={codec:'alac'},ac3={codec:'ac-3'},subtitle={codec:'wvtt'};
  const tracks=c.compatMp4Tracks({tracks:[video,alac,ac3,subtitle],audioTracks:[]});assert.equal(tracks.length,3);assert.equal(tracks[1],alac);assert.equal(tracks[2],ac3);
});
test('supported MP4 tracks retain native playback and failed metadata reads can use native fallback',async()=>{
  for(const failed of [false,true]){
    const p={};let stopped=false;
    const c=context(['compatMp4Tracks','compatCheckIsoBmff'],{activePreview:p,document:{createElement:()=>({canPlayType:()=> 'probably'})},loadMp4BoxModule:async()=>({module:{createFile:()=>({stop(){stopped=true},appendBuffer(){if(failed)throw Error('unreadable metadata');this.onReady({videoTracks:[{video:{},codec:'avc1.42c01e'}],audioTracks:[{audio:{},codec:'mp4a.40.2'}]})}})}})});
    assert.equal(await c.compatCheckIsoBmff(p,new Blob(['mp4'])),false);assert.equal(p.compatForceTranscode,undefined);assert.equal(stopped,true);
  }
});
test('a native rejection of a complete received file automatically converts its verified bytes',async()=>{
  const file=new File(['compressed WAV'],'input.wav'),p={mode:'compat',media:{},session:{networkComplete:true}};let conversions=0;
  const c=context(['pumpCompatMedia'],{activePreview:p,materializeCompatInput:async()=>file,setCompatPlaybackBlob:async()=>{throw Error('unsupported WAV codec')},compatTranscodePlayback:async preview=>{assert.equal(preview,p);conversions++}});
  await c.pumpCompatMedia();assert.equal(conversions,1);assert.equal(p.compatForceTranscode,true);assert.equal(p.compatNeedsTranscode,true);assert.equal(p.compatInputBlob,file);assert.equal(p.compatRefreshing,false);
});
test('successful encoding with browser-rejected audio retries MP3 and removes temporary outputs',async()=>{
  const p={kind:'audio',name:'song.wma',mode:'compat',compatNeedsTranscode:true},execs=[],deleted=[],attempted=[];
  const ff={createDir:async()=>{},mount:async()=>true,exec:async args=>{execs.push(args);return 0},readFile:async()=>new Uint8Array([1,2]),deleteFile:async path=>deleted.push(path),unmount:async()=>{},deleteDir:async()=>{}};
  const c=context(['compatTranscodePlayback'],{activePreview:p,trackerFfmpegActiveJob:null,crypto:{randomUUID:()=> 'job'},$:()=>null,extOf:()=> 'wma',previewDebugEvent(){},trackerFfmpeg:async()=>ff,materializeCompatInput:async()=>new File(['source'],'input.wma'),setCompatPlaybackBlob:async(_p,_blob,mime)=>{attempted.push(mime);if(mime==='audio/mp4')throw Error('AAC unavailable');return true},showPreviewError:()=>assert.fail('fallback should play')});
  assert.equal(await c.compatTranscodePlayback(p),true);assert.deepEqual(attempted,['audio/mp4','audio/mpeg']);assert.equal(execs.length,2);assert.ok(deleted.includes('tracker-job.m4a'));assert.ok(deleted.includes('tracker-job.mp3'));assert.equal(p.compatTranscoded,true);
});
