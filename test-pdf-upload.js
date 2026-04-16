const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// 测试配置
const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';
const PASSWORD = '1111';

async function testPdfUpload() {
  console.log('========================================');
  console.log('测试PDF文件上传');
  console.log('========================================');

  try {
    // 步骤1：用户登录
    console.log('\n步骤1：用户登录');
    console.log('========================================');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      employeeId: EMPLOYEE_ID,
      password: PASSWORD
    });

    if (loginResponse.data.success) {
      console.log('✅ 用户登录成功');
      const token = loginResponse.data.token;

      // 步骤2：创建测试PDF文件
      console.log('\n步骤2：创建测试PDF文件');
      console.log('========================================');
      
      // 创建一个简单的PDF文件
      // 注意：这里创建的是一个简单的PDF文件结构，实际PDF文件需要使用专门的库生成
      // 为了测试，我们创建一个包含PDF文件头的文件
      const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/MediaBox [0 0 612 792]\n/Parent 2 0 R\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\n1 0 0 1 100 700 cm\nBT\n/F1 24 Tf\n(Test PDF File) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000110 00000 n \n0000000170 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\n%%EOF');
      
      const testPdfPath = '/home/devbox/project/test-invoice.pdf';
      fs.writeFileSync(testPdfPath, pdfContent);
      console.log('✅ 测试PDF文件创建成功');
      console.log('文件路径:', testPdfPath);
      console.log('文件大小:', fs.statSync(testPdfPath).size, '字节');

      // 步骤3：提交核销申请，上传PDF文件
      console.log('\n步骤3：提交核销申请，上传PDF文件');
      console.log('========================================');
      
      const formData = new FormData();
      formData.append('amount', '300');
      formData.append('alipayName', '测试用户');
      formData.append('alipayAccount', 'test@example.com');
      formData.append('invoiceFile', fs.createReadStream(testPdfPath));

      const submitResponse = await axios.post(`${API_BASE_URL}/verification/submit`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (submitResponse.data.success) {
        console.log('✅ 核销申请提交成功');
        console.log('验证ID:', submitResponse.data.verificationId);

        // 步骤4：获取最新核销记录，检查PDF文件是否成功上传
        console.log('\n步骤4：获取最新核销记录');
        console.log('========================================');
        
        const recordsResponse = await axios.get(`${API_BASE_URL}/verification/records`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params: {
            limit: 5
          }
        });

        if (recordsResponse.data.success) {
          console.log('\n最新5条核销记录:');
          console.log('========================================');

          recordsResponse.data.data.records.forEach((record, index) => {
            console.log(`\n记录 ${index + 1}:`);
            console.log(`ID: ${record.id}`);
            console.log(`金额: ${record.amount}`);
            console.log(`状态: ${record.status}`);
            console.log(`发票URL: ${record.invoiceUrl}`);
            console.log(`支付宝姓名: ${record.alipayName}`);
            console.log(`支付宝账号: ${record.alipayAccount}`);
          });

          // 检查最新记录的发票URL是否为阿里云OSS链接
          const latestRecord = recordsResponse.data.data.records[0];
          if (latestRecord) {
            console.log('\n========================================');
            console.log('检查最新记录的发票URL:');
            console.log(`最新记录ID: ${latestRecord.id}`);
            console.log(`发票URL: ${latestRecord.invoiceUrl}`);
            
            if (latestRecord.invoiceUrl.includes('yinsiurl.oss-cn-hangzhou.aliyuncs.com')) {
              console.log('✅ 最新记录的PDF发票已成功上传到阿里云OSS');
            } else if (latestRecord.invoiceUrl.startsWith('/uploads')) {
              console.log('⚠ 最新记录的PDF发票使用了本地存储');
            } else {
              console.log('❌ 最新记录的PDF发票URL格式不正确');
            }
          }

        } else {
          console.error('❌ 获取核销记录失败:', recordsResponse.data.message);
        }

      } else {
        console.error('❌ 提交核销申请失败:', submitResponse.data.message);
        console.error('错误详情:', submitResponse.data.error || '无');
      }

      // 清理测试文件
      console.log('\n步骤5：清理测试文件');
      console.log('========================================');
      if (fs.existsSync(testPdfPath)) {
        fs.unlinkSync(testPdfPath);
        console.log('✅ 测试文件清理完成');
      }

    } else {
      console.error('❌ 登录失败:', loginResponse.data.message);
    }

  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('响应头:', error.response.headers);
    } else if (error.request) {
      console.error('请求已发送但未收到响应:', error.request);
    } else {
      console.error('请求配置错误:', error.message);
      console.error('错误堆栈:', error.stack);
    }
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

testPdfUpload();
