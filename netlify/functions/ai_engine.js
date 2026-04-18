// Load .env khi chạy local
require('dotenv').config();

// ─── Lịch chạy tự động: mỗi 1 giờ 1 lần (Netlify Scheduled Functions) ────────
// Cron syntax: "0 * * * *" = đúng phút 0 của mỗi giờ (00:00, 01:00, 02:00, ...)
// Tham khảo: https://docs.netlify.com/functions/scheduled-functions/
exports.config = {
    schedule: "0 * * * *"  // mỗi 1 giờ chạy 1 lần
};

const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');

// ─── 1. Khởi tạo Firebase ────────────────────────────────────────────────────
if (!admin.apps.length) {
    let serviceAccount;
    try {
        serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
            : require('../../serviceAccountKey.json');

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://j-b2103-default-rtdb.asia-southeast1.firebasedatabase.app"
        });
    } catch (e) {
        console.error("❌ Firebase Initialization Error:", e.message);
    }
}

const db = admin.database();



// ─── 3. Hàm push cảnh báo lên Firebase ──────────────────────────────────────
async function pushAlert(muc_do, thong_bao) {
    const now = new Date();
    const ngay_gio = now.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
    await db.ref('AI_De_Xuat').push({
        muc_do,
        thong_bao,
        ngay_gio,
        timestamp: Date.now()
    });
}

