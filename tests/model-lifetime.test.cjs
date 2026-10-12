const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {source}=require('./v4-helper.cjs');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
function fixture(){
 const counts={renderers:0,rendererDisposed:0,contextReleased:0,controlsDisposed:0,observed:0,disconnected:0,geometryDisposed:0,materialDisposed:0,textureDisposed:0,errors:0,removedCanvas:0},stage={innerHTML:'',isConnected:true,children:[],replaceChildren(...nodes){this.children=nodes},getBoundingClientRect:()=>({width:640,height:480}),querySelector(){return this.children[0]}},p={lifecycleClosed:false};
 const texture={isTexture:true,dispose(){counts.textureDisposed++}},geometry={dispose(){counts.geometryDisposed++}},material={map:texture,dispose(){counts.materialDisposed++}},object={geometry,material,traverse(fn){fn(this);fn({geometry,material})}},model=deferred(),first=deferred();
 const THREE={WebGLRenderer:class{constructor({canvas}){counts.renderers++;this.domElement=canvas}setPixelRatio(){}setSize(){}render(){}dispose(){counts.rendererDisposed++}forceContextLoss(){counts.contextReleased++}},Scene:class{constructor(){this.children=[]}add(x){this.children.push(x)}traverse(fn){fn(this);for(const x of this.children)x.traverse?.(fn)}},PerspectiveCamera:class{constructor(){this.position={set(){}}}updateProjectionMatrix(){}},HemisphereLight:class{},DirectionalLight:class{constructor(){this.position={set(){}}}},Box3:class{setFromObject(){return this}getSize(){return{x:1,y:1,z:1}}getCenter(){return{x:0,y:0,z:0}}},Vector3:class{}};
 const OrbitControls=class{constructor(){this.target={copy(){}}}update(){}addEventListener(){}removeEventListener(){}dispose(){counts.controlsDisposed++}};
 const c=vm.createContext({activePreview:p,window:{ResizeObserver:true},ResizeObserver:class{observe(){counts.observed++}disconnect(){counts.disconnected++}},$:()=>stage,extOf:()=> 'obj',esc:x=>x,devicePixelRatio:1,document:{createElement:()=>({remove(){counts.removedCanvas++}})},URL:{createObjectURL:()=> 'blob:model',revokeObjectURL(){}},showPreviewError:()=>counts.errors++,__import:async url=>url.includes('controls')?{OrbitControls}:url.includes('loaders')?{OBJLoader:class{load(_url,resolve,_progress,reject){model.promise.then(resolve,reject)}}}:first.promise});
 vm.runInContext(source('render3DModel').replace(/import\(([^)]+)\)/g,'__import($1)'),c);
 return{c,p,stage,counts,object,first,model,THREE};
}
async function flush(){await new Promise(r=>setImmediate(r))}
test('closing during 3D imports cannot create a renderer or overwrite the replacement preview',async()=>{
 const f=fixture(),job=f.c.render3DModel({},'model.obj');f.p.lifecycleClosed=true;f.p.threeCleanup?.();const next={};f.c.activePreview=next;f.stage.innerHTML='replacement';f.first.resolve(f.THREE);await flush();f.model.resolve(f.object);await job;
 assert.equal(f.counts.renderers,0);assert.equal(f.stage.innerHTML,'replacement');assert.equal(next.threeCleanup,undefined);
});
test('closing during model loading releases partial graphics and disposes a late loaded object',async()=>{
 const f=fixture();f.first.resolve(f.THREE);const job=f.c.render3DModel({},'model.obj');await flush();assert.equal(f.counts.renderers,1);f.p.lifecycleClosed=true;f.p.threeCleanup?.();f.c.activePreview={};f.model.resolve(f.object);await job;
 assert.equal(f.counts.rendererDisposed,1);assert.equal(f.counts.contextReleased,1);assert.equal(f.counts.controlsDisposed,1);assert.equal(f.counts.observed,0);assert.equal(f.counts.geometryDisposed,1);assert.equal(f.counts.textureDisposed,1);assert.equal(f.counts.materialDisposed,1);assert.equal(f.c.activePreview.threeCleanup,undefined);
});
test('a delayed failed model load cannot display an error over another preview',async()=>{
 const f=fixture();f.first.resolve(f.THREE);const job=f.c.render3DModel({},'model.obj');await flush();f.p.lifecycleClosed=true;f.p.threeCleanup?.();f.c.activePreview={};f.model.reject(Error('late model network failure'));await job;
 assert.equal(f.counts.errors,0);assert.equal(f.counts.rendererDisposed,1);
});
test('closing a completed 3D preview releases textures, shared geometry, observers and its WebGL context once',async()=>{
 const f=fixture();f.first.resolve(f.THREE);f.model.resolve(f.object);await f.c.render3DModel({},'model.obj');assert.equal(f.counts.observed,1);const dispose=f.p.threeCleanup;dispose();dispose();
 assert.equal(f.counts.disconnected,1);assert.equal(f.counts.rendererDisposed,1);assert.equal(f.counts.contextReleased,1);assert.equal(f.counts.controlsDisposed,1);assert.equal(f.counts.geometryDisposed,1);assert.equal(f.counts.textureDisposed,1);assert.equal(f.counts.materialDisposed,1);
});
