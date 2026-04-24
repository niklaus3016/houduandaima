const https = require('https');

function measureTime(name, url) {
  return new Promise((resolve) => {
    const start = Date.now();
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - start;
        resolve({ name, elapsed, status: res.statusCode, data: data.substring(0, 100) });
      });
    }).on('error', (err) => {
      resolve({ name, elapsed: -1, error: err.message });
    });
  });
}

async function main() {
  const baseUrl = 'https://wfqmaepvjkdd.sealoshzh.site/api';

  console.log('=== 首次请求（无缓存）===');
  const result1 = await measureTime('today-ranking', `${baseUrl}/ranking/today-ranking`);
  console.log(`响应时间: ${result1.elapsed}ms, 状态: ${result1.status}`);

  console.log('\n=== 第二次请求（有缓存）===');
  const result2 = await measureTime('today-ranking', `${baseUrl}/ranking/today-ranking`);
  console.log(`响应时间: ${result2.elapsed}ms, 状态: ${result2.status}`);

  console.log('\n=== 第三次请求（有缓存）===');
  const result3 = await measureTime('today-ranking', `${baseUrl}/ranking/today-ranking`);
  console.log(`响应时间: ${result3.elapsed}ms, 状态: ${result3.status}`);

  console.log('\n=== 对比 ===');
  console.log(`首次请求: ${result1.elapsed}ms`);
  console.log(`第二次请求: ${result2.elapsed}ms`);
  console.log(`第三次请求: ${result3.elapsed}ms`);
  console.log(`缓存提升: ${result1.elapsed > 0 && result2.elapsed > 0 ? ((result1.elapsed - result2.elapsed) / result1.elapsed * 100).toFixed(1) + '%' : 'N/A'}`);
}

main().catch(console.error);