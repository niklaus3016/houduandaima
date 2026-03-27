const axios = require('axios');

// 服务器地址
const BASE_URL = 'http://localhost:3003/api';

// 测试用的管理员token
let ADMIN_TOKEN = '';

// 测试接口列表
const API_TESTS = [
  // 金币相关接口
  {
    name: '获取金币记录',
    method: 'GET',
    url: '/gold/log',
    params: { userId: 'user_8202_1772466028893', employeeId: '8202' },
    requiresAuth: false
  },
  
  // 员工管理接口
  {
    name: '获取员工列表',
    method: 'GET',
    url: '/employee/list',
    requiresAuth: true
  },
  
  // 团队管理接口
  {
    name: '获取团队列表',
    method: 'GET',
    url: '/admin/team/list',
    requiresAuth: true
  },
  
  // 新用户接口
  {
    name: '获取新用户列表',
    method: 'GET',
    url: '/admin/newuser/list',
    requiresAuth: true
  },
  
  // 管理员接口
  {
    name: '获取组长提成记录',
    method: 'GET',
    url: '/admin/group-leader-commission/69b983ac05e593e7e7e4b431',
    requiresAuth: true
  },
  
  // 仪表盘接口
  {
    name: '获取KPI指标',
    method: 'GET',
    url: '/admin/dashboard/kpi',
    requiresAuth: true
  },
  
  // 预警接口
  {
    name: '获取异常列表',
    method: 'GET',
    url: '/admin/alert/list',
    requiresAuth: true
  },
  
  // 用户收益接口
  {
    name: '获取用户收益详情',
    method: 'GET',
    url: '/admin/user/user_8202_1772466028893/earnings',
    requiresAuth: true
  },
  
  // 登录记录接口
  {
    name: '获取用户登录统计',
    method: 'GET',
    url: '/user/login-stats',
    params: { userId: 'user_8202_1772466028893', employeeId: '8202' },
    requiresAuth: false
  },
  
  // 健康检查接口
  {
    name: '健康检查',
    method: 'GET',
    url: '/health',
    requiresAuth: false
  },
  
  // 根路径健康检查
  {
    name: '根路径健康检查',
    method: 'GET',
    url: '/',
    requiresAuth: false
  }
];

// 登录获取token
async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/account/login`, {
      username: 'cuiding',
      password: '123456' // 默认密码
    });
    
    if (response.data.success && response.data.token) {
      ADMIN_TOKEN = response.data.token;
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

// 测试单个接口
async function testApi(apiTest) {
  try {
    const config = {
      method: apiTest.method,
      url: apiTest.url === '/' ? 'http://localhost:3003' : `${BASE_URL}${apiTest.url}`,
      params: apiTest.params,
      headers: {}
    };

    // 添加认证头
    if (apiTest.requiresAuth && ADMIN_TOKEN) {
      config.headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`;
    }

    const response = await axios(config);
    
    if (response.data.success || response.status === 200) {
      console.log(`✅ ${apiTest.name}: 成功`);
      return { success: true, message: '接口正常' };
    } else {
      console.log(`❌ ${apiTest.name}: 失败 - ${response.data.message}`);
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    console.log(`❌ ${apiTest.name}: 错误 - ${error.message}`);
    return { success: false, message: error.message };
  }
}

// 测试所有接口
async function testAllApis() {
  console.log('开始测试所有API接口...\n');
  
  // 先登录获取token
  await login();
  
  const results = [];
  
  for (const apiTest of API_TESTS) {
    const result = await testApi(apiTest);
    results.push({ name: apiTest.name, ...result });
  }
  
  console.log('\n=== 测试结果汇总 ===');
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  console.log(`总测试接口数: ${totalCount}`);
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${totalCount - successCount}`);
  
  if (totalCount - successCount > 0) {
    console.log('\n失败的接口:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`- ${r.name}: ${r.message}`);
    });
  }
}

// 运行测试
testAllApis();