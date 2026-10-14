import {drawTraveler} from './avatar-art.js?v=6.7.0';
const pictures={};for(const id of ['economy','business','first'])if(typeof Image!=='undefined'){const image=new Image();image.src=new URL('./assets/cabin-'+id+'-v6.5.webp',import.meta.url).href;pictures[id]=image;}
const r=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
function seat(c,x,y,w,h,color,label,guest){r(c,x+2,y+3,w,h,'#697c6b');r(c,x,y,w,h,color);r(c,x+5,y+5,w-10,8,'#d8ddc6');r(c,x+4,y+h-12,w-8,12,'#a5b49a');r(c,x-3,y+h-19,w+6,6,'#d4d4be');r(c,x+6,y+h,4,8,'#657669');r(c,x+w-10,y+h,4,8,'#657669');if(guest!==undefined)drawTraveler(c,guest,0,null,false,[x+w*.15,y-19,w*.7,w*.7]);c.fillStyle='#526849';c.font='7px Neo';c.fillText(label,x+6,y+h-2);}
export function drawCabinView(canvas,f,p,t=0){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;if(!c||!w||!h)return;c.save();c.imageSmoothingEnabled=false;c.clearRect(0,0,w,h);c.scale(w/360,h/240);
 const premium=f.cabin!=='economy',first=f.cabin==='first',bed=f.seatMode==='bed';
 const sageFirst=first&&/^[123][CD]$/.test(f.seat),picture=pictures[sageFirst?'business':f.cabin];
 if(picture?.complete&&picture.naturalWidth){
  c.drawImage(picture,0,0,360,240);
  if(bed){r(c,64,188,230,52,'#e9e0ca');r(c,72,192,215,45,'#f9f0dc');for(let x=82;x<285;x+=20)r(c,x,197,1,36,'#ddd6c1');r(c,78,191,70,14,'#fff9e9');}
  if(first&&f.suiteClosed){r(c,326,20,7,151,'#b8a78d');r(c,333,24,16,142,'#cec0a5');r(c,0,0,360,240,'#4b443c35');}
  const resting=f.experiences?.turndown||f.experiences?.flatbed;
  if(bed&&resting?.includes('독서')||bed&&resting?.includes('책')){r(c,217,194,44,28,'#8b9675');r(c,219,195,19,25,'#fff4d9');r(c,240,195,19,25,'#f5ebd0');r(c,238,195,2,25,'#baa581');for(let y=200;y<216;y+=4){r(c,222,y,12,1,'#c6bba0');r(c,244,y,12,1,'#c6bba0');}}
  r(c,8,8,105,20,'#fff7e4de');c.fillStyle='#536a4b';c.font='8px Neo';c.fillText(f.seat+' · '+(first?sageFirst?'세이지 스위트':'크림 스위트':premium?'비즈니스':'이코노미'),13,21);
  if(f.cinemaTheme){r(c,73,211,140,16,'#eee6d2e0');c.fillStyle='#526b51';c.fillText(f.cinemaTheme,80,223);}
  c.restore();return;
 }

 r(c,0,0,360,240,'#e9e5d6');r(c,19,0,322,35,'#f6f1e2');for(let x=28;x<341;x+=77){r(c,x,9,66,17,'#dce2cf');r(c,x,27,66,2,'#afbea4');}r(c,0,35,360,4,'#bac7ae');r(c,0,150,360,90,'#a9b5a3');
 // A forward-facing cabin view: no exterior scenery is painted behind the seats.
 c.fillStyle='#c4cbb8';c.beginPath();c.moveTo(166,45);c.lineTo(194,45);c.lineTo(220,240);c.lineTo(140,240);c.fill();
 for(let row=0;row<3;row++){
  const y=48+row*38,scale=.55+row*.18;
  if(premium){const width=first?100:88,hh=43*scale;for(const x of [45,222]){r(c,x-9,y-5,width+18,hh+20,first?'#b7aa92':'#a3b39d');seat(c,x,y,width,hh,first?'#ccbca0':'#a7b9a1',(row+1)+(x<180?'A':'D'),row===1?row*3:undefined);r(c,x+width-17,y+10,13,8,'#617c75');}}
  else for(const x of [26,92,206,272])seat(c,x,y,58*scale,35*scale,'#afbea3',(row+9)+(x<60?'A':x<150?'B':x<250?'C':'D'),row===2?(x<180?0:2):undefined);
 }
 if(first){r(c,0,173,65,67,'#a5957e');r(c,295,173,65,67,'#a5957e');if(f.suiteClosed){r(c,29,162,302,7,'#b6a58b');r(c,39,169,9,71,'#b6a58b');r(c,310,169,9,71,'#b6a58b');}}
 r(c,67,190,226,40,bed?'#e5e1cf':'#c7c6ac');r(c,70,187,220,4,'#eee9d6');if(bed){r(c,91,195,176,35,'#f2ecd9');r(c,104,191,65,14,'#fff7e4');}else {r(c,119,199,123,21,'#ece6d1');r(c,131,201,38,15,'#d9e2d0');r(c,135,204,31,10,'#76958d');r(c,182,202,13,13,'#f9f3dc');r(c,195,205,4,6,'#d9d5bf');}
 c.fillStyle='#465e43';c.font='9px Neo';c.fillText(f.seat+' · '+(bed?'침대 모드':'나의 좌석'),76,182);if(f.cinemaTheme)c.fillText(f.cinemaTheme,132,214);c.restore();
}
