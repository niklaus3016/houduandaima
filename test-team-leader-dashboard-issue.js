const axios = require('axios');

const baseURL = 'http://127.0.0.1:3003';
const username = 'cuiding';
const password = '66668888';

async function testTeamLeaderDashboard() {
  try {
    // 登录获取token
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      employeeId: username,
      password
    });
    
    console.log('登录响应:', loginResponse.data);
    
    if (!loginResponse.data.success) {
      console.error('登录失败:', loginResponse.data.message);
      return;
    }
    
    const token = loginResponse.data.token;
    if (!token) {
      console.error('登录成功但未获取到token');
      return;
    }
    console.log('登录成功，获取到token');
    console.log('token:', token);
    
    // 测试团队长dashboard接口
    const dashboardResponse = await axios.get(`${baseURL}/api/admin/dashboard/team-leader?range=today`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log('\n团队长dashboard接口响应:');
    console.log(JSON.stringify(dashboardResponse.data, null, 2));
    
    // 重点查看统计数据
    console.log('\n统计数据:');
    console.log('{');
    console.log('  "success":', dashboardResponse.data.success);
    console.log('  "data": {');
    console.log('    "totalRevenue":', dashboardResponse.data.data?.kpi?.teamUserRevenue);
    console.log('    "totalAds":', dashboardResponse.data.data?.kpi?.impressions);
    console.log('    "totalMembers":', dashboardResponse.data.data?.kpi?.activeUsers);
    console.log('    "teamLeadCommission":', dashboardResponse.data.data?.kpi?.teamLeadCommission);
    console.log('    "groupLeadersCommission":', dashboardResponse.data.data?.kpi?.groupLeadersCommission);
    console.log('    "teamUserRevenue":', dashboardResponse.data.data?.kpi?.teamUserRevenue);
    console.log('    "profitMargin":', dashboardResponse.data.data?.kpi?.profitMargin);
    console.log('  }');
    console.log('}');
    
  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testTeamLeaderDashboard();
