import {drawAtlas,atlasReady} from './generated-art.js?v=6.9.0';
export const NEIGHBORHOOD_GROUPS=[['jeju','tokyo','taipei','paris','hawaii','moon'],['bkk','sin','dad','dps','syd','akl'],['dxb','ist','fco','bcn','lis','lhr'],['ams','cph','hel','zrh','prg','jfk'],['sfo','yvr','mex','lim','kef','stars'],['chengdu']];
export function neighborhoodAsset(id){const group=NEIGHBORHOOD_GROUPS.findIndex(g=>g.includes(id));if(group<0)return null;const index=NEIGHBORHOOD_GROUPS[group].indexOf(id),single=group===5;return {file:`neighborhood-${group}-v6.5.webp`,columns:single?1:2,rows:single?1:3,col:single?0:index%2,row:single?0:Math.floor(index/2)};}
export function neighborhoodArtReady(id){const asset=neighborhoodAsset(id);return asset?atlasReady([asset.file]):Promise.resolve();}
export function drawNeighborhoodPicture(c,j){return drawAtlas(c,neighborhoodAsset(j.routeId),[0,0,360,240]);}
