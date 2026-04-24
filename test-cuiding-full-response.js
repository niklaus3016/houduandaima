const axios = require('axios');
const fs = require('fs');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const outputFile = 'cuiding-test-results.json';

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

async function testAPI(token, range, description) {
  try {
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return {
      range,
      data: response.data
    };
  } catch (error) {
    console.error(`${description} - ${range} 测试失败:`, error.response?.data || error.message);
    return {
      range,
      error: error.response?.data || error.message
    };
  }
}

async function runTests() {
  console.log('=== 测试团队长账号 cuiding 各时间范围返回值 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  const ranges = ['today', 'yesterday', 'week', 'month'];
  const results = {};

  for (const range of ranges) {
    console.log(`正在测试 ${range}...`);
    const result = await testAPI(token, range, '团队长 cuiding');
    results[range] = result;
  }

  // 保存到文件
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n测试结果已保存到 ${outputFile}`);

  // 打印摘要
  console.log('\n=== 测试结果摘要 ===\n');
  for (const range of ranges) {
    const result = results[range];
    if (result.error) {
      console.log(`${range}: 失败 - ${result.error}`);
    } else {
      const kpi = result.data.data.kpi;
      console.log(`${range}:`);
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
      console.log(`  - 组数 (groups): ${result.data.data.groups.length}`);
      console.log(`  - 用户数 (users): ${result.data.data.users?.length || 0}`);
      console.log(`  - 员工数 (employees): ${result.data.data.employees?.length || 0}`);
      console.log('');
    }
  }

  console.log('\n=== 测试完成 ===');
}

runTests();
