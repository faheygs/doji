// Same structured application fields for applicant editing and staff review.
// Display text is escaped; submitted websites are text, never fetched/embedded.
const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => entities[c] ?? c);
export const applicationFields = [
  ['legal_name', 'Legal business name'],
  ['brand_name', 'Public brand name'],
  ['website', 'Business website'],
  ['country', 'Country code'],
  ['business_address', 'Business address'],
  ['representative_name', 'Your name'],
  ['representative_role', 'Your role'],
  ['category', 'Industry'],
  ['purpose', 'What would you like to do with Doji?'],
] as const;
export type ApplicationField = (typeof applicationFields)[number][0];
export type ApplicationDetails = Partial<Record<ApplicationField, string>>;
export function applicationForm(
  details: ApplicationDetails = {},
  readOnly = false,
  prefix = 'application',
) {
  return `<div class="formGrid">${applicationFields
    .filter(([key]) => key !== 'business_address' || (readOnly && details[key]))
    .map(([key, label]) => {
      const id = `${prefix}-${key}`,
        value = escape(details[key]),
        locked = readOnly ? ' readonly' : ' required';
      let control;
      if (key === 'country' && !readOnly)
        control = `<select id="${id}" name="${key}" required><option value="US" selected>United States</option></select>`;
      else if (key === 'category' && !readOnly)
        control = `<select id="${id}" name="${key}" required><option value="">Choose an industry</option>${['Consumer goods', 'Sports and wellness', 'Food and beverage', 'Entertainment', 'Travel and outdoors', 'Local business', 'Technology', 'Other'].map((option) => `<option${option === details[key] ? ' selected' : ''}>${option}</option>`).join('')}</select>`;
      else if (['purpose', 'business_address'].includes(key))
        control = `<textarea id="${id}" name="${key}" maxlength="1000" rows="3"${locked}>${value}</textarea>`;
      else
        control = `<input id="${id}" name="${key}" type="${key === 'website' && !readOnly ? 'url' : 'text'}" maxlength="${key === 'country' ? '2' : '1000'}"${key === 'country' && !readOnly ? ' pattern="[A-Z]{2}" placeholder="US"' : key === 'website' && !readOnly ? ' pattern="https://.*" placeholder="https://example.com"' : ''} value="${value}"${locked}>`;
      return `<div class="field${['purpose', 'business_address'].includes(key) ? ' full' : ''}"><label for="${id}">${escape(key === 'country' ? 'Country' : label)}</label>${control}${key === 'country' && !readOnly ? '<small>Business onboarding is currently available in the United States.</small>' : ''}</div>`;
    })
    .join('')}</div>`;
}
const stateLabels: Readonly<Record<string, string>> = {
  draft: 'Draft',
  pending: 'Pending review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  declined: 'Declined',
};
export const businessStateLabel = (state: string) => stateLabels[state] || 'New application';
