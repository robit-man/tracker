/** @workorder WO-03 @requirement WO-03-R03 @requirement WO-03-R05
 * Explicit modern adapter, deliberately separate from v1 SDK session state.
 * Identity stamps use result _meta per the final 2026-07-28 schema. Each request
 * carries its capabilities and authenticated principal; no initialized session
 * or prior clientInfo is consulted. A native input continuation is opaque and
 * principal-bound; a retried request must preserve its tool/arguments identity.
 */
import {randomBytes,createHash} from 'node:crypto';import {modernContext,modernResult,ProtocolFault,MODERN,VERSIONS} from './codec.mjs';import {SERVER_INFO,INSTRUCTIONS,capabilities} from './sdk-server.mjs';import {closed,check,envelope} from './errors.mjs';import {toolResult} from './toolkit.mjs';import {permits} from './config.mjs';
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class ModernAdapter{
 constructor(toolkit){this.toolkit=toolkit;this.continuations=new Map()}
 async dispatch(principal,message,headers=null,control={}){const context={...modernContext(message,headers),signal:control.signal},params=message.params;let result;switch(message.method){
  case 'server/discover':closed(params,['_meta']);result={supportedVersions:VERSIONS,capabilities:capabilities(this.toolkit,principal),instructions:INSTRUCTIONS};break;
  case 'tools/list':result=this.toolkit.listTools(principal,params);break;
  case 'tools/call':{
   if(params.requestState){const binding=this.continuations.get(params.requestState);check(binding&&binding.principal===principal.id&&binding.fingerprint===fingerprint({name:params.name,arguments:params.arguments||{}}),'PERMISSION_DENIED','Continuation is not bound to this request/principal');this.toolkit.runtime.bound(principal,binding.room);check(this.toolkit.descriptors(principal).some(tool=>tool.name===params.name),'PERMISSION_DENIED','Original command scope changed');
    // inputResponses cannot approve OS consent. Poll the real interaction;
    // reissuing live.start here would accumulate new capture requests.
    result=binding.reply;if(binding.interactionId&&permits(principal,'interactions.get')){const state=await this.toolkit.runtime.invoke(principal,'interactions.get',{room:binding.room,interactionId:binding.interactionId});if(!state.ok){result=toolResult(state);this.continuations.delete(params.requestState)}else if(state.result.value.jobId){const job=await this.toolkit.runtime.invoke(principal,'jobs.get',{room:binding.room,jobId:state.result.value.jobId});if(job.ok){result=toolResult(envelope({jobId:job.result.jobId,state:job.result.state,revision:job.result.revision}));this.continuations.delete(params.requestState)}}}if(result===binding.reply)result={...result,resultType:'input_required',requestState:params.requestState};break;
   }
   if(params.task)check(context.clientCapabilities.experimental?.['io.github.robit-man.tracker/mcp-tasks']?.version===1,'UNSUPPORTED','Explicit MCP task profile negotiation is required');result=await this.toolkit.call(principal,params,context);
   if(result.structuredContent?.error?.code==='USER_INTERACTION_REQUIRED'){const requestState=randomBytes(24).toString('hex');this.continuations.set(requestState,{principal:principal.id,room:this.toolkit.runtime.bound(principal,params.arguments?.room).id,interactionId:result.structuredContent.error.details?.interactionId||null,reply:result,fingerprint:fingerprint({name:params.name,arguments:params.arguments||{}})});while(this.continuations.size>128)this.continuations.delete(this.continuations.keys().next().value);result={...result,resultType:'input_required',requestState}}else if(result.task)result={...result,resultType:'task'};break;
  }
  case 'resources/list':result=await this.toolkit.listResources(principal,params);break;
  case 'resources/templates/list':result=this.toolkit.resourceTemplates(principal,params);break;
  case 'resources/read':result=await this.toolkit.readResource(principal,params);break;
  case 'prompts/list':result=this.toolkit.listPrompts(principal,params);break;
  case 'prompts/get':result=await this.toolkit.getPrompt(principal,params);break;
  case 'tasks/get':case 'tasks/result':case 'tasks/list':case 'tasks/cancel':{check(context.clientCapabilities.experimental?.['io.github.robit-man.tracker/mcp-tasks']?.version===1,'UNSUPPORTED','Explicit MCP task profile negotiation is required');check(this.toolkit.tasks,'UNSUPPORTED','MCP task profile is unavailable');const method=message.method.slice(6);result=await this.toolkit.tasks[method](principal,params);break;}
  case 'ping':closed(params,['_meta']);result={};break;
  default:throw new ProtocolFault(-32601,'Unknown or unavailable method');
 }return modernResult(result,SERVER_INFO)}
}
