const axios = require('axios');

async function test() {
  try {
    const baseUrl = 'https://wfqmaepvjkdd.sealoshzh.site/api';

    console.log('=== 测试周目标接口 ===');
    const response = await axios.get(`${baseUrl}/weeklyTarget/get`, {
      timeout: 10000
    });
    console.log('状态:', response.status);
    console.log('返回数据:', JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('请求失败:', err.message);
    if (err.response) {
      console.error('状态码:', err.response.status);
      console.error('返回数据:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

test();