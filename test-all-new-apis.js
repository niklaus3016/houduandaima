const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// 生产环境配置
const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
let adminToken = '';
let userToken = '';

// 测试用户信息
const testUser = {
  employeeId: '1111',
  password: '123456'
};

const adminUser = {
  employeeId: 'admin',
  password: 'admin123456'
};

// 辅助函数：打印测试结果
function printTestResult(testName, success, data = null, error = null) {
  if (success) {
    console.log(`✅ ${testName} - 成功`);
    if (data) {
      console.log('   返回数据:', JSON.stringify(data, null, 2));
    }
  } else {
    console.log(`❌ ${testName} - 失败`);
    if (error) {
      console.log('   错误信息:', error);
    }
  }
  console.log('');
}

// 测试1：用户登录
async function testUserLogin() {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, testUser);
    userToken = response.data.token;
    printTestResult('用户登录', true, { token: userToken ? '已获取' : '未获取' });
    return true;
  } catch (error) {
    printTestResult('用户登录', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试2：超管登录
async function testAdminLogin() {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, adminUser);
    adminToken = response.data.token;
    printTestResult('超管登录', true, { token: adminToken ? '已获取' : '未获取' });
    return true;
  } catch (error) {
    printTestResult('超管登录', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试3：获取用户金币信息
async function testGetUserGold() {
  try {
    const response = await axios.get(`${API_BASE_URL}/user/gold`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    printTestResult('获取用户金币信息', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取用户金币信息', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试4：获取核销记录
async function testGetVerificationRecords() {
  try {
    const response = await axios.get(`${API_BASE_URL}/verification/records`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    printTestResult('获取核销记录', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取核销记录', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试5：获取待处理核销申请
async function testGetPendingVerifications() {
  try {
    const response = await axios.get(`${API_BASE_URL}/verification/admin/pending`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    printTestResult('获取待处理核销申请', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取待处理核销申请', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试6：获取核销统计
async function testGetVerificationStats() {
  try {
    const response = await axios.get(`${API_BASE_URL}/verification/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    printTestResult('获取核销统计', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取核销统计', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试7：获取用户金币详情（超管）
async function testGetUserGoldDetail() {
  try {
    const response = await axios.get(`${API_BASE_URL}/gold/admin/user/${testUser.employeeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    printTestResult('获取用户金币详情', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取用户金币详情', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试8：获取本周目标任务
async function testGetCurrentWeekTarget() {
  try {
    const response = await axios.get(`${API_BASE_URL}/weeklyTarget/get`);
    printTestResult('获取本周目标任务', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取本周目标任务', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试9：设置周目标任务
async function testSetWeeklyTarget() {
  try {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    const currentWeek = `${now.getFullYear()}-${weekNumber.toString().padStart(2, '0')}`;
    
    const response = await axios.post(`${API_BASE_URL}/weeklyTarget`, {
      week: currentWeek,
      targetCount: 100,
      bonusCoins: 50000
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    printTestResult('设置周目标任务', true, response.data);
    return true;
  } catch (error) {
    printTestResult('设置周目标任务', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试10：获取月周目标数据
async function testGetMonthWeeklyTargets() {
  try {
    const currentMonth = new Date().toISOString().split('-').slice(0, 2).join('-');
    const response = await axios.get(`${API_BASE_URL}/weeklyTarget/month`, {
      params: { month: currentMonth }
    });
    printTestResult('获取月周目标数据', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取月周目标数据', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试11：获取周目标进度
async function testGetWeeklyProgress() {
  try {
    const response = await axios.get(`${API_BASE_URL}/weeklyBonus/progress`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    printTestResult('获取周目标进度', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取周目标进度', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 测试12：获取用户信息（包含周目标）
async function testGetUserInfo() {
  try {
    const response = await axios.get(`${API_BASE_URL}/user/info`, {
      params: {
        userId: `user_${testUser.employeeId}_${Date.now()}`,
        employeeId: testUser.employeeId
      }
    });
    printTestResult('获取用户信息（包含周目标）', true, response.data);
    return true;
  } catch (error) {
    printTestResult('获取用户信息（包含周目标）', false, null, error.response?.data?.message || error.message);
    return false;
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('========================================');
  console.log('开始测试昨天新做的所有接口');
  console.log('========================================\n');
  
  let passCount = 0;
  let failCount = 0;
  
  // 登录测试
  if (await testUserLogin()) passCount++; else failCount++;
  if (await testAdminLogin()) passCount++; else failCount++;
  
  // 手机核销模块测试
  if (await testGetUserGold()) passCount++; else failCount++;
  if (await testGetVerificationRecords()) passCount++; else failCount++;
  if (await testGetPendingVerifications()) passCount++; else failCount++;
  if (await testGetVerificationStats()) passCount++; else failCount++;
  if (await testGetUserGoldDetail()) passCount++; else failCount++;
  
  // 周目标任务模块测试
  if (await testGetCurrentWeekTarget()) passCount++; else failCount++;
  if (await testSetWeeklyTarget()) passCount++; else failCount++;
  if (await testGetMonthWeeklyTargets()) passCount++; else failCount++;
  if (await testGetWeeklyProgress()) passCount++; else failCount++;
  if (await testGetUserInfo()) passCount++; else failCount++;
  
  // 打印测试总结
  console.log('========================================');
  console.log('测试总结');
  console.log('========================================');
  console.log(`✅ 通过: ${passCount} 个`);
  console.log(`❌ 失败: ${failCount} 个`);
  console.log(`📊 成功率: ${((passCount / (passCount + failCount)) * 100).toFixed(2)}%`);
  console.log('========================================\n');
  
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
runAllTests();
