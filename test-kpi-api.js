const axios = require('axios');

// 生产环境API地址
const BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试用的管理员token
let ADMIN_TOKEN = '';

// 登录获取token
async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/admin/login`, {
      username: 'admin',
      password: 'admin123'
    });
    
    if (response.data.success && response.data.data?.token) {
      ADMIN_TOKEN = response.data.data.token;
      console.log('✅ 登录成功，获取到token');
      return true;
    } else {
      console.log('❌ 登录失败');
      return false;
    }
  } catch (error) {
    console.log('❌ 登录错误:', error.message);
    return false;
  }
}

// 测试KPI接口
async function testKpiApi(range) {
  try {
    // 添加随机参数来绕过缓存
    const randomParam = Math.random().toString(36).substring(2, 15);
    const url = range 
      ? `${BASE_URL}/admin/dashboard/kpi?range=${range}&_=${randomParam}` 
      : `${BASE_URL}/admin/dashboard/kpi?_=${randomParam}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    if (response.data.success) {
      const data = response.data.data;
      console.log(`✅ ${range || '默认'} 时间范围KPI接口调用成功`);
      console.log('  今日活跃用户数:', data.activeUsers);
      console.log('  活跃用户增长率:', data.activeUsersGrowth, '%');
      
      // 计算昨日活跃用户数
      const yesterdayActiveUsers = data.activeUsersGrowth > 0 
        ? Math.round(data.activeUsers / (1 + data.activeUsersGrowth / 100))
        : Math.round(data.activeUsers / (1 - Math.abs(data.activeUsersGrowth) / 100));
      
      console.log('  计算的昨日活跃用户数:', yesterdayActiveUsers);
      console.log('  其他数据:');
      console.log('    收益:', data.revenue, '元');
      console.log('    金币:', data.coins);
      console.log('    展示数:', data.impressions);
      console.log('    点击数:', data.clicks);
      
      return data;
    } else {
      console.log(`❌ ${range || '默认'} 时间范围KPI接口调用失败:`, response.data.message);
      return null;
    }
  } catch (error) {
    console.log(`❌ ${range || '默认'} 时间范围KPI接口调用错误:`, error.message);
    return null;
  }
}

// 运行测试
async function runTest() {
  console.log('开始测试KPI接口...\n');
  
  // 先登录获取token
  const loginSuccess = await login();
  
  if (loginSuccess) {
    console.log('\n=== 测试默认时间范围 ===');
    await testKpiApi();
    
    console.log('\n=== 测试今日时间范围 ===');
    await testKpiApi('today');
    
    console.log('\n=== 测试昨日时间范围 ===');
    await testKpiApi('yesterday');
    
    console.log('\n=== 测试本周时间范围 ===');
    await testKpiApi('week');
    
    console.log('\n=== 测试本月时间范围 ===');
    await testKpiApi('month');
  }
}

runTest();