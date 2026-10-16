-- STORE-02: StoreProfile persistence and additive Order delivery snapshots.
-- Additive only: no historical data is backfilled and existing Orders remain valid.

CREATE TABLE "StoreProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "storeName" VARCHAR(160) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StoreProfile"
ADD CONSTRAINT "StoreProfile_storeName_trimmed_check"
CHECK (
    "storeName" = btrim("storeName")
    AND char_length("storeName") BETWEEN 1 AND 160
);

ALTER TABLE "StoreProfile"
ADD CONSTRAINT "StoreProfile_address_trimmed_check"
CHECK (
    "address" = btrim("address")
    AND char_length("address") BETWEEN 1 AND 500
);

ALTER TABLE "StoreProfile"
ADD CONSTRAINT "StoreProfile_latitude_range_check"
CHECK ("latitude" BETWEEN -90 AND 90);

ALTER TABLE "StoreProfile"
ADD CONSTRAINT "StoreProfile_longitude_range_check"
CHECK ("longitude" BETWEEN -180 AND 180);

CREATE UNIQUE INDEX "StoreProfile_userId_key" ON "StoreProfile"("userId");

ALTER TABLE "StoreProfile"
ADD CONSTRAINT "StoreProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
ADD COLUMN "deliveryStoreName" VARCHAR(160),
ADD COLUMN "deliveryAddress" VARCHAR(500),
ADD COLUMN "deliveryLatitude" DECIMAL(9,6),
ADD COLUMN "deliveryLongitude" DECIMAL(9,6);

ALTER TABLE "Order"
ADD CONSTRAINT "Order_delivery_snapshot_all_or_none_check"
CHECK (
    (
        "deliveryStoreName" IS NULL
        AND "deliveryAddress" IS NULL
        AND "deliveryLatitude" IS NULL
        AND "deliveryLongitude" IS NULL
    )
    OR (
        "deliveryStoreName" IS NOT NULL
        AND "deliveryAddress" IS NOT NULL
        AND "deliveryLatitude" IS NOT NULL
        AND "deliveryLongitude" IS NOT NULL
    )
);

ALTER TABLE "Order"
ADD CONSTRAINT "Order_deliveryStoreName_trimmed_check"
CHECK (
    "deliveryStoreName" IS NULL
    OR (
        "deliveryStoreName" = btrim("deliveryStoreName")
        AND char_length("deliveryStoreName") BETWEEN 1 AND 160
    )
);

ALTER TABLE "Order"
ADD CONSTRAINT "Order_deliveryAddress_trimmed_check"
CHECK (
    "deliveryAddress" IS NULL
    OR (
        "deliveryAddress" = btrim("deliveryAddress")
        AND char_length("deliveryAddress") BETWEEN 1 AND 500
    )
);

ALTER TABLE "Order"
ADD CONSTRAINT "Order_deliveryLatitude_range_check"
CHECK (
    "deliveryLatitude" IS NULL
    OR "deliveryLatitude" BETWEEN -90 AND 90
);

ALTER TABLE "Order"
ADD CONSTRAINT "Order_deliveryLongitude_range_check"
CHECK (
    "deliveryLongitude" IS NULL
    OR "deliveryLongitude" BETWEEN -180 AND 180
);
