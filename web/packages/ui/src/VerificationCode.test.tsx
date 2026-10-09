import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VerificationCode } from './VerificationCode';
import { DojiTheme } from './theme';

function Field({ disabled = false, error = false }: { disabled?: boolean; error?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <DojiTheme>
      <form>
        <VerificationCode value={value} onChange={setValue} disabled={disabled} error={error} />
        <button>Verify</button>
      </form>
    </DojiTheme>
  );
}
describe('shared six-digit verification input', () => {
  it('uses one standard field and keeps leading zeros', async () => {
    const user = userEvent.setup();
    const { container } = render(<Field />);
    const input = screen.getByRole('textbox', { name: 'Verification code' });
    expect(container.querySelectorAll('[data-code-slot]')).toHaveLength(0);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await user.type(input, '012345');
    expect(input).toHaveValue('012345');
    expect(new FormData(input.closest('form')!).get('code')).toBe('012345');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Verify' })).toHaveFocus();
  });
  it('accepts a formatted full paste, rejects letters and supports selection replacement', async () => {
    const user = userEvent.setup();
    render(<Field />);
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.paste('012-345');
    expect(input).toHaveValue('012345');
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('9a2345');
    expect(input).toHaveValue('012345');
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('987 654');
    expect(input).toHaveValue('987654');
  });
  it('pastes partial digits at the selection without losing existing digits', async () => {
    const user = userEvent.setup();
    render(<Field />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, '0123');
    input.setSelectionRange(2, 4);
    await user.paste('45');
    expect(input).toHaveValue('0145');
    input.setSelectionRange(4, 4);
    await user.paste('67');
    expect(input).toHaveValue('014567');
    await user.paste('8');
    expect(input).toHaveValue('014567');
  });
  it('requires all six digits and accepts a complete autofill value as one change', () => {
    render(<Field />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.validity.valueMissing).toBe(true);
    fireEvent.change(input, { target: { value: '012345' } });
    expect(input).toHaveValue('012345');
    expect(input).toHaveAttribute('minlength', '6');
    expect(input).toHaveAttribute('maxlength', '6');
  });
  it('exposes error instructions and prevents edits while disabled', async () => {
    const onChange = vi.fn();
    render(
      <DojiTheme>
        <VerificationCode
          value=""
          onChange={onChange}
          error
          disabled
          helperText="Try the current code."
        />
      </DojiTheme>,
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Try the current code.');
    expect(input).toBeDisabled();
    await userEvent.type(input, '123456');
    expect(onChange).not.toHaveBeenCalled();
  });
});
