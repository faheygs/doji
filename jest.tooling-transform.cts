// Expo's React Native Babel preset treats .cts as Flow. These CommonJS tooling
// modules contain erasable TypeScript only; preserve positions and CommonJS
// semantics without changing the mobile/Metro Babel pipeline.
import type {SyncTransformer} from '@jest/transform';
const {stripTypeScriptTypes}:typeof import('node:module') = require('node:module');
const toolingTransformer:SyncTransformer = {
  process(source,filename){
    return {code:stripTypeScriptTypes(source,{mode:'strip',sourceUrl:filename})};
  },
};
module.exports=toolingTransformer;
