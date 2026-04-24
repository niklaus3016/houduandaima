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
    console.error(`登录失败:`, error.response?.data || error.message);
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

  const teamsResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader/teams`, { headers });
  const teamId = teamsResponse.data.data[0]?.id;

  console.log('=== 员工账号接口测试 ===\n');
  
  const startTime = Date.now();
  const employeesRes = await axios.get(`${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`, { headers });
  const endTime = Date.now();
  
  const employees = employeesRes.data.data || [];
  
  console.log(`响应时间: ${endTime - startTime}ms`);
  console.log(`员工数量: ${employees.length}\n`);

  console.log('--- 前5个员工数据（含 zeroEarningsDays）---');
  employees.slice(0, 5).forEach((e, i) => {
    console.log(`\n员工${i+1}:`);
    console.log(`  username: ${e.username}`);
    console.log(`  realName: ${e.realName}`);
    console.log(`  teamName: ${e.teamName}`);
    console.log(`  groupName: ${e.groupName}`);
    console.log(`  zeroEarningsDays: ${e.zeroEarningsDays}`);
  });

  console.log('\n--- 各筛选条件统计 ---');
  const normal = employees.filter(e => (e.zeroEarningsDays || 0) < 3).length;
  const threeToSeven = employees.filter(e => (e.zeroEarningsDays || 0) >= 3 && (e.zeroEarningsDays || 0) <= 7).length;
  const sevenToFifteen = employees.filter(e => (e.zeroEarningsDays || 0) > 7 && (e.zeroEarningsDays || 0) <= 15).length;
  const overFifteen = employees.filter(e => (e.zeroEarningsDays || 0) > 15).length;

  console.log(`正常账号（< 3天）: ${normal}`);
  console.log(`3-7天0收益: ${threeToSeven}`);
  console.log(`7-15天0收益: ${sevenToFifteen}`);
  console.log(`超过15天0收益: ${overFifteen}`);
  console.log(`总计: ${normal + threeToSeven + sevenToFifteen + overFifteen}`);

  console.log('\n--- 连续0收益天数分布 ---');
  const daysDistribution = {};
  employees.forEach(e => {
    const days = e.zeroEarningsDays || 0;
    daysDistribution[days] = (daysDistribution[days] || 0) + 1;
  });
  
  Object.entries(daysDistribution)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .forEach(([days, count]) => {
      console.log(`  ${days}天: ${count}人`);
    });
}

runTests();
