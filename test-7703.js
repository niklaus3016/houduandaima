const GoldLog = require('./models/GoldLog');

// 北京时间2025-04-20 00:00:00 对应的UTC时间是 2025-04-19 16:00:00
// 北京时间2025-04-20 23:59:59 对应的UTC时间是 2025-04-20 15:59:59
const todayStart = new Date('2025-04-19T16:00:00.000Z');
const todayEnd = new Date('2025-04-20T15:59:59.999Z');

console.log('查询7703在2025-04-20的记录...');
console.log('开始时间:', todayStart);
console.log('结束时间:', todayEnd);

GoldLog.find({ 
  employeeId: '7703', 
  createTime: { $gte: todayStart, $lt: todayEnd } 
})
.then(logs => {
  console.log('7703今日记录数:', logs.length, '条');
  
  // 计算总金币
  const totalGold = logs.reduce((sum, log) => sum + log.gold, 0);
  console.log('7703今日总金币:', totalGold);
  console.log('7703今日平均金币:', logs.length > 0 ? (totalGold / logs.length).toFixed(2) : 0);
  
  // 检查排行榜接口返回的数据
  console.log('\n检查今日排行榜数据...');
  const http = require('http');
  const options = {
    hostname: 'localhost',
    port: 3010,
    path: '/api/ranking/today-ranking',
    method: 'GET'
  };
  
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log('排行榜数据:', JSON.stringify(result, null, 2));
        
        // 查找7703在排行榜中的位置
        const ranking = result.data.ranking;
        const employee7703 = ranking.find(item => item.employeeId === '7703');
        if (employee7703) {
          console.log('7703在排行榜中的位置:', ranking.indexOf(employee7703) + 1);
          console.log('7703的排行榜数据:', employee7703);
        } else {
          console.log('7703不在排行榜中');
        }
      } catch (error) {
        console.error('解析排行榜数据失败:', error);
      }
    });
  });
  
  req.on('error', (e) => {
    console.error('请求排行榜接口失败:', e);
  });
  
  req.end();
})
.catch(error => {
  console.error('查询7703记录失败:', error);
});