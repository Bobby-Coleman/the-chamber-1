import { mul, rotationX, rotationY, rotationZ, scaling, translation, type Vec3 } from '../../engine/math';
import { Pattern, type DrawItem, type MeshName } from '../../engine/renderer';
import { GROUPS_QUERY_WORLD, RAPIER, type Physics } from '../../engine/physics';

/** Broad shoulders, round ears, short tail and heavy paws distinguish the bear from the puppy. */
export class Bear {
  pos: Vec3;
  yaw = Math.PI;
  gait = 0;
  moving = false;
  attack = 0;
  private previous:Vec3;
  private controller:RAPIER.KinematicCharacterController;
  readonly body: RAPIER.RigidBody;
  constructor(physics: Physics, pos: Vec3, readonly size = 1, readonly teddy = false) {
    this.pos = [...pos];this.previous=[...pos];
    this.controller=physics.world.createCharacterController(0.03);
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...pos));
    const shapes = teddy
      ? [[0, 2.3, 0, 1.65, 2.2, 1.25], [0, 5.0, 0, 1.4, 1.3, 1.15]]
      : [[0, 1.04, 0, 0.55, 0.61, 1.1], [0, 1.24, 1.25, 0.37, 0.36, 0.56]];
    for (const [x,y,z,w,h,d] of shapes) physics.world.createCollider(RAPIER.ColliderDesc.cuboid(w*size,h*size,d*size).setTranslation(x*size,y*size,z*size).setFriction(0.1), this.body);
  }
  move(dx:number,dz:number) {
    this.controller.computeColliderMovement(this.body.collider(0),{x:dx,y:0,z:dz},undefined,GROUPS_QUERY_WORLD,c=>c.parent()?.handle!==this.body.handle);
    const movement=this.controller.computedMovement();this.pos[0]+=movement.x;this.pos[2]+=movement.z;
  }
  update(dt: number) {
    const distance=Math.hypot(this.pos[0]-this.previous[0],this.pos[2]-this.previous[2]);
    if(this.moving)this.gait+=distance*3.4/this.size;
    this.previous=[...this.pos];
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
    const bob = this.moving ? Math.sin(this.gait*2)*0.035 : Math.sin(time*1.6)*0.012;
    // A long rib cage, tucked belly and raised shoulder ridge instead of stacked spherical blobs.
    part([0,1.07+bob,-0.12],[1.12,1.12,2.25],fur,'roundbox');
    part([0,1.12+bob,-0.72],[0.59,0.63,0.66],fur);
    part([0,1.42+bob,0.34],[0.65,0.70,0.68],fur);
    part([0,1.18+bob,0.82],[0.46,0.51,0.57],fur);
    part([0,1.30+bob,1.22],[0.43,0.42,0.52],fur);
    part([0,1.13+bob,1.61],[0.5,0.3,0.65],muzzle,'roundbox');
    part([0,1.19+bob,1.94],[0.19,0.12,0.09],dark);
    part([0,1.00+bob,1.62],[0.22,0.025+this.attack*0.07,0.27],dark);
    part([0,0.92,-1.24],[0.15,0.16,0.17],fur);
    for (const side of [-1,1]) {
      part([side*0.31,1.65+bob,1.07],[0.16,0.19,0.12],fur);
      part([side*0.31,1.65+bob,1.17],[0.09,0.11,0.035],muzzle);
      part([side*0.285,1.40+bob,1.61],[0.049,0.046,0.025],dark);
      part([side*0.29,1.48+bob,1.55],[0.14,0.07,0.08],fur);
      for(const z of [-0.79,0.72]) {
        const wave=this.moving?Math.sin(this.gait+(side*z>0?0:Math.PI)):0;
        const lift=Math.max(0,wave)*0.18;
        const swipe=z>0&&side===-1?Math.sin(this.attack*Math.PI)*0.65:0;
        const leg=mul(root,translation([side*0.43,0.84,z]),rotationX(wave*0.24-swipe));
        out.push({mesh:'roundbox',model:mul(leg,translation([0,-0.27,0]),scaling([0.3,0.63,0.37])),color:fur});
        part([side*0.45,0.29+lift+swipe,z+wave*0.18],[0.17,0.27,0.2],fur);
        part([side*0.45,0.14+lift+swipe,z+0.16+wave*0.18],[0.21,0.13,0.33],fur);
        for(let c=-1;c<=1;c++)part([side*0.45+c*0.09,0.11+lift+swipe,z+0.44+wave*0.18],[0.023,0.03,0.095],[0.49,0.43,0.32]);
      }
    }
  }
}
