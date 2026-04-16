const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testPrizes() {
  console.log('========================================');
  console.log('测试获取奖品列表');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/lottery/prizes`);
    
    if (response.data.success) {
      console.log('✅ 获取奖品列表成功');
      console.log('奖品数量:', response.data.data.prizes.length);
      console.log('\n奖品列表:');
      response.data.data.prizes.forEach(prize => {
        console.log(`${prize.id}. ${prize.name}: ${prize.value}元 (${prize.probability}%)`);
      });
      
      // 计算总概率
      const totalProbability = response.data.data.prizes.reduce((sum, prize) => sum + prize.probability, 0);
      console.log(`\n总概率: ${totalProbability}%`);
    } else {
      console.error('❌ 获取奖品列表失败:', response.data.message);
    }
  } catch (error) {
    console.error('❌ 获取奖品列表错误:', error.message);
  }
}

testPrizes();
