const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const code=html.slice(html.indexOf('function parseFileRoot('),html.indexOf('async function initSecret('));
const c=vm.createContext({URL,location:{href:'https://robit-man.github.io/tracker/?keep=1#old'}});vm.runInContext(code,c);
const secret='Ab0123456789'.repeat(4),root='ABCDEF01'.repeat(8);
test('room and encoded custom fragments preserve exact legacy secrets',()=>{
 for(const s of [secret,'custom room','#custom/Unicode 日本'])assert.equal(c.parseTrackerFragment('#'+encodeURIComponent(s)).secret,s);
 assert.equal(c.parseTrackerFragment('').secret,null);
});
test('file fragment splits the secret before derivation and normalizes only the root',()=>{
 for(const fragment of ['#'+secret+'/f/'+root,'#'+encodeURIComponent(secret+'/f/'+root)]){
  const p=c.parseTrackerFragment(fragment);assert.equal(p.secret,secret);assert.equal(p.resource.cid,'f-'+root.toLowerCase());
 }
});
test('malformed reserved locators cannot turn into another room',()=>{
 for(const suffix of ['/f/','/f/'+root+'/extra','/f/'+root+'?x=1','/f/'+root+'#x','/f/%GG','/f/../'+root,'/f/'+root.slice(1),'/f']){
  assert.throws(()=>c.parseTrackerFragment('#'+secret+suffix),e=>e.message.startsWith('Invalid file link')&&e.secret===secret);
 }
 assert.throws(()=>c.parseTrackerFragment('#bad%'),/malformed URL encoding/);
 assert.throws(()=>c.parseTrackerFragment('#custom/f/'+root),/Invalid file link/);
 assert.equal(c.parseTrackerFragment('#'+secret+'/unknown').secret,secret+'/unknown');
});
test('canonical builders preserve deployment path and strip a previous file locator',()=>{
 const base='https://robit-man.github.io/tracker/#'+secret+'/f/'+root;
 assert.equal(c.buildRoomUrl(secret,base),'https://robit-man.github.io/tracker/#'+secret);
 assert.equal(c.buildFileUrl(secret,root,base),'https://robit-man.github.io/tracker/#'+secret+'/f/'+root.toLowerCase());
 assert.throws(()=>c.buildFileUrl(secret,'filename/#日本',base),/Invalid file link/);
});
test('protected room and file builders preserve owner independently of the room derivation input',()=>{
 const owner='n-'+ 'a'.repeat(64),base='https://robit-man.github.io/tracker/';
 for(const url of [c.buildRoomUrl(secret,base,owner),c.buildFileUrl(secret,root,base,owner)]){const p=c.parseTrackerFragment(new URL(url).hash);assert.equal(p.secret,secret);assert.equal(p.owner,owner)}
 assert.equal(c.parseTrackerFragment('#'+secret+'/a/'+owner+'/f/'+root).resource.cid,'f-'+root.toLowerCase());assert.throws(()=>c.parseTrackerFragment('#'+secret+'/a/rogue/f/'+root),/Invalid file link/);
});
