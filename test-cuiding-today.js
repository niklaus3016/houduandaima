const axios = require('axios');
const fs = require('fs');

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
  console.log('=== 测试团队长账号 cuiding 今日返回值（本地测试） ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  try {
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const kpi = response.data.data.kpi;
    const result = {
      kpi: kpi,
      groupsCount: response.data.data.groups.length,
      usersCount: response.data.data.users?.length || 0,
      employeesCount: response.data.data.employees?.length || 0
    };

    console.log('KPI 数据:');
    console.log(`  - 收益 (revenue): ${kpi.revenue}`);
    console.log(`  - 收益增长 (revenueGrowth): ${kpi.revenueGrowth}%`);
    console.log(`  - 金币 (coins): ${kpi.coins}`);
    console.log(`  - 金币增长 (coinsGrowth): ${kpi.coinsGrowth}%`);
    console.log(`  - 展示次数 (impressions): ${kpi.impressions}`);
    console.log(`  - 展示增长 (impressionsGrowth): ${kpi.impressionsGrowth}%`);
    console.log(`  - 点击次数 (clicks): ${kpi.clicks}`);
    console.log(`  - 点击增长 (clicksGrowth): ${kpi.clicksGrowth}%`);
    console.log(`  - 利润率 (profitMargin): ${kpi.profitMargin}%`);
    console.log(`  - 利润率增长 (profitMarginGrowth): ${kpi.profitMarginGrowth}%`);
    console.log(`  - ECPM (ecpm): ${kpi.ecpm}`);
    console.log(`  - ECPM增长 (ecpmGrowth): ${kpi.ecpmGrowth}%`);
    console.log(`  - 活跃用户 (activeUsers): ${kpi.activeUsers}`);
    console.log(`  - 活跃用户增长 (activeUsersGrowth): ${kpi.activeUsersGrowth}%`);
    console.log(`  - 组数 (groups): ${result.groupsCount}`);
    console.log(`  - 用户数 (users): ${result.usersCount}`);
    console.log(`  - 员工数 (employees): ${result.employeesCount}`);

    fs.writeFileSync('cuiding-today-result.json', JSON.stringify(response.data, null, 2));
    console.log('\n完整响应已保存到 cuiding-today-result.json');
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

runTests();
