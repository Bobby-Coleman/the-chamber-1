import { mul, rotationX, rotationZ, scaling, translation, type Vec3 } from '../../engine/math';
import type { DrawItem, MeshName } from '../../engine/renderer';

/** The same entrance tree changes across attempts, before the player reaches the forest. */
export function drawForestLandmark(out:DrawItem[],stage:number,time:number) {
  const bark=[0.25,0.13,0.055],wood=[0.86,0.63,0.32];
  const part=(p:Vec3,s:Vec3,color:number[],mesh:MeshName='sphere',rz=0)=>out.push({mesh,model:mul(translation(p),rotationZ(rz),scaling(s)),color});
  if(stage===0) {
    part([4.5,3.4,1.8],[0.48,6.8,0.48],bark,'cylinder');
    for(let i=0;i<4;i++)part([4.5,4.2+i*0.85,1.8],[2.1-i*0.35,3,2.1-i*0.35],[0.07,0.18,0.085],'cone');
    return;
  }
  // Broken stump and a fallen trunk across the right side; the left trail stays open.
  part([6.4,0.38,1.8],[0.6,0.76,0.6],bark,'cylinder');
  part([6.4,0.78,1.8],[0.52,0.06,0.52],wood,'cylinder');
  if(stage===1)part([3.4,0.65,1.8],[0.5,5.4,0.5],bark,'cylinder',Math.PI/2);
  else {
    part([1.3,0.65,1.8],[0.5,1.2,0.5],bark,'cylinder',Math.PI/2);
    part([4.6,0.65,1.8],[0.5,3,0.5],bark,'cylinder',Math.PI/2);
    // Pale exposed wood tapers to a narrow core: a real hourglass silhouette, not a painted spot.
    part([2.2,0.65,1.8],[0.49,0.6,0.49],wood,'cone',-Math.PI/2);
    part([2.8,0.65,1.8],[0.49,0.6,0.49],wood,'cone',Math.PI/2);
    part([2.5,0.65,1.8],[0.12,0.65,0.12],wood,'cylinder',Math.PI/2);
    for(let i=0;i<20;i++)part([2.5+Math.sin(i*2.4)*(0.4+i*.025),0.055,2.2+Math.cos(i*1.7)*0.65],[0.14,0.05,0.07],wood,'box',i);
    const chew=Math.sin(time*15),bob=chew*0.025;
    const fur=[0.36,0.19,0.08],dark=[0.075,0.045,0.025];
    // Broad flat paddle tail, squat body, small ears and oversized front teeth.
    part([2.5,0.13,3.65],[0.36,0.11,0.73],dark);
    for(let i=0;i<7;i++)part([2.5,0.235,3.25+i*.13],[0.56,0.012,0.024],[0.16,0.105,0.06],'box');
    part([2.5,0.56,3.0],[0.46,0.53,0.67],fur);
    part([2.5,0.89+bob,2.43],[0.35,0.33,0.34],fur);
    part([2.5,0.74+bob,2.13],[0.25,0.17,0.2],[0.63,0.42,0.22]);
    part([2.5,0.8+bob,1.99],[0.11,0.075,0.075],dark);
    for(const side of [-1,1]) {
      part([2.5+side*.27,1.14+bob,2.47],[0.1,0.12,0.075],dark);
      part([2.5+side*.22,0.96+bob,2.19],[0.05,0.06,0.045],dark);
      part([2.5+side*.225,0.98+bob,2.153],[0.015,0.018,0.01],[1,1,1]);
      part([2.5+side*.066,0.62+bob,2.0],[0.105,0.18,0.08],[1,0.9,0.63],'box');
      part([2.5+side*.34,0.5,2.42],[0.14,0.15,0.25],dark);
      part([2.5+side*.35,0.14,3.08],[0.18,0.13,0.29],dark);
    }
    // A few fresh chips flick outward with each chewing cycle.
    for(let i=0;i<3;i++){const t=(time*2+i/3)%1;part([2.5+(i-1)*t*.65,0.6+t*.7-t*t*1.2,2.02+t*.65],[0.06,0.035,0.045],wood,'box',time*4+i);}
  }
  part([0.68,0.65,1.8],[0.44,0.035,0.44],wood,'cylinder',Math.PI/2);
  for(const side of [-1,1]) {
    part([5.1,0.55,1.8+side*.65],[0.12,1.8,0.12],bark,'cylinder',side*.8);
    out.push({mesh:'cone',model:mul(translation([5.1,0.7,1.8+side*1.1]),rotationX(side*1.1),scaling([0.85,2,0.85])),color:[0.07,0.18,0.085]});
  }
}
