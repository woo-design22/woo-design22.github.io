import {profile} from './passenger-model.js?v=6.8.0';
import {unifyWallet} from './travel-experience.js?v=6.8.0';
export function exportSave(p,now=Date.now()){return JSON.stringify({game:'travel-game',format:1,exportedAt:now,profile:p},null,2);}
export function importSave(text){if(typeof text!=='string'||text.length>4000000)throw new Error('기록 파일 크기를 확인해주세요.');let data;try{data=JSON.parse(text);}catch{throw new Error('여행게임 기록 파일을 골라주세요.');}if(data?.game!=='travel-game'||data?.format!==1||data.profile?.version!==2)throw new Error('여행게임에서 내보낸 기록 파일이 필요해요.');return unifyWallet(profile(data.profile));}
