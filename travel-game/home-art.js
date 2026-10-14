import {HOME_CITIES,HOME_TYPES,HOME_FURNITURE,HOME_CATEGORIES,residenceState} from './home-model.js?v=6.5.0';
import {drawAtlas,atlasReady,discoveryAsset} from './generated-art.js?v=6.5.0';
export const HOME_ART_FILES=['home-views-v6.png','home-interiors-v6.1.png','navigation-cases-v6.png',...HOME_FURNITURE.map(x=>'furniture-'+x.id+'-v6.3.png')];
export function homeArtReady(){return atlasReady(HOME_ART_FILES);}
export function homeViewAsset(id){const cell=Math.max(0,HOME_CITIES.findIndex(x=>x.id===id));return {file:'home-views-v6.png',columns:3,rows:4,col:cell%3,row:Math.floor(cell/3)};}
export function furnitureAsset(id,placed=false){const item=HOME_FURNITURE.find(x=>x.id===id);return item?{file:'furniture-'+item.id+'-v6.3.png',columns:1,rows:1,col:0,row:0,source:[0,0,1,1],contain:true}:null;}
const r=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h);};
export function drawHomeWindow(c,p,t=0,box=[0,0,360,240],frame=false){
 const h=residenceState(p.residence),[x,y,w,hh]=box;c.save();c.beginPath();c.rect(x,y,w,hh);c.clip();
 const asset={...homeViewAsset(h.city),cover:true};if(!drawAtlas(c,asset,box))r(c,...box,'#c0d3cc');
 c.globalAlpha=.18;for(let n=0;n<3;n++){const cx=x+((t*.65+n*w/3)%(w+24))-12;r(c,cx,y+hh*(.10+n*.06),22,2,'#ffffff');r(c,cx+6,y+hh*(.10+n*.06)-2,10,2,'#ffffff');}c.globalAlpha=1;
 if(p.departure==='night'){c.globalAlpha=.32;r(c,...box,'#21364b');c.globalAlpha=1;}
 c.restore();if(frame){r(c,x-3,y-3,w+6,3,'#b2bba7');r(c,x-3,y+hh,w+6,4,'#bdc7b1');r(c,x-3,y,3,hh,'#cdd6c1');r(c,x+w,y,3,hh,'#cdd6c1');r(c,x+w/2,y,2,hh,'#e5e9d9');}
}
export const HOME_SURFACES={wall:[[17,24],[343,24],[343,146],[17,146]],floor:[[0,155],[17,146],[343,146],[360,155],[360,240],[0,240]]};
function clipSurface(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.clip();}
function drawFinishes(c,h,type){
 if(h.wall!=='wood'){
  c.save();clipSurface(c,type===2?[[17,55],[306,55],[306,146],[17,146]]:HOME_SURFACES.wall);
  const colors={cottage:'#e7ddc8',modern:'#e4e4db',atelier:'#b98d75',coastal:'#cbd9d1',playful:'#ede2ca'};r(c,0,0,360,150,colors[h.wall]);
  if(h.wall==='cottage'){
   for(let y=31;y<140;y+=16)for(let x=23;x<340;x+=18){r(c,x,y,1,5,'#a0af91');r(c,x-2,y-1,5,1,'#c3a292');r(c,x,y-3,1,5,'#c3a292');}
   r(c,17,108,326,3,'#c9bba3');r(c,17,111,326,2,'#f0e7d3');for(let x=25;x<336;x+=37){r(c,x,119,29,1,'#c6b69d');r(c,x,119,1,20,'#c6b69d');r(c,x+28,119,1,20,'#c6b69d');r(c,x,139,29,1,'#c6b69d');}
  }
  if(h.wall==='modern'){for(let y=30;y<145;y+=6)r(c,18,y,324,1,y%12?'#e7e7df':'#e0e1d7');r(c,18,141,324,4,'#b9c0b5');}
  if(h.wall==='atelier'){for(let y=27;y<148;y+=7){r(c,0,y,360,1,'#e1cbb4');for(let x=(y%14?0:11);x<360;x+=22){r(c,x,y,1,7,'#e1cbb4');r(c,x+3,y+2,14,1,'#bd967b');}}}
  if(h.wall==='coastal'){
   for(let x=23;x<342;x+=34){c.strokeStyle='#b0c4b9';c.lineWidth=1;c.beginPath();c.arc(x+14,44,12,Math.PI,0);c.moveTo(x+2,44);c.lineTo(x+2,108);c.moveTo(x+26,44);c.lineTo(x+26,108);c.stroke();}
   r(c,17,111,326,3,'#a9bcb0');for(let y=117;y<146;y+=8){r(c,17,y,326,1,'#a8bcb0');r(c,17,y+1,326,1,'#e0e9de');}
  }
  if(h.wall==='playful'){for(let y=33;y<141;y+=15)for(let x=23+(y%2)*7;x<337;x+=18){r(c,x,y,3,3,'#c6a691');r(c,x-1,y+1,5,1,'#d9b5a0');r(c,x+1,y-1,1,5,'#d9b5a0');r(c,x+1,y+5,1,4,'#a4b18e');r(c,x+2,y+6,3,1,'#a4b18e');}r(c,17,142,326,3,'#c5bfa8');}
  c.globalAlpha=.07;r(c,17,24,26,122,'#665646');c.globalAlpha=1;
  if(type===2){for(const x of [203,270]){r(c,x,54,4,92,'#7b6047');r(c,x+1,54,1,92,'#ac8962');}}
  c.restore();
 }
 if(h.floor==='wood')return;
 c.save();clipSurface(c,HOME_SURFACES.floor);
 const colors={cottage:'#c6b08b',modern:'#cdd0c6',atelier:'#d3cbbb',coastal:'#c5cebe',playful:'#e8ddc5'};r(c,0,146,360,94,colors[h.floor]);
 const rows=Array.from({length:9},(_,i)=>146+Math.pow(i/8,1.25)*94);
 for(let row=0;row<8;row++){
  const y=rows[row],hh=rows[row+1]-y,scale=.45+row*.1,ww=40*scale;
  for(let col=-9;col<10;col++){
   const x=180+col*ww;
   if(h.floor==='modern'||h.floor==='playful'){
    const nextWidth=40*(scale+.1),left=180+col*nextWidth;
    c.fillStyle=h.floor==='playful'?((row+col)%2?'#a9b7a1':'#e9ddc5'):((row+col)%3?'#d0d2c9':'#c5c9c1');
    c.beginPath();c.moveTo(x,y);c.lineTo(x+ww,y);c.lineTo(left+nextWidth,y+hh);c.lineTo(left,y+hh);c.closePath();c.fill();
    if(h.floor==='modern'){c.strokeStyle='#aeb6a455';c.lineWidth=.6;c.stroke();}
   }
   if(h.floor==='cottage'){c.fillStyle=(row+col)%2?'#bca17c':'#d7bd95';c.beginPath();c.moveTo(x,y);c.lineTo(x+ww/2,y+hh/2);c.lineTo(x+ww/2,y+hh);c.lineTo(x,y+hh/2);c.fill();c.fillStyle='#ddc6a2';c.beginPath();c.moveTo(x+ww/2,y+hh/2);c.lineTo(x+ww,y);c.lineTo(x+ww,y+hh/2);c.lineTo(x+ww/2,y+hh);c.fill();}
   if(h.floor==='coastal'){c.fillStyle='#aebba8';c.beginPath();c.ellipse(x+ww*.45,y+hh*.47,ww*.40,hh*.36,0,0,Math.PI*2);c.fill();c.fillStyle='#dbe0cf';c.beginPath();c.ellipse(x+ww*.42,y+hh*.43,ww*.30,hh*.23,0,0,Math.PI*2);c.fill();}
   if(h.floor==='atelier'){for(let n=0;n<5;n++){const xx=x+((col*17+n*7+row*3)%23+23)%23/23*ww,yy=y+((n*11+row*7)%13)/13*hh;r(c,xx,yy,2+row*.2,1+row*.2,['#b7b1a0','#c8a68e','#aebaa5'][n%3]);}}
  }
 }
 r(c,17,146,326,2,'#8f8d7755');c.restore();
}
export function drawResidence(c,p,t=0){
 const h=residenceState(p.residence),type=HOME_TYPES.findIndex(x=>x.id===h.type);
 if(!drawAtlas(c,{file:'home-interiors-v6.1.png',columns:3,rows:1,col:type,row:0},[0,0,360,240]))return false;
 drawFinishes(c,h,type);
 drawHomeWindow(c,p,t,[60,41,129,69],true);
 // Furniture from the generated catalogue is the actual furniture in the room.
 const slots={rug:[125,177,143,55],curtain:[48,31,154,94],art:[201,43,53,52],storage:[206,94,49,62],bed:[266,127,85,78],sofa:[167,161,83,47],desk:[33,128,84,62],lamp:[126,83,40,100],plant:[5,133,46,62],table:[119,191,73,44]};
 if(h.type==='loft'){slots.storage=[198,83,52,94];slots.bed=[232,126,87,79];slots.art=[199,52,44,40];slots.lamp=[121,89,30,100];}
 // Hanging plants include a floor stand in the generated artwork; keep its feet on the floor.
 if(h.furniture.desk==='coastal-desk')slots.desk=[33,100,84,48];
 for(const [slot,box] of Object.entries(slots)){
  const asset=furnitureAsset(h.furniture[slot],true);
  if(asset&&!['rug','curtain','art'].includes(slot)){
   c.save();c.fillStyle='#655c4633';c.beginPath();c.ellipse(box[0]+box[2]/2,box[1]+box[3]-1,box[2]*.35,2.1,0,0,Math.PI*2);c.fill();c.restore();
  }
  drawAtlas(c,asset,box);
 }
 return true;
}
export function drawDestinationWindow(canvas,route,t=0,night=false){const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);c.fillStyle='#dedfce';c.fillRect(0,0,w,h);const box=[w*.07,h*.08,w*.86,h*.82];c.save();c.beginPath();c.roundRect(...box,12);c.clip();const asset=discoveryAsset(route+':place-1');const drift=(Math.sin(t*.05)+1)*w*.022;drawAtlas(c,asset,[box[0]-drift,box[1],box[2]+w*.044,box[3]]);c.globalAlpha=.17;c.fillStyle='#f6f2e8';for(let n=0;n<3;n++){const x=box[0]+((t*1.4+n*w/3)%(box[2]+70))-35;c.fillRect(x,box[1]+22+n*12,55,3);}c.globalAlpha=1;if(night){c.globalAlpha=.38;c.fillStyle='#1e354f';c.fillRect(...box);c.globalAlpha=1;}c.restore();c.strokeStyle='#a9b6a5';c.lineWidth=6;c.beginPath();c.roundRect(...box,12);c.stroke();c.strokeStyle='#eeecdf';c.lineWidth=3;c.stroke();}
