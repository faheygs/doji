import assert from 'node:assert/strict';
import type {Page} from '@playwright/test';
export function must<T>(value:T|null|undefined):T {
  assert.ok(value !== null && value !== undefined, 'Expected test fixture value to exist');
  return value;
}
export function fixtureRecord(value:unknown):Record<string,unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected fixture object');
  return value as Record<string,unknown>;
}
export type MockRequest = {method:string;path:string;body:string|null};
export type MockCommand = Record<string,unknown>;
export type InvalidationCallback = (event:{name:string;data:Record<string,unknown>})=>void;
export async function installInvalidationStub(page:Page, hook:'testInvalidate'|'safetyInvalidate'|'auditInvalidate') {
  await page.addInitScript(key=>{
    const sdk={Realtime:class {
      connection={on(){}};
      channels={get:()=>({subscribe(callback:InvalidationCallback){window[key]=callback;},unsubscribe(){}})};
      connect(){} close(){}
    }};
    Object.defineProperty(window,'Ably',{value:sdk,writable:true,configurable:true});
  },hook);
}
declare global {
  interface Window {
    restoreSyntheticStorage:()=>void;
    fixtureCaptcha:Record<string,{callback(token:string):void;'expired-callback'():void;'error-callback'():void}>;
    fixtureReceiptBlobs:Blob[];
    fixtureRevoked:string[];
    copiedReferences:string[];
    testInvalidate:InvalidationCallback;
    safetyInvalidate:InvalidationCallback;
    auditInvalidate:InvalidationCallback;
  }
}
