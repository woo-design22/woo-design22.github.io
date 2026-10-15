import {MEMORY_GOALS} from './travel-connections.js?v=6.10.0';
import {levelFor} from './model.js?v=6.10.0';
import {shopItem} from './shopping.js?v=6.10.0';
const classics=[{id:'sage',name:'세이지 니트',color:'#8aa28c',level:1},{id:'cream',name:'크림 가디건',color:'#dbcaa8',level:1},{id:'rose',name:'로즈 리본',color:'#b58b91',level:3},{id:'ocean',name:'하늘 스카프',color:'#7eabc1',level:5},{id:'lavender',name:'라벤더 니트',color:'#a99bbd',level:8},{id:'sunset',name:'노을 가디건',color:'#c69873',level:12},{id:'midnight',name:'밤빛 리본',color:'#7385a2',level:16},{id:'gold',name:'여행가의 금빛',color:'#c6b678',level:24}];
export const STYLES=[...classics,
 {id:'picnic',name:'피크닉 멜빵',color:'#a4b49c',level:2,cut:'overalls'},
 {id:'sailor',name:'바다 세일러',color:'#8eb2bf',level:3,cut:'sailor'},
 {id:'cherry',name:'체리 자수 니트',color:'#c49ba1',level:4,cut:'embroidered'},
 {id:'denim',name:'데님 재킷',color:'#8299ae',level:5,cut:'jacket'},
 {id:'linen',name:'리넨 셔츠',color:'#d6cbb4',level:6,cut:'shirt'},
 {id:'daisy',name:'데이지 원피스',color:'#dbc98e',level:6,cut:'dress'},
 {id:'raincoat',name:'노란 비옷',color:'#d7b875',level:7,cut:'raincoat'},
 {id:'beret-trip',name:'체크 여행 코트',color:'#a79883',level:8,cut:'coat'},
 {id:'gingham',name:'깅엄 피크닉 셔츠',color:'#b6ab96',level:9,cut:'check'},
 {id:'cocoa',name:'코코아 더플코트',color:'#a78b78',level:10,cut:'duffle'},
 {id:'stripe',name:'줄무늬 티셔츠',color:'#91a9b7',level:10,cut:'stripe'},
 {id:'pajama',name:'별무늬 잠옷',color:'#a5a9c1',level:11,cut:'pajama'},
 {id:'kimono',name:'꽃잎 유카타',color:'#c5a9b4',level:12,cut:'wrap'},
 {id:'tropical',name:'야자수 셔츠',color:'#98b4a5',level:12,cut:'tropical'},
 {id:'tweed',name:'작은 트위드 재킷',color:'#b7a397',level:13,cut:'tweed'},
 {id:'puffer',name:'구름 패딩 조끼',color:'#b3c3bd',level:14,cut:'puffer'},
 {id:'hanbok',name:'모란 여행 한복',color:'#ba9caf',level:15,cut:'hanbok'},
 {id:'chef',name:'디저트 셰프 앞치마',color:'#ece0c5',level:16,cut:'apron'},
 {id:'explorer',name:'탐험가 조끼',color:'#b6ab86',level:17,cut:'vest'},
 {id:'duffle-blue',name:'하늘 더플코트',color:'#9cacbd',level:18,cut:'duffle'},
 {id:'embroidered',name:'꽃자수 블라우스',color:'#d6c5a3',level:19,cut:'embroidered'},
 {id:'knit-vest',name:'다이아 니트 조끼',color:'#a8b390',level:20,cut:'argyle'},
 {id:'ballet',name:'리본 튜닉',color:'#c6a9b7',level:21,cut:'tunic'},
 {id:'traveler',name:'세계여행 트렌치',color:'#c0ac89',level:24,cut:'trench'}
];
export const HATS=[
 {id:'hat-straw',name:'챙 넓은 밀짚모자',level:1,color:'#ceb789'},
 {id:'hat-beret',name:'파리 베레모',level:2,color:'#b38d95'},
 {id:'hat-bucket',name:'리넨 버킷햇',level:3,color:'#c8bfa5'},
 {id:'hat-cap',name:'피크닉 야구모자',level:4,color:'#8fa88d'},
 {id:'hat-sun',name:'물결 햇살모자',level:5,color:'#d9c69d'},
 {id:'hat-knit',name:'방울 니트모자',level:6,color:'#a1adbd'},
 {id:'hat-sailor',name:'세일러 모자',level:7,color:'#cad8d9'},
 {id:'hat-bow',name:'커다란 리본',level:8,color:'#b391ae'},
 {id:'hat-flower',name:'들꽃 화관',level:9,color:'#aeb88c'},
 {id:'hat-panama',name:'라탄 파나마',level:10,color:'#beaa83'},
 {id:'hat-earmuff',name:'구름 귀마개',level:12,color:'#c3bbb0'},
 {id:'hat-hood',name:'비 오는 날 후드',level:14,color:'#c4b477'}
];
export const SUNGLASSES=[
 {id:'sun-round',name:'동그란 선글라스',level:1,color:'#8a7164'},
 {id:'sun-cat',name:'고양이 눈 선글라스',level:2,color:'#b49b91'},
 {id:'sun-heart',name:'하트 선글라스',level:3,color:'#c29ba4'},
 {id:'sun-oval',name:'오벌 선글라스',level:4,color:'#8fa6a3'},
 {id:'sun-aviator',name:'파일럿 선글라스',level:5,color:'#bfa574'},
 {id:'sun-square',name:'각진 선글라스',level:6,color:'#73869a'},
 {id:'sun-flower',name:'꽃잎 선글라스',level:7,color:'#c4b58d'},
 {id:'sun-rimless',name:'투명 테 선글라스',level:8,color:'#b9c8c6'},
 {id:'sun-sport',name:'활동적인 고글',level:10,color:'#83a5af'},
 {id:'sun-half',name:'반테 선글라스',level:12,color:'#bfa68a'},
 {id:'sun-star',name:'별빛 선글라스',level:16,color:'#b3a5c0'},
 {id:'sun-butterfly',name:'나비 선글라스',level:20,color:'#bba18c'}
];

