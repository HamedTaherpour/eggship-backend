import { check } from 'k6';
/* global __ENV, __VU, __ITER */
import http from 'k6/http';
import {
  base,
  auth,
  users,
  products,
  pick,
  submissions,
  successfulOrders,
  rejectedOrders,
  expectedRejections,
  unexpectedFailures,
  recordStatus,
  successfulOperations,
  recordExpectedBusinessRejection,
} from './common.js';
import { handleSummary } from './common.js';
export { handleSummary };

const ORDER_ATTEMPT_LIMIT = 50;

// shared-iterations applies the iteration count globally across all VUs.
export const options = {
  scenarios: {
    order_creation: {
      executor: 'shared-iterations',
      vus: 5,
      iterations: ORDER_ATTEMPT_LIMIT,
      maxDuration: '30s',
    },
  },
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};
export default function () {
  const token = pick(users());
  const key = `00000000-0000-4000-8000-${String(__VU).padStart(6, '0')}${String(__ITER).padStart(6, '0')}`;
  submissions.add(1);
  const response = http.post(
    `${base()}/api/v1/orders`,
    JSON.stringify({
      regionId: __ENV.LOAD_TEST_REGION_ID,
      lines: [{ productId: pick(products()), quantity: 1 }],
    }),
    {
      ...auth(token),
      headers: { ...auth(token).headers, 'Idempotency-Key': key },
    },
  );
  recordStatus(response);
  let body = {};
  try {
    body = response.json() || {};
  } catch {
    unexpectedFailures.add(1);
  }
  const businessReject =
    response.status === 400 ||
    response.status === 409 ||
    response.status === 422 ||
    response.status === 503;
  const successful = response.status === 201 || response.status === 200;
  if (businessReject && body.error) expectedRejections.add(1);
  if (successful) {
    successfulOrders.add(1);
    successfulOperations.add(1);
  } else {
    rejectedOrders.add(1);
    if (!(businessReject && body.error)) unexpectedFailures.add(1);
  }
  if (businessReject && body.error) recordExpectedBusinessRejection(response);
  check(response, {
    'order response is classified': () =>
      businessReject || response.status === 200 || response.status === 201,
  });
}