// ─── 4. Handler chính ────────────────────────────────────────────────────────
exports.handler = async (event, context) => {
    try {
        const logs = [];

        // Thu thập dữ liệu từ Firebase
        console.log("📡 Đang tải dữ liệu từ Firebase...");
        const [configSnap, telSnap, lshSnap, energySnap, labelSnap, controlSnap] = await Promise.all([
            db.ref('Config').once('value'),
            db.ref('SmartNode_01/telemetry').once('value'),
            db.ref('LichSuHeThong').limitToLast(50).once('value'),
            db.ref('SmartNode_01/history_energy').orderByChild('time').limitToLast(50).once('value'),
            db.ref('SmartNode_01/history_label').limitToLast(600).once('value'),
            db.ref('Control').once('value')
        ]);

        const config = configSnap.val() || {};
        const telemetry = telSnap.val() || {};

        const history = [];
        lshSnap.forEach(s => history.push(s.val()));

        const energyHistory = [];
        energySnap.forEach(s => energyHistory.push(s.val()));

        const labelHistory = [];
        labelSnap.forEach(s => labelHistory.push(s.val()));

        const control = controlSnap.val() || {};
        const isManual = (control.dieu_khien === true); // Trong script.js, true là thủ công, false là tự động

        console.log(`✅ Đã tải: ${history.length} log, ${energyHistory.length} năng lượng, ${labelHistory.length} nhãn. Chế độ thủ công: ${isManual}`);

        // ── KỊch bản HARDCODE: Tự tắt/chuyển tự động khi quên (10 phút) ────────
        if (isManual && labelHistory.length > 0) {
            // Tìm thời điểm gần nhất có người (label !== 0)
            let lastPresenceTime = 0;
            // time format: "DD/MM/YYYY HH:MM:SS"
            labelHistory.forEach(item => {
                if (item && item.label !== 0 && item.time) {
                    const parts = item.time.split(' ');
                    if (parts.length === 2) {
                        const [d, m, y] = parts[0].split('/');
                        const [H, M, S] = parts[1].split(':');
                        const ts = new Date(y, m - 1, d, H, M, S).getTime();
                        if (ts > lastPresenceTime) lastPresenceTime = ts;
                    }
                }
            });

            // Nếu không tìm thấy ai trong 30 bản ghi gần nhất thì dùng bản ghi cũ nhất làm mốc
            if (lastPresenceTime === 0 && labelHistory[0] && labelHistory[0].time) {
                const parts = labelHistory[0].time.split(' ');
                if (parts.length === 2) {
                    const [d, m, y] = parts[0].split('/');
                    const [H, M, S] = parts[1].split(':');
                    lastPresenceTime = new Date(y, m - 1, d, H, M, S).getTime();
                }
            }

            const nowTs = Date.now();
            const minutesSincePresence = (nowTs - lastPresenceTime) / (1000 * 60);

            // Nếu trạng thái hiện tại cũng là không có người và đã trôi qua hơn 10 phút
            const currentRadar = telemetry.ai ? telemetry.ai.label : 0;
            if (currentRadar == 0 && minutesSincePresence >= 10 && lastPresenceTime > 0) {
                // Tự động chuyển qua chế độ Auto
                await db.ref('Control/dieu_khien').set(false);
                logs.push(`[TỰ ĐỘNG] Chuyển đổi sang tự động do không có người quá ${Math.floor(minutesSincePresence)} phút.`);
                await pushAlert("Khẩn cấp", "AI đã tự động chuyển đèn về Tự động vì phát hiện bạn quên tắt đèn (không có người > 10 phút).");
            }
        }

        // ── Xây dựng prompt cho Gemini ─────────────────────────────────────
        const prompt = `Bạn là chuyên gia phân tích năng lượng cho hệ thống đèn thông minh SmartNode IoT (đèn tích hợp radar mmWave, tự điều chỉnh độ sáng theo hiện diện người và ánh sáng môi trường).

=== THÔNG SỐ CẤU HÌNH HIỆN TẠI ===
- Độ sáng khi có người (bright_active): ${config.bright_active ?? 'N/A'}%
- Độ sáng khi không có người (bright_no_person): ${config.bright_no_person ?? 'N/A'}%
- Thời gian chờ tắt (delay_off): ${config.delay_off ?? 'N/A'} giây
- Ngưỡng ánh sáng môi trường bật đèn (lux_threshold): ${config.lux_threshold ?? 'N/A'} lux
- Chế độ điều khiển: ${isManual ? '🔴 THỦ CÔNG (người dùng đang bật tay)' : '🟢 TỰ ĐỘNG'}

=== TELEMETRY HIỆN TẠI ===
- Độ sáng hiện tại: ${telemetry.brightness ?? 'N/A'}%
- Ánh sáng môi trường: ${telemetry.lux ?? 'N/A'} lux
- Trạng thái radar (label): ${telemetry.ai?.label ?? 'N/A'} (0=không có người, 1=có người)
- Công suất tiêu thụ hiện tại: ${telemetry.power ?? 'N/A'} W
- Tổng điện năng tích lũy: ${telemetry.energy ?? 'N/A'} kWh

=== PHÂN TÍCH LỊCH SỬ NĂNG LƯỢNG (${energyHistory.length} điểm gần nhất) ===
${(() => {
    if (!energyHistory.length) return 'Không có dữ liệu.';
    const powers = energyHistory.map(e => e.power).filter(p => p != null);
    const avg = powers.reduce((a, b) => a + b, 0) / powers.length;
    const max = Math.max(...powers);
    const min = Math.min(...powers);
    // Tìm các điểm bất thường: công suất cao nhưng label=0
    const wastePoints = energyHistory.filter(e => e.power > avg * 1.2 && e.label === 0);
    return `Công suất TB: ${avg.toFixed(1)}W | Max: ${max}W | Min: ${min}W
Số lần phát hiện lãng phí (công suất cao + không có người): ${wastePoints.length} lần`;
})()}

=== PHÂN TÍCH LỊCH SỬ RADAR (${labelHistory.length} bản ghi gần nhất) ===
${(() => {
    if (!labelHistory.length) return 'Không có dữ liệu.';
    const total = labelHistory.length;
    const withPerson = labelHistory.filter(l => l.label !== 0).length;
    const noPerson = total - withPerson;
    const occupancyRate = ((withPerson / total) * 100).toFixed(1);
    return `Tỷ lệ có người: ${occupancyRate}% (${withPerson}/${total} bản ghi)
Tỷ lệ không có người: ${(100 - parseFloat(occupancyRate)).toFixed(1)}% (${noPerson}/${total} bản ghi)`;
})()}

=== SỰ KIỆN HỆ THỐNG GẦN ĐÂY (${history.length} sự kiện) ===
${history.slice(-10).map(h => `[${h.time ?? '?'}] ${h.event ?? JSON.stringify(h)}`).join('\n')}

=== QUY TẮC PHÂN LOẠI MỨC ĐỘ ===
Áp dụng đúng theo tiêu chí sau:
- "Cảnh báo": Đang lãng phí điện RÕ RÀNG ngay lúc này (vd: đèn sáng >60% khi không có người, chế độ thủ công quên tắt, bright_no_person >40%).
- "Quan trọng": Cấu hình chưa tối ưu, có thể tiết kiệm >15% điện năng nếu điều chỉnh.
- "Thông tin": Gợi ý cải thiện nhỏ, tiết kiệm <15% hoặc chỉ là thói quen tốt.

=== NHIỆM VỤ ===
Thực hiện TỪNG BƯỚC sau (suy luận nội bộ, KHÔNG xuất ra):
Bước 1: Xác định các điểm lãng phí dựa trên số liệu thực tế ở trên.
Bước 2: Với mỗi điểm lãng phí, tính toán mức độ nghiêm trọng theo quy tắc phân loại.
Bước 3: Chọn TỐI ĐA 3 đề xuất có tác động lớn nhất, ưu tiên "Cảnh báo" trước.
Bước 4: Mỗi đề xuất phải nêu: con số hiện tại → con số đề xuất + lý do từ dữ liệu thực tế.

Chỉ xuất JSON thuần túy (không markdown, không giải thích), theo định dạng:
{
  "de_xuat": [
    { "muc_do": "Cảnh báo|Quan trọng|Thông tin", "thong_bao": "..." }
  ]
}`;

        // ── Gọi Gemini API bằng native fetch ───────────────────────────────
        console.log("🤖 Đang gọi Gemini API...");
        const apiKey = process.env.GEMINI_API_KEY;
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
        
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 1024
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Lỗi từ Gemini API: ${JSON.stringify(data.error || data)}`);
        }

        const rawText = data.candidates[0].content.parts[0].text.trim();
        console.log("📝 Gemini response raw:\n", rawText);



        // ── Parse JSON từ Gemini ────────────────────────────────────────────
        const cleanJson = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (!parsed.de_xuat || !Array.isArray(parsed.de_xuat)) {
            throw new Error("Gemini trả về định dạng không hợp lệ.");
        }

        // ── Push từng đề xuất lên Firebase ─────────────────────────────────
        console.log(`✨ Gemini đưa ra ${parsed.de_xuat.length} đề xuất. Đang push lên Firebase...`);
        for (const item of parsed.de_xuat) {
            await pushAlert(item.muc_do, item.thong_bao);
            const preview = item.thong_bao.substring(0, 60);
            logs.push(`[${item.muc_do}] ${preview}...`);
            console.log(` → Đã push: [${item.muc_do}] ${preview}`);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                status: "success",
                message: `Gemini AI đã phân tích và đưa ra ${parsed.de_xuat.length} đề xuất thông minh.`,
                logs
            })
        };

    } catch (error) {
        console.error("❌ Lỗi:", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

// ─── Ghi chú: Cách hoạt động ────────────────────────────────────────────────
// 1. Netlify tự động gọi hàm này mỗi 1 giờ (theo lịch cron ở trên)
// 2. Nguời dùng vẫn có thể gọi thủ công qua: GET /api/ai hoặc /.netlify/functions/ai_engine
// 3. Mỗi lần chạy: Đọc Firebase → Gọi Gemini → Push đề xuất vào AI_De_Xuat trên Firebase
