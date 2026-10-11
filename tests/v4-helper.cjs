const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto:crypto}=require('node:crypto');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function source(name){const start=html.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1);const next=html.slice(start+1).search(/^(?:async )?function /m);return html.slice(start,next<0?undefined:start+next+1)}
async function fixture(actor='actor-a'){
 const c=vm.createContext({crypto,Uint8Array,TextEncoder,enc:new TextEncoder(),btoa,atob,Date,actor,roomHash:'a'.repeat(64),nodeIdentity:null,ownerAnchor:'',roomPolicy:null,
  actorKeys:new Map(),verifiedPublicKeys:new Map(),authenticatedReplay:new Map(),securityPinsWrite:Promise.resolve(),putKV:async()=>{}});
 for(const name of ['randomBytes','bytesToB64','b64ToBytes','bytesToHex','concatBytes','sha256Bytes','sha256Hex','nodeIdFor','validateNodeIdentity'])vm.runInContext(source(name),c);
 vm.runInContext(html.slice(html.indexOf('function canonicalStringV4('),html.indexOf('/* End V4 authentication. */')),c);
 const keys=await crypto.subtle.generateKey('Ed25519',false,['sign','verify']),raw=new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey));
 c.nodeIdentity={version:1,algorithm:'Ed25519',privateKey:keys.privateKey,publicKeyRaw:raw,nodeId:await c.nodeIdFor(raw),createdAt:Date.now()};return c;
}
module.exports={fixture,source,html};
