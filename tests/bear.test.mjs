import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
let passed=0; const worlds=[];
try {
 const {initPhysics,Physics}=await server.ssrLoadModule('/src/engine/physics.ts');
 const {Player}=await server.ssrLoadModule('/src/game/player.ts');
 const {BearLevel,resetBearStory}=await server.ssrLoadModule('/src/levels/bear/bearLevel.ts');
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
  const choice=()=>{level.setPhase('chase');place([-40,0,-19]);step(.02);};
  return {...ctx,level,step,place,choice,pressed,down,get hint(){return hint;}};
 }
 function test(name,run){run();passed++;console.log('PASS '+name);}
 test('woodland approach triggers notice before chase',()=>{const f=fixture();f.place([-3,0,-18]);f.step(.1);assert.equal(f.level.phase,'notice');f.step(1.3);assert.equal(f.level.phase,'chase');});
 test('ordinary man speaks and permits leaving alive',()=>{const f=fixture();f.choice();f.place([-46,0,-17]);f.pressed.add('KeyE');f.step(.1);assert.match(f.hint,/“/);f.place([-39,0,-19]);f.step(2);assert.equal(f.level.phase,'choice');assert.equal(f.player.mode,'control');});
 test('bear-room maul produces a physical ragdoll and delayed retry',()=>{const f=fixture();f.choice();f.place([-45,0,-29]);f.step(1.7);assert.equal(f.level.phase,'dead');assert.equal(f.player.mode,'ragdoll');assert.equal(f.level.restartRequested,false);f.step(4);assert.equal(f.level.restartRequested,true);});
 test('second attempt is cowboy; greeting does not shoot on entry',()=>{const f=fixture(false);assert.equal(f.level.stage,1);f.choice();f.place([-45,0,-17]);f.step(2);assert.equal(f.level.phase,'choice');assert.equal(f.level.gunTime,-1);assert.equal(f.level.greeted,true);f.place([-43.6,0,-17]);f.step(1);assert.equal(f.level.phase,'dead');assert.equal(f.player.mode,'ragdoll');});
 test('third visit tiny man runs to a non-winning tiny portal',()=>{const f=fixture(false);assert.equal(f.level.stage,2);f.choice();f.place([-46,0,-17]);f.pressed.add('KeyE');f.step(8);assert.equal(f.level.tinyOpen,true);assert.ok(f.level.manPos[2]>-12);f.place([-53,0,-11]);f.step(1);assert.equal(f.level.status,'playing');assert.equal(f.level.phase,'choice');});
 test('teddy hides a reachable real exit and winning resets story',()=>{const f=fixture(false);f.choice();assert.equal(f.level.bigger.teddy,true);f.place([-56.5,0,-29]);f.step(1);assert.equal(f.level.status,'exited');assert.equal(fixture(false).level.stage,0);});
 test('opening chase deaths do not skip story visits',()=>{const f=fixture();f.level.attacker=f.level.pursuer;f.level.die(false);assert.equal(fixture(false).level.stage,0);});
 test('both choice doors have open physical passages and divider is solid',()=>{const f=fixture();f.physics.step(.1);assert.equal(f.physics.raycast([-36,1,-19],[-1,0,0],3),null);assert.equal(f.physics.raycast([-36,1,-27],[-1,0,0],3),null);assert.ok(f.physics.raycast([-45,1,-20],[0,0,-1],5));assert.ok(f.physics.raycast([-36,1.7,-19],[-1,0,0],8));assert.ok(f.physics.raycast([-36,1.7,-27],[-1,0,0],8));});
 test('left hallway route can be run using actual character movement',()=>{const f=fixture();f.place([-3,0,-15]);f.down.add('ShiftLeft');f.down.add('KeyW');f.step(1.25);f.camera.yaw=Math.PI/2;f.step(4.35);f.down.clear();assert.ok(f.player.pos[0]<-35,JSON.stringify(f.player.pos));assert.notEqual(f.level.phase,'dead');});
 test('final room can be walked around its entry screen and teddy to the real exit',()=>{
  let f=fixture();f.level.die(true);f=fixture(false);f.level.die(true);f=fixture(false);f.choice();f.place([-40,0,-27]);
  const walk=(x,z)=>{f.down.add('KeyW');for(let i=0;i<900;i++){const dx=x-f.player.pos[0],dz=z-f.player.pos[2];if(Math.hypot(dx,dz)<0.35||f.level.phase==='exit')break;f.camera.yaw=Math.atan2(-dx,-dz);f.step(1/120);}f.down.clear();assert.ok(f.level.phase==='exit'||Math.hypot(x-f.player.pos[0],z-f.player.pos[2])<0.6,JSON.stringify(f.player.pos));};
  walk(-40,-32);walk(-54,-32);walk(-56.5,-32);walk(-56.5,-29);f.step(1);assert.equal(f.level.status,'exited');
 });
 test('both reveals are occluded from a range of chase-hall angles',()=>{
  const f=fixture();f.physics.step(.1);
  for(const start of [[-12,1.7,-23],[-26,1.7,-19],[-26,1.7,-27],[-35,1.7,-23]])for(const target of [[-48,1.6,-17],[-49,2,-29]]){
   const delta=target.map((n,i)=>n-start[i]),distance=Math.hypot(...delta);const hit=f.physics.raycast(start,delta.map(n=>n/distance),distance-1);
   assert.ok(hit,`revealed from ${start} to ${target}`);
  }
 });
 test('selector handles 100, backspace, zero and unavailable numbers',()=>{const a=new LevelNumberEntry(100);for(const n of [1,0,0])a.digit(n);assert.equal(a.confirm(),100);a.clear();a.digit(0);assert.equal(a.confirm(),null);a.digit(9);a.digit(9);a.digit(9);assert.equal(a.confirm(),null);a.digit(1);a.digit(2);a.backspace();assert.equal(a.confirm(),1);});
 test('lever animates, rejects launch during spin, then selects an existing level',()=>{const f=fixture();let chosen=0;const m=new CasinoSelector(f,5,1,n=>chosen=n);m.spin();m.confirm();assert.equal(chosen,0);for(let i=0;i<180;i++)m.update(1/60);assert.equal(m.spinTime,-1);assert.ok(m.entry.selected>=1&&m.entry.selected<=5);m.confirm();assert.equal(chosen,m.entry.selected);});
 console.log(`${passed} gameplay checks passed.`);
} finally {for(const w of worlds)w.dispose();await server.close();}

