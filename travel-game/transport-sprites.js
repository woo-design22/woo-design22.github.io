import {ROUTES} from './model.js?v=6.13.0';
import {TRANSPORT_SPRITES} from './transport-sprite-bounds.js?v=6.13.0';
import {imageReady} from './image-ready.js?v=6.13.0';
const images={};
export function transportSprite(route,id){const kind=id==='limousine'?'coach':id==='subway'?'metro':id==='train'?'express':id==='train'?'express':null;if(!kind)return null;const spec=TRANSPORT_SPRITES[kind],index=route==='incheon'?31:ROUTES.findIndex(r=>r.id===route);if(index<0)return null;return {...spec,kind,index,source:spec.bounds[index]};}
export function spriteImage(id){const kind=id==='limousine'?'coach':id==='subway'?'metro':id==='train'?'express':id;if(!TRANSPORT_SPRITES[kind]||typeof Image==='undefined')return null;if(!images[kind]){const image=new Image();image.src=new URL('./assets/'+TRANSPORT_SPRITES[kind].file,import.meta.url).href;images[kind]=image;}return images[kind];}
export function warmTransportSprites(){return Promise.all(['coach','metro','express'].map(kind=>imageReady(spriteImage(kind))));}
export function drawTransportSprite(c,route,id,night=false){const spec=transportSprite(route,id),image=spriteImage(id);if(!spec||!image?.complete||!image.naturalWidth)return false;const [sx,sy,sw,sh]=spec.source,scale=Math.min((id==='limousine'?254:292)/sw,128/sh),width=sw*scale,height=sh*scale;c.save();c.imageSmoothingEnabled=false;if(night)c.filter='brightness(.78)';c.drawImage(image,sx,sy,sw,sh,(360-width)/2,218-height,width,height);c.restore();return true;}
