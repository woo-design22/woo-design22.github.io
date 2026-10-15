const pictures={};
const wrap=(value,size)=>(value%size+size)%size;
export const RAIL_PICTURES={train:'rail-airport-v6.5.1.webp',subway:'rail-subway-v6.5.1.webp'};
export const RAIL_TYPES={train:{name:'공항철도',cars:2,doorsPerCar:2,nose:'streamlined',background:'surface',width:288},subway:{name:'지하철',cars:3,doorsPerCar:3,nose:'flat',background:'tunnel',width:294}};
export function railOptionArt(id){const file=RAIL_PICTURES[id];return file?`<span class="rail-option-preview"><img src="./assets/${file}" alt="${RAIL_TYPES[id].name} 차량"></span>`:'';}
for(const [id,file] of Object.entries(RAIL_PICTURES))if(typeof Image!=='undefined'){const image=new Image();image.src=new URL('./assets/'+file,import.meta.url).href;pictures[id]=image;}
export function railImage(id){return pictures[id]||null;}
export function drawAirportRailVehicle(c,id,night=false){const image=pictures[id];if(!image?.complete||!image.naturalWidth)return false;const width=RAIL_TYPES[id].width,height=width*image.naturalHeight/image.naturalWidth;c.save();c.imageSmoothingEnabled=false;if(night)c.filter='brightness(.82)';c.drawImage(image,(360-width)/2,218-height,width,height);c.restore();return true;}
export function drawRailBackground(c,id,t=0,night=false){
 if(id==='subway'){
  c.fillStyle='#566663';c.fillRect(0,0,360,240);c.fillStyle='#839188';c.fillRect(0,28,360,139);c.fillStyle='#a4ada1';c.fillRect(0,50,360,3);c.fillRect(0,151,360,3);
  for(let n=0;n<8;n++){const x=wrap(n*70-t*35,560)-100;c.fillStyle='#455b58';c.fillRect(x,14,10,181);c.fillStyle='#a0ada2';c.fillRect(x+10,20,3,164);c.fillStyle='#f4e8c1';c.fillRect(x+19,38,32,5);c.fillStyle='#a9b4a4';c.fillRect(x+19,43,32,2);}
  c.fillStyle='#3d514d';c.fillRect(0,168,360,72);
 }else{
  c.fillStyle=night?'#62716b':'#a4b296';c.fillRect(0,172,360,68);
  for(let n=0;n<5;n++){const x=wrap(n*110-t*18,550)-110;c.fillStyle=night?'#758b86':'#899b8d';c.fillRect(x,51,3,132);c.fillRect(x-18,52,47,3);c.fillRect(x+24,52,3,16);}c.fillStyle='#81958b';c.fillRect(0,54,360,1);
 }
 c.fillStyle=night?'#5c6963':'#7b8778';for(let n=0;n<20;n++)c.fillRect(wrap(n*24-t*28,480)-70,209,8,28);
 c.fillStyle='#bcc5b4';c.fillRect(0,217,360,3);c.fillRect(0,231,360,3);
}
