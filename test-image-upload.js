const { uploadFile } = require('./services/storage');
const fs = require('fs');
const path = require('path');

// 测试上传图片文件
async function testImageUpload() {
  try {
    // 创建一个简单的测试图片文件（PNG格式）
    const testImagePath = path.join(__dirname, 'test-image.png');
    
    // 创建一个简单的PNG图片文件（1x1像素，黑色）
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdrChunk = Buffer.from([
      0x00, 0x00, 0x00, 0x0D, // Chunk length
      0x49, 0x48, 0x44, 0x52, // Chunk type: IHDR
      0x00, 0x00, 0x00, 0x01, // Width: 1
      0x00, 0x00, 0x00, 0x01, // Height: 1
      0x08, // Bit depth: 8
      0x06, // Color type: RGB with alpha
      0x00, // Compression method: deflate
      0x00, // Filter method: adaptive
      0x00, // Interlace method: none
      0x78, 0xDA, 0x63, 0x00 // CRC
    ]);
    const idatChunk = Buffer.from([
      0x00, 0x00, 0x00, 0x0C, // Chunk length
      0x49, 0x44, 0x41, 0x54, // Chunk type: IDAT
      0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x04, 0x00, 0x01, 0x05, 0x01, 0x02, 0x01, // Compressed data
      0x11, 0x00, // CRC
    ]);
    const iendChunk = Buffer.from([
      0x00, 0x00, 0x00, 0x00, // Chunk length
      0x49, 0x45, 0x4E, 0x44, // Chunk type: IEND
      0xAE, 0xB6, 0x41, 0x4C // CRC
    ]);
    
    const pngBuffer = Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
    fs.writeFileSync(testImagePath, pngBuffer);
    
    console.log('创建测试图片成功:', testImagePath);
    
    // 测试上传图片
    console.log('开始测试图片上传...');
    const objectName = `test-image-${Date.now()}.png`;
    const result = await uploadFile(testImagePath, objectName);
    
    console.log('上传结果:', result);
    console.log('图片上传测试成功！');
    console.log('请在阿里云OSS控制台查看文件:', objectName);
    
    // 清理测试文件
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('清理测试文件成功');
    }
    
  } catch (error) {
    console.error('测试图片上传失败:', error);
    
    // 清理测试文件
    const testImagePath = path.join(__dirname, 'test-image.png');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  }
}

// 运行测试
testImageUpload();