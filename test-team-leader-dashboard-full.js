const axios = require('axios');

// 生产环境API地址
const BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试账号：团队长 cuiding，密码 66668888
const loginData = {
  employeeId: 'cuiding',
  password: '66668888'
};

async function testTeamLeaderDashboardFull() {
  try {
    console.log('=== 测试团队长dashboard接口（完整数据） ===\n');

    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, loginData, {
      timeout: 10000
    });

    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      console.log('登录响应:', loginResponse.data);
      return;
    }

    const token = loginResponse.data.token;
    const userId = loginResponse.data.user?.userId || loginResponse.data.user?.id;
    console.log('登录成功，用户ID:', userId);
    console.log('');

    // 2. 测试团队长dashboard接口 - today
    console.log('2. 测试团队长dashboard接口 (range=today)...');

    const startTime = Date.now();
    const dashboardResponse = await axios.get(`${BASE_URL}/admin/dashboard/team-leader`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        range: 'today'
      },
      timeout: 30000
    });
    const endTime = Date.now();

    console.log(`响应时间: ${endTime - startTime}ms`);
    console.log('完整响应数据:');
    console.log(JSON.stringify(dashboardResponse.data, null, 2));
    console.log('');

    console.log('=== 测试完成 ===');

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testTeamLeaderDashboardFull();
