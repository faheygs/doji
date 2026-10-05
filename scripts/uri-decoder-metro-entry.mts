// Local qualification entry, never included in the application archive.
const query:typeof import('query-string') = require('query-string');
const decode:(input:string)=>string = require('decode-uri-component');
const { getStateFromPath }:typeof import('expo-router/build/react-navigation/core/getStateFromPath.js') = require('expo-router/build/react-navigation/core/getStateFromPath');
function equal(actual:unknown, expected:unknown) {
  if (actual !== expected) throw new Error('URI Metro regression mismatch');
}
equal(decode('a+b%2B%252B'), 'a b+%2B');
equal(decode('%C3%A5%ab'), 'å%ab');
const repeated=query.parse('x=%F0%9F%98%80&x=%2B').x;
if(!Array.isArray(repeated))throw Error('Repeated parser values missing');
equal(repeated.join('|'), '😀|+');
const state = getStateFromPath('/shop?label=hello+world&plus=%2B&bad=%C3%A5%ab', { screens: { Shop: 'shop' } });
const route=state?.routes[0];
if(!route?.params)throw Error('Router parameters missing');
const params=route.params as Record<string,unknown>;
equal(route.name, 'Shop');
equal(params.label, 'hello world');
equal(params.plus, '+');
equal(params.bad, 'å%ab');
for (const token of ['%ab', '%E0%80%80', '%84%D7%25%88%90', '%F0%9F%98']) {
  equal(typeof query.parse('value=' + token.repeat(4096)).value, 'string');
}
Object.assign(globalThis,{__URI_SECURITY_RESULT__: { assertions: 11, passed: true }});
