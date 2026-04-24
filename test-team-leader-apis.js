const axios = require('axios');

// 生产环境API地址
const BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试账号：组长 fanjie，密码 11112222
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testTeamLeaderAPIs() {
  try {
    console.log('=== 测试团队长相关接口 ===\n');

    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, loginData);

    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      return;
    }

    // 根据生产环境响应结构调整
    const token = loginResponse.data.token;
    const userId = loginResponse.data.user?.userId || loginResponse.data.user?.id;
    console.log('登录成功，用户ID:', userId);
    console.log('');

    // 2. 测试获取团队小组列表接口
    console.log('2. 测试获取团队小组列表接口...');
    console.log('API路径: /admin/employee/team-leader/groups');
    console.log('参数: teamId=', userId, ', range=today');

    const startTime1 = Date.now();
    const groupsResponse = await axios.get(`${BASE_URL}/admin/employee/team-leader/groups`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        teamId: userId,
        range: 'today'
      }
    });
    const endTime1 = Date.now();

    console.log(`响应时间: ${endTime1 - startTime1}ms`);
    console.log('返回数据:', JSON.stringify(groupsResponse.data, null, 2));
    console.log('');

    // 3. 测试获取小组成员详情接口
    console.log('3. 测试获取小组成员详情接口...');
    console.log('API路径: /admin/dashboard/users');
    console.log('参数: range=today, limit=100');

    const startTime2 = Date.now();
    const usersResponse = await axios.get(`${BASE_URL}/admin/dashboard/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        range: 'today',
        limit: 100
      }
    });
    const endTime2 = Date.now();

    console.log(`响应时间: ${endTime2}ms`);
    console.log(`返回数据条数: ${usersResponse.data.data.length}`);
    console.log('前3条数据:', JSON.stringify(usersResponse.data.data.slice(0, 3), null, 2));
    console.log('');

    console.log('=== 测试完成 ===');

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testTeamLeaderAPIs();
