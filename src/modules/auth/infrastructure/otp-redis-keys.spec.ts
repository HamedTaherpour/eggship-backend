import {
  fingerprintSensitiveValue,
  otpPhoneCooldownKey,
  otpPhoneWindowKey,
  otpWindowBucketId,
} from './otp-redis-keys';

describe('OTP Redis key compatibility', () => {
  it('keeps phone cooldown keys independent of configured TTL', () => {
    const phoneFingerprint = fingerprintSensitiveValue('+989121234567');

    expect(otpPhoneCooldownKey(phoneFingerprint)).toBe(
      `eggship:auth:otp:v1:phone:${phoneFingerprint}:cooldown`,
    );
  });

  it('uses window duration in the bucket key without deleting old windows', () => {
    const phoneFingerprint = fingerprintSensitiveValue('+989121234567');
    const now = 3_600_000;
    const oldWindow = otpPhoneWindowKey(
      phoneFingerprint,
      otpWindowBucketId(now, 3_600),
    );
    const localWindow = otpPhoneWindowKey(
      phoneFingerprint,
      otpWindowBucketId(now, 300),
    );

    expect(oldWindow).not.toBe(localWindow);
    expect(oldWindow).toContain(':req:1');
    expect(localWindow).toContain(':req:12');
  });
});
