import * as Sentry from '@sentry/react-native';

type TelemetryValue = string | number | boolean | null | undefined;

const REPORT_WINDOW_MS = 60_000;
const lastReportAt = new Map<string, number>();

function errorDetails(error: unknown): Record<string, TelemetryValue> {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    return {
      errorMessage: typeof value.message === 'string' ? value.message : 'Unknown realtime error',
      errorCode: typeof value.code === 'number' ? value.code : undefined,
      statusCode: typeof value.statusCode === 'number' ? value.statusCode : undefined,
    };
  }
  return { errorMessage: typeof error === 'string' ? error : 'Unknown realtime error' };
}

export function reportRealtimeFailure(
  operation: string,
  error: unknown,
  context: Record<string, TelemetryValue> = {},
): void {
  const details = errorDetails(error);
  const data = { ...context, ...details };

  Sentry.addBreadcrumb({
    category: 'realtime',
    level: 'error',
    message: operation,
    data,
  });

  if (__DEV__) return;
  const reportKey = `${operation}:${String(details.errorCode ?? details.statusCode ?? '')}`;
  const now = Date.now();
  if (now - (lastReportAt.get(reportKey) ?? 0) < REPORT_WINDOW_MS) return;
  lastReportAt.set(reportKey, now);

  const reportError =
    error instanceof Error
      ? error
      : new Error(String(details.errorMessage ?? 'Realtime operation failed'));
  Sentry.withScope((scope) => {
    scope.setTag('area', 'realtime');
    scope.setTag('operation', operation);
    scope.setContext('realtime', data);
    Sentry.captureException(reportError);
  });
}
