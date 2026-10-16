import 'dotenv/config';
import pg from 'pg';
import { parseApprovedSeedDatabase } from './lib/dev-seed-safety.mjs';
import { assertCanonicalSeedInventoryState } from './lib/canonical-seed-inventory.mjs';

const { Client } = pg;
const ACTOR_ID = '00000000-0000-4000-8000-000000000001';
const REGION_ID = '00000000-0000-4000-8000-000000000010';
const users = [
  {
    id: '00000000-0000-4000-8000-000000000401',
    phone: '+989121111111',
    profileId: '00000000-0000-4000-8000-000000000501',
    storeName: 'بازارچه زعفران تهران',
    address: 'تهران، خیابان ولیعصر، کوچه بهار، پلاک ۱۲',
    latitude: 35.6892,
    longitude: 51.389,
  },
  {
    id: '00000000-0000-4000-8000-000000000402',
    phone: '+989122222222',
    profileId: '00000000-0000-4000-8000-000000000502',
    storeName: 'سوپرمارکت نارون ایرانیان',
    address: 'تهران، میدان ونک، خیابان ملاصدرا، پلاک ۲۸',
    latitude: 35.7219,
    longitude: 51.3347,
  },
  {
    id: '00000000-0000-4000-8000-000000000403',
    phone: '+989123333333',
    profileId: null,
    storeName: null,
    address: null,
    latitude: null,
    longitude: null,
  },
];
const categories = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'Eggs & Breakfast' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'Dairy & Chilled' },
  { id: '00000000-0000-4000-8000-000000000103', name: 'Pantry Essentials' },
];
const products = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    name: 'Farm Fresh Development Eggs 12-pack',
    price: 185000,
    categoryId: categories[0].id,
    receiveId: '00000000-0000-4000-8000-000000000301',
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    name: 'Local Dairy Development Milk 1L',
    price: 95000,
    categoryId: categories[1].id,
    receiveId: '00000000-0000-4000-8000-000000000302',
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    name: 'Development Pantry Rice 1kg',
    price: 245000,
    categoryId: categories[2].id,
    receiveId: '00000000-0000-4000-8000-000000000303',
  },
];
const seededOrders = [
  {
    orderId: '00000000-0000-4000-8000-000000000601',
    lineId: '00000000-0000-4000-8000-000000000701',
    reservationId: '00000000-0000-4000-8000-000000000801',
    reserveLedgerId: '00000000-0000-4000-8000-000000000901',
    shipLedgerId: '00000000-0000-4000-8000-000000000902',
    userId: users[0].id,
    productId: products[0].id,
    quantity: 1,
  },
  {
    orderId: '00000000-0000-4000-8000-000000000602',
    lineId: '00000000-0000-4000-8000-000000000702',
    reservationId: '00000000-0000-4000-8000-000000000802',
    reserveLedgerId: '00000000-0000-4000-8000-000000000903',
    shipLedgerId: '00000000-0000-4000-8000-000000000904',
    userId: users[1].id,
    productId: products[1].id,
    quantity: 2,
  },
];
const STOCK_PER_PRODUCT = 100;

function assertExisting(row, expected, label) {
  if (row === undefined)
    throw new Error(`${label} was not returned after seeding.`);
  for (const [key, value] of Object.entries(expected)) {
    if (
      [
        'latitude',
        'longitude',
        'deliveryLatitude',
        'deliveryLongitude',
      ].includes(key) &&
      Number(row[key]) === Number(value)
    ) {
      continue;
    }
    if (String(row[key]) !== String(value))
      throw new Error(
        `${label} ${key} differs from the canonical development fixture.`,
      );
  }
}

function seededOrderForProduct(productId) {
  return seededOrders.find((order) => order.productId === productId) ?? null;
}

