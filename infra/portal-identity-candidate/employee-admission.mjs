import { createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';
export function createEmployeeAdmission(config, execute, clientIp) {
  if (
    config.realm !== 'employee' ||
    !/^[a-f0-9]{64}$/.test(config.admissionKey || '') ||
    !isIP(clientIp)
  )
    throw Error('Employee admission unavailable');
  const scope = createHash('sha256').update(`${config.origin}|${config.clientId}`).digest('hex');
  const key = Buffer.from(config.admissionKey, 'hex');
  const hashed = (purpose, value) =>
    createHmac('sha256', key).update(`${purpose}|${value}`).digest('hex');
  return async ({ email, signal }) => {
    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    )
      return false;
    return (
      (await execute(
        'doji_employee_session',
        'select employee_session_private.admit_login_v1($1,$2,$3) as result',
        [scope, hashed('email', email.trim().toLowerCase()), hashed('ip', clientIp)],
        signal,
      )) === true
    );
  };
}
