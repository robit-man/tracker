/** Static action coverage, distinct from the browser parity/permission tests. */
import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8'),matrix=JSON.parse(fs.readFileSync('artifacts/wo-01/action-parity.json')),known=new Set(matrix.actions.flatMap(a=>a.selectors)),uncovered=[];
for(const match of html.matchAll(/<button\b([^>]*)>/g)){const attrs=match[1],id=attrs.match(/\bid="([^"]+)"/),selectors=/class="mini sourceRecovery active" disabled/.test(attrs)?['status:source-verification']:id?['#'+id[1]]:[...attrs.matchAll(/\b(data-[a-z-]+)(?:=|\s|$)/g)].map(m=>'['+m[1]+']');if(!selectors.some(s=>known.has(s)))uncovered.push(selectors)}
assert.deepEqual(uncovered,[]);for(const action of matrix.actions){assert.ok(action.adapter);assert.ok(action.kind);for(const selector of action.selectors)if(selector.startsWith('[data-'))assert.ok(html.includes(selector.slice(1,-1)),selector+' disappeared; update inventory')}
assert.deepEqual(matrix.unclassifiedStaticButtons,[]);console.log('PASS full static/delegated action inventory:',matrix.staticButtons,'buttons,',matrix.actions.length,'action groups');
