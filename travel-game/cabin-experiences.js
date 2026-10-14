export const CABIN_EXPERIENCES={
 economy:[],
 business:[{id:'amenity',name:'어메니티 키트',note:'안대·립밤·따뜻한 수건 중 지금 필요한 것을 골라요.',choices:['안대','립밤','따뜻한 수건'],comfort:12,joy:6},{id:'flatbed',name:'좌석을 침대로',note:'좌석을 완전히 펼치고 이불을 덮어요.',choices:['낮잠 준비','독서하며 기대기'],comfort:18,joy:5},{id:'cinema',name:'기내 시네마',note:'헤드폰을 쓰고 좌석 화면에서 여행 영상을 골라요.',choices:['도시 산책','바다 여행','숲의 작은 친구들'],comfort:4,joy:18}],
 first:[{id:'suite',name:'나만의 스위트',note:'문과 조명을 조절해 조용한 공간을 만들어요.',choices:['문을 닫고 은은한 조명','문을 열고 밝은 조명'],comfort:15,joy:10},{id:'turndown',name:'포근한 침대 준비',note:'잠옷과 매트리스 패드, 이불로 잠자리를 준비해요.',choices:['잠옷 입고 푹 쉬기','이불 덮고 책 읽기'],comfort:25,joy:10},{id:'tea',name:'티와 디저트',note:'원하는 시간에 차와 작은 디저트를 부탁해요.',choices:['따뜻한 차와 케이크','라테와 크루아상','코코아와 쿠키'],comfort:10,joy:20},{id:'cinema',name:'프라이빗 시네마',note:'큰 화면과 헤드폰으로 나만의 상영 시간을 즐겨요.',choices:['도시 산책','바다 여행','숲의 작은 친구들'],comfort:5,joy:20}]
};
export function cabinExperience(f,id,choice){
 const item=CABIN_EXPERIENCES[f?.cabin]?.find(x=>x.id===id);
 if(!item||f.completed||!item.choices.includes(choice))return {ok:false,message:'이 좌석에서 이용할 수 없는 서비스예요.'};
 const replayed=!!f.experiences?.[id];
 f.experiences={...(f.experiences||{}),[id]:choice};if(!replayed){f.comfort=Math.min(100,f.comfort+item.comfort);f.joy=Math.min(100,f.joy+item.joy);}
 if(['flatbed','turndown'].includes(id))f.seatMode='bed';if(id==='suite')f.suiteClosed=choice.startsWith('문을 닫');if(id==='cinema')f.cinemaTheme=choice;
 return {ok:true,item,replayed,message:replayed?choice+' · 다시 즐겨요':choice+' · 편안함 +'+item.comfort+' · 즐거움 +'+item.joy};
}
export function restoreExperiences(raw,cabin){return Object.fromEntries((CABIN_EXPERIENCES[cabin]||[]).filter(x=>x.choices.includes(raw?.[x.id])).map(x=>[x.id,raw[x.id]]));}
