/** @workorder WO-03 @requirement WO-03-R11 @requirement WO-03-R12
 * Reproducible source identity covers the native executable and dependency lock,
 * independently of the HTML build label. A long observation records this digest
 * at both ends and fails if its source changes during the observation. */
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function sourceIdentity(){const names=['package.json','package-lock.json'];for(const directory of ['src','bin'])for(const name of await fs.readdir(path.join(root,directory)))if(name.endsWith('.mjs'))names.push(directory+'/'+name);names.sort();const files=[];for(const name of names)files.push({path:name,sha256:hash(await fs.readFile(path.join(root,name)))});return{schema:1,companionSha256:hash(Buffer.from(JSON.stringify(files))),files}}
