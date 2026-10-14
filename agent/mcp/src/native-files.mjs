/** @workorder WO-03 @requirement WO-03-R04 @requirement WO-03-R07
 * @requirement WO-03-R09 Native IO never accepts an absolute RPC path. Resolve
 * the operator's root, open without following the final symlink, then check the
 * actual descriptor against roots/private files (including hardlink aliases).
 * Encrypted input blocks are immutable, independently authenticated, bounded
 * to one canonical chunk. A crash before the journal checkpoint permits only
 * an identical replay, not substitution of the accepted prefix.
 *
 * The adjacent owner-only master key protects other accounts, not the machine
 * owner. Original/native destination files are plaintext by explicit request.
 * No invocation executes programs, fetches caller URLs or reads arbitrary paths.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {createHash,createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {resolveRoot,within} from './config.mjs';
import {atomicFile} from './state.mjs';
import {check,AppError,LIMITS} from './errors.mjs';

export const CHUNK=LIMITS.byteRead;
export const digest=bytes=>createHash('sha256').update(bytes).digest();
export const initialRoot=size=>digest(Buffer.from(`robit-swarm-v2\0${size}\0${CHUNK}\0${Math.max(1,Math.ceil(size/CHUNK))}`));
export const stepRoot=(root,bytes)=>digest(Buffer.concat([root,digest(bytes)]));
export const chunkLength=(size,index)=>Math.max(0,Math.min(CHUNK,size-index*CHUNK));

/** Canonical dimensions come from the signed content, including locked files.
 * HTTP/Playwright block boundaries need not match canonical chunk boundaries.
 * Hash each chunk incrementally; even a large legacy chunk does not allocate
 * an equivalently large buffer. Empty content still contributes one chunk. */
export class CanonicalHasher{
 constructor(size,chunkSize,total){check(Number.isSafeInteger(size)&&size>=0&&Number.isSafeInteger(chunkSize)&&chunkSize>0&&total===Math.max(1,Math.ceil(size/chunkSize)),'CONTENT_INTEGRITY','Invalid signed canonical dimensions');this.size=size;this.chunkSize=chunkSize;this.total=total;this.bytes=0;this.chunkBytes=0;this.chunks=0;this.chunk=createHash('sha256');this.root=digest(Buffer.from(`robit-swarm-v2\0${size}\0${chunkSize}\0${total}`))}
 update(bytes){check(this.bytes+bytes.length<=this.size,'CONTENT_INTEGRITY','Canonical bytes exceed signed dimensions');let offset=0;while(offset<bytes.length){const length=Math.min(bytes.length-offset,this.chunkSize-this.chunkBytes);this.chunk.update(bytes.subarray(offset,offset+length));offset+=length;this.chunkBytes+=length;this.bytes+=length;if(this.chunkBytes===this.chunkSize)this.finishChunk()}}
 finishChunk(){this.root=digest(Buffer.concat([this.root,this.chunk.digest()]));this.chunks++;this.chunk=createHash('sha256');this.chunkBytes=0}
 finish(){check(this.bytes===this.size,'CONTENT_INTEGRITY','Canonical bytes are incomplete');if(this.chunkBytes||!this.chunks)this.finishChunk();check(this.chunks===this.total,'CONTENT_INTEGRITY','Canonical chunk count differs');return this.root.toString('hex')}
}

export async function assertNativeFd(config,root,handle){
 const actual=await fs.realpath('/proc/self/fd/'+handle.fd),stat=await handle.stat();
 check(within(root.path,actual)&&!within(path.resolve(config.stateDir),actual)&&!config.sensitivePaths.has(actual)&&!config.protectedDirectories.some(value=>within(value,actual))&&!config.sensitiveInodes.has(stat.dev+':'+stat.ino),'PERMISSION_DENIED','Native descriptor crossed an approved root or private service boundary');
 return{actual,stat};
}
export async function openApprovedInput(config,principal,rootId,relative){
 const resolved=await resolveRoot(config,principal,rootId,relative),handle=await fs.open(resolved.path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const{stat}=await assertNativeFd(config,resolved.root,handle);check(stat.isFile()&&Number.isSafeInteger(stat.size),'INVALID_ARGUMENT','Native source must be a regular file');return{handle,stat,resolved}}catch(error){await handle.close();throw error}
}
export async function readBlock(handle,size,index){const bytes=Buffer.alloc(chunkLength(size,index));let at=0;while(at<bytes.length){const read=await handle.read(bytes,at,bytes.length-at,index*CHUNK+at);check(read.bytesRead>0,'SOURCE_UNAVAILABLE','Native source changed or ended during verification');at+=read.bytesRead}return bytes}
export async function openApprovedDirectory(config,principal,rootId,relative){
 const resolved=await resolveRoot(config,principal,rootId,relative,{write:true}),handle=await fs.open(resolved.parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{await assertNativeFd(config,resolved.root,handle);return{...resolved,handle,target:'/proc/self/fd/'+handle.fd+'/'+path.basename(resolved.path)}}catch(error){await handle.close();throw error}
}
export async function hashNative(handle,size){const sha=createHash('sha256');for(let i=0;i<Math.max(1,Math.ceil(size/CHUNK));i++)sha.update(await readBlock(handle,size,i));return sha.digest('hex')}

export class InputCache{
 constructor(journal){this.journal=journal;this.directory=path.join(journal.directory,'inputs-v1')}
 async initialize(){await fs.mkdir(this.directory,{recursive:true,mode:0o700})}
 filename(input,index){check(/^input-[0-9a-f-]{36}$/.test(input.id)&&Number.isSafeInteger(index)&&index>=0&&index<Math.max(1,Math.ceil(input.size/CHUNK)),'STORE_CORRUPT','Invalid native input block locator');return path.join(this.directory,input.id,String(index))}
 key(input){return Buffer.from(hkdfSync('sha256',this.journal.key,Buffer.from(input.salt,'hex'),Buffer.from('tracker-native-input-v1|'+input.principal+'|'+input.id),32))}
 aad(input,index){return Buffer.from('tracker-native-input-v1|'+input.principal+'|'+input.id+'|'+input.size+'|'+index)}
 async read(input,index){let bytes;try{const file=this.filename(input,index),stat=await fs.stat(file);check(stat.isFile()&&stat.size<=CHUNK+28&&!(stat.mode&0o077),'STORE_CORRUPT','Invalid encrypted native block');bytes=await fs.readFile(file);check(bytes.length===chunkLength(input.size,index)+28,'STORE_CORRUPT','Native input block has wrong dimensions');const key=this.key(input);try{const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(this.aad(input,index));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()])}finally{key.fill(0)}}catch(error){if(error instanceof AppError)throw error;throw new AppError('STORE_CORRUPT','Encrypted native input block is missing or unauthenticated')}}
 async put(input,index,bytes){check(bytes instanceof Uint8Array&&bytes.length===chunkLength(input.size,index),'INVALID_ARGUMENT','One complete bounded source block is required');const file=this.filename(input,index);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});try{await fs.access(file);check(digest(await this.read(input,index)).equals(digest(bytes)),'CONTENT_INTEGRITY','Retried input block differs from the accepted prefix');return}catch(error){if(error.code!=='ENOENT')throw error}const key=this.key(input),nonce=randomBytes(12);try{const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(this.aad(input,index));const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);await atomicFile(file,Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]),()=>this.journal.assertOwner())}finally{key.fill(0)}}
 async remove(input){await this.journal.assertOwner();await fs.rm(path.dirname(this.filename(input,0)),{recursive:true,force:true});const directory=await fs.open(this.directory,'r');try{await directory.sync()}finally{await directory.close()}}
}