export const MEMORY_OUTFITS={picnic:'city-page',ocean:'sea-gallery',rose:'connected-friend'};
export function wearableAvailable(p,item){return !!item&&(levelFor(p.xp)>=item.level||(!!p.travel?.rewards?.includes(MEMORY_OUTFITS[item.id])||!!MEMORY_GOALS.find(g=>g.id===MEMORY_OUTFITS[item.id])?.done(p)));}
export function wardrobeState(p,raw={}){
 const level=levelFor(p.xp),looks={};
 for(let avatar=0;avatar<12;avatar++){
  const saved=raw.looks?.[avatar],legacy=avatar===p.avatar;
  const style=STYLES.find(s=>s.id===(saved?.style??(legacy?raw.style||p.style:'sage'))&&wearableAvailable(p,s))?.id||'sage';
  const hat=HATS.find(x=>x.id===saved?.hat&&x.level<=level)?.id||null;
  const candidate=saved?.glasses??(legacy?p.equipped?.glasses:null),bought=shopItem(candidate);
  const glasses=SUNGLASSES.find(x=>x.id===candidate&&x.level<=level)?.id||(bought?.category==='glasses'&&p.collection?.[candidate]?candidate:null);
  looks[avatar]={style,hat,glasses};
 }
 p.looks=looks;syncLook(p);return looks;
}
export function currentLook(p,avatar=p.avatar){return p.looks?.[avatar]||{style:avatar===p.avatar?p.style||'sage':'sage',hat:null,glasses:avatar===p.avatar?p.equipped?.glasses||null:null};}
export function syncLook(p){const look=currentLook(p);p.style=look.style;p.equipped||={};if(shopItem(look.glasses)?.category==='glasses')p.equipped.glasses=look.glasses;else delete p.equipped.glasses;}
export function selectTraveler(p,id){const level=levelFor(p.xp);if(!Number.isInteger(id)||id<0||id>=12||id!==7&&id>=Math.min(12,level+2))return false;p.looks||={};p.looks[p.avatar]||=currentLook(p);p.avatar=id;p.looks[id]||={style:'sage',hat:null,glasses:null};syncLook(p);return true;}
export function dressTraveler(p,kind,id){const pool={style:STYLES,hat:HATS,glasses:SUNGLASSES}[kind];if(!pool)return false;const item=pool.find(x=>x.id===id);if(id!==null&&(!wearableAvailable(p,item)))return false;if(kind==='style'&&id===null)return false;p.looks||={};p.looks[p.avatar]={...currentLook(p),[kind]:id};syncLook(p);return true;}
export function wearPurchasedGlasses(p,id){if(shopItem(id)?.category!=='glasses'||!p.collection?.[id])return false;p.looks||={};const look=currentLook(p);p.looks[p.avatar]={...look,glasses:look.glasses===id?null:id};syncLook(p);return true;}
export const wardrobeFrame=()=>0;
