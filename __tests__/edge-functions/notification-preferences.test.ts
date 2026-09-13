import { pushPreferenceEnabled } from '../../supabase/functions/_shared/notification-preferences';

describe('pushPreferenceEnabled', () => {
  it('allows legacy profiles with no stored preferences', () => {
    expect(pushPreferenceEnabled(null, 'comment')).toBe(true);
  });

  it('stops every category when the master switch is off', () => {
    expect(pushPreferenceEnabled({ push_enabled: false, comment: true }, 'comment')).toBe(false);
  });

  it('honors a disabled category when the master switch is on', () => {
    expect(pushPreferenceEnabled({ push_enabled: true, comment: false }, 'comment')).toBe(false);
  });

  it('allows an enabled category when the master switch is on', () => {
    expect(pushPreferenceEnabled({ push_enabled: true, comment: true }, 'comment')).toBe(true);
  });

  it('honors legacy opt-outs for the consolidated settings', () => {
    expect(pushPreferenceEnabled({ push_enabled: true, mention: false }, 'mentions_replies'))
      .toBe(false);
    expect(pushPreferenceEnabled({ push_enabled: true, doji_start: false }, 'doji_live'))
      .toBe(false);
  });
});
