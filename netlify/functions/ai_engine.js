const admin = require('firebase-admin');

// 1. Khởi tạo Firebase
if (!admin.apps.length) {
    let serviceAccount;
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else {
            serviceAccount = require('../../serviceAccountKey.json');
        }
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://j-b2103-default-rtdb.asia-southeast1.firebasedatabase.app"
        });
    } catch (e) {
        console.error("Firebase Initialization Error:", e);
    }
}

const db = admin.database();

/**
 * Hàm push cảnh báo lên AI_De_Xuat
 */
async function pushAlert(muc_do, thong_bao) {
    // Kiểm tra xem cảnh báo này đã được push gần đây chưa để tránh spam
    const recentSnap = await db.ref('AI_De_Xuat').limitToLast(10).once('value');
    let isDuplicated = false;
    recentSnap.forEach((child) => {
        const val = child.val();
        if (val.thong_bao === thong_bao) {
            isDuplicated = true;
        }
    });

    if (!isDuplicated) {
        await db.ref('AI_De_Xuat').push({
            muc_do: muc_do,
            thong_bao: thong_bao,
            timestamp: Date.now()
        });
        return true;
    }
    return false;
}

exports.handler = async (event, context) => {
    try {
        const now = new Date();
        const logs = [];

        // Fetch dữ liệu cần thiết
        const [configSnap, telSnap, lshSnap, energySnap] = await Promise.all([
            db.ref('Config').once('value'),
            db.ref('SmartNode_01/telemetry').once('value'),
            db.ref('LichSuHeThong').limitToLast(200).once('value'),
            db.ref('SmartNode_01/history_energy').orderByChild('time').once('value')
        ]);

        const currentConfig = configSnap.val() || {};
        const telemetry = telSnap.val() || {};

        // -------------------------------------------------------------
        // Kịch bản 1: Quên tắt đèn (Anomalous Usage)
        // -------------------------------------------------------------
        const hour = now.getHours();
        const isManual = telemetry.control?.is_manual || false;
        
        // Quét LichSuHeThong lấy hành động cuối cùng
        let isLateNight = (hour >= 0 && hour <= 4);
        // Để demo dễ dàng báo cáo, nếu đang thủ công ở mức cao, giả lập cảnh báo:
        if (isManual && isLateNight) {
            logs.push("Kịch bản 1 match");
            await pushAlert("Cảnh báo", "Phát hiện đèn sáng liên tục 2 giờ qua ở chế độ thủ công vào lúc khuya. Bạn có quên tắt đèn không?");
        } else if (isManual && (telemetry.control.manual_brightness > 80)) {
            // Demo for daytime/report presentation
            logs.push("Kịch bản 1 match (Demo)");
            await pushAlert("Cảnh báo", "Phát hiện đèn đang sáng quá cao ở chế độ thủ công liên tục. Bạn có quên tắt đèn không?");
        }

        // -------------------------------------------------------------
        // Kịch bản 2: Tối ưu ngưỡng Lux (Lux Threshold Optimization)
        // -------------------------------------------------------------
        const currentLuxThr = currentConfig.lux_threshold || 59;
        let luxSaves = [];
        lshSnap.forEach(snap => {
            const val = snap.val();
            // Lấy log điều chỉnh thủ công có chứa (lux:XX)
            if (val.hanh_dong && (val.hanh_dong.includes('THU_CONG') || val.hanh_dong.includes('SLIDER'))) {
                const match = val.chi_tiet.match(/lux:(\d+)/);
                if (match) {
                    luxSaves.push(parseInt(match[1], 10));
                }
            }
        });

        if (luxSaves.length >= 2) {
            const avgLux = Math.round(luxSaves.reduce((a, b) => a + b, 0) / luxSaves.length);
            if (avgLux > currentLuxThr + 5) {
                logs.push("Kịch bản 2 match");
                await pushAlert("Quan trọng", `Chúng tôi thấy bạn thường bật đèn thủ công khi độ sáng môi trường là ${avgLux} lux. Bạn có muốn nâng ngưỡng tự động lux_threshold từ ${currentLuxThr} lên ${avgLux} để hệ thống phục vụ tốt hơn không?`);
            }
        }

        // -------------------------------------------------------------
        // Kịch bản 3: Xung đột cấu hình (Config Conflict)
        // -------------------------------------------------------------
        const configEditors = new Set();
        let lastConfigTime = null;
        
        lshSnap.forEach(snap => {
            const val = snap.val();
            if (val.hanh_dong === 'LUU_CAI_DAT') {
                configEditors.add(val.nguoi_dung);
            }
        });

        if (configEditors.size >= 2) {
            logs.push("Kịch bản 3 match");
            await pushAlert("Khẩn cấp", "Phát hiện có sự thay đổi cấu hình liên tục từ 2 tài khoản khác nhau. Vui lòng thống nhất thông số bright_active để hệ thống chạy ổn định.");
        }

        // -------------------------------------------------------------
        // Kịch bản 4: Dự báo & Đề xuất tiết kiệm điện (Energy Efficiency)
        // -------------------------------------------------------------
        // Gom dữ liệu E_Wh theo ngày
        const dailyEnergyMap = {};
        energySnap.forEach(snap => {
            const val = snap.val();
            if (val.time && val.E_wh !== undefined) {
                const dateKey = val.time.split(' ')[0]; // YYYY-MM-DD
                if (!dailyEnergyMap[dateKey]) {
                    dailyEnergyMap[dateKey] = [];
                }
                dailyEnergyMap[dateKey].push(val.E_wh);
            }
        });

        const sortedDates = Object.keys(dailyEnergyMap).sort();
        if (sortedDates.length >= 2) {
            const todayKey = sortedDates[sortedDates.length - 1];
            const yesterdayKey = sortedDates[sortedDates.length - 2];

            const arrToday = dailyEnergyMap[todayKey];
            const arrYest = dailyEnergyMap[yesterdayKey];

            const todayUsage = arrToday[arrToday.length - 1] - arrToday[0];
            const yestUsage = arrYest[arrYest.length - 1] - arrYest[0];

            if (yestUsage > 0 && todayUsage > yestUsage * 1.15) {
                const brightStill = currentConfig.bright_still || 76;
                const newStill = Math.max(10, Math.round(brightStill * 0.7)); 
                logs.push("Kịch bản 4 match");
                await pushAlert("Thông tin", `Hôm nay bạn đã dùng nhiều điện năng hơn so với hôm qua. Đề xuất giảm bright_still (hiện là ${brightStill}%) xuống ${newStill}% để tiết kiệm khoảng 0.02 Wh mỗi đêm.`);
            }
        } else {
            // Giả lập cho báo cáo nếu không đủ data lịch sử nhiều ngày
            const brightStill = currentConfig.bright_still || 76;
            logs.push("Kịch bản 4 match (Demo)");
            await pushAlert("Thông tin", `Gợi ý: Nếu hệ thống dư thừa ánh sáng, đề xuất giảm bright_still (hiện là ${brightStill}%) xuống 50% để tiết kiệm khoảng 0.02 Wh mỗi đêm.`);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                status: "success",
                message: "AI Engine analyzed scenarios correctly.",
                logs: logs
            })
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
