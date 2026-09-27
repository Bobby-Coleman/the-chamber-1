import type { LevelContext } from '../levels/level';
import { BearLevel, resetBearStory } from '../levels/bear/bearLevel';
/** Manual-time controls for repeatable visual QA; excluded from production. */
export function bearQa(ctx:LevelContext, level:()=>BearLevel, restart:()=>void,tick:(dt:number)=>void,draw:()=>void) {
  const panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:10px;left:10px;background:#17201eee;padding:10px;color:white;z-index:1000;font:12px system-ui;max-width:900px';
  const actions=new Map<string,()=>void>();
  const info=document.createElement('div');
  const step=(s:number)=>{for(let t=0;t<s;t+=1/60)tick(1/60);};
  const place=(pos:[number,number,number],yaw=0)=>{ctx.player.reset(pos);ctx.player.emerge([pos[0],pos[1]+0.95,pos[2]],yaw,[0,0,0],0);ctx.player.gettingUp=false;ctx.player.stun=0;ctx.camera.reset(yaw);step(0.1);};
  const btn=(name:string,fn:()=>void)=>{actions.set(name,fn);const b=document.createElement('button');b.textContent=name;b.style.cssText='padding:7px;margin:3px';b.onclick=()=>{fn();draw();const l=level() as any;info.textContent=JSON.stringify({stage:l.stage,phase:l.phase,room:l.room,pos:ctx.player.pos,gun:l.gunTime,tiny:l.tinyOpen});};panel.append(b);};
  btn('Start',()=>{resetBearStory();restart();step(5);place([0,0,5]);});
  btn('Forest',()=>{place([-3,0,-10]);});
  btn('Chase',()=>{place([-3,0,-18]);step(1.4);});
  btn('Doors',()=>{const l=level() as any;l.setPhase('chase');l.pursuer.pos=[-8,0,-24];place([-25,0,-23],Math.PI/2);});
  btn('Man',()=>{const l=level() as any;l.setPhase('chase');place([-40,0,-19],Math.PI/2);place([-45.5,0,-17],Math.PI/2);});
  btn('Talk',()=>{(level() as any).talk();step(0.1);});
  btn('Leave man',()=>{place([-41,0,-19],-Math.PI/2);step(0.4);});
  btn('Bear',()=>{(level() as any).setPhase('chase');place([-40,0,-27],Math.PI/2);place([-43,0,-29],Math.PI/2);step(0.25);});
  btn('Teddy front',()=>{place([-42,0,-29],Math.PI/2);});
  btn('Behind teddy',()=>{place([-54,0,-32],0);});
  btn('Exit',()=>{place([-56.5,0,-29],Math.PI/2);step(1);});
  btn('+0.3s',()=>step(0.3));btn('+1s',()=>step(1));btn('+5s',()=>step(5));
  btn('Hide controls',()=>{panel.style.display='none';});
  panel.append(info);document.body.append(panel);step(5);
  const params=new URLSearchParams(location.search);
  for(let i=0;i<Math.min(2,Number(params.get('visit'))||0);i++){(level() as any).die(true);restart();step(5);}
  const scene=params.get('scene'); if(scene)actions.get(scene)?.();
  if(params.has('advance'))step(Number(params.get('advance'))||0);
  if(params.has('clean'))panel.style.display='none';
  draw();
}
