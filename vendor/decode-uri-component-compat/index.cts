'use strict';

// query-string 7 expects a CommonJS function; upstream 0.5 is ESM-only.
const decode: (input:string)=>string = require('decode-uri-component-upstream').default;

module.exports = function decodeUriComponent(input:string):string {
  // Preserve 0.2.x's literal-plus behavior, without double-decoding encoded plus.
  return decode(typeof input === 'string' ? input.replace(/\+/g, ' ') : input);
};
