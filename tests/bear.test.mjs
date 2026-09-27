import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
let passed=0; const worlds=[];
try {
 const {initPhysics,Physics}=await server.ssrLoadModule('/src/engine/physics.ts');
 const {Player}=await server.ssrLoadModule('/src/game/player.ts');
 const {BearLevel,resetBearStory}=await server.ssrLoadModule('/src/levels/bear/bearLevel.ts');
 const {CHASE_ROUTE,PATROL_ROUTE,pursuitSpeed,distanceToPath}=await server.ssrLoadModule('/src/levels/bear/chase.ts');
 const {LevelNumberEntry,CasinoSelector}=await server.ssrLoadModule('/src/levels/lobby/casinoSelector.ts');
 await initPhysics();
 function fixture(reset=true) {
  if(reset)resetBearStory();const physics=new Physics();worlds.push(physics);const player=new Player();player.attach(physics);
  const down=new Set(),pressed=new Set();let hint='';const input={isDown:c=>down.has(c),wasPressed:c=>pressed.has(c)};
  const ctx={physics,player,input,camera:{yaw:0,pitch:-0.2,pos:[0,2,6],target:[0,1,0],addShake(){}},hud:{setLevel(){},hint(s){hint=s;},show(){},hide(){},tips(){}}};
  const level=new BearLevel(ctx);
  const step=s=>{for(let t=0;t<s-1e-6;t+=1/120){const dt=1/120;if(player.mode==='control'&&!player.inPortal)player.update(dt,input,ctx.camera.yaw,level.obstacles(),ctx.camera.pitch);player.syncCollider();level.update(dt);player.tickPortal(dt);physics.step(dt);player.afterPhysics();pressed.clear();}};
  const place=p=>{player.reset(p);player.emerge([p[0],p[1]+0.95,p[2]],0,[0,0,0],0);player.gettingUp=false;player.stun=0;};
  step(5);place([0,0,5]);
  const choice=()=>{level.setPhase('chase');place([-60,0,-19]);step(.02);};
  return {...ctx,level,step,place,choice,pressed,down,get hint(){return hint;}};
 }
 function test(name,run){run();passed++;console.log('PASS '+name);}
 test('woodland approach triggers notice before chase',()=>{const f=fixture();f.place([3,0,-24]);f.step(.1);assert.equal(f.level.phase,'notice');f.step(1.3);assert.equal(f.level.phase,'chase');});
 test('ordinary man speaks and permits leaving alive',()=>{const f=fixture();f.choice();f.place([-66,0,-17]);f.pressed.add('KeyE');f.step(.1);assert.match(f.hint,/“/);f.place([-59,0,-19]);f.step(2);assert.equal(f.level.phase,'choice');assert.equal(f.player.mode,'control');});
 test('bear-room maul produces a physical ragdoll and delayed retry',()=>{const f=fixture();f.choice();f.place([-65,0,-29]);f.step(1.7);assert.equal(f.level.phase,'dead');assert.equal(f.player.mode,'ragdoll');assert.equal(f.level.restartRequested,false);f.step(4);assert.equal(f.level.restartRequested,true);});
 test('second attempt is cowboy; greeting does not shoot on entry',()=>{const f=fixture(false);assert.equal(f.level.stage,1);f.choice();f.place([-65,0,-17]);f.step(2);assert.equal(f.level.phase,'choice');assert.equal(f.level.gunTime,-1);assert.equal(f.level.greeted,true);f.place([-63.6,0,-17]);f.step(.4);assert.ok(f.level.gunTime>0);assert.equal(f.level.phase,'choice');f.step(.7);assert.equal(f.level.phase,'dead');assert.equal(f.player.mode,'ragdoll');});
 test('second-visit sign promises an even way bigger bear',()=>{const f=fixture();f.level.die(true);const second=fixture(false);second.place([-50,0,-23]);assert.equal(second.level.labels()[1].text.replace(/\s+/g,' '),'AN EVEN WAY BIGGER BEAR');second.level.die(true);});
 test('third visit tiny man runs to a non-winning tiny portal',()=>{const f=fixture(false);assert.equal(f.level.stage,2);f.choice();f.place([-66,0,-17]);f.pressed.add('KeyE');f.step(8);assert.equal(f.level.tinyOpen,true);assert.ok(f.level.manPos[2]>-12);f.place([-73,0,-11]);f.step(1);assert.equal(f.level.status,'playing');assert.equal(f.level.phase,'choice');});
 test('teddy hides a reachable real exit and winning resets story',()=>{const f=fixture(false);f.choice();assert.equal(f.level.bigger.teddy,true);f.place([-76.5,0,-29]);f.step(1);assert.equal(f.level.status,'exited');assert.equal(fixture(false).level.stage,0);});
 test('opening chase deaths do not skip story visits',()=>{const f=fixture();f.level.attacker=f.level.pursuer;f.level.die(false);assert.equal(fixture(false).level.stage,0);});
 test('both choice doors have open physical passages and divider is solid',()=>{const f=fixture();f.physics.step(.1);assert.equal(f.physics.raycast([-56,1,-19],[-1,0,0],3),null);assert.equal(f.physics.raycast([-56,1,-27],[-1,0,0],3),null);assert.ok(f.physics.raycast([-65,1,-20],[0,0,-1],5));assert.ok(f.physics.raycast([-56,1.7,-19],[-1,0,0],8));assert.ok(f.physics.raycast([-56,1.7,-27],[-1,0,0],8));});
 function walk(f,x,z,sprint=true) {
  f.down.add('KeyW');if(sprint)f.down.add('ShiftLeft');else f.down.delete('ShiftLeft');
  for(let i=0;i<1400;i++) {
   const dx=x-f.player.pos[0],dz=z-f.player.pos[2];if(Math.hypot(dx,dz)<0.45)break;
   assert.notEqual(f.level.phase,'dead',`caught at ${f.player.pos}; bear ${f.level.pursuer.pos}; index ${f.level.chaseIndex}`);
   f.camera.yaw=Math.atan2(-dx,-dz);f.step(1/120);
  }
  assert.ok(Math.hypot(x-f.player.pos[0],z-f.player.pos[2])<0.7,`blocked at ${f.player.pos}, target ${x},${z}`);
 }
 test('forest path requires entering the trees and the bear patrols before detection',()=>{
  const f=fixture();const start=[...f.level.pursuer.pos];f.step(3);assert.ok(Math.hypot(start[0]-f.level.pursuer.pos[0],start[2]-f.level.pursuer.pos[2])>1);
  f.place([0,0,5]);for(const [x,z] of [[-3.5,-4],[-3.5,-7],[0,-10],[0,-16],[3,-22],[3,-24]])walk(f,x,z,false);
  assert.ok(['notice','chase'].includes(f.level.phase));
 });
 test('long chase negotiates every turn and a continuous sprint reaches the doors alive',()=>{
  const f=fixture();f.place([3,0,-24]);f.step(.05);
  for(const target of CHASE_ROUTE.slice(1))walk(f,target[0],target[2]);
  walk(f,-56,-19);walk(f,-60,-19);f.down.clear();f.step(.1);
  assert.equal(f.level.phase,'choice');
 });
 test('stopping to read the final signs lets the bear catch and maul the player',()=>{
  const f=fixture();f.place([3,0,-24]);f.step(.05);
  for(const target of CHASE_ROUTE.slice(1,-1))walk(f,target[0],target[2]);walk(f,-28,-23);
  assert.equal(f.level.labels().length,2);f.down.clear();f.step(2);assert.equal(f.level.phase,'dead');
 });
 test('signs stay hidden before the last bend and pace alternates between gaining and dropping back',()=>{
  const f=fixture();f.place([-23,0,-35]);assert.equal(f.level.labels().length,0);f.place([-25,0,-23]);assert.equal(f.level.labels().length,2);
  const speeds=Array.from({length:60},(_,i)=>pursuitSpeed(6.8,i/10,true,false));assert.ok(Math.min(...speeds)<8.5);assert.ok(Math.max(...speeds)>8.5);assert.equal(pursuitSpeed(3,0,false,true),8.8);
 });
 test('final room can be walked around its entry screen and teddy to the real exit',()=>{
  let f=fixture();f.level.die(true);f=fixture(false);f.level.die(true);f=fixture(false);f.choice();f.place([-60,0,-27]);
  const walk=(x,z)=>{f.down.add('KeyW');for(let i=0;i<900;i++){const dx=x-f.player.pos[0],dz=z-f.player.pos[2];if(Math.hypot(dx,dz)<0.35||f.level.phase==='exit')break;f.camera.yaw=Math.atan2(-dx,-dz);f.step(1/120);}f.down.clear();assert.ok(f.level.phase==='exit'||Math.hypot(x-f.player.pos[0],z-f.player.pos[2])<0.6,JSON.stringify(f.player.pos));};
  walk(-60,-32);walk(-74,-32);walk(-76.5,-32);walk(-76.5,-29);f.step(1);assert.equal(f.level.status,'exited');
 });
 test('both reveals are occluded from a range of chase-hall angles',()=>{
  const f=fixture();f.physics.step(.1);
  for(const start of [[-12,1.7,-23],[-26,1.7,-19],[-26,1.7,-27],[-55,1.7,-23]])for(const target of [[-68,1.6,-17],[-69,2,-29]]){
   const delta=target.map((n,i)=>n-start[i]),distance=Math.hypot(...delta);const hit=f.physics.raycast(start,delta.map(n=>n/distance),distance-1);
   assert.ok(hit,`revealed from ${start} to ${target}`);
  }
 });
 test('room entry removes the chasing bear and opens only the return gap, leaving the junction connected',()=>{
  const f=fixture();f.physics.step(.02);assert.ok(f.physics.raycast([-44,1,-23],[0,-1,0],2));
  f.choice();f.physics.step(.02);assert.equal(f.level.pursuer.body.isEnabled(),false);assert.equal(f.level.returnGapOpen,true);
  assert.equal(f.physics.raycast([-44,1,-23],[0,-1,0],3),null);
  assert.ok(f.physics.raycast([-55.5,1,-23],[0,-1,0],2));
  assert.equal(f.physics.raycast([-55,2,-23],[1,0,0],10),null,'no shutter or invisible wall');
  f.place([-56,0,-19]);walk(f,-56,-27,false);assert.equal(f.level.phase,'choice');
  f.place([-44,-3.8,-23]);f.step(.05);assert.equal(f.level.phase,'dead');
 });
 test('sprinting away from the cowboy shows the draw then kills before the entry screen',()=>{
  const first=fixture();first.level.die(true);const f=fixture(false);f.choice();f.place([-66,0,-17]);f.step(.2);
  f.camera.yaw=-Math.PI/2;f.down.add('KeyW');f.down.add('ShiftLeft');f.step(.5);
  assert.ok(f.level.gunTime>0);assert.equal(f.level.phase,'choice');assert.ok(f.player.pos[0]<-64);
  f.step(1);assert.equal(f.level.phase,'dead');assert.equal(f.player.mode,'ragdoll');
 });
 test('entrance landmark changes each visit while the forest route stays walkable',()=>{
  let f=fixture();
  for(let stage=0;stage<3;stage++) {
   if(stage)f=fixture(false);
   assert.equal(f.level.stage,stage);f.physics.step(.02);
   assert.equal(!!f.physics.raycast([2,2,1.8],[0,-1,0],1.5),stage>0);
   if(stage>0){f.place([0,0,5]);for(const [x,z] of [[-5.2,4.5],[-5.2,-1]])walk(f,x,z,false);}
   if(stage===0)f.place([0,0,5]);for(const [x,z] of [[-3.5,-4],[-3.5,-7],[0,-10],[0,-16],[3,-22],[3,-24]])walk(f,x,z,false);
   if(stage===2){f.place([-50,0,-23]);assert.deepEqual(f.level.labels().map(l=>l.text.replace(/\s+/g,' ')),['A TINY MAN','A SUPER MEGA GIANT BEAR']);}
   f.level.die(true);
  }
 });
 test('second-run room bear is substantially larger and still mauls the player',()=>{
  const first=fixture();const size=first.level.bigger.size;first.level.die(true);
  const f=fixture(false);assert.ok(f.level.bigger.size>size*1.7);f.choice();f.place([-65,0,-29]);f.step(1.7);
  assert.equal(f.level.phase,'dead');assert.equal(f.player.mode,'ragdoll');
 });
 test('second-run bear door seals immediately and entrance camping or retreat always ends in a maul',()=>{
  for(const escape of ['wait','retreat','left','right','jump']) {
   const first=fixture();first.level.die(true);const f=fixture(false);f.choice();f.place([-58.8,0,-27]);f.step(.05);
   assert.equal(f.level.bearTrapped,true);assert.equal(f.level.bearDoor.isEnabled(),true);assert.equal(f.level.bearScreen.isEnabled(),false);
   assert.ok(f.physics.raycast([-59,1,-27],[1,0,0],2),'door must physically block retreat');
   if(escape!=='wait'){f.down.add('KeyW');f.down.add('ShiftLeft');f.camera.yaw=escape==='left'?0:escape==='right'?Math.PI:-Math.PI/2;}
   for(let i=0;i<480&&f.level.phase!=='dead';i++){if(escape==='jump')f.pressed.add('Space');f.step(1/120);}
   assert.equal(f.level.phase,'dead',escape+' must not evade the huge bear');assert.equal(f.player.mode,'ragdoll');
   assert.equal(fixture(false).level.stage,2);
  }
 });
 test('selector handles 100, backspace, zero and unavailable numbers',()=>{const a=new LevelNumberEntry(100);for(const n of [1,0,0])a.digit(n);assert.equal(a.confirm(),100);a.clear();a.digit(0);assert.equal(a.confirm(),null);a.digit(9);a.digit(9);a.digit(9);assert.equal(a.confirm(),null);a.digit(1);a.digit(2);a.backspace();assert.equal(a.confirm(),1);});
 test('lever animates, rejects launch during spin, then selects an existing level',()=>{const f=fixture();let chosen=0;const m=new CasinoSelector(f,5,1,n=>chosen=n);m.spin();m.confirm();assert.equal(chosen,0);for(let i=0;i<180;i++)m.update(1/60);assert.equal(m.spinTime,-1);assert.ok(m.entry.selected>=1&&m.entry.selected<=5);m.confirm();assert.equal(chosen,m.entry.selected);});
 console.log(`${passed} gameplay checks passed.`);
} finally {for(const w of worlds)w.dispose();await server.close();}

