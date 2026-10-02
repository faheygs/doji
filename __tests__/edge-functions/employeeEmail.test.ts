import { renderEmployeeVerificationEmail, sendEmployeeVerification } from '../../supabase/functions/_shared/employee-email';
const env = { supabaseUrl: 'https://auth.example.test', origin: 'https://admin.example.test', serviceKey: 'sb_secret_test', resendKey: 'test-resend', fromEmail: 'Doji <work@example.test>' };
const employee = { id: 'employee', email: 'work@example.test', role: 'doji_employee', app_metadata: { account_type: 'employee' } };
const generated = { ...employee, verification_type: 'signup', hashed_token: 'SECRET', action_link: `https://auth.example.test/auth/v1/verify?type=signup&token=SECRET&redirect_to=${encodeURIComponent(`${env.origin}/`)}` };
test('designed email includes HTML, plaintext, next steps and escaped identity', () => {
  const mail = renderEmployeeVerificationEmail('<work>@example.test', generated.action_link, env.origin);
  expect(mail.html).toContain('Good work starts here.');
  expect(mail.html).toContain('&lt;work&gt;');
  expect(mail.html).not.toContain('<work>');
  expect(mail.text).toContain('Verify my work email');
  expect(mail.text).toContain('/employee-setup/');
  expect(mail.html).toContain('@media');
});
test.each([
  { ...employee, role: 'authenticated' }, { ...employee, app_metadata: {} },
  { ...employee, email_confirmed_at: '2026-01-01' }, { ...employee, email: 'someone@example.test' },
])('never generates mail for a member, confirmed or mismatched identity', async user => {
  const upstream = jest.fn().mockResolvedValue(Response.json({ users: [user] }));
  expect(await sendEmployeeVerification(employee.email, env, upstream)).toBe(false);
  expect(upstream).toHaveBeenCalledTimes(1);
});
test('sends with a token-derived idempotency key, without changing credentials or global templates', async () => {
  const upstream = jest.fn().mockResolvedValueOnce(Response.json({ users: [employee] }))
    .mockResolvedValueOnce(Response.json(generated)).mockResolvedValueOnce(Response.json({ id: 'email' }));
  expect(await sendEmployeeVerification(employee.email, env, upstream)).toBe(true);
  expect(JSON.parse(upstream.mock.calls[1][1].body)).toEqual({type:'signup',email:employee.email,redirect_to:`${env.origin}/`});
  const delivery = upstream.mock.calls[2];
  expect(delivery[0]).toBe('https://api.resend.com/emails');
  expect(delivery[1].headers['idempotency-key']).toMatch(/^employee-verification\/[a-f0-9]{64}$/);
  expect(JSON.parse(delivery[1].body).to).toEqual([employee.email]);
});
test.each([{...generated,id:'changed'}, {...generated,action_link:'https://attacker.test/'}, {...generated,role:'authenticated'}])('fails closed on changed identity or invalid generated link',async link=>{
  const upstream=jest.fn().mockResolvedValueOnce(Response.json({users:[employee]})).mockResolvedValueOnce(Response.json(link));
  expect(await sendEmployeeVerification(employee.email,env,upstream)).toBe(false);
  expect(upstream).toHaveBeenCalledTimes(2);
});
