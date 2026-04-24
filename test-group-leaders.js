const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function login(username, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/admin/login`, {
      username,
      password
    });
    return response.data.data.token;
  } catch (error) {
    console.error(`登录失败:`, error.message);
    return null;
  }
}

async function runTests() {
  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  // 获取团队列表，找到teamId
  const teamsResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader/teams`, { headers });
  const teamId = teamsResponse.data.data[0]?.id;
  console.log('团队ID:', teamId);

  // 获取组长列表
  console.log('\n=== 组长账号列表 ===');
  const groupLeadersRes = await axios.get(`${API_BASE_URL}/admin/employee/group-leaders-simple?teamId=${teamId}`, { headers });
  const groupLeaders = groupLeadersRes.data.data || [];
  
  console.log(`组长账号数量: ${groupLeaders.length}`);
  console.log('\n详细信息:');
  groupLeaders.forEach((leader, index) => {
    console.log(`\n组长${index + 1}:`);
    console.log(`  用户名: ${leader.username}`);
    console.log(`  真实姓名: ${leader.realName}`);
    console.log(`  状态: ${leader.status}`);
    console.log(`  组别: ${leader.groupName}`);
    console.log(`  提成比例: ${leader.commission}`);
    console.log(`  成员数量: ${leader.memberCount}`);
  });

  // 统计状态
  const statusCount = {};
  groupLeaders.forEach(leader => {
    statusCount[leader.status] = (statusCount[leader.status] || 0) + 1;
  });
  
  console.log('\n=== 状态统计 ===');
  Object.entries(statusCount).forEach(([status, count]) => {
    console.log(`${status === 'enabled' ? '已开通' : '待开通'}: ${count}个`);
  });

  process.exit(0);
}

runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
