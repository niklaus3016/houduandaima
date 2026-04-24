const axios = require('axios');

// 生产环境API地址
const BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试账号：团队长 cuiding，密码 66668888
const loginData = {
  employeeId: 'cuiding',
  password: '66668888'
};

async function testTeamLeaderCuiding() {
  try {
    console.log('=== 测试团队长cuiding的接口 ===\n');

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

    // 2. 测试获取团队小组列表接口 - today
    console.log('2. 测试获取团队小组列表接口 (range=today)...');

    const startTime1 = Date.now();
    const groupsResponse1 = await axios.get(`${BASE_URL}/admin/employee/team-leader/groups`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        teamId: userId,
        range: 'today'
      },
      timeout: 30000
    });
    const endTime1 = Date.now();

    console.log(`响应时间: ${endTime1 - startTime1}ms`);
    console.log('返回数据:');
    console.log(`  totalGroups: ${groupsResponse1.data.totalGroups}`);
    console.log(`  totalMembers: ${groupsResponse1.data.totalMembers}`);
    console.log(`  totalRevenue: ${groupsResponse1.data.totalRevenue}`);
    console.log(`  data数组长度: ${groupsResponse1.data.data?.length}`);
    if (groupsResponse1.data.data?.length > 0) {
      console.log('  各组详情:');
      groupsResponse1.data.data.forEach((group, i) => {
        console.log(`    ${i+1}. ${group.groupName}: ${group.memberCount}个成员`);
      });
    }
    console.log('');

    // 3. 测试获取小组成员详情接口 - 对比数据
    console.log('3. 测试获取小组成员详情接口 (range=today, limit=100)...');

    const startTime2 = Date.now();
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
    const endTime2 = Date.now();

    console.log(`响应时间: ${endTime2 - startTime2}ms`);
    console.log(`返回员工总数: ${usersResponse.data.data?.length}`);
    console.log('');

    console.log('=== 测试完成 ===');

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testTeamLeaderCuiding();
