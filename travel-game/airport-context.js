export const ORIGIN_AIRPORT={id:'incheon',name:'인천 국제공항',country:'대한민국'};
export function airportRegion(j){return j?.stage==='airport'?'incheon':j?.stage==='arrival'?j.routeId:null;}
export function atLocalAirport(j){return j?.stage==='arrival'&&j.entry?.passed===true&&j.baggage===true;}
