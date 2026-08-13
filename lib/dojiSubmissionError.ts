export type DojiSubmissionErrorCopy = {
  title: string;
  message: string;
};

/** Keep transport/database details out of the UI while preserving a retry path. */
export function dojiSubmissionErrorCopy(error: unknown): DojiSubmissionErrorCopy {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw.toLowerCase();

  if (
    message.includes('doji has closed') ||
    message.includes('doji is no longer open') ||
    message.includes('time') && message.includes('closed')
  ) {
    return {
      title: "Time's up",
      message: 'The 10-minute Doji window has ended.',
    };
  }

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('connection')
  ) {
    return {
      title: "Couldn't post yet",
      message: 'Your response is still here. Try again.',
    };
  }

  return {
    title: "Couldn't submit",
    message: 'Your response is still here. Try again.',
  };
}
