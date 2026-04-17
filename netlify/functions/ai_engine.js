// Load .env khi chạy local
require('dotenv').config();

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
            db.ref('SmartNode_01/history_label').limitToLast(30).once('value'),
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
        const prompt = `Bạn là hệ thống AI phân tích thiết bị chiếu sáng thông minh SmartNode IoT.
Thiết bị là đèn thông minh tích hợp radar mmWave, điều chỉnh độ sáng tự động theo hiện diện người và điều kiện ánh sáng môi trường.

=== DỮ LIỆU THỜI GIAN THỰC ===
Cấu hình hệ thống (Config):
${JSON.stringify(config, null, 2)}

Telemetry hiện tại:
${JSON.stringify(telemetry, null, 2)}

=== LỊCH SỬ HOẠT ĐỘNG GẦN NHẤT (tối đa 50 sự kiện) ===
${JSON.stringify(history, null, 2)}

=== LỊCH SỬ TIÊU THỤ ĐIỆN NĂNG (tối đa 50 điểm) ===
${JSON.stringify(energyHistory, null, 2)}

=== LỊCH SỬ NHÃN RADAR AI (tối đa 30 bản ghi) ===
${JSON.stringify(labelHistory, null, 2)}

=== MỤC TIÊU CỐT LÕI: TIẾT KIỆM ĐIỆN NĂNG ===
Bạn phải phân tích dữ liệu trên để tìm ra sự LÃNG PHÍ ĐIỆN NĂNG và đưa ra TỐI ĐA 3 đề xuất tối ưu hóa.
Hãy tìm các điểm bất hợp lý như:
1. Đèn sáng quá cao ở thời điểm không có người (bright_no_person cao).
2. Thời gian chờ tắt đèn quá lâu (delay quá lớn).
3. Độ sáng hoạt động (bright_active) không cần thiết ở mức cao dựa trên thói quen hoặc độ sáng môi trường.
4. Phát hiện quên tắt đèn khi ở chế độ thủ công (is_manual = true).

=== YÊU CẦU ĐẦU RA ===
- Mỗi đề xuất phải:
  + Nêu rõ con số hiện tại và con số thay đổi đề xuất (vd: "giảm bright_no_person từ 50% xuống 20%").
  + Nêu lý do thuyết phục dựa vào dữ liệu hệ thống đo được.
  + Viết bằng tiếng Việt, thân thiện, dễ hiểu, tối đa 2 câu.
- Phân loại mức độ: "Thông tin" (gợi ý nhẹ), "Quan trọng" (tối ưu đáng kể), "Cảnh báo" (đang rất lãng phí).

Chỉ trả về JSON thuần túy (không markdown, không giải thích), theo định dạng:
{
  "de_xuat": [
    { "muc_do": "...", "thong_bao": "..." }
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
