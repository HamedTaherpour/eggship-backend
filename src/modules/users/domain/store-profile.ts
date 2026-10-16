export interface StoreProfileRecord {
  id: string;
  userId: string;
  storeName: string;
  address: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreProfileInput {
  storeName: string;
  address: string;
  latitude: number;
  longitude: number;
}

export function normalizeStoreProfileInput(
  input: StoreProfileInput,
): StoreProfileInput {
  const storeName = input.storeName.trim();
  const address = input.address.trim();

  if (storeName.length < 1 || storeName.length > 160) {
    throw new Error('Store name must contain between 1 and 160 characters.');
  }
  if (address.length < 1 || address.length > 500) {
    throw new Error('Address must contain between 1 and 500 characters.');
  }
  assertCoordinate(input.latitude, -90, 90, 'latitude');
  assertCoordinate(input.longitude, -180, 180, 'longitude');

  return {
    storeName,
    address,
    latitude: input.latitude,
    longitude: input.longitude,
  };
}

function assertCoordinate(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  }
}
