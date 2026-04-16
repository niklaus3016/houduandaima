const axios = require('axios');

// 测试配置
const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';
const PASSWORD = '1111';
const ADMIN_EMPLOYEE_ID = 'admin';
const ADMIN_PASSWORD = 'admin123456';

let userToken = '';
let adminToken = '';

async function testUserLogin() {
  console.log('========================================');
  console.log('测试用户登录');
  console.log('========================================');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      employeeId: EMPLOYEE_ID,
      password: PASSWORD
    });
    
    if (response.data.success) {
      userToken = response.data.token;
      console.log('✅ 用户登录成功，获取到token');
      return true;
    } else {
      console.error('❌ 用户登录失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 用户登录错误:', error.message);
    return false;
  }
}

async function testAdminLogin() {
  console.log('\n========================================');
  console.log('测试超管登录');
  console.log('========================================');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      employeeId: ADMIN_EMPLOYEE_ID,
      password: ADMIN_PASSWORD
    });
    
    if (response.data.success) {
      adminToken = response.data.token;
      console.log('✅ 超管登录成功，获取到token');
      return true;
    } else {
      console.error('❌ 超管登录失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 超管登录错误:', error.message);
    return false;
  }
}

async function testGetWelfareInfo() {
  console.log('\n========================================');
  console.log('测试获取福利抽奖信息');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/lottery/info`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      },
      params: {
        userId: '1',
        employeeId: EMPLOYEE_ID
      }
    });
    
    if (response.data.success) {
      console.log('✅ 获取福利抽奖信息成功');
      console.log('余额:', response.data.data.balance);
      console.log('抽奖机会:', response.data.data.chances);
      return true;
    } else {
      console.error('❌ 获取福利抽奖信息失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 获取福利抽奖信息错误:', error.message);
    return false;
  }
}

async function testGetPrizes() {
  console.log('\n========================================');
  console.log('测试获取奖品列表');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/lottery/prizes`);
    
    if (response.data.success) {
      console.log('✅ 获取奖品列表成功');
      console.log('奖品数量:', response.data.data.prizes.length);
      response.data.data.prizes.forEach(prize => {
        console.log(`- ${prize.name}: ${prize.probability}%`);
      });
      return true;
    } else {
      console.error('❌ 获取奖品列表失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 获取奖品列表错误:', error.message);
    return false;
  }
}

async function testClaimLottery() {
  console.log('\n========================================');
  console.log('测试领取福利抽奖');
  console.log('========================================');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/welfare/lottery/claim`, {
      userId: '1',
      employeeId: EMPLOYEE_ID
    }, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });
    
    if (response.data.success) {
      console.log('✅ 领取福利抽奖成功');
      console.log('中奖结果:', response.data.data.result);
      return true;
    } else {
      console.error('❌ 领取福利抽奖失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 领取福利抽奖错误:', error.message);
    return false;
  }
}

async function testGetLotteryRecords() {
  console.log('\n========================================');
  console.log('测试获取福利抽奖记录');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/lottery/records`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      },
      params: {
        userId: '1',
        employeeId: EMPLOYEE_ID
      }
    });
    
    if (response.data.success) {
      console.log('✅ 获取福利抽奖记录成功');
      console.log('记录数量:', response.data.data.records.length);
      if (response.data.data.records.length > 0) {
        console.log('最新记录:', response.data.data.records[0]);
      }
      return true;
    } else {
      console.error('❌ 获取福利抽奖记录失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 获取福利抽奖记录错误:', error.message);
    return false;
  }
}

async function testGetWalletBalance() {
  console.log('\n========================================');
  console.log('测试获取福利钱包余额');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/wallet/balance`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      },
      params: {
        userId: '1',
        employeeId: EMPLOYEE_ID
      }
    });
    
    if (response.data.success) {
      console.log('✅ 获取福利钱包余额成功');
      console.log('余额:', response.data.data.balance);
      return true;
    } else {
      console.error('❌ 获取福利钱包余额失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 获取福利钱包余额错误:', error.message);
    return false;
  }
}

async function testBindAlipay() {
  console.log('\n========================================');
  console.log('测试绑定支付宝信息');
  console.log('========================================');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/welfare/bind-alipay`, {
      userId: '1',
      employeeId: EMPLOYEE_ID,
      alipayName: '测试用户',
      alipayAccount: 'test@example.com'
    }, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });
    
    if (response.data.success) {
      console.log('✅ 绑定支付宝信息成功');
      console.log('支付宝信息:', response.data.data);
      return true;
    } else {
      console.error('❌ 绑定支付宝信息失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 绑定支付宝信息错误:', error.message);
    return false;
  }
}

