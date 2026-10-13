/** @workorder WO-01 @requirement WO-01-R12
 * Executable facade examples. The caller supplies an authorized owned page and
 * a consenting global provider; no private invitation, source path or UI row is
 * inferred. Invocations use explicit targets and check every envelope/job.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export async function runExamples(page,{invitation,sourceSha256}){
 const invoke=async(name,args={})=>{const r=await page.evaluate(a=>TrackerAgent.invoke(a.name,a.args),{name,args});assert.equal(r.ok,true,name+': '+JSON.stringify(r.error));return r.result};
 const wait=async jobId=>{const deadline=Date.now()+180000;let job;do{job=await invoke('jobs.get',{jobId});if(['completed','failed','cancelled','input_required'].includes(job.state))break;await page.waitForTimeout(50)}while(Date.now()<deadline);assert.equal(job.state,'completed',JSON.stringify(job));return job.result};
 const credential=await page.evaluate(value=>TrackerAgent.importCredential(value),invitation);assert.equal(credential.ok,true);
 const {room}=await invoke('rooms.join',{invitationRef:credential.result.invitationRef});
 const source=await page.evaluate(room=>TrackerAgent.importSource(new File([Uint8Array.from({length:65537},(_,i)=>(i*31+7)%256)],'example.bin'),{room}),room);assert.equal(source.ok,true);
 const uploaded=await wait((await invoke('files.upload',{room,sourceRef:source.result.sourceRef,durability:'local'})).jobId),cid=uploaded.cid;
 const list=await invoke('files.list',{room,limit:20,fields:['entryId','cid','name','size']});assert.ok(list.items.some(x=>x.cid===cid));
 assert.equal((await wait((await invoke('sources.verify',{room,cid})).jobId)).verification,'complete');
 const download=await wait((await invoke('files.download',{room,cid})).jobId),range=await page.evaluate(async a=>Array.from(new Uint8Array((await TrackerAgent.readBytes(a.byteHandle,{room:a.room,offset:0,length:65537})).bytes)),{...download,room});
 assert.equal(createHash('sha256').update(Buffer.from(range)).digest('hex'),createHash('sha256').update(Uint8Array.from({length:65537},(_,i)=>(i*31+7)%256)).digest('hex'));
 assert.equal((await wait((await invoke('sources.relink',{room,cid,sourceRef:source.result.sourceRef})).jobId)).verification,'complete');
 const pin=await wait((await invoke('global.pin',{room,cid,target:1,days:7})).jobId);assert.equal(pin.targetAchieved,true);assert.equal(pin.metadataDurable,true);
 assert.equal((await invoke('global.release',{room,cid})).released,true);
 const raw=await invoke('system.source'),hash=createHash('sha256');for(let offset=0;offset<raw.size;offset+=524288){const chunk=await page.evaluate(async a=>Array.from(new Uint8Array((await TrackerAgent.readBytes(a.handle,{offset:a.offset,length:a.length})).bytes)),{handle:raw.byteHandle,offset,length:Math.min(524288,raw.size-offset)});hash.update(Buffer.from(chunk))}assert.equal(hash.digest('hex'),sourceSha256);
 await page.evaluate(({raw,download})=>{TrackerAgent.releaseBytes(raw.byteHandle);TrackerAgent.releaseBytes(download.byteHandle)},{raw,download});
 await invoke('sources.release',{sourceRef:source.result.sourceRef});await invoke('credentials.release',{credentialRef:credential.result.invitationRef});
 return ['joining','listing','uploading','downloading','verifying','pinning','releasing','relinking','raw-source'];
}
