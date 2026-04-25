const axios = require('axios');
const env = require('../config/env');

const client = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.requestTimeoutMs,
  headers: {
    'Content-Type': 'application/json'
  }
});

async function fetchAccountInfo(username, password) {
  const { data } = await client.post('/account/info', { username, password });
  return data;
}

async function fetchTransactions(accessToken, options = {}) {
  const { data } = await client.post('/account/transactions', {
    accessToken,
    limit: options.limit || 5,
    skip: options.skip || 0,
    assetName: options.assetName || 'gold'
  });
  return data;
}

async function fetchSlipHistory(accessToken, options = {}) {
  const { data } = await client.post('/account/slip-history', {
    accessToken,
    slipType: options.slipType || 1,
    limit: options.limit || 5,
    skip: options.skip || 0
  });
  return data;
}

async function changePassword(accessToken, oldPassword, newPassword) {
  const { data } = await client.post('/account/change-password', {
    accessToken,
    oldPassword,
    newPassword
  });
  console.log(data);
  return data;
}

module.exports = {
  fetchAccountInfo,
  fetchTransactions,
  fetchSlipHistory,
  changePassword
};
