import {currentLook} from './wardrobe-model.js?v=6.11.0';
// Original pixel scenery built from simple shapes. All art works offline.
import {destination} from './journey-model.js?v=6.11.0';
import {STYLES} from './passenger-model.js?v=6.11.0';
import {drawTraveler} from './avatar-art.js?v=6.11.0';
import {eyewearBox} from './avatar-anchors.js?v=6.11.0';
import {drawNeighborhood} from './city-streets.js?v=6.11.0';
import {shopItem} from './shopping.js?v=6.11.0';
import {drawEnvironment} from './environment-art.js?v=6.11.0';
import {drawItemArt} from './item-art.js?v=6.11.0';
import {drawCase} from './generated-art.js?v=6.11.0';
const guests=typeof Image==='undefined'?null:new Image();if(guests)guests.src=new URL('./assets/guests-motion.png',import.meta.url).href;
const walkers=typeof Image==='undefined'?null:new Image();if(walkers)walkers.src=new URL('./assets/guests-walk-v4.png',import.meta.url).href;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rect=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function text(c,s,x,y,col='#748370',size=9){c.font=`${size}px Neo,monospace`;c.fillStyle=col;c.fillText(s,x,y);}
function outline(c,x,y,w,h,col,edge='#879780'){rect(c,x-2,y-2,w+4,h+4,edge);rect(c,x,y,w,h,col);}
function plant(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);rect(c,-8,0,16,14,'#b8a789');rect(c,-10,-3,20,4,'#a19075');rect(c,-1,-25,3,24,'#87967c');rect(c,-10,-23,11,7,'#93a489');rect(c,1,-33,10,9,'#adbaa0');rect(c,-6,-39,7,9,'#8b9b80');c.restore();}
function chair(c,x,y,col='#a1b099'){outline(c,x,y,38,43,col);rect(c,x-3,y+38,46,9,'#bec8af');rect(c,x+2,y+46,4,17,'#879781');rect(c,x+33,y+46,4,17,'#879781');}
function suitcase(c,x,y,col='#a1b099',scale=1,label=''){c.save();c.translate(x,y);c.scale(scale,scale);outline(c,0,0,23,31,col,'#6c8270');rect(c,7,-7,10,6,'#748773');rect(c,10,-5,4,4,'#e9e8da');rect(c,5,7,13,2,'#d7dec9');rect(c,5,19,13,2,'#7e9780');rect(c,3,32,4,4,'#6c8270');rect(c,16,32,4,4,'#6c8270');if(label){rect(c,17,10,11,8,'#eeead9');text(c,label,18,16,'#809078',5);}c.restore();}
function sky(c,x,y,w,h,j,t=0){
 const night=j?.departure==='night',dusk=j?.departure==='evening';const route=j?.routeId||'jeju';const coastal=['jeju','hawaii','dps','dad','moon','syd','akl','sin','bcn','sfo','lim'].includes(route);const cold=['zrh','kef','hel','yvr'].includes(route),desert=route==='dxb';
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();rect(c,x,y,w,h,night?'#364a5a':dusk?'#b6aaa6':'#b8d0cb');
 if(night){rect(c,x+w*.77,y+12,10,10,'#dddcc3');rect(c,x+w*.78+4,y+10,7,8,'#364a5a');for(let i=0;i<9;i++)rect(c,x+11+(i*37)%w,y+10+(i*19)%(h*.38),1,1,'#c8d1c6');}
 else{rect(c,x+w*.78,y+14,12,12,dusk?'#dfbfa1':'#e5e5bb');for(let i=0;i<3;i++){const cx=x+((i*69+t*1.4)%(w+44))-22,cy=y+15+i*14;rect(c,cx,cy,32,4,'#dbe4d7');rect(c,cx+8,cy-4,19,4,'#dbe4d7');}}
 if(coastal){rect(c,x,y+h*.57,w,h*.43,night?'#466274':'#90b8bb');for(let i=0;i<7;i++)rect(c,x+15+(i*43)%w,y+h*.65+(i*11)%(h*.25),20+i%3*8,1,night?'#748988':'#b8d1c9');rect(c,x,y+h*.89,w,h*.11,'#c4c5a2');}
 else rect(c,x,y+h*.70,w,h*.3,cold?'#cbd5cf':desert?'#c9b194':'#acbaa1');
 if(cold||route==='jeju'||route==='tokyo'){const mx=x+w*.52,my=y+h*.65;c.fillStyle=night?'#647778':'#98aba5';c.beginPath();c.moveTo(mx-65,my);c.lineTo(mx,my-51);c.lineTo(mx+65,my);c.fill();rect(c,mx-8,my-42,18,8,cold?'#e4e8dd':'#cbd5c8');}
 if(!coastal||route==='tokyo'){for(let i=0;i<8;i++){const bx=x+i*w/8+3,by=y+h*.68-(i*17)%29,bw=w/10;rect(c,bx,by,bw,y+h*.91-by,night?'#536568':desert?'#ac957d':'#9aa99a');rect(c,bx-2,by-3,bw+4,4,night?'#607377':'#839684');for(let floor=0;floor<3;floor++)for(let win=0;win<2;win++)rect(c,bx+4+win*6,by+7+floor*9,3,4,night?'#c7ba88':'#c7d4c0');}}
 c.restore();
}
function interior(c,j,t,hotel=false){
 const col=hotel?(j.hotel==='resort'?'#e7e2d4':j.hotel==='boutique'?'#e4e8db':'#eae6d9'):'#e9e8dd';rect(c,0,0,360,200,col);rect(c,0,200,360,80,'#cfd3bf');rect(c,0,198,360,5,'#b7c3ae');
 for(let y=217;y<280;y+=21){rect(c,0,y,360,1,'#c3cbb6');for(let x=(y%2)*22;x<360;x+=70)rect(c,x,y-19,1,20,'#c3cbb6');}
 outline(c,22,35,137,107,'#e7eadd','#a5b7a3');sky(c,26,39,129,99,j,t);rect(c,88,37,3,101,'#d8dfcb');rect(c,23,140,140,7,'#b4c2a6');rect(c,16,28,6,128,'#bfcab3');rect(c,160,28,6,128,'#bfcab3');
 const bx=hotel?227:236;rect(c,bx-8,111,110,74,'#9cad97');rect(c,bx-5,172,106,47,'#b9c6aa');rect(c,bx,153,96,30,hotel&&j.hotel==='boutique'?'#b4b9bc':'#d9dcc7');rect(c,bx+7,150,34,15,'#ececdf');rect(c,bx+54,150,34,15,'#ececdf');rect(c,bx,181,96,26,'#adbca0');rect(c,bx-2,217,5,15,'#91a189');rect(c,bx+92,217,5,15,'#91a189');rect(c,bx+5,198,85,2,'#c9d3bb');
 outline(c,194,168,24,36,'#c4b899','#9cab91');rect(c,203,146,3,20,'#929c83');rect(c,195,141,20,9,'#d5c8a8');rect(c,195,179,22,2,'#aab798');
 plant(c,38,191,1.05);plant(c,339,99,.7);
 outline(c,182,47,47,32,'#e7e7d5','#bac6ad');rect(c,189,54,33,18,'#cbd7be');rect(c,189,66,33,6,'#a6b7a0');rect(c,203,56,5,5,'#d9d7b3');
 if(!hotel){outline(c,273,33,64,65,'#c6cfb8','#a5b29a');rect(c,303,35,2,60,'#a8b49a');rect(c,296,64,2,7,'#939f88');rect(c,309,64,2,7,'#939f88');rect(c,47,170,71,11,'#b8aa8d');rect(c,52,181,5,30,'#9cac94');rect(c,108,181,5,30,'#9cac94');rect(c,69,147,21,22,'#d2c5a6');rect(c,60,155,36,14,'#e0d5b6');suitcase(c,118,211,j.caseColor||'#9bad97',1.15,'07');}
 else{chair(c,73,153,j.hotel==='resort'?'#b7bda0':'#a9b99e');rect(c,120,178,50,10,'#b3a786');rect(c,124,187,4,21,'#9cac94');rect(c,160,187,4,21,'#9cac94');rect(c,132,164,10,13,'#e4dcc0');rect(c,146,168,13,7,'#d5bc98');suitcase(c,178,218,j.caseColor||'#8ca190',1.05,'07');text(c,`ROOM ${destination(j.routeId).room}`,254,31,'#9aab90',8);}
}
function airport(c,j,t,arrival=false){
 rect(c,0,0,360,199,'#e4e9df');rect(c,0,199,360,81,'#ccd5c7');rect(c,0,199,360,4,'#b0c2ae');for(let y=216;y<280;y+=20)rect(c,0,y,360,1,'#bbc9b5');
 outline(c,14,30,332,109,'#b6d0cf','#a7bbaa');if(arrival)sky(c,18,34,324,100,j,t);else {rect(c,18,34,324,100,'#c6d9d5');rect(c,18,105,324,29,'#9ca89d');rect(c,18,121,324,3,'#e9e7cf');rect(c,230,65,9,38,'#91a5a4');rect(c,221,61,27,10,'#829a99');}for(let x=93;x<350;x+=83)rect(c,x,31,4,106,'#d4dfd0');rect(c,14,139,332,6,'#adbfa8');
 outline(c,29,15,102,19,'#6d8879','#8fa898');text(c,arrival?'ARRIVALS':'DEPARTURES',37,28,'#e1e7d8',9);
 outline(c,227,154,109,16,'#809887','#a6bba3');text(c,arrival?'BAGGAGE CLAIM':`GATE ${destination(j.routeId).gate}`,236,165,'#edf0df',9);
 if(arrival&&!j.entry?.passed){outline(c,48,157,103,59,'#a3b9a5','#829f88');rect(c,44,155,113,8,'#d0ddc9');text(c,'PASSPORT',69,186,'#577864',9);rect(c,86,134,29,20,'#738f80');rect(c,89,137,23,14,'#bfd5c8');outline(c,196,170,37,42,'#a8baac','#8fa896');rect(c,194,168,43,8,'#c9d9c3');plant(c,300,220,1);}
 else if(arrival){outline(c,35,179,203,40,'#899d90','#718779');rect(c,42,185,189,27,'#b7c4b1');for(let x=48;x<228;x+=18)rect(c,x,186,1,25,'#9db49c');for(let i=0;i<4;i++){const x=45+((i*47+t*9)%177);suitcase(c,x,174,['#9bb3a0','#b9a6a3','#a0aebd','#c4b391'][i],.65,String(i+7));}plant(c,315,225,1.1);}
 else if(j.airport?.security){
  for(const [x,label,col] of [[25,'CAFÉ','#bfb297'],[135,'DINING','#aabc9e'],[245,'DUTY FREE','#b1b8bc']]){outline(c,x,174,83,41,col,'#8fa38d');rect(c,x-3,170,89,8,'#d5dfc7');outline(c,x+4,150,75,17,'#7b9380','#a6bba1');text(c,label,x+10,161,'#e7ecdc',8);}
  for(let i=0;i<3;i++){rect(c,37+i*21,158,11,11,'#dbccb0');rect(c,37+i*21,155,11,3,'#b39e80');rect(c,146+i*20,158,13,7,'#e2dbbc');rect(c,150+i*20,155,7,5,'#bfa380');outline(c,256+i*19,179,9,19,['#dad3ad','#d2b9b1','#bfcacd'][i]);rect(c,258+i*19,174,5,5,'#7c9180');}
  plant(c,337,220,.75);
 }
 else{outline(c,34,160,79,49,'#b4c3ae','#8da58e');rect(c,29,159,90,8,'#d6ddc5');text(c,'CHECK IN',45,180,'#607d67',8);rect(c,62,142,25,15,'#728b7c');rect(c,65,145,19,9,'#bad1c3');chair(c,228,175);chair(c,278,175);outline(c,138,167,45,28,'#a8baaa','#849f89');rect(c,140,172,41,18,'#d4dfcc');text(c,'SECURITY',138,159,'#8ba184',7);plant(c,331,217,.8);}
}
function lobby(c,j,t){
 rect(c,0,0,360,197,'#e6e8db');rect(c,0,197,360,83,'#d2d7c1');rect(c,0,196,360,4,'#b4c5a7');outline(c,28,35,121,101,'#dae1cf','#a6bba0');sky(c,32,39,113,93,j,t);rect(c,84,37,3,97,'#d8e1ca');rect(c,24,135,130,7,'#bac9ae');
 outline(c,182,151,142,68,'#a5b49a','#8ca284');rect(c,177,148,152,10,'#d5dcc0');text(c,'LITTLE STAY',209,182,'#f0f0db',11);rect(c,245,128,6,17,'#b79f73');rect(c,249,125,11,5,'#c7b788');rect(c,214,129,15,18,'#ded1af');rect(c,211,145,21,3,'#bfaa83');plant(c,327,143,.7);plant(c,43,220,1.2);suitcase(c,125,224,'#98af97',1.1,'07');outline(c,207,51,82,43,'#d5dec8','#b0c3a5');text(c,`ROOM ${destination(j.routeId).room}`,220,77,'#7d9773',10);
}
function moving(c,j,t){
 rect(c,0,0,360,280,'#dce3d5');sky(c,0,0,360,181,{...j,routeId:j.stage==='to-airport'?'jeju':j.routeId},t);
 rect(c,0,180,360,31,'#b5c3a5');rect(c,0,211,360,48,'#a5b2a2');rect(c,0,259,360,21,'#c2cbb5');for(let i=0;i<8;i++)rect(c,((i*70-t*27)%560+560)%560-70,237,25,2,'#e0e2cf');for(let i=0;i<4;i++)plant(c,((i*115-t*12)%510+510)%510-45,204,.7);
 const train=['train','subway'].includes(j.ride?.id),taxi=j.ride?.id==='taxi',x=taxi?122:92,y=164,w=taxi?115:175;
 outline(c,x,y,w,60,taxi?'#c8bd99':'#a8bba4','#809780');rect(c,x+9,y+10,w-35,24,'#d7e1d4');rect(c,x+w-28,y+10,20,24,'#b9d0c7');for(let sx=x+35;sx<x+w-29;sx+=28)rect(c,sx,y+10,2,24,'#96ad93');rect(c,x+5,y+39,w-10,5,'#d7dfc9');rect(c,x+15,y+55,19,15,'#657d6b');rect(c,x+w-40,y+55,19,15,'#657d6b');rect(c,x+20,y+58,9,8,'#a8b6a2');rect(c,x+w-35,y+58,9,8,'#a8b6a2');rect(c,x+w-2,y+39,3,7,'#e3d9b1');if(train){rect(c,x+21,y-6,w-42,6,'#8fa58c');rect(c,0,y+72,360,3,'#899b85');}text(c,taxi?'TAXI':train?'CITY RAIL':'LITTLE BUS',x+16,y+51,'#6d8772',8);
}
let lastStage='',playerX=155,targetX=155;
export function drawTravelScene(canvas,j,p,t=0,target){
 const c=canvas.getContext('2d');if(!c)return;c.imageSmoothingEnabled=false;c.save();c.scale(canvas.width/360,canvas.height/240);
 if(j?.stage==='hotel'&&j.hotelLocation==='neighborhood'){drawNeighborhood(c,j,p,t);c.restore();return;}j={...j,checkedIn:j.hotelLocation==='lobby'?false:j.checkedIn,caseColor:shopItem(p.equipped?.case)?.color};const stage=j?.stage||'packing';if(!drawEnvironment(c,j,p,t)){c.save();c.scale(1,240/280);if(stage==='hotel'&&!j.checkedIn)lobby(c,j,t);else if(stage==='packing'||stage==='hotel'||stage==='complete')interior(c,j||{routeId:p.route,hotel:'guesthouse',departure:p.departure},t,stage!=='packing');else if(stage==='airport'||stage==='arrival')airport(c,j,t,stage==='arrival');else moving(c,j,t);c.restore();}
 const actorContext=(j.id||'home')+':'+stage;
 if(!['to-airport','to-hotel'].includes(stage)&&guests?.complete&&guests.naturalWidth){if(lastStage!==actorContext){playerX=155;targetX=155;lastStage=actorContext;}if(Number.isFinite(target))targetX=clamp(target,40,290);const delta=targetX-playerX;if(Math.abs(delta)>.8)playerX+=Math.sign(delta)*Math.min(Math.abs(delta),4);else playerX=targetX;
 const id=p.avatar??7,frame=Math.abs(delta)>1?Math.floor(t*6)%2:0;rect(c,playerX-14,218,29,3,'#67795740');const sprite=drawTraveler(c,id,frame,STYLES.find(s=>s.id===p.style)?.color||'#8aa28c',true,[Math.round(playerX-44),136,88,88],p.style,currentLook(p).hat);
 const glassesId=currentLook(p).glasses;if(glassesId&&sprite)drawItemArt(c,glassesId,eyewearBox(id,frame,true,glassesId,[Math.round(playerX-44),136,88,88]));
 const bag=shopItem(p.equipped?.bag);if(bag){if(bag.id==='cross-bag')for(let n=0;n<12;n++)rect(c,playerX-12+n*2,190+n*.65,2,2,'#8d7b63');drawItemArt(c,bag.id,[playerX+7,195,23,23]);}
 if(stage==='packing'||stage==='hotel'){const caseId=p.equipped?.case||'mint-case',bx=stage==='packing'?179:168;if(!drawCase(c,caseId,[bx,181,29,38]))drawItemArt(c,caseId,[bx,181,29,38]);}
 }
 c.restore();
}
