# Android username input repair — October 13, 2026

Status: source preparation only. No build, OTA update, deployment, store submission
or minimum-version change is authorized/performed by this repair.

## Report and repair

Owner reports entering `j`, then `a` in Android signup produces `jja` and subsequent
typing keeps appending text unexpectedly. No device/keyboard/version trace or
physical reproduction was captured. Code inspection identified immediate
`normalizeUsernameInput` calls in both signup and profile-edit `onChangeText`.
This rewrites controlled native text during keyboard composition and is a plausible
cause, not proof that every keyboard-specific failure is resolved.

Both screens now echo the complete native string unchanged into editing state.
Normalization remains in `useUsernameAvailability` and existing save handlers
(trim, lowercase, remove leading `@`). Validation, availability debounce/read,
atomic profile commands, age checks, auth and navigation are unchanged. Actual
repeated letters are preserved; no substring/duplicate-removal heuristic is used.
No forced selection, remount, keyboard substitution or dependency update.

References: [React Native controlled TextInput](https://reactnative.dev/docs/textinput#value)
and [upstream Android case-conversion duplication report](https://github.com/facebook/react-native/issues/11068).
The upstream report is historical supporting evidence, not confirmation against
this app's exact React Native/keyboard version.

## Regression coverage and release gate

Screen tests exercise complete native values for incremental typing, case changes,
deletion, clearing, legitimate repeated letters, and pasted ` @Ja_Ne `. They assert
exact editing-state preservation and canonical `ja_ne` in existing save commands.
Hook coverage checks normalization before the availability RPC and rejection of
invalid punctuation. Jest does not execute a physical Android input-method editor.

Local verification passed: 6 focused Jest suites / 88 tests (auth flow, profile
settings, username availability, signup contracts and shared input controls), app
TypeScript, scoped ESLint, source-size, repository hygiene, documentation links
and `git diff --check`. Windows initially denied Jest temporary-cache renames;
the successful run used a dedicated ignored workspace cache. These are focused
checks, not a fresh complete CI/coverage run or physical-device acceptance.

Before calling the Android incident resolved, test a new native build on the
reporting device/keyboard, plus Gboard and Samsung Keyboard where available:

1. In signup, type `j`, then `a`, then the rest of a handle; confirm no duplication.
2. Try predictions enabled/disabled, Shift/case input, rapid typing, backspace,
   selecting/replacing the middle of the name, paste and an intentional double letter.
3. Confirm focus/cursor remain stable while availability feedback changes.
4. Confirm unavailable/invalid names block submission; a valid name saves in its
   canonical lowercase form, then follows existing onboarding navigation.
5. Repeat username editing and a smoke check on iOS, in both themes.

This source is after the existing 1.0.10 binaries, not included in them. Keep the
unrelated pending mobile-read and employee-runtime changes separate when releasing.
