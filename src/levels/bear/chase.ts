import { clamp, type Vec3 } from '../../engine/math';
/** Centreline of the only way out: north, west, south, then west into the choice hall. */
export const CHASE_ROUTE:Vec3[]=[[3,0,-24],[0,0,-31],[0,0,-56],[-23,0,-56],[-23,0,-23],[-56,0,-23]];
export const PATROL_ROUTE:Vec3[]=[[-3,0,-11],[3.5,0,-12],[4,0,-17],[-2,0,-18],[-4,0,-15]];
export function pathDistance(p:Vec3,route:Vec3[]) {
  let along=0,best=Infinity,result=0;
  for(let i=1;i<route.length;i++) {
    const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    const t=clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/(length*length),0,1);
    const distance=Math.hypot(p[0]-a[0]-dx*t,p[2]-a[2]-dz*t);
    if(distance<best){best=distance;result=along+t*length;}
    along+=length;
  }
  return result;
}
export function distanceToPath(p:Vec3,route:Vec3[]) {
  let best=Infinity;
  for(let i=1;i<route.length;i++) {
    const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[2]-a[2];
    const t=clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/(dx*dx+dz*dz),0,1);
    best=Math.min(best,Math.hypot(p[0]-a[0]-dx*t,p[2]-a[2]-dz*t));
  }
  return best;
}
/** Tension comes from actual changes in pace, never teleporting the bear. Stopping is unsafe. */
export function pursuitSpeed(gap:number,time:number,moving:boolean,finalApproach:boolean) {
  if(!moving)return 8.8;
  const breathingRoom=finalApproach?5.8:6.8+2.6*Math.sin(time*1.1);
  return clamp(8.5+(gap-breathingRoom)*1.25,6.4,11.7);
}
export const FOREST_TRAIL:Vec3[]=[[0,0,6],[-3.5,0,-4],[-3.5,0,-7],[0,0,-10],[0,0,-16],[3,0,-22],[3,0,-24],[0,0,-30]];
