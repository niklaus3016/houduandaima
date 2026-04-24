const axios = require('axios');

async function test() {
  try {
    // 公网地址
    const baseUrl = 'http://47.116.68.169:3003';

    const response = await axios.get(`${baseUrl}/admin/weekly-target/get`);
    console.log('=== 周目标接口返回 ===');
    console.log(JSON.stringify(response.data, null, 2));

    // 当前时间
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    console.log('\n当前时间:', beijingNow.toISOString(), '(北京时间)');
    console.log('当前周数: 2026-15 (第15周)');
    console.log('\n预期: 4月20日0点切换到第16周');
    console.log('第16周目标: 5000条, 奖励: 58888金币');
  } catch (err) {
    console.error('请求失败:', err.message);
  }
}

test();