import {AVATAR_EYES} from './avatar-eye-data.js?v=6.5.1';
export function travelerEyes(id=7,frame=0,walking=false){return AVATAR_EYES[walking?'walk':'seated'][Math.max(0,Math.min(11,Math.floor(id)))][frame?1:0];}
export function travelerFaceOffset(id=7,frame=0,walking=false){const [left,right]=travelerEyes(id,frame,walking);return 48-(left[0]+right[0])/2;}
// Lens centers are measured in each 32px accessory drawing, not its blank box.
const lenses={round:[9,24,15],oval:[9,24,14.5],cat:[8,24,15],butterfly:[8,24,15],heart:[8,24,14.5],aviator:[8,23,16],square:[8,24,15.5],rimless:[8,24,15.5],half:[8,24,15.5],flower:[7.5,23.5,14.5],star:[7.5,23.5,14.5],sport:[8.5,23.5,15],
 'round-glasses':[8.5,23.5,16],'amber-glasses':[8,24,15],'sage-sunglasses':[7.5,24.5,16],'rose-glasses':[8,24,14.5]};
export function eyewearBox(id,frame,walking,item,[x,y,w,h]){
 const [left,right]=travelerEyes(id,frame,walking),shift=travelerFaceOffset(id,frame,walking);
 const [a,b,cy]=lenses[item.startsWith('sun-')?item.slice(4):item]||lenses.round;
 const width=(right[0]-left[0])*32/(b-a),height=Math.max(26,Math.min(36,width*.65));
 return [x+(left[0]+shift-a*width/32)*w/96,y+((left[1]+right[1])/2-cy*height/32)*h/96,width*w/96,height*h/96];
}
