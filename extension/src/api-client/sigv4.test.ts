import { describe, expect, it } from 'vitest';
import { signAwsV4, _testHelpers } from './sigv4';

describe('sigv4', () => {
  it('hashes empty payload like AWS GET examples', async () => {
    const { sha256Hex } = await _testHelpers();
    // Empty string SHA-256 from AWS docs
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces Authorization header with credential scope', async () => {
    const headers = await signAwsV4(
      {
        method: 'GET',
        url: 'https://example.amazonaws.com/path?Param1=value1',
        headers: {},
        body: '',
        now: new Date('2015-08-30T12:36:00Z'),
      },
      {
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
        service: 'service',
      },
    );
    expect(headers['x-amz-date']).toBe('20150830T123600Z');
    expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request/);
    expect(headers.Authorization).toMatch(/Signature=[0-9a-f]{64}/);
  });
});