async function seed() {
  const target = parseApprovedSeedDatabase();
  const client = new Client({ connectionString: target.connectionString });
  const inventorySeedStates = new Map();
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO "Admin" ("id", "email", "passwordHash", "role", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'WAREHOUSE', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`,
      [
        ACTOR_ID,
        'seed-actor@localhost.test',
        '$argon2id$eggship-development-seed-actor-disabled',
      ],
    );
    const actor = (
      await client.query(
        'SELECT "email", "role", "isActive" FROM "Admin" WHERE "id" = $1',
        [ACTOR_ID],
      )
    ).rows[0];
    assertExisting(
      actor,
      {
        email: 'seed-actor@localhost.test',
        role: 'WAREHOUSE',
        isActive: false,
      },
      'Seed actor',
    );

    for (const category of categories) {
      await client.query(
        `INSERT INTO "Category" ("id", "name", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`,
        [category.id, category.name],
      );
      const row = (
        await client.query(
          'SELECT "name", "isActive" FROM "Category" WHERE "id" = $1',
          [category.id],
        )
      ).rows[0];
      assertExisting(
        row,
        { name: category.name, isActive: true },
        `Category ${category.id}`,
      );
    }

    await client.query(
      `INSERT INTO "Region" ("id", "name", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`,
      [REGION_ID, 'Tehran Development Delivery Region'],
    );
    const region = (
      await client.query(
        'SELECT "name", "isActive" FROM "Region" WHERE "id" = $1',
        [REGION_ID],
      )
    ).rows[0];
    assertExisting(
      region,
      { name: 'Tehran Development Delivery Region', isActive: true },
      'Region',
    );

    for (const product of products) {
      await client.query(
        `INSERT INTO "Product" ("id", "name", "price", "categoryId", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`,
        [product.id, product.name, product.price, product.categoryId],
      );
      const current = (
        await client.query(
          'SELECT "name", "price", "categoryId", "isActive" FROM "Product" WHERE "id" = $1',
          [product.id],
        )
      ).rows[0];
      assertExisting(
        current,
        {
          name: product.name,
          price: product.price,
          categoryId: product.categoryId,
          isActive: true,
        },
        `Product ${product.id}`,
      );
      const inventory =
        (
          await client.query(
            'SELECT "productId", "onHand", "reserved" FROM "Inventory" WHERE "productId" = $1',
            [product.id],
          )
        ).rows[0] ?? null;
      const ledger = (
        await client.query(
          'SELECT "id", "type", "quantity", "onHandDelta", "reservedDelta", "onHandAfter", "reservedAfter", "referenceType", "referenceId", "actorType", "actorId", "correlationId" FROM "InventoryLedger" WHERE "productId" = $1 ORDER BY "createdAt", "id"',
          [product.id],
        )
      ).rows;
      const reservations = (
        await client.query(
          'SELECT "id", "orderId", "status" FROM "InventoryReservation" WHERE "productId" = $1',
          [product.id],
        )
      ).rows;
      const orderLines = (
        await client.query(
          'SELECT ol."id" FROM "OrderLine" ol WHERE ol."productId" = $1 ORDER BY ol."id"',
          [product.id],
        )
      ).rows;
      const state = assertCanonicalSeedInventoryState({
        productId: product.id,
        receiveId: product.receiveId,
        inventory,
        ledger,
        reservations,
        orderLines,
        seededOrder: seededOrderForProduct(product.id),
      });
      if (state === 'CREATE') {
        await client.query(
          `INSERT INTO "Inventory" ("productId", "onHand", "reserved", "createdAt", "updatedAt") VALUES ($1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [product.id],
        );
        const balance = (
          await client.query(
            `UPDATE "Inventory" SET "onHand" = "onHand" + $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "productId" = $1 RETURNING "onHand", "reserved"`,
            [product.id, STOCK_PER_PRODUCT],
          )
        ).rows[0];
        await client.query(
          `INSERT INTO "InventoryLedger" ("id", "productId", "type", "quantity", "onHandDelta", "reservedDelta", "onHandAfter", "reservedAfter", "referenceType", "referenceId", "reason", "actorType") VALUES ($1, $2, 'RECEIVE', $3, $3, 0, $4, $5, 'RECEIVE', $1, 'EggShip development seed stock', 'SYSTEM')`,
          [
            product.receiveId,
            product.id,
            STOCK_PER_PRODUCT,
            balance.onHand,
            balance.reserved,
          ],
        );
      } else if (state !== 'IDEMPOTENT') {
        throw new Error(`Unexpected canonical seed state for ${product.id}.`);
      }
      inventorySeedStates.set(product.id, state);
    }

    for (const user of users) {
      await client.query(
        `INSERT INTO "User" ("id", "phone", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`,
        [user.id, user.phone],
      );
      const seededUser = (
        await client.query(
          'SELECT "phone", "isActive" FROM "User" WHERE "id" = $1',
          [user.id],
        )
      ).rows[0];
      assertExisting(
        seededUser,
        { phone: user.phone, isActive: true },
        `Seed customer ${user.id}`,
      );

      if (user.profileId === null) {
        const profileCount = (
          await client.query(
            'SELECT count(*)::int AS "count" FROM "StoreProfile" WHERE "userId" = $1',
            [user.id],
          )
        ).rows[0].count;
        if (profileCount !== 0) {
          throw new Error(
            `Negative profile fixture ${user.id} is contaminated.`,
          );
        }
        continue;
      }

      await client.query(
        `INSERT INTO "StoreProfile" ("id", "userId", "storeName", "address", "latitude", "longitude", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("userId") DO NOTHING`,
        [
          user.profileId,
          user.id,
          user.storeName,
          user.address,
          user.latitude,
          user.longitude,
        ],
      );
      const profile = (
        await client.query(
          'SELECT "id", "storeName", "address", "latitude", "longitude" FROM "StoreProfile" WHERE "userId" = $1',
          [user.id],
        )
      ).rows[0];
      assertExisting(
        profile,
        {
          id: user.profileId,
          storeName: user.storeName,
          address: user.address,
          latitude: user.latitude,
          longitude: user.longitude,
        },
        `StoreProfile ${user.profileId}`,
      );
    }

    for (const order of seededOrders) {
      const user = users.find((candidate) => candidate.id === order.userId);
      const product = products.find(
        (candidate) => candidate.id === order.productId,
      );
      if (!user || !product || user.profileId === null) {
        throw new Error(
          `Seed order ${order.orderId} has invalid fixture references.`,
        );
      }
      const total = product.price * order.quantity;
      await client.query(
        `INSERT INTO "Order" ("id", "userId", "status", "customerPhone", "regionId", "regionName", "deliveryStoreName", "deliveryAddress", "deliveryLatitude", "deliveryLongitude", "grossSubtotal", "lineDiscountTotal", "subtotalAfterLineDiscounts", "orderDiscountAmount", "total", "pricingEvaluatedAt", "commercePolicyRevision", "idempotencyKey", "idempotencyPayloadHash", "deliveryAt", "confirmedAt", "shippedAt", "deliveredAt", "createdAt", "updatedAt")
         SELECT $1, u."id", 'DELIVERED', u."phone", r."id", r."name", sp."storeName", sp."address", sp."latitude", sp."longitude", $2, 0, $2, 0, $2, CURRENT_TIMESTAMP, 1, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM "User" u
         JOIN "Region" r ON r."id" = $5
         JOIN "StoreProfile" sp ON sp."userId" = u."id"
         WHERE u."id" = $6
         ON CONFLICT ("id") DO NOTHING`,
        [
          order.orderId,
          total,
          order.idempotencyKey ?? order.orderId,
          'a'.repeat(64),
          REGION_ID,
          order.userId,
        ],
      );
      const storedOrder = (
        await client.query(
          'SELECT "userId", "status", "customerPhone", "regionId", "regionName", "deliveryStoreName", "deliveryAddress", "deliveryLatitude", "deliveryLongitude", "total" FROM "Order" WHERE "id" = $1',
          [order.orderId],
        )
      ).rows[0];
      assertExisting(
        storedOrder,
        {
          userId: order.userId,
          status: 'DELIVERED',
          customerPhone: user.phone,
          regionId: REGION_ID,
          regionName: 'Tehran Development Delivery Region',
          deliveryStoreName: user.storeName,
          deliveryAddress: user.address,
          deliveryLatitude: user.latitude,
          deliveryLongitude: user.longitude,
          total,
        },
        `Seed order ${order.orderId}`,
      );

      await client.query(
        `INSERT INTO "OrderLine" ("id", "orderId", "productId", "productName", "unitPrice", "quantity", "discountedQuantity", "grossLineTotal", "lineDiscountAmount", "finalLineTotal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 0, $7, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`,
        [
          order.lineId,
          order.orderId,
          product.id,
          product.name,
          product.price,
          order.quantity,
          total,
        ],
      );
      const storedLine = (
        await client.query(
          'SELECT "orderId", "productId", "productName", "unitPrice", "quantity", "discountedQuantity", "grossLineTotal", "lineDiscountAmount", "finalLineTotal" FROM "OrderLine" WHERE "id" = $1',
          [order.lineId],
        )
      ).rows[0];
      assertExisting(
        storedLine,
        {
          orderId: order.orderId,
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          quantity: order.quantity,
          discountedQuantity: 0,
          grossLineTotal: total,
          lineDiscountAmount: 0,
          finalLineTotal: total,
        },
        `Seed order line ${order.lineId}`,
      );

      if (inventorySeedStates.get(product.id) === 'CREATE') {
        const inventoryAfterReserve = 100;
        const inventoryAfterShip = inventoryAfterReserve - order.quantity;
        await client.query(
          `INSERT INTO "InventoryReservation" ("id", "orderId", "productId", "quantity", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, 'SHIPPED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("orderId", "productId") DO NOTHING`,
          [order.reservationId, order.orderId, product.id, order.quantity],
        );
        await client.query(
          `INSERT INTO "InventoryLedger" ("id", "productId", "type", "quantity", "onHandDelta", "reservedDelta", "onHandAfter", "reservedAfter", "referenceType", "referenceId", "reason", "actorType") VALUES ($1, $2, 'RESERVE', $3, 0, $3, $4, $3, 'ORDER', $5, 'Seeded historical order reservation', 'SYSTEM') ON CONFLICT ("id") DO NOTHING`,
          [
            order.reserveLedgerId,
            product.id,
            order.quantity,
            inventoryAfterReserve,
            order.orderId,
          ],
        );
        await client.query(
          `INSERT INTO "InventoryLedger" ("id", "productId", "type", "quantity", "onHandDelta", "reservedDelta", "onHandAfter", "reservedAfter", "referenceType", "referenceId", "reason", "actorType") VALUES ($1, $2, 'SHIP', $3, ($3 * -1), ($3 * -1), $4, 0, 'ORDER', $5, 'Seeded historical order shipment', 'SYSTEM') ON CONFLICT ("id") DO NOTHING`,
          [
            order.shipLedgerId,
            product.id,
            order.quantity,
            inventoryAfterShip,
            order.orderId,
          ],
        );
        await client.query(
          'UPDATE "Inventory" SET "onHand" = $2, "reserved" = 0, "updatedAt" = CURRENT_TIMESTAMP WHERE "productId" = $1',
          [product.id, inventoryAfterShip],
        );
      }
    }

    await client.query(
      `INSERT INTO "CommerceSettings" ("id", "orderingScheduleEnabled", "orderingOpensAtLocalMinute", "orderingClosesAtLocalMinute", "minimumOrderQuantity", "revision", "createdByAdminId", "updatedByAdminId", "createdAt", "updatedAt") VALUES (1, false, 0, 1439, 1, 1, $1, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`,
      [ACTOR_ID],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  const summaryClient = new Client({
    connectionString: target.connectionString,
  });
  await summaryClient.connect();
  try {
    const result = await summaryClient.query(
      `SELECT (SELECT count(*)::int FROM "Category" WHERE "id" = ANY($1::uuid[])) AS "categoryCount", (SELECT count(*)::int FROM "Product" WHERE "id" = ANY($2::uuid[])) AS "productCount", (SELECT count(*)::int FROM "Region" WHERE "id" = $3::uuid) AS "regionCount", (SELECT count(*)::int FROM "User" WHERE "id" = ANY($4::uuid[])) AS "customerCount", (SELECT count(*)::int FROM "StoreProfile" WHERE "userId" = ANY($4::uuid[])) AS "profileCount", (SELECT count(*)::int FROM "User" u WHERE u."id" = ANY($4::uuid[]) AND NOT EXISTS (SELECT 1 FROM "StoreProfile" sp WHERE sp."userId" = u."id")) AS "customersWithoutProfileCount", (SELECT count(*)::int FROM "Order" WHERE "id" = ANY($5::uuid[])) AS "orderCount", (SELECT count(*)::int FROM "Order" WHERE "id" = ANY($5::uuid[]) AND "deliveryStoreName" IS NOT NULL AND "deliveryAddress" IS NOT NULL AND "deliveryLatitude" IS NOT NULL AND "deliveryLongitude" IS NOT NULL) AS "snapshotOrderCount", (SELECT count(*)::int FROM "Order" o JOIN "StoreProfile" sp ON sp."userId" = o."userId" WHERE o."id" = ANY($5::uuid[]) AND (o."deliveryStoreName" IS DISTINCT FROM sp."storeName" OR o."deliveryAddress" IS DISTINCT FROM sp."address" OR o."deliveryLatitude" IS DISTINCT FROM sp."latitude" OR o."deliveryLongitude" IS DISTINCT FROM sp."longitude")) AS "snapshotMismatchCount", (SELECT json_agg(json_build_object('id', p."id", 'priceToman', p."price", 'available', i."onHand" - i."reserved") ORDER BY p."id") FROM "Product" p JOIN "Inventory" i ON i."productId" = p."id" WHERE p."id" = ANY($2::uuid[])) AS "products"`,
      [
        categories.map(({ id }) => id),
        products.map(({ id }) => id),
        REGION_ID,
        users.map(({ id }) => id),
        seededOrders.map(({ orderId }) => orderId),
      ],
    );
    const row = result.rows[0];
    console.log(
      JSON.stringify(
        {
          target: target.displayTarget,
          categoryCount: row.categoryCount,
          productCount: row.productCount,
          regionCount: row.regionCount,
          customerCount: row.customerCount,
          profileCount: row.profileCount,
          customersWithoutProfileCount: row.customersWithoutProfileCount,
          orderCount: row.orderCount,
          snapshotOrderCount: row.snapshotOrderCount,
          snapshotMismatchCount: row.snapshotMismatchCount,
          seededProductIds: products.map(({ id }) => id),
          seededRegionId: REGION_ID,
          currentPricesAndAvailableInventory: row.products,
        },
        null,
        2,
      ),
    );
  } finally {
    await summaryClient.end();
  }
}

seed().catch((error) => {
  console.error(
    `Seed failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
