const axios = require('axios');

// 公网接口地址
const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试账号
const accounts = {
  admin: {
    username: 'admin',
    password: 'admin123456'
  },
  teamLeader1: {
    username: 'huangzhenhui',
    password: '66668888'
  },
  teamLeader2: {
    username: 'cuiding',
    password: '66668888'
  },
  groupLeader: {
    username: 'fanjie',
    password: '11112222'
  }
};

// 时间范围
const ranges = ['today', 'yesterday', 'week', 'month'];

// 登录获取token
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

// 测试API
async function testAPI(token, range, description) {
  try {
    const start = Date.now();
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const end = Date.now();
    const time = end - start;
    
    console.log(`${description} - ${range}:`);
    console.log(`  响应时间: ${time}ms`);
    console.log(`  成功: ${response.data.success}`);
    if (response.data.data && response.data.data.kpi) {
      console.log(`  KPI数据: 收益 ${response.data.data.kpi.revenue}, 活跃用户 ${response.data.data.kpi.activeUsers}`);
    }
    if (response.data.data && response.data.data.groups) {
      console.log(`  组数: ${response.data.data.groups.length}`);
    }
    console.log('');
    return time;
  } catch (error) {
    console.error(`${description} - ${range} 测试失败:`, error.response?.data || error.message);
    console.log('');
    return null;
  }
}

// 主测试函数
async function runTests() {
  console.log('=== 开始测试仪表盘性能 ===\n');
  
  // 测试超管账号
  console.log('--- 测试超管账号 (admin) ---');
  const adminToken = await login(accounts.admin.username, accounts.admin.password);
  if (adminToken) {
    for (const range of ranges) {
      await testAPI(adminToken, range, '超管');
    }
  }
  
  // 测试团队长账号 cuiding
  console.log('--- 测试团队长账号 (cuiding) ---');
  const cuidingToken = await login(accounts.teamLeader2.username, accounts.teamLeader2.password);
  if (cuidingToken) {
    for (const range of ranges) {
      await testAPI(cuidingToken, range, '团队长 cuiding');
    }
  }
  
  // 测试团队长账号 huangzhenhui
  console.log('--- 测试团队长账号 (huangzhenhui) ---');
  const huangzhenhuiToken = await login(accounts.teamLeader1.username, accounts.teamLeader1.password);
  if (huangzhenhuiToken) {
    for (const range of ranges) {
      await testAPI(huangzhenhuiToken, range, '团队长 huangzhenhui');
    }
  }
  
  // 测试组长账号
  console.log('--- 测试组长账号 (fanjie) ---');
  const fanjieToken = await login(accounts.groupLeader.username, accounts.groupLeader.password);
  if (fanjieToken) {
    for (const range of ranges) {
      await testAPI(fanjieToken, range, '组长 fanjie');
    }
  }
  
  console.log('=== 测试完成 ===');
}

// 运行测试
runTests();
