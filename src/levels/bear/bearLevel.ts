import { approachAngle, clamp, mul, rotationX, rotationY, rotationZ, scaling, translation, type Vec3 } from '../../engine/math';
import { Pattern, type DrawItem } from '../../engine/renderer';
import { GROUPS_QUERY_WORLD, RAPIER } from '../../engine/physics';
import { drawBody, poseFrames, REST_POSE } from '../../game/body';
import { drawPortal, PortalArrival } from '../../entities/portal';
import { DEFAULT_ENV, type CameraShot, type Level, type LevelContext, type LevelStatus, type WorldLabel } from '../level';
import { Bear } from './bear';
import { drawForestLandmark } from './forestLandmark';
import { BearAudio, LINES } from './audio';
import { CHASE_ROUTE, PATROL_ROUTE, FOREST_TRAIL, distanceToPath, pathDistance, pursuitSpeed } from './chase';

// Kept across attempts, but deliberately not across a page reload/new play session.
let visit = 0;
export function resetBearStory() { visit = 0; }
const MAN: Vec3 = [-68,0,-17];
const EXIT: Vec3 = [-76.9,1.6,-29];
const TINY_EXIT: Vec3 = [-73,0.25,-10.6];
type Phase = 'approach' | 'notice' | 'chase' | 'choice' | 'dead' | 'exit';

/** Level 5: three visits, two doors, one deliberately unhelpful man. */
export class BearLevel implements Level {
  readonly number = 5;
  readonly title = 'A Bigger Bear';
  readonly chamber = { customLayout: true, halfSize: 65 };
  readonly stage = visit;
  status: LevelStatus = 'playing';
  restartRequested = false;
  private arrival: PortalArrival;
  private audio = new BearAudio();
  private scenery: DrawItem[] = [];
  private walls: {p:Vec3;s:Vec3}[] = [];
  private pursuer: Bear;
  private bigger: Bear;
  private bridgeFloor!: RAPIER.Collider;
  private gapTime=0;
  private phase: Phase = 'approach';
  private clock = 0;
  private phaseTime = 0;
  private returnGapOpen = false;
  private room: 'man' | 'bear' | null = null;
  private manPos: Vec3 = [...MAN];
  private manCollider: RAPIER.Collider;
  private greeted = false;
  private gunTime = -1;
  private closestManDistance = Infinity;
  private tinyTime = -1;
  private tinyOpen = false;
  private saidWelcome = false;
  private talkUntil = 0;
  private lastLine = -1;
  private attackTime = -1;
  private attacker: Bear | null = null;
  private deathFocus: Vec3 | null = null;
  private flash = 0;
  private lastStep = 0;
  private patrolIndex=1;
  private patrolPause=0;
  private chaseIndex=0;
  private nextGrowl=6;
  private forestTime=0;

