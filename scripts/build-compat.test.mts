import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {assertCompatCurrent,compileCompat,verifyCompat,compatSource} from './build-compat.mts';
import {readFileSync} from 'node:fs';
test('only exact checked-source output qualifies as generated compatibility code',()=>{
  const source=readFileSync(compatSource,'utf8'),artifact=compileCompat(source);
  assertCompatCurrent(source,artifact);
  assert.throws(()=>assertCompatCurrent(source,artifact+'\n'),/artifact drift/);
  assert.throws(()=>assertCompatCurrent(source+'\nconsole.log("drift")',artifact),/artifact drift/);
  assert.equal(verifyCompat(),'vendor/decode-uri-component-compat/index.cjs');
});
test('emitted adapter retains the callable CommonJS export and literal-plus handling',()=>{
  const values:unknown[]=[];
  const initialExports={};
  const context={exports:initialExports,module:{exports:initialExports as unknown},require:(name:string)=>{
    assert.equal(name,'decode-uri-component-upstream');return {default:(value:unknown)=>{values.push(value);return value;}};
  }};
  runInNewContext(compileCompat(readFileSync(compatSource,'utf8')),context);
  assert.equal(typeof context.module.exports,'function');
  if(typeof context.module.exports!=='function')throw Error('Missing decoder');
  assert.equal(Reflect.apply(context.module.exports,undefined,['a+b%2B']),'a b%2B');
  assert.equal(Reflect.apply(context.module.exports,undefined,[null]),null);
  assert.deepEqual(values,['a b%2B',null]);
});
