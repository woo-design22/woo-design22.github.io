import {drawTransportSprite} from './transport-sprites.js?v=6.12.0';
import {drawVehicleModel} from './vehicle-design.js?v=6.12.0';
import {imageReady} from './image-ready.js?v=6.12.0';
import {AIRPORT_BOUNDS} from './airport-bounds.js?v=6.12.0';
import {VEHICLE_BOUNDS} from './vehicle-bounds.js?v=6.12.0';
import {ROOM_BOUNDS} from './room-bounds.js?v=6.12.0';
// Every destination resolves to its own painted rooms, terminal, and three vehicle bodies.
export const CITY_VISUALS=[
  {
    "id": "jeju",
    "name": "Jeju",
    "group": 0,
    "row": 0,
    "architecture": "basalt stone walls, Korean timber beams, mandarin garden, low island cottage",
    "terminal": "small coastal terminal, volcanic stone columns, sweeping seagull roof, orange grove planters",
    "vehicles": [
      "sleek Korean commuter train",
      "rounded island coach with high luggage hold",
      "compact Korean electric taxi"
    ]
  },
  {
    "id": "tokyo",
    "name": "Tokyo",
    "group": 0,
    "row": 1,
    "architecture": "tatami floor, sliding shoji screens, low futon and tea table, compact Japanese room",
    "terminal": "long Japanese terminal with timber slat ceiling, ordered narrow glass bays, origami roof beams",
    "vehicles": [
      "Japanese silver commuter train with square doors",
      "compact short airport coach",
      "tall black Japanese taxi with sliding rear door"
    ]
  },
  {
    "id": "taipei",
    "name": "Taipei",
    "group": 0,
    "row": 2,
    "architecture": "green tiled tea-house room, Chinese lattice window, loft wooden bed, tea cupboard",
    "terminal": "curving steel terminal canopy, green mountain backdrop, bamboo-like columns, angular concourse",
    "vehicles": [
      "Taiwanese commuter rail with rounded silver nose",
      "angular city bus with large side windows",
      "squat yellow hatchback taxi"
    ]
  },
  {
    "id": "paris",
    "name": "Paris",
    "group": 0,
    "row": 3,
    "architecture": "Haussmann mouldings, sloped mansard attic, tall arched French windows, carved bed, parquet",
    "terminal": "curved concrete tube-like terminal, cylindrical roof ribs, dramatic repeated arches, glass walkway",
    "vehicles": [
      "short Paris metro with curved roof",
      "elongated low-floor articulated city bus",
      "compact French estate taxi"
    ]
  },
  {
    "id": "hawaii",
    "name": "Hawaii",
    "group": 0,
    "row": 4,
    "architecture": "plantation cottage, timber shutters, rattan bed, open palm veranda, ocean-facing wicker",
    "terminal": "open-air tropical island terminal, low pavilion roof, palm courtyard, lava rock walls",
    "vehicles": [
      "small waterfront light-rail carriage",
      "open trolley bus with canopy and open sides",
      "large island taxi van"
    ]
  },
  {
    "id": "moon",
    "name": "Moon coast fantasy",
    "group": 0,
    "row": 5,
    "architecture": "moon-shell alcove, crescent window, rounded pearl bed, shell tea table",
    "terminal": "arched lunar terminal, moon crater glass roof, pearl pillars, calm fictional spaceport",
    "vehicles": [
      "rounded moon tram with oval windows",
      "crescent-shell shuttle pod",
      "small floating lunar capsule taxi"
    ]
  },
  {
    "id": "bkk",
    "name": "Bangkok",
    "group": 1,
    "row": 0,
    "architecture": "Thai teak house, carved triangular roof, silk canopy bed, lotus courtyard, raised timber floor",
    "terminal": "tall tent-like steel terminal roof, silver tensile arches, tropical planted concourse",
    "vehicles": [
      "elevated rail with sharply sloping silver nose",
      "tall city coach with roof ventilation",
      "three-wheeled enclosed tuk-tuk taxi"
    ]
  },
  {
    "id": "sin",
    "name": "Singapore",
    "group": 1,
    "row": 1,
    "architecture": "Peranakan shophouse, carved shutter window, patterned encaustic tile, courtyard lightwell",
    "terminal": "large domed terminal garden, central indoor waterfall, glass grids and curved garden terraces",
    "vehicles": [
      "modern driverless metro with wraparound nose",
      "long city bus with vertical glass panels",
      "streamlined four-door urban taxi"
    ]
  },
  {
    "id": "dad",
    "name": "Da Nang",
    "group": 1,
    "row": 2,
    "architecture": "Vietnamese coastal courtyard, woven fishing-net decor, blue shutter room, terracotta floor",
    "terminal": "low glazed coastal terminal, layered folding roof, river-blue structural beams",
    "vehicles": [
      "small coastal diesel railcar",
      "Vietnamese mid-size minibus with high roof",
      "small green electric hatchback taxi"
    ]
  },
  {
    "id": "dps",
    "name": "Bali",
    "group": 1,
    "row": 3,
    "architecture": "Balinese stone pavilion, carved split doorway, woven bamboo roof, mosquito-canopy bed, garden bath",
    "terminal": "Balinese split-gate terminal entrance, temple-like tiled roofs, carved stone gateways, fern court",
    "vehicles": [
      "fictional compact bamboo-trimmed tourist railcar",
      "small boxy island shuttle van",
      "compact blue island taxi with sloped rear"
    ]
  },
  {
    "id": "syd",
    "name": "Sydney",
    "group": 1,
    "row": 4,
    "architecture": "harbour warehouse conversion, exposed brick, sail-shaped skylight, coastal hardwood floor",
    "terminal": "broad harbour-facing steel glass terminal, wave canopy, suspended white roof panels",
    "vehicles": [
      "double-deck commuter train with two rows of windows",
      "long Australian single-deck coach",
      "large white Australian taxi SUV"
    ]
  },
  {
    "id": "akl",
    "name": "Auckland",
    "group": 1,
    "row": 5,
    "architecture": "timber hill bungalow, wool rug, fern conservatory, angular bay window, Kauri-like furniture",
    "terminal": "fern garden terminal, timber rib roof, sculptural carved lattice entry and wide glazing",
    "vehicles": [
      "rounded green electric rail carriage",
      "short harbour bus with curved windscreen",
      "compact silver hybrid taxi"
    ]
  },
  {
    "id": "dxb",
    "name": "Dubai",
    "group": 2,
    "row": 0,
    "architecture": "Arabic wind-tower courtyard, mashrabiya screens, horseshoe arches, divan bed, marble",
    "terminal": "large oval steel terminal arches, high desert skylight vault, date palms, polished stone",
    "vehicles": [
      "driverless gold-nosed metro with full round windshield",
      "high-deck desert coach",
      "long cream sedan taxi with raised roof light"
    ]
  },
  {
    "id": "ist",
    "name": "Istanbul",
    "group": 2,
    "row": 1,
    "architecture": "Ottoman bay-window room, Iznik tile wall, low divan, domed niches, brass tea set",
    "terminal": "vast wave-shaped airport roof, blue tiled vaults, pointed arch pier, airy concourse",
    "vehicles": [
      "modern Istanbul tram with wide curved nose",
      "boxy Turkish intercity coach",
      "small yellow Turkish sedan taxi"
    ]
  },
  {
    "id": "fco",
    "name": "Rome",
    "group": 2,
    "row": 2,
    "architecture": "Roman courtyard room, brick barrel vault, stone arch window, terracotta tile, iron bed",
    "terminal": "sunlit Roman terminal with broad ribbed barrel roof, pale travertine columns, olive planters",
    "vehicles": [
      "Italian tram with tapered cab",
      "white compact airport minibus",
      "rounded white hatchback taxi"
    ]
  },
  {
    "id": "bcn",
    "name": "Barcelona",
    "group": 2,
    "row": 3,
    "architecture": "Catalan modernista interior, flowing arch shapes, mosaic alcove, curved balcony, sculpted bed",
    "terminal": "triangular glazed terminal, sculptural fan columns, angular green-tinted roof, mosaic seating",
    "vehicles": [
      "low modern tram with smooth segmented nose",
      "red short angular city bus",
      "black-yellow compact people-carrier taxi"
    ]
  },
  {
    "id": "lis",
    "name": "Lisbon",
    "group": 2,
    "row": 4,
    "architecture": "azulejo blue tile, yellow shutter alcove, curved iron balcony, narrow old-town room",
    "terminal": "bright terminal with blue tile mural, red suspension-style beams, angular roof and ceramic wall",
    "vehicles": [
      "classic short yellow wooden tram with overhead pole",
      "small vintage boxy local bus",
      "black-and-green rounded vintage taxi"
    ]
  },
  {
    "id": "lhr",
    "name": "London",
    "group": 2,
    "row": 5,
    "architecture": "Victorian bay-window room, bookshelf wall, brick fireplace, four-poster bed, tartan chair",
    "terminal": "British brick-glass airport hall, exposed industrial arch trusses, clock tower entrance",
    "vehicles": [
      "rounded-front London tube carriage",
      "tall red DOUBLE-DECKER bus with two window rows",
      "unmistakable boxy black London cab with high passenger roof"
    ]
  },
  {
    "id": "ams",
    "name": "Amsterdam",
    "group": 3,
    "row": 0,
    "architecture": "narrow canal house attic, steep timber stair, gable window, sloping roof, brick fireplace",
    "terminal": "Dutch terminal with geometric skylights, broad flat cantilever roof, sculptural stepped-gable entry",
    "vehicles": [
      "blue-white articulated street tram",
      "short low flat-front city bus",
      "long sleek navy electric estate taxi"
    ]
  },
  {
    "id": "cph",
    "name": "Copenhagen",
    "group": 3,
    "row": 1,
    "architecture": "Danish harbour loft, pale oak, pitched roof dormer, built-in daybed, simple paper lamp",
    "terminal": "long Scandinavian wooden barrel ceiling, big harbour-facing glass wall, simple angular entrance",
    "vehicles": [
      "minimal rounded driverless metro",
      "mid-size city coach with tall flat windshield",
      "angular silver electric crossover taxi"
    ]
  },
  {
    "id": "hel",
    "name": "Helsinki",
    "group": 3,
    "row": 2,
    "architecture": "Finnish birch cabin, A-frame wood ceiling, fireplace stove, wool bedding, private sauna nook",
    "terminal": "low Nordic timber terminal with undulating birch ribs, dark granite base, indoor conifers",
    "vehicles": [
      "green Helsinki tram with squared retro cab",
      "short snow-ready coach with enclosed wheel guards",
      "large white winter estate taxi"
    ]
  },
  {
    "id": "zrh",
    "name": "Zurich",
    "group": 3,
    "row": 3,
    "architecture": "Swiss alpine chalet, exposed timber roof, carved wooden bed, lake bay window, stone stove",
    "terminal": "crisp Swiss glass terminal with large folded white roof, clock facade, mountain panorama",
    "vehicles": [
      "classic blue Swiss tram with raised pantograph",
      "tall narrow alpine coach",
      "long silver Swiss luxury estate taxi"
    ]
  },
  {
    "id": "prg",
    "name": "Prague",
    "group": 3,
    "row": 4,
    "architecture": "Bohemian stone room, gothic pointed window, red tile vault, antique wardrobe, curved iron bed",
    "terminal": "Czech terminal with faceted glass roof, pointed-arch walkway, brick-red geometric hall",
    "vehicles": [
      "classic red-cream retro tram with rounded metal face",
      "squat cream intercity coach",
      "boxy yellow Czech sedan taxi"
    ]
  },
  {
    "id": "jfk",
    "name": "New York",
    "group": 3,
    "row": 5,
    "architecture": "brownstone apartment loft, brick wall, fire-escape window, metal-framed bed, loft bookshelves",
    "terminal": "mid-century wing-like airport roof, sweeping concrete shell, angular jet-age concourse",
    "vehicles": [
      "long stainless subway car with corrugated sides",
      "long New York low-floor transit bus",
      "iconic tall yellow NYC taxi SUV"
    ]
  },
  {
    "id": "sfo",
    "name": "San Francisco",
    "group": 4,
    "row": 0,
    "architecture": "Victorian painted-lady room, octagonal bay window, ornate wooden fretwork, brass bed, misty balcony",
    "terminal": "spacious Californian terminal, red suspension-style structural trusses, cable motif ceiling, foggy glass",
    "vehicles": [
      "wooden San Francisco cable car with open running boards",
      "short rounded electric trolley bus with overhead poles",
      "rounded orange retro taxi with protruding fenders"
    ]
  },
  {
    "id": "yvr",
    "name": "Vancouver",
    "group": 4,
    "row": 1,
    "architecture": "Pacific cedar lodge, high asymmetric timber ceiling, large forest window, stone hearth, wooden loft",
    "terminal": "Pacific Northwest terminal with cedar beams, sculptural carved cedar columns, indoor creek, forest glazing",
    "vehicles": [
      "lightweight automated elevated rail with rounded nose",
      "forest-green articulated low-floor coach",
      "white-green compact taxi crossover"
    ]
  },
  {
    "id": "mex",
    "name": "Mexico City",
    "group": 4,
    "row": 2,
    "architecture": "Mexican courtyard casa, colour plaster arch, geometric woven blanket, cactus niches, cantera stone",
    "terminal": "huge terracotta terminal with perforated geometric canopy, cactus court, strong triangular columns",
    "vehicles": [
      "boxy orange metro car with narrow windows",
      "vivid green short bus with blunt face",
      "pink-white classic rounded Volkswagen-style taxi"
    ]
  },
  {
    "id": "lim",
    "name": "Lima",
    "group": 4,
    "row": 3,
    "architecture": "Peruvian colonial room, enclosed carved wooden balcony, adobe wall, Andean woven bedspread",
    "terminal": "wave-roof Pacific terminal, big wooden lattice wall, coastal-mist skylight, stone terrace",
    "vehicles": [
      "modern angular metro with dark sloping nose",
      "Peruvian high-roof compact minibus",
      "small yellow compact coastal taxi"
    ]
  },
  {
    "id": "kef",
    "name": "Reykjavik",
    "group": 4,
    "row": 4,
    "architecture": "Icelandic turf-edge timber cabin, triangular skylight, lava-stone hearth, thick wool bedding",
    "terminal": "low basalt-clad terminal, triangular northern skylight, red corrugated entry roof, snowy glazing",
    "vehicles": [
      "fictional compact snow-ready tourist railcar",
      "rugged elevated airport coach with heavy wheel arches",
      "black four-wheel-drive taxi with tall roof"
    ]
  },
  {
    "id": "stars",
    "name": "Star station fantasy",
    "group": 4,
    "row": 5,
    "architecture": "orbital observatory room, curved star window, floating bunk alcove, circular telescope nook",
    "terminal": "orbital spaceport with crescent docking arm, hexagonal star ceiling, transparent observation bridge",
    "vehicles": [
      "tiny magnetic rail carriage with circular nose",
      "boxy docking shuttle with landing skids",
      "oval floating star taxi pod"
    ]
  },
  {
    "id": "chengdu",
    "name": "Chengdu",
    "group": 5,
    "row": 0,
    "architecture": "Sichuan courtyard room, carved wooden lattice, bamboo roof beams, tea table, grey tiled eaves",
    "terminal": "giant radial sunbird-like terminal roof, tall branching columns, bamboo garden, sweeping golden fan ceiling",
    "vehicles": [
      "modern white-green commuter metro with smooth nose",
      "medium electric coach with curved front",
      "compact rounded panda-themed black-white electric taxi"
    ]
  }
];
const pictures=new Map();
export function cityVisual(id){return CITY_VISUALS.find(city=>city.id===id)||CITY_VISUALS[0];}
export function cityArtSpec(id,kind,slot=0){
 const city=cityVisual(id),letter='abcdef'[city.group],single=city.group===5;
 if(kind==='hotel'||kind==='hotel-night')return {file:`hotels-${letter}-${kind==='hotel-night'?'night':'day'}-v5.png`,cols:single?2:4,rows:single?2:6,col:single?slot%2:slot,row:single?Math.floor(slot/2):city.row};
 if(kind==='airport')return {file:`airports-${letter}-v5.png`,cols:single?1:2,rows:single?1:3,col:single?0:city.row%2,row:single?0:Math.floor(city.row/2)};
 if(kind==='vehicle')return {file:`vehicles-${letter}-v5.png`,cols:single?1:3,rows:single?3:6,col:single?0:slot,row:single?slot:city.row};
 throw new Error('Unknown art kind '+kind);
}
export function cityImage(spec){if(typeof Image==='undefined')return null;if(pictures.has(spec.file)){const image=pictures.get(spec.file);pictures.delete(spec.file);pictures.set(spec.file,image);return image;}if(!pictures.has(spec.file)){const image=new Image();image.src=new URL('./assets/'+spec.file,import.meta.url).href;pictures.set(spec.file,image);if(pictures.size>8)pictures.delete(pictures.keys().next().value);}return pictures.get(spec.file);}
export function cityArtSource(id,kind,slot=0){const spec=cityArtSpec(id,kind,slot),image=cityImage(spec);if(!image?.complete||!image.naturalWidth)return null;const key=spec.col+':'+spec.row,bounds=kind==='vehicle'?VEHICLE_BOUNDS[spec.file]?.[key]:kind==='airport'?AIRPORT_BOUNDS[spec.file]?.[key]:ROOM_BOUNDS[spec.file]?.[key];if(bounds)return {image,x:bounds[0],y:bounds[1],width:bounds[2],height:bounds[3],spec};const width=image.naturalWidth/spec.cols,height=image.naturalHeight/spec.rows;return {image,x:spec.col*width+2,y:spec.row*height+2,width:width-4,height:height-4,spec};}
export function drawCityPanel(c,id,kind,slot=0,box=[0,0,360,240]){const source=cityArtSource(id,kind,slot);if(!source)return false;
 if(kind==='airport'&&source.width/source.height>1.8){const height=box[2]*source.height/source.width;c.drawImage(source.image,source.x,source.y,source.width,source.height,box[0],box[1],box[2],height);const floor=airportFloorColor(source);c.fillStyle=floor;c.fillRect(box[0],box[1]+height-1,box[2],box[3]-height+1);c.fillStyle='#fff6e818';for(let row=0;row<3;row++)c.fillRect(box[0],Math.round(box[1]+height+(box[3]-height)*(row+1)/4),box[2],1);}else c.drawImage(source.image,source.x,source.y,source.width,source.height,...box);return true;}
