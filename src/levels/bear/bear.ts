import { mul, rotationY, rotationZ, scaling, translation, type Vec3 } from '../../engine/math';
import { Pattern, type DrawItem, type MeshName } from '../../engine/renderer';
import { RAPIER, type Physics } from '../../engine/physics';

/** Broad shoulders, round ears, short tail and heavy paws distinguish the bear from the puppy. */
export class Bear {
  pos: Vec3;
  yaw = Math.PI;
  gait = 0;
  moving = false;
  attack = 0;
  readonly body: RAPIER.RigidBody;
  constructor(physics: Physics, pos: Vec3, readonly size = 1, readonly teddy = false) {
    this.pos = [...pos];
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...pos));
    const shapes = teddy
      ? [[0, 2.3, 0, 1.65, 2.2, 1.25], [0, 5.0, 0, 1.4, 1.3, 1.15]]
      : [[0, 1.35, 0, 0.9, 1.1, 1.5], [0, 1.65, 1.4, 0.7, 0.75, 0.8]];
    for (const [x,y,z,w,h,d] of shapes) physics.world.createCollider(RAPIER.ColliderDesc.cuboid(w*size,h*size,d*size).setTranslation(x*size,y*size,z*size).setFriction(0.1), this.body);
  }
  update(dt: number) {
    if (this.moving) this.gait += dt * 11;
    this.attack = Math.max(0, this.attack - dt);
    this.body.setNextKinematicTranslation({ x: this.pos[0], y: this.pos[1], z: this.pos[2] });
    this.body.setNextKinematicRotation({x:0,y:Math.sin(this.yaw/2),z:0,w:Math.cos(this.yaw/2)});
  }
  draw(out: DrawItem[], time: number) {
    const root = mul(translation(this.pos), rotationY(this.yaw), scaling([this.size,this.size,this.size]));
    const fur = this.teddy ? [0.65,0.34,0.14] : [0.22,0.12,0.065];
    const muzzle = this.teddy ? [0.93,0.73,0.44] : [0.51,0.34,0.20], dark = [0.025,0.018,0.014];
    const part = (p: Vec3,s: Vec3,c: number[],mesh: MeshName = 'sphere', angle = 0) => out.push({mesh,model:mul(root,translation(p),rotationZ(angle),scaling(s)),color:c});
    if (this.teddy) {
      part([0,2.5,0],[1.85,2.3,1.3],fur); part([0,2.5,1.1],[1.3,1.6,0.35],muzzle);
      part([0,5.1,0],[1.6,1.4,1.25],fur); part([0,4.8,1.12],[0.9,0.62,0.46],muzzle);
      part([0,5.02,1.54],[0.3,0.2,0.13],dark);
      for (const s of [-1,1]) {
        part([s*1.24,6.1,0],[0.56,0.63,0.36],fur); part([s*1.24,6.1,0.3],[0.32,0.4,0.1],muzzle);
        part([s*0.64,5.4,1.08],[0.19,0.2,0.12],dark);
        for (const dx of [-0.045,0.045]) part([s*0.64+dx,5.4,1.197],[0.024,0.028,0.008],[0.85,0.71,0.5]);
        part([s*1.55,0.75,0.7],[0.95,0.76,1.2],fur); part([s*1.55,0.75,1.7],[0.6,0.48,0.17],muzzle);
        part([s*1.9,2.9,0.1],[0.7,1.55,0.7],fur,'sphere',s*0.24);
        part([s*0.44,3.95,1.03],[0.65,0.35,0.18],[0.64,0.025,0.045],'sphere',s*0.3);
      }
      part([0,3.95,1.17],[0.23,0.24,0.13],[0.82,0.06,0.06]);
      for(let y=1.2;y<3.8;y+=0.18) part([0,y,1.41],[0.09,0.025,0.016],[0.35,0.19,0.09],'box',0.45);
      for(let x=-0.36;x<=0.36;x+=0.09) part([x,4.56+0.18*Math.abs(x),1.55],[0.05,0.022,0.012],dark,'box');
      return;
    }
    const bob = this.moving ? Math.abs(Math.sin(this.gait))*0.1 : Math.sin(time*1.6)*0.025;
    part([0,1.42+bob,-0.15],[1,1.12,1.68],fur);
    part([0,1.87+bob,0.65],[1.1,1.2,1.05],fur);
    part([0,1.91+bob,1.5],[0.82,0.82,0.83],fur);
    part([0,1.66+bob,2.09],[0.56,0.37,0.58],muzzle);
    part([0,1.82+bob,2.56],[0.29,0.19,0.17],dark);
    part([0,1.4+bob,2.18],[0.39,0.07+this.attack*0.13,0.36],dark);
    part([0,1.1,-1.73],[0.26,0.27,0.25],fur);
    for (const s of [-1,1]) {
      part([s*0.63,2.56+bob,1.36],[0.31,0.34,0.22],fur);
      part([s*0.63,2.56+bob,1.55],[0.17,0.19,0.06],muzzle);
      part([s*0.35,2.07+bob,2.16],[0.10,0.095,0.06],[0.68,0.42,0.09]);
      part([s*0.35,2.07+bob,2.21],[0.045,0.068,0.018],dark);
      for(const z of [-1,0.95]) {
        const wave = this.moving ? Math.sin(this.gait+(s*z>0?0:Math.PI)) : 0;
        const swipe = z>0 && s===-1 ? Math.sin(this.attack*Math.PI)*0.9 : 0;
        part([s*0.78,0.65+Math.max(0,wave)*0.26+swipe,z+wave*0.27],[0.41,0.67,0.43],fur);
        part([s*0.78,0.24+Math.max(0,wave)*0.26+swipe,z+0.22+wave*0.27],[0.44,0.26,0.58],fur);
        for(let c=-1;c<=1;c++) part([s*0.78+c*0.19,0.16+Math.max(0,wave)*0.26+swipe,z+0.72+wave*0.27],[0.045,0.06,0.19],[0.77,0.69,0.50]);
      }
    }
  }
}
