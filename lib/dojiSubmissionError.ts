import { apiFailureDetails } from './apiFailureTelemetry';

export type DojiSubmissionErrorCopy = {
  title: string;
  message: string;
};

type SubmissionStage = 'upload' | 'submit';
const stages = new WeakMap<object, SubmissionStage>();

/** Preserve the original failure and its diagnostic evidence, not a new wrapper. */
export async function atSubmissionStage<T>(stage: SubmissionStage, work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error && typeof error === 'object') stages.set(error, stage);
    throw error;
  }
}

/** Keep transport/database details out of the UI while preserving a retry path. */
export function dojiSubmissionErrorCopy(error: unknown): DojiSubmissionErrorCopy {
  const value = error && typeof error === 'object' ? error as { message?: unknown } : {};
  const message = typeof value.message === 'string' ? value.message.trim().toLowerCase() : '';
  const { kind, status, code } = apiFailureDetails(error);
  const stage = error && typeof error === 'object' ? stages.get(error) : undefined;

  if (
    message === 'doji has closed'
  ) {
    return {
      title: "Time's up",
      message: 'This Doji’s participation window has ended.',
    };
  }

  if (message === 'doji is no longer open') return {
    title: 'This Doji is no longer available',
    message: 'Return to the feed to check your participation status.',
  };
  if (message === 'doji is not live yet') return {
    title: 'This Doji hasn’t started',
    message: 'Return to the feed to check when you can participate.',
  };
  if (message === 'invalid poll option') return {
    title: 'That option is no longer available',
    message: 'Reopen the Doji and choose an available answer.',
  };
  if (message === 'your message contains prohibited language.') return {
    title: 'Please edit your answer',
    message: 'Your answer contains language that isn’t allowed. Edit it before submitting.',
  };
  if (kind === 'authorization') return status === 403 || code === '42501' ? {
    title: 'Submission isn’t available',
    message: 'Return to the feed to check whether you can participate in this Doji.',
  } : {
    title: 'Please sign in again',
    message: 'We couldn’t verify your sign-in. Sign in again to continue.',
  };
  if (kind === 'rate_limit') return {
    title: 'Please wait a moment',
    message: 'Too many requests were made. Wait a moment before trying again.',
  };
  if (stage === 'upload') return {
    title: 'Your media didn’t finish uploading',
    message: 'Try uploading again, or return to the feed to check your participation status.',
  };

  if (
    ['network', 'timeout', 'server'].includes(kind)
  ) {
    return {
      title: 'We couldn’t confirm your submission',
      message: 'Doji didn’t return a confirmation. You can retry this same answer or return to the feed to check its status.',
    };
  }

  return {
    title: "Couldn't submit",
    message: 'Doji couldn’t complete this request. Return to the feed to check your status, or try this answer again.',
  };
}
