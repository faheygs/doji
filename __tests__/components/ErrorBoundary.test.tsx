/**
 * Tests for ErrorBoundary logic.
 * Since react-test-renderer is not installed, we test the class methods directly.
 */
import { ErrorBoundary } from '../../components/ErrorBoundary';

describe('ErrorBoundary', () => {
  it('getDerivedStateFromError returns hasError true', () => {
    const result = ErrorBoundary.getDerivedStateFromError();
    expect(result).toEqual({ hasError: true });
  });

  it('initial state has hasError false', () => {
    const instance = new ErrorBoundary({ children: null });
    expect(instance.state.hasError).toBe(false);
  });

  it('componentDidCatch logs in __DEV__', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const instance = new ErrorBoundary({ children: null });
    const error = new Error('test error');
    const info = { componentStack: 'at Foo\nat Bar' } as React.ErrorInfo;

    instance.componentDidCatch(error, info);

    expect(consoleSpy).toHaveBeenCalledWith('[ErrorBoundary]', error, info.componentStack);
    consoleSpy.mockRestore();
  });

  it('handleRetry resets hasError to false', () => {
    const instance = new ErrorBoundary({ children: null });
    instance.setState = jest.fn();
    (instance as any).handleRetry();
    expect(instance.setState).toHaveBeenCalledWith({ hasError: false });
  });
});
