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
  console.log('=== 详细调试 LoginRecord 查询问题 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  try {
    // 查询 today 数据
    console.log('1. 查询 today 数据...');
    const todayResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const todayKpi = todayResponse.data.data.kpi;
    console.log(`   today activeUsers: ${todayKpi.activeUsers}`);
    console.log(`   today activeUsersGrowth: ${todayKpi.activeUsersGrowth}`);

    // 查询 yesterday 数据
    console.log('\n2. 查询 yesterday 数据...');
    const yesterdayResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'yesterday' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const yesterdayKpi = yesterdayResponse.data.data.kpi;
    console.log(`   yesterday activeUsers: ${yesterdayKpi.activeUsers}`);
    console.log(`   yesterday activeUsersGrowth: ${yesterdayKpi.activeUsersGrowth}`);

    // 对比两个时间范围的数据
    console.log('\n3. 数据对比:');
    console.log(`   today impressions: ${todayKpi.impressions}, yesterday impressions: ${yesterdayKpi.impressions}`);
    console.log(`   today clicks: ${todayKpi.clicks}, yesterday clicks: ${yesterdayKpi.clicks}`);
    console.log(`   today coins: ${todayKpi.coins}, yesterday coins: ${yesterdayKpi.coins}`);
    console.log(`   today revenue: ${todayKpi.revenue}, yesterday revenue: ${yesterdayKpi.revenue}`);

    // 如果 yesterday 有活跃用户但 today 没有，说明问题在时间范围计算
    if (yesterdayKpi.activeUsers > 0 && todayKpi.activeUsers === 0) {
      console.log('\n4. 结论: yesterday 有活跃用户但 today 没有，问题可能在时间范围计算');
    } else if (todayKpi.activeUsers === 0 && yesterdayKpi.activeUsers === 0) {
      console.log('\n4. 结论: 两个时间范围都没有活跃用户，问题可能在 LoginRecord 查询条件');
    }

    // 保存完整响应用于分析
    const debugResult = {
      today: {
        kpi: todayKpi,
        employeesCount: todayResponse.data.data.employees?.length || 0,
        groupsCount: todayResponse.data.data.groups?.length || 0
      },
      yesterday: {
        kpi: yesterdayKpi,
        employeesCount: yesterdayResponse.data.data.employees?.length || 0,
        groupsCount: yesterdayResponse.data.data.groups?.length || 0
      }
    };

    fs.writeFileSync('debug-activeusers-detail.json', JSON.stringify(debugResult, null, 2));
    console.log('\n调试结果已保存到 debug-activeusers-detail.json');

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

runTests();
