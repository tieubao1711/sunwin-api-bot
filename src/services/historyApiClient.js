const axios = require('axios');
const env = require('../config/env');

const client = axios.create({
  baseURL: 'http://103.82.135.143:3001',
  timeout: env.requestTimeoutMs
});

async function fetchLatestHistory(username, password) {
  const { data } = await client.get('/central-login-results/latest', {
    params: {
      username,
      password
    }
  });

  return data;
}

module.exports = { fetchLatestHistory };
