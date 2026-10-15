import {travelerProtection} from './avatar-protection.js?v=6.10.1';
import {travelerFaceOffset,eyewearBox} from './avatar-anchors.js?v=6.10.1';
import {SPRITE_BOUNDS} from './sprite-bounds.js?v=6.10.1';
import {drawItemArt} from './item-art.js?v=6.10.1';
import {wardrobeFrame} from './wardrobe-model.js?v=6.10.1';
const sheets={};
for(const kind of ['seated','walk'])if(typeof Image!=='undefined'){
 const im=new Image();sheets[kind]=im;
 im.addEventListener('load',()=>{if(typeof document!=='undefined')drawTravelerElements(0);});
 im.src=new URL(`./assets/travelers-${kind}-v6.3.1.png`,import.meta.url).href;
}
const cache=new Map();
const baseCache=new Map();
const outfitCache=new Map();
const neck={walk:[51,49,52,50,51,57,54,59,53,60,52,54],seated:[53,50,51,49,50,58,54,61,52,60,54,54]};
const hatTop=[3,5,7,7,8,15,10,17,10,13,8,10];


export function travelerGeometry(id=7,frame=0,walking=false){
 id=Math.max(0,Math.min(11,Math.floor(id)));frame=frame?1:0;
 const kind=walking?'walk':'seated',bounds=SPRITE_BOUNDS[kind==='walk'?'guests-walk-v4.png':'guests-motion.png'];
 const index=Math.floor(id/2)*4+(id%2)*2+frame,pair=index-frame,source=bounds[index];
 const height=Math.max(bounds[pair][3],bounds[pair+1][3]),scale=84/height;
 return {kind,id,source,destination:[Math.round((96-source[2]*scale)/2),Math.round(90-source[3]*scale),Math.round(source[2]*scale),Math.round(source[3]*scale)]};
}
// Keep each original face, tail and paw intact. An explicit torso stencil avoids
// recoloring fur or destroying outlines when a new outfit is selected.
export function drawTraveler(c,id=7,frame=0,color=null,walking=false,box=[0,0,96,96],styleId=null,hat=null,isolated=false){
 const g=travelerGeometry(id,frame,walking),sheet=sheets[g.kind];if(!sheet?.complete||!sheet.naturalWidth)return false;
 const [x,y,w,h]=box,index=Math.floor(g.id/2)*4+(g.id%2)*2+(frame?1:0),source=[index%4*192,Math.floor(index/4)*192,192,192],poseX=travelerFaceOffset(g.id,frame,walking)*w/96;
 let baseLayer;
 if(typeof document!=='undefined'&&!isolated){
  const baseKey=[g.kind,g.id,frame?1:0].join(':');baseLayer=baseCache.get(baseKey);
  if(!baseLayer){baseLayer=document.createElement('canvas');baseLayer.width=baseLayer.height=192;baseLayer.getContext('2d').drawImage(sheet,...source,0,0,192,192);baseCache.set(baseKey,baseLayer);}
 }
 if(styleId&&!isolated&&typeof document!=='undefined'){
  const key=[g.id,frame,color,walking,styleId].join(':');let layer=outfitCache.get(key);
  if(!layer){
   layer=document.createElement('canvas');layer.width=layer.height=192;
   const lc=layer.getContext('2d');
   lc.drawImage(baseLayer,0,0);
   const clothes=document.createElement('canvas');clothes.width=clothes.height=192;
   const cc=clothes.getContext('2d');
   drawTraveler(cc,id,frame,color,walking,[0,0,192,192],styleId,null,true);
   const base=lc.getImageData(0,0,192,192),ink=cc.getImageData(0,0,192,192).data;
   // Original art includes partially opaque torso pixels. Blend RGB directly,
   // preserving its alpha exactly, and keep the dark original ink intact.
   for(let i=0;i<base.data.length;i+=4){
    if(!base.data[i+3]||!ink[i+3]||base.data[i]*.2126+base.data[i+1]*.7152+base.data[i+2]*.0722<60)continue;
    const amount=ink[i+3]/255;
    for(let channel=0;channel<3;channel++)base.data[i+channel]=Math.round(base.data[i+channel]*(1-amount)+ink[i+channel]*amount);
   }
   const torsoTop=(neck[g.kind][g.id]-2)*2;
   lc.putImageData(base,0,0,48,torsoTop,96,176-torsoTop);
   outfitCache.set(key,layer);if(outfitCache.size>64)outfitCache.delete(outfitCache.keys().next().value);
  }
  c.save();c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(layer,x+poseX,y,w,h);
  if(hat)drawItemArt(c,hat,[x+26*w/96,y+hatTop[g.id]*h/96,44*w/96,30*h/96]);
  c.restore();return true;
 }
 c.save();c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 // Isolated rendering is the clothing-only layer. Never mask the original fur
 // twice: doing so squares its alpha and eats away the antialiased outline.
 if(!isolated){if(baseLayer)c.drawImage(baseLayer,x+poseX,y,w,h);else c.drawImage(sheet,...source,x+poseX,y,w,h);}
 if(/^#[0-9a-f]{6}$/i.test(color||'')){
  c.save();
  c.translate(x,y);c.scale(w/96,h/96);const n=neck[g.kind][g.id];
  c.fillStyle='#63594f';c.fillRect(39,n,18,4);
  c.fillStyle=color;c.fillRect(40,n+1,16,2);
  c.fillStyle='#f8f3e544';c.fillRect(41,n+1,14,1);
  c.fillStyle='#f5ecd9';
  if(styleId==='cream'||styleId==='sunset'){c.fillRect(47,n+2,2,6);c.fillStyle='#977c54';c.fillRect(48,n+4,1,1);}
  else if(styleId==='rose'||styleId==='midnight'){c.fillStyle=color;c.fillRect(40,n,5,5);c.fillRect(51,n,5,5);c.fillStyle='#be9758';c.fillRect(46,n+1,4,3);}
  else if(styleId==='ocean'){c.fillStyle=color;c.fillRect(51,n+2,4,8);c.fillStyle='#f5ecd9';c.fillRect(51,n+5,4,1);}
  else if(styleId==='lavender'){for(let x=41;x<55;x+=4)c.fillRect(x,n+2,2,2);}
  else if(styleId==='gold'){c.fillStyle='#be9758';c.fillRect(42,n,3,2);c.fillRect(51,n,3,2);}
  c.restore();
 }
 if(styleId){
  c.save();c.translate(x,y);c.scale(w/96,h/96);
  const n=neck[g.kind][g.id];
  c.beginPath();c.moveTo(35,n+1);c.lineTo(61,n+1);c.lineTo(67,n+5);c.lineTo(69,75);c.lineTo(64,80);c.lineTo(33,80);c.lineTo(30,75);c.lineTo(31,n+5);c.closePath();
  c.clip();
  // Intersect separate exclusions: overlapping hands and feet must remain holes,
  // rather than canceling each other as they would in one even-odd path.
  const protection=travelerProtection(g.id,frame,walking);
  for(const [hx,hy] of protection.hands){c.beginPath();c.rect(0,0,96,96);c.moveTo(hx+7,hy);c.ellipse(hx,hy,7,6,0,0,Math.PI*2);c.clip('evenodd');}
  for(const [px,py] of protection.paws){const [rx,ry]=protection.pawRadius;c.beginPath();c.rect(0,0,96,96);c.moveTo(px+rx,py);c.ellipse(px,py,rx,ry,0,0,Math.PI*2);c.clip('evenodd');}
  c.globalCompositeOperation='source-over';c.globalAlpha=.72;c.fillStyle=color||'#8aa28c';c.fillRect(24,n,48,31);
  c.globalCompositeOperation='source-over';c.globalAlpha=.45;
  drawItemArt(c,'style-'+styleId,[24,n-5,48,28]);
  c.restore();
 }
 if(hat)drawItemArt(c,hat,[x+26*w/96,y+hatTop[g.id]*h/96,44*w/96,30*h/96]);
 c.restore();return true;
}
export function travelerSprite(id=7,frame=0,color=null,walking=false){
 const key=`${walking}:${id}:${frame}:${color}`;if(cache.has(key))return cache.get(key);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
 if(!drawTraveler(canvas.getContext('2d'),id,frame,color,walking))return null;
 cache.set(key,canvas);if(cache.size>220)cache.delete(cache.keys().next().value);return canvas;
}
export function drawTravelerElements(time=0){
 document.querySelectorAll('.sprite canvas').forEach(canvas=>{
  const el=canvas.parentElement,rect=canvas.getBoundingClientRect(),density=Math.max(1,Math.min(3,globalThis.devicePixelRatio||1));
  if(rect.width>0&&rect.height>0){const width=Math.round(rect.width*density),height=Math.round(rect.height*density);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}}
  const c=canvas.getContext('2d');
  c.clearRect(0,0,canvas.width,canvas.height);
  const frame=el.closest('.avatar-card,.wardrobe-preview')?wardrobeFrame():Math.floor(time/2.6)%2;
  drawTraveler(c,+el.dataset.avatar,frame,el.style.getPropertyValue('--clothes')||null,false,[0,0,canvas.width,canvas.height],el.dataset.travelStyle,el.dataset.hat);
  if(el.dataset.glasses)drawItemArt(c,el.dataset.glasses,eyewearBox(+el.dataset.avatar,frame,false,el.dataset.glasses,[0,0,canvas.width,canvas.height]));
 });
}
