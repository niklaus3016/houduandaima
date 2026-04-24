const axios = require('axios');

async function test() {
  try {
    const baseUrl = 'https://wfqmaepvjkdd.sealoshzh.site/api';
    const response = await axios.get(`${baseUrl}/weeklyTarget/get?week=2026-16`, { timeout: 10000 });
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('请求失败:', err.message);
  }
}

test();