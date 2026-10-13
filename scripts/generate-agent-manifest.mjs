/** @workorder WO-02 @requirement WO-02-R05 @requirement WO-02-R09
 * Hermetic metadata build: evaluate only schema declarations/registrations and
 * public description functions in a VM with no DOM, room data, filesystem or
 * network binding. Handlers are declared, never invoked. Deployment still needs
 * only index.html; --check detects stale generated discovery/help after edits. */
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const file=process.argv.find(x=>x.endsWith('.html'))||'index.html',html=fs.readFileSync(file,'utf8'),check=process.argv.includes('--check');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,'Missing metadata build anchor '+start);return html.slice(a,b)}
const build=html.match(/const BUILD_ID='([^']+)'/)[1],context=vm.createContext({AbortController,BUILD_ID:build});
vm.runInContext(`const commandRegistry=new Map();const COMMAND_LIMITS={metadataBytes:65536,pageItems:100,inputDepth:32,handles:128,jobs:256,jobWorkers:2,interactiveWorkers:1,receipts:2048,byteRead:524288};function commandError(code,message){return Object.assign(Error(message),{code})}function commandCheck(ok,code,message){if(!ok)throw commandError(code,message)}` ,context);
vm.runInContext(section('const commandString=','/* @workorder WO-01 @requirement WO-01-R01 @requirement WO-01-R02'),context);
vm.runInContext(section('const commandResultNames=','/* @requirement WO-01-R09 Crypto finishes'),context);
vm.runInContext(section('const AGENT_SCHEMA_VERSION=','/* End WO-02 public surface foundation. */'),context);
vm.runInContext(section('const commandPageProperties=','/* @requirement WO-01-R03 Local approval'),context);
const discovery=vm.runInContext(`({protocol:'tracker-agent-v1',apiVersion:'1.0.0',schemaVersion:AGENT_SCHEMA_VERSION,buildId:BUILD_ID,revision:BUILD_ID,scope:'public-interface-only',facade:'window.TrackerAgent',runtimeInitialization:'Await ready; import capabilities explicitly; local trusted approval required for private operations.',capabilities:{commands:true,resources:true,events:true,externalMcp:false,nativeWebMcp:'feature-detected'},resourceTemplates:AGENT_RESOURCE_TEMPLATES,errors:AGENT_ERROR_CODES,instructionFormats:['markdown','json'],limits:COMMAND_LIMITS,tools:[...commandRegistry.values()].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).map(agentDescribeDescriptor),instructions:agentMarkdown()})`,context);
const json=JSON.stringify(discovery).replace(/</g,'\\u003c'),block='<script type="application/json" id="tracker-agent-discovery">'+json+'</script>',pattern=/<script type="application\/json" id="tracker-agent-discovery">[\s\S]*?<\/script>/;
if(check){assert.ok(pattern.test(html),'Public discovery block absent');assert.equal(html.match(pattern)[0],block,'Regenerate embedded agent discovery');console.log('PASS embedded public metadata matches',discovery.tools.length,'real commands')}else{const next=pattern.test(html)?html.replace(pattern,block):html.replace('</head>',block+'\n</head>');if(next!==html)fs.writeFileSync(file,next);console.log(next===html?'Public metadata already current for':'Generated public metadata for',discovery.tools.length,'commands,',Buffer.byteLength(json),'bytes')}
