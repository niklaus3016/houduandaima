const { uploadFile } = require('./services/storage');
const fs = require('fs');
const path = require('path');

async function testObjectStorage() {
  try {
    console.log('========================================');
    console.log('测试对象存储连接');
    console.log('========================================');
    
    // 创建测试文件
    const testFilePath = path.join(__dirname, 'test-storage.txt');
    fs.writeFileSync(testFilePath, 'Test file for object storage');
    console.log('✅ 测试文件创建成功');
    
    // 测试上传
    console.log('\n开始上传文件...');
    const objectName = 'test/test-file.txt';
    const fileUrl = await uploadFile(testFilePath, objectName);
    
    console.log('✅ 文件上传成功');
    console.log('文件URL:', fileUrl);
    
    // 清理测试文件
    fs.unlinkSync(testFilePath);
    console.log('\n✅ 测试文件清理完成');
    
    console.log('\n========================================');
    console.log('测试完成');
    console.log('========================================');
    
  } catch (error) {
    console.error('测试失败:', error);
    
    // 清理测试文件
    const testFilePath = path.join(__dirname, 'test-storage.txt');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

testObjectStorage();
