const http = require('http');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5OWQ1ZGZkYjM2NmZmOTk0YWI3M2Y4NSIsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoic3VwZXJhZG1pbiIsImlhdCI6MTc3NjYxNzUwNywiZXhwIjoxNzc2NzAzOTA3fQ.dB4YiuTTCljROtj2NLvkNt6Fpw5YSHgzoOMoztuwBdY';

function fetchApi(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3003,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== 获取首页接口数据 ===');
  const usersData = await fetchApi('/api/admin/dashboard/users?range=today');
  const users = usersData.data;

  // 找到7703
  const user7703 = users.find(u => u.employeeId === '7703');
  if (user7703) {
    console.log('7703在首页接口的数据:');
    console.log('  watched(条数):', user7703.watched);
    console.log('  earnings(金币):', user7703.earnings);
    console.log('  ecpm:', user7703.ecpm);
  } else {
    console.log('7703不在首页接口返回的数据中');
  }

  // 按employeeId汇总统计
  const empStats = {};
  users.forEach(u => {
    if (!empStats[u.employeeId]) {
      empStats[u.employeeId] = { watched: 0, earnings: 0 };
    }
    empStats[u.employeeId].watched += u.watched;
    empStats[u.employeeId].earnings += u.earnings;
  });

  // 排序
  const empRanking = Object.entries(empStats)
    .map(([employeeId, stats]) => ({ employeeId, ...stats }))
    .sort((a, b) => b.earnings - a.earnings);

  console.log('\n按employeeId汇总的前10名:');
  empRanking.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. employeeId: ${r.employeeId}, watched: ${r.watched}, earnings: ${r.earnings.toFixed(2)}`);
  });

  // 找到7703的排名
  const rank7703 = empRanking.findIndex(r => r.employeeId === '7703');
  console.log(`\n7703按employeeId汇总后的排名: ${rank7703 + 1}`);

  console.log('\n=== 获取排行榜接口数据 ===');
  const rankingData = await fetchApi('/api/ranking/today-ranking');
  const ranking = rankingData.data.ranking;

  console.log('排行榜接口返回的前10名:');
  ranking.forEach((r, i) => {
    console.log(`${i+1}. employeeId: ${r.employeeId}, earnings: ${r.earnings}, count: ${r.count}, avgGold: ${r.avgGold}`);
  });

  // 找到7703的排名
  const rank7703Ranking = ranking.findIndex(r => r.employeeId === '7703');
  console.log(`\n7703在排行榜接口中的排名: ${rank7703Ranking + 1}`);
}

main().catch(console.error);