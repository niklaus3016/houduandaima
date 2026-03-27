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

// 检查UserGold表中是否有3148
async function checkUserGold3148() {
  try {
    console.log('检查UserGold表中是否有3148...');
    
    // 检查金币记录接口
    const goldLogResponse = await axios.get(`${BASE_URL}/admin/gold/log`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      },
      params: {
        employeeId: '3148',
        page: 1,
        pageSize: 10
      }
    });
    
    if (goldLogResponse.data.success) {
      const goldLogs = goldLogResponse.data.data;
      const total = goldLogResponse.data.pagination.total;
      console.log(`\n1. 金币记录中找到 ${total} 条3148的记录:`);
      goldLogs.forEach(log => {
        console.log(`   - 时间: ${new Date(log.createTime).toLocaleString()} - 金币: ${log.gold}`);
      });
    } else {
      console.log('\n1. 金币记录中没有3148的记录');
    }
    
    // 检查用户列表接口
    const userListResponse = await axios.get(`${BASE_URL}/admin/dashboard/users`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      },
      params: {
        page: 1,
        pageSize: 50
      }
    });
    
    if (userListResponse.data.success) {
      const users = userListResponse.data.data;
      console.log(`\n2. 仪表板用户列表中找到 ${users.length} 个用户:`);
      
      // 查找3148
      const user3148 = users.find(user => user.employeeId === '3148');
      if (user3148) {
        console.log(`   找到3148: ${user3148.employeeId} - ${user3148.realName} - 金币: ${user3148.earnings}`);
      } else {
        console.log('   没有找到3148');
      }
      
      // 显示所有用户的员工号
      console.log('\n   所有用户的员工号:');
      users.forEach(user => {
        console.log(`   - ${user.employeeId} - ${user.realName}`);
      });
    }
    
  } catch (error) {
    console.log('❌ 检查错误:', error.message);
  }
}

// 运行检查
async function runCheck() {
  console.log('开始检查UserGold表中的3148...\n');
  
  // 先登录获取token
  const loginSuccess = await login();
  
  if (loginSuccess) {
    await checkUserGold3148();
  }
}

runCheck();
