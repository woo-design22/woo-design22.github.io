import {ROUTES} from './model.js?v=6.12.0';
const colors=['#789581','#8b9b92','#8499ab','#b79b85','#86a7a1','#b0a9bb','#baaa7e','#73978b'];
const taxiForms={tokyo:'van',lhr:'cab',hawaii:'minivan',ams:'wagon',cph:'wagon',yvr:'suv',jeju:'suv',dps:'van',bkk:'sedan',dxb:'sedan',moon:'pod',stars:'pod',chengdu:'sedan'};
export const TRANSPORT_TYPES=['bus','limousine','taxi','train','subway'];
export function vehicleDesign(route='incheon',id='bus'){
 const index=route==='incheon'?31:Math.max(0,ROUTES.findIndex(r=>r.id===route)),n=index%8;
 return {id,route,index,color:colors[n],trim:colors[(n+3)%8],taxiForm:taxiForms[route]||['sedan','wagon','suv'][index%3],length:212+(index%4)*8+Math.floor(index/4)*2,windows:4+index%3,roofStep:Math.floor(index/4)%3,doorOffset:index%4*3,deck:id==='bus'&&route==='lhr'?2:1,articulated:id==='bus'&&['paris','sin','ist'].includes(route),front:id==='train'?'streamlined':id==='subway'?'flat':id==='limousine'?'raised':id==='taxi'?'bonnet':'upright',axles:id==='limousine'?3:2,cars:id==='subway'?3:id==='train'?2:1};
}
export function vehicleShapes(route,id){
 const d=vehicleDesign(route,id),a=[],ink='#48584e',rubber='#3c4944',cream='#eee4ca',light='#faf4df',glass='#597b80',reflection='#abc4bd',accent=d.color;
 const r=(x,y,w,h,fill)=>a.push({type:'rect',x,y,w,h,fill}),poly=(points,fill)=>a.push({type:'poly',points,fill}),oval=(x,y,rx,ry,fill)=>a.push({type:'oval',x,y,rx,ry,fill});
 const wheel=(x,y,rad=12)=>{oval(x,y,rad,rad,rubber);oval(x,y,rad-3,rad-3,'#7b847b');oval(x,y,rad-6,rad-6,'#b8bdae');r(x-2,y-2,4,4,'#536056');for(const [dx,dy]of[[-5,0],[5,0],[0,-5],[0,5]])r(x+dx-1,y+dy-1,2,2,'#e0ddc9');};
 const pane=(x,y,w,h)=>{r(x,y,w,h,ink);r(x+2,y+2,w-4,h-4,glass);poly([[x+3,y+3],[x+w-4,y+3],[x+3,y+h-5]],reflection);r(x+4,y+h-5,w-8,2,'#76958f');};
 oval(180,139,128,5,'#4c624526');
 if(id==='taxi'){
  const x=87-(d.index%4)*3,w=166+(d.index%4)*6,van=['van','cab','minivan','suv'].includes(d.taxiForm),roof=van?58:72;
  poly([[x,121],[x+3,101],[x+20,95],[x+34,roof],[x+105,roof-2],[x+128,93],[x+w-7,101],[x+w,121],[x+w-5,131],[x+5,131]],ink);
  poly([[x+3,119],[x+7,104],[x+25,98],[x+38,roof+3],[x+103,roof+2],[x+125,97],[x+w-9,105],[x+w-3,120],[x+w-8,127],[x+8,127]],d.taxiForm==='cab'?'#5c6661':cream);
  const glassY=roof+7;pane(x+39,glassY,31,91-glassY);pane(x+73,glassY,30,91-glassY);poly([[x+107,glassY],[x+123,94],[x+107,94]],glass);
  r(x+6,113,w-12,7,accent);r(x+72,96,2,29,'#9caa98');r(x+44,100,9,2,ink);r(x+86,100,9,2,ink);r(x+57,roof-7,29,7,ink);r(x+60,roof-6,23,5,'#dfc681');for(let k=0;k<3;k++)r(x+65+k*5,roof-5,2,2,ink);
  r(x+w-13,106,10,5,'#f8e8a4');r(x+3,106,5,9,'#bc7c64');r(x+w-24,123,13,3,ink);r(x+9,125,w-18,3,'#b9baa4');wheel(x+32,129,13);wheel(x+w-30,129,13);
  if(d.taxiForm==='cab'){r(x+9,77,17,22,'#59625a');pane(x+12,80,11,13);r(x+6,105,8,2,'#eee1b7');}if(d.taxiForm==='pod'){poly([[x+22,94],[x+36,63],[x+73,53],[x+111,70],[x+127,94]],glass);r(x+50,109,40,3,'#9cbbb6');}
 }else if(['bus','limousine'].includes(id)){
  const coach=id==='limousine',x=180-d.length/2,w=d.length,y=coach?42:d.deck===2?26:58,h=coach?91:d.deck===2?106:74,front=coach?24:10;
  poly([[x,y+9],[x+9,y],[x+w-front,y],[x+w-6,y+12],[x+w,y+h-10],[x+w-7,y+h],[x+5,y+h],[x,y+h-8]],ink);
  poly([[x+3,y+10],[x+11,y+3],[x+w-front-2,y+3],[x+w-9,y+14],[x+w-3,y+h-11],[x+w-9,y+h-3],[x+7,y+h-3],[x+3,y+h-9]],cream);
  r(x+6,y+h-29,w-13,23,accent);r(x+8,y+3,w-front-12,3,light);r(x+28,y-5,48+d.roofStep*12,5,'#b1b8a4');r(x+32,y-6,40+d.roofStep*12,2,'#e2dec7');
  if(coach){for(let k=0;k<d.windows;k++)pane(x+10+k*(w-55)/d.windows,y+12,(w-55)/d.windows-3,31);poly([[x+w-39,y+10],[x+w-23,y+8],[x+w-10,y+21],[x+w-7,y+58],[x+w-30,y+55]],glass);r(x+6,y+49,w-17,3,'#cfb479');for(let k=0;k<4;k++){const bx=x+44+k*37+d.doorOffset;r(bx,y+62,33,18,'#718979');r(bx+1,y+63,31,16,accent);r(bx+13,y+66,8,2,'#d6d6ba');}r(x+w-40,y+61,14,25,'#738574');pane(x+w-37,y+63,8,11);wheel(x+35,y+h-1,13);wheel(x+72,y+h-1,13);wheel(x+w-39,y+h-1,13);}
  else{const rowY=d.deck===2?y+12:y+11;for(let k=0;k<d.windows;k++)pane(x+11+k*(w-45)/d.windows,rowY,(w-45)/d.windows-4,d.deck===2?25:29);if(d.deck===2)for(let k=0;k<d.windows;k++)pane(x+11+k*(w-45)/d.windows,y+47,(w-45)/d.windows-4,25);const doorY=d.deck===2?y+44:y+9;for(const dx of [x+64+d.doorOffset,x+w-41]){r(dx,doorY,21,h-(doorY-y)-5,ink);pane(dx+2,doorY+2,8,d.deck===2?34:34);pane(dx+11,doorY+2,8,34);r(dx+2,y+h-12,17,3,'#dac79c');}r(x+w-24,y+8,14,33,glass);r(x+8,y+h-35,31,9,'#798f7c');for(let k=0;k<3;k++)r(x+11,y+h-33+k*2,25,1,ink);wheel(x+34,y+h-1,12);wheel(x+w-37,y+h-1,12);}
  if(d.articulated){r(x+w*.5,y+5,16,h-8,ink);for(let k=0;k<5;k++)r(x+w*.5+2+k*3,y+7,1,h-12,'#899181');}
  r(x+w-9,y+h-23,5,6,'#f4df99');r(x+2,y+h-25,3,9,'#bb7963');r(x+w-2,y+20,7,3,ink);r(x+w+3,y+20,3,16,ink);r(x+w-25,y+h-8,10,3,'#e6d7a4');
 }else{
  const metro=id==='subway',carW=metro?88+d.index%3*3:138,gap=5,start=metro?33:39,roofY=metro?62+d.index%3*2:56,height=metro?58+Math.floor(d.index/4)%4*3:68;
  for(let car=0;car<d.cars;car++){
   const x=start+car*(carW+gap),front=car===d.cars-1,nose=metro?4+Math.floor(d.index/8)*4:26;
   poly([[x,roofY+9],[x+7,roofY],[x+carW-(front?nose:7),roofY],[x+carW,roofY+(front?metro?13:38:7)],[x+carW,roofY+height-5],[x+carW-7,roofY+height],[x+4,roofY+height],[x,roofY+height-6]],ink);
   poly([[x+3,roofY+10],[x+9,roofY+3],[x+carW-(front?nose+2:9),roofY+3],[x+carW-3,roofY+(front?metro?14:39:9)],[x+carW-3,roofY+height-7],[x+carW-9,roofY+height-3],[x+6,roofY+height-3]],cream);
   r(x+4,roofY+height-22,carW-8,11,accent);r(x+5,roofY+height-11,carW-10,3,'#b3bca8');
   const count=metro?2:d.windows-1,usable=carW-(front?nose:6)-9;
   for(let k=0;k<count;k++)pane(x+7+k*usable/count,roofY+12,Math.floor(usable/count)-4,metro?22:25);
   if(metro){for(const dx of [x+14+d.doorOffset/3,x+53+d.doorOffset/3]){r(dx,roofY+11,16,height-17,ink);r(dx+1,roofY+12,14,height-19,'#c5d0bd');pane(dx+2,roofY+14,5,20);pane(dx+9,roofY+14,5,20);r(dx+8,roofY+12,1,height-19,'#718378');}}
   else{r(x+10,roofY+11,12,height-19,'#b7c7b3');pane(x+12,roofY+14,8,20);r(x+21,roofY+12,1,height-21,ink);}
   r(x+20,roofY-5,28+d.roofStep*6,5,'#879b89');r(x+23,roofY-7,23+d.roofStep*6,2,'#dce0c7');
   if(front){if(metro){r(x+carW-14,roofY+10,10,29,glass);r(x+carW-13,roofY+11,7,4,reflection);}else poly([[x+carW-30,roofY+9],[x+carW-23,roofY+10],[x+carW-5,roofY+36],[x+carW-6,roofY+43],[x+carW-25,roofY+32]],glass);r(x+carW-9,roofY+height-17,5,4,'#efe3ac');}
   r(x+12,roofY+height,carW-24,5,'#718174');wheel(x+20,roofY+height+5,7);wheel(x+carW-20,roofY+height+5,7);if(car<d.cars-1){r(x+carW,roofY+15,gap,height-23,'#56665a');for(let k=1;k<gap;k+=2)r(x+carW+k,roofY+16,1,height-25,'#8d9a87');}
  }
  if(!metro){const x=start+34;r(x,roofY-10,28,3,ink);poly([[x+3,roofY-10],[x+11,roofY-20],[x+24,roofY-10],[x+14,roofY-5]],'#7e8d80');r(x+4,roofY-21,24,2,ink);}
 }
 // A city-specific maker panel changes construction too, rather than just tinting the body.
 const panelX=70+d.index%4*7;for(let k=0;k<1+Math.floor(d.index/8);k++)r(panelX+k*5,118,3,3,'#bfa86f');
 return a;
}
export function drawVehicleModel(c,route,id,night=false,box=[0,0,360,150]){const shapes=vehicleShapes(route,id);c.save();c.translate(box[0],box[1]);c.scale(box[2]/360,box[3]/150);c.imageSmoothingEnabled=false;for(const s of shapes){c.fillStyle=s.fill;if(s.type==='rect')c.fillRect(s.x,s.y,s.w,s.h);else if(s.type==='oval'){c.beginPath();c.ellipse(s.x,s.y,s.rx,s.ry,0,0,Math.PI*2);c.fill();}else{c.beginPath();s.points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}}if(night){c.fillStyle='#223c4a26';c.fillRect(0,15,360,130);}c.restore();return true;}
export function vehicleSVG(route,id){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 150" shape-rendering="crispEdges" aria-hidden="true">${vehicleShapes(route,id).map(s=>s.type==='rect'?`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill}"/>`:s.type==='oval'?`<ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}"/>`:`<polygon points="${s.points.map(x=>x.join(',')).join(' ')}" fill="${s.fill}"/>`).join('')}</svg>`;}
