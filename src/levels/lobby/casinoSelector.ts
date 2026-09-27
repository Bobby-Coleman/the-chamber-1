import { mul, rotationZ, scaling, translation, type Vec3 } from '../../engine/math';

import { Pattern, type DrawItem } from '../../engine/renderer';

import type { LevelContext, WorldLabel } from '../level';

import type { RAPIER } from '../../engine/physics';

import { settings } from '../../game/settings';



/** Three digits today; scales to 100+ chambers without adding another row of buttons. */

export class LevelNumberEntry {

  value = '';

  message = '';

  constructor(readonly count:number,initial=1) {this.message=`AVAILABLE 1–${count}`;this.selected=initial;}

  selected:number;

  digit(n:number) { if(this.value.length<3) this.value+=n; this.message=`AVAILABLE 1–${this.count}`; }

  clear() {this.value='';this.message=`AVAILABLE 1–${this.count}`;}

  backspace() {this.value=this.value.slice(0,-1);}

  confirm():number|null {

    const n=this.value===''?this.selected:Number(this.value);

    if(!Number.isInteger(n)||n<1||n>this.count) {this.message=`NOT BUILT YET · TRY 1–${this.count}`;this.value='';return null;}

    this.selected=n;this.message='GOOD LUCK';return n;

  }

  get display() {return (this.value||String(this.selected)).padStart(3,'0');}

}



export class CasinoSelector {

  readonly entry:LevelNumberEntry;

  private scenery:DrawItem[]=[];

  private keys:{text:string;pos:Vec3;collider:number;press:()=>void}[]=[];

  private pressedUntil=0;

  private pressedKey='';

  private time=0;

  private launching=false;

  private spinTime=-1;

  private spinTarget=1;

  private leverCollider:RAPIER.Collider;

  private wasNear=false;
  private sound:AudioContext|null=null;
  private lastTick=-1;

  constructor(private ctx:LevelContext,count:number,initial:number,private launch:(n:number)=>void) {

    this.entry=new LevelNumberEntry(count,initial);

    const box=(p:Vec3,s:Vec3,c:number[],emissive=false)=>this.scenery.push({mesh:'roundbox',model:mul(translation(p),scaling(s)),color:c,pattern:emissive?Pattern.emissive:Pattern.plain});

    ctx.physics.addStaticBox([0,2.1,-8],[3.5,4.2,1.9]);

    box([0,0.2,-8],[3.9,0.4,2.3],[0.045,0.055,0.065]);

    box([0,2.1,-8],[3.5,4.2,1.9],[0.18,0.035,0.06]);

    box([0,2.35,-6.98],[3.2,3.4,0.18],[0.035,0.045,0.06]);

    box([0,3.3,-6.83],[2.8,1.05,0.1],[0.005,0.025,0.018]);

    box([0,4.4,-7.9],[3.9,0.75,2.1],[0.72,0.47,0.13]);

    box([0,4.4,-6.79],[3.55,0.48,0.09],[0.12,0.035,0.065]);

    for(const s of [-1,1]) box([s*1.66,2.2,-6.92],[0.10,3.8,0.14],[0.92,0.66,0.2],true);

    const addKey=(text:string,x:number,y:number,press:()=>void)=>{

      const pos:Vec3=[x,y,-6.72],collider=ctx.physics.addStaticBox(pos,[0.58,0.33,0.18]);

      const use=()=>{if(this.launching||this.spinTime>=0)return;press();this.pressedKey=text;this.pressedUntil=this.time+0.17;};

      ctx.physics.registerUsable(collider,{highlight:0,use});

      this.keys.push({text,pos,collider:collider.handle,press:use});

    };

    for(let n=1;n<=9;n++) addKey(String(n),((n-1)%3-1)*0.74,2.43-Math.floor((n-1)/3)*0.45,()=>this.entry.digit(n));

    addKey('CLR',-0.74,1.08,()=>this.entry.clear());addKey('0',0,1.08,()=>this.entry.digit(0));

    addKey('PLAY',0.74,1.08,()=>this.confirm());

    this.leverCollider=ctx.physics.addStaticCylinder([2.18,3.45,-7.3],0.28,0.55);

    ctx.physics.registerUsable(this.leverCollider,{highlight:0,use:()=>this.spin()});

  }

