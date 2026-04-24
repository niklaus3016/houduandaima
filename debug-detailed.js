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
    // 先登录获取员工信息
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const employees = response.data.data.employees;
    const employeeIds = employees.map(e => e.employeeId);
    
    console.log('1. 团队长下的员工数量:', employeeIds.length);
    console.log('2. 员工ID示例:', employeeIds.slice(0, 10));
    
    // 打印请求中使用的查询参数
    console.log('\n3. 请求参数:');
    console.log('   - range: today');
    console.log('   - employeeIds 数量:', employeeIds.length);
    console.log('   - employeeIds 示例:', employeeIds.slice(0, 5));

    console.log('\n4. LoginRecord 查询条件:');
    console.log('   - loginDate: { $gte: todayStart, $lt: beijingNow }');
    console.log('   - employeeId: { $in:', employeeIds.slice(0, 5), '... }');
    
    console.log('\n5. 响应中的 KPI 数据:');
    console.log('   - activeUsers:', response.data.data.kpi.activeUsers);
    console.log('   - activeUsersGrowth:', response.data.data.kpi.activeUsersGrowth);

    console.log('\n6. 对比 yesterday 的 activeUsers:', response.data.data.kpi.activeUsers);

    // 检查是否有缓存问题
    console.log('\n7. 完整响应数据:');
    fs.writeFileSync('debug-detailed.json', JSON.stringify(response.data, null, 2));
    console.log('   已保存到 debug-detailed.json');

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

runTests();