async function testGetAlipay() {
  console.log('\n========================================');
  console.log('测试获取绑定的支付宝信息');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/get-alipay`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      },
      params: {
        userId: '1',
        employeeId: EMPLOYEE_ID
      }
    });
    
    if (response.data.success) {
      console.log('✅ 获取绑定的支付宝信息成功');
      console.log('支付宝信息:', response.data.data);
      return true;
    } else {
      console.error('❌ 获取绑定的支付宝信息失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 获取绑定的支付宝信息错误:', error.message);
    return false;
  }
}

async function testAdminGetPrizes() {
  console.log('\n========================================');
  console.log('测试超管获取所有奖品列表');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/admin/prizes`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    if (response.data.success) {
      console.log('✅ 超管获取所有奖品列表成功');
      console.log('奖品数量:', response.data.data.prizes.length);
      return true;
    } else {
      console.error('❌ 超管获取所有奖品列表失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 超管获取所有奖品列表错误:', error.message);
    return false;
  }
}

async function testAdminUpdatePrize() {
  console.log('\n========================================');
  console.log('测试超管调整奖品概率');
  console.log('========================================');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/welfare/admin/update-prize`, {
      id: '1',
      probability: 10
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    if (response.data.success) {
      console.log('✅ 超管调整奖品概率成功');
      console.log('更新结果:', response.data.data);
      return true;
    } else {
      console.error('❌ 超管调整奖品概率失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 超管调整奖品概率错误:', error.message);
    return false;
  }
}

async function testAdminGetWithdrawList() {
  console.log('\n========================================');
  console.log('测试超管获取待处理的提现申请列表');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/admin/withdraw/list`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    if (response.data.success) {
      console.log('✅ 超管获取待处理的提现申请列表成功');
      console.log('待处理提现数量:', response.data.data.withdrawals.length);
      return true;
    } else {
      console.error('❌ 超管获取待处理的提现申请列表失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 超管获取待处理的提现申请列表错误:', error.message);
    return false;
  }
}

async function testAdminGetWithdrawRecords() {
  console.log('\n========================================');
  console.log('测试超管获取所有提现记录');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/admin/withdraw/records`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    if (response.data.success) {
      console.log('✅ 超管获取所有提现记录成功');
      console.log('提现记录数量:', response.data.data.withdrawals.length);
      return true;
    } else {
      console.error('❌ 超管获取所有提现记录失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 超管获取所有提现记录错误:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('========================================');
  console.log('开始测试福利抽奖模块所有接口');
  console.log('========================================');
  
  let successCount = 0;
  let totalCount = 0;
  
  // 测试用户登录
  totalCount++;
  if (await testUserLogin()) successCount++;
  
  // 测试超管登录
  totalCount++;
  if (await testAdminLogin()) successCount++;
  
  // 测试用户接口
  totalCount++;
  if (await testGetWelfareInfo()) successCount++;
  
  totalCount++;
  if (await testGetPrizes()) successCount++;
  
  totalCount++;
  if (await testClaimLottery()) successCount++;
  
  totalCount++;
  if (await testGetLotteryRecords()) successCount++;
  
  totalCount++;
  if (await testGetWalletBalance()) successCount++;
  
  totalCount++;
  if (await testBindAlipay()) successCount++;
  
  totalCount++;
  if (await testGetAlipay()) successCount++;
  
  // 测试超管接口
  totalCount++;
  if (await testAdminGetPrizes()) successCount++;
  
  totalCount++;
  if (await testAdminUpdatePrize()) successCount++;
  
  totalCount++;
  if (await testAdminGetWithdrawList()) successCount++;
  
  totalCount++;
  if (await testAdminGetWithdrawRecords()) successCount++;
  
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`总测试数: ${totalCount}`);
  console.log(`成功数: ${successCount}`);
  console.log(`失败数: ${totalCount - successCount}`);
  console.log(`成功率: ${(successCount / totalCount * 100).toFixed(2)}%`);
  
  if (successCount === totalCount) {
    console.log('✅ 所有接口测试成功！');
  } else {
    console.log('❌ 部分接口测试失败，需要检查修复');
  }
}

runAllTests();