export function cityArtReady(ids,kinds=['hotel','hotel-night','airport']){const files=new Map();for(const id of ids)for(const kind of kinds){const spec=cityArtSpec(id,kind);files.set(spec.file,spec);}return Promise.all([...files.values()].map(spec=>imageReady(cityImage(spec))));}
export function vehicleSlot(id){return id==='taxi'?2:['train','subway'].includes(id)?0:1;}
// Arrival-road silhouettes do not apply filters/recolouring; they are separate original pixels.
export function drawCityVehicle(c,route,id,night=false){if(['subway','limousine','train'].includes(id))return drawTransportSprite(c,route,id,night)||drawVehicleModel(c,route,id,night,[0,id==='limousine'?70:80,360,150]);const source=cityArtSource(route,'vehicle',vehicleSlot(id));if(!source)return false;

 const scale=Math.min((id==='taxi'?156:226)/source.width,129/source.height),width=source.width*scale,height=source.height*scale;c.save();if(night)c.filter='brightness(.78)';c.drawImage(source.image,source.x,source.y,source.width,source.height,180-width/2,218-height,width,height);c.restore();return true;}

// Sample only the central clear floor; stretching a full-width strip stretched foreground plants.
const airportFloors=new Map();
function airportFloorColor(source){if(typeof document==='undefined')return '#cfc6b7';const key=source.spec.file+':'+source.spec.col+':'+source.spec.row;if(airportFloors.has(key))return airportFloors.get(key);const sample=document.createElement('canvas');sample.width=16;sample.height=2;const sc=sample.getContext('2d');sc.drawImage(source.image,source.x+source.width*.44,source.y+source.height-5,source.width*.12,3,0,0,16,2);const data=sc.getImageData(0,0,16,2).data,channels=[0,0,0];for(let i=0;i<data.length;i+=4)for(let n=0;n<3;n++)channels[n]+=data[i+n];const color='rgb('+channels.map(v=>Math.round(v/32)).join(',')+')';airportFloors.set(key,color);return color;}
