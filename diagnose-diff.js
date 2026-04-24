const http = require('http');

async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'admin', password: 'admin123456' });
    const req = http.request({ hostname: '127.0.0.1', port: 3003, path: '/api/admin/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d).data.token));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fetch(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3003, path, headers: { Authorization: `Bearer ${token}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const token = await login();

  // 首页接口 - 获取所有数据
  const usersData = await fetch('/api/admin/dashboard/users?range=today', token);
  const users = usersData.data || [];

  // 按employeeId汇总首页数据
  const empStats = {};
  users.forEach(u => {
    if (!empStats[u.employeeId]) {
      empStats[u.employeeId] = { watched: 0, earnings: 0 };
    }
    empStats[u.employeeId].watched += u.watched;
    empStats[u.employeeId].earnings += u.earnings;
  });

  const homeRanking = Object.entries(empStats)
    .map(([eid, s]) => ({ employeeId: eid, watched: s.watched, earnings: s.earnings }))
    .sort((a, b) => b.earnings - a.earnings);

  // 排行榜接口
  const rankingData = await fetch('/api/ranking/today-ranking', token);
  const ranking = rankingData.data.ranking;

  console.log('=== 首页和排行榜对比 ===\n');

  // 只比较两个接口都有的employeeId
  const commonIds = homeRanking.slice(0, 10).map(r => r.employeeId);

  console.log('首页前10 vs 排行榜前10 的employeeId对比:');
  console.log('首页前10:', homeRanking.slice(0, 10).map(r => r.employeeId).join(', '));
  console.log('排行榜前10:', ranking.slice(0, 10).map(r => r.employeeId).join(', '));

  console.log('\n=== 详细对比 ===');
  console.log('排名 | 首页employeeId | 排行榜employeeId | 首页watched | 排行榜count');
  console.log('-----|----------------|------------------|-------------|------------');

  for (let i = 0; i < 10; i++) {
    const home = homeRanking[i];
    const rank = ranking[i];
    const homeEid = home ? home.employeeId : '-';
    const rankEid = rank ? rank.employeeId : '-';
    const homeWatched = home ? home.watched : '-';
    const rankCount = rank ? rank.count : '-';
    console.log(`${String(i+1).padStart(4)} | ${String(homeEid).padStart(15)} | ${String(rankEid).padStart(16)} | ${String(homeWatched).padStart(11)} | ${String(rankCount).padStart(12)}`);
  }

  // 找出在首页前10但不在排行榜前10的
  const homeTop10Ids = new Set(homeRanking.slice(0, 10).map(r => r.employeeId));
  const rankingTop10Ids = new Set(ranking.slice(0, 10).map(r => r.employeeId));

  console.log('\n=== 差异分析 ===');
  console.log('在首页前10但不在排行榜前10的:');
  homeRanking.slice(0, 10).forEach(r => {
    if (!rankingTop10Ids.has(r.employeeId)) {
      const rankItem = ranking.find(x => x.employeeId === r.employeeId);
      console.log(`  ${r.employeeId}: 首页watched=${r.watched}, 排行榜count=${rankItem?.count || 'N/A'}, 排行榜排名=${ranking.findIndex(x => x.employeeId === r.employeeId) + 1 || 'N/A'}`);
    }
  });

  console.log('\n在排行榜前10但不在首页前10的:');
  ranking.slice(0, 10).forEach(r => {
    if (!homeTop10Ids.has(r.employeeId)) {
      const homeItem = homeRanking.find(x => x.employeeId === r.employeeId);
      console.log(`  ${r.employeeId}: 首页watched=${homeItem?.watched || 0}, 首页排名=${homeRanking.findIndex(x => x.employeeId === r.employeeId) + 1 || 'N/A'}, 排行榜count=${r.count}`);
    }
  });
}

main().catch(console.error);