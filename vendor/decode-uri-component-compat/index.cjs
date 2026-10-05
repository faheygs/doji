// Generated from vendor/decode-uri-component-compat/index.cts by scripts/build-compat.mts. Do not edit.
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// query-string 7 expects a CommonJS function; upstream 0.5 is ESM-only.
const decode = require('decode-uri-component-upstream').default;
module.exports = function decodeUriComponent(input) {
    // Preserve 0.2.x's literal-plus behavior, without double-decoding encoded plus.
    return decode(typeof input === 'string' ? input.replace(/\+/g, ' ') : input);
};
