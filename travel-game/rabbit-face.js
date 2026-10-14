// The original eye shapes lose different pixels when the large atlas is shrunk.
// Draw both expressions on the same integer pixel grid at the final canvas size.
export function drawRabbitFace(c,frame=0,box=[0,0,96,96]){
 const [x,y,w,h]=box,sx=w/96,sy=h/96;
 c.save();
 for(const center of [37,59]){
  const left=Math.round(x+(center-3)*sx),top=Math.round(y+44*sy);
  const block=(px,py,pw,ph,color)=>{c.fillStyle=color;c.fillRect(left+Math.round(px*sx),top+Math.round(py*sy),Math.max(1,Math.round(pw*sx)),Math.max(1,Math.round(ph*sy)));};
  block(-3,-2,12,11,'#fde9d9');
  if(frame){block(0,2,2,2,'#382014');block(1,1,4,2,'#382014');block(4,2,2,2,'#382014');}
  else{block(1,0,4,7,'#382014');block(0,1,6,5,'#382014');block(1,1,4,5,'#29150e');block(1,1,2,2,'#fff8eb');}
 }
 c.restore();
}