  dispose() {void this.sound?.close().catch(()=>{});this.sound=null;}
  private tickSound(stop=false) {
    if(typeof AudioContext==='undefined')return;
    const ctx=this.sound??=new AudioContext();void ctx.resume().catch(()=>{});
    const o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.value=stop?880:220;
    g.gain.setValueAtTime(0.045,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+(stop?0.18:0.035));
    o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+(stop?0.2:0.04));o.onended=()=>{o.disconnect();g.disconnect();};
  }
  spin() {

    if(this.launching||this.spinTime>=0)return;

    this.spinTarget=1+Math.floor(Math.random()*this.entry.count);

    this.spinTime=0;this.lastTick=-1;this.tickSound();this.entry.value='';this.entry.message='CHOOSING YOUR FATE';

  }

  private confirm() {if(this.spinTime>=0)return;const n=this.entry.confirm();if(n!==null){this.launching=true;this.launch(n);}}

  update(dt:number) {

    this.time+=dt;

    if(this.spinTime>=0) {

      this.spinTime+=dt;
      const tick=Math.floor(this.spinTime*12);if(tick!==this.lastTick){this.lastTick=tick;this.tickSound();}

      if(this.spinTime>=2.8) {this.tickSound(true);this.spinTime=-1;this.entry.selected=this.spinTarget;this.entry.value=String(this.spinTarget);this.entry.message='YOUR NEXT CHAMBER - ENTER TO PLAY';}

    }

    if(this.launching)return;

    const {player,input,camera,physics}=this.ctx;

    const near=Math.hypot(player.pos[0],player.pos[2]+6.5)<4.2 && player.pos[2]>-7.3 && player.mode==='control';

    if(!near) {if(this.wasNear)this.ctx.hud.hint('');this.wasNear=false;return;}

    this.wasNear=true;

    if(input.wasPressed('KeyL'))this.spin();

    if(this.spinTime>=0)return;

    for(let n=0;n<=9;n++) if(input.wasPressed(`Digit${n}`)||input.wasPressed(`Numpad${n}`)) this.entry.digit(n);

    if(input.wasPressed('Backspace')||input.wasPressed('Delete'))this.entry.backspace();

    if(input.wasPressed('KeyC'))this.entry.clear();

    if(input.wasPressed('Enter')||input.wasPressed('NumpadEnter'))this.confirm();

    if(input.mousePressed) {

      const dx=camera.target[0]-camera.pos[0],dy=camera.target[1]-camera.pos[1],dz=camera.target[2]-camera.pos[2],d=Math.hypot(dx,dy,dz);

      const hit=physics.raycast(camera.pos,[dx/d,dy/d,dz/d],7,player.collider??undefined);

      const key=this.keys.find(k=>k.collider===hit?.collider.handle);key?.press();

      if(hit?.collider.handle===this.leverCollider.handle)this.spin();

    }

    this.ctx.hud.hint('Type a level · Enter to play · L pull lever · C clear · E use');

  }

  draw(out:DrawItem[]) {

    out.push(...this.scenery);

    const pull=this.spinTime>=0?Math.sin(Math.min(1,this.spinTime/0.65)*Math.PI)*0.95:0;

    const lever=mul(translation([1.95,2.3,-7.3]),rotationZ(-0.2-pull));

    out.push({mesh:'cylinder',model:mul(lever,translation([0,0.55,0]),scaling([0.085,1.2,0.085])),color:[0.7,0.68,0.58],spec:0.8});

    out.push({mesh:'sphere',model:mul(lever,translation([0,1.15,0]),scaling([0.27,0.27,0.27])),color:[0.78,0.03,0.07],spec:0.55});

    for(const x of [-0.44,0.44])out.push({mesh:'box',model:mul(translation([x,3.4,-6.70]),scaling([0.035,0.77,0.04])),color:[0.3,0.27,0.14]});

    for(const key of this.keys) {

      const p:Vec3=[...key.pos];if(this.pressedKey===key.text&&this.time<this.pressedUntil)p[2]-=0.05;

      out.push({mesh:'roundbox',model:mul(translation(p),scaling([0.58,0.33,0.18])),color:key.text==='PLAY'?[0.08,0.5,0.28]:key.text==='CLR'?[0.62,0.12,0.15]:[0.76,0.71,0.58]});

    }

    for(let i=0;i<12;i++) {

      const a=i/12*Math.PI*2;

      out.push({mesh:'sphere',model:mul(translation([Math.cos(a)*1.83,4.4+Math.sin(a)*0.31,-6.76]),scaling([0.065,0.065,0.065])),color:(Math.floor(this.time*4)+i)%3===0?[1,0.9,0.43]:[0.5,0.24,0.045],pattern:Pattern.emissive});

    }

  }

  labels():WorldLabel[] {

    const reels:WorldLabel[]=[];

    const target=String(this.spinTarget).padStart(3,'0');

    for(let i=0;i<3;i++) {

      const spinning=this.spinTime>=0&&this.spinTime<1.6+i*0.5;

      const n=spinning?Math.floor(this.spinTime*19+i*3)%10:Number(this.spinTime>=0?target[i]:this.entry.display[i]);

      const offset=spinning?(this.spinTime*19%1)*0.65:0;

      reels.push({pos:[(i-1)*0.86,3.4-offset,-6.65],text:String(n),size:0.59,color:'#79ffc2'});

      if(spinning&&offset>0.31)reels[reels.length-1]={pos:[(i-1)*0.86,4.05-offset,-6.65],text:String((n+1)%10),size:0.59,color:'#79ffc2'};

    }

    return [

    ...reels,

    {pos:[0,0.63,-6.65],text:settings.lastPlayedLevel?`LAST PLAYED - ${String(settings.lastPlayedLevel).padStart(3,'0')}`:'LAST PLAYED - -',size:0.15,color:'#f9dfa5'},

    {pos:[2.18,3.95,-7.3],text:'RANDOM',size:0.16,color:'#ffe3a0'},

    {pos:[0,4.4,-6.68],text:'PICK YOUR POISON',size:0.22,color:'#ffe3a0'},

    {pos:[0,2.95,-6.70],text:this.entry.message,size:0.115,color:'#f9dfa5'},

    ...this.keys.map(k=>({pos:[k.pos[0],k.pos[1],-6.60] as Vec3,text:k.text,size:k.text.length>1?0.12:0.20,color:'#171b21'})),

  ];}

}

