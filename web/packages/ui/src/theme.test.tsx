import { describe, expect, it } from 'vitest';
import { createTheme, getContrastRatio, Button } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { DojiTheme, createDojiTheme } from './theme';

describe('shared Doji Material UI theme', () => {
  it('uses normal working text and a deliberate desktop heading rather than scaling everything', () => {
    const standard = createDojiTheme('dark');
    const desktop = createDojiTheme('dark', true);
    expect(standard.typography.fontSize).toBe(14);
    expect(desktop.typography.fontSize).toBe(14);
    expect(desktop.typography.body2.fontSize).toBe(standard.typography.body2.fontSize);
    expect(desktop.typography.h4.fontSize).toBe('1.875rem');
    for (const key of ['primary', 'secondary', 'background', 'text', 'error', 'success'] as const)
      expect(desktop.palette[key]).toEqual(standard.palette[key]);
  });
  it.each(['light', 'dark'] as const)(
    'preserves standard controls with accessible branding in %s mode',
    (mode) => {
      const standard = createTheme({ palette: { mode } });
      const actual = createDojiTheme(mode);
      expect(actual.palette.primary.main).toBe(mode === 'dark' ? '#ff9878' : '#b83b1b');
      expect(actual.palette.error.main).toBe(standard.palette.error.main);
      expect(actual.palette.success.main).toBe(standard.palette.success.main);
      expect(
        getContrastRatio(actual.palette.primary.main, actual.palette.primary.contrastText),
      ).toBeGreaterThanOrEqual(4.5);
      expect(actual.shape.borderRadius).toBe(12);
      expect(getContrastRatio('#ffffff', actual.palette.secondary.dark)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(actual.typography.button.textTransform).toBe('none');
      expect(Object.keys(actual.components ?? {})).toEqual([
        'MuiPaper',
        'MuiTableCell',
        'MuiListItemButton',
        'MuiButton',
      ]);
      for (const surface of [actual.palette.background.default, actual.palette.background.paper]) {
        for (const foreground of [
          actual.palette.text.primary,
          actual.palette.text.secondary,
          actual.palette.primary.main,
        ]) {
          expect(getContrastRatio(foreground, surface)).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const fill of ['#b83b1b', '#963016']) {
        expect(getContrastRatio('#ffffff', fill)).toBeGreaterThanOrEqual(4.5);
      }
      render(
        <DojiTheme mode={mode}>
          <Button variant="contained">Continue</Button>
        </DojiTheme>,
      );
      // Browser coverage checks resolved colors; jsdom does not resolve MUI CSS variables.
      expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('MuiButton-contained');
    },
  );
});
