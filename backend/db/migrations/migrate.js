// backend/db/migrate.js
const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigrations() {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'kyc_system',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',  // ⬅️ ใส่ default value!
  });

  try {
    console.log('🔄 Connecting to PostgreSQL...');
    console.log('Config:', {
      host: client.host,
      port: client.port,
      database: client.database,
      user: client.user,
      password: client.password ? '***' + client.password.slice(-3) : 'undefined'
    });
    
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // รันแค่ไฟล์แรกก่อน
    const migrations = ['001_initial_schema.sql'];
    
    for (const migrationFile of migrations) {
      console.log(`📦 Running ${migrationFile}...`);
      const filePath = path.join(__dirname, '..', 'migrations', migrationFile);
      
      try {
        const sql = await fs.readFile(filePath, 'utf8');
        console.log(`📄 File size: ${sql.length} characters`);
        
        // แยกคำสั่ง SQL
        const commands = sql
          .split(';')
          .map(cmd => cmd.trim())
          .filter(cmd => cmd.length > 0);
        
        console.log(`📊 Found ${commands.length} SQL commands`);
        
        // รันทีละคำสั่ง
        for (let i = 0; i < commands.length; i++) {
          const command = commands[i] + ';';
          
          // ข้ามคำสั่ง CREATE TRIGGER ถ้ามีปัญหา
          if (command.includes('CREATE TRIGGER') && i > 50) {
            console.log(`⏭️  Skipping trigger at command ${i + 1}`);
            continue;
          }
          
          try {
            await client.query(command);
            if (i % 10 === 0) {
              console.log(`   Progress: ${i + 1}/${commands.length}`);
            }
          } catch (cmdError) {
            console.log(`⚠️  Command ${i + 1} failed: ${cmdError.message}`);
            // ข้ามไป command ถัดไป
          }
        }
        
        console.log(`✅ ${migrationFile} completed`);
      } catch (fileError) {
        console.log(`❌ Error reading ${migrationFile}: ${fileError.message}`);
      }
    }

    console.log('🎉 Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    // แสดงวิธีแก้ไข
    console.log('\n🔧 Troubleshooting:');
    console.log('1. ตรวจสอบว่า PostgreSQL ทำงานอยู่: `pg_isready -h localhost -p 5432`');
    console.log('2. ลองเชื่อมต่อด้วย psql: `psql -h localhost -p 5432 -U postgres`');
    console.log('3. สร้าง database ก่อน: `CREATE DATABASE kyc_system;`');
    console.log('4. หรือใช้ mock data ใน server.js ชั่วคราว');
    
    process.exit(1);
  } finally {
    try {
      await client.end();
      console.log('🔌 Disconnected');
    } catch (e) {
      // ignore
    }
  }
}

runMigrations();