const { getCollection } = require('../db/mongo');

async function createRechargeOrder(order) {
  const collection = await getCollection('recharge_orders');
  const now = new Date();
  const doc = {
    ...order,
    status: 'pending_bank',
    callbackNotified: false,
    createdAt: now,
    updatedAt: now
  };

  await collection.insertOne(doc);
  return doc;
}

async function getRechargeOrder(requestId) {
  const collection = await getCollection('recharge_orders');
  return collection.findOne({ requestId });
}

async function markBankSelected(requestId, bank, apiResponse) {
  const collection = await getCollection('recharge_orders');
  const now = new Date();
  await collection.updateOne(
    { requestId },
    {
      $set: {
        status: 'waiting_payment',
        selectedBank: bank,
        rechargeResponse: apiResponse,
        rechargeData: apiResponse?.data || null,
        updatedAt: now
      }
    }
  );

  return collection.findOne({ requestId });
}

async function markRechargeCallback(requestId, callbackPayload) {
  const collection = await getCollection('recharge_orders');
  const before = await collection.findOne({ requestId });
  if (!before) return null;

  const callbackStatus = callbackPayload.status || 'unknown';
  const now = new Date();

  await collection.updateOne(
    { requestId },
    {
      $set: {
        status: callbackStatus === 'success' ? 'success' : callbackStatus,
        callbackPayload,
        chargeId: callbackPayload.chargeId ? Number(callbackPayload.chargeId) : before.chargeId,
        chargeCode: callbackPayload.chargeCode || before.chargeCode,
        chargeAmount: callbackPayload.chargeAmount ? Number(callbackPayload.chargeAmount) : before.chargeAmount,
        updatedAt: now,
        completedAt: callbackStatus === 'success' ? now : before.completedAt
      }
    }
  );

  const after = await collection.findOne({ requestId });
  return { before, after };
}

async function markCallbackNotified(requestId) {
  const collection = await getCollection('recharge_orders');
  await collection.updateOne(
    { requestId },
    {
      $set: {
        callbackNotified: true,
        notifiedAt: new Date()
      }
    }
  );
}

module.exports = {
  createRechargeOrder,
  getRechargeOrder,
  markBankSelected,
  markRechargeCallback,
  markCallbackNotified
};
