import { selectedImageUri } from '../../lib/imagePickerRecovery';

describe('selectedImageUri', () => {
  it('returns a cropped image from the normal or recovered Android result', () => {
    expect(
      selectedImageUri({ canceled: false, assets: [{ uri: 'file://cropped.jpg' }] } as never),
    ).toBe('file://cropped.jpg');
  });

  it('ignores cancellation and reports native picker failures', () => {
    expect(selectedImageUri({ canceled: true, assets: null })).toBeNull();
    expect(() => selectedImageUri({ code: 'E_PICKER', message: 'Picker failed' })).toThrow(
      'Picker failed',
    );
  });

  it.each([[], [{ uri: '' }], [{ uri: ' ' }], null])(
    'rejects a successful result without a usable photo (%j)',
    (assets) => {
      expect(() => selectedImageUri({ canceled: false, assets } as never)).toThrow(
        'This photo could not be opened',
      );
    },
  );
});
