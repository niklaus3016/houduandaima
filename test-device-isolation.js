const axios = require('axios');

// 测试环境的API地址
const API_BASE = 'http://localhost:3003/api';

// 测试用户信息
const testUser = {
  userId: 'test_user_123',
  employeeId: '1234'
};

// 测试不同设备
const devices = [
  { deviceId: 'device_a', name: '设备A' },
  { deviceId: 'device_b', name: '设备B' }
];

// 测试发放金币接口（不同设备）
async function testReward(device) {
  console.log(`=== 测试 ${device.name} 发放金币 ===`);
  try {
    const response = await axios.post(`${API_BASE}/gold/reward`, {
      userId: testUser.userId,
      employeeId: testUser.employeeId,
      ecpm: 800,
      slotId: 'test_slot',
      deviceId: device.deviceId
    });
    
    console.log(`✅ ${device.name} 发放金币成功:`, response.data.data.gold);
    return response.data.data;
  } catch (error) {
    console.error(`❌ ${device.name} 发放金币失败:`, error.message);
    return null;
  }
}

// 测试获取金币记录接口（不同设备）
async function testLog(device) {
  console.log(`\n=== 测试 ${device.name} 获取金币记录 ===`);
  try {
    const response = await axios.get(`${API_BASE}/gold/log`, {
      params: {
        userId: testUser.userId,
        deviceId: device.deviceId,
        limit: 10
      }
    });
    
    console.log(`✅ ${device.name} 获取金币记录成功:`, response.data.data.length, '条记录');
    response.data.data.forEach((log, index) => {
      console.log(`  ${index + 1}. 时间: ${log.createTime}, 金币: ${log.gold}, 设备: ${log.deviceId}`);
    });
    return response.data.data;
  } catch (error) {
    console.error(`❌ ${device.name} 获取金币记录失败:`, error.message);
    return null;
  }
}

// 测试今日金币统计接口（全局）
async function testTodayStats() {
  console.log('\n=== 测试今日金币统计（全局）===');
  try {
    const response = await axios.get(`${API_BASE}/gold/today-stats`, {
      params: {
        userId: testUser.userId
      }
    });
    
    console.log('✅ 获取今日金币统计成功:');
    console.log(`  今日金币总数: ${response.data.data.todayCoins}`);
    console.log(`  今日记录数: ${response.data.data.todayRecordCount}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ 获取今日金币统计失败:', error.message);
    return null;
  }
}

// 运行所有测试
async function runTests() {
  console.log('开始测试多设备数据隔离...\n');
  
  // 为每个设备发放金币
  for (const device of devices) {
    await testReward(device);
  }
  
  // 为每个设备获取金币记录（应该只返回该设备的记录）
  for (const device of devices) {
    await testLog(device);
  }
  
  // 测试今日金币统计（应该返回所有设备的总和）
  await testTodayStats();
  
  console.log('\n多设备数据隔离测试完成！');
}

// 运行测试
runTests();