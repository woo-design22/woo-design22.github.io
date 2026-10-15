// Quiet, fictional aerial landscapes inspired by each destination.
// Geometry is deterministic; flight time moves ground, clouds and light independently.
import {aerialPictures} from './aerial-atlas.js?v=6.11.1';
export const CITY_SCENES = {
 chengdu:['river','temple',353,'금강과 대나무 숲 너머 도시'],
 jeju:['island','volcano',17,'섬과 푸른 바다'],tokyo:['city','fuji',31,'도시 너머의 후지산'],taipei:['mountain','tower',45,'산 사이로 이어지는 도시'],paris:['river','eiffel',53,'센강과 낮은 지붕들'],hawaii:['island','palm',67,'작은 섬과 산호빛 바다'],moon:['ocean','moon',79,'달빛이 내려앉은 바다'],
 bkk:['river','temple',83,'강가의 사원과 도시'],sin:['coast','gardens',97,'만을 따라 흐르는 불빛'],dad:['coast','bridge',109,'해변과 강 위의 다리'],dps:['island','terrace',127,'초록 언덕과 남쪽 바다'],syd:['coast','sails',131,'항구의 흰 지붕들'],akl:['coast','tower',149,'푸른 만과 작은 항구'],dxb:['desert','spire',157,'모래빛 땅과 높은 첨탑'],ist:['strait','dome',163,'해협 양쪽의 지붕들'],fco:['city','dome',179,'따뜻한 색의 오래된 지붕'],bcn:['coast','spires',181,'바닷가의 반듯한 도시'],lis:['river','bridge',193,'언덕과 강을 잇는 다리'],lhr:['river','clock',211,'굽이치는 강과 도시'],ams:['canal','gables',223,'운하를 따라 놓인 집들'],cph:['coast','gables',227,'잔잔한 항구와 지붕'],hel:['snow','islets',239,'눈빛 해안과 작은 섬'],zrh:['mountain','alps',251,'산 아래의 호수와 마을'],prg:['river','castle',263,'강 위의 다리와 성'],jfk:['city','towers',277,'격자 거리와 높은 빌딩'],sfo:['coast','bridge',281,'안개 너머 붉은 다리'],yvr:['mountain','forest',293,'숲과 산 아래의 항구'],mex:['mountain','terrace',307,'고원 위의 넓은 도시'],lim:['coast','cliffs',311,'절벽을 따라 이어진 해안'],kef:['snow','aurora',331,'고요한 설원과 오로라'],stars:['space','rings',347,'별 사이를 지나는 여행']
};
const mod=(n,m)=>(n%m+m)%m;
const rnd=(seed,n)=>mod(Math.sin(seed*17.13+n*93.7)*43758.5453,1);
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const rgb=a=>`rgb(${a.join(',')})`;
export function flightAtmosphere(f){
 const progress=Math.min(1,Math.max(0,f.time/f.route.duration));
 const seed=CITY_SCENES[f.route.id]?.[2]||17;
 const special=['moon','stars','kef'].includes(f.route.id);
 const clock=f.departure!==undefined?Math.min(.92,f.departure+progress*.38):special?.78:mod((seed%5)*.14+progress*.67,1);
 const night=clock>.63,evening=clock>.36&&!night;
 const cloud=(f.route.stage+Math.floor(progress*3)+seed)%4;
 const weather=cloud===3?'가벼운 비':cloud===2?'구름 많음':'맑음';
 const phase=night?'밤':evening?'저녁':'낮';
 return {progress,clock,night,evening,weather,cloud,phase,mood:night?'night':evening?'evening':'day',label:`${phase} · ${night&&cloud<2?'별이 맑아요':weather}`,position:`${progress*100}% 50%`,description:CITY_SCENES[f.route.id]?.[3]||'구름 아래의 풍경'};
}
function polygon(c,points,color){c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
// Painted backgrounds are cropped in canvas, never stretched. Assets are packaged offline.
const art=typeof Image==='undefined'?null:new Image();
const nightArt=typeof Image==='undefined'?null:new Image();
const jet=typeof Image==='undefined'?null:new Image();
const wingArt=typeof Image==='undefined'?null:new Image();
if(wingArt)wingArt.src=new URL('./assets/wing-v2.png',import.meta.url).href;
if(art)art.src=new URL('./assets/aerial-day-v2.png',import.meta.url).href;
if(nightArt)nightArt.src=new URL('./assets/aerial-night-v2.png',import.meta.url).href;
if(jet)jet.src=new URL('./assets/airliner-v2.png',import.meta.url).href;
export function scenePanel(id){
 const terrain=CITY_SCENES[id]?.[0];
 if(['tokyo','taipei','jfk','sin','lhr','stars'].includes(id))return 1;
 if(['paris','bkk','ist','fco','bcn','lis','ams','cph','prg'].includes(id))return 2;
 if(['hawaii','dps','dad','moon'].includes(id))return 3;
 if(['zrh','yvr','mex','hel','kef'].includes(id)||terrain==='snow')return 4;
 if(id==='dxb')return 5;
 return 0;
}
function skyColors(a){return a.night?['#182435','#344252']:a.evening?['#687d98','#e3b6a0']:['#7eafc4','#d6e0db'];}
function atmosphereOverlay(c,w,h,a){
 if(a.night){c.fillStyle='#142b4b';c.globalAlpha=.39;c.fillRect(0,0,w,h);}
 else if(a.evening){c.fillStyle='#bb786a';c.globalAlpha=.13;c.fillRect(0,0,w,h);}
 c.globalAlpha=1;
}
const cloudSprites=new Map();
function cloudSprite(n,night){
 const key=`${n}:${night}`;if(cloudSprites.has(key))return cloudSprites.get(key);
 const el=document.createElement('canvas');el.width=124;el.height=44;const c=el.getContext('2d');
 // Pixel clusters form a softly lit, irregular cloud bank with a shaded underside.
 const tones=night?['#2f4964','#47617d','#637992']:['#c0d3d7','#dbe5e2','#f0f0e6'];
 for(let layer=0;layer<3;layer++)for(let x=0;x<124;x+=2){
  const z=x/124,edge=Math.sin(Math.PI*z),lobe=Math.sin(z*19+n)*3+Math.sin(z*37+n)*1.5;
  const top=Math.round(25-edge*(11+layer*3)-lobe),bottom=31+Math.round(edge*(6-layer*3));
  c.fillStyle=tones[layer];c.fillRect(x,top,2,Math.max(1,bottom-top));
 }
 cloudSprites.set(key,el);return el;
}
function clouds(c,w,h,t,a,seed,front=false){
 const count=front?2:(a.cloud>=2?5:3);
 for(let i=0;i<count;i++){
  const s=front?.72+i*.24:.38+i*.11;
  const cw=w*s,ch=cw*44/124;
  const x=mod(rnd(seed,i+501)*(w+cw)-t*(front?2.7+i:.7+i*.3),w+cw)-cw;
  const y=h*((front?.63:.23)+rnd(seed,i+551)*(front?.23:.4));
  c.globalAlpha=front?.30:.25;c.drawImage(cloudSprite(i,a.night),Math.round(x),Math.round(y),Math.round(cw),Math.round(ch));
 }
 c.globalAlpha=1;
}
function landscape(c,w,h,f,t,a){
 const seed=CITY_SCENES[f.route.id]?.[2]||17,originalPanel=scenePanel(f.route.id),[top,bottom]=skyColors(a);
 const specific=aerialPictures(f.route.id),useSpecific=specific.day?.complete&&specific.day.naturalWidth,painting=useSpecific?specific.day:art,nightPainting=useSpecific?specific.night:nightArt,panel=useSpecific?specific.cell:originalPanel;
 const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,top);sky.addColorStop(1,bottom);c.fillStyle=sky;c.fillRect(0,0,w,h);
 if(painting?.complete&&painting.naturalWidth){
  const pw=painting.naturalWidth/(specific.single?1:2),ph=painting.naturalHeight/(specific.single?1:3);
  // A gentle continuous pan within each panel avoids visible repeating seams.
  const sz=Math.max(w*1.43,h*1.06),travel=sz-w;
  // Nose and engine face right; distant ground and clouds drift left.
  const phase=.20+a.progress*.54+(seed%7)*.025;
  const dx=-Math.min(travel,travel*phase),dy=h-sz;
  c.filter='saturate(.78)';c.drawImage(painting,(panel%2)*pw+2,Math.floor(panel/2)*ph+2,pw-4,ph-4,dx,dy,sz,sz);c.filter='none';
  const dusk=Math.max(0,Math.min(1,(a.clock-.28)/.2));
  c.globalAlpha=dusk*.22;c.fillStyle='#b77673';c.fillRect(0,0,w,h);c.globalAlpha=1;
  const nightMix=Math.max(0,Math.min(1,(a.clock-.52)/.20));
  if(nightPainting?.complete&&nightPainting.naturalWidth&&nightMix){const npw=nightPainting.naturalWidth/(specific.single?1:2),nph=nightPainting.naturalHeight/(specific.single?1:3);c.globalAlpha=nightMix;c.drawImage(nightPainting,(panel%2)*npw+2,Math.floor(panel/2)*nph+2,npw-4,nph-4,dx,dy,sz,sz);c.globalAlpha=1;}
 }
 if(['moon','stars'].includes(f.route.id)){
  const ocean=c.createLinearGradient(0,h*.52,0,h);ocean.addColorStop(0,'#2c4355');ocean.addColorStop(1,'#142c42');c.fillStyle=ocean;c.fillRect(0,h*.54,w,h*.46);
  for(let i=0;i<34;i++){const y=h*(.59+rnd(seed,i)*.4);c.globalAlpha=.15+rnd(seed,i+3)*.15;c.fillStyle='#c2d0c6';c.fillRect(w*.61+rnd(seed,i+21)*w*.17+Math.sin(t*.1+i)*2,y,2+rnd(seed,i+54)*w*.12,1);}c.globalAlpha=1;
 }
 if(a.night){
  c.fillStyle='#dce2d7';for(let i=0;i<22;i++){c.globalAlpha=.24+rnd(seed,i)*.3;c.fillRect(Math.round(rnd(seed,i+70)*w),Math.round(rnd(seed,i+170)*h*.23),1,1);}c.globalAlpha=1;
  const mx=w*.78,my=h*.14;c.fillStyle='#d6dbcc';c.beginPath();c.arc(mx,my,w*.022,0,Math.PI*2);c.fill();
 }
 if(f.route.id==='kef'&&a.night){c.globalAlpha=.19;polygon(c,[[0,h*.17],[w*.4,h*.09],[w,h*.19],[w,h*.24],[w*.4,h*.15],[0,h*.24]],'#a2cbbf');c.globalAlpha=1;}
 clouds(c,w,h,t,a,seed);
}
function wing(c,w,h,a){
 if(!wingArt?.complete||!wingArt.naturalWidth)return;
 const ww=w*1.20,hh=ww*wingArt.naturalHeight/wingArt.naturalWidth;
 c.save();c.filter=a.night?'brightness(.66) saturate(.7)':a.evening?'sepia(.12)':'none';
 // The wing root enters from the seat side; no horizontal reversal.
 c.drawImage(wingArt,-w*.04,h*.57,ww,hh);c.restore();
}
function windowPath(c,x,y,w,h){c.beginPath();c.roundRect(x,y,w,h,[w*.34,w*.34,w*.38,w*.38]);}
function weatherOnGlass(c,w,h,t,a,route){
 if(a.cloud!==3)return;const snow=['hel','kef','zrh'].includes(route);c.save();c.globalAlpha=a.night?.20:.28;c.fillStyle=a.night?'#b1c7d0':'#e9f1ef';
 for(let i=0;i<16;i++){const x=Math.round(mod(i*47.3+Math.sin(i)*11+t*(snow?1:2),w)),y=Math.round(mod(i*31.7+t*(snow?5:18),h));c.fillRect(x,y,snow?2:1,snow?2:5+i%4);}
 c.restore();
}
export function drawScenery(canvas,f,t=f.time,mini=false){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;if(!w||!h)return;
 const a=flightAtmosphere(f);c.imageSmoothingEnabled=false;c.clearRect(0,0,w,h);
 if(mini){landscape(c,w,h,f,t,a);return;}
 if(f.view==='plane'){
  landscape(c,w,h,f,t,a);
  if(jet?.complete&&jet.naturalWidth){
   const jw=w*.76,jh=jw*jet.naturalHeight/jet.naturalWidth;
   c.save();c.translate(w*.50,h*.45);c.rotate(Math.sin(t*.07)*.008);c.scale(-1,1);
   c.drawImage(jet,-jw/2,-jh/2,jw,jh);c.restore();
  }
  clouds(c,w,h,t,a,CITY_SCENES[f.route.id]?.[2]||17,true);
 }else{
  // Real window reveal with layered rim, rather than a line around the whole screen.
  c.fillStyle=a.night?'#69747c':'#e9e8df';c.fillRect(0,0,w,h);
  const x=w*.07,y=h*.095,ww=w*.86,hh=h*.80;
  c.save();windowPath(c,x,y,ww,hh);c.clip();landscape(c,w,h,f,t,a);wing(c,w,h,a);weatherOnGlass(c,w,h,t,a,f.route.id);
  const reflection=c.createLinearGradient(x,y,x+ww,y+hh);reflection.addColorStop(0,'#ffffff13');reflection.addColorStop(.5,'#ffffff00');reflection.addColorStop(1,'#ffffff0c');c.fillStyle=reflection;c.fillRect(x,y,ww,hh);c.restore();
  for(const [width,col] of [[12,a.night?'#4e5966':'#d0d4d0'],[7,a.night?'#86919a':'#f6f4e9'],[2,a.night?'#343f4c':'#93a8ac']]){c.lineWidth=width;c.strokeStyle=col;windowPath(c,x,y,ww,hh);c.stroke();}
 }
}
let miniature;
export function drawCabinWindows(f,t){
 miniature ||= document.createElement('canvas');miniature.width=72;miniature.height=112;drawScenery(miniature,f,t,true);
 const camera=document.getElementById('camera'),top=camera.scrollTop,bottom=top+camera.clientHeight;
 for(const el of document.querySelectorAll('canvas.cabin-window')){const y=parseFloat(el.style.top);if(y>top-100&&y<bottom+100)el.getContext('2d').drawImage(miniature,0,0,el.width,el.height);}
}
