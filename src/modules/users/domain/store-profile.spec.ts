import { normalizeStoreProfileInput } from './store-profile';

const validInput = {
  storeName: '  Central Store  ',
  address: '  Main Street  ',
  latitude: 35.6892,
  longitude: 51.389,
};

describe('StoreProfile domain input', () => {
  it('trims and accepts a valid profile', () => {
    expect(normalizeStoreProfileInput(validInput)).toEqual({
      storeName: 'Central Store',
      address: 'Main Street',
      latitude: 35.6892,
      longitude: 51.389,
    });
  });

  it.each([
    ['empty store name', { ...validInput, storeName: '   ' }],
    ['empty address', { ...validInput, address: '   ' }],
    ['latitude below range', { ...validInput, latitude: -90.001 }],
    ['latitude above range', { ...validInput, latitude: 90.001 }],
    ['longitude below range', { ...validInput, longitude: -180.001 }],
    ['longitude above range', { ...validInput, longitude: 180.001 }],
    ['non-finite latitude', { ...validInput, latitude: Number.NaN }],
  ])('rejects %s', (_label, input) => {
    expect(() => normalizeStoreProfileInput(input)).toThrow();
  });
});
