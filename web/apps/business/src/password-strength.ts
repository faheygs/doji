// Lazy-loaded only when entering a NEW business password. No network checks,
// logging, storage, cached results, or provider calls. Return a score, not matches.
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as english from '@zxcvbn-ts/language-en';

const estimator = new ZxcvbnFactory({
  translations: english.translations,
  graphs: common.adjacencyGraphs,
  dictionary: { ...common.dictionary, ...english.dictionary },
});

export function passwordStrength(password: string, email = ''): boolean {
  const inputs = email ? [email, email.split('@')[0]!] : [];
  return estimator.check(password, inputs).score >= 3;
}
