const axios = require('axios');

async function test() {
  try {
    // 测试周目标接口
    const response = await axios.get('http://localhost:3003/admin/weekly-target/get');
    console.log('=== 周目标接口返回 ===');
    console.log(JSON.stringify(response.data, null, 2));

    // 也测试当前周数
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const year = beijingNow.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
    const daysToFirstMonday = (8 - dayOfWeek) % 7;
    const firstMonday = new Date(firstDayOfYear);
    firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
    const diffTime = beijingNow - firstMonday;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;
    const currentWeek = `${year}-${weekNumber.toString().padStart(2, '0')}`;

    console.log('\n=== 当前周数计算 ===');
    console.log('当前服务器时间:', now.toISOString());
    console.log('当前北京时间:', beijingNow.toISOString());
    console.log('当前周数:', currentWeek);
  } catch (err) {
    console.error('请求失败:', err.message);
  }
}

test();