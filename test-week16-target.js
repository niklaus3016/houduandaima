const axios = require('axios');

async function test() {
  try {
    const baseUrl = 'https://wfqmaepvjkdd.sealoshzh.site/api';

    console.log('=== 测试周目标接口 ===');
    const response = await axios.get(`${baseUrl}/weeklyTarget/get`, {
      timeout: 10000
    });
    console.log('返回数据:', JSON.stringify(response.data, null, 2));

    console.log('\n=== 查询第16周目标 ===');
    const response16 = await axios.get(`${baseUrl}/weeklyTarget/get?week=2026-16`, {
      timeout: 10000
    });
    console.log('第16周返回:', JSON.stringify(response16.data, null, 2));
  } catch (err) {
    console.error('请求失败:', err.message);
    if (err.response) {
      console.error('状态码:', err.response.status);
    }
  }
}

test();