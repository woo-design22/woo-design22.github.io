const requests=new WeakMap();
// Share both download and decode; changing screens must not decode the same atlas twice.
export function imageReady(image){if(!image)return Promise.resolve(false);if(requests.has(image))return requests.get(image);const task=(async()=>{if(!image.complete)await new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});if(!image.naturalWidth)return false;try{await image.decode?.();return true;}catch{return false;}})();requests.set(image,task);return task;}
