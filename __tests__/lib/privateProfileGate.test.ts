import { privateGateCopy } from '../../lib/privateProfileGate';

describe('privateGateCopy', () => {
  it('prompts to follow when not connected', () => {
    expect(privateGateCopy('none')).toEqual({
      title: 'Private account',
      body: 'Follow to see their activity.',
    });
  });

  it('explains pending outgoing request', () => {
    expect(privateGateCopy('pending_out')).toEqual({
      title: 'Request pending',
      body: 'They need to approve your request first.',
    });
  });

  it('handles blocked state', () => {
    expect(privateGateCopy('blocked')).toEqual({
      title: 'Unavailable',
      body: "You can't view this profile.",
    });
  });
});
