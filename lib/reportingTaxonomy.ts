export type ReportTargetKind = 'post' | 'comment' | 'poll_response' | 'profile_photo' | 'account';

export type ReportReason =
  | 'bullying_harassment'
  | 'self_harm'
  | 'violence_hate_exploitation'
  | 'restricted_goods'
  | 'sexual_content'
  | 'spam_scam'
  | 'intellectual_property'
  | 'privacy'
  | 'impersonation'
  | 'other';

export type ReportReasonDetail =
  | 'bullying'
  | 'unwanted_contact'
  | 'sexual_harassment'
  | 'threatening_private_content'
  | 'suicide_self_harm'
  | 'eating_disorder'
  | 'credible_threat'
  | 'graphic_violence'
  | 'hate_speech'
  | 'human_exploitation'
  | 'animal_abuse'
  | 'drugs'
  | 'weapons'
  | 'animals'
  | 'gambling'
  | 'alcohol_tobacco'
  | 'nonconsensual_intimate_images'
  | 'sexual_solicitation'
  | 'sexual_exploitation'
  | 'child_sexual_content'
  | 'adult_nudity_or_sexual_activity'
  | 'spam'
  | 'scam_fraud'
  | 'deceptive_business'
  | 'copyright'
  | 'trademark'
  | 'counterfeit_goods'
  | 'personal_information'
  | 'doxxing'
  | 'image_used_without_permission'
  | 'impersonating_me'
  | 'impersonating_someone_else'
  | 'impersonating_business'
  | 'other';

type TaxonomyOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  targets?: readonly ReportTargetKind[];
};

export const REPORT_REASON_OPTIONS: readonly TaxonomyOption<ReportReason>[] = [
  { value: 'bullying_harassment', label: 'Bullying or unwanted contact' },
  { value: 'self_harm', label: 'Suicide, self-harm or eating disorders' },
  { value: 'violence_hate_exploitation', label: 'Violence, hate or exploitation' },
  {
    value: 'restricted_goods',
    label: 'Selling or promoting restricted items',
    targets: ['post', 'comment', 'poll_response', 'account'],
  },
  { value: 'sexual_content', label: 'Nudity or sexual activity' },
  { value: 'spam_scam', label: 'Scam, fraud or spam' },
  {
    value: 'intellectual_property',
    label: 'Intellectual property',
    targets: ['post', 'comment', 'poll_response', 'profile_photo'],
  },
  { value: 'privacy', label: 'Privacy or personal information' },
  { value: 'impersonation', label: 'Impersonation', targets: ['account'] },
  { value: 'other', label: 'Something else' },
] as const;

export const REPORT_REASON_DETAILS: Readonly<
  Record<ReportReason, readonly TaxonomyOption<ReportReasonDetail>[]>
> = {
  bullying_harassment: [
    { value: 'bullying', label: 'Bullying or harassment' },
    { value: 'unwanted_contact', label: 'Repeated unwanted contact' },
    { value: 'sexual_harassment', label: 'Sexual harassment' },
    { value: 'threatening_private_content', label: 'Threatening to share private content' },
  ],
  self_harm: [
    { value: 'suicide_self_harm', label: 'Suicide or self-harm' },
    { value: 'eating_disorder', label: 'Eating disorder content' },
  ],
  violence_hate_exploitation: [
    { value: 'credible_threat', label: 'A credible threat or immediate danger' },
    { value: 'graphic_violence', label: 'Graphic or glorified violence' },
    { value: 'hate_speech', label: 'Hate speech or symbols' },
    { value: 'human_exploitation', label: 'Human exploitation or trafficking' },
    { value: 'animal_abuse', label: 'Animal abuse' },
  ],
  restricted_goods: [
    { value: 'drugs', label: 'Drugs' },
    { value: 'weapons', label: 'Weapons' },
    { value: 'animals', label: 'Animals' },
    { value: 'gambling', label: 'Gambling' },
    { value: 'alcohol_tobacco', label: 'Alcohol or tobacco' },
  ],
  sexual_content: [
    {
      value: 'nonconsensual_intimate_images',
      label: 'Threatening to share or sharing intimate images',
    },
    { value: 'sexual_solicitation', label: 'Sexual solicitation or prostitution' },
    { value: 'sexual_exploitation', label: 'Sexual exploitation' },
    { value: 'child_sexual_content', label: 'Sexual content involving a child' },
    { value: 'adult_nudity_or_sexual_activity', label: 'Adult nudity or sexual activity' },
  ],
  spam_scam: [
    { value: 'spam', label: 'Spam' },
    { value: 'scam_fraud', label: 'Scam or fraud' },
    { value: 'deceptive_business', label: 'Deceptive business or promotion' },
  ],
  intellectual_property: [
    { value: 'copyright', label: 'Copyright infringement' },
    { value: 'trademark', label: 'Trademark infringement' },
    { value: 'counterfeit_goods', label: 'Counterfeit goods' },
  ],
  privacy: [
    { value: 'personal_information', label: 'Personal information' },
    { value: 'doxxing', label: 'Doxxing or exposing someone’s location' },
    { value: 'image_used_without_permission', label: 'An image used without permission' },
  ],
  impersonation: [
    { value: 'impersonating_me', label: 'They’re pretending to be me' },
    { value: 'impersonating_someone_else', label: 'They’re pretending to be someone else' },
    { value: 'impersonating_business', label: 'They’re pretending to be a business' },
  ],
  other: [{ value: 'other', label: 'Something else' }],
};

export function reportReasonsFor(target: ReportTargetKind) {
  return REPORT_REASON_OPTIONS.filter(
    (option) => !option.targets || option.targets.includes(target),
  );
}

export function reportDetailsFor(reason: ReportReason, target: ReportTargetKind) {
  return REPORT_REASON_DETAILS[reason].filter(
    (option) => !option.targets || option.targets.includes(target),
  );
}

export function reportTargetLabel(target: ReportTargetKind) {
  if (target === 'profile_photo') return 'profile photo';
  if (target === 'poll_response') return 'answer';
  return target;
}

export function isRestrictedSafetyDetail(detail: ReportReasonDetail) {
  return [
    'credible_threat',
    'human_exploitation',
    'nonconsensual_intimate_images',
    'sexual_exploitation',
    'child_sexual_content',
  ].includes(detail);
}