  constructor(private ctx: LevelContext) {
    ctx.hud.setLevel('The Chamber · Level 5'); ctx.hud.hint('');
    this.arrival = new PortalArrival(ctx,[0,0,6]);
    this.buildRoom();
    this.pursuer = new Bear(ctx.physics,[...PATROL_ROUTE[0]],0.82);
    this.bigger = new Bear(ctx.physics,[-69,0,-29], this.stage===2 ? 1.15 : this.stage===1 ? 2.5 : 1.45, this.stage===2);
    this.bigger.yaw = Math.PI/2;
    const scale = this.stage===2 ? 0.24 : 1;
    this.manCollider = ctx.physics.addStaticCylinder([MAN[0],0.9*scale,MAN[2]],0.35*scale,1.8*scale);
  }
  dispose() { this.audio.dispose(); }
  private box(p:Vec3,s:Vec3,color:number[],solid=false,pattern:number=Pattern.plain) {
    this.scenery.push({mesh:'box',model:mul(translation(p),scaling(s)),color,pattern,param:2});
    if(solid) {this.ctx.physics.addStaticBox(p,s); this.walls.push({p,s});}
  }
  private buildRoom() {
    const wall=[0.82,0.84,0.83], floor=[0.48,0.52,0.51];
    const slab=(p:Vec3,s:Vec3)=>this.box(p,s,floor,true,Pattern.panels);
    slab([0,-0.25,-10],[18,0.5,40]);
    slab([0,-0.25,-43],[8,0.5,26]); slab([-9.5,-0.25,-56],[27,0.5,8]);
    slab([-23,-0.25,-37.5],[8,0.5,37]); slab([-29.5,-0.25,-23],[21,0.5,14]);slab([-53,-0.25,-23],[10,0.5,14]);
    this.bridgeFloor=this.ctx.physics.addStaticBox([-44,-0.25,-23],[8,0.5,14]);
    // The bridge is part of the normal floor until either choice-room threshold is crossed.
    for(const x of [-48.25,-39.75])this.box([x,-3,-23],[0.5,6,14],[0.20,0.23,0.23],true,Pattern.panels);
    for(const z of [-30.25,-15.75])this.box([-44,-3,z],[8,6,0.5],[0.20,0.23,0.23],true,Pattern.panels);
    this.box([-44,-6.25,-23],[8,0.5,14],[0.12,0.14,0.15],true);
    for(let x=-47.4;x<-40;x+=1.2)for(let z=-29.4;z<-16;z+=1.2) {
      this.scenery.push({mesh:'cone',model:mul(translation([x,-4.8,z]),scaling([0.42,2.4,0.42])),color:[0.68,0.72,0.75]});
    }
    slab([-68,-0.25,-23],[20,0.5,26]);
    const w=(x:number,z:number,sx:number,sz:number)=>this.box([x,4.5,z],[sx,9,sz],wall,true,Pattern.panels);
    w(9.5,-10,1,42); w(0,10.5,20,1); w(-9.5,-10,1,40);
    w(-6.5,-30.5,5,1);w(6.5,-30.5,5,1);
    w(4.5,-45.5,1,31);w(-4.5,-41,1,22);
    w(-11.5,-60.5,33,1);w(-11.5,-51.5,15,1);
    w(-27.5,-45.5,1,29);w(-18.5,-34,1,36);
    w(-42.5,-30.5,31,1);w(-38.5,-15.5,39,1);
    w(-78.5,-23,1,28); w(-68,-36.5,22,1); w(-68,-9.5,22,1); w(-68,-23,20,0.7);
    // Narrow doorways and offset entry screens keep every reveal out of the chase sightline.
    for(const [za,zb] of [[-36,-28.1],[-25.9,-20.1],[-17.9,-10]]) w(-58,(za+zb)/2,0.8,zb-za);
    for(const z of [-27,-19]) {
      this.box([-58,5.9,z],[0.8,6.2,2.2],wall,true,Pattern.panels);
      this.box([-61.8,2.8,z],[0.6,5.6,4.8],wall,true,Pattern.panels);
      this.box([-57.52,4.35,z],[0.16,this.stage>0?1.65:1.1,this.stage>0?7.6:6.6],[0.025,0.03,0.035]);
      if(this.stage===1) {
        const neon=z===-19?[0.05,1,1]:[1,0.08,0.62];
        for(const y of [3.6,5.1])this.box([-57.38,y,z],[0.12,0.07,7.5],neon,false,Pattern.emissive);
        for(const side of [-1,1])this.box([-57.38,4.35,z+side*3.75],[0.12,1.5,0.07],neon,false,Pattern.emissive);
        for(let n=0;n<13;n++)for(const y of [3.38,5.32])this.scenery.push({mesh:'sphere',model:mul(translation([-57.35,y,z-3.5+n*7/12]),scaling([0.11,0.11,0.11])),color:[1,0.72,0.2],pattern:Pattern.emissive});
      }
      for(const s of [-1,1]) this.box([-57.5,1.4,z+s*1.1],[0.18,2.8,0.12],[0.63,0.74,0.63],false,Pattern.emissive);
    }
    this.buildForest();
    // Sparse amber guidance on the outside of each turn; no sign spoilers before the last corner.
    for(const [x,z] of [[3.92,-36],[3.92,-46],[3.92,-55],[-10,-59.92],[-22,-59.92],[-26.92,-45],[-26.92,-35],[-30,-29.92]])
      this.box([x,3.5,z],[0.16,0.18,0.16],[0.94,0.56,0.18],false,Pattern.emissive);
    this.box([-75,0.45,-14],[2,0.9,1],[0.40,0.43,0.40],true);
  }
  private buildForest() {
    if(this.stage===0)this.ctx.physics.addStaticCylinder([4.5,3.4,1.8],0.48,6.8);
    else {
      this.ctx.physics.addStaticBox([1.1,0.65,1.8],[6.8,1.3,1]);
      this.ctx.physics.addStaticBox([-1.5,0.65,1.8],[5.6,1.3,3.2]);
    }
    this.box([0,0.012,-11],[18,0.024,34],[0.19,0.16,0.10]);
    // Boulders close off both wall-hugging shortcuts and funnel the player between tree clusters.
    for(const side of [-1,1])for(let i=0;i<12;i++) {
      const z=3-i*2.6,x=side*(7.9+Math.sin(i*3.1)*0.3);
      this.ctx.physics.addStaticBox([x,1.3,z],[2.2,2.6,3]);
      this.scenery.push({mesh:'sphere',model:mul(translation([x,0.9,z]),scaling([1.6,1.9,2])),color:[0.22,0.25,0.19]});
    }
    const closedPatrol=[...PATROL_ROUTE,PATROL_ROUTE[0]];
    let seed=517;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let row=0;row<10;row++)for(let col=0;col<6;col++) {
      const x=-6.5+col*2.55+(random()-0.5)*1.15,z=1-row*2.9+(random()-0.5)*1.3;
      const point:Vec3=[x,0,z];
      if(z>-1&&x>0)continue;
      if(distanceToPath(point,FOREST_TRAIL)<1.3||distanceToPath(point,closedPatrol)<1.7||PATROL_ROUTE.some(start=>distanceToPath(point,[start,[3,0,-20]])<1.5))continue;
      const height=6.4+random()*2.1,r=0.22+random()*0.13;
      this.ctx.physics.addStaticCylinder([x,height/2,z],r,height);
      this.scenery.push({mesh:'cylinder',model:mul(translation([x,height/2,z]),scaling([r,height,r])),color:[0.20,0.12,0.065]});
      for(let tier=0;tier<4;tier++) {
        const spread=1.85-tier*0.34;
        this.scenery.push({mesh:'cone',model:mul(translation([x,height-2.7+tier*0.78,z]),rotationY(random()*6.28),scaling([spread,2.7-tier*0.25,spread])),color:[0.055+tier*0.012,0.13+tier*0.018,0.068+tier*0.009]});
      }
      for(let j=0;j<3;j++)this.scenery.push({mesh:'cone',model:mul(translation([x+(random()-.5)*1.6,0.2,z+(random()-.5)*1.6]),scaling([0.4,0.45,0.4])),color:[0.13,0.20,0.08]});
    }
    // Fallen timber/rock clusters leave alternating wide gaps in the trail.
    for(const [x,z,width] of [[2.2,-4,8],[-2.5,-22,8]]) {
      this.ctx.physics.addStaticBox([x,1.2,z],[width,2.4,1.5]);
      for(let i=0;i<4;i++)this.scenery.push({mesh:'sphere',model:mul(translation([x-width/2+(i+.5)*width/4,0.8,z]),scaling([width/6,1.65,1.15])),color:[0.25+i*.01,0.27,0.19]});
      this.scenery.push({mesh:'cylinder',model:mul(translation([x,1.8,z]),rotationY(0.15),rotationZ(Math.PI/2),scaling([0.27,width,0.27])),color:[0.22,0.125,0.055]});
    }
    // A worn earth trail, with irregular edges rather than a clean pavement through the forest.
    for(let i=1;i<FOREST_TRAIL.length;i++) {
      const a=FOREST_TRAIL[i-1],b=FOREST_TRAIL[i],d=Math.hypot(b[0]-a[0],b[2]-a[2]);
      for(let t=0;t<d;t+=0.8){const k=t/d;this.scenery.push({mesh:'cylinder',model:mul(translation([a[0]+(b[0]-a[0])*k,0.028,a[2]+(b[2]-a[2])*k]),scaling([1.05,0.018,0.9])),color:[0.27,0.22,0.145]});}
    }
  }
  private patrol(dt:number) {
    this.patrolPause-=dt;
    if(this.patrolPause>0){this.pursuer.moving=false;return;}
    const target=PATROL_ROUTE[this.patrolIndex];
    this.moveBear(this.pursuer,target,1.05,dt);
    if(Math.hypot(target[0]-this.pursuer.pos[0],target[2]-this.pursuer.pos[2])<0.25){this.patrolIndex=(this.patrolIndex+1)%PATROL_ROUTE.length;this.patrolPause=0.8;}
  }
  private pursue(dt:number) {
    const p=this.ctx.player.pos;
    const gap=pathDistance(p,CHASE_ROUTE)-pathDistance(this.pursuer.pos,CHASE_ROUTE);
    const speed=pursuitSpeed(gap,this.phaseTime,Math.hypot(this.ctx.player.vel[0],this.ctx.player.vel[2])>2,p[0]<-23&&p[2]>-30);
    const target:Vec3=this.chaseIndex<0?[3,0,-20]:this.chaseIndex<CHASE_ROUTE.length?CHASE_ROUTE[this.chaseIndex]:p;
    // Once close on the same clear straight, chase the player directly even if they stop early.
    const dx=p[0]-this.pursuer.pos[0],dz=p[2]-this.pursuer.pos[2],distance=Math.hypot(dx,dz);
    const wall=distance>0.01?this.ctx.physics.world.castRay(new RAPIER.Ray({x:this.pursuer.pos[0],y:0.7,z:this.pursuer.pos[2]},{x:dx/distance,y:0,z:dz/distance}),distance,true,undefined,GROUPS_QUERY_WORLD,undefined,this.pursuer.body):null;
    const direct=this.chaseIndex>=0&&distance<7&&!wall&&(this.chaseIndex>=CHASE_ROUTE.length||pathDistance(p,CHASE_ROUTE)<=pathDistance(target,CHASE_ROUTE)+0.1);
    this.moveBear(this.pursuer,direct?p:target,speed,dt);
    if(this.chaseIndex<CHASE_ROUTE.length&&Math.hypot(target[0]-this.pursuer.pos[0],target[2]-this.pursuer.pos[2])<0.45)this.chaseIndex++;
    if(distance<2.05&&p[1]<2.4)this.maul(this.pursuer);
  }
  private setPhase(phase:Phase) {this.phase=phase;this.phaseTime=0;}
  private say(key:keyof typeof LINES) {
    this.audio.say(key,this.stage===2); this.talkUntil=this.clock+(key==='tiny'?3.6:3.2);
    this.ctx.hud.hint(`“${LINES[key]}”`);
  }
  private talk() {
    if(this.clock<this.talkUntil || this.phase!=='choice') return;
    if(this.stage===2) { if(this.tinyTime<0) {this.say('tiny');this.tinyTime=0;} else this.say('welcome'); }
    else if(this.stage===1) this.say('howdy');
    else {
      const lines = ['yep','weather','standing','paperwork'] as const;
      let next=Math.floor(Math.random()*lines.length); if(next===this.lastLine) next=(next+1)%lines.length;
      this.lastLine=next;this.say(lines[next]);
    }
  }
  private moveBear(bear:Bear,target:Vec3,speed:number,dt:number) {
    if(this.attacker===bear && this.attackTime>=0) {bear.moving=false;return;}
    const dx=target[0]-bear.pos[0], dz=target[2]-bear.pos[2], d=Math.hypot(dx,dz);
    bear.moving=d>0.2;
    if(d>0.2) {const step=Math.min(d,speed*dt);bear.move(dx/d*step,dz/d*step);bear.yaw=approachAngle(bear.yaw,Math.atan2(dx,dz),dt*6);}
  }
  private maul(bear:Bear) {
    if(this.attackTime>=0) return;
    this.attacker=bear;this.attackTime=0;bear.attack=1;bear.moving=false;this.audio.effect('roar');
  }
  private die(choice:boolean,shot=false) {
    if(this.phase==='dead') return;
    const player=this.ctx.player, origin=shot?this.manPos:this.attacker?.pos??this.pursuer.pos;
    const dx=player.pos[0]-origin[0],dz=player.pos[2]-origin[2],d=Math.hypot(dx,dz)||1;
    this.deathFocus=[...player.pos];
    player.kill([dx/d*(shot?7:10),shot?3:7,dz/d*(shot?7:10)],{violence:shot?16:22,origin:[origin[0],1.2,origin[2]]});
    this.ctx.camera.addShake(shot?0.6:0.9);this.audio.effect(shot?'shot':'hit');
    if(choice) visit=Math.min(2,this.stage+1);
    this.ctx.hud.hint('');this.setPhase('dead');
  }
  update(dt:number) {
    this.clock+=dt;this.phaseTime+=dt;this.flash=Math.max(0,this.flash-dt);
    this.arrival.update(dt);
    const player=this.ctx.player,p=player.pos;
    if(this.phase==='dead') {
      if(this.attacker) {this.attacker.attack=0.5+Math.sin(this.phaseTime*9)*0.4;this.attacker.moving=false;}
      if(this.phaseTime>3.8) this.restartRequested=true;
    } else if(this.phase==='exit') {
      if(this.phaseTime>0.8) {this.status='exited';visit=0;}
    } else if(this.arrival.done) {
      if(this.returnGapOpen && p[1]<-3.6) {this.attacker=null;this.die(false);return;}
      if(this.phase==='approach') {
        this.patrol(dt);
        if(p[2]<-5)this.forestTime+=dt;
        // The clearing lets you watch/avoid it, but the exit scent line guarantees detection.
        if(p[2]<-23 || (p[2]<-8 && Math.hypot(p[0]-this.pursuer.pos[0],p[2]-this.pursuer.pos[2])<2.7) || this.forestTime>28) {
          this.setPhase('notice');this.pursuer.moving=false;
          this.pursuer.yaw=Math.atan2(p[0]-this.pursuer.pos[0],p[2]-this.pursuer.pos[2]);this.audio.effect('roar');this.ctx.hud.hint('Shift — RUN');
        }
      }
      if(this.phase==='notice' && this.phaseTime>1.3) {this.setPhase('chase');this.chaseIndex=-1;}
      if(this.phase==='chase') {
        this.pursue(dt);
        if(p[0]<-58.5 && p[2]>-30 && p[2]<-16) {
          this.setPhase('choice');this.returnGapOpen=true;this.bridgeFloor.setEnabled(false);
          this.pursuer.body.setEnabled(false);this.audio.stopBear();
          this.pursuer.moving=false;this.attackTime=-1;this.attacker=null;this.ctx.hud.hint('');
        }
      }
      if(this.phase==='choice') {
        this.room=p[0]<-58 ? (p[2]>-23?'man':'bear') : null;
        if(this.room==='man') {
          if(!this.greeted && p[0]<-64.5) {this.greeted=true;if(this.stage===1)this.say('howdy');}
          const distance=Math.hypot(p[0]-this.manPos[0],p[2]-this.manPos[2]);
          if(distance<3.5 && player.mode==='control') {
            if(this.clock>this.talkUntil) this.ctx.hud.hint('E — talk');
            if(this.ctx.input.wasPressed('KeyE')) this.talk();
          } else if(this.clock>this.talkUntil) this.ctx.hud.hint('');
        }
        // Catch the first step away, before the entrance screen can hide the draw.
        if(this.stage===1 && this.greeted && this.gunTime<0 && this.room==='man') {
          const dx=p[0]-this.manPos[0],dz=p[2]-this.manPos[2],d=Math.hypot(dx,dz);
          this.closestManDistance=Math.min(this.closestManDistance,d);
          const leaving=d>this.closestManDistance+0.45 || p[0]>-64.2;
          const wall=this.ctx.physics.raycast([this.manPos[0],1.35,this.manPos[2]],[dx/d,0,dz/d],d,this.manCollider);
          if(leaving&&!wall) {this.gunTime=0;this.say('leaving');player.vel[0]=player.vel[2]=0;player.speedScale=0.001;}
        }
        if(this.gunTime>=0) {
          this.gunTime+=dt;
          if(this.gunTime>0.95) {this.flash=0.18;player.speedScale=1;this.die(true,true);}
        }
        if(this.stage<2 && this.room==='bear' && p[0]<-62.4) {
          this.moveBear(this.bigger,[clamp(p[0],-75,-61),0,clamp(p[2],-33.5,-25.5)],5.8,dt);
          if(Math.hypot(p[0]-this.bigger.pos[0],p[2]-this.bigger.pos[2])<3.8*(this.bigger.size/1.45) && p[1]<4) this.maul(this.bigger);
        } else this.bigger.moving=false;
        if(this.stage===2 && this.tinyTime>=0) {
          this.tinyTime+=dt;
          if(this.tinyTime>2.4) {
            const dx=TINY_EXIT[0]-this.manPos[0],dz=TINY_EXIT[2]-0.65-this.manPos[2],d=Math.hypot(dx,dz);
            if(d>0.12) {this.manPos[0]+=dx/d*Math.min(d,dt*2.4);this.manPos[2]+=dz/d*Math.min(d,dt*2.4);}
            else {this.tinyOpen=true;if(!this.saidWelcome){this.saidWelcome=true;this.say('welcome');}}
            this.manCollider.setTranslation({x:this.manPos[0],y:0.216,z:this.manPos[2]});
          }
        }
        if(this.stage===2 && this.room==='bear' && Math.hypot(p[0]-EXIT[0],p[2]-EXIT[2])<1.05 && Math.abs(p[1]+1-EXIT[1])<1.5) {
          this.setPhase('exit');this.audio.stop();player.shrinkInto(EXIT,0.5);this.ctx.hud.hint('');
        }
      }
      if(this.attackTime>=0 && (this.phase as Phase)!=='dead') {
        this.attackTime+=dt;
        if(this.attackTime>0.32 && this.attacker) {
          const d=Math.hypot(p[0]-this.attacker.pos[0],p[2]-this.attacker.pos[2]);
          if(d<(this.attacker===this.bigger?4.3*(this.bigger.size/1.45):2.6)) this.die(this.attacker===this.bigger);
          else {this.attackTime=-1;this.attacker=null;}
        }
      }
    }
    if((this.phase==='approach'||this.phase==='chase')&&this.clock>this.nextGrowl){this.nextGrowl=this.clock+(this.phase==='chase'?4.8:8);this.audio.effect(this.phase==='chase'?'roar':'growl');}
    if(this.returnGapOpen)this.gapTime+=dt;else this.pursuer.update(dt);
    this.bigger.update(dt);
    if((this.pursuer.moving||this.bigger.moving) && this.clock-this.lastStep>0.32) {this.lastStep=this.clock;this.audio.effect('step');}
  }
  draw(out:DrawItem[],time:number) {
    out.push(...this.scenery);this.arrival.draw(out);if(!this.returnGapOpen)this.pursuer.draw(out,time);this.bigger.draw(out,time);
    this.drawBridge(out);drawForestLandmark(out,this.stage,time);
    const s=this.stage===2?0.24:1, p=this.ctx.player.pos;
    const running=this.stage===2&&this.tinyTime>2.4&&!this.tinyOpen;
    const yaw=running?Math.atan2(this.manPos[0]-TINY_EXIT[0],this.manPos[2]-TINY_EXIT[2]):Math.atan2(this.manPos[0]-p[0],this.manPos[2]-p[2]);
    const root=mul(translation(this.manPos),rotationY(yaw),scaling([s,s,s]));
    const stride=running?Math.sin(time*20)*0.65:0;
    const drawAmount=this.gunTime<0?0:clamp(this.gunTime/0.6,0,1);
    const frames=poseFrames(root,{...REST_POSE,hipL:stride,hipR:-stride,shoulderL:-stride,shoulderR:drawAmount*1.47+(1-drawAmount)*stride,elbowR:0.15-drawAmount*0.05,headPitch:Math.sin(time*2)*0.025});
    drawBody(out,frames);
    if(this.stage===1) {
      for(const [y,sc] of [[0.2,[0.43,0.055,0.36]],[0.34,[0.26,0.22,0.22]]] as [number,Vec3][]) out.push({mesh:'cylinder',model:mul(frames.head,translation([0,y,0]),scaling(sc)),color:[0.30,0.16,0.075]});
      const gun=mul(frames.foreArmR,translation([0,-0.2,0]),rotationX(-Math.PI/2));
      out.push({mesh:'box',model:mul(gun,translation([0,-0.09,0.04]),scaling([0.10,0.22,0.12])),color:[0.24,0.12,0.055]});
      out.push({mesh:'box',model:mul(gun,scaling([0.09,0.14,0.38])),color:[0.09,0.095,0.10]});
      if(this.flash>0) out.push({mesh:'sphere',model:mul(gun,translation([0,0,-0.3]),scaling([0.2,0.2,0.4])),color:[1,0.65,0.15],pattern:Pattern.emissive});
    }
    if(this.stage===2) {
      drawPortal(out,EXIT,[1,0,0],1.45,true);
      if(this.tinyOpen) drawPortal(out,TINY_EXIT,[0,0,-1],0.22,true);
    }
  }
  private drawBridge(out:DrawItem[]) {
    const drop=this.returnGapOpen?Math.min(6.5,this.gapTime*this.gapTime*12):0;
    out.push({mesh:'box',model:mul(translation([-44,-0.25-drop,-23]),scaling([8,0.5,14])),color:[0.48,0.52,0.51],pattern:Pattern.panels,param:2});
    if(this.returnGapOpen)for(const x of [-48,-40])out.push({mesh:'box',model:mul(translation([x,0.025,-23]),scaling([0.12,0.04,14])),color:[0.94,0.47,0.08],pattern:Pattern.emissive});
  }
  drawPreview(out:DrawItem[],time:number) {out.push(...this.scenery);this.drawBridge(out);drawForestLandmark(out,this.stage,time);this.pursuer.draw(out,time);}
  previewCameraShot():CameraShot {return {pos:[-5,3.4,8],target:[3,1.8,-12],sharpness:6};}
  labels():WorldLabel[] {
    const p=this.ctx.player.pos;
    // World labels otherwise draw through walls; show the signs only from their hallway.
    const labels:WorldLabel[]=p[0]<-23&&p[0]>-58&&p[2]<-16&&p[2]>-30 ? [
      {pos:[-57.4,4.35,-19],text:this.stage===0?'A MAN':this.stage===1?'A COWBOY MAN':'A TINY MAN',size:this.stage===1?0.66:0.52,color:this.stage===1?'#7bffff':undefined},
      {pos:[-57.4,4.35,-27],text:this.stage===2?'A SUPER MEGA\nGIANT BEAR':this.stage===1?'AN EVEN WAY\nBIGGER BEAR':'A BIGGER BEAR',size:this.stage===1?0.60:0.52,color:this.stage===1?'#ff8bea':undefined},
    ]:[];
    if(this.tinyOpen&&this.room==='man'&&Math.hypot(p[0]-TINY_EXIT[0],p[2]-TINY_EXIT[2])<3) labels.push({pos:[TINY_EXIT[0],0.8,TINY_EXIT[2]],text:'EXIT',size:0.11,color:'#dcb4ff'});
    return labels;
  }
  cameraShot():CameraShot|null {
    if(this.gunTime>=0 && (this.phase!=='dead'||this.phaseTime<1.2)) return {pos:[-64.5,2.6,-12.8],target:[-66.2,1.25,-17],sharpness:12};
    if(this.deathFocus) return {pos:[this.deathFocus[0]+4,3.4,this.deathFocus[2]+3],target:[this.deathFocus[0],0.9,this.deathFocus[2]],sharpness:4};
    const arrival=this.arrival.cameraShot();if(arrival)return arrival;
    // Match the shared shoulder camera, with real occlusion against this L-shaped layout.
    const {camera,player}=this.ctx,cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
    const f:Vec3=[-Math.sin(camera.yaw)*cp,sp,-Math.cos(camera.yaw)*cp];
    const shoulder:Vec3=[player.pos[0]+Math.cos(camera.yaw)*0.6,player.pos[1]+1.65,player.pos[2]-Math.sin(camera.yaw)*0.6];
    const back:Vec3=[-f[0],-f[1],-f[2]];
    const hit=this.ctx.physics.raycast(shoulder,back,3.2,player.collider??undefined);
    const d=hit?Math.max(0.25,hit.distance-0.25):3.2;
    return {pos:[shoulder[0]+back[0]*d,Math.max(0.35,shoulder[1]+back[1]*d),shoulder[2]+back[2]*d],target:[shoulder[0]+f[0]*10,shoulder[1]+f[1]*10,shoulder[2]+f[2]*10],sharpness:18};
  }
  environment() {return {...DEFAULT_ENV,sunDir:[0.2,1,0.35] as Vec3,sunColor:[1.5,1.47,1.34] as Vec3,fogDensity:0.002};}
  obstacles() {return [];}
}


