/** Reproducible CPU-only media fixtures; no user videos, CUDA or containers. */
import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const directory=process.argv[2]||'/tmp/tracker-wo01-media';fs.mkdirSync(directory,{recursive:true});
const run=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});
run(['-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','180','-c:v','libx264','-preset','ultrafast','-b:v','1500k','-g','30','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart',path.join(directory,'fixture.mp4')]);
run(['-i',path.join(directory,'fixture.mp4'),'-c','copy',path.join(directory,'tail.mp4')]);
run(['-f','lavfi','-i','testsrc2=size=320x240:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','18','-c:v','mpeg4','-q:v','5','-c:a','libmp3lame',path.join(directory,'compat.avi')]);
for(const name of ['fixture.mp4','tail.mp4','compat.avi']){const bytes=fs.readFileSync(path.join(directory,name));console.log(JSON.stringify({name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}))}
