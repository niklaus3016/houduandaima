const axios = require('axios');

// 测试环境配置
const API_BASE_URL = 'http://localhost:3003/api';
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

// 登录获取token
async function login() {
  try {
    // 超管登录
    const adminResponse = await axios.post(`${API_BASE_URL}/auth/login`, adminUser);
    adminToken = adminResponse.data.token;
    console.log('超管登录成功');
    
    // 普通用户登录
    const userResponse = await axios.post(`${API_BASE_URL}/auth/login`, testUser);
    userToken = userResponse.data.token;
    console.log('普通用户登录成功');
  } catch (error) {
    console.error('登录失败:', error.response?.data || error.message);
    // 继续测试，不退出
  }
}

// 测试获取本周目标任务
async function testGetCurrentWeekTarget() {
  try {
    const response = await axios.get(`${API_BASE_URL}/weeklyTarget/get`);
    console.log('获取本周目标任务:', response.data);
  } catch (error) {
    console.error('获取本周目标任务失败:', error.response?.data || error.message);
  }
}

// 测试设置周目标任务
async function testSetWeeklyTarget() {
  try {
    const currentWeek = new Date().getFullYear() + '-' + (Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (24 * 60 * 60 * 1000) + new Date(new Date().getFullYear(), 0, 1).getDay() + 1) / 7).toString().padStart(2, '0');
    const response = await axios.post(`${API_BASE_URL}/weeklyTarget`, {
      week: currentWeek,
      targetCount: 100,
      bonusCoins: 50000
    }, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });
    console.log('设置周目标任务:', response.data);
  } catch (error) {
    console.error('设置周目标任务失败:', error.response?.data || error.message);
  }
}

// 测试获取月周目标数据
async function testGetMonthWeeklyTargets() {
  try {
    const currentMonth = new Date().toISOString().split('-').slice(0, 2).join('-');
    const response = await axios.get(`${API_BASE_URL}/weeklyTarget/month`, {
      params: {
        month: currentMonth
      }
    });
    console.log('获取月周目标数据:', response.data);
  } catch (error) {
    console.error('获取月周目标数据失败:', error.response?.data || error.message);
  }
}

// 测试获取周目标进度
async function testGetWeeklyProgress() {
  try {
    const response = await axios.get(`${API_BASE_URL}/weeklyBonus/progress`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    });
    console.log('获取周目标进度:', response.data);
  } catch (error) {
    console.error('获取周目标进度失败:', error.response?.data || error.message);
  }
}

// 测试领取周奖励
async function testClaimWeeklyBonus() {
  try {
    const response = await axios.post(`${API_BASE_URL}/weeklyBonus/claim`, {}, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    });
    console.log('领取周奖励:', response.data);
  } catch (error) {
    console.error('领取周奖励失败:', error.response?.data || error.message);
  }
}

// 测试用户信息接口
async function testGetUserInfo() {
  try {
    const response = await axios.get(`${API_BASE_URL}/user/info`, {
      params: {
        userId: 'user_1111_1678901234567',
        employeeId: '1111'
      }
    });
    console.log('获取用户信息:', response.data);
  } catch (error) {
    console.error('获取用户信息失败:', error.response?.data || error.message);
  }
}

// 运行所有测试
async function runTests() {
  console.log('开始测试周目标任务功能...');
  
  await login();
  await testGetCurrentWeekTarget();
  await testSetWeeklyTarget();
  await testGetMonthWeeklyTargets();
  await testGetWeeklyProgress();
  await testClaimWeeklyBonus();
  await testGetUserInfo();
  
  console.log('测试完成');
  process.exit(0);
}

runTests();
