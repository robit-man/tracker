const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fixture,source}=require('./v4-helper.cjs'),vectors=require('./fixtures/legacy-vectors.json');
async function hashing(baseline=false){const c=await fixture();Object.assign(c,{CHUNK_SIZE:524288,HASH_ALG:'sha256-chain-v1',performance,Worker:undefined});for(const n of ['swarmInit','swarmStep','hashFileStreamingMain','hashFileStreamingWorker','hashFileStreaming','importAesKey','aesEncryptKey','hashLockedFileStreamingMain']){let code=source(n);if(baseline){const old=require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/tracker-v3.html'),'utf8'),start=old.search(new RegExp('^(?:async )?function '+n+'\\(','m')),next=old.slice(start+1).search(/^(?:async )?function /m);code=old.slice(start,next<0?undefined:start+next+1)}vm.runInContext(code,c)}return c}
test('deployed empty and small chain roots survive v4, independently of names',async()=>{
 for(const baseline of [true,false]){const c=await hashing(baseline);assert.equal((await c.hashFileStreaming(new Blob([]))).root,vectors.emptyRoot);
 // The baseline small vector is UTF-8 "tracker".
 const blob=new Blob([vectors.smallText]);assert.equal((await c.hashFileStreaming(blob)).root,vectors.smallRoot);
 const same=new Blob([vectors.smallText]);assert.equal((await c.hashFileStreaming(same)).root,(await c.hashFileStreaming(blob)).root);
 assert.notEqual((await c.hashFileStreaming(new Blob(['trackes']))).root,vectors.smallRoot);}
});
test('chain root binds chunk dimensions and canonical locked ciphertext, including empty encrypted file',async()=>{
 const c=await hashing(),key=await c.importAesKey(new Uint8Array(32)),lock={id:'lk-test',ivSalt:btoa('123456789012345678901234')};
 for(const size of [0,5,524289]){const blob=new Blob([new Uint8Array(size)]),locked=await c.hashLockedFileStreamingMain(blob,key,lock);assert.equal(locked.total,Math.max(1,Math.ceil(size/524288)));assert.equal(locked.cipherSize,size+28*locked.total);assert.notEqual(locked.root,(await c.hashFileStreaming(blob)).root);assert.equal(locked.root,(await c.hashLockedFileStreamingMain(blob,key,lock)).root)}
 assert.notDeepEqual(await c.swarmInit(1,1,524288),await c.swarmInit(1,1,524289));
});
