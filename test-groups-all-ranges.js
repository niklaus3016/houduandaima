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
    console.error(`登录失败:`, error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('=== 测试不同 range 的 groups 数据 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  const ranges = ['today', 'yesterday', 'week', 'month'];

  for (const range of ranges) {
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
        params: { range: range },
        headers: { Authorization: `Bearer ${token}` }
      });

      const groups = response.data.data.groups;
      const totalTodayRevenue = groups.reduce((sum, g) => sum + g.todayRevenue, 0);
      const totalMonthlyRevenue = groups.reduce((sum, g) => sum + g.monthlyRevenue, 0);
      const totalYesterdayRevenue = groups.reduce((sum, g) => sum + g.yesterdayRevenue, 0);

      console.log(`\n=== ${range.toUpperCase()} ===`);
      console.log(`今日收益汇总: ${totalTodayRevenue.toFixed(2)}`);
      console.log(`昨日收益汇总: ${totalYesterdayRevenue.toFixed(2)}`);
      console.log(`本月收益汇总: ${totalMonthlyRevenue.toFixed(2)}`);

    } catch (error) {
      console.error(`${range} 请求失败:`, error.response?.data || error.message);
    }
  }
}

runTests();
