const axios = require('axios');

// 线上API地址
const API_BASE = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试用户信息
const testUser = {
  userId: 'test_user_123',
  employeeId: '1234'
};

// 测试设备
const deviceA = 'device_a_123';
const deviceB = 'device_b_456';

// 测试发放金币
async function testReward(deviceId, ecpm) {
  try {
    const response = await axios.post(`${API_BASE}/gold/reward`, {
      userId: testUser.userId,
      employeeId: testUser.employeeId,
      ecpm: ecpm,
      slotId: 'test_slot',
      deviceId: deviceId
    });
    
    console.log(`✅ 设备 ${deviceId} 发放金币成功:`, response.data.data.gold);
    return response.data.data;
  } catch (error) {
    console.error(`❌ 设备 ${deviceId} 发放金币失败:`, error.response?.data?.message || error.message);
    return null;
  }
}

// 测试获取金币记录
async function testLog(deviceId) {
  try {
    const response = await axios.get(`${API_BASE}/gold/log`, {
      params: {
        userId: testUser.userId,
        deviceId: deviceId,
        limit: 10
      }
    });
    
    console.log(`✅ 设备 ${deviceId} 获取记录成功:`, response.data.data.length, '条');
    response.data.data.forEach((log, i) => {
      console.log(`  ${i+1}. 金币:${log.gold} 设备:${log.deviceId}`);
    });
    return response.data.data;
  } catch (error) {
    console.error(`❌ 设备 ${deviceId} 获取记录失败:`, error.response?.data?.message || error.message);
    return null;
  }
}

// 测试今日统计
async function testTodayStats() {
  try {
    const response = await axios.get(`${API_BASE}/gold/today-stats`, {
      params: {
        userId: testUser.userId
      }
    });
    
    console.log('✅ 今日统计成功:');
    console.log(`  今日金币: ${response.data.data.todayCoins}`);
    console.log(`  记录数: ${response.data.data.todayRecordCount}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ 今日统计失败:', error.response?.data?.message || error.message);
    return null;
  }
}

// 运行测试
async function runTests() {
  console.log('=== 测试多设备数据同步接口 ===\n');
  
  // 设备A发放金币
  await testReward(deviceA, 1000);
  
  // 设备B发放金币
  await testReward(deviceB, 800);
  
  console.log('\n--- 测试设备隔离 ---');
  
  // 设备A查看记录（应该只看到A的）
  await testLog(deviceA);
  
  // 设备B查看记录（应该只看到B的）
  await testLog(deviceB);
  
  console.log('\n--- 测试今日统计 ---');
  
  // 查看今日统计（应该看到所有设备的总和）
  await testTodayStats();
  
  console.log('\n=== 测试完成 ===');
}

runTests();
