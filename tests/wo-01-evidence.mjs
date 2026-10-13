/** Store exact static test inputs without publishing invitations or user data. */
import fs from 'node:fs';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
export function saveSource(html){const digest=createHash('sha256').update(html).digest('hex'),file=`artifacts/wo-01/source-${digest}.html.gz`;fs.mkdirSync('artifacts/wo-01',{recursive:true});if(!fs.existsSync(file))fs.writeFileSync(file,gzipSync(html,{level:9}));return file}
export function redact(value){if(typeof value==='string')return value.replace(/#(?:[0-9a-f]{48})(?![0-9a-f])/gi,'#[redacted]');if(Array.isArray(value))return value.map(redact);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redact(item)]));return value}

/** Close only harness-owned contexts, then capture teardown errors before the
 * verdict. A late unhandled rejection must never hide behind a passing JSON. */
export async function finishEvidence(result,file,contexts,browser){
 const cleanup=await Promise.allSettled(contexts.map(c=>c.close()));
 const closed=await Promise.allSettled([browser.close()]);
 for(const item of [...cleanup,...closed])if(item.status==='rejected')(result.errors??=[]).push('Harness teardown: '+item.reason.message);
 result.ended=new Date().toISOString();
 if(result.errors?.length){result.passed=false;result.failure??='Unhandled browser/teardown errors';}
 fs.mkdirSync(file.slice(0,file.lastIndexOf('/'))||'.',{recursive:true});
 fs.writeFileSync(file,JSON.stringify(redact(result),null,2));
 if(result.errors?.length)throw Error('Unhandled browser/teardown errors: '+JSON.stringify(redact(result.errors)));
}
