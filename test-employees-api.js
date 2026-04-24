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

  const employeesRes = await axios.get(`${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`, { headers });
  const employees = employeesRes.data.data || [];

  console.log('=== 员工帐号接口测试 ===\n');
  console.log(`员工数量: ${employees.length}\n`);

  console.log('--- 前3个员工完整数据 ---');
  employees.slice(0, 3).forEach((e, i) => {
    console.log(`\n员工${i+1}:`);
    console.log(`  _id: ${e._id}`);
    console.log(`  username: ${e.username}`);
    console.log(`  realName: ${e.realName}`);
    console.log(`  role: ${e.role}`);
    console.log(`  status: ${e.status}`);
    console.log(`  employeeId: ${e.employeeId}`);
    console.log(`  phone: ${e.phone}`);
    console.log(`  region: ${e.region}`);
    console.log(`  teamName: ${e.teamName}`);
    console.log(`  groupName: ${e.groupName}`);
    console.log(`  parentId: ${e.parentId}`);
    console.log(`  parentName: ${e.parentName}`);
    console.log(`  createdAt: ${e.createdAt}`);
  });

  console.log('\n--- 有组别的员工统计 ---');
  const groupedEmployees = employees.filter(e => e.groupName && e.groupName !== '');
  console.log(`有组别: ${groupedEmployees.length}`);
  console.log(`无组别: ${employees.length - groupedEmployees.length}`);
}

runTests();
