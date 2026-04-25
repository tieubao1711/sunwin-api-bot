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

async function getRechargeStats(startAt, endAt) {
  const collection = await getCollection('recharge_orders');
  const [summary] = await collection.aggregate([
    {
      $match: {
        status: 'success',
        $or: [
          { completedAt: { $gte: startAt, $lt: endAt } },
          {
            completedAt: { $exists: false },
            updatedAt: { $gte: startAt, $lt: endAt }
          },
          {
            completedAt: null,
            updatedAt: { $gte: startAt, $lt: endAt }
          }
        ]
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: {
          $sum: {
            $ifNull: ['$chargeAmount', '$amount']
          }
        },
        totalOrders: { $sum: 1 },
        firstCompletedAt: { $min: { $ifNull: ['$completedAt', '$updatedAt'] } },
        lastCompletedAt: { $max: { $ifNull: ['$completedAt', '$updatedAt'] } }
      }
    }
  ]).toArray();

  const byBank = await collection.aggregate([
    {
      $match: {
        status: 'success',
        $or: [
          { completedAt: { $gte: startAt, $lt: endAt } },
          {
            completedAt: { $exists: false },
            updatedAt: { $gte: startAt, $lt: endAt }
          },
          {
            completedAt: null,
            updatedAt: { $gte: startAt, $lt: endAt }
          }
        ]
      }
    },
    {
      $group: {
        _id: {
          $ifNull: ['$selectedBank.name', '$selectedBank.code']
        },
        totalAmount: {
          $sum: {
            $ifNull: ['$chargeAmount', '$amount']
          }
        },
        totalOrders: { $sum: 1 }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]).toArray();

  return {
    totalAmount: summary?.totalAmount || 0,
    totalOrders: summary?.totalOrders || 0,
    firstCompletedAt: summary?.firstCompletedAt || null,
    lastCompletedAt: summary?.lastCompletedAt || null,
    byBank: byBank.map((item) => ({
      bank: item._id || 'Không rõ',
      totalAmount: item.totalAmount || 0,
      totalOrders: item.totalOrders || 0
    }))
  };
}

module.exports = {
  createRechargeOrder,
  getRechargeOrder,
  markBankSelected,
  markRechargeCallback,
  markCallbackNotified,
  getRechargeStats
};
