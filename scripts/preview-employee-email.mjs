import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:900,height:1200}});
  await page.setContent(await readFile('test-results/employee-email-preview/verification.html','utf8'));
  await page.screenshot({path:'test-results/employee-email-preview/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/employee-email-preview/mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Email overflows mobile viewport');
  console.log('Employee HTML email rendered at desktop and mobile widths without horizontal overflow.');
} finally {await browser.close();}
