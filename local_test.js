const { handler } = require('./netlify/functions/ai_engine.js');

(async () => {
    console.log("🚀 Bắt đầu quét dữ liệu AI Engine locally...");
    const result = await handler(null, null);
    console.log("\n📦 KẾT QUẢ TỪ AI ENGINE:");
    console.log(JSON.stringify(result, null, 2));

    const body = JSON.parse(result.body);
    if (body.logs && body.logs.length > 0) {
        console.log("\n✅ Đã phát hiện và đẩy các cảnh báo sau lên Firebase:");
        body.logs.forEach(l => console.log(" -", l));
        console.log("\n👉 Hãy mở Web Dashboard hoặc file xem.json lên để xem Đề xuất mới xuất hiện!");
    } else {
        console.log("\n🤔 Hệ thống không phát hiện bất thường nào khớp với 4 kịch bản ở thời điểm hiện tại.");
    }
    
    // Process exit to close firebase connections
    process.exit(0);
})();
