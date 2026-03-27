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

// 测试新人列表API
async function testNewUsersApi() {
  try {
    console.log('测试新人列表API...');
    
    // 测试不同的路径
    const paths = [
      '/user/new-users?days=15',
      '/new-users?days=15',
      '/api/user/new-users?days=15',
      '/api/new-users?days=15'
    ];
    
    for (const path of paths) {
      try {
        const response = await axios.get(`${BASE_URL}${path}`, {
          headers: {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
          }
        });
        
        if (response.data.success) {
          const newUsers = response.data.data;
          console.log(`\n✅ 路径 ${path} 调用成功`);
          console.log(`返回用户数量: ${newUsers.length}`);
          
          // 查找3148
          const user3148 = newUsers.find(user => user.employeeId === '3148');
          if (user3148) {
            console.log(`\n✅ 找到3148用户:`);
            console.log(`   员工号: ${user3148.employeeId}`);
            console.log(`   姓名: ${user3148.realName || '未命名'}`);
            console.log(`   注册时间: ${user3148.createdAt || '未知'}`);
          } else {
            console.log(`\n❌ 未找到3148用户`);
          }
          
          // 显示前10个用户
          console.log(`\n前10个用户:`);
          newUsers.slice(0, 10).forEach((user, index) => {
            console.log(`${index + 1}. 员工号: ${user.employeeId} - 姓名: ${user.realName || '未命名'} - 注册时间: ${user.createdAt || '未知'}`);
          });
          
          return newUsers;
        } else {
          console.log(`\n❌ 路径 ${path} 调用失败:`, response.data.message);
        }
      } catch (error) {
        console.log(`\n❌ 路径 ${path} 调用错误:`, error.message);
      }
    }
    
  } catch (error) {
    console.log('❌ 测试错误:', error.message);
  }
}

// 运行测试
async function runTest() {
  console.log('开始测试新人列表API...\n');
  
  // 先登录获取token
  const loginSuccess = await login();
  
  if (loginSuccess) {
    await testNewUsersApi();
  }
}

runTest();
