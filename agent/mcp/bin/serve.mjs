#!/usr/bin/env node
/** @workorder WO-03 @requirement WO-03-R01 @requirement WO-03-R06
 * User-operated entrypoint. Config/credential paths are local argv; secrets are
 * read from owner-only files, never GET queries or stdout. stdout in stdio mode
 * contains protocol frames only. Optional dependency diagnostics stay on stderr.
 * No existing browser/CDP port is accessed. Native ownership survives exec and
 * ends with this process, so a replacement coordinator cannot race its journal.
 */
import path from 'node:path';import {fileURLToPath} from 'node:url';
// Inherited Playwright debug logging can print fragment-bearing navigation URLs.
// Disable only this service process's debugging hooks before importing its SDKs.
delete process.env.DEBUG;delete process.env.PWDEBUG;
const {readConfig}=await import('../src/config.mjs'),{ensureOwner,Journal}=await import('../src/state.mjs'),{OwnedRuntime}=await import('../src/runtime.mjs'),{NativeIO}=await import('../src/io.mjs'),{Tasks}=await import('../src/tasks.mjs'),{Toolkit}=await import('../src/toolkit.mjs'),{ModernAdapter}=await import('../src/modern.mjs'),{stdioTransport,httpTransport}=await import('../src/transports.mjs'),{safeError,check,debug}=await import('../src/errors.mjs'),{LEGACY,MODERN}=await import('../src/codec.mjs');
let runtime,journal,http,stdio,io,tasks,stopping=false;
async function shutdown(code=0){if(stopping)return;stopping=true;process.exitCode=code;await Promise.allSettled([stdio?.close(),http?.close()]);await tasks?.close();await io?.close();await runtime?.close();await journal?.close();}
// stdin can drain during awaited transport construction. Defer its shutdown
// callback until the owned transport is assigned, then close it exactly once.
try{const args=process.argv.slice(2),options={transport:'stdio',protocol:LEGACY};for(let index=0;index<args.length;index+=2){const key=args[index],value=args[index+1];check(['--config','--transport','--protocol'].includes(key)&&typeof value==='string','INVALID_ARGUMENT','Use --config FILE --transport stdio|http --protocol VERSION');options[key.slice(2)]=value}check(options.config&&['stdio','http'].includes(options.transport)&&[LEGACY,MODERN].includes(options.protocol),'INVALID_ARGUMENT','Explicit private configuration and supported transport are required');const config=await readConfig(path.resolve(options.config));await ensureOwner(config,fileURLToPath(import.meta.url),['--config',config.configPath,'--transport',options.transport,'--protocol',options.protocol]);journal=await Journal.open(config);runtime=new OwnedRuntime(config,journal);await runtime.initialize();io=new NativeIO(runtime,journal);await io.initialize();const toolkit=new Toolkit(runtime,io),modern=new ModernAdapter(toolkit);tasks=new Tasks(toolkit,journal);toolkit.tasks=tasks;await tasks.initialize();http=await httpTransport(config,toolkit,modern,io);debug('http-ready',{port:http.port,sourceSha256:config.sourceSha256});if(options.transport==='stdio'){let connected=false,endedEarly=false;stdio=await stdioTransport(config,toolkit,modern,{version:options.protocol,onEnd:()=>{if(!connected){endedEarly=true;return}shutdown().catch(()=>{process.exitCode=1})}});connected=true;if(endedEarly)await shutdown();}process.once('SIGTERM',()=>{shutdown().catch(()=>{process.exitCode=1})});process.once('SIGINT',()=>{shutdown().catch(()=>{process.exitCode=1})});process.on('unhandledRejection',()=>{debug('fatal-unhandled',{code:'INTERNAL'});shutdown(1).catch(()=>{process.exitCode=1})});process.on('uncaughtException',()=>{debug('fatal-uncaught',{code:'INTERNAL'});shutdown(1).catch(()=>{process.exitCode=1})});}
catch(error){process.stderr.write(JSON.stringify(safeError(error))+'\n');await shutdown(1)}
