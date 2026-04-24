const axios = require('axios');

const API_BASE_URL = 'http://127.0.0.1:3003/api';

async function login(username, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/admin/login`, {
      username,
      password
    });
    return response.data.data.token;
  } catch (error) {
    console.error(`登录失败 ${username}:`, error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('=== 检查时间范围计算 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  try {
    // 获取当前时间
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    console.log('当前时间:');
    console.log('  UTC:', now.toISOString());
    console.log('  北京时间:', beijingNow.toISOString());

    // 计算今天开始时间（北京时间 0 点）
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setUTCHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    console.log('\n今天开始时间:');
    console.log('  北京时间 0 点:', todayStartBeijing.toISOString());
    console.log('  转换为 UTC:', todayStartUTC.toISOString());

    // 测试不同 range 的 API 调用
    const ranges = ['today', 'yesterday', 'week', 'month'];
    for (const range of ranges) {
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
          params: { range: range },
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        console.log(`\n${range} 数据:`);
        console.log('  活跃用户:', response.data.data.kpi.activeUsers);
        console.log('  活跃用户增长:', response.data.data.kpi.activeUsersGrowth);
        console.log('  展示次数:', response.data.data.kpi.impressions);
      } catch (error) {
        console.log(`\n${range} 请求失败:`, error.response?.data || error.message);
      }
    }

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

runTests();
