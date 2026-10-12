import { isRecord } from './business-contracts.mts';
export const businessSetupSql =
  'select portal_identity_private.business_setup_v1($1,$2,$3,$4,$5,$6,$7::bigint,$8::jsonb,$9::uuid) as result';
export interface BrandDetails {
  description: string;
  website: string;
  primary_color: string;
  secondary_color: string;
  logo: string;
}
export interface BusinessSetupProfile {
  organization_id: string;
  application_id: string;
  brand_name: string;
  role: 'owner';
  revision: number;
  details: BrandDetails;
  setup_complete: boolean;
  campaigns_enabled: false;
  billing_enabled: false;
}
export interface BusinessSetupCommand {
  action: 'save' | 'complete';
  revision: number;
  details: BrandDetails | null;
  requestId: string;
}
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function isBrandDetails(value: unknown): value is BrandDetails {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 5 ||
    !['description', 'website', 'primary_color', 'secondary_color', 'logo'].every(
      (key) => typeof value[key] === 'string',
    )
  )
    return false;
  const p = value as unknown as BrandDetails;
  return (
    p.description.length <= 300 &&
    !/[\u0000-\u001f\u007f]/.test(p.description) &&
    p.website.length <= 500 &&
    /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?(\/[^\s<>]*)?$/.test(p.website) &&
    /^#[a-f0-9]{6}$/i.test(p.primary_color) &&
    /^#[a-f0-9]{6}$/i.test(p.secondary_color) &&
    (p.logo === '' ||
      (p.logo.length <= 32800 &&
        /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(p.logo)))
  );
}
export function setupProfile(value: unknown): BusinessSetupProfile {
  if (!isRecord(value) || !isRecord(value.profile))
    throw Error('Business setup could not be verified.');
  const p = value.profile;
  if (
    typeof p.organization_id !== 'string' ||
    !uuid.test(p.organization_id) ||
    typeof p.application_id !== 'string' ||
    !uuid.test(p.application_id) ||
    typeof p.brand_name !== 'string' ||
    p.brand_name.length > 200 ||
    p.role !== 'owner' ||
    typeof p.revision !== 'number' ||
    !Number.isSafeInteger(p.revision) ||
    p.revision < 0 ||
    typeof p.setup_complete !== 'boolean' ||
    p.campaigns_enabled !== false ||
    p.billing_enabled !== false ||
    !isBrandDetails(p.details)
  )
    throw Error('Business setup could not be verified.');
  return {
    organization_id: p.organization_id,
    application_id: p.application_id,
    brand_name: p.brand_name,
    role: p.role,
    revision: p.revision,
    details: { ...p.details },
    setup_complete: p.setup_complete,
    campaigns_enabled: false,
    billing_enabled: false,
  };
}
export function isSetupCommand(value: unknown): value is BusinessSetupCommand {
  return (
    isRecord(value) &&
    Object.keys(value).length === 4 &&
    typeof value.requestId === 'string' &&
    uuid.test(value.requestId) &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    ((value.action === 'save' && isBrandDetails(value.details)) ||
      (value.action === 'complete' && value.details === null))
  );
}
