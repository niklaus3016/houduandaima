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

  console.log('=== 员工原始数据检查 ===\n');
  console.log(`员工数量: ${employees.length}\n`);

  console.log('--- 前5个员工数据 ---');
  employees.slice(0, 5).forEach((e, i) => {
    console.log(`\n员工${i+1}:`);
    console.log(`  _id: ${e._id}`);
    console.log(`  username: ${e.username}`);
    console.log(`  realName: ${e.realName}`);
    console.log(`  parentId: ${e.parentId}`);
    console.log(`  parentName: ${e.parentName}`);
  });

  const groupedEmployees = employees.filter(e => e.parentId && e.parentId !== '');
  console.log(`\n有parentId的员工: ${groupedEmployees.length}`);

  const employeesWithParentName = employees.filter(e => e.parentName && e.parentName !== '');
  console.log(`有parentName的员工: ${employeesWithParentName.length}`);
}

runTests();
