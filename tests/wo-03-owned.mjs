/** Only a still-running direct child of THIS harness is eligible for teardown.
 * Never enumerate/terminate unrelated browsers, CDP sessions or older soaks. */
import {execFileSync} from 'node:child_process';
export function killOwned(child){if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return;const rows=execFileSync('ps',['-eo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number)),pids=new Set(rows.some(([pid,parent])=>pid===child.pid&&parent===process.pid)?[child.pid]:[]);let added=true;while(added){added=false;for(const[pid,parent]of rows)if(pids.has(parent)&&!pids.has(pid)){pids.add(pid);added=true}}for(const pid of [...pids].reverse())try{process.kill(pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}}
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function stopOwned(child){if(!child)return;if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await Promise.race([child.finished,delay(10000)]);killOwned(child)}await child.finished}
