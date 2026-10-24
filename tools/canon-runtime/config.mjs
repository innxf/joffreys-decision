import {fileURLToPath} from 'node:url';
export const model = Object.freeze({id:'Xenova/multilingual-e5-small',revision:'761b726dd34fb83930e26aab4e9ac3899aa1fa78',dtype:'q8',dimension:384,pooling:'mean',normalize:true,maxTokens:512,queryPrefix:'query: ',passagePrefix:'passage: ',runtime:'4.3.1'});
export const root = new URL('../canon-data/', import.meta.url);
export const modelPath = fileURLToPath(new URL('model/',root));
export const fingerprint=JSON.stringify(model);
