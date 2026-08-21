export type LegalSection = {
  title: string;
  body: string;
};

export const LEGAL_EFFECTIVE_DATE = 'August 20, 2026';
export const SUPPORT_EMAIL = 'support@dojipro.com';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: '1. Acceptance of Terms',
    body: 'By creating an account or using Doji, you agree to these Terms of Use. Our Privacy Policy is a separate agreement that explains how we handle personal information. If you do not agree, do not create an account or use Doji.',
  },
  {
    title: '2. Eligibility and Accounts',
    body: 'You must be at least 13 years old and legally able to agree to these terms. During account setup, Doji uses and retains the birth date you enter in a private age-assurance record to document the information you provided and the resulting eligibility decision. Your birth date is not displayed on your profile or shared with other users. You are responsible for your account, the accuracy of the information you provide, and activity performed through your account.',
  },
  {
    title: '3. Daily Challenges',
    body: 'A Doji is available only during the participation window shown in the app. Challenge eligibility and timing are determined by Doji systems, not your device clock. Completing a challenge may unlock social content, streak progress, experience points, Sparks, badges, or other in-app rewards. We may correct errors that affect challenge state, scoring, or rewards.',
  },
  {
    title: '4. User-Generated Content',
    body: 'You are responsible for content you submit, including photos, videos, captions, poll responses, comments, profile information, and challenge suggestions. You must have the right to share it. Do not post illegal, hateful, obscene, sexually explicit, graphic, harassing, threatening, deceptive, infringing, spam, or otherwise objectionable content.',
  },
  {
    title: '5. Reporting, Blocking, and Moderation',
    body: 'You can report objectionable content and block abusive users from the relevant post, comment, or profile controls. Reporting sends the relevant content and reason to Doji for moderation. Blocking immediately removes that account and its content from your experience. We review reports and act on objectionable content within 24 hours, including removing content and suspending or permanently ejecting users when appropriate.',
  },
  {
    title: '6. Prohibited Conduct',
    body: 'You may not impersonate others; manipulate participation, rankings, rewards, or reactions; harass users; evade blocks or enforcement; scrape private information; disrupt the service; upload malicious code; or use Doji for unlawful activity.',
  },
  {
    title: '7. Your Content License',
    body: 'You retain ownership of your content. You grant Doji a limited, worldwide license to host, process, display, and transmit that content only as needed to operate, secure, moderate, and improve the service. This license ends when the content is deleted, subject to reasonable backup, legal, and safety retention.',
  },
  {
    title: '8. Account Suspension and Deletion',
    body: 'You may permanently delete your account from Settings. We may remove content, limit features, suspend an account, or terminate access for serious or repeated violations, safety risks, fraud, or misuse. Provisions that should reasonably survive account deletion continue to apply.',
  },
  {
    title: '9. Availability and Disclaimers',
    body: 'Doji is provided "as is" to the fullest extent permitted by law. We work to keep the service reliable but do not guarantee uninterrupted availability, push-notification delivery, a particular ranking or reward, or that all user content will be free from objectionable material.',
  },
  {
    title: '10. Changes to These Terms',
    body: 'We may update these terms as Doji changes. We will revise the effective date and provide additional notice when required. If renewed consent is required, Doji will ask you to accept the new version before continued account use.',
  },
  {
    title: '11. Contact',
    body: `Questions about these terms may be sent to ${SUPPORT_EMAIL}.`,
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: '1. Information We Collect',
    body: 'We collect account information such as your email address, username, optional display name, profile photo, and bio; the birth date you self-declare during signup and the resulting age-assurance record confirming whether you meet the 13+ requirement; content and interactions you choose to share; friendships, challenge participation, rewards, badges, and shop activity; device push tokens; and limited device, network, security, and diagnostic information needed to operate Doji. Your birth date is private and is not displayed on your profile or shared with other users.',
  },
  {
    title: '2. How We Use Information',
    body: 'We use information to authenticate your account, verify and document age eligibility, deliver daily challenges and notifications, show authorized social content, calculate streaks and rewards, synchronize realtime activity, personalize appearance, prevent abuse, moderate reported content, troubleshoot reliability, provide support, and improve Doji.',
  },
  {
    title: '3. Content and Social Visibility',
    body: 'Content you submit may be visible to friends or the wider Doji community according to the audience shown in the app. Your username, optional display name, avatar, equipped frame and title, public activity statistics, and earned badges may be visible to other users. Shared poll totals may be community-wide while social alerts remain limited to applicable friends.',
  },
  {
    title: '4. Service Providers',
    body: 'We use service providers to run Doji, including Supabase for authentication, database, storage, and server functions; Cloudflare for durable orchestration and event delivery; Ably for realtime messaging; Expo for mobile builds and push delivery; Sentry for production error diagnostics; and the provider that hosts dojipro.com. These providers process information only to provide their services to us and under their own privacy and security commitments.',
  },
  {
    title: '5. Notifications',
    body: 'If you allow notifications, Doji stores a device push token and uses it for the categories you enable. Push providers and operating systems cannot guarantee display. You can change notification categories in Doji and system-level permission in your device settings.',
  },
  {
    title: '6. Safety and Moderation',
    body: 'Reports may include the relevant account, content, reason, and timestamps so we can investigate abuse, enforce our rules, and protect users. Blocks record the accounts involved so Doji can enforce the user\'s privacy choice. We may preserve limited safety records when reasonably necessary to prevent repeated abuse or comply with law.',
  },
  {
    title: '7. Retention and Account Deletion',
    body: 'We retain account information, including the private self-declared birth date and age-assurance record, while your account is active and other information only as reasonably necessary to provide and secure the service, meet legal obligations, resolve disputes, and prevent abuse. You can permanently delete your account from Settings. Deletion removes or de-identifies account data subject to reasonable backup, legal, fraud-prevention, and safety retention.',
  },
  {
    title: '8. Your Choices',
    body: 'You can edit profile information, manage notification preferences, remove friends, block users, report content, and delete your account. You may contact us to request access, correction, or deletion assistance.',
  },
  {
    title: '9. Security',
    body: 'We use technical and organizational safeguards designed to protect information, including authenticated access, database authorization policies, scoped storage, encrypted network transport, and limited service credentials. No online service can guarantee absolute security.',
  },
  {
    title: '10. Children',
    body: 'Doji is not directed to children under 13, and we do not knowingly collect personal information from children under 13. Contact us if you believe a child has provided information in violation of this policy.',
  },
  {
    title: '11. Changes and Contact',
    body: `We may update this policy as Doji changes. We will revise the effective date and provide additional notice when required. Privacy questions or requests may be sent to ${SUPPORT_EMAIL}.`,
  },
];
