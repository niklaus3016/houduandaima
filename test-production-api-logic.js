const axios = require('axios');

// 生产环境API地址
const BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试账号：团队长 cuiding，密码 66668888
const loginData = {
  employeeId: 'cuiding',
  password: '66668888'
};

async function testProductionApiLogic() {
  try {
    console.log('=== 测试生产环境API逻辑 ===\n');

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

    // 2. 测试获取团队小组列表接口 - 详细调试
    console.log('2. 测试获取团队小组列表接口 (详细调试)...');

    // 直接测试API，看看返回什么
    const groupsResponse = await axios.get(`${BASE_URL}/admin/employee/team-leader/groups`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        teamId: userId,
        range: 'today'
      },
      timeout: 30000
    });

    console.log('响应状态:', groupsResponse.status);
    console.log('响应数据:');
    console.log(JSON.stringify(groupsResponse.data, null, 2));
    console.log('');

    // 3. 测试获取小组成员详情接口 - 对比数据
    console.log('3. 测试获取小组成员详情接口 (range=today, limit=100)...');

    const usersResponse = await axios.get(`${BASE_URL}/admin/dashboard/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        range: 'today',
        limit: 100
      },
      timeout: 60000
    });

    console.log('响应状态:', usersResponse.status);
    console.log('返回员工总数:', usersResponse.data.data?.length);
    if (usersResponse.data.data?.length > 0) {
      console.log('前5个员工:');
      usersResponse.data.data.slice(0, 5).forEach((user, i) => {
        console.log(`${i+1}. ${user.username}, group: ${user.group}, team: ${user.team}`);
      });
    }
    console.log('');

    console.log('=== 测试完成 ===');

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testProductionApiLogic();
