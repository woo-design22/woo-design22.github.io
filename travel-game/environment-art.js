import {drawLocalRoom} from './local-flavors.js?v=6.8.0';
import {drawCityPanel,cityArtReady,cityArtSource} from './city-art.js?v=6.8.0';
import {roomGeometry} from './room-geometry.js?v=6.8.0';
// Original room illustrations, rendered at a small logical resolution for crisp pixels.
import {drawScenery,CITY_SCENES} from './scenery.js?v=6.8.0';
import {shopItem} from './shopping.js?v=6.8.0';
import {aerialReady} from './aerial-atlas.js?v=6.8.0';
import {drawRoad} from './road-art.js?v=6.8.0';
import {drawItemArt} from './item-art.js?v=6.8.0';
import {drawCase} from './generated-art.js?v=6.8.0';
import {drawResidence} from './home-art.js?v=6.8.0';
const pictures=new Map();
function pictureFor(name){if(!name||typeof Image==='undefined')return null;if(!pictures.has(name)){const image=new Image();image.src=new URL(`./assets/${name==='airport'?'incheon-terminal-v6.5.png':name+'-v4.png'}`,import.meta.url).href;pictures.set(name,image);}return pictures.get(name);}
export function environmentsReady(names,routes=[]){return Promise.all([aerialReady(routes),cityArtReady(routes),...names.map(name=>new Promise(resolve=>{const image=pictureFor(name);if(!image||image.complete){resolve();return;}image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}))]);}
export function drawStayMemory(canvas,record){const c=canvas.getContext('2d');if(!c)return;c.save();c.imageSmoothingEnabled=false;c.scale(canvas.width/360,canvas.height/240);drawEnvironment(c,{stage:'hotel',checkedIn:true,routeId:record.route,hotel:record.hotel,departure:record.departure||'day',roomLayout:record.roomLayout||{},purchases:[]},{},0);c.restore();}
let pane;
const glassMasks=new Map();
function livingWindow(c,j,t,kind,slot){
 const box=kind==='airport'?[25,28,310,92]:slot===3?[130,62,100,46]:roomGeometry(j.routeId,['guesthouse','boutique','resort'][slot]).window;
 const key=j.routeId+':'+kind+':'+slot;
 if(!glassMasks.has(key)){const scratch=document.createElement('canvas');scratch.width=360;scratch.height=240;const painter=scratch.getContext('2d');drawCityPanel(painter,j.routeId,kind,slot);const rgba=painter.getImageData(0,0,360,240).data,mask=new Uint8Array(360*240);for(let y=box[1];y<box[1]+box[3];y++)for(let x=box[0];x<box[0]+box[2];x++){const i=(y*360+x)*4;mask[y*360+x]=rgba[i+2]>rgba[i]+12&&rgba[i+1]>rgba[i]+4?1:0;}glassMasks.set(key,mask);}
 const mask=glassMasks.get(key);c.save();c.globalAlpha=j.departure==='night'?.10:.18;c.fillStyle='#e8eee4';for(let n=0;n<3;n++){const x=Math.floor(box[0]+((t*.8+n*box[2]/3)%(box[2]+18))-9),y=Math.floor(box[1]+5+n*7);for(let dx=0;dx<13;dx++)if(mask[y*360+x+dx])c.fillRect(x+dx,y,1,1);}c.restore();
}
const pixel=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function windowView(c,box,j,t){
 pane ||= document.createElement('canvas');pane.width=Math.round(box[2]);pane.height=Math.round(box[3]);
 const id=j.routeId||'jeju',departure=j.departure==='night'?.70:j.departure==='evening'?.40:.08;
 drawScenery(pane,{route:{id,duration:180,stage:0},time:0,departure,view:'window'},t,true);
 c.save();c.beginPath();c.rect(...box);c.clip();c.globalAlpha=.82;c.drawImage(pane,...box);c.globalAlpha=1;
 // Tiny reflections stay on the glass, while clouds pass behind them.
 pixel(c,box[0]+3,box[1]+2,1,box[3]-4,'#e7efe62b');
 c.restore();
}
function steam(c,x,y,t){c.save();c.globalAlpha=.26;for(let i=0;i<3;i++){const phase=(t*.4+i/3)%1;pixel(c,x+Math.sin(phase*6)*2,y-phase*10,1,3,'#e8eee1');}c.restore();}
function littleObject(c,id,x,y,color){
 if(drawDutyProduct(c,id,[x-10,y-20,20,20])||drawCase(c,id,[x-10,y-20,20,20])||drawItemArt(c,id,[x-9,y-18,18,18]))return;
 c.save();c.translate(x,y);const item=shopItem(id);color ||= item?.color||'#b3bfaa';
 if(id.includes('choc')){pixel(c,-6,-9,12,9,color);pixel(c,-3,-7,6,5,'#8e6c53');}
 else if(item?.category==='liquor'||item?.category==='gift'&&id.includes('perfume')){pixel(c,-3,-11,6,10,color);pixel(c,-1,-14,2,4,'#8e7c61');pixel(c,-2,-7,4,3,'#ece7cf');}
 else if(id==='book'||id==='passport'){pixel(c,-6,-10,12,10,id==='passport'?'#788b80':'#bbaa89');pixel(c,-4,-8,1,7,'#e9e1c8');pixel(c,-1,-6,5,1,'#e9e1c8');}
 else if(id==='phone'||id==='charger'||id==='camera'){pixel(c,-4,-9,8,9,'#77867b');pixel(c,-2,-7,4,5,'#c6d6c8');}
 else if(item?.category==='glasses'||id==='sunglasses'){pixel(c,-7,-6,6,4,color);pixel(c,1,-6,6,4,color);pixel(c,-1,-5,2,1,color);}
 else if(id==='pajamas'||id==='coat'||id==='scarf'){pixel(c,-6,-10,12,9,'#aabb9a');pixel(c,-8,-9,4,4,'#aabb9a');pixel(c,4,-9,4,4,'#aabb9a');pixel(c,-1,-10,2,3,'#f0ebd9');}
 else if(id==='umbrella'){pixel(c,-5,-10,10,4,'#b8a894');pixel(c,0,-6,1,7,'#756f61');}
 else if(id==='sandals'){pixel(c,-6,-5,4,5,'#c0ae8b');pixel(c,2,-5,4,5,'#c0ae8b');}
 else {pixel(c,-5,-9,10,9,color);pixel(c,-3,-12,6,3,'#8b9781');pixel(c,-3,-5,6,1,'#e7e3cb');}
 c.restore();
}
const roomAnchors={guesthouse:{desk:[62,94],bed:[290,115],shelf:[244,29],hanger:[343,137],entry:[208,211]},boutique:{desk:[55,94],bed:[294,116],shelf:[274,37],hanger:[343,125],entry:[200,211]},resort:{desk:[67,154],bed:[301,117],shelf:[340,30],hanger:[343,121],entry:[205,211]}};
export function drawRoomObjects(c,j,original=false){
 const anchors=original?roomGeometry(j.routeId,j.hotel):roomAnchors[j.hotel]||roomAnchors.guesthouse;
 if(original&&Object.values(j.roomLayout||{}).includes('shelf')){const [x,y]=anchors.shelf;pixel(c,x-22,y,48,3,'#98795b');pixel(c,x-18,y+3,2,4,'#786348');pixel(c,x+21,y+3,2,4,'#786348');if(Object.values(j.roomLayout).filter(s=>s==='shelf').length>3)pixel(c,x-22,y+8,48,3,'#98795b');}
 // The resort has a low tea desk on the free floor space for packed electronics.
 if(!original&&j.hotel==='resort'&&Object.values(j.roomLayout||{}).includes('desk')){pixel(c,43,154,55,5,'#a78e6c');pixel(c,45,153,51,2,'#c0a37b');pixel(c,47,159,3,16,'#877759');pixel(c,91,159,3,16,'#877759');}
 const count={};for(const [id,spot] of Object.entries(j.roomLayout||{})){const anchor=anchors[spot];if(!anchor)continue;const n=count[spot]||0;count[spot]=n+1;littleObject(c,id,anchor[0]+(n%3)*12-12,anchor[1]+Math.floor(n/3)*8);}
}
export function drawEnvironment(c,j,p,t){
 if((j.stage||'packing')==='packing'&&drawResidence(c,p,t))return true;
 if(['to-airport','to-hotel'].includes(j.stage))return drawRoad(c,j,t);
 const cityRoom=['hotel','complete'].includes(j.stage),night=j.departure==='night';
 if(cityRoom){const slot=j.checkedIn?Math.max(0,['guesthouse','boutique','resort'].indexOf(j.hotel)):3;const kind=night?'hotel-night':'hotel';const drawn=drawCityPanel(c,j.routeId,kind,slot)||drawCityPanel(c,j.routeId,'hotel',slot);if(drawn){if(night&&!cityArtSource(j.routeId,'hotel-night',slot)){c.save();c.fillStyle='#17304988';c.fillRect(0,0,360,240);c.restore();}livingWindow(c,j,t,kind,slot);if(j.checkedIn){drawRoomObjects(c,j,true);}return true;}}
 if(j.stage==='arrival'&&drawCityPanel(c,j.routeId,'airport')){livingWindow(c,j,t,'airport',0);if(night){c.save();c.globalAlpha=.35;c.fillStyle='#172a40';c.fillRect(0,0,360,240);c.restore();}return true;}
 const stage=j.stage||'packing',name=stage==='packing'?'home':stage==='hotel'||stage==='complete'?j.checkedIn?j.hotel:'lobby':stage==='airport'?'airport':stage==='arrival'?'arrival':null;
 const dayPicture=pictureFor(name),nightPicture=j.departure==='night'&&['guesthouse','boutique','resort'].includes(name)?pictureFor(name+'-night'):null;
 const picture=nightPicture?.complete&&nightPicture.naturalWidth?nightPicture:dayPicture;if(!picture?.complete||!picture.naturalWidth)return false;
 c.drawImage(picture,0,0,360,240);
 if(name==='guesthouse')windowView(c,[98,14,76,67],j,t);
 if(name==='boutique')windowView(c,[65,16,119,69],j,t);
 if(name==='resort')windowView(c,[71,12,138,63],j,t);
 if(name==='lobby')windowView(c,[53,18,124,73],j,t);
 if(['home','guesthouse','boutique','resort','lobby'].includes(name)){
  if(j.departure==='night'&&picture!==nightPicture){c.save();c.globalAlpha=.14;c.fillStyle='#294655';c.fillRect(0,0,360,240);c.restore();}
  if(name==='home')steam(c,59,86,t);
  if(j.checkedIn){drawLocalRoom(c,j);drawRoomObjects(c,j);}
 }
 if(name==='home'){
  // Keepsakes accumulate at home rather than becoming numbers alone.
  const owned=Object.keys(p.collection||{}).filter(id=>p.collection[id]>0).slice(-4);
  owned.forEach((id,i)=>littleObject(c,id,34+i*12,126));
 }
 if(name==='airport'||name==='arrival'){
  c.save();c.beginPath();c.rect(120,24,104,90);c.clip();
  for(let i=0;i<3;i++){const x=((t*.9+i*46)%145)+98;pixel(c,x,43+i*10,18,2,'#e9efe870');pixel(c,x+5,41+i*10,9,2,'#e9efe870');}c.restore();
  // No ambient steam without a hot cup at a verified location.
 }
 if(j.purchases?.length&&stage!=='packing'){
  for(let i=0;i<Math.min(3,j.purchases.length);i++){pixel(c,205+i*13,196-i*2,11,14,shopItem(j.purchases[i])?.color||'#c4b08c');pixel(c,208+i*13,193-i*2,5,3,'#8d9078');}
 }
 return true;
}

import {drawDutyProduct} from './duty-art.js?v=6.8.0';
