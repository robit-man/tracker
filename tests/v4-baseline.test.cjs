const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto:crypto}=require('node:crypto');
const vectors=require('./fixtures/legacy-vectors.json');
const enc=new TextEncoder();
test('legacy room derivation and AES round trip retain the deployed parameters',async()=>{
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',enc.encode('private-tracker-room|'+vectors.secret))).toString('hex');
 assert.equal(hash,vectors.roomHash);
 const base=await crypto.subtle.importKey('raw',enc.encode(vectors.secret),'PBKDF2',false,['deriveKey']);
 const derive=()=>crypto.subtle.deriveKey({name:'PBKDF2',salt:enc.encode('private-tracker-v2|'+hash),iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const iv=new Uint8Array(12),aad=enc.encode('ctl'),plain=enc.encode('legacy round trip');
 const packet=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await derive(),plain);
 assert.deepEqual(new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},await derive(),packet)),plain);
});
