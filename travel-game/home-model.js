export const HOME_CITIES=[
 {id:'jung',name:'서울 중구',view:'남산과 오래된 도심의 지붕',cost:1800},
 {id:'yeongdeungpo',name:'서울 영등포구',view:'한강과 여의도 빌딩',cost:2200},
 {id:'gangnam',name:'서울 강남구',view:'넓은 대로와 현대적인 도심',cost:3600},
 {id:'seongbuk',name:'서울 성북구',view:'한옥 지붕과 초록 언덕',cost:1200},
 {id:'gyeonggi',name:'경기도',view:'산과 개울이 있는 동네',cost:1500},
 {id:'busan',name:'부산',view:'바다 위로 이어진 광안대교',cost:2800},
 {id:'sejong',name:'세종',view:'호수공원과 곡선 지붕',cost:2100},
 {id:'daejeon',name:'대전',view:'엑스포 다리와 한빛탑',cost:1700},
 {id:'daegu',name:'대구',view:'팔공산 아래 낮은 지붕들',cost:1900},
 {id:'ulsan',name:'울산',view:'태화강과 대나무 숲',cost:2300},
 {id:'gwangju',name:'광주',view:'무등산 아래 포근한 도시',cost:1800},
 {id:'chuncheon',name:'춘천',view:'호수와 산이 감싼 작은 섬',cost:2400}
];
export const HOME_TYPES=[{id:'studio',name:'작은 원룸',cost:0,note:'혼자 쉬기 좋은 나무빛 방'},{id:'apartment',name:'창가 아파트',cost:2500,note:'큰 창과 여유로운 거실'},{id:'loft',name:'복층 집',cost:6000,note:'계단과 다락이 있는 넓은 집'}];
export const HOME_FINISHES=[{id:'wood',name:'나무와 리넨',wall:'세로 나무 패널',floor:'넓은 참나무 마루',cost:0},{id:'cottage',name:'작은 꽃집',wall:'크림 몰딩과 작은 꽃무늬',floor:'대각선 헤링본 마루',cost:500},{id:'modern',name:'조용한 갤러리',wall:'밝은 회벽과 기하학 장식',floor:'큰 돌 타일',cost:850},{id:'atelier',name:'오래된 작업실',wall:'작은 붉은 벽돌',floor:'모자이크 테라조',cost:650},{id:'coastal',name:'바닷가 휴일',wall:'아치 무늬와 가로 패널',floor:'둥근 자갈 타일',cost:700},{id:'playful',name:'햇살 드는 오후',wall:'잔꽃무늬 벽지',floor:'작은 체커보드 타일',cost:600}];
export const HOME_CATEGORIES=[{id:'bed',name:'침대'},{id:'sofa',name:'소파'},{id:'desk',name:'책상'},{id:'lamp',name:'조명'},{id:'plant',name:'식물'},{id:'rug',name:'러그'},{id:'curtain',name:'커튼'},{id:'art',name:'벽 장식'},{id:'storage',name:'수납장'},{id:'table',name:'테이블'}];
const categories=HOME_CATEGORIES.map(x=>x.id);
const catalogue=[
 ['참나무 퀼트 침대','꽃무늬 철제 침대','낮은 다다미 침대','캐노피 침대','물결 머리판 침대','사다리 다락 침대'],
 ['라탄 소파','구름 소파','ㄱ자 모듈 소파','버튼 가죽 소파','나무 프레임 소파','볼스터 데이베드'],
 ['타원형 서랍 책상','빈티지 서랍 책상','선반 다리 책상','롤톱 책상','벽걸이 책상','모서리 작업 책상'],
 ['주름 갓 조명','황동 꽃잎 조명','아치 조명','버섯 조명','종이 랜턴 조명','관절 스탠드 조명'],
 ['토분 고무나무','바구니 고사리','도자기 떡갈고무나무','돌 화분 선인장','행잉 포토스','작은 분재'],
 ['타원 황마 러그','꽃무늬 페르시안 러그','둥근 레이스 러그','체커보드 러그','나뭇잎 러그','별 모양 러그'],
 ['리넨 커튼','레이스 카페 커튼','대나무 블라인드','꽃무늬 묶음 커튼','로만 셰이드','물결 줄무늬 커튼'],
 ['풍경 유화','여행 사진 세 장','햇살 원형 거울','마크라메 장식','식물 족자','뻐꾸기 시계'],
 ['참나무 책장','유리 빈티지 장식장','바구니 칸칸 수납장','키 큰 철제 로커','둥근 라탄 옷장','미닫이 낮은 서랍장'],
 ['원형 나무 테이블','타원 유리 테이블','여행 트렁크 테이블','낮은 다도 테이블','둥근 중첩 테이블','돌판 테이블']
];
export const HOME_FURNITURE=catalogue.flatMap((row,slot)=>row.map((name,variant)=>({id:HOME_FINISHES[variant].id+'-'+categories[slot],name,slot:categories[slot],cell:variant,cost:[420,320,240,140,120,160,180,150,280,200][slot]+variant*120})));
export function residenceState(raw){
 const furniture=HOME_FURNITURE.filter(x=>(x.id.startsWith('wood-')&&categories.indexOf(x.slot)<5)||raw?.ownedFurniture?.includes(x.id)).map(x=>x.id);
 const cities=HOME_CITIES.filter(x=>x.id==='seongbuk'||raw?.ownedCities?.includes(x.id)).map(x=>x.id);
 const types=HOME_TYPES.filter(x=>x.id==='studio'||raw?.ownedTypes?.includes(x.id)).map(x=>x.id);
 const finishes=HOME_FINISHES.filter(x=>x.id==='wood'||raw?.ownedFinishes?.includes(x.id)).map(x=>x.id);
 const equipped={};for(const slot of categories){const candidate=HOME_FURNITURE.find(x=>x.id===raw?.furniture?.[slot]&&x.slot===slot&&furniture.includes(x.id));equipped[slot]=candidate?.id||(categories.indexOf(slot)<5?'wood-'+slot:null);}
 return {city:cities.includes(raw?.city)?raw.city:'seongbuk',type:types.includes(raw?.type)?raw.type:'studio',wall:finishes.includes(raw?.wall)?raw.wall:'wood',floor:finishes.includes(raw?.floor)?raw.floor:'wood',ownedCities:cities,ownedTypes:types,ownedFinishes:finishes,ownedFurniture:furniture,furniture:equipped};
}
export function homePurchase(p,kind,id){
 p.residence=residenceState(p.residence);const h=p.residence;
 if(kind==='remove'&&categories.includes(id)){h.furniture[id]=categories.indexOf(id)<5?'wood-'+id:null;return {ok:true,cost:0,message:categories.indexOf(id)<5?'기본 가구로 바꾸었어요.':'장식을 보관했어요.'};}
 const config={city:[HOME_CITIES,'ownedCities','city'],type:[HOME_TYPES,'ownedTypes','type'],wall:[HOME_FINISHES,'ownedFinishes','wall'],floor:[HOME_FINISHES,'ownedFinishes','floor'],furniture:[HOME_FURNITURE,'ownedFurniture',null]}[kind];
 if(!config)return {ok:false,message:'꾸밀 곳을 다시 골라주세요.'};
 const [pool,owned,key]=config,item=pool.find(x=>x.id===id);if(!item)return {ok:false,message:'물건을 다시 골라주세요.'};
 const cost=h[owned].includes(id)?0:item.cost;
 if(p.coins<cost)return {ok:false,message:`${cost-p.coins}코인을 더 모으면 선택할 수 있어요.`};
 p.coins-=cost;if(!h[owned].includes(id))h[owned].push(id);
 if(kind==='furniture')h.furniture[item.slot]=id;else h[key]=id;
 return {ok:true,cost,message:kind==='city'?item.name+'의 새 창밖이 기다려요.':'선택한 모습으로 바꾸었어요.'};
}
