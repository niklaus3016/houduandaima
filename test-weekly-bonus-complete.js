const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testWeeklyBonus() {
  try {
    // 1. 登录获取token
    console.log('========================================');
    console.log('步骤1：用户登录');
    console.log('========================================');
    const loginResponse = await axios.post(`${API_BASE_URL}/employee/check`, {
      employeeId: '1111'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ 登录成功，获取token\n');
    
    // 2. 查看周目标进度
    console.log('========================================');
    console.log('步骤2：查看周目标进度');
    console.log('========================================');
    const progressResponse = await axios.get(`${API_BASE_URL}/weeklyBonus/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('周目标进度:');
    console.log(`  目标条数: ${progressResponse.data.data.targetCount}`);
    console.log(`  已完成条数: ${progressResponse.data.data.currentCount}`);
    console.log(`  完成进度: ${progressResponse.data.data.progress}%`);
    console.log(`  奖励金币: ${progressResponse.data.data.bonusCoins}`);
    console.log(`  是否已领取: ${progressResponse.data.data.isClaimed ? '是' : '否'}\n`);
    
    // 3. 如果未领取且达到目标，领取奖励
    if (!progressResponse.data.data.isClaimed && progressResponse.data.data.currentCount >= progressResponse.data.data.targetCount) {
      console.log('========================================');
      console.log('步骤3：领取周奖励');
      console.log('========================================');
      
      const claimResponse = await axios.post(`${API_BASE_URL}/weeklyBonus/claim`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('✅ 领取成功');
      console.log(`  奖励金币: ${claimResponse.data.data.bonusCoins}\n`);
      
      // 4. 再次查看周目标进度
      console.log('========================================');
      console.log('步骤4：再次查看周目标进度');
      console.log('========================================');
      const progressResponse2 = await axios.get(`${API_BASE_URL}/weeklyBonus/progress`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('周目标进度:');
      console.log(`  是否已领取: ${progressResponse2.data.data.isClaimed ? '是' : '否'}\n`);
    } else if (progressResponse.data.data.isClaimed) {
      console.log('✅ 周奖励已领取，无需重复领取\n');
    } else {
      console.log('❌ 未达到目标条数，无法领取奖励\n');
    }
    
    // 5. 查看用户金币信息
    console.log('========================================');
    console.log('步骤5：查看用户金币信息');
    console.log('========================================');
    const userGoldResponse = await axios.get(`${API_BASE_URL}/user/gold`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('用户金币信息:');
    console.log(`  本月金币: ${userGoldResponse.data.data.currentMonthGold}`);
    console.log(`  上月金币: ${userGoldResponse.data.data.lastMonthGold}`);
    console.log(`  总金币: ${userGoldResponse.data.data.totalGold}\n`);
    
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testWeeklyBonus();
