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
  console.log('=== 调试 LoginRecord 查询问题 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  try {
    // 查询 /admin/dashboard/team-leader 接口
    console.log('查询 /admin/dashboard/team-leader 接口...');
    const dashboardResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const dashboardKpi = dashboardResponse.data.data.kpi;
    console.log(`\n   Dashboard activeUsers: ${dashboardKpi.activeUsers}`);
    console.log(`   Dashboard activeUsersGrowth: ${dashboardKpi.activeUsersGrowth}`);

    // 查询 yesterday 对比
    console.log('\n查询 yesterday 数据...');
    const yesterdayResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'yesterday' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const yesterdayKpi = yesterdayResponse.data.data.kpi;
    console.log(`   Yesterday activeUsers: ${yesterdayKpi.activeUsers}`);
    console.log(`   Yesterday activeUsersGrowth: ${yesterdayKpi.activeUsersGrowth}`);

    // 保存完整响应
    const debugResult = {
      today: {
        dashboardKpi: dashboardKpi
      },
      yesterday: {
        dashboardKpi: yesterdayKpi
      }
    };

    fs.writeFileSync('debug-activeusers.json', JSON.stringify(debugResult, null, 2));
    console.log('\n调试结果已保存到 debug-activeusers.json');

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
    if (error.response) {
      console.error('完整响应:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

runTests();
