# Original community submission review — 2026-09-27

## Follow-up: structured review form

The owner rejected the prose/card presentation. The replacement uses the existing
portal form primitives and labelled readonly controls: Type, Question/Photo prompt,
individual ordered Choice fields, and Response format. Format questions have an
Answer format plus separate Word count or Starting letter. Detail and confirmation
share the identical renderer and original values. Only the decision rationale is
editable. No new form submission, read, command, authorization or member behavior.

117 browser tests passed against `test-results/idea-form-release-20260927/site`,
including all five kinds, both format rules, readonly/Enter protection, long literal
text, ordered choices, exact-ID binding and detail/confirmation equality. Desktop
and phone screenshots in both themes passed accessibility/layout checks; desktop
dark and phone light screenshots were visually inspected before release.

The candidate starts from the verified previous live artifact below and changes
only the editorial module, four scoped CSS rules and the two HTML asset references.
Bundle: `admin-app-20260927ideas3.js`. The first deployment process was denied by
the local sandbox before spawning (pid 0); its marker is preserved as
`spawn-denied-before-upload.json`. A permission-approved retry rechecks the exact
prior deployment/assets and unchanged shared infrastructure before uploading.

Rollback for this form release is the prior static Pages deployment
`03fa0921-aa31-46f8-8c2e-615334d7a7f6`; no database or Worker rollback is needed.
No announcement or real moderation/editorial decision is submitted for testing.
No paid resource or service is added.

Released as Pages `ea70496a-c660-40f2-87d5-da3feaa7d27c`. All 22 public asset hashes
and security headers matched the tested artifact; Worker deployment/settings/
bindings/schedules were unchanged. Signed-in read-only browser inspection verified
the exact reported record: Type = Format question, Answer format = Exact word count,
Question = the original submitted body, Word count = 2. The employee session restored
successfully. The computer-use skill was used only to navigate and inspect; no
decision or rationale was submitted. Evidence is in the form release's `verified.json`.

## Diagnosis

The portal printed serialized `options.answer_rule` for format questions and raw
options JSON again in confirmations. The same valid submission therefore appeared
in different representations during review. List labels also exposed internal enum
spelling instead of the labels in Suggest a Doji.

A bounded read-only production comparison verified submission
`422df527-1ab4-4a8b-9df4-bc46ac3ef068` against its explicitly linked challenge
`8877fcf0-8aa7-4dbc-886f-a9d9940cc8ca`: saved prompt, format type and exact two-word
rule agree. The email-shaped prompt is the submitted body, not a private Auth email
substituted by the portal. No source row was corrected or replaced.

Other prompts beginning with “Would you rather” were explicitly submitted as Poll
or Question. Those are not automatically converted to the Would you rather type.
The member-selected type, not wording, determines the saved response contract.

## Portal-only change

- Shared preview for detail and confirmation: original submission reference,
  unmodified prompt, explicit submitted type, readable response format and exact
  ordered choices where applicable. No raw answer-rule JSON in either surface.
- Labels mirror the five choices in `app/(app)/(tabs)/suggest-challenge.tsx`;
  format hints match `lib/answerRules.ts`. No member code was changed.
- Record detail must return the requested ID before it can render or offer a
  decision. All commands retain that original ID and version; titles are never keys.
- Missing/unsupported response details remain visible and cannot be accepted from
  this UI. This is a presentation guard, not a replacement for server validation.
- Existing shared dialog/card/fact/confirmation primitives are reused. No new
  network calls, polling, backend migration, Worker or auth deployment is needed.

The three older missing challenge associations documented in
`COMMUNITY_IDEA_RETRIAGE_RELEASE_2026-09-27.md` remain unresolved. Their original
submission records are available; that does not prove which historical challenge
was created from each. Do not manufacture those associations from matching titles.

## Qualification and release

Released as Pages `03fa0921-aa31-46f8-8c2e-615334d7a7f6`. All 116 portal browser tests
passed against the candidate. All 21 public asset hashes and security headers matched
production after deployment. Existing Worker deployment/settings/bindings/schedules
were verified unchanged. JavaScript syntax and targeted whitespace checks passed.
Read-only signed-in browser verification restored the employee session and opened
the exact reported record: Original submission 422DF527, Format question, Answer
in exactly 2 words, original prompt, submitter and review facts. No decision was
submitted. The computer-use skill was used only for this navigation/inspection.
The initial seven new equality tests compared rendered `innerText` against raw
`textContent`; correcting that test comparison yielded a clean complete rerun.

Candidate: `test-results/idea-presentation-release-20260927/site`, bundle
`admin-app-20260927ideas2.js`. The release tool starts from hash-verified prior
production assets and replaces only the editorial module plus two HTML bundle
references. CSS, auth/session/runtime and shared infrastructure remain unchanged.

Regression coverage includes all five types, both supported format rules, singular
word counts, exact ordered choices, escaped untrusted prompt content, identical
detail/confirmation, same-title/different-ID records, mismatched response identity,
missing/unsupported rules, and existing review/retry/session/accessibility behavior.

Rollback: restore the prior static Pages deployment
`749b0f47-b199-4beb-80cd-164f252aa342`. No database or Worker rollback accompanies
this presentation-only change. No announcement or real decision is submitted for
verification; no paid resource or service is added.
