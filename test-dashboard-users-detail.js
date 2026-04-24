const axios = require('axios');

// 本地API地址
const BASE_URL = 'http://127.0.0.1:3003/api';

// 测试账号：组长 fanjie，密码 11112222
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testDashboardUsers() {
  try {
    console.log('=== 测试 /admin/dashboard/users 接口 ===\n');

    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, loginData, {
      timeout: 10000
    });

    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      return;
    }

    const token = loginResponse.data.token;
    console.log('登录成功\n');

    // 2. 测试获取小组成员详情接口 - today
    console.log('2. 测试获取小组成员详情接口 (range=today, limit=100)...');

    const startTime = Date.now();
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
    const endTime = Date.now();

    console.log(`响应时间: ${endTime - startTime}ms`);
    console.log(`返回员工总数: ${usersResponse.data.data?.length}`);
    console.log('');

    // 统计teamGroupId分布
    const teamGroupIdCount = {};
    const groupNameCount = {};
    const allEmployeeIds = [];

    usersResponse.data.data?.forEach(user => {
      const tgId = user.teamGroupId || 'undefined';
      teamGroupIdCount[tgId] = (teamGroupIdCount[tgId] || 0) + 1;

      const gn = user.groupName || 'undefined';
      groupNameCount[gn] = (groupNameCount[gn] || 0) + 1;

      allEmployeeIds.push(user.employeeId);
    });

    console.log('teamGroupId分布:');
    Object.keys(teamGroupIdCount).forEach(tgId => {
      console.log(`  ${tgId}: ${teamGroupIdCount[tgId]}个员工`);
    });

    console.log('\ngroupName分布:');
    Object.keys(groupNameCount).forEach(gn => {
      console.log(`  ${gn}: ${groupNameCount[gn]}个员工`);
    });

    console.log('\n员工ID列表:');
    console.log(`  ${allEmployeeIds.join(', ')}`);

    console.log('\n=== 测试完成 ===');

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testDashboardUsers();
