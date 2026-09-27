import { clamp, mul, rotationY, scaling, translation, type Vec3 } from '../../engine/math';
import { Pattern, type DrawItem } from '../../engine/renderer';
import type { RAPIER } from '../../engine/physics';
import { drawBody, poseFrames, REST_POSE } from '../../game/body';
import { drawPortal, PortalArrival } from '../../entities/portal';
import { DEFAULT_ENV, type CameraShot, type Level, type LevelContext, type LevelStatus, type WorldLabel } from '../level';
import { Bear } from './bear';
import { BearAudio, LINES } from './audio';

// Kept across attempts, but deliberately not across a page reload/new play session.
let visit = 0;
export function resetBearStory() { visit = 0; }
const MAN: Vec3 = [-48,0,-17];
const EXIT: Vec3 = [-56.9,1.6,-29];
const TINY_EXIT: Vec3 = [-53,0.25,-10.6];
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
  private shutter: RAPIER.Collider;
  private phase: Phase = 'approach';
  private clock = 0;
  private phaseTime = 0;
  private sealed = false;
  private room: 'man' | 'bear' | null = null;
  private manPos: Vec3 = [...MAN];
  private manCollider: RAPIER.Collider;
  private greeted = false;
  private gunTime = -1;
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

  constructor(private ctx: LevelContext) {
    ctx.hud.setLevel('The Chamber · Level 5'); ctx.hud.hint('');
    this.arrival = new PortalArrival(ctx,[0,0,6]);
    this.buildRoom();
    this.pursuer = new Bear(ctx.physics,[4.5,0,-13]);
    this.bigger = new Bear(ctx.physics,[-49,0,-29], this.stage===2 ? 1.15 : 1.25, this.stage===2);
    this.bigger.yaw = Math.PI/2;
    const scale = this.stage===2 ? 0.24 : 1;
    this.manCollider = ctx.physics.addStaticCylinder([MAN[0],0.9*scale,MAN[2]],0.35*scale,1.8*scale);
    this.shutter = ctx.physics.addStaticBox([-34,13,-23],[0.5,10,14]);
  }
  dispose() { this.audio.dispose(); }
  private box(p:Vec3,s:Vec3,color:number[],solid=false,pattern:number=Pattern.plain) {
    this.scenery.push({mesh:'box',model:mul(translation(p),scaling(s)),color,pattern,param:2});
    if(solid) {this.ctx.physics.addStaticBox(p,s); this.walls.push({p,s});}
  }
  private buildRoom() {
    const wall=[0.82,0.84,0.83], floor=[0.48,0.52,0.51];
    const slab=(p:Vec3,s:Vec3)=>this.box(p,s,floor,true,Pattern.panels);
    slab([0,-0.25,-10],[18,0.5,40]); slab([-23.5,-0.25,-23],[29,0.5,14]); slab([-48,-0.25,-23],[20,0.5,26]);
    const w=(x:number,z:number,sx:number,sz:number)=>this.box([x,4.5,z],[sx,9,sz],wall,true,Pattern.panels);
    w(9.5,-10,1,42); w(0,10.5,20,1); w(-9.5,-2.5,1,27); w(-14,-30.5,48,1); w(-23.5,-15.5,29,1);
    w(-58.5,-23,1,28); w(-48,-36.5,22,1); w(-48,-9.5,22,1); w(-48,-23,20,0.7);
    // Narrow doorways and offset entry screens keep every reveal out of the chase sightline.
    for(const [za,zb] of [[-36,-28.1],[-25.9,-20.1],[-17.9,-10]]) w(-38,(za+zb)/2,0.8,zb-za);
    for(const z of [-27,-19]) {
      this.box([-38,5.9,z],[0.8,6.2,2.2],wall,true,Pattern.panels);
      this.box([-41.8,2.8,z],[0.6,5.6,4.8],wall,true,Pattern.panels);
      this.box([-37.52,4.35,z],[0.16,1.1,6.6],[0.055,0.065,0.063]);
      for(const s of [-1,1]) this.box([-37.5,1.4,z+s*1.1],[0.18,2.8,0.12],[0.63,0.74,0.63],false,Pattern.emissive);
    }
    // Artificial woodland confined to one side of the chamber.
    this.box([5.3,0.04,-9],[6.3,0.08,23],[0.16,0.20,0.11]);
    for(let i=0;i<12;i++) {
      const x=3.4+(i%3)*1.9, z=1-Math.floor(i/3)*5.4-(i%2)*1.2;
      this.box([x,1.8,z],[0.42,3.6,0.42],[0.24,0.16,0.08],true);
      for(let tier=0;tier<3;tier++) this.scenery.push({mesh:'cone',model:mul(translation([x,3+tier*1.0,z]),scaling([1.65-tier*0.3,2.7-tier*0.3,1.65-tier*0.3])),color:[0.10+tier*0.025,0.20+tier*0.025,0.12+tier*0.01]});
    }
    for(const z of [5,-3,-11,-23]) {
      this.box([-8.94,5.8,z],[0.1,0.16,2.5],[0.79,0.86,0.81],false,Pattern.emissive);
    }
    for(const x of [-15,-24,-32]) for(const z of [-29.9,-16.1]) this.box([x,5.8,z],[2.5,0.13,0.1],[0.79,0.86,0.81],false,Pattern.emissive);
    // Red corner chevrons point left without explaining the joke.
    for(let i=0;i<3;i++) this.box([-1.5-i*0.6,0.016,-24],[0.35,0.025,1.2],[0.72,0.22,0.08]);
    this.box([-55,0.45,-14],[2,0.9,1],[0.40,0.43,0.40],true);
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
    if(d>0.2) {const step=Math.min(d,speed*dt);bear.pos[0]+=dx/d*step;bear.pos[2]+=dz/d*step;bear.yaw=Math.atan2(dx,dz);}
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
      if(this.phase==='approach' && p[2]<-17.5) {this.setPhase('notice');this.pursuer.yaw=Math.atan2(p[0]-this.pursuer.pos[0],p[2]-this.pursuer.pos[2]);this.audio.effect('roar');this.ctx.hud.hint('Shift — RUN');}
      if(this.phase==='notice' && this.phaseTime>1.25) this.setPhase('chase');
      if(this.phase==='chase') {
        // Reach the inside corner before turning, so the bear cannot cut through the wall.
        const target:Vec3=this.pursuer.pos[2]>-22 && p[0]<-8 ? [-4,0,-24] : [p[0],0,Math.min(p[2],-18)];
        this.moveBear(this.pursuer,target,7.0,dt);
        if(p[0]<-38.5) {
          this.setPhase('choice');this.sealed=true;this.shutter.setTranslation({x:-34,y:4.5,z:-23});
          this.pursuer.moving=false;this.ctx.hud.hint('');
        } else if(Math.hypot(p[0]-this.pursuer.pos[0],p[2]-this.pursuer.pos[2])<3.2 && p[1]<3) this.maul(this.pursuer);
      }
      if(this.phase==='choice') {
        this.room=p[0]<-38 ? (p[2]>-23?'man':'bear') : null;
        if(this.room==='man') {
          if(!this.greeted && p[0]<-44.5) {this.greeted=true;if(this.stage===1)this.say('howdy');}
          const distance=Math.hypot(p[0]-this.manPos[0],p[2]-this.manPos[2]);
          if(distance<3.5 && player.mode==='control') {
            if(this.clock>this.talkUntil) this.ctx.hud.hint('E — talk');
            if(this.ctx.input.wasPressed('KeyE')) this.talk();
          } else if(this.clock>this.talkUntil) this.ctx.hud.hint('');
        }
        // The cowboy greets first; approaching the doorway to leave triggers a visible draw.
        if(this.stage===1 && this.greeted && this.gunTime<0 && p[0]>-44.2 && p[2]>-23) {this.gunTime=0;this.say('leaving');}
        if(this.gunTime>=0) {
          this.gunTime+=dt;
          // Only shoot with clear sight: escaping the doorway before the draw can evade him.
          if(this.gunTime>0.65 && this.room==='man') {
            const dx=p[0]-this.manPos[0],dz=p[2]-this.manPos[2],d=Math.hypot(dx,dz);
            const wall=this.ctx.physics.raycast([this.manPos[0],1.35,this.manPos[2]],[dx/d,0,dz/d],d,this.manCollider);
            if(!wall) {this.flash=0.12;this.die(true,true);}
          }
        }
        if(this.stage<2 && this.room==='bear' && p[0]<-42.4) {
          this.moveBear(this.bigger,[clamp(p[0],-55,-41),0,clamp(p[2],-33.5,-25.5)],5.8,dt);
          if(Math.hypot(p[0]-this.bigger.pos[0],p[2]-this.bigger.pos[2])<3.8 && p[1]<4) this.maul(this.bigger);
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
          if(d<(this.attacker===this.bigger?4.3:3.6)) this.die(this.attacker===this.bigger);
          else {this.attackTime=-1;this.attacker=null;}
        }
      }
    }
    this.pursuer.update(dt);this.bigger.update(dt);
    if((this.pursuer.moving||this.bigger.moving) && this.clock-this.lastStep>0.32) {this.lastStep=this.clock;this.audio.effect('step');}
  }
  draw(out:DrawItem[],time:number) {
    out.push(...this.scenery);this.arrival.draw(out);this.pursuer.draw(out,time);this.bigger.draw(out,time);
    if(this.sealed) out.push({mesh:'box',model:mul(translation([-34,4.5,-23]),scaling([0.5,9,14])),color:[0.18,0.22,0.20],pattern:Pattern.panels,param:1});
    const s=this.stage===2?0.24:1, p=this.ctx.player.pos;
    const running=this.stage===2&&this.tinyTime>2.4&&!this.tinyOpen;
    const yaw=running?Math.atan2(this.manPos[0]-TINY_EXIT[0],this.manPos[2]-TINY_EXIT[2]):Math.atan2(this.manPos[0]-p[0],this.manPos[2]-p[2]);
    const root=mul(translation(this.manPos),rotationY(yaw),scaling([s,s,s]));
    const stride=running?Math.sin(time*20)*0.65:0;
    const frames=poseFrames(root,{...REST_POSE,hipL:stride,hipR:-stride,shoulderL:-stride,shoulderR:this.gunTime>=0?1.4:stride,elbowR:this.gunTime>=0?0.1:0.15,headPitch:Math.sin(time*2)*0.025});
    drawBody(out,frames);
    if(this.stage===1) {
      for(const [y,sc] of [[0.2,[0.43,0.055,0.36]],[0.34,[0.26,0.22,0.22]]] as [number,Vec3][]) out.push({mesh:'cylinder',model:mul(frames.head,translation([0,y,0]),scaling(sc)),color:[0.30,0.16,0.075]});
      const gun=mul(frames.foreArmR,translation([0,-0.18,-0.18]));
      out.push({mesh:'box',model:mul(gun,scaling([0.09,0.14,0.38])),color:[0.09,0.095,0.10]});
      if(this.flash>0) out.push({mesh:'sphere',model:mul(gun,translation([0,0,-0.3]),scaling([0.2,0.2,0.4])),color:[1,0.65,0.15],pattern:Pattern.emissive});
    }
    if(this.stage===2) {
      drawPortal(out,EXIT,[1,0,0],1.45,true);
      if(this.tinyOpen) drawPortal(out,TINY_EXIT,[0,0,-1],0.22,true);
    }
  }
  drawPreview(out:DrawItem[],time:number) {out.push(...this.scenery);this.pursuer.draw(out,time);}
  previewCameraShot():CameraShot {return {pos:[-5,3.4,8],target:[3,1.8,-12],sharpness:6};}
  labels():WorldLabel[] {
    const p=this.ctx.player.pos;
    // World labels otherwise draw through walls; show the signs only from their hallway.
    const labels:WorldLabel[]=p[0]<-10&&p[0]>-38&&p[2]<-15 ? [
      {pos:[-37.4,4.35,-19],text:this.stage===0?'A MAN':this.stage===1?'A COWBOY MAN':'A SMALLER MAN',size:0.42},
      {pos:[-37.4,4.35,-27],text:this.stage===2?'AN EVEN BIGGER BEAR':'A BIGGER BEAR',size:0.42},
    ]:[];
    if(this.tinyOpen&&this.room==='man'&&Math.hypot(p[0]-TINY_EXIT[0],p[2]-TINY_EXIT[2])<3) labels.push({pos:[TINY_EXIT[0],0.8,TINY_EXIT[2]],text:'EXIT',size:0.11,color:'#dcb4ff'});
    return labels;
  }
  cameraShot():CameraShot|null {
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


