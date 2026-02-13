import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'th' | 'zh' | 'ja' | 'fr' | 'ru';

export const translations = {
  en: {
    welcome_screen: { title: "Meerak", subtitle: "People2People Services", desc: "Connect with local experts, find lifestyle companions, and get things done.", start: "Get Started", login: "Log In" },
    nav: { home: "Home", jobs: "Jobs", talents: "Talents", post: "Post Job", profile: "Profile", logout: "Sign Out", find: "Find Jobs", my_jobs: "My Jobs", settings: "Settings", chat: "Chat" },
    auth: { welcome: "Welcome back", subtitle: "Sign in to your Meerak account", phone: "Phone Number", password: "Password", signin: "Sign In", signing: "Signing in...", no_account: "Don't have an account?", register: "Register", demo: "Demo Tip: Use any credentials.", name: "Full Name", create_account: "Create Account", i_want_to: "I want to...", role_user: "Hire a Pro", role_provider: "Work as a Pro", have_account: "Already have an account?", login: "Log In", banned: "Account Suspended. Please contact support." },
    home: { welcome: "Good Morning", welcome_gen: "Hello", wallet: "Wallet", active_jobs: "Active Jobs", quick_actions: "Quick Actions", find_service: "Find Service", find_talent: "Find Talent", popular_cat: "Popular Categories", promo: "Special Offer", promo_desc: "Get 10% off your first cleaning service!", view_all: "View All" },
    settings: { title: "Settings", account: "Account", password: "Change Password", language: "Language", notifications: "Notifications", help: "Help & Support", about: "About Us", delete: "Delete Account", save: "Save Changes", saved: "Settings Saved", current_ver: "Version 1.0.0", edit_profile: "Edit Profile", support_desc: "Send us a message", old_password: "Old Password", new_password: "New Password", confirm_password: "Confirm New Password", pass_updated: "Password Updated!", contact_support: "Contact Support", msg_placeholder: "How can we help you?", payment_methods: "Payment Methods", add_payment: "Add Payment Method", no_payment_methods: "No payment methods saved.", acc_name: "Account Name", acc_no: "Account Number", provider: "Provider/Bank", add_success: "Payment method added!" },
    jobs: { title: "Available Jobs", search: "Search for services...", no_jobs: "No jobs found", try_filter: "Try changing the category filter.", view_list: "List", view_map: "Map" },
    talents: { title: "Find Talents", subtitle: "Discover students, models, and companions for your lifestyle needs.", search: "Search by name, university, or tag...", hire: "Hire", age: "Age", height: "Height", uni: "University", no_results: "No talents found matching your criteria.", filter_all: "All", filter_female: "Female", filter_male: "Male", filter_lgbtq: "LGBTQ" },
    myjobs: { title: "My Jobs", hired: "Hired Jobs", working: "Working On", recommended: "Recommended", history: "History", posted_desc: "Active jobs you have posted.", working_desc: "Active jobs you are working on.", recommended_desc: "Jobs matching your skills and certifications.", history_desc: "Past jobs completed or cancelled.", no_posted: "No active posted jobs.", no_working: "No active jobs in progress.", no_recommended: "No jobs found matching your skills.", no_history: "No job history found." },
    create: { title: "Post a New Job", subtitle: "Describe what you need, and local providers will help you.", job_title: "Title", category: "Category", budget: "Budget (THB)", date: "Preferred Date & Time", desc: "Description", loc: "Location", loc_desc: "We'll use your current location to find nearby providers.", submit: "Post Job Now", submitting: "Posting...", success: "Job Posted Successfully!", direct_hire: "Direct Hire Request for", ai_match: "AI Smart Match", ai_desc: "Analyzing local providers...", ai_found: "Found {count} Top Providers nearby!", ai_dist: "{dist} km away" },
    detail: { 
        posted_by: "Posted by", 
        kyc: "KYC Verified", 
        time: "Time", 
        loc: "Location", 
        accept: "Accept Job", 
        accepted: "Job Accepted! Chat enabled.", 
        pay_btn: "Approve & Pay", 
        auto_pay: "Approve Work & Release Funds", 
        auto_pay_confirm: "Are you satisfied with the work? This will release {amount} THB to the provider.", 
        mark_done: "Submit Work for Approval", 
        waiting_payment: "Waiting for Payment", 
        waiting_approval: "Pending Employer Approval", 
        auto_approve_in: "Auto-approval in", 
        system_approved: "System auto-approved due to timeout.", 
        completed: "Job Completed", 
        chat: "Chat", 
        no_msg: "No messages yet. Start the conversation!", 
        type: "Type a message...", 
        thb: "THB", 
        unverified: "Unknown User", 
        action_success: "Action Successful", 
        cancel: "Cancel Job", 
        cancelled: "This job has been cancelled", 
        attach: "Attach Image", 
        confirm_cancel: "Are you sure you want to cancel this job?", 
        instant_pay_success: "Payment released to provider!", 
        submit_confirm: "Are you sure you want to submit this work? The employer will review it.", 
        req_proof: "Please upload a photo in chat as proof of work.", 
        expires_in: "Expires in", 
        cancelling_title: "Cancelling Job", 
        cancelling_desc: "This job will be permanently cancelled in", 
        keep_job: "Undo / Keep Job", 
        expired: "Job Expired", 
        report: "Report Problem", 
        reporting: "Reporting...", 
        dispute_submitted: "Dispute submitted. Admin will review.", 
        under_review: "Under Admin Review", 
        share: "Share Job", 
        share_via: "Share via", 
        link_copied: "Link copied!", 
        copy_link: "Copy Link",
        accepted_info: "Information Confirmed", 
        action_title: "Actions", 
        chat_with: "Chat with",
        owner_action_req: "Required Action for Owner",
        verify_work: "Verify the submitted work from the provider",
        click_approve: "Click the Approve and Pay button",
        must_view_proof: "Please view proof of work before approving",
        in_progress_actions: "Provider Tools",
        send_tip: "Send Tip"
    },
    action: {
        update_progress: "Update Progress",
        upload_proof: "Upload Proof",
        contact_owner_chat: "Contact Owner",
        view_instructions: "View Instructions",
        check_location: "Check Location",
        report_issue: "Report Issue"
    },
    review: { title: "How was your experience?", placeholder: "Please share your honest feedback to help others. Was the provider professional and polite?", submit: "Submit Review", success: "Thank you! Your review has been submitted.", skip: "Skip for now", tags_title: "Compliments", tag_polite: "Polite", tag_professional: "Professional", tag_safe: "Safe", tag_punctual: "Punctual", tag_service: "Excellent Service", hide: "Hide", unhide: "Show", hidden_msg: "Review hidden by user." },
    profile: { kyc_title: "Identity Verification (KYC)", id_front: "ID Card Front", clear_photo: "Upload a clear photo", selfie: "Selfie with ID", face_visible: "Ensure face is visible", submit_kyc: "Submit for Verification", bio: "No bio available.", contact: "Contact Info", wallet_title: "My Wallet", deposit: "Deposit", withdraw: "Withdraw", current_bal: "Current Balance", enter_amount: "Enter Amount", confirm: "Confirm", cancel: "Cancel", bank_info: "Bank Account Info", history: "Transaction History", no_trans: "No transactions yet", table_date: "Date", table_type: "Type", table_desc: "Description", table_status: "Status", table_amount: "Amount", tab_info: "Info", tab_reviews: "Reviews", tab_wallet: "Wallet", no_reviews: "No reviews yet.", level_title: "Provider Level", jobs_done: "Jobs Done", commission: "Fee", next_level: "Next Level", lv_bronze: "Bronze", lv_silver: "Silver", lv_gold: "Gold", lv_platinum: "Platinum", lv_paradise: "Paradise", lv_diamond: "Diamond Grand Paradise", skills: "Skills", certifications: "Certifications", add_skill: "Add Skill", add_cert: "Add Certificate", verified: "Verified", pending: "Pending", skill_placeholder: "e.g., Plumbing", cert_name: "Certificate Name", cert_issuer: "Issuer", kyc_submitted: "Verification Submitted", boost: "Boost Profile", boost_desc: "Get listed first for 24h", boost_price: "500 THB", boost_confirm: "Boost your profile for 500 THB?", boost_active: "Boost Active", boost_expires: "Expires in", tab_earnings: "Earnings", weekly_inc: "Weekly Income", monthly_inc: "Monthly Income", yearly_inc: "Yearly Income", earnings_chart: "Income Growth (6 Months)", earnings_desc: "Keep up the great work! Your skills are generating real value.", select_method: "Select Withdrawal Method" },
    cat: { 
        All: "All", 
        Cleaning: "Cleaning", AC_Cleaning: "AC Cleaning", Plumbing: "Plumbing", Electrician: "Electrician", Moving: "Moving", Gardening: "Gardening", Painting: "Painting", Pest_Control: "Pest Control", Appliance_Repair: "Appliance Repair", Interior_Design: "Interior Design",
        Dating: "Dating", Shopping_Buddy: "Shopping Buddy", Party_Guest: "Party Guest", Model: "Model", Consultant: "Consultant", Fortune_Telling: "Fortune Telling", Queue_Service: "Queue Service", Private_Chef: "Private Chef",
        Beauty: "Beauty/Makeup", Massage: "Massage/Spa", Physiotherapy: "Physiotherapy", Personal_Trainer: "Personal Trainer", Pet_Care: "Pet Care", Caregiving: "Caregiving",
        IT_Support: "IT Support", Web_Dev: "Web Dev", Graphic_Design: "Graphic Design", Photography: "Photography", Videography: "Videography", Translation: "Translation", Accounting: "Accounting", Legal: "Legal", 
        Driver: "Driver", Messenger: "Messenger/Delivery", Tutoring: "Tutoring", General: "General" 
    },
    payment: { title: "Payment", summary: "Order Summary", method: "Payment Method", credit_card: "Credit Card", promptpay: "PromptPay QR", wallet: "My Wallet", card_holder: "Card Holder Name", card_number: "Card Number", expiry: "Expiry Date", cvv: "CVV", pay_now: "Pay Now", processing: "Processing...", success_title: "Payment Successful!", success_desc: "Thank you. The job has been marked as completed.", back_home: "Back to Home", wallet_bal: "Balance", voucher: "Promo Code", voucher_placeholder: "Enter code", apply: "Apply", discount: "Discount" },
    notif: { title: "Notifications", empty: "No notifications yet.", mark_read: "Mark all as read", job_match: "Job Match" },
    safety: { title: "Safety Center", panic: "SOS / Panic Button", share_loc: "Share Live Location", contact_police: "Call Police (191)", contact_ambulance: "Call Ambulance (1669)", help_desc: "We are here to help. In an emergency, please contact local authorities immediately.", sending_sos: "Sending SOS Alert..." },
    bank: { kbank: "Kasikorn Bank", scb: "Siam Commercial Bank", bbl: "Bangkok Bank", ktb: "Krungthai Bank", ttb: "TMBThanachart Bank", bay: "Krungsri Bank", gsb: "Government Savings Bank", truemoney: "TrueMoney Wallet", stripe: "Stripe", omise: "Omise" }
  },
  th: {
    welcome_screen: { title: "Meerak", subtitle: "แพลตฟอร์มรวมงานและไลฟ์สไตล์", desc: "เชื่อมต่อกับผู้เชี่ยวชาญ หาเพื่อนเที่ยว และจัดการทุกเรื่องในชีวิตคุณ", start: "เริ่มต้นใช้งาน", login: "เข้าสู่ระบบ" },
    nav: { home: "หน้าหลัก", jobs: "งานทั่วไป", talents: "หาคนรู้ใจ", post: "ลงประกาศ", profile: "โปรไฟล์", logout: "ออกจากระบบ", find: "หางาน", my_jobs: "งานของฉัน", settings: "ตั้งค่า", chat: "แชท" },
    auth: { welcome: "ยินดีต้อนรับกลับมา", subtitle: "เข้าสู่ระบบบัญชี Meerak ของคุณ", phone: "เบอร์โทรศัพท์", password: "รหัสผ่าน", signin: "เข้าสู่ระบบ", signing: "กำลังเข้าสู่ระบบ...", no_account: "ยังไม่มีบัญชี?", register: "ลงทะเบียน", demo: "เคล็ดลับ: ใช้รหัสอะไรก็ได้", name: "ชื่อ-นามสกุล", create_account: "สร้างบัญชีใหม่", i_want_to: "ฉันต้องการ...", role_user: "จ้างผู้ช่วย", role_provider: "รับงานบริการ", have_account: "มีบัญชีอยู่แล้ว?", login: "เข้าสู่ระบบ", banned: "บัญชีถูกระงับ กรุณาติดต่อฝ่ายบริการลูกค้า" },
    home: { welcome: "สวัสดีตอนเช้า", welcome_gen: "สวัสดี", wallet: "กระเป๋าเงิน", active_jobs: "งานที่กำลังทำ", quick_actions: "เมนูลัด", find_service: "หาบริการ", find_talent: "หาคนรู้ใจ", popular_cat: "หมวดหมู่ยอดฮิต", promo: "โปรโมชั่นพิเศษ", promo_desc: "ลด 10% สำหรับบริการทำความสะอาดครั้งแรก!", view_all: "ดูทั้งหมด" },
    settings: { title: "การตั้งค่า", account: "บัญชีผู้ใช้", password: "เปลี่ยนรหัสผ่าน", language: "ภาษา", notifications: "การแจ้งเตือน", help: "ช่วยเหลือและสนับสนุน", about: "เกี่ยวกับเรา", delete: "ลบบัญชีผู้ใช้", save: "บันทึกการเปลี่ยนแปลง", saved: "บันทึกเรียบร้อย", current_ver: "เวอร์ชัน 1.0.0", edit_profile: "แก้ไขโปรไฟล์", support_desc: "ส่งข้อความหาเรา", old_password: "รหัสผ่านเดิม", new_password: "รหัสผ่านใหม่", confirm_password: "ยืนยันรหัสผ่าน", pass_updated: "เปลี่ยนรหัสผ่านสำเร็จ!", contact_support: "ติดต่อเจ้าหน้าที่", msg_placeholder: "ต้องการให้เราช่วยอะไร?", payment_methods: "ช่องทางรับเงิน", add_payment: "เพิ่มช่องทางรับเงิน", no_payment_methods: "ยังไม่มีช่องทางรับเงินที่บันทึกไว้", acc_name: "ชื่อบัญชี", acc_no: "เลขที่บัญชี/เบอร์โทร", provider: "ธนาคาร/ผู้ให้บริการ", add_success: "เพิ่มข้อมูลสำเร็จ!" },
    jobs: { title: "งานที่ว่าง", search: "ค้นหาบริการ...", no_jobs: "ไม่พบงาน", try_filter: "ลองเปลี่ยนหมวดหมู่", view_list: "รายการ", view_map: "แผนที่" },
    talents: { title: "รวมหนุ่มหล่อสาวสวย", subtitle: "ค้นหานักศึกษา นางแบบ หรือเพื่อนเที่ยว เพื่อนเดินห้าง", search: "ค้นหาชื่อ มหาวิทยาลัย หรือสไตล์...", hire: "จ้างคนนี้", age: "อายุ", height: "สูง", uni: "มหาลัย", no_results: "ไม่พบคนที่คุณค้นหา", filter_all: "ทั้งหมด", filter_female: "ผู้หญิง", filter_male: "ผู้ชาย", filter_lgbtq: "LGBTQ" },
    myjobs: { title: "งานของฉัน", hired: "งานที่ฉันจ้าง", working: "งานที่ฉันรับทำ", recommended: "งานแนะนำ", history: "ประวัติ", posted_desc: "งานที่คุณลงประกาศหาคนช่วย (ที่ยังไม่จบ)", working_desc: "งานที่คุณกำลังดำเนินการ", recommended_desc: "งานที่ตรงกับทักษะและความเชี่ยวชาญของคุณ", history_desc: "ประวัติงานที่เสร็จสิ้นหรือยกเลิกแล้ว", no_posted: "ไม่มีงานที่กำลังประกาศ", no_working: "ไม่มีงานที่กำลังทำ", no_recommended: "ไม่พบงานที่ตรงกับทักษะของคุณ", no_history: "ไม่พบประวัติงาน" },
    create: { title: "ลงประกาศงานใหม่", subtitle: "อธิบายสิ่งที่คุณต้องการ แล้วผู้ให้บริการในพื้นที่จะช่วยเหลือคุณ", job_title: "หัวข้อ", category: "หมวดหมู่", budget: "งบประมาณ (บาท)", date: "วันและเวลาที่สะดวก", desc: "รายละเอียด", loc: "สถานที่", loc_desc: "เราจะใช้ตำแหน่งปัจจุบันของคุณเพื่อค้นหาผู้ให้บริการใกล้เคียง", submit: "ลงประกาศงาน", submitting: "กำลังลงประกาศ...", success: "ลงประกาศงานสำเร็จ!", direct_hire: "ระบุจ้างงานคุณ", ai_match: "ระบบจับคู่ AI อัจฉริยะ", ai_desc: "กำลังวิเคราะห์และค้นหาผู้ให้บริการใกล้คุณ...", ai_found: "พบ {count} สุดยอดผู้ให้บริการใกล้คุณ!", ai_dist: "ห่าง {dist} กม." },
    detail: { 
        posted_by: "โพสต์โดย", 
        kyc: "ยืนยันตัวตนแล้ว", 
        time: "เวลา", 
        loc: "สถานที่", 
        accept: "รับงานนี้", 
        accepted: "รับงานแล้ว! เริ่มแชทได้เลย", 
        pay_btn: "อนุมัติและจ่ายเงิน", 
        auto_pay: "อนุมัติงานและโอนเงิน", 
        auto_pay_confirm: "คุณพอใจกับงานแล้วใช่หรือไม่? ระบบจะโอนเงิน {amount} บาท ให้ผู้รับงานทันที", 
        mark_done: "ส่งมอบงานเพื่อตรวจสอบ", 
        waiting_payment: "รอการตรวจสอบและจ่ายเงิน", 
        waiting_approval: "รอผู้จ้างอนุมัติงาน", 
        auto_approve_in: "อนุมัติอัตโนมัติใน", 
        system_approved: "ระบบอนุมัติอัตโนมัติเนื่องจากหมดเวลา", 
        completed: "งานเสร็จสมบูรณ์", 
        chat: "แชท", 
        no_msg: "ยังไม่มีข้อความ เริ่มบทสนทนาเลย!", 
        type: "พิมพ์ข้อความ...", 
        thb: "บาท", 
        unverified: "ผู้ใช้ไม่ระบุชื่อ", 
        action_success: "ทำรายการสำเร็จ", 
        cancel: "ยกเลิกงาน", 
        cancelled: "งานนี้ถูกยกเลิกแล้ว", 
        attach: "แนบรูปภาพ", 
        confirm_cancel: "คุณแน่ใจหรือไม่ว่าต้องการยกเลิกงานนี้?", 
        instant_pay_success: "โอนเงินให้ผู้รับงานเรียบร้อยแล้ว!", 
        submit_confirm: "ยืนยันการส่งมอบงาน? ผู้จ้างจะทำการตรวจสอบก่อนอนุมัติเงิน", 
        req_proof: "กรุณาแนบรูปภาพในแชทเพื่อยืนยันผลงาน", 
        expires_in: "หมดอายุใน", 
        cancelling_title: "กำลังยกเลิกงาน", 
        cancelling_desc: "งานนี้จะถูกลบถาวรใน", 
        keep_job: "ยกเลิก / เก็บงานไว้", 
        expired: "งานหมดอายุ", 
        report: "แจ้งปัญหา/ร้องเรียน", 
        reporting: "กำลังส่งข้อมูล...", 
        dispute_submitted: "ส่งเรื่องร้องเรียนแล้ว เจ้าหน้าที่จะเร่งตรวจสอบ", 
        under_review: "อยู่ระหว่างการตรวจสอบของแอดมิน", 
        share: "แชร์งาน", 
        share_via: "แชร์ผ่าน", 
        link_copied: "คัดลอกลิงก์แล้ว!", 
        copy_link: "คัดลอกลิงก์",
        accepted_info: "ข้อมูลได้รับการยืนยันแล้ว", 
        action_title: "ตัวเลือกการดำเนินการ", 
        chat_with: "สนทนากับ",
        owner_action_req: "การดำเนินการที่เจ้าของงานต้องทำ",
        verify_work: "1. ตรวจสอบผลงานที่ผู้ให้บริการส่งมา",
        click_approve: "2. คลิกปุ่มอนุมัติและชำระเงิน",
        must_view_proof: "โปรดดูหลักฐานการทำงานก่อนอนุมัติ",
        in_progress_actions: "เครื่องมือผู้รับงาน",
        send_tip: "ให้สินน้ำใจ (Send Tip)"
    },
    action: {
        update_progress: "อัปเดตความคืบหน้า",
        upload_proof: "อัปโหลดหลักฐาน",
        contact_owner_chat: "ติดต่อเจ้าของงาน",
        view_instructions: "ดูรายละเอียดงาน",
        check_location: "ตรวจสอบตำแหน่ง",
        report_issue: "แจ้งปัญหา"
    },
    review: { title: "ความพึงพอใจของคุณ", placeholder: "กรุณาแชร์ประสบการณ์การทำงาน เพื่อเป็นประโยชน์ต่อผู้อื่น ผู้ให้บริการสุภาพและเป็นมืออาชีพหรือไม่?", submit: "ส่งรีวิว", success: "ขอบคุณ! รีวิวของคุณถูกส่งแล้ว", skip: "ข้ามไปก่อน", tags_title: "คำชมพิเศษ", tag_polite: "สุภาพ", tag_professional: "มืออาชีพ", tag_safe: "ปลอดภัย", tag_punctual: "ตรงต่อเวลา", tag_service: "บริการดีเยี่ยม", hide: "ซ่อน", unhide: "แสดง", hidden_msg: "รีวิวถูกซ่อนโดยผู้ใช้" },
    profile: { kyc_title: "การยืนยันตัวตน (KYC)", id_front: "หน้าบัตรประชาชน", clear_photo: "อัปโหลดรูปที่ชัดเจน", selfie: "เซลฟี่คู่กับบัตร", face_visible: "เห็นใบหน้าชัดเจน", submit_kyc: "ส่งตรวจสอบ", bio: "ไม่มีข้อมูลแนะนำตัว", contact: "ข้อมูลติดต่อ", wallet_title: "กระเป๋าเงินของฉัน", deposit: "เติมเงิน", withdraw: "ถอนเงิน", current_bal: "ยอดเงินคงเหลือ", enter_amount: "ระบุจำนวนเงิน", confirm: "ยืนยัน", cancel: "ยกเลิก", bank_info: "ข้อมูลบัญชีธนาคาร", history: "ประวัติธุรกรรม", no_trans: "ยังไม่มีรายการ", table_date: "วันที่", table_type: "ประเภท", table_desc: "รายละเอียด", table_status: "สถานะ", table_amount: "จำนวนเงิน", tab_info: "ข้อมูล", tab_reviews: "รีวิว", tab_wallet: "กระเป๋าเงิน", no_reviews: "ยังไม่มีรีวิว", level_title: "ระดับผู้ให้บริการ", jobs_done: "งานที่สำเร็จ", commission: "ค่าธรรมเนียม", next_level: "ระดับถัดไป", lv_bronze: "บรอนซ์", lv_silver: "ซิลเวอร์", lv_gold: "โกลด์", lv_platinum: "แพลตตินั่ม", lv_paradise: "พาราไดซ์", lv_diamond: "ไดมอนด์ แกรนด์ พาราไดซ์", skills: "ทักษะความสามารถ", certifications: "ใบรับรอง", add_skill: "เพิ่มทักษะ", add_cert: "เพิ่มใบรับรอง", verified: "ตรวจสอบแล้ว", pending: "รอตรวจสอบ", skill_placeholder: "เช่น ช่างไฟ, ขับรถ", cert_name: "ชื่อใบรับรอง", cert_issuer: "ออกโดย", kyc_submitted: "ส่งเอกสารแล้ว รออนุมัติ", boost: "บูสต์โปรไฟล์", boost_desc: "ติดอันดับแรกทันที 24 ชม.", boost_price: "500 บาท", boost_confirm: "ยืนยันการบูสต์โปรไฟล์ในราคา 500 บาท?", boost_active: "บูสต์ทำงานอยู่", boost_expires: "หมดอายุใน", tab_earnings: "รายได้", weekly_inc: "รายได้สัปดาห์นี้", monthly_inc: "รายได้เดือนนี้", yearly_inc: "รายได้ปีนี้", earnings_chart: "กราฟรายได้ (6 เดือนล่าสุด)", earnings_desc: "ทำยอดเยี่ยมมาก! ความสามารถของคุณสร้างรายได้ที่มั่นคง", select_method: "เลือกช่องทางรับเงิน" },
    cat: { 
        All: "ทั้งหมด", 
        Cleaning: "ทำความสะอาด", AC_Cleaning: "ล้างแอร์", Plumbing: "ประปา", Electrician: "ไฟฟ้า", Moving: "ขนย้าย", Gardening: "สวน", Painting: "ทาสี/รีโนเวท", Pest_Control: "กำจัดปลวก", Appliance_Repair: "ซ่อมเครื่องใช้ไฟฟ้า", Interior_Design: "ออกแบบภายใน",
        Dating: "นัดเดท/กินข้าว", Shopping_Buddy: "เพื่อนเดินห้าง", Party_Guest: "เพื่อนเที่ยว/ปาร์ตี้", Model: "นางแบบ/ถ่ายรูป", Consultant: "ที่ปรึกษา/เพื่อนคุย", Fortune_Telling: "ดูดวง", Queue_Service: "รับจ้างต่อคิว", Private_Chef: "เชฟส่วนตัว/ทำอาหาร",
        Beauty: "เสริมสวย/แต่งหน้า", Massage: "นวด/สปา", Physiotherapy: "กายภาพบำบัด", Personal_Trainer: "เทรนเนอร์ส่วนตัว", Pet_Care: "ดูแลสัตว์เลี้ยง", Caregiving: "ดูแลผู้สูงอายุ",
        IT_Support: "ไอที/ซ่อมคอม", Web_Dev: "ทำเว็บไซต์/โปรแกรม", Graphic_Design: "กราฟิกดีไซน์", Photography: "ช่างภาพ", Videography: "ตัดต่อวิดีโอ", Translation: "แปลภาษา", Accounting: "บัญชี/ภาษี", Legal: "กฎหมาย/ทนาย",
        Driver: "คนขับรถ", Messenger: "แมสเซนเจอร์/ส่งของ", Tutoring: "สอนพิเศษ", General: "ทั่วไป" 
    },
    payment: { title: "ชำระเงิน", summary: "สรุปรายการ", method: "วิธีการชำระเงิน", credit_card: "บัตรเครดิต", promptpay: "พร้อมเพย์ QR", wallet: "กระเป๋าเงิน", card_holder: "ชื่อเจ้าของบัตร", card_number: "หมายเลขบัตร", expiry: "วันหมดอายุ", cvv: "CVV", pay_now: "ชำระเงินทันที", processing: "กำลังดำเนินการ...", success_title: "ชำระเงินสำเร็จ!", success_desc: "ขอบคุณ งานนี้ถูกระบุว่าเสร็จสมบูรณ์แล้ว", back_home: "กลับหน้าหลัก", wallet_bal: "ยอดเงินคงเหลือ", voucher: "คูปองส่วนลด", voucher_placeholder: "ใส่โค้ด", apply: "ใช้โค้ด", discount: "ส่วนลด" },
    notif: { title: "การแจ้งเตือน", empty: "ไม่มีการแจ้งเตือน", mark_read: "อ่านทั้งหมด", job_match: "งานตรงสาย" },
    safety: { title: "ศูนย์ความปลอดภัย", panic: "SOS / ขอความช่วยเหลือ", share_loc: "แชร์ตำแหน่งปัจจุบัน", contact_police: "แจ้งเหตุด่วน (191)", contact_ambulance: "เรียกรถพยาบาล (1669)", help_desc: "เราพร้อมช่วยเหลือคุณ หากเกิดเหตุฉุกเฉิน โปรดติดต่อเจ้าหน้าที่ทันที", sending_sos: "กำลังส่งสัญญาณ SOS..." },
    bank: { kbank: "ธนาคารกสิกรไทย", scb: "ธนาคารไทยพาณิชย์", bbl: "ธนาคารกรุงเทพ", ktb: "ธนาคารกรุงไทย", ttb: "ธนาคารทหารไทยธนชาต", bay: "ธนาคารกรุงศรีอยุธยา", gsb: "ธนาคารออมสิน", truemoney: "ทรูมันนี่ วอลเล็ท", stripe: "Stripe", omise: "Omise" }
  },
  zh: {
    // Simplified for brevity
    welcome_screen: { title: "Meerak", subtitle: "生活服务平台", desc: "连接本地专家，寻找生活伴侣，轻松搞定一切。", start: "开始使用", login: "登录" },
    nav: { home: "首页", jobs: "工作", talents: "达人", post: "发布工作", profile: "个人资料", logout: "退出", find: "找工作", my_jobs: "我的工作", settings: "设置", chat: "聊天" },
    notif: { title: "通知", empty: "暂无通知", mark_read: "全部已读", job_match: "职位匹配" },
    safety: { title: "安全中心", panic: "SOS / 紧急求助", share_loc: "分享位置", contact_police: "报警 (191)", contact_ambulance: "救护车 (1669)", help_desc: "遇到紧急情况请立即联系当局", sending_sos: "正在发送 SOS..." },
    payment: { title: "支付", summary: "订单摘要", method: "支付方式", credit_card: "信用卡", promptpay: "PromptPay QR", wallet: "钱包", card_holder: "持卡人", card_number: "卡号", expiry: "有效期", cvv: "CVV", pay_now: "立即支付", processing: "处理中...", success_title: "支付成功!", success_desc: "工作已标记为完成", back_home: "返回首页", wallet_bal: "余额", voucher: "优惠券", voucher_placeholder: "输入代码", apply: "应用", discount: "折扣" },
    detail: { req_proof: "请上传照片作为工作证明", report: "报告问题", share: "分享工作", share_via: "分享方式", link_copied: "链接已复制", copy_link: "复制链接" },
    review: { title: "评价您的体验", placeholder: "请分享您的诚实反馈。服务人员是否专业有礼？", submit: "提交评价", success: "谢谢！您的评价已提交。", skip: "跳过" },
    myjobs: { history: "历史记录", history_desc: "查看已完成和过去的工作" },
    profile: { tab_earnings: "收入", weekly_inc: "本周收入", monthly_inc: "本月收入", yearly_inc: "年度收入", earnings_chart: "收入增长 (近6个月)", earnings_desc: "保持好工作！您的技能正在创造真正的价值。" },
    settings: { edit_profile: "编辑个人资料", support_desc: "发消息给我们", old_password: "旧密码", new_password: "新密码", confirm_password: "确认新密码", pass_updated: "密码已更新！", contact_support: "联系支持", msg_placeholder: "我们能为您做什么？", save: "保存更改", payment_methods: "收款方式", add_payment: "添加收款方式" },
    bank: { kbank: "开泰银行 (KBANK)", scb: "汇商银行 (SCB)", bbl: "盘谷银行 (BBL)", ktb: "泰京银行 (KTB)", ttb: "军人银行 (TTB)", bay: "大城银行 (BAY)", gsb: "政府储蓄银行", truemoney: "TrueMoney 钱包", stripe: "Stripe", omise: "Omise" }
  },
  ja: {
    welcome_screen: { title: "Meerak", subtitle: "生活サービス", desc: "専門家やパートナーを見つけ、生活を便利に。", start: "始める", login: "ログイン" },
    nav: { home: "ホーム", jobs: "仕事", talents: "タレント", post: "投稿", profile: "プロフィール", logout: "ログアウト", find: "仕事を探す", my_jobs: "マイジョブ", settings: "設定", chat: "チャット" },
    notif: { title: "通知", empty: "通知はありません", mark_read: "すべて既読にする", job_match: "ジョブマッチ" },
    safety: { title: "安全センター", panic: "SOS / 緊急ボタン", share_loc: "位置情報を共有", contact_police: "警察 (191)", contact_ambulance: "救急車 (1669)", help_desc: "緊急の場合は直ちに当局に連絡してください", sending_sos: "SOS送信中..." },
    payment: { title: "支払い", summary: "注文概要", method: "支払い方法", credit_card: "クレジットカード", promptpay: "PromptPay QR", wallet: "ウォレット", card_holder: "名義人", card_number: "カード番号", expiry: "有効期限", cvv: "CVV", pay_now: "今すぐ支払う", processing: "処理中...", success_title: "支払い成功!", success_desc: "ジョブが完了としてマークされました", back_home: "ホームに戻る", wallet_bal: "残高", voucher: "クーポン", voucher_placeholder: "コードを入力", apply: "適用", discount: "割引" },
    detail: { req_proof: "仕事の証明として写真をアップロードしてください", report: "問題を報告", share: "シェア", share_via: "シェア", link_copied: "リンクをコピーしました", copy_link: "リンクをコピー" },
    review: { title: "体験を評価してください", placeholder: "正直な感想をお聞かせください。プロフェッショナルで丁寧でしたか？", submit: "レビューを送信", success: "ありがとうございます！レビューが送信されました。", skip: "スキップ" },
    myjobs: { history: "履歴", history_desc: "完了した過去の仕事を表示" },
    profile: { tab_earnings: "収益", weekly_inc: "週間収益", monthly_inc: "月間収益", yearly_inc: "年間収益", earnings_chart: "収益成長 (過去6ヶ月)", earnings_desc: "素晴らしい仕事です！あなたのスキルは価値を生み出しています。" },
    settings: { edit_profile: "プロフィール編集", support_desc: "メッセージを送る", old_password: "現在のパスワード", new_password: "新しいパスワード", confirm_password: "パスワード確認", pass_updated: "パスワードを更新しました！", contact_support: "サポートに連絡", msg_placeholder: "どのような用件ですか？", save: "変更を保存", payment_methods: "受取口座", add_payment: "口座を追加" },
    bank: { kbank: "カシコン銀行 (KBANK)", scb: "サイアム商業銀行 (SCB)", bbl: "バンコク銀行 (BBL)", ktb: "クルンタイ銀行 (KTB)", ttb: "TMBタナチャート銀行", bay: "アユタヤ銀行 (BAY)", gsb: "政府貯蓄銀行", truemoney: "TrueMoney Wallet", stripe: "Stripe", omise: "Omise" }
  },
  fr: {
      nav: { home: "Accueil", jobs: "Emplois", talents: "Talents", post: "Publier", profile: "Profil", logout: "Déconnexion", find: "Trouver", my_jobs: "Mes Emplois", settings: "Paramètres", chat: "Chat" },
      notif: { title: "Notifications", empty: "Pas de notifications.", mark_read: "Tout marquer comme lu", job_match: "Emploi correspondant" },
      safety: { title: "Centre de sécurité", panic: "SOS / Urgence", share_loc: "Partager la position", contact_police: "Police (191)", contact_ambulance: "Ambulance (1669)", help_desc: "Contactez immédiatement les autorités en cas d'urgence.", sending_sos: "Envoi SOS..." },
      payment: { title: "Paiement", summary: "Résumé", method: "Méthode", credit_card: "Carte de crédit", promptpay: "PromptPay QR", wallet: "Portefeuille", card_holder: "Nom", card_number: "Numéro", expiry: "Expiration", cvv: "CVV", pay_now: "Payer", processing: "Traitement...", success_title: "Paiement réussi!", success_desc: "Travail terminé.", back_home: "Accueil", wallet_bal: "Solde", voucher: "Code Promo", voucher_placeholder: "Entrer le code", apply: "Appliquer", discount: "Remise" },
      detail: { req_proof: "Veuillez télécharger une photo comme preuve de travail.", report: "Signaler un problème", share: "Partager", share_via: "Partager via", link_copied: "Lien copié !", copy_link: "Copier" },
      review: { title: "Comment s'est passée votre expérience ?", placeholder: "Veuillez partager vos commentaires. Le prestataire était-il professionnel ?", submit: "Soumettre", success: "Merci !", skip: "Passer" },
      myjobs: { history: "Historique", history_desc: "Voir les emplois passés." },
      profile: { tab_earnings: "Gains", weekly_inc: "Revenu hebdo", monthly_inc: "Revenu mensuel", yearly_inc: "Revenu annuel", earnings_chart: "Croissance des revenus", earnings_desc: "Continuez comme ça !" },
      settings: { edit_profile: "Modifier le profil", support_desc: "Envoyer un message", old_password: "Ancien mot de passe", new_password: "Nouveau mot de passe", confirm_password: "Confirmer le mot de passe", pass_updated: "Mot de passe mis à jour !", contact_support: "Contact Support", msg_placeholder: "Comment pouvons-nous vous aider ?", save: "Sauvegarder" },
      bank: { kbank: "Kasikorn Bank", scb: "Siam Commercial Bank", bbl: "Bangkok Bank", ktb: "Krungthai Bank", ttb: "TMBThanachart Bank", bay: "Krungsri Bank", gsb: "Government Savings Bank", truemoney: "TrueMoney Wallet", stripe: "Stripe", omise: "Omise" }
  },
  ru: {
      nav: { home: "Главная", jobs: "Работа", talents: "Таланты", post: "Создать", profile: "Профиль", logout: "Выйти", find: "Найти", my_jobs: "Мои заказы", settings: "Настройки", chat: "Чат" },
      notif: { title: "Уведомления", empty: "Нет уведомлений", mark_read: "Пометить все как прочитанные", job_match: "Подходящая работа" },
      safety: { title: "Центр безопасности", panic: "SOS / Паника", share_loc: "Поделиться локацией", contact_police: "Полиция (191)", contact_ambulance: "Скорая (1669)", help_desc: "В экстренных случаях немедленно свяжитесь с властями.", sending_sos: "Отправка SOS..." },
      payment: { title: "Оплата", summary: "Итог", method: "Метод", credit_card: "Кредитная карта", promptpay: "PromptPay QR", wallet: "Кошелек", card_holder: "Владелец", card_number: "Номер", expiry: "Срок", cvv: "CVV", pay_now: "Оплатить", processing: "Обработка...", success_title: "Успешно!", success_desc: "Работа завершена.", back_home: "Домой", wallet_bal: "Баланс", voucher: "Промокод", voucher_placeholder: "Введите код", apply: "Применить", discount: "Скидка" },
      detail: { req_proof: "Пожалуйста, загрузите фото в чат как доказательство работы.", report: "Сообщить о проблеме", share: "Поделиться", share_via: "Поделиться через", link_copied: "Ссылка скопирована!", copy_link: "Копировать" },
      review: { title: "Как все прошло?", placeholder: "Поделитесь мнением. Был ли исполнитель вежлив?", submit: "Отправить", success: "Спасибо!", skip: "Пропустить" },
      myjobs: { history: "История", history_desc: "Прошлые заказы." },
      profile: { tab_earnings: "Доход", weekly_inc: "За неделю", monthly_inc: "За месяц", yearly_inc: "За год", earnings_chart: "Рост дохода", earnings_desc: "Так держать!" },
      settings: { edit_profile: "Редактировать профиль", support_desc: "Отправить сообщение", old_password: "Старый пароль", new_password: "Новый пароль", confirm_password: "Подтвердить пароль", pass_updated: "Пароль обновлен!", contact_support: "Поддержка", msg_placeholder: "Чем мы можем помочь?", save: "Сохранить" },
      bank: { kbank: "Kasikorn Bank", scb: "Siam Commercial Bank", bbl: "Bangkok Bank", ktb: "Krungthai Bank", ttb: "TMBThanachart Bank", bay: "Krungsri Bank", gsb: "Government Savings Bank", truemoney: "TrueMoney Wallet", stripe: "Stripe", omise: "Omise" }
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children?: ReactNode }) => {
  const [language, setLanguage] = useState<Language>('en');

  const t = (path: string) => {
    const keys = path.split('.');
    
    // Helper to traverse object
    const getVal = (obj: any, keys: string[]) => {
        let current = obj;
        for (const key of keys) {
            if (current === undefined || current === null) return undefined;
            current = current[key];
        }
        return current;
    };

    let value = getVal(translations[language], keys);
    
    // Fallback to English if translation is missing
    if (value === undefined) {
        value = getVal(translations['en'], keys);
    }
    
    // Return path if both fail
    return (typeof value === 'string' ? value : path);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};