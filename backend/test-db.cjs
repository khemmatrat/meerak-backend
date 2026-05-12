const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:รหัสผ่านของเจ้านาย@localhost:5432/ชื่อDBของเจ้านาย'
});

async function checkSchema() {
    try {
        console.log("🔍 กำลังตรวจสอบฐานข้อมูล...");
        const res = await pool.query(`
            SELECT constraint_name, check_clause 
            FROM information_schema.check_constraints 
            WHERE constraint_name = 'platform_revenues_source_type_check'
        `);
        
        if (res.rows.length > 0) {
            console.log("✅ เจอ Constraint แล้ว!");
            console.log("📍 รายละเอียด:", res.rows[0].check_clause);
            
            if (res.rows[0].check_clause.includes('insurance_premium')) {
                console.log("🚀 สุดยอด! รองรับ 'insurance_premium' เรียบร้อยแล้วครับ");
            } else {
                console.log("⚠️ เตือน: เจอตารางแต่ยังไม่รองรับ 'insurance_premium' ครับ!");
            }
        } else {
            console.log("❌ ไม่เจอ Constraint นี้ในระบบครับ!");
        }
    } catch (err) {
        console.error("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ:", err.message);
    } finally {
        await pool.end();
    }
}

checkSchema();