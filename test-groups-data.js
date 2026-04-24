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
  console.log('=== 检查 API groups 数据 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  try {
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: { Authorization: `Bearer ${token}` }
    });

    const groups = response.data.data.groups;
    console.log(`groups 数量: ${groups.length}\n`);

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      console.log(`--- 组 ${i + 1}: ${g.name} ---`);
      console.log(`  ID: ${g.id}`);
      console.log(`  teamId: ${g.teamId}`);
      console.log(`  teamName: ${g.teamName}`);
      console.log(`  memberCount(员工数): ${g.memberCount}`);
      console.log(`  todayActive(今日活跃): ${g.todayActive}`);
      console.log(`  todayRevenue(今日收益): ${g.todayRevenue}`);
      console.log(`  yesterdayRevenue(昨日收益): ${g.yesterdayRevenue}`);
      console.log(`  monthlyRevenue(月收益): ${g.monthlyRevenue}`);
      console.log(`  todayAdCount(今日广告): ${g.todayAdCount}`);
      console.log(`  avgEcpm: ${g.avgEcpm}`);
      console.log('');
    }

    // 统计汇总
    const totalTodayRevenue = groups.reduce((sum, g) => sum + g.todayRevenue, 0);
    const totalYesterdayRevenue = groups.reduce((sum, g) => sum + g.yesterdayRevenue, 0);
    const totalMonthlyRevenue = groups.reduce((sum, g) => sum + g.monthlyRevenue, 0);
    const totalTodayActive = groups.reduce((sum, g) => sum + g.todayActive, 0);

    console.log('=== 汇总数据 ===');
    console.log(`今日收益汇总: ${totalTodayRevenue.toFixed(2)}`);
    console.log(`昨日收益汇总: ${totalYesterdayRevenue.toFixed(2)}`);
    console.log(`本月收益汇总: ${totalMonthlyRevenue.toFixed(2)}`);
    console.log(`今日活跃汇总: ${totalTodayActive}`);

  } catch (error) {
    console.error('请求失败:', error.response?.data || error.message);
  }
}

runTests();
