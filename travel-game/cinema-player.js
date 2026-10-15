import {atlasReady,drawAtlas,discoveryAsset} from './generated-art.js?v=6.9.0';
import {drawAnimal} from './animal-art.js?v=6.9.0';
export const CINEMA_FILMS={
 '도시 산책':[{id:'paris:place-0',title:'파리 · 에펠탑'},{id:'tokyo:place-0',title:'도쿄 · 센소지'},{id:'lis:place-0',title:'리스본 · 벨렝 탑'}],
 '바다 여행':[{id:'hawaii:place-0',title:'하와이 · 와이키키 해변'},{id:'jeju:place-1',title:'제주 · 협재해변'},{id:'syd:place-1',title:'시드니 · 본다이 비치'}],
 '숲의 작은 친구들':[{id:'chengdu:place-0',title:'청두 · 대나무 숲의 판다'},{id:'sin:place-1',title:'싱가포르 · 정원의 도마뱀',animal:9},{id:'dps:place-1',title:'발리 · 초록 들판의 게코',animal:9}]
};
export function cinemaFrame(theme,time=0){const shots=CINEMA_FILMS[theme]||CINEMA_FILMS['도시 산책'],clock=Math.max(0,Number.isFinite(time)?time:0),index=Math.floor(clock/9)%shots.length,within=clock%9;return {shot:shots[index],index,count:shots.length,within,zoom:1.04+within*.003,pan:Math.sin(within*.15)*.02,fade:Math.min(1,within/.65,(9-within)/.65)};}
export function cinemaReady(theme){return atlasReady((CINEMA_FILMS[theme]||[]).map(x=>discoveryAsset(x.id).file));}
let animalCanvas;
export function drawCinema(canvas,theme,time=0){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,frame=cinemaFrame(theme,time),{shot,zoom,pan,fade}=frame;c.save();c.imageSmoothingEnabled=false;c.fillStyle='#ebe4d1';c.fillRect(0,0,w,h);c.globalAlpha=Math.max(.12,fade);c.beginPath();c.rect(0,0,w,h);c.clip();
 drawAtlas(c,{...discoveryAsset(shot.id),cover:true},[-w*(zoom-1)/2+w*pan,-h*(zoom-1)/2,w*zoom,h*zoom]);
 if(shot.animal!==undefined&&typeof document!=='undefined'){animalCanvas||=document.createElement('canvas');animalCanvas.width=240;animalCanvas.height=260;drawAnimal(animalCanvas,shot.animal);c.drawImage(animalCanvas,w*.36,h*.25,w*.30,h*.70);}
 c.restore();return frame;
}
