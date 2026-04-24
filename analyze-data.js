const http = require('http');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5OWQ1ZGZkYjM2NmZmOTk0YWI3M2Y4NSIsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoic3VwZXJhZG1pbiIsImlhdCI6MTc3NjYxNzUwNywiZXhwIjoxNzc2NzAzOTA3fQ.dB4YiuTTCljROtj2NLvkNt6Fpw5YSHgzoOMoztuwBdY';

async function fetch(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 3003, path, headers: { Authorization: `Bearer ${token}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const usersData = await fetch('/api/admin/dashboard/users?range=today');
  const users = usersData.data || [];

  console.log('总用户数:', users.length);

  const u7703 = users.find(u => u.employeeId === '7703');
  console.log('\n7703在users数组中的数据:');
  console.log('  watched:', u7703.watched);
  console.log('  earnings:', u7703.earnings);
  console.log('  ecpm:', u7703.ecpm);

  const empStats = {};
  users.forEach(u => {
    if (!empStats[u.employeeId]) {
      empStats[u.employeeId] = { watched: 0, earnings: 0 };
    }
    empStats[u.employeeId].watched += u.watched;
    empStats[u.employeeId].earnings += u.earnings;
  });

  const r7703 = empStats['7703'];
  console.log('\n按employeeId汇总7703:');
  console.log('  watched:', r7703.watched);
  console.log('  earnings:', r7703.earnings.toFixed(2));

  const ranking = Object.entries(empStats)
    .map(([eid, s]) => ({ employeeId: eid, ...s }))
    .sort((a, b) => b.earnings - a.earnings);

  const rank7703 = ranking.findIndex(r => r.employeeId === '7703');
  console.log('\n7703按employeeId汇总后的排名:', rank7703 + 1);

  console.log('\n前10名:');
  ranking.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: watched=${r.watched}, earnings=${r.earnings.toFixed(2)}`);
  });

  console.log('\n=== 排行榜接口 ===');
  const rankingData = await fetch('/api/ranking/today-ranking');
  const rankingList = rankingData.data.ranking;
  rankingList.forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: count=${r.count}, earnings=${r.earnings}`);
  });

  const rank7703Api = rankingList.findIndex(r => r.employeeId === '7703');
  console.log('\n7703在排行榜接口中的排名:', rank7703Api + 1);
}

main().catch(console.error);