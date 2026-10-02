import {expect,test} from '../../coverage-fixture.mjs';
import {installMockBackend,operatorSession} from './fixtures.mjs';
function session(aal){
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 return {access_token:`${encode({alg:'none'})}.${encode({role:'doji_employee',aal,exp:Math.floor(Date.now()/1000)+3600})}.fixture`,refresh_token:'employee-fixture',expires_in:3600,
  user:{id:operatorSession.user_id,role:'doji_employee',app_metadata:{account_type:'employee'},factors:[{id:'existing-work-factor',factor_type:'totp',status:'verified'}]}};
}
async function setup(page,status='active'){
 const requests=await installMockBackend(page);
 await page.route('**/admin-app-*.js',async route=>{const response=await route.fetch();let body=await response.text();body=body.replace('"employeeAccountsEnabled": false','"employeeAccountsEnabled": true');await route.fulfill({response,body});});
 await page.route('**/functions/v1/employee-signin',route=>route.fulfill({json:session('aal1')}));
 await page.route('**/rest/v1/rpc/get_employee_registration_status_v1',route=>route.fulfill({json:{status}}));
 await page.route('**/auth/v1/factors/existing-work-factor/verify',route=>route.fulfill({json:session('aal2')}));
 return requests;
}
test('approved employee uses existing MFA, enters workspace, and locks only the portal session',async({page})=>{
 const requests=await setup(page);
 await page.goto('/');
 await page.getByLabel('Operator email').fill('employee@example.test');
 await page.getByLabel('Password',{exact:true}).fill('synthetic-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('#adminMfaChallengeForm')).toBeVisible();
 await expect(page.locator('#adminMfaSetup')).toBeHidden();
 expect(requests.some(r=>r.path.includes('/portal/admin/'))).toBe(false);
 await page.locator('#adminChallengeCode').fill('123456');
 await page.locator('#adminMfaChallengeForm button[type="submit"]').click();
 await expect(page.locator('#portalApp')).toBeVisible();
 await page.getByRole('button',{name:'Lock session'}).click();
 await expect(page.locator('#portalApp')).toBeHidden();
 expect(requests.some(r=>r.path.includes('/logout?scope=local'))).toBe(true);
 expect(requests.some(r=>r.method==='POST'&&r.path.endsWith('/factors'))).toBe(false);
});
test('pending employee is stopped before MFA and protected reads',async({page})=>{
 const requests=await setup(page,'pending');await page.goto('/');
 await page.getByLabel('Operator email').fill('pending@example.test');
 await page.getByLabel('Password',{exact:true}).fill('synthetic-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('#adminSigninStatus')).toContainText('awaiting administrator approval');
 expect(requests.some(r=>r.path.includes('/portal/admin/')||r.path.includes('/factors'))).toBe(false);
});
