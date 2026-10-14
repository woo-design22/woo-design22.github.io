export const AERIAL_GROUPS=[
 ['jeju','tokyo','taipei','paris','hawaii','moon'],
 ['bkk','sin','dad','dps','syd','akl'],
 ['dxb','ist','fco','bcn','lis','lhr'],
 ['ams','cph','hel','zrh','prg','jfk'],
 ['sfo','yvr','mex','lim','kef','stars'],['chengdu']
];
const pictures=AERIAL_GROUPS.map(ids=>({ids}));
export function atlasCell(id){for(let group=0;group<AERIAL_GROUPS.length;group++){const cell=AERIAL_GROUPS[group].indexOf(id);if(cell!==-1)return {group,cell};}return {group:0,cell:0};}
export function aerialPictures(id){const {group,cell}=atlasCell(id),entry=pictures[group];if(typeof Image!=='undefined'&&!entry.day){const letter=group===5?'chengdu':'abcde'[group];entry.day=new Image();entry.night=new Image();entry.day.src=new URL(`./assets/aerial-${letter}-day-v4.png`,import.meta.url).href;entry.night.src=new URL(`./assets/aerial-${letter}-night-${letter==='b'?'v4b':'v4'}.png`,import.meta.url).href;}return {...entry,cell,single:group===5};}
export function aerialReady(ids){return Promise.all([...new Set(ids)].flatMap(id=>{const entry=aerialPictures(id);return [entry.day,entry.night].map(image=>new Promise(resolve=>{if(!image||image.complete){resolve();return;}image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}));}));}
