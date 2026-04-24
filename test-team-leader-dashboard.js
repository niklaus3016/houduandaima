const axios = require('axios');

const API_BASE = 'http://127.0.0.1:3003/api';
const testUser = {
  username: 'cuiding',
  password: '66668888'
};

async function testTeamLeaderDashboard() {
  console.log('=== 测试团队长仪表盘接口 ===\n');
  
  // 1. 登录获取token
  console.log('1. 测试登录');
  let token;
  try {
    const response = await axios.post(`${API_BASE}/admin/login`, testUser);
    if (response.data.success) {
      token = response.data.data.token;
      console.log('✅ 登录成功');
    } else {
      console.log('❌ 登录失败:', response.data.message);
      return;
    }
  } catch (error) {
    console.log('❌ 登录请求失败:', error.message);
    return;
  }
  
  // 2. 测试不同时间范围的接口响应
  const ranges = ['today', 'yesterday', 'week', 'month'];
  
  for (const range of ranges) {
    console.log(`\n3. 测试 /admin/dashboard/team-leader?range=${range} 响应时间`);
    try {
      const startTime = Date.now();
      const response = await axios.get(`${API_BASE}/admin/dashboard/team-leader`, {
        params: { range },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      if (response.data.success) {
        console.log(`✅ 响应时间: ${responseTime}ms`);
        console.log(`KPI数据:`, JSON.stringify(response.data.data.kpi, null, 2));
      } else {
        console.log('❌ 接口失败:', response.data.message);
      }
    } catch (error) {
      console.log('❌ 请求失败:', error.message);
    }
  }
  
  console.log('\n=== 测试完成 ===');
}

testTeamLeaderDashboard();